/**
 * AURORA GROUP — GOOGLE SHEETS SYNC SERVICE
 * Dual-writes client inquiries and brief responses to Google Sheets.
 * Supports:
 * 1. Google Apps Script Webhook (Zero-GCP, instant setup via 10-line Apps Script)
 * 2. Google Sheets API v4 (Service Account JWT)
 * 3. Local persistent sync queue & CSV exporter fallback
 */

import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { store } from '../models/dataStore.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const QUEUE_FILE = path.join(__dirname, '../data/sheet_sync_queue.json');

export class GoogleSheetsService {
  constructor() {
    this.ensureQueueFile();
  }

  ensureQueueFile() {
    if (!fs.existsSync(QUEUE_FILE)) {
      fs.writeFileSync(QUEUE_FILE, JSON.stringify([], null, 2), 'utf8');
    }
  }

  getQueue() {
    try {
      this.ensureQueueFile();
      return JSON.parse(fs.readFileSync(QUEUE_FILE, 'utf8') || '[]');
    } catch {
      return [];
    }
  }

  saveQueue(queue) {
    try {
      fs.writeFileSync(QUEUE_FILE, JSON.stringify(queue, null, 2), 'utf8');
    } catch (err) {
      console.error('[GoogleSheets] Failed to save queue:', err.message);
    }
  }

  addToQueue(type, record, row) {
    const queue = this.getQueue();
    const entry = {
      id: `${type}_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      type,
      timestamp: new Date().toISOString(),
      record,
      row,
      status: 'pending',
      lastAttempt: null,
      error: null
    };
    queue.push(entry);
    this.saveQueue(queue);
    return entry;
  }

  markQueueEntry(id, status, error = null) {
    const queue = this.getQueue();
    const item = queue.find(q => q.id === id);
    if (item) {
      item.status = status;
      item.lastAttempt = new Date().toISOString();
      item.error = error;
      this.saveQueue(queue);
    }
  }

  /**
   * Resolves current spreadsheet configuration from settings & environment
   */
  getConfig() {
    const settings = store.getSettings() || {};
    const sheetUrl = settings.googleSheetsUrl || process.env.GOOGLE_SHEETS_URL || '';
    const webhookUrl = settings.googleSheetsWebhookUrl || process.env.GOOGLE_SHEETS_WEBHOOK_URL || '';

    // Extract spreadsheet ID from sheet URL (e.g. /spreadsheets/d/1vr1QTpFCI9KxtTcsszrVAKZoo0CvWHK4KWU_843Rvi4/...)
    let sheetId = settings.googleSheetsId || process.env.GOOGLE_SHEETS_ID || '';
    if (!sheetId && sheetUrl) {
      const match = sheetUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
      if (match) sheetId = match[1];
    }

    const clientEmail = settings.googleClientEmail || process.env.GOOGLE_CLIENT_EMAIL || '';
    const privateKey = (settings.googlePrivateKey || process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');

    const hasWebhook = Boolean(webhookUrl && webhookUrl.startsWith('http'));
    const hasServiceAccount = Boolean(sheetId && clientEmail && privateKey);

    return {
      sheetUrl,
      sheetId,
      webhookUrl,
      clientEmail,
      privateKey,
      hasWebhook,
      hasServiceAccount,
      isConfigured: hasWebhook || hasServiceAccount
    };
  }

  async getAuthClient(config) {
    if (!config.hasServiceAccount) return null;
    try {
      const auth = new google.auth.JWT({
        email: config.clientEmail,
        key: config.privateKey,
        scopes: ['https://www.googleapis.com/auth/spreadsheets']
      });
      return auth;
    } catch (err) {
      console.warn('[GoogleSheets] Service account auth error:', err.message);
      return null;
    }
  }

  /**
   * Appends an inquiry to Google Sheet
   */
  async appendInquiry(inquiry) {
    const row = [
      new Date().toISOString(),
      inquiry.fullName || '',
      inquiry.brandName || '',
      inquiry.phone || '',
      inquiry.email || '',
      Array.isArray(inquiry.services) ? inquiry.services.join(', ') : (inquiry.services || ''),
      inquiry.industry || '',
      inquiry.budget || '',
      inquiry.message || ''
    ];

    const queueItem = this.addToQueue('inquiry', inquiry, row);
    const config = this.getConfig();

    if (!config.isConfigured) {
      console.log('[GoogleSheets Queue] Inquiry queued locally (Google Sheet webhook/credentials pending):', inquiry.fullName, inquiry.brandName);
      return { success: true, queued: true, message: 'Inquiry saved locally and queued for Google Sheet sync' };
    }

    return await this.syncRow(queueItem.id, 'inquiry', 'Contact Inquiries', row, config, inquiry);
  }

  /**
   * Appends a full KYC brief to Google Sheet with all 6 steps
   */
  async appendBrief(brief) {
    const d = brief.data || {};
    const row = [
      new Date().toISOString(),
      brief.token || '',
      d.fullName || brief.clientName || '',
      d.role || '',
      d.brandName || brief.brandName || '',
      d.phone || '',
      d.email || '',
      d.budget || '',
      d.businessModel || '',
      d.yearsInOperation || '',
      d.branches || '',
      d.differentiator || '',
      d.primaryGoals || '',
      d.kpis || '',
      d.digitalAssetsLinks || '',
      d.assetsReady || '',
      d.driveLink || '',
      d.competitors || d.briefTasteLikes || '',
      d.visualTasteDislikes || '',
      d.meetVenue || 'Sharks Office Space',
      d.meetingDatePreference || '',
      d.meetingAttendees || '',
      brief.status || 'submitted'
    ];

    const queueItem = this.addToQueue('brief', brief, row);
    const config = this.getConfig();

    if (!config.isConfigured) {
      console.log('[GoogleSheets Queue] Brief queued locally (Google Sheet webhook/credentials pending):', brief.token, brief.clientName);
      return { success: true, queued: true, message: 'Brief saved locally and queued for Google Sheet sync' };
    }

    return await this.syncRow(queueItem.id, 'brief', 'Briefs', row, config, brief);
  }

  /**
   * Executes sync via Webhook or Service Account
   */
  async syncRow(queueId, type, sheetName, row, config, rawPayload = {}) {
    // 1. Try Google Apps Script Webhook first (simplest, zero-config)
    if (config.hasWebhook) {
      try {
        const resp = await fetch(config.webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'appendRow',
            type,
            sheet: sheetName,
            row,
            data: rawPayload,
            sheetId: config.sheetId
          })
        });

        const text = await resp.text();
        let jsonRes;
        try { jsonRes = JSON.parse(text); } catch { jsonRes = { text }; }

        if (resp.ok) {
          this.markQueueEntry(queueId, 'synced');
          console.log(`[GoogleSheets Webhook] Successfully synced ${type} to Google Sheet via Webhook`);
          return { success: true, method: 'webhook', result: jsonRes };
        } else {
          throw new Error(`Webhook returned status ${resp.status}: ${text}`);
        }
      } catch (err) {
        console.warn(`[GoogleSheets Webhook Error] Failed to sync ${type}:`, err.message);
        this.markQueueEntry(queueId, 'error', err.message);
        // Fall through to try service account if configured
      }
    }

    // 2. Try Google Sheets API v4 with Service Account
    if (config.hasServiceAccount) {
      try {
        const auth = await this.getAuthClient(config);
        const sheets = google.sheets({ version: 'v4', auth });
        await sheets.spreadsheets.values.append({
          spreadsheetId: config.sheetId,
          range: `${sheetName}!A:Z`,
          valueInputOption: 'USER_ENTERED',
          requestBody: { values: [row] }
        });
        this.markQueueEntry(queueId, 'synced');
        console.log(`[GoogleSheets API] Successfully synced ${type} to Google Sheet via v4 API`);
        return { success: true, method: 'api' };
      } catch (err) {
        console.error(`[GoogleSheets API Error] Append ${type} error:`, err.message);
        this.markQueueEntry(queueId, 'error', err.message);
        return { success: false, error: err.message };
      }
    }

    return { success: false, error: 'Google Sheet webhook or service account is not yet active.' };
  }

  /**
   * Syncs all pending or error items from queue
   */
  async syncAllPending() {
    const queue = this.getQueue();
    const pending = queue.filter(q => q.status === 'pending' || q.status === 'error');
    const config = this.getConfig();

    if (!config.isConfigured) {
      return { success: false, error: 'Google Sheets sync is not configured yet. Add your Webhook URL or API credentials in Settings.' };
    }

    let syncedCount = 0;
    const errors = [];

    for (const item of pending) {
      const sheetName = item.type === 'inquiry' ? 'Contact Inquiries' : 'Briefs';
      const res = await this.syncRow(item.id, item.type, sheetName, item.row, config, item.record);
      if (res.success) {
        syncedCount++;
      } else {
        errors.push(`${item.type} (${item.id}): ${res.error}`);
      }
    }

    return {
      success: errors.length === 0,
      totalPending: pending.length,
      syncedCount,
      errors
    };
  }

  /**
   * Test connection to Google Sheet
   */
  async testConnection() {
    const config = this.getConfig();

    if (!config.sheetUrl && !config.sheetId && !config.webhookUrl) {
      return {
        configured: false,
        message: 'No Google Sheet URL or Webhook configured in Super Admin Settings.'
      };
    }

    if (config.hasWebhook) {
      try {
        const testPayload = {
          action: 'ping',
          timestamp: new Date().toISOString(),
          test: true
        };
        const resp = await fetch(config.webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(testPayload)
        });
        const text = await resp.text();
        return {
          configured: true,
          method: 'webhook',
          status: resp.ok ? 'connected' : 'webhook_error',
          httpStatus: resp.status,
          response: text.slice(0, 300),
          sheetId: config.sheetId,
          sheetUrl: config.sheetUrl
        };
      } catch (err) {
        return {
          configured: true,
          method: 'webhook',
          status: 'error',
          error: err.message,
          sheetId: config.sheetId,
          sheetUrl: config.sheetUrl
        };
      }
    }

    if (config.hasServiceAccount) {
      try {
        const auth = await this.getAuthClient(config);
        const sheets = google.sheets({ version: 'v4', auth });
        const meta = await sheets.spreadsheets.get({ spreadsheetId: config.sheetId });
        return {
          configured: true,
          method: 'api',
          status: 'connected',
          title: meta.data.properties?.title,
          sheets: meta.data.sheets?.map(s => s.properties?.title)
        };
      } catch (err) {
        return {
          configured: true,
          method: 'api',
          status: 'error',
          error: err.message,
          sheetId: config.sheetId
        };
      }
    }

    // When only URL is provided without Webhook or Service Account
    return {
      configured: true,
      method: 'url_only',
      status: 'needs_webhook_or_service_account',
      sheetId: config.sheetId,
      sheetUrl: config.sheetUrl,
      message: 'Google Sheet link detected! To allow writing data, either paste a Google Apps Script Webhook URL (recommended) or Service Account credentials.'
    };
  }

  /**
   * Exports briefs as CSV string
   */
  exportBriefsCSV() {
    const briefs = store.getBriefs();
    const headers = [
      'Token', 'Submission Date', 'Status', 'Full Name', 'Role', 'Brand Name',
      'Phone', 'Email', 'Monthly Budget', 'Products/Business Model',
      'Years in Operation', 'Branches', 'Differentiator', '6-Month Goal',
      'KPIs', 'Social Links', 'Assets Readiness', 'Google Drive Link',
      'Admired Brands', 'Taste Dislikes', 'Meeting Venue', 'Meeting Date Preference', 'Meeting Attendees'
    ];

    const rows = briefs.map(b => {
      const d = b.data || {};
      return [
        b.token,
        b.submittedAt || b.createdAt || '',
        b.status,
        d.fullName || b.clientName || '',
        d.role || '',
        d.brandName || b.brandName || '',
        d.phone || '',
        d.email || '',
        d.budget || '',
        d.businessModel || '',
        d.yearsInOperation || '',
        d.branches || '',
        d.differentiator || '',
        d.primaryGoals || '',
        d.kpis || '',
        d.digitalAssetsLinks || '',
        d.assetsReady || '',
        d.driveLink || '',
        d.competitors || d.briefTasteLikes || '',
        d.visualTasteDislikes || '',
        d.meetVenue || '',
        d.meetingDatePreference || '',
        d.meetingAttendees || ''
      ].map(val => `"${String(val || '').replace(/"/g, '""')}"`).join(',');
    });

    return [headers.join(','), ...rows].join('\r\n');
  }

  /**
   * Exports inquiries as CSV string
   */
  exportInquiriesCSV() {
    const inquiries = store.getInquiries();
    const headers = ['Timestamp', 'Full Name', 'Brand Name', 'Phone', 'Email', 'Services', 'Industry', 'Budget', 'Message', 'Status'];

    const rows = inquiries.map(i => {
      return [
        i.createdAt || '',
        i.fullName || '',
        i.brandName || '',
        i.phone || '',
        i.email || '',
        Array.isArray(i.services) ? i.services.join('; ') : (i.services || ''),
        i.industry || '',
        i.budget || '',
        i.message || '',
        i.status || ''
      ].map(val => `"${String(val || '').replace(/"/g, '""')}"`).join(',');
    });

    return [headers.join(','), ...rows].join('\r\n');
  }
}

export const sheetsService = new GoogleSheetsService();
