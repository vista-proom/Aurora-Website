/**
 * AURORA GROUP — API CLIENT (v3 - Hardened)
 * HttpOnly Cookie Authentication with Bearer Session Fallback,
 * Zero Credentials in LocalStorage, Automatic CSRF/CORS Handling.
 */

const isLocalHost = typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
const BASE_URL = isLocalHost ? '/api' : 'https://aurora-website-five.vercel.app/api';

export function handleUnauthorizedSession(notice = 'timeout') {
  console.warn('[Security Guard] Active session revoked or unauthorized. Resetting session and reloading login.');

  // Auto-save any active portfolio project draft before resetting session
  try {
    const addWorkModal = document.getElementById('addWorkDrawer');
    if (addWorkModal && addWorkModal.classList.contains('active') && typeof window.auroraSaveProjectDraftManual === 'function') {
      window.auroraSaveProjectDraftManual(true);
    }
  } catch {}

  localStorage.removeItem('aurora_current_user');
  localStorage.removeItem('aurora_last_activity');
  sessionStorage.clear();
  if (notice) {
    sessionStorage.setItem('aurora_login_notice', notice);
  }

  document.querySelectorAll('form').forEach(f => { try { f.reset(); } catch {} });

  const adminScreen = document.getElementById('screen-admin');
  if (adminScreen) {
    adminScreen.style.display = 'none';
    adminScreen.classList.remove('active');
  }
  const portalScreen = document.getElementById('screen-portal');
  if (portalScreen) {
    portalScreen.style.display = 'none';
    portalScreen.classList.remove('active');
  }

  const path = window.location.pathname.replace(/^\/ar/, '') || '/';
  if (path !== '/login') {
    window.location.replace('/login');
  } else {
    window.location.reload();
  }
}

export async function authFetch(url, options = {}) {
  const headers = { ...(options.headers || {}) };

  // If a session token exists in sessionStorage, supply Bearer Authorization header
  const token = sessionStorage.getItem('aurora_session_token');
  if (token && !headers['Authorization']) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const fetchOptions = {
    ...options,
    headers,
    credentials: 'include' // Transmits HttpOnly aurora_session cookie
  };

  const res = await fetch(url, fetchOptions);

  if (res.status === 401 || res.status === 403) {
    try {
      const data = await res.clone().json();
      if (res.status === 401 || data.sessionTimeout || (res.status === 403 && data.error === 'Unauthorized user.')) {
        handleUnauthorizedSession('timeout');
      }
    } catch {
      if (res.status === 401) handleUnauthorizedSession('timeout');
    }
  }

  return res;
}

export async function verifyCurrentSession() {
  try {
    const res = await authFetch(`${BASE_URL}/auth/me`);
    if (!res.ok) {
      handleUnauthorizedSession('timeout');
      return null;
    }
    const data = await res.json();
    if (data.success && data.user) {
      localStorage.setItem('aurora_last_activity', String(Date.now()));
      // Store safe user metadata in localStorage for fast UI rendering
      localStorage.setItem('aurora_current_user', JSON.stringify({
        id: data.user.id,
        name: data.user.name,
        email: data.user.email,
        role: data.user.role,
        photo: data.user.photo
      }));
      return data.user;
    }
    handleUnauthorizedSession('timeout');
    return null;
  } catch (err) {
    handleUnauthorizedSession('timeout');
    return null;
  }
}

// -----------------------------------------------------------------------------
// AUTH & USERS
// -----------------------------------------------------------------------------
export async function login(email, password) {
  const res = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
    credentials: 'include'
  });
  const data = await res.json();
  if (data.success && data.token) {
    sessionStorage.setItem('aurora_session_token', data.token);
  }
  return data;
}

export async function loginWithFirebase(idToken, email) {
  const res = await fetch(`${BASE_URL}/auth/firebase-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken, email }),
    credentials: 'include'
  });
  const data = await res.json();
  if (data.success && data.token) {
    sessionStorage.setItem('aurora_session_token', data.token);
  }
  return data;
}

export async function requestPasswordReset(email) {
  const res = await fetch(`${BASE_URL}/auth/forgot-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
    credentials: 'include'
  });
  return res.json();
}

export async function requestMyPasswordReset() {
  const res = await authFetch(`${BASE_URL}/auth/request-password-reset`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  });
  return res.json();
}

export async function logoutUser() {
  try {
    sessionStorage.removeItem('aurora_session_token');
    await authFetch(`${BASE_URL}/auth/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (e) {}
}

export async function fetchFirebaseStatus() {
  const res = await fetch(`${BASE_URL}/auth/firebase-status`, { credentials: 'include' });
  return res.json();
}

export async function installFirebaseServiceAccount(serviceAccountJson) {
  const res = await authFetch(`${BASE_URL}/auth/firebase-service-account`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof serviceAccountJson === 'string' ? serviceAccountJson : JSON.stringify(serviceAccountJson)
  });
  return res.json();
}

export async function syncStaffToFirebase(purgeAllFirst = false) {
  const res = await authFetch(`${BASE_URL}/auth/firebase-sync-staff`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ purgeAllFirst })
  });
  return res.json();
}

export async function changeInitialPassword(newPassword) {
  const res = await authFetch(`${BASE_URL}/auth/change-initial-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ newPassword })
  });
  return res.json();
}

export async function fetchTeamDirectory() {
  const res = await fetch(`${BASE_URL}/team`, { credentials: 'include' });
  return res.json();
}

export async function fetchUsers() {
  const res = await authFetch(`${BASE_URL}/users`);
  return res.json();
}

export async function expireStaffPassword(userId) {
  const res = await authFetch(`${BASE_URL}/users/${userId}/expire-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  });
  return res.json();
}

export async function fetchPublicProfile(slug) {
  const res = await fetch(`${BASE_URL}/users/profile/${slug}`, { credentials: 'include' });
  return res.json();
}

export async function updateUserProfile(profileData) {
  const res = await authFetch(`${BASE_URL}/users/profile`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(profileData)
  });
  return res.json();
}

export async function updateUserPermissions(id, role, permissions) {
  const res = await authFetch(`${BASE_URL}/users/${id}/permissions`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role, permissions })
  });
  return res.json();
}

export async function createUser(userData) {
  const res = await authFetch(`${BASE_URL}/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(userData)
  });
  return res.json();
}

export async function updateUser(id, userData) {
  const res = await authFetch(`${BASE_URL}/users/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(userData)
  });
  return res.json();
}

export async function deleteUser(id) {
  const res = await authFetch(`${BASE_URL}/users/${id}`, {
    method: 'DELETE'
  });
  return res.json();
}

// -----------------------------------------------------------------------------
// CORE SERVICES
// -----------------------------------------------------------------------------
export async function fetchServices(all = false) {
  const res = await fetch(`${BASE_URL}/services?all=${all}`, { credentials: 'include' });
  return res.json();
}

export async function createService(serviceData) {
  const res = await authFetch(`${BASE_URL}/services`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(serviceData)
  });
  return res.json();
}

export async function updateService(id, serviceData) {
  const res = await authFetch(`${BASE_URL}/services/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(serviceData)
  });
  return res.json();
}

export async function deleteService(id) {
  const res = await authFetch(`${BASE_URL}/services/${id}`, {
    method: 'DELETE'
  });
  return res.json();
}

export async function reorderServices(ids) {
  const res = await authFetch(`${BASE_URL}/services/reorder`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids })
  });
  return res.json();
}

export async function toggleService(id, active) {
  const res = await authFetch(`${BASE_URL}/services/${id}/toggle`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ active })
  });
  return res.json();
}

// -----------------------------------------------------------------------------
// PROJECTS
// -----------------------------------------------------------------------------
export async function fetchProjects(status = 'published') {
  const res = await fetch(`${BASE_URL}/projects?status=${status}`, { credentials: 'include' });
  return res.json();
}

export async function fetchProjectsForEmployee(employeeName) {
  const res = await fetch(`${BASE_URL}/projects/employee/${encodeURIComponent(employeeName)}`, { credentials: 'include' });
  return res.json();
}

export async function fetchProjectBySlug(slug) {
  const res = await fetch(`${BASE_URL}/projects/${slug}`, { credentials: 'include' });
  return res.json();
}

export async function createProject(projectData) {
  const res = await authFetch(`${BASE_URL}/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(projectData)
  });
  return res.json();
}

export async function approveProject(id) {
  const res = await authFetch(`${BASE_URL}/projects/${id}/approve`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' }
  });
  return res.json();
}

export async function publishProject(id) {
  const res = await authFetch(`${BASE_URL}/projects/${id}/publish`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' }
  });
  return res.json();
}

export async function updateProject(id, updates) {
  const res = await authFetch(`${BASE_URL}/projects/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates)
  });
  return res.json();
}

export async function rejectProject(id, reason) {
  const res = await authFetch(`${BASE_URL}/projects/${id}/reject`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason })
  });
  return res.json();
}

export async function withdrawProject(id) {
  const res = await authFetch(`${BASE_URL}/projects/${id}/withdraw`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' }
  });
  return res.json();
}

export async function fetchIndustries() {
  const res = await fetch(`${BASE_URL}/industries`, { credentials: 'include' });
  return res.json();
}

export async function addIndustry(name) {
  const res = await authFetch(`${BASE_URL}/industries`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name })
  });
  return res.json();
}

export async function fetchPortfolioClips() {
  const res = await authFetch(`${BASE_URL}/users/portfolio-clips`);
  return res.json();
}

export async function updatePortfolioClips(clips) {
  const res = await authFetch(`${BASE_URL}/users/portfolio-clips`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clips })
  });
  return res.json();
}

export async function uploadUserAvatar(dataUrl, filename) {
  const res = await authFetch(`${BASE_URL}/users/upload-avatar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dataUrl, filename })
  });
  return res.json();
}

export async function requestProjectUpdate(id, updates) {
  const res = await authFetch(`${BASE_URL}/projects/${id}/request-update`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates)
  });
  return res.json();
}

export async function removeProjectFromPortfolio(id, employeeName) {
  const res = await authFetch(`${BASE_URL}/projects/${id}/portfolio?employeeName=${encodeURIComponent(employeeName)}`, {
    method: 'DELETE'
  });
  return res.json();
}

// -----------------------------------------------------------------------------
// INQUIRIES (CRM)
// -----------------------------------------------------------------------------
export async function submitContactInquiry(inquiryData) {
  const res = await fetch(`${BASE_URL}/inquiries`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(inquiryData),
    credentials: 'include'
  });
  return res.json();
}

export async function fetchInquiries() {
  const res = await authFetch(`${BASE_URL}/inquiries`);
  return res.json();
}

export async function updateInquiryStatus(id, status, note = '') {
  const res = await authFetch(`${BASE_URL}/inquiries/${id}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status, note })
  });
  return res.json();
}

// -----------------------------------------------------------------------------
// BRIEFS (KYC)
// -----------------------------------------------------------------------------
export async function fetchBriefs() {
  const res = await authFetch(`${BASE_URL}/briefs`);
  return res.json();
}

export async function fetchBriefMetadata(token) {
  const res = await fetch(`${BASE_URL}/briefs/${token}`, { credentials: 'include' });
  return res.json();
}

export async function submitBrief(token, payload) {
  const res = await fetch(`${BASE_URL}/briefs/${token}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    credentials: 'include'
  });
  return res.json();
}

export async function generateBriefLink(clientName, brandName, daysValid = 30) {
  const res = await authFetch(`${BASE_URL}/briefs/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientName, brandName, daysValid })
  });
  return res.json();
}

export async function extendBriefExpiry(token, targetDateOrDays) {
  const body = typeof targetDateOrDays === 'string' && targetDateOrDays.includes('-')
    ? { targetDate: targetDateOrDays }
    : { days: targetDateOrDays };

  const res = await authFetch(`${BASE_URL}/briefs/${token}/extend`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return res.json();
}

export async function deactivateBrief(token) {
  const res = await authFetch(`${BASE_URL}/briefs/${token}/deactivate`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' }
  });
  return res.json();
}

export async function editBrief(token, updates) {
  const res = await authFetch(`${BASE_URL}/briefs/${token}/edit`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates)
  });
  return res.json();
}

// -----------------------------------------------------------------------------
// SETTINGS, LOGS & MONITORING
// -----------------------------------------------------------------------------
export async function fetchSettings() {
  const res = await fetch(`${BASE_URL}/settings`, { credentials: 'include' });
  return res.json();
}

export async function updateSettings(updates) {
  const res = await authFetch(`${BASE_URL}/settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates)
  });
  return res.json();
}

export async function fetchActivityLogs() {
  const res = await authFetch(`${BASE_URL}/activity-logs`);
  return res.json();
}

export async function fetchMonitoring() {
  const res = await authFetch(`${BASE_URL}/monitoring`);
  return res.json();
}

// -----------------------------------------------------------------------------
// SITE CONTENT & MEDIA CMS (Super Admin Only)
// -----------------------------------------------------------------------------
export async function fetchSiteContent() {
  const res = await fetch(`${BASE_URL}/content`, { credentials: 'include' });
  return res.json();
}

export async function updateSiteContent(updates) {
  const res = await authFetch(`${BASE_URL}/content`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates)
  });
  return res.json();
}

export async function updatePortfolioUrl(portfolioUrl) {
  const res = await authFetch(`${BASE_URL}/content/portfolio`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ portfolioUrl })
  });
  return res.json();
}

export async function uploadCMSPhoto(dataUrl, filename) {
  const res = await authFetch(`${BASE_URL}/content/upload-photo`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dataUrl, filename })
  });
  return res.json();
}

// -----------------------------------------------------------------------------
// DATABASE (MONGODB) & GOOGLE SHEETS
// -----------------------------------------------------------------------------
export async function fetchDatabaseStatus() {
  const res = await authFetch(`${BASE_URL}/database/status`);
  return res.json();
}

export async function connectDatabase(uri) {
  const res = await authFetch(`${BASE_URL}/database/connect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uri })
  });
  return res.json();
}

export async function disconnectDatabase() {
  const res = await authFetch(`${BASE_URL}/database/disconnect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  });
  return res.json();
}

export async function fetchSheetsStatus() {
  const res = await authFetch(`${BASE_URL}/sheets/status`);
  return res.json();
}

export async function testSheetsConnection() {
  const res = await authFetch(`${BASE_URL}/sheets/test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  });
  return res.json();
}

export async function syncAllSheetsPending() {
  const res = await authFetch(`${BASE_URL}/sheets/sync-all`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  });
  return res.json();
}

// -----------------------------------------------------------------------------
// QUOTATIONS & COMMERCIAL INVOICES (PART 4)
// -----------------------------------------------------------------------------
export async function fetchInvoices() {
  const res = await authFetch(`${BASE_URL}/invoices`);
  return res.json();
}

export async function fetchInvoiceById(id) {
  const res = await authFetch(`${BASE_URL}/invoices/${id}`);
  return res.json();
}

export async function saveInvoice(data) {
  const isEdit = Boolean(data.id);
  const url = isEdit ? `${BASE_URL}/invoices/${data.id}` : `${BASE_URL}/invoices`;
  const res = await authFetch(url, {
    method: isEdit ? 'PUT' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  return res.json();
}

export async function updateInvoiceStatus(id, status, note, amountPaid = '') {
  const res = await authFetch(`${BASE_URL}/invoices/${id}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status, note, amountPaid })
  });
  return res.json();
}

export async function deleteInvoice(id) {
  const res = await authFetch(`${BASE_URL}/invoices/${id}`, {
    method: 'DELETE'
  });
  return res.json();
}

// -----------------------------------------------------------------------------
// PARTNER LOGOS & MARQUEE CONTROL
// -----------------------------------------------------------------------------
export async function fetchMarquee() {
  const res = await fetch(`${BASE_URL}/content/marquee`);
  return res.json();
}

export async function saveMarquee(data) {
  const res = await authFetch(`${BASE_URL}/content/marquee`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  return res.json();
}
