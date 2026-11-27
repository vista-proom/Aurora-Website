/**
 * AURORA GROUP — TRANSACTIONAL EMAIL SERVICE (Hardened)
 * Safe logging with PII redaction and secure SMTP dispatch.
 */

import nodemailer from 'nodemailer';
import { logger, redactSensitiveData } from '../utils/logger.js';

export class EmailService {
  constructor() {
    this.managerEmail = process.env.MANAGER_ALERT_EMAIL || 'manager@aurora.eg';
    this.smtpHost = process.env.SMTP_HOST;
    this.smtpPort = process.env.SMTP_PORT || 587;
    this.smtpUser = process.env.SMTP_USER;
    this.smtpPass = process.env.SMTP_PASS;
    this.isConfigured = Boolean(this.smtpHost && this.smtpUser && this.smtpPass);

    if (this.isConfigured) {
      this.transporter = nodemailer.createTransport({
        host: this.smtpHost,
        port: Number(this.smtpPort),
        secure: Number(this.smtpPort) === 465,
        auth: {
          user: this.smtpUser,
          pass: this.smtpPass
        }
      });
    }
  }

  async sendProjectUploadedAlert(project, authorEmail) {
    const subject = `[Aurora Portal] New Project Upload for Review: ${project.titleEn || project.clientName}`;
    const text = `A new project has been submitted for approval by ${authorEmail}.\n\nClient: ${project.clientName}\nCategory: ${project.industryCategory}\nYear: ${project.projectYear}\n\nPlease review and approve in the Manager Control Panel: http://localhost:3000/admin`;

    return this.dispatch(this.managerEmail, subject, text);
  }

  async sendBriefSubmittedAlert(brief) {
    const d = brief.data || {};
    const subject = `[Aurora KYC] Client Brief Submitted: ${brief.clientName} (${brief.brandName || 'Brand'})`;
    const text = `A client has completed the discovery brief on link token ${brief.token}.\n\nClient Name: ${brief.clientName}\nBrand: ${brief.brandName}\nPhone: ${d.phone || 'N/A'}\nEmail: ${d.email || 'N/A'}\nEstimated Budget: ${d.budget || 'N/A'}\n\nPlease view the full brief submission and print the Meeting Prep Sheet in the Admin Panel: http://localhost:3000/admin`;

    return this.dispatch(this.managerEmail, subject, text);
  }

  async sendStaffWelcomeEmail({ name, email, role, title, department, defaultPassword, mustChangePassword, portalUrl }) {
    const loginUrl = portalUrl || 'http://localhost:3000/login';
    const roleLabel = role === 'super_admin' ? 'Super Admin' : (role === 'manager' ? 'Manager' : 'Staff / Team Member');
    const subject = `Welcome to Aurora Group Portal — Your Account & Access Credentials`;
    const passwordChangeNote = mustChangePassword
      ? `\n🔒 IMPORTANT SECURITY NOTE: Upon signing in for the first time, you will be required to change this temporary password to a new personal password of your choice.`
      : `\nYou may change your password at any time from your portal settings.`;

    const text = `Hello ${name || 'Team Member'},

Welcome to Aurora Group! Your staff account has been created and authorized on the Aurora Operations & Team Portal.

=== YOUR ACCOUNT DETAILS ===
• Name: ${name || 'Staff Member'}
• Role: ${roleLabel}
• Position / Title: ${title || 'Team Member'}
• Department: ${department || 'General'}

=== SIGN-IN CREDENTIALS ===
• Portal Login URL: ${loginUrl}
• Login Email: ${email}
• Default Password: ${defaultPassword || 'Aurora@2026'}
${passwordChangeNote}

You can sign in either using "Sign in with Google" (with ${email}) or using your Email & Default Password above.

Welcome aboard!
Aurora Group Management`;

    return this.dispatch(email, subject, text);
  }

  async dispatch(to, subject, text) {
    if (!this.isConfigured) {
      const redactedTo = redactSensitiveData(to);
      logger.info(`[Email Alert (Simulated)] To: ${redactedTo} | Subject: ${subject}`);
      return { success: true, simulated: true };
    }

    try {
      const info = await this.transporter.sendMail({
        from: `"Aurora Group Portal" <${this.smtpUser}>`,
        to,
        subject,
        text
      });
      logger.info('[Email] Dispatched successfully:', info.messageId);
      return { success: true, messageId: info.messageId };
    } catch (err) {
      logger.error('[Email] Dispatch error:', err.message);
      return { success: false, error: err.message };
    }
  }
}

export const emailService = new EmailService();
