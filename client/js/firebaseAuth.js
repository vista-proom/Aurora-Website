/**
 * AURORA GROUP — FIREBASE CLIENT AUTHENTICATION MODULE
 * Initializes Firebase Web SDK dynamically and provides Email/Password
 * and Google OAuth Single Sign-On (SSO).
 */

import * as api from './api.js';

let firebaseAuthInstance = null;
let googleProviderInstance = null;
let authModule = null;
let isInitialized = false;
let currentConfig = null;

export async function initFirebaseClient() {
  if (isInitialized && firebaseAuthInstance && authModule) {
    return { success: true, auth: firebaseAuthInstance, authModule };
  }

  try {
    const sRes = await api.fetchSettings();
    const settings = sRes?.data || {};

    // Check if Firebase Web Config is present
    const apiKey = settings.firebaseApiKey || window.AURORA_FIREBASE_API_KEY;
    const projectId = settings.firebaseProjectId || window.AURORA_FIREBASE_PROJECT_ID;
    const authDomain = settings.firebaseAuthDomain || (projectId ? `${projectId}.firebaseapp.com` : null);

    if (!apiKey || !projectId) {
      console.log('[Firebase Client] Firebase Web Config not yet configured in Super Admin settings.');
      return { success: false, reason: 'unconfigured' };
    }

    currentConfig = {
      apiKey,
      authDomain,
      projectId,
      storageBucket: settings.firebaseStorageBucket || `${projectId}.appspot.com`,
      messagingSenderId: settings.firebaseMessagingSenderId || '',
      appId: settings.firebaseAppId || ''
    };

    // Load Firebase Web Modular SDK from Google CDN
    const { initializeApp, getApps } = await import('https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js');
    authModule = await import('https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js');
    const { getAuth, GoogleAuthProvider } = authModule;

    const app = getApps().length === 0 ? initializeApp(currentConfig) : getApps()[0];
    firebaseAuthInstance = getAuth(app);
    googleProviderInstance = new GoogleAuthProvider();
    googleProviderInstance.addScope('email');
    googleProviderInstance.addScope('profile');
    googleProviderInstance.setCustomParameters({ prompt: 'select_account' });

    isInitialized = true;
    console.log('[Firebase Client] Firebase Web Auth SDK initialized successfully for project:', projectId);
    return { success: true, auth: firebaseAuthInstance, authModule };
  } catch (err) {
    console.warn('[Firebase Client Init Error]:', err.message);
    return { success: false, error: err.message };
  }
}

export function isFirebaseReady() {
  return isInitialized && Boolean(firebaseAuthInstance) && Boolean(authModule);
}

export function getFirebaseConfig() {
  return currentConfig;
}

export function getCurrentFirebaseUser() {
  return firebaseAuthInstance ? firebaseAuthInstance.currentUser : null;
}

/**
 * Sign in using Firebase Email & Password
 */
export async function firebaseSignIn(email, password) {
  if (!isInitialized || !firebaseAuthInstance || !authModule) {
    const initRes = await initFirebaseClient();
    if (!initRes.success || !firebaseAuthInstance || !authModule) {
      throw new Error('Firebase Auth is not yet configured. Please configure it in Super Admin Settings.');
    }
  }

  const { signInWithEmailAndPassword } = authModule;
  const userCredential = await signInWithEmailAndPassword(firebaseAuthInstance, email, password);
  const idToken = await userCredential.user.getIdToken(true);

  return {
    user: userCredential.user,
    idToken
  };
}

/**
 * Sign in using Google OAuth In-Tab Redirect (No Popup Window)
 */
export async function firebaseGoogleSignIn() {
  if (!isInitialized || !firebaseAuthInstance || !authModule) {
    const initRes = await initFirebaseClient();
    if (!initRes.success || !firebaseAuthInstance || !authModule) {
      throw new Error('Firebase Auth is not yet configured. Please configure it in Super Admin Settings.');
    }
  }

  const authDomain = currentConfig?.authDomain || (currentConfig?.projectId ? `${currentConfig.projectId}.firebaseapp.com` : 'aurora-group-ae765.firebaseapp.com');
  const returnTo = `${window.location.origin}/login`;
  const relayUrl = `https://${authDomain}/auth-relay.html?start=1&returnTo=${encodeURIComponent(returnTo)}`;

  // Forward in the current tab without opening any secondary popup window
  window.location.href = relayUrl;
  return null;
}

/**
 * Listen for Firebase Auth state changes (automatic trigger upon Google login)
 */
export async function setupAuthStateListener(onUserAuthenticated) {
  if (!isInitialized || !firebaseAuthInstance || !authModule) {
    const initRes = await initFirebaseClient();
    if (!initRes.success || !firebaseAuthInstance || !authModule) return;
  }

  try {
    const { onAuthStateChanged } = authModule;
    onAuthStateChanged(firebaseAuthInstance, async (user) => {
      if (user && user.email) {
        console.log('[Firebase Auth State Change] Logged in account detected:', user.email);
        try {
          const idToken = await user.getIdToken();
          if (typeof onUserAuthenticated === 'function') {
            await onUserAuthenticated(user, idToken);
          }
        } catch (e) {
          console.warn('[Firebase Auth State Change] Token fetch error:', e.message);
        }
      }
    });
  } catch (err) {
    console.warn('[Firebase Auth setupAuthStateListener Warning]:', err.message);
  }
}

/**
 * Checks for a Google Redirect Sign-In result on page load
 */
export async function checkRedirectAuth() {
  if (!isInitialized || !firebaseAuthInstance || !authModule) {
    const initRes = await initFirebaseClient();
    if (!initRes.success || !firebaseAuthInstance || !authModule) return null;
  }

  try {
    const { getRedirectResult } = authModule;
    const result = await getRedirectResult(firebaseAuthInstance);
    if (result && result.user) {
      const idToken = await result.user.getIdToken(true);
      return { user: result.user, idToken };
    }
  } catch (e) {
    console.warn('[Firebase Auth] Redirect result error:', e.message);
  }
  return null;
}

/**
 * Sign out of Firebase session
 */
export async function firebaseSignOut() {
  if (firebaseAuthInstance && authModule) {
    try {
      const { signOut } = authModule;
      await signOut(firebaseAuthInstance);
    } catch (e) {
      // Non-fatal
    }
  }
}

/**
 * Dispatch Firebase Password Reset Email
 */
export async function firebaseSendPasswordResetEmail(email) {
  if (!isInitialized || !firebaseAuthInstance || !authModule) {
    const initRes = await initFirebaseClient();
    if (!initRes.success || !firebaseAuthInstance || !authModule) {
      throw new Error('Firebase Auth is not yet configured.');
    }
  }
  const { sendPasswordResetEmail } = authModule;
  return await sendPasswordResetEmail(firebaseAuthInstance, email);
}
