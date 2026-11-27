/**
 * AURORA GROUP — LOG HYGIENE & PII REDACTION UTILITY
 * Redacts tokens, passwords, full emails, phone numbers, and secrets from all logs.
 */

export function redactSensitiveData(data) {
  if (data === null || data === undefined) return data;

  if (typeof data === 'string') {
    let result = data;

    // Redact Bearer / JWT / Session tokens
    result = result.replace(/bearer\s+[a-zA-Z0-9_\-\.]+/gi, 'Bearer [REDACTED_TOKEN]');
    result = result.replace(/aurora_session=[^;]+/gi, 'aurora_session=[REDACTED]');
    result = result.replace(/aurora_token_[a-zA-Z0-9=+/]+/gi, 'aurora_token_[REDACTED]');

    // Redact password fields in JSON or strings
    result = result.replace(/"password"\s*:\s*"[^"]*"/gi, '"password":"[REDACTED]"');
    result = result.replace(/"private_key"\s*:\s*"[^"]*"/gi, '"private_key":"[REDACTED_KEY]"');
    result = result.replace(/"apiKey"\s*:\s*"[^"]*"/gi, '"apiKey":"[REDACTED_KEY]"');

    // Mask emails (e.g. user@example.com -> u***@example.com)
    result = result.replace(/\b([a-zA-Z0-9_.+-])[a-zA-Z0-9_.+-]*@([a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+)\b/g, '$1***@$2');

    // Mask international/Egyptian phone numbers (+20 15 59192858 -> +20 *** *** 58)
    result = result.replace(/(\+?\d{1,3}[\s-]?)(\d{2,4})[\s-]?(\d{3,4})[\s-]?(\d{2,4})/g, '$1*** *** $4');

    return result;
  }

  if (Array.isArray(data)) {
    return data.map(redactSensitiveData);
  }

  if (typeof data === 'object') {
    const clean = {};
    for (const [key, value] of Object.entries(data)) {
      const lowerKey = key.toLowerCase();
      if (
        lowerKey.includes('password') ||
        lowerKey.includes('token') ||
        lowerKey.includes('secret') ||
        lowerKey.includes('privatekey') ||
        lowerKey.includes('authorization') ||
        lowerKey.includes('credential')
      ) {
        clean[key] = '[REDACTED]';
      } else if (lowerKey.includes('email') && typeof value === 'string') {
        clean[key] = redactSensitiveData(value);
      } else if (lowerKey.includes('phone') && typeof value === 'string') {
        clean[key] = redactSensitiveData(value);
      } else if (value && typeof value === 'object') {
        clean[key] = redactSensitiveData(value);
      } else {
        clean[key] = value;
      }
    }
    return clean;
  }

  return data;
}

export const logger = {
  info: (...args) => {
    const redacted = args.map(redactSensitiveData);
    console.log('[INFO]', ...redacted);
  },
  warn: (...args) => {
    const redacted = args.map(redactSensitiveData);
    console.warn('[WARN]', ...redacted);
  },
  error: (...args) => {
    const redacted = args.map(redactSensitiveData);
    console.error('[ERROR]', ...redacted);
  },
  security: (...args) => {
    const redacted = args.map(redactSensitiveData);
    console.warn('[SECURITY AUDIT]', ...redacted);
  }
};

