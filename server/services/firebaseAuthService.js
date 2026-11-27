/**
 * AURORA GROUP — FIREBASE AUTHENTICATION SERVICE
 * Validates Firebase ID tokens and links authenticated Firebase accounts with
 * MongoDB Atlas RBAC users.
 */

import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { google } from 'googleapis';
import { initializeApp, getApps, deleteApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { store } from '../models/dataStore.js';
import { UserModel } from '../models/mongooseModels.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class FirebaseAuthService {
  constructor() {
    this.isInitialized = false;
    this.projectId = null;
    this.adminApp = null;
    this.hasFullAdminAccess = false;
    this.init();
  }

  async init(forceReinit = false) {
    const settings = store.getSettings() || {};

    let serviceAccount = null;

    // 0. Check FIREBASE_SERVICE_ACCOUNT_JSON environment variable (for Render/Railway cloud hosting)
    if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
      try {
        serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
        console.log('[Firebase Auth] Loaded Service Account from FIREBASE_SERVICE_ACCOUNT_JSON env var.');
      } catch (e) {
        console.warn('[Firebase Auth] Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON env var:', e.message);
      }
    }

    // 1. Look for serviceAccountKey.json file
    const possibleKeyFiles = [
      path.join(__dirname, '../serviceAccountKey.json'),
      path.join(__dirname, '../firebase-service-account.json'),
      path.join(process.cwd(), 'server', 'serviceAccountKey.json'),
      path.join(process.cwd(), 'serviceAccountKey.json')
    ];

    if (!serviceAccount) {
      for (const f of possibleKeyFiles) {
        if (fs.existsSync(f)) {
          try {
            serviceAccount = JSON.parse(fs.readFileSync(f, 'utf8'));
            console.log(`[Firebase Auth] Found Service Account file at: ${f}`);
            break;
          } catch (e) {
            console.warn('[Firebase Auth] Failed to parse service account JSON:', e.message);
          }
        }
      }
    }

    const apps = getApps();
    if (apps.length > 0) {
      if (!forceReinit && this.hasFullAdminAccess) {
        this.isInitialized = true;
        this.adminApp = apps[0];
        this.projectId = apps[0].options.projectId;
        return;
      }
      // If we need to reinit or upgrade to full service account credentials, delete existing apps
      for (const app of apps) {
        try {
          await deleteApp(app);
        } catch {}
      }
    }

    try {
      if (serviceAccount && serviceAccount.private_key && serviceAccount.client_email) {
        this.adminApp = initializeApp({
          credential: cert(serviceAccount)
        });
        this.isInitialized = true;
        this.projectId = serviceAccount.project_id;
        this.hasFullAdminAccess = true;
        console.log(`[Firebase Auth] Fully initialized with Service Account Key for project: ${serviceAccount.project_id}`);
        return;
      }

      const projectId = process.env.FIREBASE_PROJECT_ID || settings.firebaseProjectId;
      const clientEmail = process.env.FIREBASE_CLIENT_EMAIL || settings.firebaseClientEmail;
      const privateKey = (process.env.FIREBASE_PRIVATE_KEY || settings.firebasePrivateKey || '').replace(/\\n/g, '\n');

      if (projectId && clientEmail && privateKey) {
        this.adminApp = initializeApp({
          credential: cert({
            projectId,
            clientEmail,
            privateKey
          })
        });
        this.isInitialized = true;
        this.projectId = projectId;
        this.hasFullAdminAccess = true;
        console.log(`[Firebase Auth] Initialized with Service Account for project: ${projectId}`);
      } else if (projectId) {
        this.adminApp = initializeApp({
          projectId
        });
        this.isInitialized = true;
        this.projectId = projectId;
        this.hasFullAdminAccess = false;
        console.log(`[Firebase Auth] Initialized for project: ${projectId}`);
      } else {
        this.isInitialized = false;
        this.hasFullAdminAccess = false;
      }
    } catch (err) {
      console.warn('[Firebase Auth Init Warning]:', err.message);
      this.isInitialized = false;
    }
  }

  /**
   * Creates or updates a user directly in Firebase Authentication
   */
  async createFirebaseUser({ email, password, displayName, role, permissions }) {
    if (!this.adminApp || !this.hasFullAdminAccess) {
      console.log('[Firebase Auth] Admin SDK not initialized with service account key; user saved in DataStore.');
      return null;
    }

    try {
      const auth = getAuth(this.adminApp);
      const cleanEmail = (email || '').toLowerCase().trim();
      let userRecord;
      try {
        userRecord = await auth.getUserByEmail(cleanEmail);
        const updatePayload = { emailVerified: true };
        if (password) updatePayload.password = password;
        if (displayName) updatePayload.displayName = displayName;
        userRecord = await auth.updateUser(userRecord.uid, updatePayload);
        console.log(`[Firebase Auth Admin] Updated existing Firebase user: ${cleanEmail}`);
      } catch (err) {
        if (err.code === 'auth/user-not-found') {
          userRecord = await auth.createUser({
            email: cleanEmail,
            password: password || 'Aurora@2026',
            displayName: displayName || 'Staff Member',
            emailVerified: true
          });
          console.log(`[Firebase Auth Admin] Successfully created user in Firebase Auth: ${cleanEmail} (UID: ${userRecord.uid})`);
        } else {
          throw err;
        }
      }

      // Set Custom Claims for instant RBAC
      if (userRecord && role) {
        await auth.setCustomUserClaims(userRecord.uid, {
          role,
          permissions: permissions || {}
        });
      }

      return userRecord;
    } catch (err) {
      console.warn('[Firebase Auth Admin createUser Warning]:', err.message);
      return null;
    }
  }

  /**
   * Updates an existing user in Firebase Authentication (including email changes, displayName, password, and RBAC claims)
   */
  async updateFirebaseUser(currentEmail, { email, displayName, password, role, permissions } = {}) {
    if (!this.adminApp || !this.hasFullAdminAccess || !currentEmail) return null;
    try {
      const auth = getAuth(this.adminApp);
      const lookupEmail = currentEmail.toLowerCase().trim();
      const targetEmail = (email || currentEmail).toLowerCase().trim();
      let userRecord = null;

      try {
        userRecord = await auth.getUserByEmail(lookupEmail);
      } catch (err) {
        if (err.code === 'auth/user-not-found' && targetEmail !== lookupEmail) {
          try {
            userRecord = await auth.getUserByEmail(targetEmail);
          } catch {}
        }
      }

      if (!userRecord) {
        // User doesn't exist yet in Firebase Auth; create them now
        return await this.createFirebaseUser({
          email: targetEmail,
          password: password || 'Aurora@2026',
          displayName: displayName || 'Staff Member',
          role,
          permissions
        });
      }

      const updatePayload = {};
      if (targetEmail && targetEmail !== userRecord.email?.toLowerCase()) {
        updatePayload.email = targetEmail;
        updatePayload.emailVerified = true;
      }
      if (displayName) updatePayload.displayName = displayName;
      if (password) updatePayload.password = password;

      if (Object.keys(updatePayload).length > 0) {
        userRecord = await auth.updateUser(userRecord.uid, updatePayload);
        console.log(`[Firebase Auth Admin] Updated user details in Firebase Auth: ${targetEmail}`);
      }

      if (role || permissions) {
        const existingClaims = userRecord.customClaims || {};
        await auth.setCustomUserClaims(userRecord.uid, {
          role: role || existingClaims.role || 'employee',
          permissions: permissions || existingClaims.permissions || {}
        });
        console.log(`[Firebase Auth Admin] Synced custom claims for: ${targetEmail}`);
      }

      return userRecord;
    } catch (err) {
      console.warn('[Firebase Auth Admin updateFirebaseUser Warning]:', err.message);
      return null;
    }
  }

  /**
   * Reconciles Firebase Authentication with the local portal staff directory.
   * Removes any deleted/stale users from Firebase Auth and creates/updates all active staff.
   */
  async reconcileAndSyncAllUsers(localUsers = [], purgeAllFirst = false) {
    if (!this.adminApp || !this.hasFullAdminAccess) {
      return { success: false, deletedCount: 0, syncedCount: 0, results: [] };
    }

    try {
      const auth = getAuth(this.adminApp);
      const listRes = await auth.listUsers(1000);
      const fbUsers = listRes.users || [];
      const validEmails = new Set(localUsers.map(u => (u.email || '').toLowerCase().trim()).filter(Boolean));

      let deletedCount = 0;
      for (const fbUser of fbUsers) {
        const fbEmail = (fbUser.email || '').toLowerCase().trim();
        if (purgeAllFirst || !fbEmail || !validEmails.has(fbEmail)) {
          try {
            await auth.deleteUser(fbUser.uid);
            deletedCount++;
            console.log(`[Firebase Auth Sync] Removed user from Firebase Auth: ${fbEmail || fbUser.uid}`);
          } catch (delErr) {
            console.warn(`[Firebase Auth Sync] Failed to delete user ${fbEmail}:`, delErr.message);
          }
        }
      }

      const results = [];
      for (const u of localUsers) {
        const fbUser = await this.createFirebaseUser({
          email: u.email,
          displayName: u.name,
          role: u.role,
          permissions: u.permissions
        });
        results.push({ email: u.email, role: u.role, synced: Boolean(fbUser) });
      }

      return {
        success: true,
        deletedCount,
        syncedCount: results.filter(r => r.synced).length,
        results
      };
    } catch (err) {
      console.warn('[Firebase Auth reconcileAndSyncAllUsers Error]:', err.message);
      return { success: false, error: err.message, deletedCount: 0, syncedCount: 0, results: [] };
    }
  }

  /**
   * Deploys a same-origin OAuth Redirect Relay to Firebase Hosting (project.firebaseapp.com/auth-relay.html)
   * so in-tab Google forwarding works in all browsers without popup windows or third-party cookie blocks.
   */
  async deploySameOriginAuthRelay() {
    try {
      const keyPath = path.join(__dirname, '../serviceAccountKey.json');
      if (!fs.existsSync(keyPath)) return { success: false, error: 'No serviceAccountKey.json' };
      const key = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
      const settings = store.getSettings() || {};
      const apiKey = settings.firebaseApiKey || process.env.FIREBASE_API_KEY;
      const projectId = key.project_id || settings.firebaseProjectId;
      const authDomain = settings.firebaseAuthDomain || `${projectId}.firebaseapp.com`;

      if (!apiKey || !projectId) return { success: false, error: 'Missing apiKey or projectId' };

      const relayHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Aurora Group — Google Single Sign-On</title>
  <style>
    body {
      margin: 0;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      background: #080b1a;
      color: #f4f6fb;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }
    .box {
      text-align: center;
      padding: 36px 40px;
      border-radius: 14px;
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid rgba(255, 255, 255, 0.1);
      max-width: 420px;
    }
    .spinner {
      width: 38px;
      height: 38px;
      border: 3px solid rgba(0, 255, 198, 0.2);
      border-top-color: #00ffc6;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      margin: 0 auto 18px;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    h2 { margin: 0 0 8px; font-size: 1.15rem; font-weight: 700; }
    p { margin: 0; font-size: 0.88rem; color: #9aa3bc; line-height: 1.5; }
  </style>
</head>
<body>
  <div class="box">
    <div class="spinner"></div>
    <h2 id="statusTitle">Connecting to Google...</h2>
    <p id="statusDesc">Forwarding securely in this tab...</p>
  </div>
  <script type="module">
    import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
    import { getAuth, GoogleAuthProvider, signInWithRedirect, getRedirectResult, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';

    const app = initializeApp({
      apiKey: '${apiKey}',
      authDomain: '${authDomain}',
      projectId: '${projectId}'
    });
    const auth = getAuth(app);
    const provider = new GoogleAuthProvider();
    provider.addScope('email');
    provider.addScope('profile');
    provider.setCustomParameters({ prompt: 'select_account' });

    const params = new URLSearchParams(window.location.search);
    const isStart = params.get('start') === '1';
    const paramReturnTo = params.get('returnTo');

    if (paramReturnTo) {
      sessionStorage.setItem('aurora_sso_return_to', paramReturnTo);
      localStorage.setItem('aurora_sso_return_to', paramReturnTo);
    }

    function getReturnUrl() {
      return sessionStorage.getItem('aurora_sso_return_to') || localStorage.getItem('aurora_sso_return_to') || 'http://localhost:3000/login';
    }

    function finishWithToken(idToken, email) {
      const returnUrl = getReturnUrl().split('#')[0];
      window.location.replace(
        returnUrl + '#aurora_google_token=' + encodeURIComponent(idToken) + '&aurora_google_email=' + encodeURIComponent(email || '')
      );
    }

    function finishWithError(errMsg) {
      const returnUrl = getReturnUrl().split('#')[0];
      window.location.replace(
        returnUrl + '#aurora_google_error=' + encodeURIComponent(errMsg || 'Google sign-in was cancelled.')
      );
    }

    async function run() {
      try {
        if (isStart) {
          window.history.replaceState(null, '', '/auth-relay.html');
          try { await signOut(auth); } catch (e) {}
          await signInWithRedirect(auth, provider);
          return;
        }

        document.getElementById('statusTitle').textContent = 'Completing Sign-In...';
        document.getElementById('statusDesc').textContent = 'Opening your Aurora Portal...';

        const result = await getRedirectResult(auth);
        if (result && result.user) {
          const idToken = await result.user.getIdToken(true);
          finishWithToken(idToken, result.user.email);
          return;
        }

        onAuthStateChanged(auth, async (user) => {
          if (user) {
            try {
              const idToken = await user.getIdToken(true);
              finishWithToken(idToken, user.email);
            } catch (err) {
              finishWithError(err.message);
            }
          } else {
            finishWithError('No Google account was selected.');
          }
        });
      } catch (err) {
        finishWithError(err.message);
      }
    }

    run();
  </script>
</body>
</html>`;

      const gzipped = zlib.gzipSync(Buffer.from(relayHtml, 'utf8'));
      const hash = crypto.createHash('sha256').update(gzipped).digest('hex');

      const jwtClient = new google.auth.JWT({
        email: key.client_email,
        key: key.private_key,
        scopes: ['https://www.googleapis.com/auth/cloud-platform', 'https://www.googleapis.com/auth/firebase']
      });
      const { token } = await jwtClient.getAccessToken();
      const headers = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };

      const ver = await fetch(`https://firebasehosting.googleapis.com/v1beta1/sites/${projectId}/versions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          config: { headers: [{ glob: '**', headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }] }
        })
      }).then(r => r.json());

      const pop = await fetch(`https://firebasehosting.googleapis.com/v1beta1/${ver.name}:populateFiles`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ files: { '/auth-relay.html': hash, '/index.html': hash } })
      }).then(r => r.json());

      if (pop.uploadRequiredHashes && pop.uploadRequiredHashes.includes(hash)) {
        await fetch(`${pop.uploadUrl}/${hash}`, {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/octet-stream' },
          body: gzipped
        });
      }

      await fetch(`https://firebasehosting.googleapis.com/v1beta1/${ver.name}?update_mask=status`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ status: 'FINALIZED' })
      });

      const rel = await fetch(`https://firebasehosting.googleapis.com/v1beta1/sites/${projectId}/releases?versionName=${encodeURIComponent(ver.name)}`, {
        method: 'POST',
        headers
      }).then(r => r.json());

      console.log(`[Firebase Hosting] Deployed same-origin auth relay to https://${authDomain}/auth-relay.html`);
      return { success: true, release: rel.name, url: `https://${authDomain}/auth-relay.html` };
    } catch (err) {
      console.warn('[Firebase Hosting Relay Deploy Warning]:', err.message);
      return { success: false, error: err.message };
    }
  }

  /**
   * Deletes a user directly from Firebase Authentication
   */
  async deleteFirebaseUser(email) {
    if (!this.adminApp || !this.hasFullAdminAccess || !email) return;
    try {
      const auth = getAuth(this.adminApp);
      const userRecord = await auth.getUserByEmail(email);
      if (userRecord) {
        await auth.deleteUser(userRecord.uid);
        console.log(`[Firebase Auth Admin] Deleted user from Firebase Auth: ${email}`);
      }
    } catch (err) {
      if (err.code !== 'auth/user-not-found') {
        console.warn('[Firebase Auth Admin deleteFirebaseUser Warning]:', err.message);
      }
    }
  }

  /**
   * Updates custom claims on Firebase Authentication for immediate RBAC synchronization
   */
  async updateUserClaims(email, role, permissions) {
    if (!this.adminApp || !this.hasFullAdminAccess || !email) return;
    try {
      const auth = getAuth(this.adminApp);
      const userRecord = await auth.getUserByEmail(email);
      if (userRecord) {
        await auth.setCustomUserClaims(userRecord.uid, {
          role,
          permissions: permissions || {}
        });
        console.log(`[Firebase Auth Admin] Updated custom claims for: ${email}`);
      }
    } catch (err) {
      console.warn('[Firebase Auth Admin updateUserClaims Warning]:', err.message);
    }
  }

  /**
   * Expires current user password in Firebase, revokes tokens, and generates reset link
   */
  async expireAndGenerateReset(email) {
    if (!this.adminApp || !this.hasFullAdminAccess || !email) {
      return null;
    }

    try {
      const auth = getAuth(this.adminApp);
      const user = await auth.getUserByEmail(email);

      // Invalidate existing password by setting a random secure string
      const randomScramble = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2) + '!A9';
      await auth.updateUser(user.uid, { password: randomScramble });

      // Revoke all existing refresh tokens
      await auth.revokeRefreshTokens(user.uid);

      // Generate the password reset link
      const resetLink = await auth.generatePasswordResetLink(email);
      console.log(`[Firebase Admin] Expired password and generated reset link for: ${email}`);

      return { uid: user.uid, resetLink };
    } catch (err) {
      console.warn('[Firebase Auth Admin expireAndGenerateReset Error]:', err.message);
      return null;
    }
  }

  /**
   * Dispatches a real Welcome Email directly through Google's Firebase Identity Toolkit mail servers
   * containing the staff member's name and default password in the greeting.
   */
  async sendFirebaseWelcomeEmail(email, name, defaultPassword = 'Aurora@2026') {
    if (!this.adminApp || !this.hasFullAdminAccess || !email) return { success: false };
    try {
      const auth = getAuth(this.adminApp);
      const cleanEmail = email.toLowerCase().trim();
      const settings = store.getSettings() || {};
      const apiKey = settings.firebaseApiKey || process.env.FIREBASE_API_KEY || 'AIzaSyBClzWRwScLw4HrhiC8_IbCdTtwcnpcEBs';

      const userRecord = await auth.getUserByEmail(cleanEmail);
      const cleanName = name || userRecord.displayName || 'Team Member';
      const welcomeDisplayName = `${cleanName} — Welcome to Aurora Portal! (Default Password: ${defaultPassword})`;

      // Temporarily set displayName with welcome message & default password so Firebase's %DISPLAY_NAME% template renders it
      await auth.updateUser(userRecord.uid, {
        emailVerified: false,
        displayName: welcomeDisplayName
      });

      const customToken = await auth.createCustomToken(userRecord.uid);
      const signInRes = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: customToken, returnSecureToken: true })
      }).then(r => r.json());

      let dispatched = false;
      if (signInRes && signInRes.idToken) {
        const oobRes = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            requestType: 'VERIFY_EMAIL',
            idToken: signInRes.idToken
          })
        }).then(r => r.json());

        if (oobRes && oobRes.email) {
          dispatched = true;
          console.log(`[Firebase Auth Mailer] Dispatched real welcome email with default password to: ${cleanEmail}`);
        }
      }

      // Restore clean displayName and verified status
      await auth.updateUser(userRecord.uid, {
        displayName: cleanName,
        emailVerified: true
      });

      return { success: dispatched, email: cleanEmail };
    } catch (err) {
      console.warn('[Firebase Auth sendFirebaseWelcomeEmail Warning]:', err.message);
      return { success: false, error: err.message };
    }
  }

  /**
   * Dispatches a password reset email to employee and revokes all active sessions in Firebase
   */
  async revokeAndSendPasswordReset(email) {
    if (!email) throw new Error('Email address is required');
    const cleanEmail = email.toLowerCase().trim();
    let resetLink = null;
    let uid = null;

    if (this.adminApp && this.hasFullAdminAccess) {
      try {
        const auth = getAuth(this.adminApp);
        const userRecord = await auth.getUserByEmail(cleanEmail);
        uid = userRecord.uid;

        // Revoke all existing sessions and refresh tokens in Firebase
        await auth.revokeRefreshTokens(uid);
        console.log(`[Firebase Admin] Revoked all active sessions for: ${cleanEmail}`);

        // Generate password reset link
        resetLink = await auth.generatePasswordResetLink(cleanEmail);
      } catch (adminErr) {
        console.warn('[Firebase Admin revokeAndSendPasswordReset Notice]:', adminErr.message);
      }
    }

    // Dispatch real password reset email via Google Identity Toolkit
    const settings = store.getSettings() || {};
    const apiKey = settings.firebaseApiKey || process.env.FIREBASE_API_KEY || 'AIzaSyBClzWRwScLw4HrhiC8_IbCdTtwcnpcEBs';
    try {
      const fbResp = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestType: 'PASSWORD_RESET',
          email: cleanEmail
        })
      });
      const fbData = await fbResp.json();
      if (fbData.email) {
        console.log(`[Firebase Auth] Dispatched password reset email to: ${cleanEmail}`);
      }
    } catch (fbErr) {
      console.warn('[Firebase Identity Toolkit sendOobCode Error]:', fbErr.message);
    }

    return { success: true, uid, resetLink };
  }

  getStatus() {
    const settings = store.getSettings() || {};
    const hasConfig = Boolean(
      settings.firebaseApiKey ||
      settings.firebaseProjectId ||
      process.env.FIREBASE_PROJECT_ID
    );

    return {
      initialized: this.isInitialized,
      configured: hasConfig,
      hasFullAdminAccess: Boolean(this.hasFullAdminAccess),
      projectId: this.projectId || settings.firebaseProjectId || process.env.FIREBASE_PROJECT_ID || 'Not set',
      apiKey: settings.firebaseApiKey ? `${settings.firebaseApiKey.slice(0, 8)}...` : 'Not set',
      authDomain: settings.firebaseAuthDomain || 'Not set'
    };
  }

  /**
   * Verifies a Firebase ID token sent from the client
   */
  async verifyToken(idToken) {
    if (!idToken) throw new Error('No Firebase ID token provided');

    // 1. Try firebase-admin if initialized with service credentials
    if (this.isInitialized && this.adminApp) {
      try {
        const decoded = await getAuth(this.adminApp).verifyIdToken(idToken);
        return {
          uid: decoded.uid,
          email: decoded.email,
          emailVerified: decoded.email_verified,
          name: decoded.name || decoded.displayName,
          picture: decoded.picture
        };
      } catch (adminErr) {
        console.warn('[Firebase Admin Token Verify failed, trying REST fallback]:', adminErr.message);
      }
    }

    // 2. High-availability REST fallback via Google Identity Toolkit
    const settings = store.getSettings() || {};
    const apiKey = settings.firebaseApiKey || process.env.FIREBASE_API_KEY;

    if (apiKey) {
      try {
        const resp = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idToken })
        });

        const data = await resp.json();
        if (data.users && data.users.length > 0) {
          const u = data.users[0];
          return {
            uid: u.localId,
            email: u.email,
            emailVerified: u.emailVerified,
            name: u.displayName,
            picture: u.photoUrl
          };
        } else {
          throw new Error(data.error?.message || 'Invalid Firebase ID token');
        }
      } catch (restErr) {
        throw new Error('Firebase token verification failed: ' + restErr.message);
      }
    }

    throw new Error('Firebase Auth is not yet configured with an API Key or Service Account.');
  }

  /**
   * Matches verified Firebase user with MongoDB Atlas / Local Store user
   */
  async authenticateUser(firebaseUser) {
    const email = firebaseUser.email?.toLowerCase();
    if (!email) throw new Error('Firebase user account does not have an email address.');

    // Find in MongoDB or fallback store
    let user = null;
    try {
      user = await UserModel.findOne({ email }).lean();
    } catch {
      // Fallback
    }

    if (!user) {
      user = store.getUserByEmail(email);
    }

    if (!user) {
      throw new Error(`The email "${email}" is not authorized for staff access. Please contact your Aurora Super Admin.`);
    }

    // Update login timestamp and firebase UID
    try {
      await UserModel.findOneAndUpdate(
        { email },
        {
          $set: {
            firebaseUid: firebaseUser.uid,
            lastLoginAt: new Date(),
            photo: user.photo || firebaseUser.picture || ''
          }
        }
      );
    } catch {}

    store.logActivity("Firebase Auth Login", user.email, {
      role: user.role,
      firebaseUid: firebaseUser.uid
    });

    const { password: _, ...safeUser } = user;
    return safeUser;
  }
}

export const firebaseAuthService = new FirebaseAuthService();
