/**
 * AURORA GROUP — ENTERPRISE BACKEND API SERVER (v3 - Hardened)
 * Comprehensive Security, Access Control (RBAC), Row-Level Security,
 * Cryptographic Sessions, Rate Limiting, Input/Upload Sanitization,
 * Payload Compression & SEO Agent Discoverability.
 */

import fs from 'fs';
import dns from 'dns';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import mongoose from 'mongoose';
import dotenv from 'dotenv';

try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch (e) { }

import { store } from './models/dataStore.js';
import { UserModel, ProjectModel } from './models/mongooseModels.js';
import { sheetsService } from './services/sheetsService.js';
import { emailService } from './services/emailService.js';
import { dbService } from './services/dbService.js';
import { firebaseAuthService } from './services/firebaseAuthService.js';
import { firebaseDbService } from './services/firebaseDbService.js';
import { cloudinaryService } from './services/cloudinaryService.js';
import {
  hashPassword,
  verifyPassword,
  signSession,
  verifySession,
  sanitizeNoSql,
  sanitizeString,
  validateImageUpload,
  verifyWebhookSignature
} from './utils/security.js';
import { logger } from './utils/logger.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CLIENT_DIR = path.join(__dirname, '../client');

const isProd = process.env.NODE_ENV === 'production';
const PORT = process.env.PORT || 3000;

// Initialize Hybrid Database Service (MongoDB with persistent JSON fallback)
dbService.init().catch(err => logger.warn('[DB Init Non-fatal]:', err.message));

const app = express();

// Disable powered-by banner
app.disable('x-powered-by');

// Trust reverse proxy (needed for secure cookies behind reverse proxy/load balancer)
app.set('trust proxy', 1);

// -----------------------------------------------------------------------------
// 1. SECURITY & NETWORK HEADERS (Helmet & CSP)
// -----------------------------------------------------------------------------
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: [
        "'self'",
        "'unsafe-inline'", // Required for zero-FOUC theme engine script
        'https://www.googletagmanager.com',
        'https://apis.google.com',
        'https://www.gstatic.com',
        'https://*.firebaseio.com'
      ],
      styleSrc: [
        "'self'",
        "'unsafe-inline'",
        'https://api.fontshare.com',
        'https://fonts.googleapis.com'
      ],
      fontSrc: [
        "'self'",
        'https://api.fontshare.com',
        'https://fonts.gstatic.com',
        'data:'
      ],
      imgSrc: [
        "'self'",
        'data:',
        'blob:',
        'https://res.cloudinary.com',
        'https:',
        'http:'
      ],
      connectSrc: [
        "'self'",
        'https://identitytoolkit.googleapis.com',
        'https://securetoken.googleapis.com',
        'https://www.googleapis.com',
        'https://*.firebaseio.com',
        'https://*.firebaseapp.com',
        'https://*.googleapis.com',
        'https://accounts.google.com',
        'https://www.google-analytics.com',
        'https://analytics.google.com'
      ],
      frameSrc: [
        "'self'",
        'https://accounts.google.com',
        'https://*.firebaseapp.com',
        'https://*.firebase.com',
        'https://www.youtube.com',
        'https://www.google.com'
      ],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      upgradeInsecureRequests: isProd ? [] : null
    }
  },
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: false, // Disabled to allow Google OAuth Popup communication
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
}));

// CORS Configuration
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim())
  : ['http://localhost:3000', 'http://127.0.0.1:3000', 'https://auroragroup.eg'];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, server-to-server) or in whitelist
    if (!origin || allowedOrigins.includes(origin) || !isProd) {
      callback(null, true);
    } else {
      callback(new Error('Blocked by CORS policy'));
    }
  },
  credentials: true
}));

// Payload compression (Brotli & Gzip)
app.use(compression({
  threshold: 1024,
  filter: (req, res) => {
    if (req.headers['x-no-compression']) return false;
    return compression.filter(req, res);
  }
}));

// Body parsing with size safeguards
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// NoSQL Injection Defense: Strip operator keys starting with $ or containing .
app.use((req, res, next) => {
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeNoSql(req.body);
  }
  if (req.query && typeof req.query === 'object') {
    req.query = sanitizeNoSql(req.query);
  }
  next();
});

// -----------------------------------------------------------------------------
// 2. TRAFFIC CONTROLS & RATE LIMITERS
// -----------------------------------------------------------------------------
// General API Rate Limiter
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests. Please try again later.' }
});
app.use('/api/', apiLimiter);

// Strict Rate Limiter for Authentication (Anti-Brute Force)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many authentication attempts. Please try again in 15 minutes.' }
});

// Rate Limiter for Public Submission Forms (Anti-Spam)
const formRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 25,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many submissions from this IP. Please try again in 15 minutes.' }
});

// -----------------------------------------------------------------------------
// 3. AUTHENTICATION & ACCESS CONTROL (Cryptographic Sessions + RBAC + RLS)
// -----------------------------------------------------------------------------
const sessionActivityTracker = new Map(); // email -> timestamp
const SESSION_TIMEOUT_MS = 15 * 60 * 1000; // 15-minute sliding inactivity window

/**
 * Robust Server-Side Authentication Guard.
 * Inspects HttpOnly signed cookie or Bearer token, verifies HMAC signature,
 * validates against staff directory, checks inactivity timeout, and enforces RBAC roles.
 */
const requireAuth = (allowedRoles = null, requiredPermissions = null) => (req, res, next) => {
  let token = req.cookies?.aurora_session;

  // Fallback to Authorization: Bearer token if cookie is not present
  if (!token && req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    token = req.headers.authorization.slice(7).trim();
  }

  if (!token) {
    return res.status(401).json({ success: false, error: 'Authentication required. Please sign in.' });
  }

  const decoded = verifySession(token);
  if (!decoded || !decoded.email) {
    res.clearCookie('aurora_session', { httpOnly: true, sameSite: 'lax' });
    return res.status(401).json({ success: false, error: 'Invalid or expired session. Please sign in again.' });
  }

  const cleanEmail = decoded.email.toLowerCase().trim();
  const user = store.getUserByEmail(cleanEmail);
  if (!user || user.isActive === false) {
    res.clearCookie('aurora_session', { httpOnly: true, sameSite: 'lax' });
    return res.status(403).json({ success: false, error: 'Unauthorized user or deactivated account.' });
  }

  // Enforce Role & Granular Staff Permissions
  const hasPerm = requiredPermissions
    ? (Array.isArray(requiredPermissions) ? requiredPermissions : [requiredPermissions])
        .some((perm) => user.permissions && user.permissions[perm] === true)
    : false;

  if (allowedRoles && !allowedRoles.includes(user.role) && !hasPerm) {
    return res.status(403).json({ success: false, error: 'Access denied: Insufficient permissions.' });
  }

  // Session Inactivity Verification
  const lastActive = sessionActivityTracker.get(cleanEmail);
  if (lastActive && (Date.now() - lastActive > SESSION_TIMEOUT_MS)) {
    sessionActivityTracker.delete(cleanEmail);
    res.clearCookie('aurora_session', { httpOnly: true, sameSite: 'lax' });
    logger.security(`Session expired for ${cleanEmail} due to inactivity`);
    return res.status(401).json({
      success: false,
      sessionTimeout: true,
      error: 'Your session has expired due to 15 minutes of inactivity. Please sign in again.'
    });
  }

  // Sliding window update
  sessionActivityTracker.set(cleanEmail, Date.now());

  // Attach authenticated user (with password stripped)
  const { password: _, ...safeUser } = user;
  req.authUser = safeUser;
  next();
};

/**
 * Helper to issue a hardened HttpOnly session cookie and return auth payload
 */
  function issueSessionCookie(req, res, user) {
    const sessionToken = signSession({
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name
    });

    sessionActivityTracker.set(user.email.toLowerCase(), Date.now());

    const isHttps = Boolean(req.secure || req.headers['x-forwarded-proto'] === 'https' || isProd);
    res.cookie('aurora_session', sessionToken, {
      httpOnly: true,
      secure: isHttps,
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    });

    return sessionToken;
  }

  // Monitoring Pageview Tracking
  app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api') && !req.path.includes('.')) {
      store.recordVisit(req.path, req.ip || '127.0.0.1', req.get('Referrer') || 'direct');
    }
    next();
  });

  // -----------------------------------------------------------------------------
  // 4. AUTH & USER ENDPOINTS
  // -----------------------------------------------------------------------------
  app.post('/api/auth/login', authLimiter, async (req, res) => {
    const { email, password } = req.body || {};
    if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ success: false, error: 'Valid email and password strings are required' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const user = store.getUserByEmail(cleanEmail);
    if (!user) {
      return res.status(401).json({ success: false, error: 'Invalid credentials. User not found in staff directory.' });
    }

    // 1. Verify password using bcrypt
    const isMatch = verifyPassword(password, user.password);

    // 2. If password verification fails or Firebase is configured, attempt Firebase identity check
    let fbVerified = false;
    if (!isMatch) {
      const settings = store.getSettings() || {};
      const apiKey = settings.firebaseApiKey || process.env.FIREBASE_API_KEY;
      if (apiKey) {
        try {
          const fbResp = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: cleanEmail, password, returnSecureToken: true }),
            signal: AbortSignal.timeout(3000)
          });
          const fbData = await fbResp.json();
          if (fbData.idToken) {
            fbVerified = true;
            // Upgrade local password hash
            store.updateUserProfile(user.email, { password: hashPassword(password) });
          }
        } catch (fbErr) {
          logger.warn('Firebase sign-in fallback error:', fbErr.message);
        }
      }
    }

    if (!isMatch && !fbVerified) {
      logger.security(`Failed login attempt for ${cleanEmail}`);
      return res.status(401).json({ success: false, error: 'Invalid email or password.' });
    }

    dbService.syncUserLogin(user.email).catch(() => { });
    store.logActivity('User Login (Verified)', user.email, { role: user.role });

    const sessionToken = issueSessionCookie(req, res, user);
    const { password: _, ...safeUser } = user;

    res.json({
      success: true,
      user: safeUser,
      token: sessionToken
    });
  });

  app.post('/api/auth/firebase-login', authLimiter, async (req, res) => {
    try {
      const { idToken } = req.body;
      if (!idToken || typeof idToken !== 'string') {
        return res.status(400).json({ success: false, error: 'A valid Firebase ID token is required' });
      }

      const verifiedUser = await firebaseAuthService.verifyToken(idToken);
      if (!verifiedUser || !verifiedUser.email) {
        return res.status(401).json({ success: false, error: 'Firebase authentication failed' });
      }

      const cleanEmail = verifiedUser.email.toLowerCase().trim();
      let user = store.getUserByEmail(cleanEmail);

      if (!user) {
        // Check MongoDB
        if (mongoose.connection?.readyState === 1) {
          try {
            user = await UserModel.findOne({ email: cleanEmail }).lean();
          } catch { }
        }
      }

      if (!user) {
        return res.status(403).json({
          success: false,
          error: `The email "${cleanEmail}" is not authorized for staff access. Please add this email in Staff Users & Permissions first.`
        });
      }

      store.logActivity('Google / Firebase SSO Login', user.email, { role: user.role });

      // Ensure Firebase claims and RTDB match portal directory
      firebaseAuthService.updateUserClaims(user.email, user.role, user.permissions).catch(() => {});
      firebaseDbService.syncUsers(store.getUsers()).catch(() => {});

      const sessionToken = issueSessionCookie(req, res, user);
      const { password: _, ...safeUser } = user;

      res.json({ success: true, user: safeUser, token: sessionToken });
    } catch (err) {
      logger.warn('Firebase login verification failed:', err.message);
      res.status(401).json({ success: false, error: err.message });
    }
  });

  app.post('/api/auth/change-initial-password', requireAuth(), async (req, res) => {
    try {
      const { newPassword } = req.body || {};
      if (!newPassword || typeof newPassword !== 'string' || newPassword.trim().length < 6) {
        return res.status(400).json({ success: false, error: 'New password must be at least 6 characters long.' });
      }
      const cleanNewPw = newPassword.trim();
      if (cleanNewPw === 'Aurora@2026' || cleanNewPw === 'password123') {
        return res.status(400).json({ success: false, error: 'Please choose a new personal password different from the default password.' });
      }

      const email = req.authUser.email;
      const updated = store.updateUserProfile(email, {
        password: cleanNewPw,
        mustChangePassword: false,
        mustResetPassword: false,
        passwordChangedAt: new Date().toISOString()
      });

      if (!updated) {
        return res.status(404).json({ success: false, error: 'User account not found.' });
      }

      // Sync updated password and profile to Firebase Auth & Realtime Database
      await firebaseAuthService.updateFirebaseUser(email, {
        email: updated.email,
        displayName: updated.name,
        password: cleanNewPw,
        role: updated.role,
        permissions: updated.permissions
      });
      await firebaseDbService.syncUsers(store.getUsers());

      store.logActivity('Staff Initial Password Changed', email, { role: updated.role });

      const { password: _, ...safeUser } = updated;
      res.json({
        success: true,
        message: 'Your password has been updated and synced with Firebase.',
        user: safeUser
      });
    } catch (err) {
      res.status(500).json({ success: false, error: 'Failed to update password: ' + err.message });
    }
  });

  app.post('/api/auth/logout', (req, res) => {
    res.clearCookie('aurora_session', { httpOnly: true, sameSite: 'lax' });
    const token = req.cookies?.aurora_session;
    if (token) {
      const decoded = verifySession(token);
      if (decoded?.email) {
        sessionActivityTracker.delete(decoded.email.toLowerCase());
        store.logActivity('User Logout', decoded.email, {});
      }
    }
    res.json({ success: true, message: 'Logged out successfully.' });
  });

  app.get('/api/auth/me', requireAuth(), (req, res) => {
    res.json({ success: true, user: req.authUser });
  });

  app.post('/api/auth/forgot-password', authLimiter, async (req, res) => {
    const { email } = req.body || {};
    if (!email || typeof email !== 'string') {
      return res.status(400).json({ success: false, error: 'Valid email address string is required' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const user = store.getUserByEmail(cleanEmail);

    // Always return consistent success response to prevent email enumeration timing attacks
    if (!user) {
      return res.json({
        success: true,
        message: `If an account exists for "${cleanEmail}", password reset instructions have been dispatched.`
      });
    }

    try {
      let resetLink = null;
      let emailDispatched = false;

      if (firebaseAuthService.hasFullAdminAccess && firebaseAuthService.adminApp) {
        try {
          const { getAuth } = await import('firebase-admin/auth');
          resetLink = await getAuth(firebaseAuthService.adminApp).generatePasswordResetLink(cleanEmail);
        } catch (e) {
          logger.warn('Firebase reset link generation warning:', e.message);
        }
      }

      const settings = store.getSettings() || {};
      const apiKey = settings.firebaseApiKey || process.env.FIREBASE_API_KEY;
      if (apiKey) {
        try {
          const fbResp = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ requestType: 'PASSWORD_RESET', email: cleanEmail })
          });
          const fbData = await fbResp.json();
          if (fbData.email) emailDispatched = true;
        } catch { }
      }

      if (resetLink) {
        emailService.dispatch(
          cleanEmail,
          'Aurora Group — Password Reset Request',
          `Hello ${user.name},\n\nYou requested a password reset for your Aurora Group platform account.\n\nClick the link below to set a new password:\n${resetLink}\n\nThis link is valid for 1 hour.`
        ).catch(() => { });
      }

      store.logActivity('Password Reset Requested', cleanEmail, { emailDispatched });

      res.json({
        success: true,
        message: `If an account exists for "${cleanEmail}", password reset instructions have been dispatched.`,
        resetLink: isProd ? undefined : resetLink
      });
    } catch (err) {
      res.status(500).json({ success: false, error: 'Failed to process password reset request.' });
    }
  });

  app.post('/api/auth/request-password-reset', requireAuth(), async (req, res) => {
    const email = req.authUser.email;
    try {
      const result = await firebaseAuthService.revokeAndSendPasswordReset(email);
      sessionActivityTracker.delete(email.toLowerCase());
      res.clearCookie('aurora_session', { httpOnly: true, sameSite: 'lax' });
      store.logActivity('Self-Service Password Reset', email, {});
      res.json({
        success: true,
        message: `Password reset email dispatched to ${email}. All active sessions have been terminated.`,
        resetLink: isProd ? undefined : result.resetLink
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.get('/api/auth/firebase-status', (req, res) => {
    res.json({ success: true, data: firebaseAuthService.getStatus() });
  });

  app.post('/api/auth/firebase-service-account', requireAuth(['super_admin']), async (req, res) => {
    try {
      let serviceAccount = req.body;
      if (typeof serviceAccount === 'string') {
        serviceAccount = JSON.parse(serviceAccount);
      }
      if (!serviceAccount.project_id || !serviceAccount.private_key || !serviceAccount.client_email) {
        return res.status(400).json({ success: false, error: 'Invalid service account JSON format' });
      }

      const keyPath = path.join(__dirname, 'serviceAccountKey.json');
      fs.writeFileSync(keyPath, JSON.stringify(serviceAccount, null, 2), 'utf8');

      await firebaseAuthService.init(true);
      store.logActivity('Firebase Service Account Updated', req.authUser.email, { projectId: serviceAccount.project_id });

      res.json({
        success: true,
        message: 'Firebase Service Account installed successfully.',
        data: firebaseAuthService.getStatus()
      });
    } catch (err) {
      res.status(400).json({ success: false, error: 'Failed to install service account: ' + err.message });
    }
  });

  app.post('/api/auth/firebase-sync-staff', requireAuth(['super_admin']), async (req, res) => {
    try {
      const purgeAllFirst = Boolean(req.body?.purgeAllFirst);
      await firebaseAuthService.init(true);
      const users = store.getUsers();
      const authSync = await firebaseAuthService.reconcileAndSyncAllUsers(users, purgeAllFirst);
      const dbSync = await firebaseDbService.resetAndReconnectSync(store);

      store.logActivity('Firebase Full Staff & DB Sync Reconnected', req.authUser.email, {
        syncedCount: authSync.syncedCount,
        deletedStaleAuthUsers: authSync.deletedCount,
        rtdbSynced: dbSync.success
      });

      res.json({
        success: true,
        count: authSync.syncedCount,
        deletedCount: authSync.deletedCount,
        rtdbSynced: dbSync.success,
        data: authSync.results
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // -----------------------------------------------------------------------------
  // 5. USER DIRECTORY & PROFILES (RBAC & RLS)
  // -----------------------------------------------------------------------------
  app.get('/api/users', requireAuth(['super_admin', 'manager']), (req, res) => {
    const users = store.getUsers().map(({ password, ...u }) => u);
    res.json({ success: true, data: users });
  });

  app.get('/api/team', (req, res) => {
    const settings = store.getSettings();
    if (settings.enableTeamDirectory === false) {
      return res.json({ success: true, enabled: false, data: [] });
    }

    const users = store.getUsers()
      .filter(u => u.isActive !== false)
      .map(({ password, permissions, mustResetPassword, mustChangePassword, passwordExpiredAt, ...safe }) => safe);

    res.json({ success: true, enabled: true, data: users });
  });

  app.get('/api/users/profile/:slug', async (req, res) => {
    const cleanSlug = sanitizeString(req.params.slug || '').toLowerCase().trim();
    let user = store.getUserBySlug(cleanSlug);

    if (mongoose.connection?.readyState === 1) {
      try {
        const dbUser = await UserModel.findOne({
          $or: [{ slug: cleanSlug }, { email: cleanSlug }, { id: cleanSlug }]
        }).lean();
        if (dbUser) {
          user = { ...(user || {}), ...dbUser };
        }
      } catch { }
    }

    if (!user) {
      return res.status(404).json({ success: false, error: 'Team member not found' });
    }

    const { password, ...safeUser } = user;
    const creditedProjects = store.getProjectsForEmployee(user.name);
    res.json({ success: true, user: safeUser, projects: creditedProjects });
  });

  // Row-Level Security: Users can only update their own profile unless super_admin
  app.patch('/api/users/profile', requireAuth(), async (req, res) => {
    const actorEmail = req.authUser.email;
    const targetEmail = (req.body.email && req.authUser.role === 'super_admin') ? req.body.email : actorEmail;

    // Protect sensitive fields from unauthorized modification
    const sanitizedBody = { ...req.body };
    const rawNewPassword = sanitizedBody.password;
    if (req.authUser.role !== 'super_admin') {
      delete sanitizedBody.role;
      delete sanitizedBody.permissions;
      delete sanitizedBody.isActive;
    }

    const updated = store.updateUserProfile(targetEmail, sanitizedBody);
    if (!updated) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    // Automatically sync adjusted staff profile to Firebase Auth & Firebase Realtime Database
    await firebaseAuthService.updateFirebaseUser(targetEmail, {
      email: updated.email,
      displayName: updated.name,
      password: rawNewPassword || undefined,
      role: updated.role,
      permissions: updated.permissions
    });
    await firebaseDbService.syncUsers(store.getUsers());

    if (mongoose.connection?.readyState === 1) {
      try {
        const { password, ...cleanDbDoc } = sanitizedBody;
        await UserModel.findOneAndUpdate({ email: targetEmail.toLowerCase() }, { $set: cleanDbDoc });
      } catch { }
    }

    const { password, ...safeUser } = updated;
    res.json({ success: true, user: safeUser });
  });

  app.post('/api/users', requireAuth(['super_admin']), async (req, res) => {
    const { name, email, password, role, title, department, permissions, mustChangePassword } = req.body;
    if (!email || !name) {
      return res.status(400).json({ success: false, error: 'Name and email are required' });
    }

    const defaultPassword = (password && String(password).trim()) ? String(password).trim() : 'Aurora@2026';
    const requirePwChange = mustChangePassword !== undefined ? Boolean(mustChangePassword) : true;

    const newUser = store.addUser({
      name: sanitizeString(name),
      email: sanitizeString(email),
      password: defaultPassword,
      role: role || 'employee',
      title: sanitizeString(title || 'Staff Member'),
      department: sanitizeString(department || 'General'),
      permissions,
      mustChangePassword: requirePwChange
    }, req.authUser.email);

    if (!newUser) {
      return res.status(400).json({ success: false, error: 'A staff member with this email already exists' });
    }

    // 1. Automatically create & authorize user in Firebase Authentication
    await firebaseAuthService.createFirebaseUser({
      email: newUser.email,
      password: defaultPassword,
      displayName: newUser.name,
      role: newUser.role,
      permissions: newUser.permissions
    });

    // 2. Automatically sync full staff list to Firebase Realtime Database
    await firebaseDbService.syncUsers(store.getUsers());

    // 3. Automatically send Welcome Email with default password & access instructions
    const hostUrl = `${req.protocol}://${req.get('host')}/login`;
    const emailResult = await emailService.sendStaffWelcomeEmail({
      name: newUser.name,
      email: newUser.email,
      role: newUser.role,
      title: newUser.title,
      department: newUser.department,
      defaultPassword,
      mustChangePassword: newUser.mustChangePassword,
      portalUrl: hostUrl
    });

    // Also dispatch real email via Google's Firebase Identity Toolkit mail servers
    const fbEmailResult = await firebaseAuthService.sendFirebaseWelcomeEmail(
      newUser.email,
      newUser.name,
      defaultPassword
    );

    if (mongoose.connection?.readyState === 1) {
      try {
        await UserModel.findOneAndUpdate({ email: newUser.email }, newUser, { upsert: true, new: true });
      } catch { }
    }

    const { password: _, ...safeUser } = newUser;
    res.status(201).json({
      success: true,
      data: safeUser,
      defaultPassword,
      welcomeEmailSent: Boolean(emailResult?.success)
    });
  });

  app.put('/api/users/:id', requireAuth(['super_admin']), async (req, res) => {
    const { name, email, role, title, department, permissions, mustChangePassword, password } = req.body || {};
    const updatePayload = {};
    if (name !== undefined) updatePayload.name = sanitizeString(name);
    if (email !== undefined) updatePayload.email = sanitizeString(email);
    if (role !== undefined) updatePayload.role = role;
    if (title !== undefined) updatePayload.title = sanitizeString(title);
    if (department !== undefined) updatePayload.department = sanitizeString(department);
    if (permissions !== undefined) updatePayload.permissions = permissions;
    if (mustChangePassword !== undefined) updatePayload.mustChangePassword = Boolean(mustChangePassword);
    if (password && String(password).trim()) updatePayload.password = String(password).trim();

    const result = store.updateUserById(req.params.id, updatePayload, req.authUser.email);
    if (!result) {
      return res.status(404).json({ success: false, error: 'Staff member not found' });
    }
    if (result.error) {
      return res.status(400).json({ success: false, error: result.error });
    }

    const { previousEmail, user: updated } = result;

    // Automatically sync adjusted staff details to Firebase Auth & Firebase Realtime Database
    await firebaseAuthService.updateFirebaseUser(previousEmail, {
      email: updated.email,
      displayName: updated.name,
      password: updatePayload.password || undefined,
      role: updated.role,
      permissions: updated.permissions
    });
    await firebaseDbService.syncUsers(store.getUsers());

    const { password: _, ...safeUser } = updated;
    res.json({
      success: true,
      message: 'Staff details updated and synced to Firebase.',
      data: safeUser
    });
  });

  app.delete('/api/users/:id', requireAuth(['super_admin']), async (req, res) => {
    const deleted = store.deleteUser(req.params.id, req.authUser.email);
    if (!deleted) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    // Automatically delete user from Firebase Auth & sync clean staff list to Firebase Realtime Database
    await firebaseAuthService.deleteFirebaseUser(deleted.email);
    await firebaseDbService.syncUsers(store.getUsers());

    if (mongoose.connection?.readyState === 1) {
      try {
        await UserModel.findOneAndDelete({ $or: [{ id: req.params.id }, { email: deleted.email }] });
      } catch { }
    }

    res.json({ success: true, message: 'User deleted from portal and Firebase successfully' });
  });

  app.patch('/api/users/:id/permissions', requireAuth(['super_admin']), async (req, res) => {
    const { role, permissions } = req.body;
    const updated = store.updateUserPermissions(req.params.id, role, permissions, req.authUser.email);
    if (!updated) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    // Automatically sync updated role & permissions to Firebase Auth & Firebase Realtime Database
    await firebaseAuthService.updateFirebaseUser(updated.email, {
      displayName: updated.name,
      role: updated.role,
      permissions: updated.permissions
    });
    await firebaseDbService.syncUsers(store.getUsers());

    const { password: _, ...safeUser } = updated;
    res.json({ success: true, data: safeUser });
  });

  app.post('/api/users/:id/expire-password', requireAuth(['super_admin']), async (req, res) => {
    const user = store.expireUserPassword(req.params.id, req.authUser.email);
    if (!user) {
      return res.status(404).json({ success: false, error: 'Staff member not found' });
    }

    let resetLink = null;
    const fbResult = await firebaseAuthService.expireAndGenerateReset(user.email);
    if (fbResult && fbResult.resetLink) {
      resetLink = fbResult.resetLink;
    }
    await firebaseDbService.syncUsers(store.getUsers());

    res.json({
      success: true,
      message: `Password for ${user.name} has been expired. A reset link has been dispatched to their email.`,
      resetLink: isProd ? undefined : resetLink
    });
  });

  // -----------------------------------------------------------------------------
  // 6. SERVICES (Protected Management)
  // -----------------------------------------------------------------------------
  app.get('/api/services', (req, res) => {
    const all = req.query.all === 'true';
    const services = store.getServices();
    res.json({ success: true, data: all ? services : services.filter(s => s.active) });
  });

  app.post('/api/services', requireAuth(['super_admin']), (req, res) => {
    const newService = store.addService(req.body, req.authUser.email);
    res.status(201).json({ success: true, message: 'Service added successfully', data: newService });
  });

  app.put('/api/services/:id', requireAuth(['super_admin']), (req, res) => {
    const updated = store.updateService(req.params.id, req.body, req.authUser.email);
    if (!updated) {
      return res.status(404).json({ success: false, error: 'Service not found' });
    }
    res.json({ success: true, message: 'Service updated successfully', data: updated });
  });

  app.delete('/api/services/:id', requireAuth(['super_admin']), (req, res) => {
    const deleted = store.deleteService(req.params.id, req.authUser.email);
    if (!deleted) {
      return res.status(404).json({ success: false, error: 'Service not found' });
    }
    res.json({ success: true, message: 'Service deleted successfully' });
  });

  app.post('/api/services/reorder', requireAuth(['super_admin']), (req, res) => {
    const { ids } = req.body;
    if (!Array.isArray(ids)) {
      return res.status(400).json({ success: false, error: 'Array of ids required' });
    }
    const reordered = store.reorderServices(ids, req.authUser.email);
    res.json({ success: true, message: 'Services reordered successfully', data: reordered });
  });

  app.patch('/api/services/:id/toggle', requireAuth(['super_admin', 'manager']), (req, res) => {
    const updated = store.toggleService(req.params.id, req.body.active, req.authUser.email);
    if (!updated) {
      return res.status(404).json({ success: false, error: 'Service not found' });
    }
    res.json({ success: true, data: updated });
  });

  // -----------------------------------------------------------------------------
  // 7. PROJECTS & PORTFOLIO (RBAC, Upload Sanitization & RLS)
  // -----------------------------------------------------------------------------
  app.get('/api/projects', (req, res) => {
    const status = req.query.status || 'published';
    const projects = store.getProjects(status);
    res.json({ success: true, count: projects.length, data: projects });
  });

  app.get('/api/projects/employee/:name', (req, res) => {
    const cleanName = sanitizeString(req.params.name);
    const projects = store.getProjectsForEmployee(cleanName);
    res.json({ success: true, count: projects.length, data: projects });
  });

  app.get('/api/projects/:slug', (req, res) => {
    const cleanSlug = sanitizeString(req.params.slug);
    const project = store.getProjectBySlug(cleanSlug);
    if (!project) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }
    res.json({ success: true, data: project });
  });

  // Authenticated Project Upload
  app.post('/api/projects', requireAuth(), async (req, res) => {
    try {
      const authorEmail = req.authUser.email;
      const body = { ...req.body };

      if (cloudinaryService.isConfigured()) {
        if (Array.isArray(body.photos)) {
          body.photos = await cloudinaryService.processProjectPhotos(body.photos, 'aurora/projects');
        }
        if (Array.isArray(body.gallery)) {
          body.gallery = await cloudinaryService.processProjectPhotos(body.gallery, 'aurora/projects');
        }
        if (typeof body.heroPhoto === 'string' && body.heroPhoto.startsWith('data:image/')) {
          const uploadedHero = await cloudinaryService.uploadDataUrl(body.heroPhoto, { folder: 'aurora/projects' });
          body.heroPhoto = uploadedHero.url;
        }
      }

      const newProject = store.addProject(body, authorEmail);
      emailService.sendProjectUploadedAlert(newProject, authorEmail).catch(() => { });
      res.status(201).json({ success: true, message: 'Project submitted for manager review', data: newProject });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.patch('/api/projects/:id/approve', requireAuth(['super_admin', 'manager'], 'canApproveProjects'), (req, res) => {
    const updated = store.approveProject(req.params.id, req.authUser.email);
    if (!updated) return res.status(404).json({ success: false, error: 'Project not found' });
    res.json({ success: true, data: updated });
  });

  app.patch('/api/projects/:id/publish', requireAuth(['super_admin', 'manager'], 'canPublishProjects'), (req, res) => {
    const updated = store.publishProject(req.params.id, req.authUser.email);
    if (!updated) return res.status(404).json({ success: false, error: 'Project not found' });
    res.json({ success: true, data: updated });
  });

  app.patch('/api/projects/:id', requireAuth(['super_admin', 'manager']), async (req, res) => {
    try {
      const updates = { ...req.body };
      if (cloudinaryService.isConfigured()) {
        if (Array.isArray(updates.photos)) {
          updates.photos = await cloudinaryService.processProjectPhotos(updates.photos, 'aurora/projects');
        }
        if (Array.isArray(updates.gallery)) {
          updates.gallery = await cloudinaryService.processProjectPhotos(updates.gallery, 'aurora/projects');
        }
      }
      const updated = store.updateProject(req.params.id, updates, req.authUser.email);
      if (!updated) return res.status(404).json({ success: false, error: 'Project not found' });
      res.json({ success: true, data: updated });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.put('/api/projects/:id', requireAuth(['super_admin', 'manager']), async (req, res) => {
    try {
      const updates = { ...req.body };
      if (cloudinaryService.isConfigured()) {
        if (Array.isArray(updates.photos)) {
          updates.photos = await cloudinaryService.processProjectPhotos(updates.photos, 'aurora/projects');
        }
        if (Array.isArray(updates.gallery)) {
          updates.gallery = await cloudinaryService.processProjectPhotos(updates.gallery, 'aurora/projects');
        }
      }
      const updated = store.updateProject(req.params.id, updates, req.authUser.email);
      if (!updated) return res.status(404).json({ success: false, error: 'Project not found' });
      res.json({ success: true, message: 'Project updated successfully', data: updated });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.patch('/api/projects/:id/reject', requireAuth(['super_admin', 'manager'], 'canApproveProjects'), (req, res) => {
    const reason = sanitizeString(req.body.reason || 'Requirements not met');
    const updated = store.rejectProject(req.params.id, reason, req.authUser.email);
    if (!updated) return res.status(404).json({ success: false, error: 'Project not found' });
    res.json({ success: true, message: 'Project rejected', data: updated });
  });

  app.patch('/api/projects/:id/withdraw', requireAuth(['super_admin', 'manager']), (req, res) => {
    const updated = store.withdrawProject(req.params.id, req.authUser.email);
    if (!updated) return res.status(404).json({ success: false, error: 'Project not found' });
    res.json({ success: true, message: 'Project withdrawn to draft', data: updated });
  });

  app.post('/api/projects/:id/request-update', requireAuth(), (req, res) => {
    const request = store.submitUpdateRequest(req.params.id, req.body, req.authUser.email);
    res.status(201).json({ success: true, message: 'Update request submitted to manager', data: request });
  });

  app.delete('/api/projects/:id/portfolio', requireAuth(), (req, res) => {
    const employeeName = req.authUser.role === 'super_admin' ? (req.query.employeeName || req.authUser.name) : req.authUser.name;
    const updated = store.removeProjectFromEmployeePortfolio(req.params.id, employeeName, req.authUser.email);
    if (!updated) return res.status(404).json({ success: false, error: 'Project not found' });
    res.json({ success: true, message: 'Project removed from your portfolio', data: updated });
  });

  app.get('/api/industries', (req, res) => {
    res.json({ success: true, data: store.getIndustries() });
  });

  app.post('/api/industries', requireAuth(['super_admin', 'manager']), (req, res) => {
    const name = sanitizeString(req.body.name);
    if (!name) return res.status(400).json({ success: false, error: 'Industry name is required' });
    const updated = store.addIndustry(name, req.authUser.email);
    res.status(201).json({ success: true, data: updated });
  });

  app.get('/api/users/portfolio-clips', requireAuth(), async (req, res) => {
    const actorEmail = req.authUser.email;
    let clips = store.getUserPortfolioClips(actorEmail);
    res.json({ success: true, data: clips || [] });
  });

  app.put('/api/users/portfolio-clips', requireAuth(), async (req, res) => {
    const actorEmail = req.authUser.email;
    const clips = Array.isArray(req.body.clips) ? req.body.clips : (Array.isArray(req.body) ? req.body : []);
    const updated = store.updateUserPortfolioClips(actorEmail, clips, actorEmail);
    res.json({ success: true, data: updated });
  });

  // Secure Avatar Upload with MIME validation & magic byte check (Cloudinary + local fallback)
  app.post('/api/users/upload-avatar', requireAuth(), async (req, res) => {
    const { dataUrl, filename } = req.body;
    const validation = validateImageUpload(dataUrl, filename, 5 * 1024 * 1024);
    if (!validation.valid) {
      return res.status(400).json({ success: false, error: validation.error });
    }

    try {
      let publicUrl = '';
      if (cloudinaryService.isConfigured()) {
        const uploaded = await cloudinaryService.uploadDataUrl(dataUrl, { folder: 'aurora/avatars' });
        publicUrl = uploaded.url;
      } else {
        const uploadDir = path.join(CLIENT_DIR, 'assets', 'uploads');
        if (!fs.existsSync(uploadDir)) {
          fs.mkdirSync(uploadDir, { recursive: true });
        }
        const filePath = path.join(uploadDir, validation.safeFilename);
        fs.writeFileSync(filePath, validation.buffer);
        publicUrl = `/assets/uploads/${validation.safeFilename}`;
      }

      store.updateUserProfile(req.authUser.email, { photo: publicUrl });
      store.logActivity('Avatar Uploaded', req.authUser.email, { publicUrl, storage: cloudinaryService.isConfigured() ? 'cloudinary' : 'local' });

      res.status(201).json({ success: true, url: publicUrl });
    } catch (err) {
      res.status(500).json({ success: false, error: 'Failed to save avatar image: ' + err.message });
    }
  });

  // -----------------------------------------------------------------------------
  // 8. CRM & CLIENT INQUIRIES (Anti-Spam & Sanitization)
  // -----------------------------------------------------------------------------
  app.post('/api/inquiries', formRateLimiter, async (req, res) => {
    try {
      const { fullName, brandName, phone, email, services, industry, budget, message, honeypot } = req.body;

      if (honeypot) {
        return res.status(400).json({ success: false, error: 'Spam submission rejected' });
      }

      if (!fullName || !brandName || !phone || !email || !message) {
        return res.status(400).json({ success: false, error: 'Please fill all required fields' });
      }

      const cleanInquiry = {
        fullName: sanitizeString(fullName),
        brandName: sanitizeString(brandName),
        phone: sanitizeString(phone),
        email: sanitizeString(email).toLowerCase(),
        services: Array.isArray(services) ? services.map(sanitizeString) : [sanitizeString(services)],
        industry: sanitizeString(industry || 'General'),
        budget: sanitizeString(budget || 'Undisclosed'),
        message: sanitizeString(message)
      };

      const inquiry = store.addInquiry(cleanInquiry);

      firebaseDbService.syncInquiry(inquiry).catch(() => { });
      sheetsService.appendInquiry(inquiry).catch(() => { });

      res.status(201).json({ success: true, message: 'Inquiry received successfully', data: inquiry });
    } catch (err) {
      res.status(500).json({ success: false, error: 'Failed to process inquiry' });
    }
  });

  app.get('/api/inquiries', requireAuth(['super_admin', 'manager'], 'canViewCRM'), (req, res) => {
    const list = store.getInquiries();
    res.json({ success: true, count: list.length, data: list });
  });

  app.patch('/api/inquiries/:id/status', requireAuth(['super_admin', 'manager'], 'canViewCRM'), (req, res) => {
    const { status, note } = req.body;
    if (!status) return res.status(400).json({ success: false, error: 'Status is required' });

    const updated = store.updateInquiryStatus(req.params.id, status, note, req.authUser.email);
    if (!updated) return res.status(404).json({ success: false, error: 'Inquiry not found' });
    res.json({ success: true, data: updated });
  });

  // -----------------------------------------------------------------------------
  // 8.1. QUOTATIONS & COMMERCIAL INVOICES (PART 4)
  // -----------------------------------------------------------------------------
  app.get('/api/invoices', requireAuth(['super_admin', 'manager', 'employee']), (req, res) => {
    const list = store.getInvoices();
    res.json({ success: true, count: list.length, data: list });
  });

  app.get('/api/invoices/:id', requireAuth(['super_admin', 'manager', 'employee']), (req, res) => {
    const inv = store.getInvoiceById(req.params.id);
    if (!inv) return res.status(404).json({ success: false, error: 'Invoice not found' });
    res.json({ success: true, data: inv });
  });

  app.post('/api/invoices', requireAuth(['super_admin', 'manager']), (req, res) => {
    const inv = store.saveInvoice(req.body, req.authUser.email);
    res.status(201).json({ success: true, message: 'Invoice / Quotation created', data: inv });
  });

  app.put('/api/invoices/:id', requireAuth(['super_admin', 'manager']), (req, res) => {
    const inv = store.saveInvoice({ ...req.body, id: req.params.id }, req.authUser.email);
    if (!inv) return res.status(404).json({ success: false, error: 'Invoice not found' });
    res.json({ success: true, message: 'Invoice / Quotation updated', data: inv });
  });

  app.delete('/api/invoices/:id', requireAuth(['super_admin', 'manager']), (req, res) => {
    const deleted = store.deleteInvoice(req.params.id, req.authUser.email);
    if (!deleted) return res.status(404).json({ success: false, error: 'Invoice not found' });
    res.json({ success: true, message: 'Invoice / Quotation deleted' });
  });

  // -----------------------------------------------------------------------------
  // 9. CLIENT BRIEFS (KYC ENGINE)
  // -----------------------------------------------------------------------------
  app.get('/api/briefs', requireAuth(['super_admin', 'manager'], 'canViewBriefs'), (req, res) => {
    const briefs = store.getBriefs();
    res.json({ success: true, count: briefs.length, data: briefs });
  });

  app.get('/api/briefs/:token', (req, res) => {
    const cleanToken = sanitizeString(req.params.token);
    const brief = store.getBriefByToken(cleanToken);
    if (!brief) {
      return res.status(404).json({ success: false, error: 'Invalid brief link. Please verify your URL.' });
    }

    const isExpired = new Date() > new Date(brief.expiryDate);

    res.json({
      success: true,
      data: {
        token: brief.token,
        clientName: brief.clientName,
        brandName: brief.brandName,
        expiryDate: brief.expiryDate,
        isExpired,
        status: brief.status,
        isSubmitted: brief.isSubmitted,
        submittedAt: brief.submittedAt,
        data: brief.data
      }
    });
  });

  app.post('/api/briefs/generate', requireAuth(['super_admin', 'manager'], 'canGenerateBriefs'), (req, res) => {
    const clientName = sanitizeString(req.body.clientName || '').trim();
    const brandName = sanitizeString(req.body.brandName || '').trim();
    const daysValid = Number(req.body.daysValid) || 30;

    if (!clientName) {
      return res.status(400).json({ success: false, error: 'Client contact name is required' });
    }

    const brief = store.createBrief(clientName, brandName, daysValid, req.authUser.email);
    res.status(201).json({ success: true, data: brief });
  });

  app.post('/api/briefs/:token', formRateLimiter, async (req, res) => {
    try {
      const cleanToken = sanitizeString(req.params.token);
      const result = store.submitBrief(cleanToken, req.body);
      if (result.error) {
        return res.status(400).json({ success: false, error: result.error });
      }

      firebaseDbService.syncBrief(result.brief).catch(() => { });
      sheetsService.appendBrief(result.brief).catch(() => { });
      emailService.sendBriefSubmittedAlert(result.brief).catch(() => { });

      res.json({ success: true, message: 'Discovery brief completed successfully', data: result.brief });
    } catch (err) {
      res.status(500).json({ success: false, error: 'Failed to process brief submission' });
    }
  });

  app.patch('/api/briefs/:token/extend', requireAuth(['super_admin', 'manager'], 'canViewBriefs'), (req, res) => {
    const cleanToken = sanitizeString(req.params.token);
    const target = req.body.targetDate || req.body.days || 14;
    const updated = store.extendBriefExpiry(cleanToken, target, req.authUser.email);
    if (!updated) return res.status(404).json({ success: false, error: 'Brief not found' });
    res.json({ success: true, data: updated });
  });

  app.patch('/api/briefs/:token/deactivate', requireAuth(['super_admin', 'manager'], 'canViewBriefs'), (req, res) => {
    const cleanToken = sanitizeString(req.params.token);
    const updated = store.deactivateBrief(cleanToken, req.authUser.email);
    if (!updated) return res.status(404).json({ success: false, error: 'Brief not found' });
    res.json({ success: true, data: updated });
  });

  app.patch('/api/briefs/:token/edit', requireAuth(['super_admin', 'manager'], 'canViewBriefs'), (req, res) => {
    const cleanToken = sanitizeString(req.params.token);
    const result = store.updateBrief(cleanToken, req.body, req.authUser.email);
    if (result.error) return res.status(400).json({ success: false, error: result.error });
    res.json({ success: true, data: result.brief });
  });

  // -----------------------------------------------------------------------------
  // 10. SYSTEM SETTINGS & CLOUD SYNC (Super Admin Privileges)
  // -----------------------------------------------------------------------------
  app.get('/api/settings', (req, res) => {
    const settings = store.getSettings() || {};
    // Redact private keys from public read
    const { firebasePrivateKey, googlePrivateKey, ...safeSettings } = settings;
    res.json({ success: true, data: safeSettings });
  });

  const handleSettingsUpdate = async (req, res) => {
    const updated = store.updateSettings(req.body, req.authUser.email);

    if (req.body.mongodbUri) {
      await dbService.connect(req.body.mongodbUri);
    }

    if (req.body.firebaseProjectId || req.body.firebaseApiKey || req.body.firebaseClientEmail) {
      await firebaseAuthService.init(true);
    }

    const { firebasePrivateKey, googlePrivateKey, ...safeUpdated } = updated;
    res.json({ success: true, data: safeUpdated, dbStatus: dbService.getStatus(), firebaseStatus: firebaseAuthService.getStatus() });
  };

  app.put('/api/settings', requireAuth(['super_admin']), handleSettingsUpdate);
  app.patch('/api/settings', requireAuth(['super_admin']), handleSettingsUpdate);

  app.get('/api/database/status', (req, res) => {
    const fbStatus = firebaseDbService.getStatus();
    res.json({
      success: true,
      data: {
        connected: fbStatus.connected,
        provider: fbStatus.provider,
        dialect: fbStatus.dialect,
        databaseName: 'aurora-group (Cloud DB)',
        region: fbStatus.region,
        uri: fbStatus.databaseUrl,
        error: null,
        closed: false
      }
    });
  });

  app.post('/api/database/connect', requireAuth(['super_admin']), async (req, res) => {
    const { uri } = req.body;
    if (!uri) return res.status(400).json({ success: false, error: 'MongoDB URI is required' });
    const result = await dbService.connect(uri);
    if (result.success) {
      store.updateSettings({ mongodbUri: uri }, req.authUser.email);
    }
    res.json(result);
  });

  app.post('/api/database/disconnect', requireAuth(['super_admin']), async (req, res) => {
    store.updateSettings({ mongodbUri: '' }, req.authUser.email);
    const result = await dbService.disconnect();
    res.json({ success: true, message: 'Database disconnected. Running securely on Isolated DataStore.', data: result });
  });

  app.get('/api/sheets/status', requireAuth(['super_admin', 'manager']), (req, res) => {
    res.json({
      success: true,
      data: sheetsService.getConfig(),
      queue: sheetsService.getQueue()
    });
  });

  app.post('/api/sheets/test', requireAuth(['super_admin']), async (req, res) => {
    const result = await sheetsService.testConnection();
    res.json({ success: true, result });
  });

  app.post('/api/sheets/sync-all', requireAuth(['super_admin']), async (req, res) => {
    const result = await sheetsService.syncAllPending();
    res.json(result);
  });

  app.get('/api/sheets/export/briefs.csv', requireAuth(['super_admin', 'manager']), (req, res) => {
    const csv = sheetsService.exportBriefsCSV();
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="aurora_client_briefs.csv"');
    res.send(csv);
  });

  app.get('/api/sheets/export/inquiries.csv', requireAuth(['super_admin', 'manager']), (req, res) => {
    const csv = sheetsService.exportInquiriesCSV();
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="aurora_contact_inquiries.csv"');
    res.send(csv);
  });

  app.get('/api/activity-logs', requireAuth(['super_admin']), (req, res) => {
    const logs = store.getActivityLogs();
    res.json({ success: true, count: logs.length, data: logs });
  });

  app.get('/api/monitoring', requireAuth(['super_admin', 'manager']), (req, res) => {
    res.json({ success: true, data: store.getMonitoring() });
  });

  // -----------------------------------------------------------------------------
  // 11. CMS & CONTENT MANAGEMENT & MARQUEE
  // -----------------------------------------------------------------------------
  app.get('/api/content', (req, res) => {
    res.json({ success: true, data: store.getSiteContent() });
  });

  app.put('/api/content', requireAuth(['super_admin']), (req, res) => {
    const updated = store.updateSiteContent(req.body, req.authUser.email);
    res.json({ success: true, message: 'Site content updated successfully', data: updated });
  });

  app.get('/api/content/marquee', (req, res) => {
    res.json({ success: true, data: store.getMarquee() });
  });

  app.put('/api/content/marquee', requireAuth(['super_admin', 'manager']), (req, res) => {
    const updated = store.saveMarquee(req.body, req.authUser.email);
    res.json({ success: true, message: 'Partner logos marquee updated and published', data: updated });
  });

  app.post('/api/content/upload-photo', requireAuth(['super_admin', 'manager']), async (req, res) => {
    const { dataUrl, filename } = req.body;
    const validation = validateImageUpload(dataUrl, filename, 8 * 1024 * 1024);
    if (!validation.valid) {
      return res.status(400).json({ success: false, error: validation.error });
    }

    try {
      let publicUrl = '';
      if (cloudinaryService.isConfigured()) {
        const uploaded = await cloudinaryService.uploadDataUrl(dataUrl, { folder: 'aurora/content' });
        publicUrl = uploaded.url;
      } else {
        const uploadDir = path.join(CLIENT_DIR, 'assets', 'uploads');
        if (!fs.existsSync(uploadDir)) {
          fs.mkdirSync(uploadDir, { recursive: true });
        }
        const filePath = path.join(uploadDir, validation.safeFilename);
        fs.writeFileSync(filePath, validation.buffer);
        publicUrl = `/assets/uploads/${validation.safeFilename}`;
      }

      store.logActivity('Content Photo Uploaded', req.authUser.email, { publicUrl, originalName: filename, storage: cloudinaryService.isConfigured() ? 'cloudinary' : 'local' });

      res.status(201).json({ success: true, url: publicUrl });
    } catch (err) {
      res.status(500).json({ success: false, error: 'Failed to save content photo: ' + err.message });
    }
  });

  // -----------------------------------------------------------------------------
  // 12. SEO, ROBOTS, SITEMAP & AI AGENT DISCOVERABILITY
  // -----------------------------------------------------------------------------
  app.get('/robots.txt', (req, res) => {
    res.type('text/plain');
    res.send(`User-agent: *
Allow: /
Disallow: /admin
Disallow: /portal
Disallow: /brief/
Disallow: /api/

Sitemap: https://auroragroup.eg/sitemap.xml
`);
  });

  app.get('/sitemap.xml', (req, res) => {
    const publishedProjects = store.getProjects('published');
    const now = new Date().toISOString().split('T')[0];

    let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
  <url>
    <loc>https://auroragroup.eg/</loc>
    <lastmod>${now}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
    <xhtml:link rel="alternate" hreflang="en" href="https://auroragroup.eg/" />
    <xhtml:link rel="alternate" hreflang="ar" href="https://auroragroup.eg/ar" />
  </url>
  <url>
    <loc>https://auroragroup.eg/about</loc>
    <lastmod>${now}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
  <url>
    <loc>https://auroragroup.eg/services</loc>
    <lastmod>${now}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.9</priority>
  </url>
  <url>
    <loc>https://auroragroup.eg/projects</loc>
    <lastmod>${now}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.9</priority>
  </url>
  <url>
    <loc>https://auroragroup.eg/team</loc>
    <lastmod>${now}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>
  <url>
    <loc>https://auroragroup.eg/contact</loc>
    <lastmod>${now}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.9</priority>
  </url>
  <url>
    <loc>https://auroragroup.eg/privacy</loc>
    <lastmod>${now}</lastmod>
    <changefreq>yearly</changefreq>
    <priority>0.3</priority>
  </url>
  <url>
    <loc>https://auroragroup.eg/terms</loc>
    <lastmod>${now}</lastmod>
    <changefreq>yearly</changefreq>
    <priority>0.3</priority>
  </url>`;

    for (const p of publishedProjects) {
      if (p.slug) {
        xml += `
  <url>
    <loc>https://auroragroup.eg/projects/${encodeURIComponent(p.slug)}</loc>
    <lastmod>${now}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>`;
      }
    }

    xml += `\n</urlset>`;

    res.type('application/xml');
    res.send(xml);
  });

  app.get('/llms.txt', (req, res) => {
    res.type('text/plain; charset=utf-8');
    res.send(`# Aurora Group Egypt

> Integrated Marketing & Media Production Agency in Egypt

Aurora Group provides creative strategy, cinema 4K commercial production, corporate branding, high-intent paid advertising funnels, and digital experience development for ambitious brands in Egypt and the MENA region.

## Capabilities & Services
- [Social Media Management](/services): Comprehensive content planning, community management, and brand growth.
- [Paid Advertising & Performance Marketing](/services): Meta, TikTok, and Google search campaign engineering with rigorous ROAS tracking.
- [Commercial Cinema & Video Production](/services): 4K commercial reels, corporate documentaries, and Hollywood DaVinci color grading.
- [Commercial Photography](/services): High-end product, hospitality, executive, and architectural photography.
- [Brand Identity & Design Systems](/services): Logotypes, typography systems, packaging design, and visual brand architecture.
- [Web Platforms & Landing Pages](/services): Fast, conversion-optimized responsive web platforms.

## Core Operations & Contact
- Website: https://auroragroup.eg
- Direct Contact / Inquiry: https://auroragroup.eg/contact
- Official Email: contact.aurora.egy@gmail.com
- Business Phone: +20 15 59192858
- Office Location: Abdelsalam El Shazly St, above Next Bank, Egypt
`);
  });

  // -----------------------------------------------------------------------------
  // 13. STATIC ASSETS CACHING & SPA ROUTING
  // -----------------------------------------------------------------------------
  // Static assets with aggressive caching headers
  app.use(express.static(CLIENT_DIR, {
    etag: true,
    lastModified: true,
    maxAge: isProd ? '1d' : 0,
    setHeaders: (res, path) => {
      if (path.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-cache, must-revalidate');
      } else if (path.match(/\.(jpg|jpeg|png|gif|webp|avif|svg|woff2|woff|ttf)$/i)) {
        res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
      } else if (path.match(/\.(css|js)$/i)) {
        res.setHeader('Cache-Control', 'public, max-age=86400');
      }
    }
  }));

  // SPA Fallback Handler
  app.get('*', (req, res) => {
    res.sendFile(path.join(CLIENT_DIR, 'index.html'));
  });

  // -----------------------------------------------------------------------------
  // 14. PRODUCTION ERROR HANDLER
  // -----------------------------------------------------------------------------
  app.use((err, req, res, next) => {
    logger.error('Unhandled server exception:', err.message);
    const status = err.status || 500;
    res.status(status).json({
      success: false,
      error: isProd ? 'An internal error occurred. Please try again later.' : err.message
    });
  });

  app.listen(PORT, () => {
    console.log(`\n======================================================`);
    console.log(`  AURORA GROUP PLATFORM v3 (HARDENED) RUNNING AT:`);
    console.log(`  http://localhost:${PORT}`);
    console.log(`  API Base: http://localhost:${PORT}/api`);
    console.log(`  Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`  RBAC: Active | HttpOnly Sessions: Enabled | CSP: Active`);
    console.log(`======================================================\n`);

    // Automatically reconcile Firebase Auth & Realtime Database on startup so no deleted users remain in Firebase
    setTimeout(async () => {
      try {
        const currentUsers = store.getUsers();
        await firebaseAuthService.reconcileAndSyncAllUsers(currentUsers, false);
        await firebaseDbService.syncUsers(currentUsers);
      } catch (e) {
        console.warn('[Startup Firebase Reconcile Warning]:', e.message);
      }
    }, 1500);
  });
