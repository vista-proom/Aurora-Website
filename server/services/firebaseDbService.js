/**
 * AURORA GROUP — FIREBASE REALTIME DATABASE SERVICE
 * 100% Free, Cloud-Hosted, Zero-Open-Ports Database for Aurora Group.
 * Handles Portfolio Projects, Team Profiles & Bios, CMS Site Content,
 * CRM Inquiries, and Discovery Briefs with automatic cloud sync.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATABASE_URL = 'https://aurora-group-ae765-default-rtdb.europe-west1.firebasedatabase.app';

class FirebaseDbService {
  constructor() {
    this.db = null;
    this.isConnected = false;
    this.app = null;
    this.databaseUrl = DATABASE_URL;
    this.init();
  }

  async init() {
    try {
      let serviceAccount = null;
      if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
        try {
          serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
          console.log('[Firebase DB] Loaded Service Account from FIREBASE_SERVICE_ACCOUNT_JSON env var.');
        } catch (e) {
          console.warn('[Firebase DB] Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON:', e.message);
        }
      }

      if (!serviceAccount) {
        const keyPath = path.join(__dirname, '../serviceAccountKey.json');
        if (!fs.existsSync(keyPath)) {
          console.warn('[Firebase DB] serviceAccountKey.json not found. Operating in local mode.');
          return;
        }
        serviceAccount = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
      }

      // Check for existing app or initialize dedicated DB app
      const appName = 'aurora-firebase-db';
      const existing = getApps().find(a => a.name === appName);
      if (existing) {
        this.app = existing;
      } else {
        this.app = initializeApp({
          credential: cert(serviceAccount),
          databaseURL: DATABASE_URL
        }, appName);
      }

      this.db = getDatabase(this.app);
      this.isConnected = true;
      console.log(`[Firebase DB] Connected to Firebase Realtime Database (${DATABASE_URL})`);
    } catch (err) {
      this.isConnected = false;
      console.warn('[Firebase DB Init Warning]:', err.message);
    }
  }

  getStatus() {
    return {
      connected: this.isConnected,
      provider: 'Firebase Realtime Database (100% Free Spark Tier)',
      region: 'europe-west1',
      databaseUrl: this.databaseUrl,
      dialect: 'Firebase Cloud Realtime Database (Zero Open Ports)',
      closed: false
    };
  }

  // ---------------------------------------------------------------------------
  // REAL-TIME SYNC METHODS
  // ---------------------------------------------------------------------------

  async fetchBriefs() {
    if (!this.isConnected || !this.db) {
      await this.init();
    }
    if (!this.isConnected || !this.db) return null;
    try {
      const snap = await this.db.ref('briefs').once('value');
      const val = snap.val();
      if (!val) return null;
      const arr = Array.isArray(val) ? val.filter(Boolean) : Object.values(val);
      return arr.length ? arr : null;
    } catch (e) {
      console.warn('[Firebase DB Fetch Briefs Error]:', e.message);
      return null;
    }
  }

  async syncBriefs(briefs) {
    if (!this.isConnected || !this.db) {
      await this.init();
    }
    if (!this.isConnected || !this.db) return;
    try {
      const map = {};
      (briefs || []).forEach(b => {
        if (b && b.token) map[b.token] = b;
      });
      await this.db.ref('briefs').set(map);
    } catch (e) {
      console.warn('[Firebase DB Sync Briefs Error]:', e.message);
    }
  }

  async syncProjects(projects) {
    if (!this.isConnected || !this.db) {
      await this.init();
    }
    if (!this.isConnected || !this.db) return;
    try {
      await this.db.ref('projects').set(projects);
    } catch (e) {
      console.warn('[Firebase DB Sync Projects Error]:', e.message);
    }
  }

  async fetchProjects() {
    if (!this.isConnected || !this.db) {
      await this.init();
    }
    if (!this.isConnected || !this.db) return null;
    try {
      const snap = await this.db.ref('projects').once('value');
      const val = snap.val();
      if (!val) return null;
      const arr = Array.isArray(val) ? val.filter(Boolean) : Object.values(val);
      return arr.length ? arr : null;
    } catch (e) {
      console.warn('[Firebase DB Fetch Projects Error]:', e.message);
      return null;
    }
  }

  async syncProject(project) {
    if (!this.isConnected || !this.db || !project) return;
    try {
      await this.db.ref(`projects/${project.id || project.slug}`).set(project);
    } catch (e) {
      console.warn('[Firebase DB Sync Project Error]:', e.message);
    }
  }

  async syncUsers(users) {
    if (!this.isConnected || !this.db) return;
    try {
      const safe = (users || []).map(u => {
        const { password, ...s } = u;
        return s;
      });
      await this.db.ref('users').set(safe);
      console.log(`[Firebase DB] Synced ${safe.length} staff user(s) to Realtime Database.`);
    } catch (e) {
      console.warn('[Firebase DB Sync Users Error]:', e.message);
    }
  }

  async syncUserProfile(user, allUsers = null) {
    if (!this.isConnected || !this.db) return;
    try {
      if (Array.isArray(allUsers)) {
        await this.syncUsers(allUsers);
        return;
      }
      if (!user) return;
      const { password, ...safe } = user;
      await this.db.ref(`users_by_id/${user.id || user.slug}`).set(safe);
    } catch (e) {
      console.warn('[Firebase DB Sync User Error]:', e.message);
    }
  }

  async resetAndReconnectSync(store) {
    try {
      await this.init();
      if (!this.isConnected || !this.db || !store) return { success: false };

      // Clear stale users and users_by_id nodes completely before pushing clean state
      await this.db.ref('users').remove();
      await this.db.ref('users_by_id').remove();

      await this.syncUsers(store.getUsers());
      await this.syncProjects(store.getProjects('all'));
      await this.syncServices(store.getServices());
      if (typeof store.getSiteContent === 'function') {
        await this.syncSiteContent(store.getSiteContent());
      }
      console.log('[Firebase DB] Full database sync reset and reconnected successfully.');
      return { success: true };
    } catch (e) {
      console.warn('[Firebase DB Reset & Reconnect Error]:', e.message);
      return { success: false, error: e.message };
    }
  }

  async syncServices(services) {
    if (!this.isConnected || !this.db) return;
    try {
      await this.db.ref('services').set(services);
    } catch (e) {
      console.warn('[Firebase DB Sync Services Error]:', e.message);
    }
  }

  async syncSiteContent(content) {
    if (!this.isConnected || !this.db) return;
    try {
      await this.db.ref('site_content').set(content);
    } catch (e) {
      console.warn('[Firebase DB Sync Content Error]:', e.message);
    }
  }

  async syncInquiry(inquiry) {
    if (!this.isConnected || !this.db || !inquiry) return;
    try {
      await this.db.ref(`inquiries/${inquiry.id}`).set(inquiry);
    } catch (e) {
      console.warn('[Firebase DB Sync Inquiry Error]:', e.message);
    }
  }

  async syncBrief(brief) {
    if (!this.isConnected || !this.db || !brief) return;
    try {
      await this.db.ref(`briefs/${brief.token}`).set(brief);
    } catch (e) {
      console.warn('[Firebase DB Sync Brief Error]:', e.message);
    }
  }

  async syncActivityLog(log) {
    if (!this.isConnected || !this.db || !log) return;
    try {
      await this.db.ref('activity_logs').push(log);
    } catch (e) {
      console.warn('[Firebase DB Sync Log Error]:', e.message);
    }
  }
}

export const firebaseDbService = new FirebaseDbService();
