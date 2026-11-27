/**
 * AURORA GROUP — CLOUDINARY MEDIA SERVICE
 * Handles auto-optimized image & design asset uploads to Cloudinary (SRS 7.8 & 8).
 * Falls back cleanly when Cloudinary credentials are not yet configured.
 */

import { v2 as cloudinary } from 'cloudinary';

let configured = false;

function ensureConfigured() {
  const cloudName = (process.env.CLOUDINARY_CLOUD_NAME || '').trim();
  const apiKey = (process.env.CLOUDINARY_API_KEY || '').trim();
  const apiSecret = (process.env.CLOUDINARY_API_SECRET || '').trim();

  if (!cloudName || !apiKey || !apiSecret) {
    configured = false;
    return false;
  }

  if (!configured) {
    cloudinary.config({
      cloud_name: cloudName,
      api_key: apiKey,
      api_secret: apiSecret,
      secure: true
    });
    configured = true;
  }
  return true;
}

export const cloudinaryService = {
  isConfigured() {
    return ensureConfigured();
  },

  /**
   * Uploads a base64 data URL (or image buffer) to Cloudinary with auto-optimization.
   * @param {string} dataUrl - Base64 data URL (data:image/...;base64,...)
   * @param {object} options - { folder, publicId }
   * @returns {Promise<{url: string, publicId: string, width: number, height: number}>}
   */
  async uploadDataUrl(dataUrl, { folder = 'aurora/uploads', publicId } = {}) {
    if (!ensureConfigured()) {
      throw new Error('Cloudinary credentials are not configured in .env');
    }

    const uploadOptions = {
      folder,
      resource_type: 'image',
      overwrite: true,
      transformation: [
        { quality: 'auto', fetch_format: 'auto' }
      ]
    };
    if (publicId) uploadOptions.public_id = publicId;

    const result = await cloudinary.uploader.upload(dataUrl, uploadOptions);
    return {
      url: result.secure_url,
      publicId: result.public_id,
      width: result.width,
      height: result.height
    };
  },

  /**
   * Processes an array of project photos/stills and uploads any base64 data URLs to Cloudinary.
   * Leaves existing HTTPS/relative URLs untouched.
   * @param {Array} photos
   * @param {string} folder
   * @returns {Promise<Array>}
   */
  async processProjectPhotos(photos, folder = 'aurora/projects') {
    if (!Array.isArray(photos) || photos.length === 0) return photos;
    if (!ensureConfigured()) return photos;

    const processed = [];
    for (const item of photos) {
      if (typeof item === 'string') {
        if (item.startsWith('data:image/')) {
          const uploaded = await this.uploadDataUrl(item, { folder });
          processed.push(uploaded.url);
        } else {
          processed.push(item);
        }
      } else if (item && typeof item === 'object') {
        const rawSrc = item.dataUrl || item.url || '';
        if (typeof rawSrc === 'string' && rawSrc.startsWith('data:image/')) {
          const uploaded = await this.uploadDataUrl(rawSrc, { folder });
          const nextItem = { ...item, url: uploaded.url, cloudinaryId: uploaded.publicId };
          delete nextItem.dataUrl;
          processed.push(nextItem);
        } else {
          processed.push(item);
        }
      }
    }
    return processed;
  }
};
