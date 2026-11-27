/**
 * AURORA GROUP — DATABASE CONNECTION & HYBRID PERSISTENCE SERVICE
 * Connects Mongoose to MongoDB Atlas with seamless automatic fallback to persistent JSON dataStore.
 * Ensures the platform is always available with 100% uptime.
 */

import dns from 'dns';
import mongoose from 'mongoose';
import { store } from '../models/dataStore.js';
import {
  UserModel,
  BriefModel,
  InquiryModel,
  ProjectModel,
  SettingsModel,
  SiteContentModel
} from '../models/mongooseModels.js';

// Use Google & Cloudflare DNS to resolve Atlas SRV records reliably across all Egyptian ISPs and home routers
try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch (e) {
  // Non-fatal
}

class DatabaseService {
  constructor() {
    this.isConnected = false;
    this.currentUri = null;
    this.connectionError = null;
    this.dialect = 'JSON DataStore (Local Offline)';
  }

  cleanUri(raw) {
    if (!raw) return '';
    let uri = String(raw).trim();
    // Strip variable name or quotes if user copied from .env file
    uri = uri.replace(/^MONGODB_URI\s*=\s*/i, '');
    uri = uri.replace(/^["']|["']$/g, '').trim();

    // If srv uri does not have a database name path, append /aurora?retryWrites=true&w=majority
    if (uri.startsWith('mongodb+srv://') && !uri.includes('?')) {
      const parts = uri.split('/');
      if (parts.length === 3) {
        uri = `${uri}/aurora?retryWrites=true&w=majority`;
      }
    }
    return uri;
  }

  async init() {
    const settings = store.getSettings() || {};
    const raw = process.env.MONGODB_URI || settings.mongodbUri || '';
    if (!raw) {
      this.isConnected = false;
      this.currentUri = '';
      this.dialect = 'Secure Local DataStore (Remote Entry Point Closed)';
      console.log('[Database Service] External MongoDB disabled. Running securely on Isolated Local DataStore.');
      return { success: true, connected: false, dialect: this.dialect, closed: true };
    }
    const uri = this.cleanUri(raw);
    return await this.connect(uri, false);
  }

  async disconnect() {
    try {
      if (mongoose.connection.readyState !== 0) {
        await mongoose.disconnect();
      }
    } catch (e) {}
    this.isConnected = false;
    this.currentUri = '';
    this.dialect = 'Secure Local DataStore (Remote Entry Point Closed)';
    console.log('[Database Service] Remote database disconnected. External entry point closed.');
    return { success: true, connected: false, dialect: this.dialect, closed: true };
  }

  async connect(rawUri, logVerbose = true) {
    const uri = this.cleanUri(rawUri);
    if (!uri) return { success: false, error: 'No MongoDB URI provided' };

    try {
      this.currentUri = uri;

      if (mongoose.connection.readyState === 1 || mongoose.connection.readyState === 2) {
        await mongoose.disconnect();
      }

      await mongoose.connect(uri, {
        serverSelectionTimeoutMS: 8000,
        connectTimeoutMS: 8000,
        maxPoolSize: 10,
        minPoolSize: 2,
        socketTimeoutMS: 45000
      });

      this.isConnected = true;
      this.connectionError = null;
      console.log(`[MongoDB] Connected successfully to database: ${mongoose.connection.name || 'aurora'}`);

      // Strip all credential/password info from MongoDB so Firebase handles auth exclusively
      try {
        await UserModel.updateMany({}, { $unset: { password: 1, mustResetPassword: 1, passwordExpiredAt: 1 } });
      } catch (cleanErr) {
        // Non-fatal
      }

      // Seed initial data from JSON store if collections are empty
      await this.seedIfEmpty();

      return {
        success: true,
        connected: true,
        databaseName: mongoose.connection.name,
        dialect: this.dialect
      };
    } catch (err) {
      this.isConnected = false;
      this.connectionError = err.message;
      this.dialect = 'JSON DataStore (MongoDB Offline / Not Reachable)';
      if (logVerbose) {
        console.warn(`[MongoDB Warning] Could not connect: ${err.message}`);
        console.log(`[Database Fallback] Aurora Platform is running stably with Persistent File DataStore.`);
      }
      return {
        success: false,
        connected: false,
        error: err.message,
        dialect: this.dialect
      };
    }
  }

  getStatus() {
    return {
      connected: this.isConnected,
      dialect: this.dialect,
      databaseName: this.isConnected ? mongoose.connection.name : 'aurora-file-db',
      uri: this.isConnected ? (this.currentUri ? this.currentUri.replace(/:([^:@]{3,})@/, ':****@') : '') : 'None (Remote Access Closed)',
      error: this.connectionError,
      closed: !this.isConnected
    };
  }

  /**
   * Seeds default users and records into MongoDB from dataStore if Mongo collections are empty
   */
  async seedIfEmpty() {
    if (!this.isConnected) return;
    try {
      // 1. Users
      const userCount = await UserModel.countDocuments();
      if (userCount === 0) {
        const fileUsers = store.getUsers();
        for (const u of fileUsers) {
          try {
            await UserModel.findOneAndUpdate({ email: u.email.toLowerCase() }, u, { upsert: true });
          } catch (e) {}
        }
        console.log(`[MongoDB Seed] Seeded users into MongoDB`);
      }

      // 2. Projects
      const projectCount = await ProjectModel.countDocuments();
      if (projectCount === 0) {
        const fileProjects = store.getProjects();
        for (const p of fileProjects) {
          try {
            await ProjectModel.findOneAndUpdate({ id: p.id }, p, { upsert: true });
          } catch (e) {}
        }
        console.log(`[MongoDB Seed] Seeded portfolio projects into MongoDB`);
      }

      // 3. Settings
      const settingsCount = await SettingsModel.countDocuments();
      if (settingsCount === 0) {
        const fileSettings = store.getSettings();
        if (fileSettings) {
          await SettingsModel.create(fileSettings);
          console.log(`[MongoDB Seed] Seeded agency settings into MongoDB`);
        }
      }
    } catch (err) {
      console.warn('[MongoDB Seed Warning]:', err.message);
    }
  }

  /**
   * Syncs new user or login query to MongoDB if available
   */
  async syncUserLogin(email) {
    if (!this.isConnected) return;
    try {
      await UserModel.findOneAndUpdate(
        { email: email.toLowerCase() },
        { $set: { lastLoginAt: new Date() } }
      );
    } catch (e) {
      // Non-fatal
    }
  }

  /**
   * Syncs brief to MongoDB if connected
   */
  async syncBrief(brief) {
    if (!this.isConnected) return;
    try {
      await BriefModel.findOneAndUpdate(
        { token: brief.token },
        brief,
        { upsert: true, new: true }
      );
    } catch (e) {
      console.warn('[MongoDB Sync Brief Error]:', e.message);
    }
  }

  /**
   * Syncs inquiry to MongoDB if connected
   */
  async syncInquiry(inquiry) {
    if (!this.isConnected) return;
    try {
      await InquiryModel.findOneAndUpdate(
        { id: inquiry.id },
        inquiry,
        { upsert: true, new: true }
      );
    } catch (e) {
      console.warn('[MongoDB Sync Inquiry Error]:', e.message);
    }
  }
}

export const dbService = new DatabaseService();
