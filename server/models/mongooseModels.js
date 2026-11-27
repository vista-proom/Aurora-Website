/**
 * AURORA GROUP — MONGOOSE SCHEMAS & MODELS
 * Enterprise-grade schemas with optimized query indexes for MongoDB Atlas.
 */

import mongoose from 'mongoose';

// 1. User & Auth Schema (RBAC)
const UserSchema = new mongoose.Schema({
  id: { type: String, index: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
  name: { type: String, required: true },
  role: { type: String, default: 'employee', index: true },
  title: { type: String, default: '' },
  department: { type: String, default: '' },
  slug: { type: String, lowercase: true, trim: true, index: true },
  photo: { type: String, default: '' },
  avatar: { type: String, default: '' },
  bioEn: { type: String, default: '' },
  bioAr: { type: String, default: '' },
  theme: { type: String, default: 'system' },
  lang: { type: String, default: 'en' },
  phone: { type: String, default: '' },
  permissions: { type: mongoose.Schema.Types.Mixed, default: {} },
  portfolioClips: [{ type: mongoose.Schema.Types.Mixed }],
  isActive: { type: Boolean, default: true, index: true },
  createdAt: { type: Date, default: Date.now, index: true }
}, { timestamps: true });

UserSchema.index({ role: 1, isActive: 1 });

// 2. Client Brief (KYC) Schema
const BriefSchema = new mongoose.Schema({
  token: { type: String, required: true, unique: true, index: true },
  clientName: { type: String, required: true },
  brandName: { type: String, default: '' },
  expiryDate: { type: Date, required: true, index: true },
  status: {
    type: String,
    enum: ['pending', 'submitted', 'expired', 'deactivated'],
    default: 'pending',
    index: true
  },
  isSubmitted: { type: Boolean, default: false, index: true },
  submittedAt: { type: Date },
  data: { type: mongoose.Schema.Types.Mixed, default: {} }
}, { timestamps: true });

BriefSchema.index({ status: 1, createdAt: -1 });

// 3. Contact Inquiries Schema
const InquirySchema = new mongoose.Schema({
  id: { type: String, index: true },
  fullName: { type: String, required: true },
  brandName: { type: String, default: '' },
  phone: { type: String, required: true },
  email: { type: String, required: true, index: true },
  services: [{ type: String }],
  industry: { type: String, default: '', index: true },
  budget: { type: String, default: '' },
  message: { type: String, default: '' },
  status: {
    type: String,
    enum: ['new', 'contacted', 'scheduled', 'archived'],
    default: 'new',
    index: true
  }
}, { timestamps: true });

InquirySchema.index({ status: 1, createdAt: -1 });

// 4. Portfolio Projects Schema
const ProjectSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, index: true },
  slug: { type: String, lowercase: true, index: true },
  title: { type: String, required: true },
  titleAr: { type: String, default: '' },
  client: { type: String, default: '' },
  clientAr: { type: String, default: '' },
  category: { type: String, default: '', index: true },
  categoryAr: { type: String, default: '' },
  tags: [{ type: String }],
  tagsAr: [{ type: String }],
  year: { type: String, default: '2026', index: true },
  excerpt: { type: String, default: '' },
  excerptAr: { type: String, default: '' },
  description: { type: String, default: '' },
  descriptionAr: { type: String, default: '' },
  heroImage: { type: String, default: '' },
  gallery: [{ type: String }],
  metrics: { type: mongoose.Schema.Types.Mixed, default: {} },
  teamCredits: [{ type: mongoose.Schema.Types.Mixed }],
  published: { type: Boolean, default: true, index: true }
}, { timestamps: true });

ProjectSchema.index({ published: 1, createdAt: -1 });
ProjectSchema.index({ category: 1, published: 1 });

// 5. Agency Settings Schema
const SettingsSchema = new mongoose.Schema({
  officeVenue: { type: String, default: 'Sharks Office Space' },
  addressStreet: { type: String, default: 'Abdelsalam El Shazly St, above Next Bank' },
  city: { type: String, default: 'Egypt' },
  contactPhone: { type: String, default: '+20 15 59192858' },
  contactEmail: { type: String, default: 'contact.aurora.egy@gmail.com' },
  instagramMarketing: { type: String, default: '@aurora__marketing' },
  instagramProduction: { type: String, default: '@aurora__media_production' },
  googleMapsUrl: { type: String, default: 'https://maps.google.com' },
  workingHours: { type: String, default: 'Sunday – Thursday: 10:00 AM – 6:00 PM' },
  googleSheetsUrl: { type: String, default: '' },
  googleSheetsWebhookUrl: { type: String, default: '' },
  mongodbUri: { type: String, default: '' }
}, { timestamps: true });

// 6. Audit & Activity Log Schema
const ActivityLogSchema = new mongoose.Schema({
  id: { type: String, index: true },
  timestamp: { type: Date, default: Date.now, index: true },
  action: { type: String, required: true, index: true },
  user: { type: String, default: 'system', index: true },
  details: { type: mongoose.Schema.Types.Mixed, default: {} }
});

ActivityLogSchema.index({ timestamp: -1 });

// 7. Site Content CMS Schema
const SiteContentSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true, index: true },
  data: { type: mongoose.Schema.Types.Mixed, default: {} }
}, { timestamps: true });

export const UserModel = mongoose.model('User', UserSchema);
export const BriefModel = mongoose.model('Brief', BriefSchema);
export const InquiryModel = mongoose.model('Inquiry', InquirySchema);
export const ProjectModel = mongoose.model('Project', ProjectSchema);
export const SettingsModel = mongoose.model('Settings', SettingsSchema);
export const ActivityLogModel = mongoose.model('ActivityLog', ActivityLogSchema);
export const SiteContentModel = mongoose.model('SiteContent', SiteContentSchema);
