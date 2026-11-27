/**
 * AURORA GROUP — CORE SECURITY UTILITIES
 * Hardened cryptographic helpers, input sanitization, NoSQL injection defenses,
 * session signature verification, and secure file validation.
 */

import crypto from 'crypto';
import bcrypt from 'bcryptjs';

const BCRYPT_ROUNDS = 12;

// Resolve Session Secret from environment or generate a stable fallback
const SESSION_SECRET = process.env.SESSION_SECRET || process.env.JWT_SECRET || 'aurora_secure_production_secret_key_8f3d9a1c2e4b';

/**
 * Securely hashes a plain text password using bcrypt with 12 salt rounds.
 */
export function hashPassword(plainPassword) {
  if (!plainPassword || typeof plainPassword !== 'string') {
    throw new Error('Password must be a non-empty string');
  }
  return bcrypt.hashSync(plainPassword, BCRYPT_ROUNDS);
}

/**
 * Verifies a plain text password against a bcrypt hash.
 * Also handles legacy plain-text fallback during initial migration and indicates rehash needed.
 */
export function verifyPassword(plainPassword, hashedPassword) {
  if (!plainPassword || !hashedPassword) return false;
  
  // Bcrypt hashes start with $2a$, $2b$, or $2y$
  if (hashedPassword.startsWith('$2a$') || hashedPassword.startsWith('$2b$') || hashedPassword.startsWith('$2y$')) {
    try {
      return bcrypt.compareSync(plainPassword, hashedPassword);
    } catch {
      return false;
    }
  }

  // Safe constant-time string comparison for legacy seed passwords during migration
  const a = Buffer.from(plainPassword);
  const b = Buffer.from(hashedPassword);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * Checks if a stored password string is a modern bcrypt hash.
 */
export function isPasswordHashed(password) {
  if (!password || typeof password !== 'string') return false;
  return password.startsWith('$2a$') || password.startsWith('$2b$') || password.startsWith('$2y$');
}

/**
 * Signs an authenticated session payload into a tamper-proof session token.
 * Payload structure: { uid, email, role, name, iat, exp }
 */
export function signSession(payload, expiresInMs = 24 * 60 * 60 * 1000) {
  const iat = Date.now();
  const exp = iat + expiresInMs;
  const data = JSON.stringify({ ...payload, iat, exp });
  const base64Data = Buffer.from(data, 'utf8').toString('base64url');
  
  const signature = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(base64Data)
    .digest('base64url');

  return `${base64Data}.${signature}`;
}

/**
 * Verifies and decodes a signed session token. Returns payload or null if invalid/expired.
 */
export function verifySession(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;

  const [base64Data, signature] = parts;

  // Verify HMAC signature in constant time
  const expectedSignature = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(base64Data)
    .digest('base64url');

  const sigBuffer = Buffer.from(signature);
  const expBuffer = Buffer.from(expectedSignature);

  if (sigBuffer.length !== expBuffer.length || !crypto.timingSafeEqual(sigBuffer, expBuffer)) {
    return null;
  }

  try {
    const jsonStr = Buffer.from(base64Data, 'base64url').toString('utf8');
    const payload = JSON.parse(jsonStr);

    // Verify expiration
    if (payload.exp && Date.now() > payload.exp) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

/**
 * NoSQL Injection Defense: Recursively strips keys starting with '$' or containing '.'
 * to prevent MongoDB operator injection (e.g., $gt, $ne, $where).
 */
export function sanitizeNoSql(target) {
  if (!target || typeof target !== 'object') {
    return target;
  }

  if (Array.isArray(target)) {
    return target.map(sanitizeNoSql);
  }

  const clean = {};
  for (const [key, value] of Object.entries(target)) {
    if (key.startsWith('$') || key.includes('.')) {
      continue; // Drop dangerous operator keys
    }
    if (value && typeof value === 'object') {
      clean[key] = sanitizeNoSql(value);
    } else {
      clean[key] = value;
    }
  }
  return clean;
}

/**
 * XSS & HTML Input Sanitization: Strips dangerous HTML tags and script elements.
 */
export function sanitizeString(val) {
  if (typeof val !== 'string') return val;
  return val
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .replace(/on\w+\s*=\s*(["'])?[^"'>]+(\1)?/gi, '')
    .replace(/javascript:/gi, '')
    .trim();
}

/**
 * Validates base64 file upload against MIME types, sizes, and magic bytes.
 */
export function validateImageUpload(dataUrl, filename, maxBytes = 5 * 1024 * 1024) {
  if (!dataUrl || typeof dataUrl !== 'string') {
    return { valid: false, error: 'Image data URL is required' };
  }

  const match = dataUrl.match(/^data:image\/(jpeg|jpg|png|webp|avif);base64,(.+)$/i);
  if (!match) {
    return { valid: false, error: 'Invalid image format. Allowed formats: JPEG, PNG, WebP, AVIF.' };
  }

  const format = match[1].toLowerCase().replace('jpg', 'jpeg');
  const base64Data = match[2];
  const buffer = Buffer.from(base64Data, 'base64');

  if (buffer.length > maxBytes) {
    return { valid: false, error: `Image exceeds maximum allowed size of ${Math.round(maxBytes / (1024 * 1024))}MB.` };
  }

  // Magic bytes verification
  // JPEG: FF D8 FF
  // PNG: 89 50 4E 47
  // WebP: 52 49 46 46 (RIFF) ... 57 45 42 50 (WEBP)
  let magicValid = false;
  if (format === 'jpeg' && buffer.length >= 3 && buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
    magicValid = true;
  } else if (format === 'png' && buffer.length >= 4 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
    magicValid = true;
  } else if (format === 'webp' && buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
    magicValid = true;
  } else if (format === 'avif' && buffer.length >= 12 && buffer.toString('ascii', 4, 8) === 'ftyp') {
    magicValid = true;
  }

  if (!magicValid) {
    return { valid: false, error: 'Corrupt or mismatched image signature (magic byte check failed).' };
  }

  // Generate collision-resistant sanitized filename
  const ext = format === 'jpeg' ? 'jpg' : format;
  const safeBase = (filename || 'image').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 32);
  const randomSuffix = crypto.randomBytes(6).toString('hex');
  const safeFilename = `${safeBase}_${Date.now()}_${randomSuffix}.${ext}`;

  return {
    valid: true,
    buffer,
    format,
    safeFilename
  };
}

/**
 * Validates an incoming webhook HMAC signature.
 */
export function verifyWebhookSignature(payload, signatureHeader, secret) {
  if (!payload || !signatureHeader || !secret) return false;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(typeof payload === 'string' ? payload : JSON.stringify(payload))
    .digest('hex');

  const sigBuffer = Buffer.from(signatureHeader);
  const expBuffer = Buffer.from(expected);
  if (sigBuffer.length !== expBuffer.length) return false;
  return crypto.timingSafeEqual(sigBuffer, expBuffer);
}

