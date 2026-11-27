/**
 * AURORA GROUP — CORE CLIENT APPLICATION ORCHESTRATOR (v2)
 * Manages Public Screens, Dynamic Case Studies, Hidden Brief KYC Wizard,
 * Employee Portal, and Super Admin Management System.
 */

import { initTheme, toggleTheme, setTheme, getTheme } from './theme.js';
import { initRouter, navigateTo, setScreen, getAuthenticatedUser } from './router.js';
import { applyLanguage, toggleLanguage, setLanguage, getLanguage, t, translateIndustry, translateDeliverable } from './i18n.js';
import * as api from './api.js';
import * as firebaseAuth from './firebaseAuth.js';

// Application State
let activeProjects = [];
let allAdminBriefs = [];
let allAdminInquiries = [];
let allIndustries = [];
let newProjectPhotos = [];
let myPortfolioClips = [];
let currentAvatarCropDataUrl = null;
let allAdminInvoices = [];
let currentPrintingInvoice = null;
let allAdminActivityLogs = [];
let currentUser = JSON.parse(localStorage.getItem('aurora_current_user') || 'null');
let currentBriefStep = 1;
const TOTAL_BRIEF_STEPS = 6;
let currentBriefToken = null;
let currentSiteContent = null;
let currentProjectsCategory = 'all';
let currentCaseStudySlug = null;
let allAdminMarqueeData = { speedSeconds: 35, logos: [] };
let isLoggingIn = false;

// -----------------------------------------------------------------------------
// TOAST NOTIFICATIONS & GLOBAL ALERT REPLACEMENT (5-Second Auto Dismiss)
// -----------------------------------------------------------------------------
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function showToastNotification(message, type = 'info', duration = 2600) {
  let container = document.getElementById('auroraToastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'auroraToastContainer';
    document.body.appendChild(container);
  }

  const icons = {
    success: '✅',
    error: '⚠️',
    warning: '🔔',
    info: 'ℹ️'
  };

  const textMsg = String(message || '');
  const lower = textMsg.toLowerCase();
  if (type === 'info') {
    if (lower.includes('success') || lower.includes('copied') || lower.includes('saved') || lower.includes('published') || lower.includes('approved') || lower.includes('added') || lower.includes('connected')) {
      type = 'success';
    } else if (lower.includes('error') || lower.includes('failed') || lower.includes('denied') || lower.includes('invalid') || lower.includes('rejected')) {
      type = 'error';
    } else if (lower.includes('warning') || lower.includes('please') || lower.includes('required') || lower.includes('at least') || lower.includes('maximum')) {
      type = 'warning';
    }
  }

  const toast = document.createElement('div');
  toast.className = `aurora-toast toast-${type}`;
  toast.innerHTML = `
    <div class="aurora-toast-icon">${icons[type] || 'ℹ️'}</div>
    <div class="aurora-toast-body">${escapeHtml(textMsg)}</div>
    <button type="button" class="aurora-toast-close" aria-label="Dismiss">✕</button>
    <div class="aurora-toast-progress" style="animation-duration: ${duration}ms;"></div>
  `;

  const dismiss = () => {
    toast.classList.remove('show');
    toast.classList.add('hide');
    setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 300);
  };

  const closeBtn = toast.querySelector('.aurora-toast-close');
  if (closeBtn) closeBtn.onclick = dismiss;

  container.appendChild(toast);
  requestAnimationFrame(() => {
    toast.classList.add('show');
  });

  let timer = setTimeout(dismiss, duration);
  toast.onmouseenter = () => {
    clearTimeout(timer);
    const prog = toast.querySelector('.aurora-toast-progress');
    if (prog) prog.style.animationPlayState = 'paused';
  };
  toast.onmouseleave = () => {
    timer = setTimeout(dismiss, 1500);
  };
}

// Global alert override: Non-intrusive short notification
window.alert = function(msg) {
  showToastNotification(msg, 'info', 2600);
};

async function initApp() {
  try {
    // 1. Initialize Theme Engine
    initTheme();

    // 2. Initialize Language Engine
    applyLanguage(getLanguage());

    // 3. Bind Global Controls & Events
    bindGlobalControls();

    // 4. Initialize Router
    initRouter((screenId, param) => {
      onScreenChange(screenId, param);
    });

    // 4b. Handle In-Tab Google SSO Redirect Return Immediately
    if (window.location.hash && (window.location.hash.includes('aurora_google_token=') || window.location.hash.includes('aurora_google_error='))) {
      const hashStr = window.location.hash.replace(/^#/, '');
      const hashParams = new URLSearchParams(hashStr);
      const googleToken = hashParams.get('aurora_google_token');
      const googleEmail = hashParams.get('aurora_google_email') || '';
      const googleError = hashParams.get('aurora_google_error');

      // Clean URL hash from browser address bar
      window.history.replaceState(null, '', window.location.pathname + window.location.search);

      if (googleError) {
        showToastNotification('Google Sign-In: ' + googleError, 'warning', 6000);
      } else if (googleToken) {
        const googleBtn = document.getElementById('firebaseGoogleSignInBtn');
        const origHtml = googleBtn ? googleBtn.innerHTML : '<span>Sign in with Google</span>';
        if (googleBtn) {
          googleBtn.disabled = true;
          googleBtn.innerHTML = '<span>Completing Google Sign-In...</span>';
        }
        try {
          await processFirebaseLogin(googleToken, googleEmail);
        } finally {
          if (googleBtn) {
            googleBtn.disabled = false;
            googleBtn.innerHTML = origHtml;
          }
        }
      }
    }

    // 5. Load Site Content, Services, Projects, and Industries
    await hydrateSiteContent(true);
    await loadPublicServices();
    await loadProjects();
    await populateNewWorkIndustries();
    api.fetchMarquee().then(res => {
      if (res && res.success && res.data) {
        allAdminMarqueeData = res.data;
        renderPublicMarquee(res.data);
      }
    }).catch(() => {});
    api.fetchTeamDirectory().then(res => {
      if (res && res.enabled !== undefined) updateTeamNavVisibility(res.enabled);
    }).catch(() => {});

    // 6. Synchronous Zero-Lag Language Switch Listener (Requirement 4.4)
    window.addEventListener('aurora:languageChange', () => {
      renderCurrentScreenDynamicContent();
    });

    // 7. Initialize Firebase Client, Listen for Auth State & Redirect Result
    firebaseAuth.initFirebaseClient().then(async () => {
      // Check for Google redirect result
      const redirectAuth = await firebaseAuth.checkRedirectAuth();
      if (redirectAuth && redirectAuth.idToken) {
        await processFirebaseLogin(redirectAuth.idToken, redirectAuth.user.email);
        return;
      }

      // Automatically handle Google sign-in completion via onAuthStateChanged
      firebaseAuth.setupAuthStateListener(async (user, idToken) => {
        const stored = localStorage.getItem('aurora_current_user');
        const path = window.location.pathname.replace(/^\/ar/, '') || '/';
        // If on /login or session not yet established, auto-complete exchange
        if (!stored && (path === '/login' || path === '/admin' || path === '/portal') && user && user.email) {
          console.log('[Firebase Auth] Completing login for:', user.email);
          await processFirebaseLogin(idToken, user.email);
        }
      });
    }).catch(e => console.warn('[Firebase Pre-init Non-fatal]:', e.message));
  } catch (err) {
    console.error('Fatal initialization error:', err);
  }
}

function bindGlobalControls() {
  // Initialize Cookie Consent Management
  initCookieConsent();

  // Theme Toggle Button in Header (Accessible Click & Keyboard)
  const themeBtn = document.getElementById('themeToggleBtn');
  if (themeBtn) {
    themeBtn.setAttribute('role', 'button');
    themeBtn.setAttribute('tabindex', '0');
    themeBtn.addEventListener('click', () => {
      toggleTheme();
    });
    themeBtn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggleTheme();
      }
    });
  }

  // Footer Theme Toggle
  const footerThemeBtn = document.getElementById('footerThemeToggle');
  if (footerThemeBtn) {
    footerThemeBtn.addEventListener('click', (e) => {
      e.preventDefault();
      toggleTheme();
    });
  }

  // Language Toggle Button in Header
  const langBtn = document.getElementById('langToggleBtn');
  if (langBtn) {
    langBtn.addEventListener('click', () => {
      toggleLanguage();
      renderCurrentScreenDynamicContent();
    });
  }

  // Mobile Menu Toggle
  const mobileBtn = document.getElementById('mobileMenuBtn');
  const mobileDrawer = document.getElementById('mobileNavDrawer');
  const mobileOverlay = document.getElementById('mobileNavOverlay');
  if (mobileBtn && mobileDrawer && mobileOverlay) {
    mobileBtn.addEventListener('click', () => {
      mobileDrawer.classList.toggle('active');
      mobileOverlay.classList.toggle('active');
    });
    mobileOverlay.addEventListener('click', () => {
      mobileDrawer.classList.remove('active');
      mobileOverlay.classList.remove('active');
    });
  }

  // Contact Form Submission
  const contactForm = document.getElementById('contactForm');
  if (contactForm) {
    contactForm.addEventListener('submit', handleContactSubmit);
  }

  // Brief wizard navigation buttons use their inline onclick handlers (auroraNextBriefStep, auroraPrevBriefStep, auroraSubmitBriefForm)

  // Bio character counter in Employee portal
  const bioInput = document.getElementById('portalBioInput');
  const bioCounter = document.getElementById('portalBioCounter');
  if (bioInput && bioCounter) {
    bioInput.addEventListener('input', () => {
      bioCounter.textContent = `${bioInput.value.length} / 180 chars`;
    });
  }

  // Global ESC Key Listener
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeAllModalsAndDrawers();
    }
  });

  // Cross-Tab KYC Submission & Sync Listener
  window.addEventListener('storage', (e) => {
    if (e.key === 'aurora_last_brief_submission') {
      refreshBriefs(false).catch(() => {});
    }
  });

  // 15-Minute Session Inactivity Listeners & Periodic Checks
  ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'].forEach((evt) => {
    window.addEventListener(evt, () => {
      if (localStorage.getItem('aurora_current_user')) {
        recordUserActivity();
      }
    }, { passive: true });
  });

  setInterval(checkSessionInactivity, 15000);
}

async function onScreenChange(screenId, param) {
  if (screenId === 'home') {
    renderHomeSelectedWork();
    setTimeout(() => animateNumberCounters(), 80);
  } else if (screenId === 'about') {
    setTimeout(() => animateNumberCounters(), 80);
  } else if (screenId === 'services') {
    await loadPublicServices();
  } else if (screenId === 'projects') {
    renderProjectsFilterBar();
    if (param) {
      filterProjectsByKeyword(param);
    } else {
      currentProjectsCategory = 'all';
      renderProjectsGrid('all');
    }
  } else if (screenId === 'caseStudy') {
    currentCaseStudySlug = param;
    await renderCaseStudy(param);
  } else if (screenId === 'team') {
    await renderPublicTeamDirectory();
  } else if (screenId === 'teamProfile') {
    await renderPublicTeamProfile(param);
  } else if (screenId === 'brief') {
    currentBriefToken = param;
    await setupBriefScreen(param);
  } else if (screenId === 'login') {
    const notice = sessionStorage.getItem('aurora_login_notice');
    if (notice) {
      sessionStorage.removeItem('aurora_login_notice');
      showLoginNotice(notice);
    }
  } else if (screenId === 'portal') {
    if (!verifyAuth('portal')) return;
    const verifiedUser = await api.verifyCurrentSession();
    if (!verifiedUser) return;
    currentUser = verifiedUser;
    if (verifiedUser.mustChangePassword || verifiedUser.mustResetPassword) {
      openFirstLoginPasswordModal(verifiedUser);
    }
    loadPortalData();
  } else if (screenId === 'admin') {
    if (!verifyAuth('admin')) return;
    const verifiedUser = await api.verifyCurrentSession();
    if (!verifiedUser || (verifiedUser.role !== 'super_admin' && verifiedUser.role !== 'manager')) {
      api.handleUnauthorizedSession();
      return;
    }
    currentUser = verifiedUser;
    localStorage.setItem('aurora_current_user', JSON.stringify(currentUser));
    if (verifiedUser.mustChangePassword || verifiedUser.mustResetPassword) {
      openFirstLoginPasswordModal(verifiedUser);
    }
    loadAdminData();
  }
}

function renderCurrentScreenDynamicContent() {
  const isAr = getLanguage() === 'ar';

  // Translate contact services checkboxes labels
  document.querySelectorAll('#contactServicesCheckboxes .service-label').forEach((el) => {
    el.textContent = isAr ? el.getAttribute('data-ar') : el.getAttribute('data-en');
  });

  // Re-render project cards, filter bar, and case study with zero lag (Requirement 4.4)
  renderHomeSelectedWork();
  renderProjectsFilterBar();
  renderProjectsGrid(currentProjectsCategory || 'all');
  if (currentCaseStudySlug) {
    renderCaseStudy(currentCaseStudySlug);
  }
  if (typeof updateBriefStepUI === 'function' && document.getElementById('screen-brief')?.style.display !== 'none') {
    updateBriefStepUI(false);
  }
  loadPublicServices();
  hydrateSiteContent(false);
}

// -----------------------------------------------------------------------------
// UI UTILITIES: SKELETONS, DEBOUNCE, COOKIE CONSENT
// -----------------------------------------------------------------------------
export function debounce(fn, delay = 250) {
  let timer = null;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

function renderSkeletons(container, count = 3) {
  if (!container) return;
  let html = '';
  for (let i = 0; i < count; i++) {
    html += `
      <div class="skeleton-card">
        <div class="skeleton-box skeleton-badge"></div>
        <div class="skeleton-box skeleton-title" style="margin-top:6px;"></div>
        <div class="skeleton-box skeleton-text"></div>
        <div class="skeleton-box skeleton-text" style="width:75%;"></div>
      </div>
    `;
  }
  container.innerHTML = html;
}

function initCookieConsent() {
  const consent = localStorage.getItem('aurora_cookie_consent');
  const banner = document.getElementById('cookieConsentBanner');
  if (!banner) return;

  if (!consent) {
    banner.style.display = 'block';
  } else {
    banner.style.display = 'none';
  }

  const acceptBtn = document.getElementById('cookieAcceptBtn');
  const rejectBtn = document.getElementById('cookieRejectBtn');

  if (acceptBtn) {
    acceptBtn.onclick = () => {
      localStorage.setItem('aurora_cookie_consent', 'all');
      banner.style.display = 'none';
      if (typeof window.gtag === 'function') {
        window.gtag('consent', 'update', {
          analytics_storage: 'granted',
          ad_storage: 'granted'
        });
      }
    };
  }

  if (rejectBtn) {
    rejectBtn.onclick = () => {
      localStorage.setItem('aurora_cookie_consent', 'essential');
      banner.style.display = 'none';
      if (typeof window.gtag === 'function') {
        window.gtag('consent', 'update', {
          analytics_storage: 'denied',
          ad_storage: 'denied'
        });
      }
    };
  }
}

// -----------------------------------------------------------------------------
// CORE SERVICES (Requirement 3.1: Dynamically Managed & Toggled)
// -----------------------------------------------------------------------------
async function loadPublicServices() {
  const mktContainer = document.getElementById('publicMarketingServicesGrid');
  const prodContainer = document.getElementById('publicProductionServicesGrid');
  const legacyContainer = document.getElementById('publicServicesGrid');

  if (mktContainer && !mktContainer.children.length) renderSkeletons(mktContainer, 3);
  if (prodContainer && !prodContainer.children.length) renderSkeletons(prodContainer, 3);

  try {
    const res = await api.fetchServices(true); // active only
    if (res.success && res.data) {
      const isAr = getLanguage() === 'ar';
      const allServices = (res.data || []).sort((a, b) => (a.order || 0) - (b.order || 0));

      const mktServices = allServices.filter(s => s.category === 'marketing');
      const prodServices = allServices.filter(s => s.category === 'production');

      const formatItemText = (item) => {
        if (!item) return '';
        if (isAr) {
          const m = item.match(/\((.*?)\)/);
          return m ? m[1].trim() : item;
        }
        return item.replace(/\s*\(.*\)/, '').trim();
      };

      const renderCard = (s) => {
        const title = isAr ? (s.nameAr || s.nameEn) : s.nameEn;
        const tag = isAr ? (s.tagAr || s.tagEn) : (s.tagEn || (s.category === 'marketing' ? 'Marketing' : 'Production'));
        const desc = isAr ? (s.descAr || s.descEn) : s.descEn;
        const items = s.items && s.items.length ? s.items.slice(0, 4) : [];

        return `
        <article class="service-detail-card">
          <div>
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
              <span style="font-size:0.75rem; font-weight:700; letter-spacing:0.08em; text-transform:uppercase; color:var(--accent-action);">
                ${escapeHtml(tag)}
              </span>
              <span style="font-size:0.8rem; font-weight:700; color:var(--text-muted); opacity:0.6;">
                #0${s.order || ''}
              </span>
            </div>
            <h3 style="font-size:1.3rem; font-weight:800; color:var(--text-primary); margin-bottom:10px; line-height:1.35;">
              ${escapeHtml(title)}
            </h3>
            <p style="font-size:0.92rem; color:var(--text-muted); line-height:1.65; margin:0 0 16px 0;">
              ${escapeHtml(desc)}
            </p>
          </div>
          ${items.length ? `
            <ul style="list-style:none; padding:0; margin:16px 0 0 0; display:flex; flex-direction:column; gap:8px; border-top:1px solid var(--border-default); padding-top:14px;">
              ${items.map(item => `
                <li style="font-size:0.86rem; color:var(--text-secondary); display:flex; align-items:baseline; gap:8px; line-height:1.45;">
                  <span style="color:var(--brand-vibrant-purple); font-size:0.8rem; font-weight:700; flex-shrink:0;">✓</span>
                  <span>${escapeHtml(formatItemText(item))}</span>
                </li>
              `).join('')}
            </ul>
          ` : ''}
        </article>
      `;
      };

      if (mktContainer) {
        mktContainer.innerHTML = mktServices.map(renderCard).join('');
      }
      if (prodContainer) {
        prodContainer.innerHTML = prodServices.map(renderCard).join('');
      }
      if (legacyContainer) {
        legacyContainer.style.display = 'none';
      }
    }
  } catch (err) {
    console.error('Failed to load services:', err);
  }
}

// -----------------------------------------------------------------------------
// PROJECTS & CASE STUDIES (Requirements 4.1, 4.2, 4.3, 4.4, 4.5)
// -----------------------------------------------------------------------------
async function populateAllIndustries() {
  try {
    const res = await api.fetchIndustries();
    if (res.success && res.data) {
      allIndustries = res.data;
    }
  } catch (err) {
    console.error('Failed to fetch industries:', err);
  }
}

function renderProjectsFilterBar() {
  const bar = document.getElementById('projectsFilterBar');
  if (!bar) return;
  const isAr = getLanguage() === 'ar';

  let html = `<button type="button" class="filter-btn ${currentProjectsCategory === 'all' ? 'active' : ''}" onclick="window.auroraFilterProjects('all', this)">${isAr ? 'الكل' : 'All'}</button>`;

  allIndustries.forEach(ind => {
    const name = ind.nameEn || ind;
    const translated = translateIndustry(name, isAr ? 'ar' : 'en');
    const isActive = currentProjectsCategory.toLowerCase() === name.toLowerCase();
    html += `<button type="button" class="filter-btn ${isActive ? 'active' : ''}" onclick="window.auroraFilterProjects('${name}', this)">${translated}</button>`;
  });

  bar.innerHTML = html;
}

async function loadProjects() {
  const homeGrid = document.getElementById('homeSelectedWorkGrid');
  const projectsGrid = document.getElementById('projectsGrid');
  if (homeGrid && !homeGrid.children.length) renderSkeletons(homeGrid, 3);
  if (projectsGrid && !projectsGrid.children.length) renderSkeletons(projectsGrid, 3);

  try {
    await populateAllIndustries();
    const res = await api.fetchProjects('published');
    if (res.success) {
      activeProjects = res.data;
      renderHomeSelectedWork();
      renderProjectsFilterBar();
      renderProjectsGrid(currentProjectsCategory || 'all');
    }
  } catch (err) {
    console.error('Failed to load projects:', err);
  }
}

function renderHomeSelectedWork() {
  const container = document.getElementById('homeSelectedWorkGrid');
  if (!container || !activeProjects.length) return;

  const isAr = getLanguage() === 'ar';
  const selected = activeProjects.slice(0, 3);

  container.innerHTML = selected.map((p) => `
    <article class="project-card" onclick="window.auroraNavigate('/projects/${p.slug}')">
      <div class="project-media-preview">
        <img src="${p.heroImage || p.mediaGallery[0]?.url || '/assets/Image_error.jpg'}" alt="${p.clientName}" loading="lazy" />
      </div>
      <div class="project-body">
        <div class="project-meta-row">
          <span class="badge badge-accent">${translateIndustry(p.industryCategory, isAr ? 'ar' : 'en')}</span>
          <span class="meta-field-label">${p.projectYear}</span>
        </div>
        <h3 class="project-client">${isAr && p.titleAr ? p.titleAr : p.titleEn}</h3>
        <p class="project-summary">${isAr && p.summaryAr ? p.summaryAr : p.summaryEn}</p>
        <div class="project-deliverables-tags">
          ${p.deliverables.slice(0, 3).map((d) => `<span class="badge badge-gray">${translateDeliverable(d, isAr ? 'ar' : 'en')}</span>`).join('')}
        </div>
      </div>
    </article>
  `).join('');
}

export function filterProjects(category, btn) {
  currentProjectsCategory = category;
  document.querySelectorAll('#projectsFilterBar .filter-btn').forEach((b) => b.classList.remove('active'));
  if (btn) {
    btn.classList.add('active');
  } else {
    document.querySelectorAll('#projectsFilterBar .filter-btn').forEach((b) => {
      const bCat = b.getAttribute('data-cat') || b.textContent.trim();
      if (bCat.toLowerCase() === category.toLowerCase()) {
        b.classList.add('active');
      }
    });
  }
  renderProjectsGrid(category);
}

export async function navigateToIndustry(industry) {
  currentProjectsCategory = industry;
  if (!activeProjects || !activeProjects.length) {
    await loadProjects();
  }
  await navigateTo('/projects', onScreenChange);
  setTimeout(() => {
    filterProjects(industry);
    renderProjectsFilterBar();
    const projectsSec = document.getElementById('screen-projects');
    if (projectsSec) {
      projectsSec.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, 60);
}

export function filterProjectsByKeyword(term) {
  if (!term || term === 'all') {
    currentProjectsCategory = 'all';
    renderProjectsFilterBar();
    renderProjectsGrid('all');
    return;
  }

  const container = document.getElementById('projectsGrid');
  if (!container) return;
  const isAr = getLanguage() === 'ar';

  const termLower = term.toLowerCase();
  const filtered = activeProjects.filter((p) => {
    const indMatch = (p.industryCategory || '').toLowerCase().includes(termLower);
    const delivMatch = (p.deliverables || []).some(d => {
      const dl = d.toLowerCase();
      if (termLower === 'ads' && (/ad|meta|scaling|growth|campaign|tiktok/i.test(dl))) return true;
      if (termLower === 'video' && (/video|commercial|cinema|reel|film|shoot/i.test(dl))) return true;
      if (termLower === 'identity' && (/identity|brand|logo|guide/i.test(dl))) return true;
      if (termLower === 'packaging' && (/packaging|stills|product|design/i.test(dl))) return true;
      if (termLower === 'strategy' && (/strategy|social|web|research|planning/i.test(dl))) return true;
      return dl.includes(termLower);
    });
    const titleMatch = (p.titleEn || '').toLowerCase().includes(termLower) || (p.titleAr || '').includes(term);
    return indMatch || delivMatch || titleMatch;
  });

  if (!filtered.length) {
    container.innerHTML = `<div class="card card-flat" style="grid-column: 1/-1; text-align: center; padding: 48px;">
      <p style="color: var(--text-muted); font-size: 1.1rem;">${isAr ? 'لا توجد مشاريع مطابقة لهذا الفلتر حالياً.' : 'No projects matching this service filter.'}</p>
      <button type="button" class="btn btn-secondary btn-sm" onclick="window.auroraFilterProjects('all')" style="margin-top:12px;">${isAr ? 'عرض جميع المشاريع' : 'Show All Projects'}</button>
    </div>`;
    return;
  }

  container.innerHTML = filtered.map((p) => `
    <article class="project-card" onclick="window.auroraNavigate('/projects/${p.slug}')">
      <div class="project-media-preview">
        <img src="${p.heroImage || p.mediaGallery[0]?.url || '/assets/Image_error.jpg'}" alt="${p.clientName}" loading="lazy" />
      </div>
      <div class="project-body">
        <div class="project-meta-row">
          <span class="badge badge-accent">${translateIndustry(p.industryCategory, isAr ? 'ar' : 'en')}</span>
          <span class="meta-field-label">${p.projectYear}</span>
        </div>
        <h3 class="project-client">${isAr && p.titleAr ? p.titleAr : p.titleEn}</h3>
        <p class="project-summary">${isAr && p.summaryAr ? p.summaryAr : p.summaryEn}</p>
        <div class="project-deliverables-tags">
          ${p.deliverables.map((d) => `<span class="badge badge-gray">${translateDeliverable(d, isAr ? 'ar' : 'en')}</span>`).join('')}
        </div>
      </div>
    </article>
  `).join('');
}

function renderProjectsGrid(category = 'all') {
  currentProjectsCategory = category;
  const container = document.getElementById('projectsGrid');
  if (!container) return;

  const isAr = getLanguage() === 'ar';
  const filtered = category === 'all'
    ? activeProjects
    : activeProjects.filter((p) => p.industryCategory.toLowerCase() === category.toLowerCase());

  if (!filtered.length) {
    container.innerHTML = `<div class="card card-flat" style="grid-column: 1/-1; text-align: center; padding: 48px;">
      <p style="color: var(--text-muted); font-size: 1.1rem;">${isAr ? 'لا توجد مشاريع في هذا القطاع حالياً.' : 'No projects found in this category.'}</p>
    </div>`;
    return;
  }

  container.innerHTML = filtered.map((p) => `
    <article class="project-card" onclick="window.auroraNavigate('/projects/${p.slug}')">
      <div class="project-media-preview">
        <img src="${p.heroImage || p.mediaGallery[0]?.url || '/assets/Image_error.jpg'}" alt="${p.clientName}" loading="lazy" />
      </div>
      <div class="project-body">
        <div class="project-meta-row">
          <span class="badge badge-accent">${translateIndustry(p.industryCategory, isAr ? 'ar' : 'en')}</span>
          <span class="meta-field-label">${p.projectYear}</span>
        </div>
        <h3 class="project-client">${isAr && p.titleAr ? p.titleAr : p.titleEn}</h3>
        <p class="project-summary">${isAr && p.summaryAr ? p.summaryAr : p.summaryEn}</p>
        <div class="project-deliverables-tags">
          ${p.deliverables.map((d) => `<span class="badge badge-gray">${translateDeliverable(d, isAr ? 'ar' : 'en')}</span>`).join('')}
        </div>
      </div>
    </article>
  `).join('');
}

// Video Embed Parser & Sanitizer (Ensures clean playback without Rick Astley or external recommendations)
export function parseYoutubeVideoId(input) {
  if (!input) return '';
  const str = String(input).trim();
  if (!str || str === 'dQw4w9WgXcQ') return '';
  const iframeMatch = str.match(/src=["'](?:https?:)?\/\/www\.youtube\.com\/embed\/([^"&?\/\s]{11})/i);
  if (iframeMatch && iframeMatch[1]) return iframeMatch[1];
  const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i;
  const match = str.match(regex);
  if (match && match[1]) return match[1];
  if (/^[a-zA-Z0-9_-]{11}$/.test(str)) return str;
  return '';
}

export function getYoutubeEmbedUrl(idOrUrl) {
  const id = parseYoutubeVideoId(idOrUrl);
  if (!id) return '';
  return `https://www.youtube.com/embed/${id}?rel=0&modestbranding=1&enablejsapi=1&controls=1`;
}

async function renderCaseStudy(slug) {
  const container = document.getElementById('caseStudyContainer');
  if (!container) return;

  let project = activeProjects.find((p) => p.slug === slug);
  if (!project) {
    try {
      const res = await api.fetchProjectBySlug(slug);
      if (res.success) project = res.data;
    } catch {
      project = null;
    }
  }

  if (!project) {
    container.innerHTML = `<div class="card" style="text-align: center; padding: 60px 20px;">
      <h2>Project Not Found</h2>
      <p style="margin-top: 12px; margin-bottom: 24px;">The requested case study could not be located.</p>
      <button class="btn btn-primary" onclick="window.auroraNavigate('/projects')">Back to Projects</button>
    </div>`;
    return;
  }

  // Block public access to unpublished projects (Requirement C.2.5)
  if (!project.isPublished) {
    container.innerHTML = `
      <div class="card card-flat" style="text-align: center; padding: 60px 24px; max-width: 640px; margin: 40px auto;">
        <span class="badge badge-warning" style="margin-bottom: 16px;">⏳ Pending Live Release</span>
        <h2 style="margin-bottom: 12px;">Project Awaiting Publication</h2>
        <p style="color: var(--text-muted); margin-bottom: 24px; line-height: 1.6;">
          This project is currently in staging review or awaiting live deployment. Once approved by our management team, it will become publicly accessible.
        </p>
        <button class="btn btn-primary" onclick="window.auroraNavigate('/projects')">← Back to All Projects</button>
      </div>
    `;
    return;
  }

  const isAr = getLanguage() === 'ar';
  const heroImg = project.heroImage || project.mediaGallery[0]?.url || '/assets/Image_error.jpg';
  const displayTitle = isAr && project.titleAr ? project.titleAr : project.titleEn;
  const displaySummary = isAr && project.summaryAr ? project.summaryAr : project.summaryEn;

  container.innerHTML = `
    <div style="padding-top: 24px;">
      <a href="/projects" data-link style="display: inline-flex; align-items: center; gap: 6px; font-weight: 600; margin-bottom: 20px;">
        ← ${isAr ? 'العودة للمشاريع' : 'Back to all projects'}
      </a>
    </div>

    <!-- Expanded Hero Photo Banner with Bottom-Left Text Overlay (Requirement 4.2) -->
    <div class="case-study-hero-banner">
      <img src="${heroImg}" alt="${project.clientName}" class="case-study-hero-img" />
      <div class="case-study-hero-overlay">
        <span class="badge badge-teal" style="margin-bottom: 12px;">${translateIndustry(project.industryCategory, isAr ? 'ar' : 'en')}</span>
        <h1>${displayTitle}</h1>
        <p>${displaySummary}</p>
      </div>
    </div>

    <!-- Metadata Grid (Requirement 4.3: Team label) -->
    <div class="case-study-meta-grid">
      <div>
        <div class="meta-field-label">${t('cs.clientLabel')}</div>
        <div class="meta-field-val">${project.clientName}</div>
      </div>
      <div>
        <div class="meta-field-label">${t('cs.industryLabel')}</div>
        <div class="meta-field-val">${translateIndustry(project.industryCategory, isAr ? 'ar' : 'en')}</div>
      </div>
      <div>
        <div class="meta-field-label">${t('cs.yearLabel')}</div>
        <div class="meta-field-val">${project.projectYear}</div>
      </div>
    </div>

    <!-- Responsive YouTube Unlisted Player (Blank if no video) -->
    ${getYoutubeEmbedUrl(project.youtubeId) ? `
    <div class="video-responsive-wrapper">
      <iframe
        src="${getYoutubeEmbedUrl(project.youtubeId)}"
        title="${project.titleEn || 'Project Reel'}"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowfullscreen>
      </iframe>
    </div>
    ` : ''}

    <!-- Structured CSR Grid (Challenge, Solution, Result) -->
    <div class="csr-grid">
      <div class="csr-card">
        <h3><span style="color: var(--status-error);">●</span> ${t('cs.challengeTitle')}</h3>
        <p>${isAr && project.challengeAr ? project.challengeAr : project.challengeEn}</p>
      </div>
      <div class="csr-card">
        <h3><span style="color: var(--accent-action);">●</span> ${t('cs.solutionTitle')}</h3>
        <p>${isAr && project.solutionAr ? project.solutionAr : project.solutionEn}</p>
      </div>
      <div class="csr-card">
        <h3><span style="color: var(--status-success);">●</span> ${t('cs.resultTitle')}</h3>
        <p>${isAr && project.resultAr ? project.resultAr : project.resultEn}</p>
      </div>
    </div>

    <!-- Deliverables (Requirement A.4.3: deliverable-glow-tag) -->
    <div style="margin: 40px 0;">
      <h3 style="margin-bottom: 16px;">${t('cs.deliverablesTitle')}</h3>
      <div style="display: flex; flex-wrap: wrap; gap: 10px;">
        ${project.deliverables.map((d) => `<span class="deliverable-glow-tag">${translateDeliverable(d, isAr ? 'ar' : 'en')}</span>`).join('')}
      </div>
    </div>

    <!-- Media Gallery (Stills) -->
    <div style="margin: 48px 0;">
      <h3 style="margin-bottom: 20px;">${t('cs.galleryTitle')}</h3>
      <div class="gallery-grid">
        ${(project.mediaGallery || []).map((m) => `
          <div class="gallery-item" onclick="window.auroraOpenLightbox('${m.url}', '${m.caption || project.clientName}')">
            <img src="${m.url}" alt="${m.caption || ''}" loading="lazy" />
          </div>
        `).join('')}
      </div>
    </div>

    <!-- Reserved Rights Disclaimer (Requirement 4.5) -->
    <div class="case-study-disclaimer">
      ${isAr
        ? `جميع حقوق الصور والفيديوهات والبيانات محفوظة لمجموعة أورورا و${project.clientName}.`
        : `All photos, videos, and data rights are reserved to Aurora Group and ${project.clientName}.`}
    </div>
  `;
}

// -----------------------------------------------------------------------------
// PUBLIC TEAM DIRECTORY (/team)
// -----------------------------------------------------------------------------
async function renderPublicTeamDirectory() {
  const container = document.getElementById('teamDirectoryContainer');
  if (!container) return;

  const isAr = getLanguage() === 'ar';
  renderSkeletons(container, 3);

  try {
    const res = await api.fetchTeamDirectory();

    // Check if feature toggle is turned off by Super Admin
    if (!res.success || res.enabled === false) {
      container.innerHTML = `
        <div class="card" style="text-align:center; padding:56px 24px; max-width:680px; margin:40px auto; border:1px solid var(--border-default);">
          <div style="font-size:3rem; margin-bottom:16px;">👥</div>
          <h2 style="margin-bottom:12px;">${isAr ? 'دليل الفريق غير متاح حالياً' : 'Team Directory Currently Private'}</h2>
          <p style="color:var(--text-muted); font-size:1.05rem; line-height:1.6; margin-bottom:24px;">
            ${isAr 
              ? 'تم تعطيل عرض الملفات الشخصية لفريق العمل حالياً من قِبل الإدارة. تفضل باستعراض مشاريعنا أو التواصل المباشر معنا.' 
              : 'The public team directory has been made private by management. Explore our selected projects or get in touch with our team directly.'}
          </p>
          <div style="display:flex; justify-content:center; gap:12px; flex-wrap:wrap;">
            <button class="btn btn-primary" onclick="window.auroraNavigate('/projects')">${isAr ? 'استعراض المشاريع' : 'Explore Projects'}</button>
            <button class="btn btn-secondary" onclick="window.auroraNavigate('/contact')">${isAr ? 'تواصل معنا' : 'Contact Us'}</button>
          </div>
        </div>
      `;
      updateTeamNavVisibility(false);
      return;
    }

    updateTeamNavVisibility(true);

    const team = res.data || [];
    if (!team.length) {
      container.innerHTML = `
        <div class="card" style="text-align:center; padding:48px 20px; max-width:600px; margin:40px auto;">
          <h3>${isAr ? 'لا يوجد أعضاء متاحين للعرض حالياً' : 'No Public Profiles Available'}</h3>
          <p style="color:var(--text-muted); margin-top:8px;">${isAr ? 'يرجى مراجعة الموقع لاحقاً.' : 'Please check back soon.'}</p>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div class="grid grid-3" style="gap:28px;">
        ${team.map(m => `
          <article class="project-card team-card" onclick="window.auroraNavigate('/team/${m.slug || m.id}')" style="cursor:pointer; display:flex; flex-direction:column; justify-content:space-between; height:100%; transition:all 0.25s ease;" onmouseover="this.style.transform='translateY(-4px)'; this.style.boxShadow='var(--shadow-hover)';" onmouseout="this.style.transform='none'; this.style.boxShadow='none';">
            <div class="project-body" style="padding:32px 24px; display:flex; flex-direction:column; align-items:center; text-align:center; flex:1;">
              <div style="position:relative; margin-bottom:18px;">
                <img src="${m.photo || '/assets/Image_error.jpg'}" alt="${m.name}" style="width:110px; height:110px; border-radius:50%; object-fit:cover; border:3px solid var(--accent-action); box-shadow:0 8px 24px rgba(106,0,244,0.18);" onerror="this.src='/assets/Image_error.jpg'" loading="lazy">
                ${(m.clipsCount > 0 || (m.portfolioClips && m.portfolioClips.length > 0)) ? `
                  <span class="badge badge-accent" style="position:absolute; bottom:-6px; left:50%; transform:translateX(-50%); font-size:10px; padding:2px 8px; white-space:nowrap; box-shadow:0 2px 6px rgba(0,0,0,0.2);">🎬 ${(m.clipsCount || m.portfolioClips?.length)} ${isAr ? 'عمل مميز' : 'Featured Clips'}</span>
                ` : ''}
              </div>
              
              <span class="badge badge-accent" style="margin-bottom:10px; font-size:11px; padding:4px 10px;">${m.department || (isAr ? 'الإبداع والتنفيذ' : 'Creative & Production')}</span>
              
              <h3 style="margin:0 0 6px 0; font-size:1.25rem; font-weight:700; color:var(--text-primary);">${m.name}</h3>
              
              <p style="color:var(--text-muted); font-size:0.92rem; font-weight:500; margin:0 0 12px 0;">${m.title || ''}</p>
              
              <p style="color:var(--text-secondary); font-size:0.88rem; line-height:1.55; margin:0 0 16px 0; display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; overflow:hidden;">
                ${isAr && m.bioAr ? m.bioAr : (m.bioEn || '')}
              </p>
            </div>
            
            <div style="padding:14px 24px; border-top:1px solid var(--border-default); background:var(--surface-sunken); display:flex; justify-content:space-between; align-items:center;">
              <span style="font-size:0.8rem; color:var(--text-muted); font-weight:500;">
                ${m.role === 'super_admin' ? (isAr ? 'الإدارة العليا' : 'Leadership') : (isAr ? 'أخصائي معتمد' : 'Specialist')}
              </span>
              <span style="color:var(--accent-action); font-weight:600; font-size:0.88rem; display:flex; align-items:center; gap:4px;">
                ${isAr ? 'عرض الملف الشخصي ←' : 'View Profile →'}
              </span>
            </div>
          </article>
        `).join('')}
      </div>
    `;
  } catch (err) {
    console.error('Failed to load team directory:', err);
    container.innerHTML = `
      <div class="card" style="text-align:center; padding:40px 20px;">
        <p style="color:var(--text-muted);">${isAr ? 'حدث خطأ أثناء تحميل الدليل.' : 'Unable to load team directory at this moment.'}</p>
        <button class="btn btn-secondary" onclick="renderPublicTeamDirectory()" style="margin-top:12px;">${isAr ? 'إعادة المحاولة' : 'Try Again'}</button>
      </div>
    `;
  }
}

// -----------------------------------------------------------------------------
// PUBLIC TEAM MEMBER PROFILE (/team/:slug) (Requirement B.1.1)
// -----------------------------------------------------------------------------
async function renderPublicTeamProfile(slug) {
  const container = document.getElementById('teamProfileContainer');
  if (!container) return;

  const isAr = getLanguage() === 'ar';
  container.innerHTML = `<div style="text-align:center; padding:60px 20px; color:var(--text-muted);"><span class="spinner"></span> ${isAr ? 'جاري التحميل...' : 'Loading profile...'}</div>`;

  try {
    const res = await api.fetchPublicProfile(slug || 'omar-hassan');
    if (!res.success) {
      const isFeatureDisabled = res.error && res.error.toLowerCase().includes('disabled');
      container.innerHTML = `<div class="card" style="text-align:center; padding:56px 20px; max-width:640px; margin:40px auto; border:1px solid var(--border-default);">
        <div style="font-size:3rem; margin-bottom:16px;">${isFeatureDisabled ? '👥' : '🔍'}</div>
        <h2 style="margin-bottom:12px;">${isFeatureDisabled ? (isAr ? 'دليل الفريق غير متاح حالياً' : 'Team Directory Currently Private') : (isAr ? 'عضو الفريق غير موجود' : 'Team Member Not Found')}</h2>
        <p style="color:var(--text-muted); font-size:1rem; line-height:1.6; margin-bottom:24px;">
          ${isFeatureDisabled 
            ? (isAr ? 'تم تعطيل عرض الملفات الشخصية العامة للفريق بواسطة إدارة النظام.' : 'Public team profiles are currently turned off by system administration.') 
            : (isAr ? 'هذا الملف الشخصي غير نشط أو غير متوفر حالياً.' : 'This public team profile is currently inactive or not available.')}
        </p>
        <div style="display:flex; justify-content:center; gap:12px; flex-wrap:wrap;">
          <button class="btn btn-secondary" onclick="window.auroraNavigate('/team')">${isAr ? '→ دليل الفريق' : '← All Team Members'}</button>
          <button class="btn btn-primary" onclick="window.auroraNavigate('/')">${isAr ? 'الرئيسية' : 'Return to Home'}</button>
        </div>
      </div>`;
      return;
    }

    const { user, projects } = res;

    container.innerHTML = `
      <div style="margin-bottom:24px; display:flex; justify-content:space-between; align-items:center;">
        <button class="btn btn-secondary btn-sm" onclick="window.auroraNavigate('/team')">
          ${isAr ? '→ جميع أعضاء الفريق' : '← All Team Members'}
        </button>
      </div>

      <div class="card" style="margin-bottom:40px; padding:36px; border:1px solid var(--border-default);">
        <div style="display:flex; gap:28px; align-items:center; flex-wrap:wrap;">
          <img src="${user.photo || '/assets/Image_error.jpg'}" alt="${user.name}" style="width:110px; height:110px; border-radius:50%; object-fit:cover; border:3px solid var(--accent-action); box-shadow:0 8px 24px rgba(106,0,244,0.18);" onerror="this.src='/assets/Image_error.jpg'">
          <div>
            <span class="badge badge-accent" style="margin-bottom:8px;">${user.department || (isAr ? 'فريق العمل' : 'Team Member')}</span>
            <h1 style="margin-bottom:6px;">${user.name}</h1>
            <p style="font-size:1.1rem; color:var(--text-muted); margin-bottom:12px;">${user.title || ''}</p>
            <p style="max-width:720px; font-size:1rem; line-height:1.6; color:var(--text-secondary);">${isAr && user.bioAr ? user.bioAr : (user.bioEn || '')}</p>
          </div>
        </div>
      </div>

      <div>
        <h2 style="margin-bottom:24px;">${isAr ? `الأعمال المعتمدة باسم ${user.name}` : `Credited Works by ${user.name}`}</h2>
        
        ${(() => {
          const isAccountManager = (user.title || '').toLowerCase().includes('account manager');

          if (isAccountManager) {
            // Full Projects for Account Managers
            return `
              <div class="grid grid-3">
                ${projects && projects.length ? projects.map(p => `
                  <article class="project-card" onclick="window.auroraNavigate('/projects/${p.slug}')" style="cursor:pointer;">
                    <div class="project-media-preview">
                      <img src="${p.heroImage || (p.mediaGallery && p.mediaGallery[0]?.url) || '/assets/Image_error.jpg'}" alt="${p.clientName}" loading="lazy" onerror="this.src='/assets/Image_error.jpg'" />
                    </div>
                    <div class="project-body">
                      <div class="project-meta-row">
                        <span class="badge badge-accent">${p.industryCategory}</span>
                        <span class="meta-field-label">${p.projectYear}</span>
                      </div>
                      <h3 class="project-client">${isAr && p.titleAr ? p.titleAr : p.titleEn}</h3>
                      <p class="project-summary">${isAr && p.summaryAr ? p.summaryAr : p.summaryEn}</p>
                    </div>
                  </article>
                `).join('') : `<p style="color:var(--text-muted); grid-column:1/-1;">${isAr ? 'لا توجد مشاريع مسجلة حالياً.' : 'No projects credited yet.'}</p>`}
              </div>
            `;
          }

          // Pieces of Content for Creative / Production / Editing Staff
          let piecesOfContent = (user.portfolioClips && user.portfolioClips.length) ? [...user.portfolioClips] : [];

          // Extract pieces from credited projects if employee hasn't handpicked clips yet
          if (!piecesOfContent.length && projects && projects.length) {
            projects.forEach(p => {
              const gallery = (p.mediaGallery && p.mediaGallery.length) ? p.mediaGallery : [
                { type: 'photo', url: p.heroImage || '/assets/Image_error.jpg', caption: isAr ? (p.titleAr || p.titleEn) : p.titleEn }
              ];
              gallery.forEach((g, idx) => {
                piecesOfContent.push({
                  id: `${p.id}_clip_${idx}`,
                  projectId: p.id,
                  projectSlug: p.slug,
                  projectTitle: isAr ? (p.titleAr || p.titleEn) : p.titleEn,
                  clientName: p.clientName,
                  url: g.url,
                  caption: g.caption || (isAr ? (p.titleAr || p.titleEn) : p.titleEn),
                  type: g.type || 'photo'
                });
              });
            });
          }

          return `
            <div class="grid grid-3">
              ${piecesOfContent && piecesOfContent.length ? piecesOfContent.map(clip => `
                <article class="project-card" style="cursor: pointer; overflow:hidden;" onclick="window.auroraOpenLightbox('${clip.url}', '${(clip.caption || '').replace(/'/g, "\\'")}')">
                  <div class="project-media-preview" style="height: 220px; position:relative;">
                    <img src="${clip.url}" alt="${clip.caption || 'Content Piece'}" loading="lazy" onerror="this.src='/assets/Image_error.jpg'" style="width:100%; height:100%; object-fit:cover;" />
                    <span class="badge badge-teal" style="position:absolute; top:12px; ${isAr ? 'right:12px' : 'left:12px'}; z-index:2; backdrop-filter:blur(8px); background:rgba(0, 240, 255, 0.2); border:1px solid rgba(0, 240, 255, 0.4); color:#00f0ff;">
                      ${isAr ? 'قطعة محتوى معتمدة' : 'Piece of Content'}
                    </span>
                  </div>
                  <div class="project-body" style="padding:16px;">
                    <h3 class="project-client" style="margin: 0 0 6px 0; font-size: 1.05rem; line-height:1.4;">${clip.caption || (isAr ? 'محتوى معتمد' : 'Credited Content Piece')}</h3>
                    ${clip.clientName ? `<p class="meta-field-label" style="margin:0; font-size:0.85rem; color:var(--text-muted);">${isAr ? 'العميل: ' : 'Client: '}${clip.clientName}</p>` : ''}
                    <div style="margin-top:12px; display:flex; justify-content:space-between; align-items:center;">
                      <span style="font-size:0.82rem; color:var(--brand-electric-teal); display:inline-flex; align-items:center; gap:4px;">
                        <span>🔍</span> ${isAr ? 'عرض بدقة عالية' : 'View Full Media'}
                      </span>
                      ${clip.projectSlug ? `<button type="button" class="btn btn-secondary btn-sm" style="padding:4px 10px; font-size:0.8rem;" onclick="event.stopPropagation(); window.auroraNavigate('/projects/${clip.projectSlug}')">${isAr ? 'المشروع الكامل' : 'Full Project'}</button>` : ''}
                    </div>
                  </div>
                </article>
              `).join('') : `<p style="color:var(--text-muted); grid-column:1/-1;">${isAr ? 'لا توجد قطع محتوى مسجلة حالياً.' : 'No pieces of content credited yet.'}</p>`}
            </div>
          `;
        })()}
      </div>
    `;
  } catch (err) {
    console.error('Failed to load public profile:', err);
    container.innerHTML = `<div class="card" style="text-align:center; padding:48px 20px;">
      <h2>${isAr ? 'خطأ في تحميل الملف الشخصي' : 'Error Loading Profile'}</h2>
      <p style="margin-top:12px; color:var(--text-muted);">${err.message}</p>
      <button class="btn btn-secondary" onclick="window.auroraNavigate('/team')" style="margin-top:16px;">${isAr ? '→ دليل الفريق' : '← All Team Members'}</button>
    </div>`;
  }
}


// -----------------------------------------------------------------------------
// PUBLIC CONTACT INQUIRY
// -----------------------------------------------------------------------------
async function handleContactSubmit(e) {
  e.preventDefault();
  const form = e.target;
  const submitBtn = form.querySelector('button[type="submit"]');

  submitBtn.disabled = true;
  submitBtn.textContent = 'Submitting...';

  const services = Array.from(form.querySelectorAll('input[name="services"]:checked')).map((c) => c.value);

  const payload = {
    fullName: form.fullName.value,
    brandName: form.brandName.value,
    phone: form.phone.value,
    email: form.email.value,
    services,
    industry: form.industry.value,
    budget: form.budget.value,
    message: form.message.value,
    honeypot: form.hp?.value || ''
  };

  try {
    const res = await api.submitContactInquiry(payload);
    if (res.success) {
      document.getElementById('contactFormBox').style.display = 'none';
      document.getElementById('contactSuccessBox').style.display = 'block';
    } else {
      alert(res.error || 'Failed to submit inquiry.');
      submitBtn.disabled = false;
      submitBtn.textContent = t('contact.submit');
    }
  } catch (err) {
    alert('Network error. Please try again.');
    submitBtn.disabled = false;
    submitBtn.textContent = t('contact.submit');
  }
}

export function resetContactForm() {
  const form = document.getElementById('contactForm');
  if (form) form.reset();
  document.getElementById('contactFormBox').style.display = 'block';
  document.getElementById('contactSuccessBox').style.display = 'none';
}

// -----------------------------------------------------------------------------
// HIDDEN CLIENT BRIEF 6-STEP WIZARD (/brief/:token)
// -----------------------------------------------------------------------------
let currentBriefClientName = '';

async function setupBriefScreen(token) {
  currentBriefToken = token;
  const greetingEl = document.getElementById('briefClientGreeting') || document.getElementById('briefClientWelcome');
  const errorBox = document.getElementById('briefErrorBox');
  const wizardBox = document.getElementById('briefWizardBox');

  currentBriefStep = 1;

  try {
    const res = await api.fetchBriefMetadata(token);
    if (!res.success) {
      if (wizardBox) wizardBox.style.display = 'none';
      if (errorBox) {
        errorBox.style.display = 'block';
        errorBox.innerHTML = `<h3>Invalid Invitation Link</h3><p>${res.error || 'This brief link does not exist.'}</p>`;
      }
      return;
    }

    const { clientName, brandName, isExpired, isSubmitted, status } = res.data;

    if (status === 'deactivated') {
      if (wizardBox) wizardBox.style.display = 'none';
      if (errorBox) {
        errorBox.style.display = 'block';
        errorBox.innerHTML = `<h3>Link Deactivated</h3><p>This invitation link has been deactivated by the Aurora management team.</p>`;
      }
      return;
    }

    if (isExpired) {
      if (wizardBox) wizardBox.style.display = 'none';
      if (errorBox) {
        errorBox.style.display = 'block';
        errorBox.innerHTML = `<h3>Brief Invitation Expired</h3><p>This private discovery link has expired. Please contact Aurora Group for an updated link.</p>`;
      }
      return;
    }

    if (isSubmitted) {
      if (wizardBox) wizardBox.style.display = 'none';
      if (errorBox) {
        errorBox.style.display = 'block';
        errorBox.innerHTML = `<h3>Brief Already Submitted</h3><p>Thank you! Your discovery details were already recorded. We look forward to meeting you at Sharks Office Space.</p>`;
      }
      return;
    }

    if (wizardBox) wizardBox.style.display = 'block';
    if (errorBox) errorBox.style.display = 'none';
    currentBriefClientName = clientName || '';
    if (greetingEl) {
      const isAr = getLanguage() === 'ar';
      greetingEl.textContent = isAr
        ? `مرحباً ${currentBriefClientName || 'شريكنا العزيز'}`
        : `Hello ${currentBriefClientName || 'Partner'}`;
    }

    // Restore draft & saved step if saved
    try {
      const draft = localStorage.getItem('aurora_brief_draft_' + token);
      const f = document.getElementById('briefForm');
      if (draft && f) {
        const data = JSON.parse(draft);
        if (data._savedStep && Number(data._savedStep) >= 1 && Number(data._savedStep) <= TOTAL_BRIEF_STEPS) {
          currentBriefStep = Number(data._savedStep);
        }
        Object.keys(data).forEach(key => {
          if (key === '_savedStep') return;
          const field = f[key] || document.getElementById(key);
          if (field) {
            if (field instanceof RadioNodeList || field.type === 'radio') {
              const radio = f.querySelector(`input[name="${key}"][value="${data[key]}"]`);
              if (radio) {
                radio.checked = true;
                if (key === 'meetVenue') updateVenueSelect(radio);
              }
            } else if (field.type === 'checkbox') {
              field.checked = !!data[key];
            } else {
              field.value = data[key];
            }
          }
        });
      } else if (f) {
        if (f.briefFullName && !f.briefFullName.value && clientName) f.briefFullName.value = clientName;
        if (f.briefBrandName && !f.briefBrandName.value && brandName) f.briefBrandName.value = brandName;
      }
    } catch (e) {
      console.warn('Could not restore brief draft:', e);
    }

    updateBriefStepUI(false);
    bindBriefRealtimeUnlockListeners();
  } catch (err) {
    console.error('Failed to verify brief token:', err);
  }
}

const BRIEF_LOCK_SVG = `<svg viewBox="0 0 12 12" width="8" height="8" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="5.5" width="7" height="5" rx="1.2"/><path d="M4 5.5V3.8a2 2 0 0 1 4 0v1.7"/></svg>`;
const BRIEF_UNLOCK_SVG = `<svg viewBox="0 0 12 12" width="8" height="8" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="5.5" width="7" height="5" rx="1.2"/><path d="M4 5.5V3.5a2 2 0 0 1 3.8-.7"/></svg>`;
const BRIEF_TICK_SVG = `<svg viewBox="0 0 12 12" width="8" height="8" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 6.3L5 8.8L9.5 3.5"/></svg>`;

let briefStepCompletionCache = {};
let briefStepUnlockedCache = {};
let briefListenersBound = false;

function isBriefStepComplete(stepNum) {
  const stepEl = document.getElementById(`briefStep${stepNum}`);
  if (!stepEl) return false;
  const requiredFields = stepEl.querySelectorAll('[required]');
  for (const field of requiredFields) {
    if (field.type === 'radio') {
      const checked = stepEl.querySelector(`input[name="${field.name}"]:checked`);
      if (!checked) return false;
    } else {
      const val = (field.value || '').trim();
      if (!val) return false;
      if (typeof field.checkValidity === 'function' && !field.checkValidity()) return false;
    }
  }
  return true;
}

function isBriefStepUnlocked(stepNum) {
  if (stepNum <= 1) return true;
  for (let s = 1; s < stepNum; s++) {
    if (!isBriefStepComplete(s)) return false;
  }
  return true;
}

function updateBriefStepperBoxes(animateTransitions = false) {
  document.querySelectorAll('#briefStepBoxes .brief-step-box').forEach((box) => {
    const stepNum = Number(box.getAttribute('data-step'));
    const completed = isBriefStepComplete(stepNum);
    const unlocked = isBriefStepUnlocked(stepNum);
    const isActive = stepNum === currentBriefStep;

    const wasCompleted = !!briefStepCompletionCache[stepNum];
    const wasUnlocked = briefStepUnlockedCache[stepNum] !== undefined ? !!briefStepUnlockedCache[stepNum] : (stepNum === 1);

    box.classList.toggle('active', isActive);
    box.classList.toggle('completed', completed);
    box.classList.toggle('unlocked', unlocked && !completed && !isActive);
    box.classList.toggle('locked', !unlocked && !isActive);

    const badge = box.querySelector('.step-box-badge');
    if (badge) {
      if (completed) {
        badge.innerHTML = BRIEF_TICK_SVG;
        if (animateTransitions && !wasCompleted) {
          box.classList.remove('just-completed');
          void box.offsetWidth;
          box.classList.add('just-completed');
          setTimeout(() => box.classList.remove('just-completed'), 450);
        }
      } else if (!unlocked) {
        badge.innerHTML = BRIEF_LOCK_SVG;
      } else if (animateTransitions && !wasUnlocked && unlocked) {
        badge.innerHTML = BRIEF_UNLOCK_SVG;
        box.classList.remove('just-unlocked');
        void box.offsetWidth;
        box.classList.add('just-unlocked');
        setTimeout(() => {
          box.classList.remove('just-unlocked');
          if (!isBriefStepComplete(stepNum) && isBriefStepUnlocked(stepNum)) {
            badge.innerHTML = '';
          }
        }, 650);
      } else {
        badge.innerHTML = '';
      }
    }

    briefStepCompletionCache[stepNum] = completed;
    briefStepUnlockedCache[stepNum] = unlocked;
  });

  // Update progress bar fill across the 6 step boxes (1..6)
  const bar = document.getElementById('briefProgressBar') || document.getElementById('briefProgressBarFill');
  if (bar) {
    const trackFillPercent = TOTAL_BRIEF_STEPS > 1
      ? Math.round(((currentBriefStep - 1) / (TOTAL_BRIEF_STEPS - 1)) * 100)
      : 100;
    bar.style.width = `${trackFillPercent}%`;
  }
}

function bindBriefRealtimeUnlockListeners() {
  if (briefListenersBound) return;
  const f = document.getElementById('briefForm');
  if (!f) return;
  briefListenersBound = true;

  const onFieldUpdate = () => {
    updateBriefStepperBoxes(true);
  };
  f.addEventListener('input', onFieldUpdate);
  f.addEventListener('change', onFieldUpdate);
}

const BRIEF_STEP_TITLES = [
  'Contact & Brand Basics',
  'Your Business Model',
  'Strategic 6-Month Goals',
  'Current Digital Assets',
  'Competitors & Visual Taste',
  'Planning Our Strategy Meeting'
];

const BRIEF_STEP_TITLES_AR = [
  'بيانات التواصل والأساسيات',
  'نموذج العمل والنشاط التجاري',
  'الأهداف الاستراتيجية خلال 6 أشهر',
  'الأصول الرقمية والهوية الحالية',
  'المنافسون والذوق البصري',
  'الترتيب لاجتماع التخطيط الاستراتيجي'
];

function updateBriefStepUI(shouldScroll = true) {
  const isAr = getLanguage() === 'ar';

  const greetingEl = document.getElementById('briefClientGreeting') || document.getElementById('briefClientWelcome');
  if (greetingEl) {
    greetingEl.textContent = isAr
      ? `مرحباً ${currentBriefClientName || 'شريكنا العزيز'}`
      : `Hello ${currentBriefClientName || 'Partner'}`;
  }

  for (let i = 1; i <= TOTAL_BRIEF_STEPS; i++) {
    const stepEl = document.getElementById(`briefStep${i}`);
    if (stepEl) {
      stepEl.classList.toggle('active', i === currentBriefStep);
    }
  }

  // Reset cache when initial load (shouldScroll === false) so locks/ticks render cleanly
  if (!shouldScroll) {
    briefStepCompletionCache = {};
    briefStepUnlockedCache = {};
  }
  updateBriefStepperBoxes(shouldScroll);

  const percent = Math.round((currentBriefStep / TOTAL_BRIEF_STEPS) * 100);
  const label = document.getElementById('briefStepLabel') || document.getElementById('briefProgressStepLabel');
  const percentText = document.getElementById('briefPercent') || document.getElementById('briefProgressPercent');

  if (percentText) percentText.textContent = `${percent}%`;
  if (label) {
    label.textContent = isAr
      ? `الخطوة ${currentBriefStep} من ${TOTAL_BRIEF_STEPS}: ${BRIEF_STEP_TITLES_AR[currentBriefStep - 1] || ''}`
      : `Step ${currentBriefStep} of ${TOTAL_BRIEF_STEPS}: ${BRIEF_STEP_TITLES[currentBriefStep - 1] || ''}`;
  }

  const prevBtn = document.getElementById('briefPrevBtn');
  const nextBtn = document.getElementById('briefNextBtn');
  const submitBtn = document.getElementById('briefSubmitBtn');

  if (prevBtn) prevBtn.style.visibility = currentBriefStep > 1 ? 'visible' : 'hidden';
  if (nextBtn) nextBtn.style.display = currentBriefStep < TOTAL_BRIEF_STEPS ? 'inline-flex' : 'none';
  if (submitBtn) submitBtn.style.display = currentBriefStep === TOTAL_BRIEF_STEPS ? 'inline-flex' : 'none';

  if (shouldScroll) {
    const briefSec = document.getElementById('screen-brief');
    if (briefSec) {
      briefSec.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }
}

function validateBriefStepRequired(stepNum) {
  const isAr = getLanguage() === 'ar';
  const stepEl = document.getElementById(`briefStep${stepNum}`);
  if (!stepEl) return true;

  const requiredFields = stepEl.querySelectorAll('[required]');
  for (const field of requiredFields) {
    if (field.type === 'radio') {
      const checked = stepEl.querySelector(`input[name="${field.name}"]:checked`);
      if (!checked) {
        if (currentBriefStep !== stepNum) {
          currentBriefStep = stepNum;
          updateBriefStepUI(false);
        }
        field.focus();
        showToastNotification(
          isAr
            ? 'يرجى اختيار إحدى الإجابات المطلوبة (*) قبل الانتقال للخطوة التالية.'
            : 'Please select one of the required (*) options before proceeding to the next step.',
          'warning',
          2600
        );
        return false;
      }
      continue;
    }
    const val = (field.value || '').trim();
    if (!val || (typeof field.checkValidity === 'function' && !field.checkValidity())) {
      if (currentBriefStep !== stepNum) {
        currentBriefStep = stepNum;
        updateBriefStepUI(false);
      }
      field.focus();
      field.style.borderColor = 'var(--status-error, #FF1744)';
      field.addEventListener('input', () => {
        field.style.borderColor = '';
      }, { once: true });
      if (typeof field.reportValidity === 'function') {
        field.reportValidity();
      }
      showToastNotification(
        isAr
          ? 'يرجى ملء جميع الحقول المطلوبة (*) بشكل صحيح قبل الانتقال للخطوة التالية.'
          : 'Please complete all required (*) fields before proceeding to the next step.',
        'warning',
        2600
      );
      return false;
    }
  }
  return true;
}

export function goToBriefStep(targetStep) {
  const step = Number(targetStep);
  if (!step || step < 1 || step > TOTAL_BRIEF_STEPS || step === currentBriefStep) return;

  // When jumping forward, ensure all previous slides are completed & unlocked
  if (step > currentBriefStep) {
    for (let s = 1; s < step; s++) {
      if (!isBriefStepComplete(s)) {
        const lockedBox = document.querySelector(`#briefStepBoxes .brief-step-box[data-step="${step}"]`);
        if (lockedBox) {
          lockedBox.classList.remove('shake-locked');
          void lockedBox.offsetWidth;
          lockedBox.classList.add('shake-locked');
          setTimeout(() => lockedBox.classList.remove('shake-locked'), 400);
        }
        validateBriefStepRequired(s);
        return;
      }
    }
  }

  currentBriefStep = step;
  saveBriefDraft(true);
  updateBriefStepUI(true);
}

export function nextBriefStep() {
  if (!validateBriefStepRequired(currentBriefStep)) {
    return;
  }

  if (currentBriefStep < TOTAL_BRIEF_STEPS) {
    currentBriefStep++;
    saveBriefDraft(true);
    updateBriefStepUI(true);
  }
}

export function prevBriefStep() {
  if (currentBriefStep > 1) {
    currentBriefStep--;
    saveBriefDraft(true);
    updateBriefStepUI(true);
  }
}

export function saveBriefDraft(silent = false) {
  const isAr = getLanguage() === 'ar';
  if (!currentBriefToken) {
    if (!silent) {
      showToastNotification(
        isAr ? 'لا توجد جلسة استبيان نشطة للحفظ.' : 'No active brief session to save.',
        'warning',
        2200
      );
    }
    return;
  }
  const f = document.getElementById('briefForm');
  if (!f) return;

  const data = { _savedStep: currentBriefStep };
  const elements = f.elements;
  for (let i = 0; i < elements.length; i++) {
    const el = elements[i];
    if (el.name) {
      if (el.type === 'radio') {
        if (el.checked) data[el.name] = el.value;
      } else if (el.type === 'checkbox') {
        data[el.name] = el.checked;
      } else {
        data[el.name] = el.value;
      }
    }
  }

  localStorage.setItem('aurora_brief_draft_' + currentBriefToken, JSON.stringify(data));
  if (!silent) {
    showToastNotification(
      isAr
        ? `تم حفظ بياناتك والخطوة الحالية (الخطوة ${currentBriefStep} من ${TOTAL_BRIEF_STEPS}). يمكنك المتابعة في أي وقت.`
        : `Progress and current step (Step ${currentBriefStep} of ${TOTAL_BRIEF_STEPS}) saved. You will resume right from here.`,
      'success',
      2500
    );
  }
}

export function updateVenueSelect(radio) {
  const officeCard = document.getElementById('venueCardOffice');
  const meetCard = document.getElementById('venueCardMeet');
  if (officeCard && meetCard) {
    if (radio.value === 'Sharks Office Space') {
      officeCard.classList.add('selected');
      meetCard.classList.remove('selected');
    } else {
      officeCard.classList.remove('selected');
      meetCard.classList.add('selected');
    }
  }
}

export async function submitBriefForm() {
  for (let s = 1; s <= TOTAL_BRIEF_STEPS; s++) {
    if (!validateBriefStepRequired(s)) {
      return;
    }
  }
  const submitBtn = document.getElementById('briefSubmitBtn');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting Brief & Meeting Details...';
  }

  const f = document.getElementById('briefForm');
  const radioAsset = f ? f.querySelector('input[name="assetsReady"]:checked') : null;
  const radioVenue = f ? f.querySelector('input[name="meetVenue"]:checked') : null;

  const payload = {
    fullName: f?.briefFullName?.value || '',
    role: f?.briefRole?.value || '',
    brandName: f?.briefBrandName?.value || '',
    phone: f?.briefPhone?.value || '',
    email: f?.briefEmail?.value || '',
    budget: f?.briefBudget?.value || '',
    businessModel: f?.briefProducts?.value || '',
    yearsInOperation: f?.briefYears?.value || '',
    branches: f?.briefBranches?.value || '',
    differentiator: f?.briefDifferentiator?.value || '',
    primaryGoals: f?.briefMainGoal?.value || '',
    kpis: f?.briefKpis?.value || '',
    digitalAssetsLinks: f?.briefSocialLinks?.value || '',
    assetsReady: radioAsset?.value || 'Yes, complete vector files',
    driveLink: f?.briefDriveLink?.value || '',
    competitors: f?.briefTasteLikes?.value || '',
    visualTasteDislikes: f?.briefTasteDislikes?.value || '',
    meetVenue: radioVenue?.value || 'Sharks Office Space',
    meetingDatePreference: f?.briefMeetingDate?.value || '',
    meetingAttendees: f?.briefAttendees?.value || ''
  };

  try {
    const res = await api.submitBrief(currentBriefToken, payload);
    if (res.success) {
      localStorage.removeItem('aurora_brief_draft_' + currentBriefToken);
      const wiz = document.getElementById('briefWizardBox');
      const succ = document.getElementById('briefSuccessBox');
      if (wiz) wiz.style.display = 'none';

      // Populate clean inline summary details under the centered 1-6 line & circular animation
      const isAr = getLanguage() === 'ar';
      const metaGrid = document.getElementById('briefSubmittedMetaGrid');
      if (metaGrid) {
        metaGrid.innerHTML = `
          <span><strong>${escapeHtml(payload.fullName)}</strong> · ${escapeHtml(payload.brandName)}</span>
        `;
      }

      const venueBadge = document.getElementById('briefSuccessVenueBadge');
      if (venueBadge) {
        if (payload.meetVenue === 'Google Meet') {
          venueBadge.removeAttribute('data-i18n');
          venueBadge.textContent = isAr
            ? 'مكان الاجتماع: اجتماع فيديو أونلاين عبر Google Meet'
            : 'Meeting Venue: Online Google Meet Video Call';
        } else {
          venueBadge.setAttribute('data-i18n', 'kyc.successVenue');
          venueBadge.textContent = t('kyc.successVenue');
        }
      }

      if (succ) {
        succ.style.display = 'flex';
        succ.classList.remove('play-anim');
        void succ.offsetWidth;
        succ.classList.add('play-anim');
      }
      if (typeof refreshBriefs === 'function') {
        refreshBriefs(false).catch(() => {});
      }
      try {
        localStorage.setItem('aurora_last_brief_submission', JSON.stringify({ token: currentBriefToken, time: Date.now() }));
      } catch {}
    } else {
      showToastNotification(res.error || 'Failed to submit discovery brief.', 'error');
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit Brief & Lock In Meeting';
      }
    }
  } catch (err) {
    showToastNotification('Network error submitting brief: ' + err.message, 'error');
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Submit Brief & Lock In Meeting';
    }
  }
}

// -----------------------------------------------------------------------------
// AUTHENTICATION & LOGIN (100% Firebase Auth Powered — Zero-to-Hero)
// -----------------------------------------------------------------------------
const SESSION_TIMEOUT_MS = 15 * 60 * 1000; // 15-minute session inactivity limit (matches server-side)
let lastRecordedActivity = 0;

export function recordUserActivity() {
  const now = Date.now();
  if (now - lastRecordedActivity > 3000) {
    lastRecordedActivity = now;
    localStorage.setItem('aurora_last_activity', now.toString());
  }
}

export async function handleSessionTimeoutLogout() {
  const stored = localStorage.getItem('aurora_current_user');
  if (!stored) return;

  // Auto-save any active portfolio project draft before wiping session
  try {
    const addWorkModal = document.getElementById('addWorkDrawer');
    if (addWorkModal && addWorkModal.classList.contains('active') && typeof saveProjectDraftManual === 'function') {
      saveProjectDraftManual(true);
    }
  } catch {}

  currentUser = null;
  localStorage.removeItem('aurora_current_user');
  localStorage.removeItem('aurora_last_activity');
  sessionStorage.clear();
  sessionStorage.setItem('aurora_login_notice', 'timeout');

  // Clear all form fields & preloaded tables
  document.querySelectorAll('form').forEach(f => { try { f.reset(); } catch {} });

  await Promise.allSettled([
    api.logoutUser(),
    firebaseAuth.firebaseSignOut()
  ]);

  // Hard reload to /login so no pretyped or preloaded memory state remains
  window.location.replace('/login');
}

export function checkSessionInactivity() {
  const stored = localStorage.getItem('aurora_current_user');
  if (!stored) return;

  const last = parseInt(localStorage.getItem('aurora_last_activity') || '0', 10);
  if (last && (Date.now() - last > SESSION_TIMEOUT_MS)) {
    handleSessionTimeoutLogout();
  }
}

export function showLoginNotice(type, customMsg = null) {
  const box = document.getElementById('loginNoticeBox');
  if (!box) return;
  const isAr = getLanguage() === 'ar';

  box.style.display = 'block';
  if (type === 'timeout') {
    box.style.background = 'rgba(255, 179, 0, 0.15)';
    box.style.border = '1px solid rgba(255, 179, 0, 0.4)';
    box.style.color = '#ffb300';
    box.innerHTML = isAr 
      ? '⚠️ انتهت صلاحية جلستك بسبب عدم النشاط لمدة 10 دقائق. يرجى تسجيل الدخول مجدداً للمتابعة.' 
      : '⚠️ Your session has timed out after 10 minutes of inactivity. Please sign in again to continue.';
  } else if (type === 'reset_logout') {
    box.style.background = 'rgba(0, 240, 255, 0.15)';
    box.style.border = '1px solid rgba(0, 240, 255, 0.4)';
    box.style.color = 'var(--brand-electric-teal)';
    box.innerHTML = isAr
      ? '🔑 تم إرسال رابط إعادة تعيين كلمة المرور إلى بريدك الإلكتروني! تم تسجيل الخروج من كافة الجلسات النشطة لحماية حسابك.'
      : '🔑 Password reset link dispatched to your email! All active sessions have been terminated for security. Please set your new password, then sign in.';
  } else if (type === 'error') {
    box.style.background = 'rgba(255, 71, 87, 0.15)';
    box.style.border = '1px solid rgba(255, 71, 87, 0.4)';
    box.style.color = '#ff4757';
    box.textContent = customMsg || (isAr ? 'بيانات الاعتماد غير صحيحة في Firebase.' : 'Invalid credentials in Firebase Authentication.');
  }
}

export function hideLoginNotice() {
  const box = document.getElementById('loginNoticeBox');
  if (box) box.style.display = 'none';
}

export async function handleLogin(e) {
  e.preventDefault();
  const form = e.target;
  const email = form.loginEmail.value.trim();
  const password = form.loginPassword.value;
  const submitBtn = form.querySelector('button[type="submit"]');
  const originalText = submitBtn ? submitBtn.textContent : 'Sign In';

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Authenticating with Firebase...';
  }

  hideLoginNotice();

  try {
    let authUser = null;

    // 1. Authenticate with Client-Side Firebase Web SDK
    try {
      const fbInit = await firebaseAuth.initFirebaseClient();
      if (fbInit.success) {
        const fbRes = await firebaseAuth.firebaseSignIn(email, password);
        if (fbRes && fbRes.idToken) {
          const exchangeRes = await api.loginWithFirebase(fbRes.idToken, email);
          if (exchangeRes.success) {
            authUser = exchangeRes.user;
          } else {
            showLoginNotice('error', exchangeRes.error || 'User account not authorized for staff access.');
            return;
          }
        }
      }
    } catch (fbErr) {
      console.warn('[Firebase Client SDK notice]:', fbErr.code || fbErr.message, 'Verifying through backend staff directory...');
    }

    // 2. Verify via backend staff directory & Firebase REST API fallback
    if (!authUser) {
      const res = await api.login(email, password);
      if (res.success && res.user) {
        authUser = res.user;
      } else {
        showLoginNotice('error', res.error || 'Invalid credentials. Please verify your email and password.');
        return;
      }
    }

    if (authUser) {
      // Safe metadata only in localStorage (session authentication is handled via HttpOnly cookie)
      const { password: _, ...safeUser } = authUser;
      currentUser = safeUser;
      localStorage.setItem('aurora_current_user', JSON.stringify(currentUser));
      localStorage.setItem('aurora_last_activity', Date.now().toString());
      recordUserActivity();

      if (currentUser.mustChangePassword || currentUser.mustResetPassword) {
        openFirstLoginPasswordModal(currentUser);
        return;
      }

      if (currentUser.role === 'employee') {
        window.auroraNavigate('/portal');
      } else {
        window.auroraNavigate('/admin');
      }
    }
  } catch (err) {
    showLoginNotice('error', 'Authentication error: ' + err.message);
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = originalText;
    }
  }
}

export async function processFirebaseLogin(idToken, email) {
  if (isLoggingIn) {
    console.log('[Auth] Login exchange already active, ignoring duplicate trigger.');
    return true;
  }
  isLoggingIn = true;
  try {
    const exchangeRes = await api.loginWithFirebase(idToken, email);
    if (exchangeRes.success && exchangeRes.user) {
      const { password: _, ...safeUser } = exchangeRes.user;
      currentUser = safeUser;
      localStorage.setItem('aurora_current_user', JSON.stringify(currentUser));
      localStorage.setItem('aurora_last_activity', Date.now().toString());
      recordUserActivity();

      showToastNotification(`Signed in successfully as ${safeUser.name || safeUser.email}`, 'success');

      if (currentUser.mustChangePassword || currentUser.mustResetPassword) {
        openFirstLoginPasswordModal(currentUser);
        return true;
      }

      if (currentUser.role === 'employee') {
        navigateTo('/portal', onScreenChange);
      } else {
        navigateTo('/admin', onScreenChange);
      }
      return true;
    } else {
      const err = exchangeRes.error || `The email "${email}" is not authorized for staff access. Please contact your Super Admin.`;
      showToastNotification(err, 'error', 8000);
      await firebaseAuth.firebaseSignOut();
      return false;
    }
  } catch (err) {
    showToastNotification('Authentication error: ' + err.message, 'error', 8000);
    return false;
  } finally {
    isLoggingIn = false;
  }
}

export function openFirstLoginPasswordModal(user) {
  const modal = document.getElementById('firstLoginPasswordModal');
  if (!modal) return;
  const nameEl = document.getElementById('firstLoginUserName');
  if (nameEl) nameEl.textContent = (user && (user.name || user.email)) || 'Team Member';
  const form = document.getElementById('firstLoginPasswordForm');
  if (form) form.reset();
  modal.classList.add('active');
}

export async function submitFirstLoginPassword(e) {
  if (e && e.preventDefault) e.preventDefault();
  const newPw = document.getElementById('firstLoginNewPassword')?.value?.trim() || '';
  const confirmPw = document.getElementById('firstLoginConfirmPassword')?.value?.trim() || '';

  if (newPw.length < 6) {
    showToastNotification('New password must be at least 6 characters long.', 'warning');
    return;
  }
  if (newPw !== confirmPw) {
    showToastNotification('Passwords do not match. Please verify your confirmation password.', 'warning');
    return;
  }
  if (newPw === 'Aurora@2026' || newPw === 'password123') {
    showToastNotification('Please choose a personal password different from the default password.', 'warning');
    return;
  }

  const btn = document.getElementById('firstLoginSubmitBtn');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Updating & Syncing...';
  }

  try {
    const res = await api.changeInitialPassword(newPw);
    if (res && res.success) {
      if (res.user) {
        currentUser = res.user;
      } else if (currentUser) {
        currentUser.mustChangePassword = false;
        currentUser.mustResetPassword = false;
      }
      localStorage.setItem('aurora_current_user', JSON.stringify(currentUser));
      localStorage.setItem('aurora_last_activity', Date.now().toString());

      document.getElementById('firstLoginPasswordModal')?.classList.remove('active');
      showToastNotification('Password updated and synced with Firebase! Welcome to Aurora Portal.', 'success');

      if (currentUser?.role === 'employee') {
        window.auroraNavigate('/portal');
      } else {
        window.auroraNavigate('/admin');
      }
    } else {
      showToastNotification(res?.error || 'Failed to update password.', 'error');
    }
  } catch (err) {
    showToastNotification('Network error: ' + err.message, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Update Password & Enter Portal';
    }
  }
}

export async function handleGoogleSignIn() {
  const googleBtn = document.getElementById('firebaseGoogleSignInBtn');
  if (googleBtn && googleBtn.disabled) return;
  const originalContent = googleBtn ? googleBtn.innerHTML : '';

  if (googleBtn) {
    googleBtn.disabled = true;
    googleBtn.innerHTML = '<span>Forwarding to Google...</span>';
  }

  let isRedirecting = false;
  try {
    if (!firebaseAuth.isFirebaseReady()) {
      const fbInit = await firebaseAuth.initFirebaseClient();
      if (!fbInit.success) {
        showToastNotification('Firebase Authentication is not yet configured. Please enter your Firebase Project ID and Web API Key in Super Admin Settings > Firebase Authentication.', 'warning');
        return;
      }
    }

    const fbRes = await firebaseAuth.firebaseGoogleSignIn();
    if (!fbRes) {
      // Forwarding in current tab
      isRedirecting = true;
      return;
    }
    if (!fbRes.idToken) {
      throw new Error('Could not retrieve Google authentication token.');
    }

    await processFirebaseLogin(fbRes.idToken, fbRes.user?.email);
  } catch (err) {
    console.error('Google Sign-In caught error:', err);
    showToastNotification('Google Sign-In Error: ' + (err.message || err), 'error');
  } finally {
    if (googleBtn && !isRedirecting) {
      googleBtn.disabled = false;
      googleBtn.innerHTML = originalContent;
    }
  }
}

export function setLoginCreds(email, password) {
  const f = document.getElementById('unifiedLoginForm');
  if (f) {
    f.loginEmail.value = email;
    f.loginPassword.value = password;
  }
}

export async function logout() {
  currentUser = null;
  localStorage.removeItem('aurora_current_user');
  localStorage.removeItem('aurora_last_activity');
  sessionStorage.clear();

  // Reset all forms so no pretyped data remains
  document.querySelectorAll('form').forEach(f => { try { f.reset(); } catch {} });

  // Immediately hide protected DOM containers
  const adminScreen = document.getElementById('screen-admin');
  if (adminScreen) adminScreen.style.display = 'none';
  const portalScreen = document.getElementById('screen-portal');
  if (portalScreen) portalScreen.style.display = 'none';

  await Promise.allSettled([
    api.logoutUser(),
    firebaseAuth.firebaseSignOut()
  ]);

  // Perform a full page reload to /login so all preloaded data and button states are completely refreshed
  window.location.replace('/login');
}

function verifyAuth(requiredRole = null) {
  const user = getAuthenticatedUser();
  if (!user) {
    currentUser = null;
    localStorage.removeItem('aurora_current_user');
    localStorage.removeItem('aurora_last_activity');
    const adminScreen = document.getElementById('screen-admin');
    if (adminScreen) adminScreen.style.display = 'none';
    const portalScreen = document.getElementById('screen-portal');
    if (portalScreen) portalScreen.style.display = 'none';
    window.auroraNavigate('/login');
    return false;
  }
  currentUser = user;
  if (requiredRole === 'admin' && currentUser.role !== 'super_admin' && currentUser.role !== 'manager') {
    alert('Access Denied: Administrator privileges required.');
    window.auroraNavigate('/portal');
    return false;
  }
  return true;
}

// Employee Self-Service Password Reset (Terminates all active sessions across devices)
export async function requestMyPasswordReset() {
  const isAr = getLanguage() === 'ar';
  const confirmMsg = isAr
    ? 'هل أنت متأكد من رغبتك في طلب إعادة تعيين كلمة المرور؟\n\nسيتم إرسال رابط آمن إلى بريدك الإلكتروني وسيتم تسجيل الخروج فوراً من كافة الجلسات النشطة عبر جميع الأجهزة لحماية حسابك.'
    : 'Are you sure you want to request a password reset?\n\nA secure link will be sent to your email and all active sessions across all devices will be terminated immediately for security.';

  if (!confirm(confirmMsg)) return;

  const btn = document.getElementById('empResetPasswordBtn');
  const origText = btn ? btn.innerHTML : '';
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = isAr ? '<span>جاري المعالجة وإلغاء الجلسات...</span>' : '<span>Revoking sessions & sending email...</span>';
  }

  try {
    const res = await api.requestMyPasswordReset();
    if (res && res.success) {
      currentUser = null;
      localStorage.removeItem('aurora_current_user');
      localStorage.removeItem('aurora_last_activity');
      sessionStorage.setItem('aurora_login_notice', 'reset_logout');
      await firebaseAuth.firebaseSignOut().catch(() => {});

      const adminScreen = document.getElementById('screen-admin');
      if (adminScreen) adminScreen.style.display = 'none';
      const portalScreen = document.getElementById('screen-portal');
      if (portalScreen) portalScreen.style.display = 'none';

      window.auroraNavigate('/login');
    } else {
      alert((res && res.error) || 'Failed to request password reset.');
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = origText;
      }
    }
  } catch (err) {
    alert('Error requesting password reset: ' + err.message);
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = origText;
    }
  }
}

// -----------------------------------------------------------------------------
// EMPLOYEE PORTAL (Requirements B.1, B.2, B.3, C.1, C.2, C.3)
// -----------------------------------------------------------------------------
async function loadPortalData() {
  if (!currentUser) return;

  // Personal greeting (Requirement C.1.4)
  const heading = document.getElementById('portalSignedInUserHeading');
  if (heading) {
    const firstName = (currentUser.name || 'Omar').split(' ')[0];
    heading.textContent = `Hi ${firstName}`;
  }

  // Set avatar preview (Requirement C.1.2)
  const avatarPreview = document.getElementById('empAvatarPreview');
  if (avatarPreview && currentUser.photo) {
    avatarPreview.src = currentUser.photo;
  }

  // Fill profile fields
  const nameInput = document.getElementById('empNameInput');
  const titleInput = document.getElementById('empTitleInput');
  const deptInput = document.getElementById('empDeptInput');
  const emailInput = document.getElementById('empEmailInput');
  const photoInput = document.getElementById('empPhotoInput');
  const bioInput = document.getElementById('portalBioInput');

  if (nameInput) nameInput.value = currentUser.name || '';
  if (titleInput) titleInput.value = currentUser.title || '';
  if (deptInput) deptInput.value = currentUser.department || 'Media Production';
  if (emailInput) emailInput.value = currentUser.email || '';
  if (photoInput) photoInput.value = currentUser.photo || '/assets/Image_error.jpg';
  if (bioInput) {
    bioInput.value = currentUser.bioEn || '';
    const counter = document.getElementById('portalBioCounter');
    if (counter) counter.textContent = `${bioInput.value.length} / 180 chars`;
  }

  // Show/hide delegated permission tabs inside Employee Portal
  const p = currentUser.permissions || {};
  const permMap = {
    kyc: !!(p.canViewBriefs || p.canGenerateBriefs),
    crm: !!p.canViewCRM,
    approve: !!p.canApproveProjects,
    publish: !!p.canPublishProjects
  };

  Object.entries(permMap).forEach(([tabKey, allowed]) => {
    const li = document.querySelector(`#portalSidebarNav li[data-portal-perm="${tabKey}"]`);
    if (li) li.style.display = allowed ? 'block' : 'none';
  });

  // Configure Generate KYC button state (visible on KYC tab, dimmed if canGenerateBriefs is false)
  const genKycBtn = document.getElementById('portalGenerateKycBtn');
  if (genKycBtn) {
    if (p.canGenerateBriefs) {
      genKycBtn.disabled = false;
      genKycBtn.style.opacity = '1';
      genKycBtn.style.cursor = 'pointer';
      genKycBtn.title = 'Generate a new client KYC link';
    } else {
      genKycBtn.disabled = true;
      genKycBtn.style.opacity = '0.45';
      genKycBtn.style.cursor = 'not-allowed';
      genKycBtn.title = 'Generate KYC permission required';
    }
  }

  // Ensure default Profile tab is shown cleanly on load
  const profileLink = document.querySelector('#portalSidebarNav .portal-nav-link');
  switchPortalTab('profile', profileLink);

  // Prepopulate industries in dropdowns
  await populateNewWorkIndustries();

  // Load works table for this employee
  await loadEmployeeWorks();
}

async function loadEmployeeWorks() {
  const table = document.getElementById('portalWorksList');
  if (!table || !currentUser) return;

  try {
    const [prjRes, clipsRes] = await Promise.all([
      api.fetchProjectsForEmployee(currentUser.name),
      api.fetchPortfolioClips()
    ]);

    const projects = prjRes.success && prjRes.data ? prjRes.data : [];
    const clips = clipsRes.success && clipsRes.data ? clipsRes.data : [];
    myPortfolioClips = Array.isArray(clips) ? clips : [];

    if (!projects.length && !myPortfolioClips.length) {
      table.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:32px; color:var(--text-muted);">No projects or media clips added to your portfolio yet. Click <strong>"+ Add Project to My Portfolio"</strong> above to select clips!</td></tr>`;
      return;
    }

    let html = '';

    // Credited Projects
    if (projects.length) {
      html += projects.map(p => `
        <tr>
          <td>
            <strong>${p.titleEn}</strong><br>
            <span style="font-size:12px; color:var(--text-muted);">Client: ${p.clientName} (Full Project Credit)</span>
          </td>
          <td><span class="badge badge-accent">${p.industryCategory}</span></td>
          <td>
            <span class="badge ${p.isPublished ? 'badge-success' : (p.isApproved ? 'badge-teal' : 'badge-warning')}">
              ${p.isPublished ? '● Published Live' : (p.isApproved ? '● Approved (Staged)' : '● Pending Approval')}
            </span>
          </td>
          <td>${p.projectYear}</td>
          <td>
            <button class="btn btn-sm btn-secondary" onclick="window.auroraOpenRequestUpdate('${p.id}')">Request Update</button>
            <button class="btn btn-sm btn-secondary" style="color:var(--status-error);" onclick="window.auroraRemoveFromPortfolio('${p.id}')">Remove</button>
          </td>
        </tr>
      `).join('');
    }

    // Selected Portfolio Clips / Pieces of Content
    if (myPortfolioClips.length) {
      html += myPortfolioClips.map((clip, idx) => {
        const clipId = clip.id || `clip_${idx}`;
        const clipTitle = clip.caption || 'Featured Media Clip';
        return `
          <tr style="background: rgba(14, 165, 233, 0.04);">
            <td>
              <div style="display:flex; align-items:center; gap:12px;">
                <img src="${clip.url}" style="width:44px; height:44px; object-fit:cover; border-radius:var(--radius-xs); border:1px solid var(--border-default);" onerror="this.src='/assets/Image_error.jpg'">
                <div>
                  <strong>${clipTitle}</strong><br>
                  <span style="font-size:12px; color:var(--text-muted);">Piece of Content</span>
                </div>
              </div>
            </td>
            <td><span class="badge badge-teal">Portfolio Clip</span></td>
            <td><span class="badge badge-success">● Active on Profile</span></td>
            <td>—</td>
            <td>
              <button class="btn btn-sm btn-secondary" style="color:var(--status-error);" onclick="window.auroraRemovePortfolioClip('${clipId}')">Remove Clip</button>
            </td>
          </tr>
        `;
      }).join('');
    }

    table.innerHTML = html;
  } catch (err) {
    console.error('Error loading employee works:', err);
  }
}

export function switchPortalTab(tabId, btn) {
  const tabs = ['profile', 'works', 'kyc', 'crm', 'approve', 'publish'];
  tabs.forEach(t => {
    const el = document.getElementById(`portal-tab-${t}`);
    if (el) el.style.display = t === tabId ? 'block' : 'none';
  });

  document.querySelectorAll('#portalSidebarNav .portal-nav-link').forEach(link => link.classList.remove('active'));
  if (btn) btn.classList.add('active');

  if (tabId === 'kyc') {
    loadPortalKyc();
  } else if (tabId === 'crm') {
    loadPortalCRM();
  } else if (tabId === 'approve') {
    loadPortalApproveProjects();
  } else if (tabId === 'publish') {
    loadPortalPublishProjects();
  }
}

async function loadPortalKyc() {
  const tbody = document.getElementById('portalKycTableBody');
  const p = currentUser?.permissions || {};
  if (!p.canViewBriefs) {
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:32px; color:var(--text-muted);">View KYC permission is not enabled for your account. Use <strong>+ Generate KYC Link</strong> above to create new client KYCs.</td></tr>`;
    }
    return;
  }
  await refreshBriefs(false);
}

async function loadPortalCRM() {
  await loadAdminCRM();
}

async function loadPortalApproveProjects() {
  const container = document.getElementById('portalApproveContainer');
  if (!container) return;

  try {
    const res = await api.fetchProjects('awaiting_review');
    const pendingList = (res.success && res.data ? res.data : []).filter(p => !p.isApproved);
    if (!pendingList.length) {
      container.innerHTML = `<p style="color:var(--text-muted);">No projects awaiting approval.</p>`;
      return;
    }

    container.innerHTML = pendingList.map(p => {
      const gallery = p.mediaGallery || [];
      return `
      <div class="card" style="margin-bottom:16px;">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:16px;">
          <div style="flex:1; min-width:280px;">
            <div style="display:flex; gap:8px; align-items:center; margin-bottom:6px;">
              <span class="badge badge-warning">Pending Approval</span>
              <span class="badge badge-accent">${escapeHtml(p.industryCategory)}</span>
            </div>
            <h3 style="margin-bottom:4px;">${escapeHtml(p.titleEn)}</h3>
            <p style="color:var(--text-muted); font-size:0.9rem;">Client: <strong>${escapeHtml(p.clientName)}</strong> · Year: ${escapeHtml(p.projectYear)} · Credited: ${(p.creditedStaff || []).map(escapeHtml).join(', ')}</p>
            <p style="margin:10px 0; font-size:0.95rem; line-height:1.5;">${escapeHtml(p.summaryEn)}</p>
            ${gallery.length ? `
              <div style="display:flex; gap:8px; margin-top:12px; overflow-x:auto; padding-bottom:4px;">
                ${gallery.map(m => `
                  <img src="${escapeHtml(m.url)}" style="width:72px; height:50px; object-fit:cover; border-radius:var(--radius-sm); border:1px solid var(--border-default); cursor:pointer;" alt="${escapeHtml(m.caption || '')}" onclick="window.auroraOpenLightbox('${escapeHtml(m.url)}', '${escapeHtml(m.caption || p.titleEn)}')" />
                `).join('')}
              </div>
            ` : ''}
          </div>
          <div style="display:flex; gap:8px; flex-wrap:wrap;">
            <button class="btn btn-sm btn-outline" style="color:var(--status-error);" onclick="window.auroraOpenRejectProject('${p.id}')">Reject</button>
            <button class="btn btn-sm btn-primary" onclick="window.auroraApproveProject('${p.id}')">Approve Project</button>
          </div>
        </div>
      </div>
      `;
    }).join('');
  } catch (err) {
    console.error('Error loading portal approve projects:', err);
  }
}

async function loadPortalPublishProjects() {
  const container = document.getElementById('portalPublishContainer');
  if (!container) return;

  try {
    const res = await api.fetchProjects('all');
    const list = (res.success && res.data ? res.data : []).filter(p => p.isApproved);
    if (!list.length) {
      container.innerHTML = `<p style="color:var(--text-muted);">No approved projects available to publish yet.</p>`;
      return;
    }

    container.innerHTML = list.map(p => `
      <div class="card" style="margin-bottom:16px;">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:16px;">
          <div style="flex:1; min-width:260px;">
            <div style="display:flex; gap:8px; align-items:center; margin-bottom:6px;">
              <span class="badge ${p.isPublished ? 'badge-teal' : 'badge-success'}">${p.isPublished ? 'Live on Website' : 'Approved (Ready to Publish)'}</span>
              <span class="badge badge-accent">${escapeHtml(p.industryCategory)}</span>
            </div>
            <h3 style="margin-bottom:4px;">${escapeHtml(p.titleEn)}</h3>
            <p style="color:var(--text-muted); font-size:0.9rem;">Client: <strong>${escapeHtml(p.clientName)}</strong> · Year: ${escapeHtml(p.projectYear)}</p>
          </div>
          <div>
            ${!p.isPublished
              ? `<button class="btn btn-sm btn-primary" onclick="window.auroraPublishProject('${p.id}')">Publish Live</button>`
              : `<span style="font-size:0.85rem; color:var(--text-muted); font-weight:600;">Published</span>`
            }
          </div>
        </div>
      </div>
    `).join('');
  } catch (err) {
    console.error('Error loading portal publish projects:', err);
  }
}

export function copyMyProfileLink() {
  const slug = currentUser.slug || 'omar-hassan';
  const url = `${window.location.origin}/team/${slug}`;
  navigator.clipboard.writeText(url);
  alert(`Public profile link copied to clipboard:\n${url}`);
}

// Requirement C.1.1: Preview public profile in a new browser tab
export function previewMyProfile() {
  const slug = currentUser?.slug || 'omar-hassan';
  window.open(`/team/${slug}`, '_blank');
}

// Requirement C.1.2 & C.1.3: Avatar Crop, Zoom and Upload
export function handleAvatarFileSelect(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    currentAvatarCropDataUrl = ev.target.result;
    const cropImg = document.getElementById('avatarCropImage');
    const zoomSlider = document.getElementById('avatarZoomSlider');
    if (cropImg) {
      cropImg.src = currentAvatarCropDataUrl;
      cropImg.style.transform = 'scale(1)';
    }
    if (zoomSlider) zoomSlider.value = '1';
    document.getElementById('avatarCropModal')?.classList.add('active');
  };
  reader.readAsDataURL(file);
}

export function updateAvatarZoom(val) {
  const cropImg = document.getElementById('avatarCropImage');
  if (cropImg) {
    cropImg.style.transform = `scale(${val})`;
  }
}

export async function confirmAvatarCrop() {
  if (!currentAvatarCropDataUrl) return;
  try {
    const res = await api.uploadUserAvatar(currentAvatarCropDataUrl, `${currentUser?.slug || 'avatar'}.jpg`);
    if (res.success && res.url) {
      if (currentUser) {
        currentUser.photo = res.url;
        localStorage.setItem('aurora_current_user', JSON.stringify(currentUser));
      }
      const avatarPreview = document.getElementById('empAvatarPreview');
      if (avatarPreview) avatarPreview.src = res.url;
      const photoInput = document.getElementById('empPhotoInput');
      if (photoInput) photoInput.value = res.url;
      closeAllModalsAndDrawers();
      alert('Profile photo updated successfully!');
    } else {
      alert(res.error || 'Failed to upload avatar.');
    }
  } catch (err) {
    alert('Upload error: ' + err.message);
  }
}

export async function saveEmployeeProfile(e) {
  e.preventDefault();
  const form = e.target;
  const updates = {
    name: form.empName.value.trim(),
    title: form.empTitle.value.trim(),
    photo: form.empPhoto.value.trim() || '/assets/Image_error.jpg',
    bioEn: form.empBio.value.trim()
  };

  const res = await api.updateUserProfile(updates);
  if (res.success) {
    currentUser = { ...currentUser, ...updates };
    localStorage.setItem('aurora_current_user', JSON.stringify(currentUser));
    alert('Profile details updated successfully!');
  }
}

export function setUserTheme(theme) {
  setTheme(theme);
  if (currentUser) {
    currentUser.theme = theme;
    localStorage.setItem('aurora_current_user', JSON.stringify(currentUser));
  }
}

// Requirement C.3.1: Language Switch instantly alters RTL/LTR and UI language
export function setUserLang(lang) {
  setLanguage(lang);
  document.getElementById('userLangEnBtn')?.classList.toggle('active', lang === 'en');
  document.getElementById('userLangArBtn')?.classList.toggle('active', lang === 'ar');
  if (currentUser) {
    currentUser.lang = lang;
    localStorage.setItem('aurora_current_user', JSON.stringify(currentUser));
  }
}

// Requirement C.2.2 & C.2.4: Industry category dropdown & New Industry Modal
export async function populateNewWorkIndustries() {
  await populateAllIndustries();
  const select = document.getElementById('newWorkIndustrySelect');
  const editSelect = document.getElementById('editProjectIndustrySelect');

  const options = allIndustries.map(ind => `<option value="${ind.nameEn || ind}">${ind.nameEn || ind}</option>`).join('');

  if (select) {
    select.innerHTML = options;
  }
  if (editSelect) {
    editSelect.innerHTML = options;
  }
}

export function openNewIndustryModal() {
  const input = document.getElementById('newIndustryNameInput');
  if (input) input.value = '';
  document.getElementById('newIndustryModal')?.classList.add('active');
}

export async function submitNewIndustry(e) {
  e.preventDefault();
  const input = document.getElementById('newIndustryNameInput');
  let name = (input ? input.value : '').trim();
  if (!name) return;

  // Trim, clean, and capitalize each word
  name = name.split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');

  try {
    const res = await api.addIndustry(name);
    if (res.success) {
      await populateNewWorkIndustries();
      const select = document.getElementById('newWorkIndustrySelect');
      if (select) select.value = name;
      closeAllModalsAndDrawers();
      alert(`Industry category "${name}" added successfully!`);
    } else {
      alert(res.error || 'Failed to add industry.');
    }
  } catch (err) {
    alert('Network error: ' + err.message);
  }
}

// Requirement C.2.3: Up to 6 Photos with ⭐ Hero radio selector
export function handleProjectPhotosSelect(e) {
  const input = e.target;
  const files = Array.from(input.files || []);
  if (!files.length) return;

  if (newProjectPhotos.length + files.length > 6) {
    alert('You can upload a maximum of 6 photos per project.');
    input.value = '';
    return;
  }

  let loaded = 0;
  files.forEach(file => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const isFirst = newProjectPhotos.length === 0;
      newProjectPhotos.push({
        id: 'photo_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
        url: ev.target.result,
        isHero: isFirst
      });
      loaded++;
      if (loaded === files.length) {
        renderNewWorkPhotosGrid();
      }
    };
    reader.readAsDataURL(file);
  });
  input.value = '';
}

export function renderNewWorkPhotosGrid() {
  const grid = document.getElementById('newWorkPhotoPreviewGrid');
  const countSpan = document.getElementById('newWorkPhotosCount');
  const heroInput = document.getElementById('newWorkHeroImageInput');
  if (!grid) return;

  if (countSpan) {
    countSpan.textContent = `${newProjectPhotos.length} / 6 photos added`;
  }

  if (!newProjectPhotos.length) {
    grid.innerHTML = `<div style="grid-column: 1/-1; color: var(--text-muted); font-size: 0.85rem; padding: 12px; text-align: center;">No photos uploaded yet. Select up to 6 photos above.</div>`;
    if (heroInput) heroInput.value = '/assets/Image_error.jpg';
    return;
  }

  const heroPhoto = newProjectPhotos.find(p => p.isHero) || newProjectPhotos[0];
  if (heroInput && heroPhoto) {
    heroInput.value = heroPhoto.url;
  }

  grid.innerHTML = newProjectPhotos.map((photo, idx) => `
    <div class="photo-thumbnail-card ${photo.isHero ? 'is-hero' : ''}" style="position: relative; border-radius: var(--radius-sm); overflow: hidden; border: 2px solid ${photo.isHero ? 'var(--brand-electric-teal)' : 'var(--border-default)'};">
      <img src="${photo.url}" style="width: 100%; height: 85px; object-fit: cover; display: block;" />
      <button type="button" onclick="window.auroraRemoveProjectPhoto(${idx})" style="position: absolute; top: 4px; right: 4px; background: rgba(0,0,0,0.7); color: #fff; border: none; border-radius: 50%; width: 22px; height: 22px; cursor: pointer; font-size: 11px; line-height: 1;">✕</button>
      <label style="display: flex; align-items: center; justify-content: center; gap: 4px; padding: 4px 6px; font-size: 0.75rem; background: var(--surface-sunken); cursor: pointer; margin: 0;">
        <input type="radio" name="heroPhotoRadio" value="${idx}" ${photo.isHero ? 'checked' : ''} onchange="window.auroraSetHeroPhoto(${idx})">
        <span>${photo.isHero ? '⭐ Hero' : 'Set Hero'}</span>
      </label>
    </div>
  `).join('');
}

export function setHeroPhoto(index) {
  newProjectPhotos.forEach((p, idx) => {
    p.isHero = (idx === index);
  });
  renderNewWorkPhotosGrid();
}

export function removeProjectPhoto(index) {
  newProjectPhotos.splice(index, 1);
  if (newProjectPhotos.length && !newProjectPhotos.some(p => p.isHero)) {
    newProjectPhotos[0].isHero = true;
  }
  renderNewWorkPhotosGrid();
}

// Auto-Saved Draft Management & Video Embed Guides for New Projects
let projectDraftDebounceTimer = null;
export function saveProjectDraftDebounced() {
  if (projectDraftDebounceTimer) clearTimeout(projectDraftDebounceTimer);
  projectDraftDebounceTimer = setTimeout(() => {
    saveProjectDraft();
  }, 350);
}

export function saveProjectDraft() {
  const form = document.getElementById('newWorkForm');
  if (!form) return;
  const draft = {
    titleEn: form.titleEn?.value || '',
    titleAr: form.titleAr?.value || '',
    clientName: form.clientName?.value || '',
    industryCategory: form.industryCategory?.value || '',
    youtubeId: form.youtubeId?.value || '',
    summaryEn: form.summaryEn?.value || '',
    challengeEn: form.challengeEn?.value || '',
    solutionEn: form.solutionEn?.value || '',
    resultEn: form.resultEn?.value || '',
    deliverables: form.deliverables?.value || '',
    photos: newProjectPhotos || [],
    savedAt: new Date().toISOString()
  };
  localStorage.setItem('aurora_new_project_draft', JSON.stringify(draft));
}

export function saveProjectDraftManual() {
  saveProjectDraft();
  showToastNotification('Project draft saved to local storage! You can resume editing even after logging out and back in.', 'success');
}

export function restoreProjectDraft() {
  const raw = localStorage.getItem('aurora_new_project_draft');
  if (!raw) return;
  try {
    const draft = JSON.parse(raw);
    const form = document.getElementById('newWorkForm');
    if (!form) return;
    
    const hasContent = draft.titleEn || draft.clientName || draft.summaryEn || (draft.photos && draft.photos.length);
    if (!hasContent) return;

    if (form.titleEn && draft.titleEn) form.titleEn.value = draft.titleEn;
    if (form.titleAr && draft.titleAr) form.titleAr.value = draft.titleAr;
    if (form.clientName && draft.clientName) form.clientName.value = draft.clientName;
    if (form.industryCategory && draft.industryCategory) form.industryCategory.value = draft.industryCategory;
    if (form.youtubeId && draft.youtubeId) {
      form.youtubeId.value = draft.youtubeId;
      previewProjectVideo(draft.youtubeId);
    }
    if (form.summaryEn && draft.summaryEn) form.summaryEn.value = draft.summaryEn;
    if (form.challengeEn && draft.challengeEn) form.challengeEn.value = draft.challengeEn;
    if (form.solutionEn && draft.solutionEn) form.solutionEn.value = draft.solutionEn;
    if (form.resultEn && draft.resultEn) form.resultEn.value = draft.resultEn;
    if (form.deliverables && draft.deliverables) form.deliverables.value = draft.deliverables;
    if (Array.isArray(draft.photos) && draft.photos.length) {
      newProjectPhotos = draft.photos;
      renderNewWorkPhotosGrid();
    }

    const notice = document.getElementById('projectDraftNoticeBox');
    if (notice) {
      notice.style.display = 'flex';
      const timeStr = draft.savedAt ? new Date(draft.savedAt).toLocaleTimeString() : '';
      const textEl = document.getElementById('projectDraftNoticeText');
      if (textEl) textEl.textContent = `Draft restored from your previous session${timeStr ? ' (' + timeStr + ')' : ''}. All inputs, photos, and video links were preserved.`;
    }
  } catch (err) {
    console.error('Error restoring draft:', err);
  }
}

export function clearProjectDraft() {
  localStorage.removeItem('aurora_new_project_draft');
  const notice = document.getElementById('projectDraftNoticeBox');
  if (notice) notice.style.display = 'none';
  const form = document.getElementById('newWorkForm');
  if (form) form.reset();
  newProjectPhotos = [];
  renderNewWorkPhotosGrid();
  previewProjectVideo('');
  showToastNotification('Project draft cleared.', 'info');
}

export function toggleProjectVideoGuide() {
  const box = document.getElementById('projectVideoGuideBox');
  if (box) {
    box.style.display = (box.style.display === 'none' || !box.style.display) ? 'block' : 'none';
  }
}

export function previewProjectVideo(val) {
  const box = document.getElementById('newWorkVideoPreviewBox');
  const iframe = document.getElementById('newWorkVideoPreviewIframe');
  if (!box || !iframe) return;
  const url = getYoutubeEmbedUrl(val);
  if (url) {
    iframe.src = url;
    box.style.display = 'block';
  } else {
    iframe.src = '';
    box.style.display = 'none';
  }
}

export function toggleEditProjectVideoGuide() {
  const box = document.getElementById('editProjectVideoGuideBox');
  if (box) {
    box.style.display = (box.style.display === 'none' || !box.style.display) ? 'block' : 'none';
  }
}

export function previewEditProjectVideo(val) {
  const box = document.getElementById('editProjectVideoPreviewBox');
  const iframe = document.getElementById('editProjectVideoPreviewIframe');
  if (!box || !iframe) return;
  const url = getYoutubeEmbedUrl(val);
  if (url) {
    iframe.src = url;
    box.style.display = 'block';
  } else {
    iframe.src = '';
    box.style.display = 'none';
  }
}

export function openAddWorkDrawer() {
  const user = getAuthenticatedUser();
  if (!user) {
    showToastNotification('Please sign in to submit a project.', 'warning');
    return;
  }
  populateNewWorkIndustries();
  const modal = document.getElementById('addWorkModal') || document.getElementById('addWorkDrawer');
  if (modal) {
    modal.classList.add('active');
    modal.style.display = 'flex';
  }
  const overlay = document.getElementById('drawerOverlay');
  if (overlay) overlay.classList.add('active');

  // Restore draft if any exists
  restoreProjectDraft();
}

export async function submitNewWork(e) {
  e.preventDefault();
  const form = e.target;

  if (newProjectPhotos.length < 1) {
    showToastNotification('Please upload at least 1 photo for this project.', 'warning');
    return;
  }

  const deliverables = (form.deliverables?.value || '').split(',').map((s) => s.trim()).filter(Boolean);
  const heroPhoto = newProjectPhotos.find(p => p.isHero) || newProjectPhotos[0];

  const payload = {
    titleEn: form.titleEn?.value.trim() || '',
    titleAr: form.titleAr ? form.titleAr.value.trim() : '',
    clientName: form.clientName?.value.trim() || '',
    industryCategory: form.industryCategory?.value.trim() || 'General',
    projectYear: Number(form.projectYear?.value) || 2026,
    summaryEn: form.summaryEn?.value.trim() || '',
    challengeEn: form.challengeEn?.value.trim() || '',
    solutionEn: form.solutionEn?.value.trim() || '',
    resultEn: form.resultEn?.value.trim() || '',
    youtubeId: parseYoutubeVideoId(form.youtubeId ? form.youtubeId.value.trim() : ''),
    heroImage: heroPhoto.url || '/assets/Image_error.jpg',
    deliverables: deliverables,
    creditedStaff: [currentUser ? currentUser.name : 'Omar Hassan'],
    mediaGallery: newProjectPhotos.map(p => ({
      type: 'photo',
      url: p.url,
      caption: p.isHero ? 'Hero Cover' : 'Project Still'
    }))
  };

  const submitBtn = document.getElementById('newWorkSubmitBtn');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting...';
  }

  try {
    const res = await api.createProject(payload);
    if (res.success) {
      showToastNotification('Project submitted for manager review!', 'success');
      localStorage.removeItem('aurora_new_project_draft');
      closeAllModalsAndDrawers();
      form.reset();
      newProjectPhotos = [];
      renderNewWorkPhotosGrid();
      previewProjectVideo('');
      loadEmployeeWorks();
    } else {
      showToastNotification(res.error || 'Failed to submit project.', 'error');
    }
  } catch (err) {
    showToastNotification('Network error submitting project: ' + err.message, 'error');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Submit for Manager Approval';
    }
  }
}

// Requirement C.2.1: Portfolio Content Picker
export async function openPortfolioContentPicker() {
  const modal = document.getElementById('portfolioContentPickerModal');
  const container = document.getElementById('contentPickerBody');
  if (!modal || !container) return;

  modal.classList.add('active');
  container.innerHTML = `<div style="text-align: center; padding: 32px;"><p style="color: var(--text-muted);">Loading available projects and media...</p></div>`;

  try {
    const [clipsRes, prjRes] = await Promise.all([
      api.fetchPortfolioClips(),
      api.fetchProjects('published')
    ]);

    const savedClips = clipsRes.success && clipsRes.data ? clipsRes.data : [];
    myPortfolioClips = Array.isArray(savedClips) ? [...savedClips] : [];

    const projects = prjRes.success && prjRes.data ? prjRes.data : [];
    if (!projects.length) {
      container.innerHTML = `<p style="color: var(--text-muted); padding: 20px;">No published projects found.</p>`;
      return;
    }

    renderContentPickerGrid(projects);
  } catch (err) {
    container.innerHTML = `<p style="color: var(--status-error); padding: 20px;">Failed to load content picker: ${err.message}</p>`;
  }
}

function renderContentPickerGrid(projects) {
  const container = document.getElementById('contentPickerBody');
  if (!container) return;

  container.innerHTML = projects.map(p => {
    const clips = p.mediaGallery && p.mediaGallery.length ? p.mediaGallery : [
      { type: 'photo', url: p.heroImage || '/assets/Image_error.jpg', caption: p.titleEn }
    ];
    return `
      <div class="content-picker-project" style="margin-bottom: 20px; padding: 16px; background: var(--surface-sunken); border-radius: var(--radius-sm); border: 1px solid var(--border-default);">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
          <h4 style="margin: 0;">${p.titleEn} <span style="font-size: 0.85rem; font-weight: normal; color: var(--text-muted);">(${p.clientName})</span></h4>
          <span class="badge badge-accent">${p.industryCategory}</span>
        </div>
        <div class="content-picker-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 10px;">
          ${clips.map((clip, cIdx) => {
            const clipId = `${p.id}_clip_${cIdx}`;
            const isChecked = myPortfolioClips.some(c => (typeof c === 'string' ? c === clipId : c.id === clipId));
            const safeCaption = (clip.caption || p.titleEn).replace(/'/g, "\\'");
            return `
              <div class="content-clip-card ${isChecked ? 'is-selected' : ''}" id="clip_card_${clipId}" style="position: relative; border-radius: var(--radius-sm); overflow: hidden; border: 2px solid ${isChecked ? 'var(--brand-electric-teal)' : 'var(--border-default)'}; cursor: pointer; transition: border-color 0.15s ease;" onclick="window.auroraToggleContentClip('${clipId}', '${p.id}', '${clip.url}', '${safeCaption}')">
                <img src="${clip.url}" style="width: 100%; height: 90px; object-fit: cover; display: block;" onerror="this.src='/assets/Image_error.jpg'" />
                <div style="padding: 4px 6px; font-size: 0.75rem; background: var(--surface-raised); display: flex; align-items: center; justify-content: space-between;">
                  <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 80px;">${clip.caption || 'Clip'}</span>
                  <input type="checkbox" id="clip_check_${clipId}" ${isChecked ? 'checked' : ''} style="pointer-events: none;">
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }).join('');
}

export function toggleContentClip(clipId, projectId, url, caption) {
  const idx = myPortfolioClips.findIndex(c => (typeof c === 'string' ? c === clipId : c.id === clipId));
  const card = document.getElementById(`clip_card_${clipId}`);
  const checkbox = document.getElementById(`clip_check_${clipId}`);

  if (idx >= 0) {
    myPortfolioClips.splice(idx, 1);
    if (card) {
      card.classList.remove('is-selected');
      card.style.borderColor = 'var(--border-default)';
    }
    if (checkbox) checkbox.checked = false;
  } else {
    myPortfolioClips.push({ id: clipId, projectId, url, caption });
    if (card) {
      card.classList.add('is-selected');
      card.style.borderColor = 'var(--brand-electric-teal)';
    }
    if (checkbox) checkbox.checked = true;
  }
}

export async function savePortfolioClips() {
  try {
    const res = await api.updatePortfolioClips(myPortfolioClips);
    if (res.success) {
      if (currentUser) {
        currentUser.portfolioClips = myPortfolioClips;
        localStorage.setItem('aurora_current_user', JSON.stringify(currentUser));
      }
      alert('Personal portfolio clips saved successfully!');
      closeAllModalsAndDrawers();
      await loadEmployeeWorks();
    } else {
      alert(res.error || 'Failed to save clips.');
    }
  } catch (err) {
    alert('Network error saving clips: ' + err.message);
  }
}

export async function removePortfolioClip(clipId) {
  if (!confirm('Remove this piece of content from your portfolio?')) return;
  myPortfolioClips = myPortfolioClips.filter((c, idx) => (c.id || `clip_${idx}`) !== clipId);
  try {
    const res = await api.updatePortfolioClips(myPortfolioClips);
    if (res.success) {
      if (currentUser) {
        currentUser.portfolioClips = myPortfolioClips;
        localStorage.setItem('aurora_current_user', JSON.stringify(currentUser));
      }
      await loadEmployeeWorks();
    } else {
      alert(res.error || 'Failed to remove clip');
    }
  } catch (err) {
    alert('Error removing clip: ' + err.message);
  }
}

export function openRequestUpdate(projectId) {
  document.getElementById('updateRequestProjectId').value = projectId;
  document.getElementById('requestUpdateModal')?.classList.add('active');
}

export async function submitUpdateRequest(e) {
  e.preventDefault();
  const projectId = document.getElementById('updateRequestProjectId').value;
  const notes = document.getElementById('updateRequestNotes').value;

  const res = await api.requestProjectUpdate(projectId, { notes });
  if (res.success) {
    alert('Update request submitted to manager for approval.');
    closeAllModalsAndDrawers();
    document.getElementById('updateRequestNotes').value = '';
  }
}

export async function removeFromPortfolio(projectId) {
  if (!confirm('Remove this project from your personal portfolio? (The project remains in the company database).')) return;

  const res = await api.removeProjectFromPortfolio(projectId, currentUser.name);
  if (res.success) {
    alert('Project removed from your personal portfolio.');
    loadEmployeeWorks();
  }
}

// -----------------------------------------------------------------------------
// SUPER ADMIN & MANAGER CONTROL PANEL (Requirements B.4 - B.11)
// -----------------------------------------------------------------------------
async function loadAdminData() {
  if (!currentUser) return;

  const tagline = document.getElementById('adminRoleTagline');
  if (tagline) {
    tagline.textContent = currentUser.role === 'super_admin' ? 'SUPER ADMIN ACCESS' : 'MANAGER CONTROL PANEL';
  }

  // Hide Super Admin items if role is manager
  const isSuper = currentUser.role === 'super_admin';
  document.querySelectorAll('.super-admin-only').forEach(el => {
    el.style.display = isSuper ? 'block' : 'none';
  });

  // Load section data
  await loadAdminBriefs();
  await loadAdminCRM();
  await loadAdminAwaitingReview();
  await loadAdminProjectsControl();
  await loadAdminInvoices();
  await loadAdminMarquee();
  if (isSuper) {
    await loadAdminUsers();
    await loadAdminSettings();
    await loadAdminContentManager();
    await loadAdminActivityLogs();
  }
  await loadAdminMonitoring();
}

export function switchAdminSection(sectionId, btn) {
  if (sectionId === 'activity' && currentUser?.role !== 'super_admin') {
    showToastNotification('Access Denied: Activity Log is restricted to Super Admin only.', 'error');
    return;
  }
  const sections = ['briefs', 'crm', 'awaiting', 'projects', 'invoices', 'users', 'settings', 'marquee', 'content', 'activity', 'monitoring'];
  sections.forEach(s => {
    const el = document.getElementById(`admin-sec-${s}`);
    if (el) el.style.display = s === sectionId ? 'block' : 'none';
  });

  if (sectionId === 'invoices') {
    loadAdminInvoices();
  } else if (sectionId === 'marquee') {
    loadAdminMarquee();
  } else if (sectionId === 'activity') {
    loadAdminActivityLogs();
  } else if (sectionId === 'crm') {
    loadAdminCRM();
  } else if (sectionId === 'briefs') {
    loadAdminBriefs();
  } else if (sectionId === 'awaiting') {
    loadAdminAwaitingReview();
  } else if (sectionId === 'projects') {
    loadAdminProjectsControl();
  } else if (sectionId === 'monitoring') {
    loadAdminMonitoring();
  }

  document.querySelectorAll('#adminSidebarNav .portal-nav-link').forEach(link => link.classList.remove('active'));
  if (btn) btn.classList.add('active');
}

export function openGoogleSheet() {
  api.fetchSettings().then(res => {
    const url = res.data?.googleSheetsUrl || 'https://docs.google.com/spreadsheets';
    window.open(url, '_blank');
  });
}

// 1. Client Briefs (KYC)
export async function refreshBriefs(showToast = true) {
  const btn = document.getElementById('briefsRefreshBtn');
  if (btn) btn.disabled = true;
  try {
    const res = await api.fetchBriefs();
    if (res.success) {
      allAdminBriefs = res.data;
      filterBriefs();
      if (showToast) {
        showToastNotification('Client KYC briefs and statuses refreshed.', 'success', 2000);
      }
    }
  } catch (err) {
    if (showToast) {
      showToastNotification('Failed to refresh briefs: ' + err.message, 'error');
    }
  } finally {
    if (btn) btn.disabled = false;
  }
}

let briefsAutoPollTimer = null;
export function startBriefsAutoPoll() {
  if (briefsAutoPollTimer) clearInterval(briefsAutoPollTimer);
  briefsAutoPollTimer = setInterval(() => {
    const briefsSec = document.getElementById('admin-sec-briefs');
    if (briefsSec && briefsSec.style.display !== 'none') {
      refreshBriefs(false).catch(() => {});
    }
  }, 10000);
}

async function loadAdminBriefs() {
  await refreshBriefs(false);
  startBriefsAutoPoll();
}

function renderAdminBriefsTable(briefs, targetTbodyId = null) {
  const targets = targetTbodyId
    ? [document.getElementById(targetTbodyId)].filter(Boolean)
    : [document.getElementById('adminBriefsTableBody'), document.getElementById('portalKycTableBody')].filter(Boolean);

  if (!targets.length) return;

  const html = !briefs.length
    ? `<tr><td colspan="5" style="text-align:center; padding:32px; color:var(--text-muted);">No KYC records found.</td></tr>`
    : briefs.map(b => {
        const isSubmitted = b.isSubmitted || b.status === 'submitted';
        const isDeactivated = b.status === 'deactivated';
        const canEdit = b.status === 'pending' || b.status === 'deactivated';

        return `
          <tr>
            <td><strong>${b.clientName}</strong></td>
            <td>${b.brandName || '—'}</td>
            <td><span class="status-pill status-${b.status}">${b.status}</span></td>
            <td>${new Date(b.expiryDate).toLocaleDateString()}</td>
            <td>
              <div>
                <!-- Requirement 6.2: Copy Link as icon button -->
                <button class="btn btn-sm btn-secondary" onclick="window.auroraCopyBriefRowLink('${b.token}')" title="Copy public link" style="padding:4px 8px; font-size:14px;">🔗</button>
                <!-- Requirement 6.2: Open Answers as icon button when submitted -->
                ${isSubmitted ? `<button class="btn btn-sm btn-primary" onclick="window.auroraOpenBriefAnswers('${b.token}')" title="Open Answers" style="padding:4px 8px; font-size:14px;">👁️</button>` : ''}
                <!-- Requirement D.1.3: Edit button for pending and deactivated briefs -->
                ${canEdit ? `<button class="btn btn-sm btn-outline" onclick="window.auroraOpenEditBriefModal('${b.token}')">Edit</button>` : ''}
                <!-- Requirement 6.2: Meeting Prep only appears when status is submitted -->
                ${isSubmitted ? `<button class="btn btn-sm btn-outline" onclick="window.auroraOpenMeetingPrep('${b.token}')">📋 Meeting Prep</button>` : ''}
                <!-- Requirement 6.2: Extend & Deactivate disappear when status is submitted -->
                ${!isSubmitted ? `<button class="btn btn-sm btn-secondary" onclick="window.auroraOpenExtendBriefModal('${b.token}')">Extend</button>` : ''}
                ${!isSubmitted && !isDeactivated ? `<button class="btn btn-sm btn-secondary" style="color:var(--status-error);" onclick="window.auroraDeactivateBrief('${b.token}')">Deactivate</button>` : ''}
              </div>
            </td>
          </tr>
        `;
      }).join('');

  targets.forEach(tbody => {
    tbody.innerHTML = html;
  });
}

// Requirement D.1.1: Copy brief URL
export function copyBriefRowLink(token) {
  const url = `${window.location.origin}/brief/${token}`;
  navigator.clipboard.writeText(url);
  showToastNotification(`Client brief link copied to clipboard:\n${url}`, 'success');
}

// Requirement D.1.3: Edit Brief Modal
export function openEditBriefModal(token) {
  const brief = allAdminBriefs.find(b => b.token === token);
  if (!brief) return;

  document.getElementById('editBriefTokenInput').value = token;
  document.getElementById('editBriefClientNameInput').value = brief.clientName || '';
  document.getElementById('editBriefBrandNameInput').value = brief.brandName || '';
  const dateInput = document.getElementById('editBriefExpiryDateInput');
  if (dateInput) {
    dateInput.value = brief.expiryDate ? new Date(brief.expiryDate).toISOString().split('T')[0] : '';
  }

  document.getElementById('editBriefModal')?.classList.add('active');
}

export async function submitEditBrief(e) {
  e.preventDefault();
  const token = document.getElementById('editBriefTokenInput').value;
  const clientName = document.getElementById('editBriefClientNameInput').value.trim();
  const brandName = document.getElementById('editBriefBrandNameInput').value.trim();
  const expiryDate = document.getElementById('editBriefExpiryDateInput').value;

  try {
    const res = await api.editBrief(token, { clientName, brandName, expiryDate });
    if (res.success) {
      showToastNotification('Brief updated successfully! Status set to pending.', 'success');
      closeAllModalsAndDrawers();
      await refreshBriefs(false);
    } else {
      showToastNotification(res.error || 'Failed to update brief.', 'error');
    }
  } catch (err) {
    showToastNotification('Network error: ' + err.message, 'error');
  }
}

export function filterBriefs() {
  const search = (document.getElementById('briefsSearchInput')?.value || '').toLowerCase().trim();
  const status = document.getElementById('briefsStatusFilter')?.value || 'all';
  const sort = document.getElementById('briefsSortOrder')?.value || 'newest';

  let filtered = allAdminBriefs.filter(b => {
    const matchesSearch = !search ||
      (b.clientName || '').toLowerCase().includes(search) || 
      (b.brandName || '').toLowerCase().includes(search) ||
      (b.token || '').toLowerCase().includes(search) ||
      (b.data?.email || '').toLowerCase().includes(search);
    const matchesStatus = status === 'all' || b.status === status;
    return matchesSearch && matchesStatus;
  });

  if (sort === 'name') {
    filtered.sort((a, b) => a.clientName.localeCompare(b.clientName));
  } else if (sort === 'expiry') {
    filtered.sort((a, b) => new Date(a.expiryDate) - new Date(b.expiryDate));
  } else {
    filtered.sort((a, b) => new Date(b.createdAt || b.expiryDate) - new Date(a.createdAt || a.expiryDate));
  }

  renderAdminBriefsTable(filtered, 'adminBriefsTableBody');
  filterPortalKyc();
}

export function filterPortalKyc() {
  if (currentUser?.role === 'employee' && !currentUser?.permissions?.canViewBriefs) return;
  const search = (document.getElementById('portalKycSearchInput')?.value || '').toLowerCase().trim();
  const status = document.getElementById('portalKycStatusFilter')?.value || 'all';
  const sort = document.getElementById('portalKycSortOrder')?.value || 'newest';

  let filtered = allAdminBriefs.filter(b => {
    const matchesSearch = !search ||
      (b.clientName || '').toLowerCase().includes(search) ||
      (b.brandName || '').toLowerCase().includes(search) ||
      (b.token || '').toLowerCase().includes(search) ||
      (b.data?.email || '').toLowerCase().includes(search);
    const matchesStatus = status === 'all' || b.status === status;
    return matchesSearch && matchesStatus;
  });

  if (sort === 'name') {
    filtered.sort((a, b) => a.clientName.localeCompare(b.clientName));
  } else if (sort === 'expiry') {
    filtered.sort((a, b) => new Date(a.expiryDate) - new Date(b.expiryDate));
  } else {
    filtered.sort((a, b) => new Date(b.createdAt || b.expiryDate) - new Date(a.createdAt || a.expiryDate));
  }

  renderAdminBriefsTable(filtered, 'portalKycTableBody');
}

export function openGenerateBriefModal() {
  const modal = document.getElementById('generateBriefModal');
  if (modal) {
    document.getElementById('generatedLinkSuccess').style.display = 'none';
    modal.classList.add('active');
  }
}

export async function handleGenerateBriefSubmit(e) {
  e.preventDefault();
  const form = e.target;
  const clientInput = document.getElementById('genBriefClientName');
  const brandInput = document.getElementById('genBriefBrandName');
  const daysSelect = document.getElementById('genBriefDaysValid');

  const clientName = clientInput ? clientInput.value.trim() : '';
  const brandName = brandInput ? brandInput.value.trim() : '';
  const daysValid = daysSelect ? daysSelect.value : 30;

  if (!clientName) {
    alert('Please enter the client contact name.');
    if (clientInput) clientInput.focus();
    return;
  }

  const submitBtn = form.querySelector('button[type="submit"]');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Generating...';
  }

  try {
    const res = await api.generateBriefLink(clientName, brandName, daysValid);
    if (res.success) {
      const brief = res.data;
      const url = `${window.location.origin}/brief/${brief.token}`;

      const waTemplate = `أهلاً أ/ ${clientName}، عشان اجتماعنا في Sharks Office Space يطلع بأحسن نتيجة وموفر لوقت حضرتك، ياريت تملا استبيان المشروع ده: ${url}\nمستنيين لقاءنا!`;
      const waBox = document.getElementById('generatedWaText');
      const urlBox = document.getElementById('generatedLinkUrl');
      const copyHint = document.getElementById('generatedLinkCopyHint');
      const successBox = document.getElementById('generatedLinkSuccess');

      if (waBox) waBox.value = waTemplate;
      if (urlBox) {
        urlBox.textContent = url;
        urlBox.dataset.url = url;
      }
      if (copyHint) {
        copyHint.textContent = 'Click link to copy';
        copyHint.style.color = 'var(--text-muted)';
      }
      if (successBox) successBox.style.display = 'block';

      loadAdminBriefs();
    } else {
      alert(res.error || 'Failed to generate brief link.');
    }
  } catch (err) {
    alert('Network error connecting to server.');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Create Invitation Link';
    }
  }
}

export function copyWhatsAppMessage() {
  const text = document.getElementById('generatedWaText').value;
  navigator.clipboard.writeText(text);
  alert('WhatsApp message copied to clipboard!');
}

export async function copyGeneratedBriefLink() {
  const urlBox = document.getElementById('generatedLinkUrl');
  const copyHint = document.getElementById('generatedLinkCopyHint');
  const url = urlBox?.dataset?.url || urlBox?.textContent?.trim() || '';
  if (!url) return;

  try {
    await navigator.clipboard.writeText(url);
    if (copyHint) {
      copyHint.textContent = 'Copied! ✓';
      copyHint.style.color = '#10b981';
      setTimeout(() => {
        copyHint.textContent = 'Click link to copy';
        copyHint.style.color = 'var(--text-muted)';
      }, 2200);
    }
  } catch {
    alert('Failed to copy link. Please copy it manually.');
  }
}
window.auroraCopyGeneratedLink = copyGeneratedBriefLink;

export function openExtendBriefModal(token) {
  document.getElementById('extendBriefTokenInput').value = token;
  const maxDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const dateInput = document.getElementById('extendBriefDateInput');
  if (dateInput) {
    dateInput.max = maxDate;
    dateInput.min = new Date().toISOString().split('T')[0];
    dateInput.value = maxDate;
  }
  document.getElementById('extendBriefModal')?.classList.add('active');
}

export async function submitExtendBrief(e) {
  e.preventDefault();
  const token = document.getElementById('extendBriefTokenInput').value;
  const targetDate = document.getElementById('extendBriefDateInput').value;

  const res = await api.extendBriefExpiry(token, targetDate);
  if (res.success) {
    alert(`Expiration extended to ${new Date(res.data.expiryDate).toLocaleDateString()}`);
    closeAllModalsAndDrawers();
    loadAdminBriefs();
  }
}

export async function deactivateBrief(token) {
  if (!confirm('Deactivate this client brief link? The client will no longer be able to submit.')) return;

  const res = await api.deactivateBrief(token);
  if (res.success) {
    alert('Brief link deactivated.');
    loadAdminBriefs();
  }
}

// Requirement D.1.2: Open Answers Printable Sheet with Aurora Wordmark, Meta, Q&As and Quote
export async function openBriefAnswers(token) {
  let brief = (allAdminBriefs || []).find(b => b.token === token);
  if (!brief || !brief.data) {
    try {
      const res = await api.fetchBriefs();
      if (res.success && res.data) {
        allAdminBriefs = res.data;
        brief = allAdminBriefs.find(b => b.token === token);
      }
    } catch (e) {
      console.warn('Error fetching briefs:', e);
    }
  }

  if (!brief || !brief.data) {
    alert('No client submission data recorded yet.');
    return;
  }

  const d = brief.data;
  const generatorName = brief.generatedBy || currentUser?.name || 'Manager';
  const subDate = brief.submittedAt ? new Date(brief.submittedAt).toLocaleDateString() : new Date().toLocaleDateString();

  const clientNameEl = document.getElementById('printBriefClientName');
  const brandNameEl = document.getElementById('printBriefBrandName');
  const subDateEl = document.getElementById('printBriefSubmissionDate');
  const genByEl = document.getElementById('printBriefGeneratedBy');

  if (clientNameEl) clientNameEl.textContent = brief.clientName;
  if (brandNameEl) brandNameEl.textContent = brief.brandName || '—';
  if (subDateEl) subDateEl.textContent = subDate;
  if (genByEl) genByEl.textContent = generatorName;

  const container = document.getElementById('viewBriefAnswersContent');
  if (container) {
    container.innerHTML = `
      <div style="background:var(--surface-sunken); padding:20px; border-radius:var(--radius-sm); border:1px solid var(--border-default); margin-bottom:20px;">
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:16px 24px;">
          <div style="min-width:0;"><span style="font-size:11px; color:var(--text-muted); font-weight:800; text-transform:uppercase; letter-spacing:0.5px;">Full Name</span><strong style="display:block; font-size:1.05rem; color:var(--text-primary); margin-top:4px; word-break:break-word;">${escapeHtml(d.fullName || brief.clientName || 'N/A')}</strong></div>
          <div style="min-width:0;"><span style="font-size:11px; color:var(--text-muted); font-weight:800; text-transform:uppercase; letter-spacing:0.5px;">Role</span><strong style="display:block; font-size:1rem; color:var(--text-primary); margin-top:4px; word-break:break-word;">${escapeHtml(d.role || 'N/A')}</strong></div>
          <div style="min-width:0;"><span style="font-size:11px; color:var(--text-muted); font-weight:800; text-transform:uppercase; letter-spacing:0.5px;">Brand</span><strong style="display:block; font-size:1.05rem; color:var(--text-primary); margin-top:4px; word-break:break-word;">${escapeHtml(d.brandName || brief.brandName || 'N/A')}</strong></div>
          <div style="min-width:0;"><span style="font-size:11px; color:var(--text-muted); font-weight:800; text-transform:uppercase; letter-spacing:0.5px;">Phone / WhatsApp</span><strong style="display:block; font-size:1rem; color:var(--text-primary); margin-top:4px; word-break:break-word;" dir="ltr">${escapeHtml(d.phone || 'N/A')}</strong></div>
          <div style="min-width:0;"><span style="font-size:11px; color:var(--text-muted); font-weight:800; text-transform:uppercase; letter-spacing:0.5px;">Email</span><strong style="display:block; font-size:0.95rem; color:var(--text-primary); margin-top:4px; word-break:break-all; overflow-wrap:anywhere;" dir="ltr">${escapeHtml(d.email || 'N/A')}</strong></div>
          <div style="min-width:0;"><span style="font-size:11px; color:var(--text-muted); font-weight:800; text-transform:uppercase; letter-spacing:0.5px;">Monthly Budget</span><strong style="display:block; font-size:1.1rem; color:var(--timeline-accent); margin-top:4px; word-break:break-word;">${escapeHtml(d.budget || 'N/A')}</strong></div>
        </div>
      </div>

      <div style="display:flex; flex-direction:column; gap:22px;">
        <!-- Step 2: Business Model -->
        <div style="background:var(--surface-raised); padding:18px; border-radius:var(--radius-sm); border:1px solid var(--border-default);">
          <h4 style="margin-bottom:14px; color:var(--accent-action); font-size:1.1rem; font-weight:800; border-bottom:1px solid var(--border-subtle); padding-bottom:8px;">Step 2: Business Model &amp; Core Positioning</h4>
          
          <div style="margin-bottom:14px;">
            <span style="font-size:12.5px; font-weight:800; color:var(--text-primary); text-transform:uppercase; letter-spacing:0.5px; display:block; margin-bottom:5px;">Products &amp; Services Sold:</span>
            <div style="background:var(--surface-sunken); padding:10px 14px; border-radius:var(--radius-sm); border:1px solid var(--border-subtle); line-height:1.6; font-size:0.95rem; color:var(--text-secondary);">${d.businessModel || 'N/A'}</div>
          </div>

          <div style="display:grid; grid-template-columns:1fr 1fr; gap:14px; margin-bottom:14px;">
            <div>
              <span style="font-size:12.5px; font-weight:800; color:var(--text-primary); text-transform:uppercase; letter-spacing:0.5px; display:block; margin-bottom:5px;">Years in Operation:</span>
              <div style="background:var(--surface-sunken); padding:8px 12px; border-radius:var(--radius-sm); border:1px solid var(--border-subtle); font-size:0.95rem; color:var(--text-secondary);">${d.yearsInOperation || 'N/A'}</div>
            </div>
            <div>
              <span style="font-size:12.5px; font-weight:800; color:var(--text-primary); text-transform:uppercase; letter-spacing:0.5px; display:block; margin-bottom:5px;">Branches / Retail Points:</span>
              <div style="background:var(--surface-sunken); padding:8px 12px; border-radius:var(--radius-sm); border:1px solid var(--border-subtle); font-size:0.95rem; color:var(--text-secondary);">${d.branches || 'N/A'}</div>
            </div>
          </div>

          <div>
            <span style="font-size:12.5px; font-weight:800; color:var(--text-primary); text-transform:uppercase; letter-spacing:0.5px; display:block; margin-bottom:5px;">What Makes Your Brand Different (Differentiator):</span>
            <div style="background:var(--surface-sunken); padding:10px 14px; border-radius:var(--radius-sm); border:1px solid var(--border-subtle); line-height:1.6; font-size:0.95rem; color:var(--text-secondary);">${d.differentiator || 'N/A'}</div>
          </div>
        </div>

        <!-- Step 3: Strategic Goals -->
        <div style="background:var(--surface-raised); padding:18px; border-radius:var(--radius-sm); border:1px solid var(--border-default);">
          <h4 style="margin-bottom:14px; color:var(--accent-action); font-size:1.1rem; font-weight:800; border-bottom:1px solid var(--border-subtle); padding-bottom:8px;">Step 3: Strategic 6-Month Goals</h4>
          
          <div style="margin-bottom:14px;">
            <span style="font-size:12.5px; font-weight:800; color:var(--text-primary); text-transform:uppercase; letter-spacing:0.5px; display:block; margin-bottom:5px;">Single Most Important Goal:</span>
            <div style="background:var(--surface-sunken); padding:10px 14px; border-radius:var(--radius-sm); border:1px solid var(--border-subtle); line-height:1.6; font-size:0.95rem; color:var(--text-secondary);">${d.primaryGoals || 'N/A'}</div>
          </div>

          <div>
            <span style="font-size:12.5px; font-weight:800; color:var(--text-primary); text-transform:uppercase; letter-spacing:0.5px; display:block; margin-bottom:5px;">Key Numbers &amp; KPIs Tracked:</span>
            <div style="background:var(--surface-sunken); padding:10px 14px; border-radius:var(--radius-sm); border:1px solid var(--border-subtle); line-height:1.6; font-size:0.95rem; color:var(--text-secondary);">${d.kpis || 'N/A'}</div>
          </div>
        </div>

        <!-- Step 4: Digital Assets -->
        <div style="background:var(--surface-raised); padding:18px; border-radius:var(--radius-sm); border:1px solid var(--border-default);">
          <h4 style="margin-bottom:14px; color:var(--accent-action); font-size:1.1rem; font-weight:800; border-bottom:1px solid var(--border-subtle); padding-bottom:8px;">Step 4: Current Digital Assets</h4>
          
          <div style="margin-bottom:14px;">
            <span style="font-size:12.5px; font-weight:800; color:var(--text-primary); text-transform:uppercase; letter-spacing:0.5px; display:block; margin-bottom:5px;">Social Media &amp; Website Links:</span>
            <div style="background:var(--surface-sunken); padding:10px 14px; border-radius:var(--radius-sm); border:1px solid var(--border-subtle); line-height:1.6; font-size:0.95rem; color:var(--text-secondary); white-space:pre-wrap;" dir="ltr">${d.digitalAssetsLinks || 'N/A'}</div>
          </div>

          <div style="margin-bottom:14px;">
            <span style="font-size:12.5px; font-weight:800; color:var(--text-primary); text-transform:uppercase; letter-spacing:0.5px; display:block; margin-bottom:5px;">Existing Logo &amp; Guidelines:</span>
            <div style="background:var(--surface-sunken); padding:8px 12px; border-radius:var(--radius-sm); border:1px solid var(--border-subtle); font-size:0.95rem; color:var(--text-secondary);">${d.assetsReady || 'N/A'}</div>
          </div>

          <div>
            <span style="font-size:12.5px; font-weight:800; color:var(--text-primary); text-transform:uppercase; letter-spacing:0.5px; display:block; margin-bottom:5px;">Google Drive Asset Link:</span>
            <div style="background:var(--surface-sunken); padding:10px 14px; border-radius:var(--radius-sm); border:1px solid var(--border-subtle);">
              ${d.driveLink ? `<a href="${d.driveLink}" target="_blank" rel="noopener" style="color:var(--accent-action); font-size:0.95rem; word-break:break-all; font-weight:600;">${d.driveLink} ↗</a>` : '<span style="font-size:0.92rem; color:var(--text-muted);">None provided</span>'}
            </div>
          </div>
        </div>

        <!-- Step 5: Competitors & Taste -->
        <div style="background:var(--surface-raised); padding:18px; border-radius:var(--radius-sm); border:1px solid var(--border-default);">
          <h4 style="margin-bottom:14px; color:var(--accent-action); font-size:1.1rem; font-weight:800; border-bottom:1px solid var(--border-subtle); padding-bottom:8px;">Step 5: Competitors &amp; Visual Taste</h4>
          
          <div style="margin-bottom:14px;">
            <span style="font-size:12.5px; font-weight:800; color:var(--text-primary); text-transform:uppercase; letter-spacing:0.5px; display:block; margin-bottom:5px;">Brands Admired (References):</span>
            <div style="background:var(--surface-sunken); padding:10px 14px; border-radius:var(--radius-sm); border:1px solid var(--border-subtle); line-height:1.6; font-size:0.95rem; color:var(--text-secondary);">${d.competitors || 'N/A'}</div>
          </div>

          <div>
            <span style="font-size:12.5px; font-weight:800; color:var(--text-primary); text-transform:uppercase; letter-spacing:0.5px; display:block; margin-bottom:5px;">Visual Styles &amp; Ads Strongly Disliked:</span>
            <div style="background:var(--surface-sunken); padding:10px 14px; border-radius:var(--radius-sm); border:1px solid var(--border-subtle); line-height:1.6; font-size:0.95rem; color:var(--text-secondary);">${d.visualTasteDislikes || 'N/A'}</div>
          </div>
        </div>

        <!-- Step 6: Strategy Meeting -->
        <div style="background:var(--surface-raised); padding:18px; border-radius:var(--radius-sm); border:1px solid var(--border-default);">
          <h4 style="margin-bottom:14px; color:var(--accent-action); font-size:1.1rem; font-weight:800; border-bottom:1px solid var(--border-subtle); padding-bottom:8px;">Step 6: Strategy Meeting Arrangements</h4>
          
          <div style="margin-bottom:14px;">
            <span style="font-size:12.5px; font-weight:800; color:var(--text-primary); text-transform:uppercase; letter-spacing:0.5px; display:block; margin-bottom:5px;">Meeting Venue:</span>
            <div style="background:var(--surface-sunken); padding:10px 14px; border-radius:var(--radius-sm); border:1px solid var(--border-subtle); font-weight:700; font-size:0.95rem; color:var(--timeline-accent);">📍 ${d.meetVenue || 'Sharks Office Space'}</div>
          </div>

          <div style="display:grid; grid-template-columns:1fr 1fr; gap:14px;">
            <div>
              <span style="font-size:12.5px; font-weight:800; color:var(--text-primary); text-transform:uppercase; letter-spacing:0.5px; display:block; margin-bottom:5px;">Preferred Date &amp; Time:</span>
              <div style="background:var(--surface-sunken); padding:8px 12px; border-radius:var(--radius-sm); border:1px solid var(--border-subtle); font-size:0.95rem; color:var(--text-secondary);">${d.meetingDatePreference || 'N/A'}</div>
            </div>
            <div>
              <span style="font-size:12.5px; font-weight:800; color:var(--text-primary); text-transform:uppercase; letter-spacing:0.5px; display:block; margin-bottom:5px;">Attendees &amp; Decision Makers:</span>
              <div style="background:var(--surface-sunken); padding:8px 12px; border-radius:var(--radius-sm); border:1px solid var(--border-subtle); font-size:0.95rem; color:var(--text-secondary);">${d.meetingAttendees || 'N/A'}</div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  document.getElementById('viewBriefAnswersModal')?.classList.add('active');
}

export function openMeetingPrep(token) {
  const brief = allAdminBriefs.find(b => b.token === token) || { clientName: "Client", brandName: "Brand" };
  const d = brief.data || {};

  document.getElementById('prepClientHeading').textContent = `${brief.clientName} — ${brief.brandName || 'Meeting Strategy'}`;
  const container = document.getElementById('prepSheetContent');
  container.innerHTML = `
    <div class="numbers-grid" style="margin-bottom:24px; background:var(--surface-sunken); padding:20px; border-radius:var(--radius-card); border:1px solid var(--border-default);">
      <div><div class="number-val" style="font-size:1.4rem;">${d.budget || '50k-100k'}</div><div class="number-label">Budget (EGP)</div></div>
      <div><div class="number-val" style="font-size:1.4rem;">${d.primaryGoals ? 'Goal Defined' : 'Scaling'}</div><div class="number-label">Primary Target</div></div>
      <div><div class="number-val" style="font-size:1.4rem;">Sharks Space</div><div class="number-label">Venue</div></div>
    </div>
    <div style="background:var(--surface-sunken); padding:20px; border-radius:var(--radius-card); border:1px solid var(--border-default);">
      <h4 style="margin-bottom:8px;">Meeting Agenda & Questions to Ask:</h4>
      <ul style="padding-left:20px; font-size:0.92rem; display:flex; flex-direction:column; gap:6px;">
        <li>What is the unit profit margin on your flagship collection?</li>
        <li>Is inventory ready to fulfill 500+ orders weekly upon ad campaign launch?</li>
        <li>Preferred voiceover tone for reel commercials (Classical Arabic vs. Modern Egyptian)?</li>
      </ul>
    </div>
  `;

  document.getElementById('meetingPrepModal')?.classList.add('active');
}

// 2. Public Contact Inquiries (CRM)
async function loadAdminCRM() {
  try {
    const res = await api.fetchInquiries();
    if (res.success) {
      allAdminInquiries = res.data;
      renderAdminCRMTable(allAdminInquiries);
    }
  } catch (err) {
    console.error('Failed to load CRM:', err);
  }
}

function renderAdminCRMTable(inquiries, targetTbodyId = null) {
  const targets = targetTbodyId
    ? [document.getElementById(targetTbodyId)].filter(Boolean)
    : [document.getElementById('adminInquiriesTableBody'), document.getElementById('portalInquiriesTableBody')].filter(Boolean);

  if (!targets.length) return;

  const html = !inquiries.length
    ? `<tr><td colspan="7" style="text-align:center; padding:32px; color:var(--text-muted);">No inquiries received yet.</td></tr>`
    : inquiries.map(inq => `
        <tr>
          <td style="max-width:200px;">
            <strong style="display:block; color:var(--text-primary); font-size:0.95rem;">${escapeHtml(inq.fullName)}</strong>
            ${inq.email ? `<span style="display:block; font-size:0.8rem; color:var(--text-muted); word-break:break-all; margin-top:2px;" dir="ltr">${escapeHtml(inq.email)}</span>` : ''}
          </td>
          <td><strong>${escapeHtml(inq.brandName || '—')}</strong></td>
          <td dir="ltr" style="white-space:nowrap;">${escapeHtml(inq.phone)}</td>
          <td style="white-space:nowrap;">${new Date(inq.createdAt).toLocaleDateString()}</td>
          <td style="white-space:nowrap; font-weight:700; color:var(--timeline-accent);">${escapeHtml(inq.budget || '—')}</td>
          <td>
            <select class="form-select" style="padding:4px 8px; font-size:0.85rem;" onchange="window.auroraOpenCRMStatusModal('${inq.id}', this.value); this.value = '${inq.status || 'Pending'}';">
              <option value="Pending" ${inq.status === 'Pending' ? 'selected' : ''}>Pending</option>
              <option value="Contacted" ${inq.status === 'Contacted' ? 'selected' : ''}>Contacted</option>
              <option value="Meeting Scheduled" ${inq.status === 'Meeting Scheduled' ? 'selected' : ''}>Meeting Scheduled</option>
              <option value="In Progress" ${inq.status === 'In Progress' ? 'selected' : ''}>In Progress</option>
              <option value="Ended" ${inq.status === 'Ended' ? 'selected' : ''}>Ended</option>
              <option value="Dead" ${inq.status === 'Dead' ? 'selected' : ''}>Dead</option>
            </select>
          </td>
          <td style="white-space:nowrap;">
            <!-- Requirement D.2.1: Open full CRM details modal showing all fields and Q&A -->
            <button class="btn btn-sm btn-outline" onclick="window.auroraOpenCRMDetails('${inq.id}')">View Details</button>
          </td>
        </tr>
      `).join('');

  targets.forEach(tbody => {
    tbody.innerHTML = html;
  });
}

// Requirement D.2.1: Full CRM Details Modal with Status & Notes History
export function openCRMDetails(id) {
  const inq = allAdminInquiries.find(i => i.id === id);
  if (!inq) return;

  const heading = document.getElementById('crmDetailClientHeading');
  if (heading) heading.textContent = `${inq.fullName} (${inq.brandName || 'Brand'})`;

  const historyList = Array.isArray(inq.statusHistory) && inq.statusHistory.length ? inq.statusHistory : [];
  const statusHistoryHtml = historyList.length ? `
    <div style="display:flex; flex-direction:column; gap:10px; max-height:220px; overflow-y:auto; padding-right:6px;">
      ${historyList.map(h => `
        <div style="background:var(--surface-sunken); padding:10px 14px; border-radius:var(--radius-sm); border:1px solid var(--border-subtle); font-size:0.88rem;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px; flex-wrap:wrap; gap:6px;">
            <span style="font-weight:700; color:var(--text-primary); font-size:0.85rem;">
              <span class="status-pill status-${(h.fromStatus || 'Pending').toLowerCase().replace(/\s+/g, '-')}">${h.fromStatus || 'Pending'}</span>
              <span style="margin:0 4px; color:var(--text-muted);">→</span>
              <span class="status-pill status-${(h.toStatus || 'Pending').toLowerCase().replace(/\s+/g, '-')}">${h.toStatus || 'Pending'}</span>
            </span>
            <span style="font-size:0.75rem; color:var(--text-muted);">${new Date(h.updatedAt).toLocaleString()} by ${escapeHtml(h.updatedBy || 'Staff')}</span>
          </div>
          <p style="margin:4px 0 0 0; color:var(--text-secondary); line-height:1.5; font-size:0.86rem; word-break:break-word;">
            ${escapeHtml(h.note || 'No note recorded')}
          </p>
        </div>
      `).join('')}
    </div>
  ` : `<p style="color:var(--text-muted); font-size:0.88rem; margin:0;">No previous status history logged yet.</p>`;

  const container = document.getElementById('crmDetailContent');
  if (container) {
    container.innerHTML = `
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:12px; background:var(--surface-sunken); padding:14px; border-radius:var(--radius-sm); border:1px solid var(--border-default);">
        <div><span style="font-size:11px; color:var(--text-muted); display:block; text-transform:uppercase;">Phone</span><strong>${escapeHtml(inq.phone)}</strong></div>
        <div><span style="font-size:11px; color:var(--text-muted); display:block; text-transform:uppercase;">Email</span><strong>${escapeHtml(inq.email || '—')}</strong></div>
        <div><span style="font-size:11px; color:var(--text-muted); display:block; text-transform:uppercase;">Budget</span><strong>${escapeHtml(inq.budget || '—')}</strong></div>
        <div><span style="font-size:11px; color:var(--text-muted); display:block; text-transform:uppercase;">Industry</span><strong>${escapeHtml(inq.industry || '—')}</strong></div>
        <div><span style="font-size:11px; color:var(--text-muted); display:block; text-transform:uppercase;">Submission Date</span><strong>${new Date(inq.createdAt).toLocaleString()}</strong></div>
        <div><span style="font-size:11px; color:var(--text-muted); display:block; text-transform:uppercase;">Pipeline Status</span><span class="status-pill status-${(inq.status || 'Pending').toLowerCase().replace(/\s+/g, '-')}">${escapeHtml(inq.status)}</span></div>
      </div>

      <div>
        <h4 style="margin:0 0 6px 0; color:var(--text-primary); font-size:0.95rem;">Requested Services:</h4>
        <div style="display:flex; flex-wrap:wrap; gap:8px;">
          ${(inq.services || []).map(s => `<span class="badge badge-teal">${escapeHtml(s)}</span>`).join('') || '<span style="color:var(--text-muted);">None specified</span>'}
        </div>
      </div>

      <div>
        <h4 style="margin:0 0 6px 0; color:var(--text-primary); font-size:0.95rem;">Client Message &amp; Strategic Notes:</h4>
        <div style="background:var(--surface-sunken); padding:14px; border-radius:var(--radius-sm); border:1px solid var(--border-default); line-height:1.6; font-size:0.92rem; word-break:break-word;">
          ${escapeHtml(inq.message || 'No additional message provided.')}
        </div>
      </div>

      <div>
        <h4 style="margin:0 0 8px 0; color:var(--text-primary); font-size:0.95rem;">Status &amp; Notes History:</h4>
        ${statusHistoryHtml}
      </div>
    `;
  }

  document.getElementById('crmDetailsModal')?.classList.add('active');
}

export function filterCRM() {
  const search = (document.getElementById('crmSearchInput')?.value || '').toLowerCase();
  const status = document.getElementById('crmStatusFilter')?.value || 'all';

  const filtered = allAdminInquiries.filter(inq => {
    const matchesSearch = (inq.fullName || '').toLowerCase().includes(search) || (inq.brandName || '').toLowerCase().includes(search);
    const matchesStatus = status === 'all' || inq.status === status;
    return matchesSearch && matchesStatus;
  });

  renderAdminCRMTable(filtered, 'adminInquiriesTableBody');
}

export function filterPortalCRM() {
  const search = (document.getElementById('portalCrmSearchInput')?.value || '').toLowerCase();
  const status = document.getElementById('portalCrmStatusFilter')?.value || 'all';

  const filtered = allAdminInquiries.filter(inq => {
    const matchesSearch = (inq.fullName || '').toLowerCase().includes(search) || (inq.brandName || '').toLowerCase().includes(search) || (inq.phone || '').toLowerCase().includes(search) || (inq.email || '').toLowerCase().includes(search);
    const matchesStatus = status === 'all' || inq.status === status;
    return matchesSearch && matchesStatus;
  });

  renderAdminCRMTable(filtered, 'portalInquiriesTableBody');
}

export function openCRMStatusModal(id, targetStatus) {
  const inq = allAdminInquiries.find(i => i.id === id);
  if (!inq) return;

  const leadNameEl = document.getElementById('crmStatusModalLeadName');
  if (leadNameEl) leadNameEl.textContent = `${inq.fullName} — ${inq.brandName || 'Direct Client'}`;

  const idInput = document.getElementById('crmStatusInquiryId');
  if (idInput) idInput.value = id;

  const sel = document.getElementById('crmStatusModalSelect');
  if (sel) sel.value = targetStatus || inq.status || 'Pending';

  const noteInput = document.getElementById('crmStatusModalNote');
  if (noteInput) {
    noteInput.value = '';
    setTimeout(() => noteInput.focus(), 120);
  }

  document.getElementById('crmStatusModal')?.classList.add('active');
}

export async function submitCRMStatusUpdate(event) {
  if (event) event.preventDefault();

  const id = document.getElementById('crmStatusInquiryId')?.value;
  const status = document.getElementById('crmStatusModalSelect')?.value;
  const note = (document.getElementById('crmStatusModalNote')?.value || '').trim();

  if (!note) {
    showToastNotification('Please enter a brief note explaining the reason or case standing for this update.', 'warning');
    document.getElementById('crmStatusModalNote')?.focus();
    return;
  }

  const submitBtn = document.getElementById('crmStatusSubmitBtn');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Saving...';
  }

  try {
    const res = await api.updateInquiryStatus(id, status, note);
    if (res && res.success) {
      showToastNotification(`Lead status updated to "${status}".`, 'success');
      closeAllModalsAndDrawers();
      await loadAdminCRM();
      await loadAdminActivityLogs();
    } else {
      showToastNotification((res && res.error) || 'Failed to update status', 'error');
    }
  } catch (err) {
    console.error('Error updating inquiry status:', err);
    showToastNotification('Network error while updating status: ' + err.message, 'error');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Confirm & Save Status';
    }
  }
}

// -----------------------------------------------------------------------------
// QUOTATIONS & COMMERCIAL INVOICES (PART 4)
// -----------------------------------------------------------------------------

export async function loadAdminInvoices() {
  const tbody = document.getElementById('adminInvoicesTableBody');
  if (!tbody) return;

  try {
    let invoices = [];
    try {
      const res = await api.fetchInvoices();
      if (res && res.success && Array.isArray(res.data)) {
        invoices = res.data;
        localStorage.setItem('aurora_invoices', JSON.stringify(invoices));
      }
    } catch (e) {
      console.warn('Backend invoices fetch failed, falling back to local storage cache:', e);
      const cached = localStorage.getItem('aurora_invoices');
      if (cached) {
        try { invoices = JSON.parse(cached); } catch (err) {}
      }
    }

    allAdminInvoices = invoices;
    renderAdminInvoicesTable(allAdminInvoices);
  } catch (err) {
    console.error('Failed to load invoices:', err);
  }
}

export function renderAdminInvoicesTable(invoices) {
  const tbody = document.getElementById('adminInvoicesTableBody');
  if (!tbody) return;

  if (!invoices.length) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:32px; color:var(--text-muted);">No quotations or invoices generated yet. Click "+ Create Quotation / Invoice" to create your first one.</td></tr>`;
    return;
  }

  tbody.innerHTML = invoices.map(inv => {
    const isQuotation = (inv.type || 'quotation').toLowerCase() === 'quotation';
    const typeBadge = isQuotation 
      ? `<span class="badge badge-accent">QUOTATION</span>`
      : `<span class="badge badge-teal">INVOICE</span>`;

    const statusClass = (inv.status || 'Draft').toLowerCase();
    const formattedTotal = Number(inv.total || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    return `
      <tr>
        <td><strong style="color:var(--text-primary); font-family:monospace; font-size:0.95rem;">${inv.number}</strong></td>
        <td>${typeBadge}</td>
        <td>
          <div style="font-weight:700; color:var(--text-primary); font-size:0.95rem;">${inv.clientName || 'Client'}</div>
          ${inv.brandName ? `<div style="font-size:0.8rem; color:var(--text-muted);">${inv.brandName}</div>` : ''}
        </td>
        <td style="white-space:nowrap;">${inv.issueDate || '—'}</td>
        <td style="white-space:nowrap; font-weight:800; color:var(--timeline-accent);">${formattedTotal} ${inv.currency || 'EGP'}</td>
        <td><span class="status-pill status-${statusClass}">${inv.status || 'Draft'}</span></td>
        <td style="white-space:nowrap;">
          <button class="btn btn-sm btn-primary" onclick="window.auroraViewInvoicePrint('${inv.id}')" title="View & Print">🖨️ View / Print</button>
          <button class="btn btn-sm btn-outline" onclick="window.auroraOpenCreateInvoiceModal('${inv.id}')" title="Edit">✏️</button>
          <button class="btn btn-sm btn-secondary" style="color:var(--status-error);" onclick="window.auroraDeleteInvoice('${inv.id}')" title="Delete">🗑️</button>
        </td>
      </tr>
    `;
  }).join('');
}

export function filterInvoices() {
  const search = (document.getElementById('invoiceSearchInput')?.value || '').toLowerCase();
  const type = document.getElementById('invoiceTypeFilter')?.value || 'all';
  const status = document.getElementById('invoiceStatusFilter')?.value || 'all';

  const filtered = allAdminInvoices.filter(inv => {
    const matchesSearch = (inv.clientName || '').toLowerCase().includes(search) ||
                          (inv.brandName || '').toLowerCase().includes(search) ||
                          (inv.number || '').toLowerCase().includes(search);
    const matchesType = type === 'all' || (inv.type || 'quotation').toLowerCase() === type.toLowerCase();
    const matchesStatus = status === 'all' || (inv.status || 'Draft').toLowerCase() === status.toLowerCase();
    return matchesSearch && matchesType && matchesStatus;
  });

  renderAdminInvoicesTable(filtered);
}

export function openCreateInvoiceModal(id = null) {
  const modal = document.getElementById('createInvoiceModal');
  if (!modal) return;

  const form = document.getElementById('createInvoiceForm');
  if (form) form.reset();

  const titleEl = document.getElementById('invoiceModalTitle');
  const idInput = document.getElementById('invoiceIdInput');
  const numberInput = document.getElementById('invoiceNumberInput');
  const typeInput = document.getElementById('invoiceTypeInput');
  const statusInput = document.getElementById('invoiceStatusInput');
  const issueDateInput = document.getElementById('invoiceIssueDateInput');
  const dueDateInput = document.getElementById('invoiceDueDateInput');
  const clientNameInput = document.getElementById('invoiceClientNameInput');
  const brandNameInput = document.getElementById('invoiceBrandNameInput');
  const emailInput = document.getElementById('invoiceEmailInput');
  const phoneInput = document.getElementById('invoicePhoneInput');
  const taxIdInput = document.getElementById('invoiceTaxIdInput');
  const discountInput = document.getElementById('invoiceDiscountInput');
  const applyVatInput = document.getElementById('invoiceApplyVatInput');
  const paymentTermsInput = document.getElementById('invoicePaymentTermsInput');
  const notesInput = document.getElementById('invoiceNotesInput');
  const tbody = document.getElementById('invoiceLineItemsBody');

  if (id) {
    const inv = allAdminInvoices.find(i => i.id === id);
    if (!inv) return;

    if (titleEl) titleEl.textContent = `✏️ Edit ${inv.type === 'invoice' ? 'Commercial Invoice' : 'Quotation'} #${inv.number}`;
    if (idInput) idInput.value = inv.id;
    if (numberInput) numberInput.value = inv.number;
    if (typeInput) typeInput.value = inv.type || 'quotation';
    if (statusInput) statusInput.value = inv.status || 'Draft';
    if (issueDateInput) issueDateInput.value = inv.issueDate || '';
    if (dueDateInput) dueDateInput.value = inv.dueDate || '';
    if (clientNameInput) clientNameInput.value = inv.clientName || '';
    if (brandNameInput) brandNameInput.value = inv.brandName || '';
    if (emailInput) emailInput.value = inv.email || '';
    if (phoneInput) phoneInput.value = inv.phone || '';
    if (taxIdInput) taxIdInput.value = inv.taxId || '';
    if (discountInput) discountInput.value = inv.discount || 0;
    if (applyVatInput) applyVatInput.checked = Boolean(inv.applyVat);
    if (paymentTermsInput) paymentTermsInput.value = inv.paymentMethod || 'Next Bank / CIB / Instapay (aurora.egy@instapay)';
    if (notesInput) notesInput.value = inv.notes || '';

    if (tbody) {
      tbody.innerHTML = '';
      const items = inv.items && inv.items.length ? inv.items : [{ description: 'Commercial Production & Marketing Campaign', qty: 1, rate: 25000 }];
      items.forEach(it => addInvoiceLineItem(it.description, it.qty, it.rate));
    }
  } else {
    if (titleEl) titleEl.textContent = '🧾 Create Quotation / Invoice';
    if (idInput) idInput.value = '';
    const nextCount = allAdminInvoices.length + 1;
    const year = new Date().getFullYear();
    if (numberInput) numberInput.value = `AUR-${year}-${String(nextCount).padStart(3, '0')}`;
    if (typeInput) typeInput.value = 'quotation';
    if (statusInput) statusInput.value = 'Draft';
    const today = new Date().toISOString().split('T')[0];
    if (issueDateInput) issueDateInput.value = today;
    const in15Days = new Date(Date.now() + 15 * 86400000).toISOString().split('T')[0];
    if (dueDateInput) dueDateInput.value = in15Days;
    if (discountInput) discountInput.value = '0';
    if (applyVatInput) applyVatInput.checked = false;
    if (paymentTermsInput) paymentTermsInput.value = 'Next Bank / CIB / Instapay (aurora.egy@instapay)';
    if (notesInput) notesInput.value = 'Quotations are valid for 15 days from issue date.';

    if (tbody) {
      tbody.innerHTML = '';
      addInvoiceLineItem('Media Production & Creative Campaign Execution', 1, 35000);
    }
  }

  calcInvoiceTotals();
  modal.classList.add('active');
}

export function updateInvoiceTypeLabel() {
  const type = document.getElementById('invoiceTypeInput')?.value;
  const titleEl = document.getElementById('invoiceModalTitle');
  if (titleEl && !document.getElementById('invoiceIdInput')?.value) {
    titleEl.textContent = type === 'invoice' ? '🧾 Create Commercial Tax Invoice' : '🧾 Create Official Quotation';
  }
}

export function addInvoiceLineItem(description = '', qty = 1, rate = 0) {
  const tbody = document.getElementById('invoiceLineItemsBody');
  if (!tbody) return;

  const tr = document.createElement('tr');
  tr.className = 'invoice-line-item-row';
  tr.innerHTML = `
    <td>
      <input type="text" class="form-input item-desc-input" required placeholder="Service or deliverable description..." value="${escapeHtml(description)}" style="padding:6px 10px; font-size:0.9rem;">
    </td>
    <td>
      <input type="number" class="form-input item-qty-input" required min="1" step="any" value="${qty}" oninput="window.auroraCalcInvoiceTotals()" style="padding:6px 8px; text-align:center; font-size:0.9rem;">
    </td>
    <td>
      <input type="number" class="form-input item-rate-input" required min="0" step="any" value="${rate}" oninput="window.auroraCalcInvoiceTotals()" style="padding:6px 8px; text-align:right; font-size:0.9rem;">
    </td>
    <td style="text-align:right; font-weight:700; color:var(--text-primary); vertical-align:middle;">
      <span class="item-line-total">0.00</span> EGP
    </td>
    <td style="text-align:center; vertical-align:middle;">
      <button type="button" class="btn btn-sm btn-outline" style="border:none; color:var(--status-error); padding:4px 6px;" onclick="window.auroraRemoveInvoiceLineItem(this)">✕</button>
    </td>
  `;
  tbody.appendChild(tr);
  calcInvoiceTotals();
}

export function removeInvoiceLineItem(btn) {
  const row = btn.closest('tr');
  const tbody = document.getElementById('invoiceLineItemsBody');
  if (tbody && tbody.children.length > 1) {
    row.remove();
  } else {
    alert('At least one deliverable item is required.');
  }
  calcInvoiceTotals();
}

export function calcInvoiceTotals() {
  const rows = document.querySelectorAll('.invoice-line-item-row');
  let subtotal = 0;

  rows.forEach(r => {
    const qty = parseFloat(r.querySelector('.item-qty-input')?.value) || 0;
    const rate = parseFloat(r.querySelector('.item-rate-input')?.value) || 0;
    const lineTotal = qty * rate;
    const lineTotalEl = r.querySelector('.item-line-total');
    if (lineTotalEl) lineTotalEl.textContent = lineTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    subtotal += lineTotal;
  });

  const discount = parseFloat(document.getElementById('invoiceDiscountInput')?.value) || 0;
  const taxable = Math.max(0, subtotal - discount);
  const applyVat = document.getElementById('invoiceApplyVatInput')?.checked;
  const vat = applyVat ? (taxable * 0.14) : 0;
  const grandTotal = taxable + vat;

  const subtotalEl = document.getElementById('invoiceCalcSubtotal');
  const vatEl = document.getElementById('invoiceCalcVat');
  const grandTotalEl = document.getElementById('invoiceCalcGrandTotal');

  if (subtotalEl) subtotalEl.textContent = `${subtotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EGP`;
  if (vatEl) vatEl.textContent = `${vat.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EGP`;
  if (grandTotalEl) grandTotalEl.textContent = `${grandTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EGP`;

  return { subtotal, discount, vat, grandTotal };
}

export async function saveInvoice(e) {
  if (e) e.preventDefault();

  const id = document.getElementById('invoiceIdInput')?.value || null;
  const number = document.getElementById('invoiceNumberInput')?.value.trim();
  const type = document.getElementById('invoiceTypeInput')?.value || 'quotation';
  const status = document.getElementById('invoiceStatusInput')?.value || 'Draft';
  const issueDate = document.getElementById('invoiceIssueDateInput')?.value;
  const dueDate = document.getElementById('invoiceDueDateInput')?.value;
  const clientName = document.getElementById('invoiceClientNameInput')?.value.trim();
  const brandName = document.getElementById('invoiceBrandNameInput')?.value.trim();
  const email = document.getElementById('invoiceEmailInput')?.value.trim();
  const phone = document.getElementById('invoicePhoneInput')?.value.trim();
  const taxId = document.getElementById('invoiceTaxIdInput')?.value.trim();
  const paymentMethod = document.getElementById('invoicePaymentTermsInput')?.value.trim();
  const notes = document.getElementById('invoiceNotesInput')?.value.trim();

  const rows = document.querySelectorAll('.invoice-line-item-row');
  const items = [];
  rows.forEach(r => {
    const description = r.querySelector('.item-desc-input')?.value.trim();
    const qty = parseFloat(r.querySelector('.item-qty-input')?.value) || 1;
    const rate = parseFloat(r.querySelector('.item-rate-input')?.value) || 0;
    if (description) {
      items.push({ description, qty, rate, total: qty * rate });
    }
  });

  if (!items.length) {
    alert('Please add at least one line item with a description.');
    return;
  }

  const { subtotal, discount, vat, grandTotal } = calcInvoiceTotals();
  const applyVat = document.getElementById('invoiceApplyVatInput')?.checked;

  const payload = {
    id,
    number,
    type,
    status,
    issueDate,
    dueDate,
    clientName,
    brandName,
    email,
    phone,
    taxId,
    items,
    subtotal,
    discount,
    applyVat,
    vatAmount: vat,
    total: grandTotal,
    currency: 'EGP',
    notes,
    paymentMethod
  };

  try {
    let saved = null;
    try {
      const res = await api.saveInvoice(payload);
      if (res && res.success && res.data) saved = res.data;
    } catch (apiErr) {
      console.warn('API saveInvoice failed, saving to localStorage:', apiErr);
    }

    if (!saved) {
      if (!payload.id) payload.id = `inv-${Date.now()}`;
      const existingIdx = allAdminInvoices.findIndex(i => i.id === payload.id);
      if (existingIdx !== -1) {
        allAdminInvoices[existingIdx] = payload;
      } else {
        allAdminInvoices.unshift(payload);
      }
      localStorage.setItem('aurora_invoices', JSON.stringify(allAdminInvoices));
      saved = payload;
    }

    alert(`${type === 'invoice' ? 'Commercial Invoice' : 'Quotation'} ${number} saved successfully.`);
    closeAllModalsAndDrawers();
    await loadAdminInvoices();
    viewInvoicePrint(saved.id);
  } catch (err) {
    console.error('Failed to save invoice:', err);
    alert('An error occurred while saving the document.');
  }
}

export function viewInvoicePrint(id) {
  const inv = allAdminInvoices.find(i => i.id === id);
  if (!inv) return;

  currentPrintingInvoice = inv;
  const isInvoice = (inv.type || 'quotation').toLowerCase() === 'invoice';

  const headingEl = document.getElementById('printDocTypeHeading');
  const badgeEl = document.getElementById('printDocBadge');
  const numberEl = document.getElementById('printDocNumber');
  const issueEl = document.getElementById('printDocIssueDate');
  const dueEl = document.getElementById('printDocDueDate');
  const statusBadge = document.getElementById('printDocStatusBadge');
  const clientEl = document.getElementById('printClientName');
  const brandEl = document.getElementById('printBrandName');
  const taxIdEl = document.getElementById('printClientTaxId');
  const emailEl = document.getElementById('printClientEmail');
  const phoneEl = document.getElementById('printClientPhone');
  const addressEl = document.getElementById('printClientAddress');
  const tbody = document.getElementById('printDocItemsTbody');
  const subtotalEl = document.getElementById('printSubtotal');
  const discountEl = document.getElementById('printDiscount');
  const vatEl = document.getElementById('printVat');
  const grandTotalEl = document.getElementById('printGrandTotal');
  const paymentEl = document.getElementById('printPaymentTerms');
  const notesEl = document.getElementById('printNotes');

  if (headingEl) headingEl.textContent = isInvoice ? 'COMMERCIAL TAX INVOICE' : 'OFFICIAL QUOTATION';
  if (badgeEl) badgeEl.textContent = isInvoice ? 'COMMERCIAL TAX INVOICE' : 'OFFICIAL AGENCY QUOTATION';
  if (numberEl) numberEl.textContent = inv.number;
  if (issueEl) issueEl.textContent = inv.issueDate || '—';
  if (dueEl) dueEl.textContent = inv.dueDate || (isInvoice ? 'Due upon receipt' : 'Valid for 15 days');
  if (statusBadge) {
    statusBadge.textContent = inv.status || 'Draft';
    statusBadge.className = `status-pill status-${(inv.status || 'Draft').toLowerCase()}`;
  }

  if (clientEl) clientEl.textContent = inv.clientName || 'Valued Client';
  if (brandEl) brandEl.textContent = inv.brandName || 'Aurora Partner Brand';
  if (taxIdEl) taxIdEl.textContent = inv.taxId ? `Tax Reg: ${inv.taxId}` : 'Tax ID: Not Registered / Individual';
  if (emailEl) emailEl.textContent = inv.email || '—';
  if (phoneEl) phoneEl.textContent = inv.phone || '—';
  if (addressEl) addressEl.textContent = inv.address || 'Egypt';

  if (tbody) {
    const items = inv.items && inv.items.length ? inv.items : [];
    tbody.innerHTML = items.map((it, idx) => `
      <tr style="border-bottom:1px solid #e2e8f0; ${idx % 2 === 1 ? 'background:#f8fafc;' : ''}">
        <td style="padding:10px 12px; color:#64748b; font-weight:700;">${idx + 1}</td>
        <td style="padding:10px 12px; font-weight:600; color:#0f172a;">${it.description}</td>
        <td style="padding:10px 12px; text-align:center; color:#334155;">${it.qty}</td>
        <td style="padding:10px 12px; text-align:right; color:#334155;">${Number(it.rate || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        <td style="padding:10px 12px; text-align:right; font-weight:700; color:#0f172a;">${Number(it.total || (it.qty * it.rate) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
      </tr>
    `).join('');
  }

  const sub = Number(inv.subtotal || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const disc = Number(inv.discount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const vat = Number(inv.vatAmount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const tot = Number(inv.total || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  if (subtotalEl) subtotalEl.textContent = `${sub} EGP`;
  if (discountEl) discountEl.textContent = `-${disc} EGP`;
  if (vatEl) vatEl.textContent = `${vat} EGP`;
  if (grandTotalEl) grandTotalEl.textContent = `${tot} EGP`;

  if (paymentEl) paymentEl.textContent = inv.paymentMethod || 'Next Bank / CIB / Instapay (aurora.egy@instapay)';
  if (notesEl) notesEl.textContent = inv.notes || 'Quotations are valid for 15 days from issue date. Deliverables commence upon formal agreement.';

  document.getElementById('viewInvoicePrintModal')?.classList.add('active');
}

export function editCurrentPrintedInvoice() {
  if (currentPrintingInvoice) {
    openCreateInvoiceModal(currentPrintingInvoice.id);
  }
}

export async function deleteInvoice(id) {
  const inv = allAdminInvoices.find(i => i.id === id);
  if (!inv) return;

  if (!confirm(`Are you sure you want to permanently delete ${inv.type === 'invoice' ? 'invoice' : 'quotation'} #${inv.number}?`)) {
    return;
  }

  try {
    try {
      await api.deleteInvoice(id);
    } catch (e) {
      console.warn('API deleteInvoice failed, falling back to local:', e);
    }

    allAdminInvoices = allAdminInvoices.filter(i => i.id !== id);
    localStorage.setItem('aurora_invoices', JSON.stringify(allAdminInvoices));
    renderAdminInvoicesTable(allAdminInvoices);
  } catch (err) {
    console.error('Failed to delete invoice:', err);
  }
}

// 3. Projects Awaiting Review (Requirement D.3.1 & D.3.2)
async function loadAdminAwaitingReview() {
  const container = document.getElementById('adminApprovalsContainer');
  if (!container) return;

  try {
    const res = await api.fetchProjects('awaiting_review');
    if (res.success && res.data.length) {
      container.innerHTML = res.data.map(p => {
        const canPublish = p.isApproved || p.isPublished;
        const gallery = p.mediaGallery || [];

        return `
        <div class="card" style="margin-bottom:16px;">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:16px;">
            <div style="flex:1; min-width:280px;">
              <div style="display:flex; gap:8px; align-items:center; margin-bottom:6px;">
                <span class="badge ${p.isApproved ? 'badge-success' : 'badge-warning'}">${p.isApproved ? 'Approved (Staged)' : 'Pending Approval'}</span>
                <span class="badge badge-accent">${p.industryCategory}</span>
              </div>
              <h3 style="margin-bottom:4px;">${p.titleEn}</h3>
              <p style="color:var(--text-muted); font-size:0.9rem;">Client: <strong>${p.clientName}</strong> · Year: ${p.projectYear} · Credited: ${(p.creditedStaff || []).join(', ')}</p>
              <p style="margin:10px 0; font-size:0.95rem; line-height:1.5;">${p.summaryEn}</p>
              
              <!-- Media Gallery Thumbnails -->
              ${gallery.length ? `
                <div style="display:flex; gap:8px; margin-top:12px; overflow-x:auto; padding-bottom:4px;">
                  ${gallery.map(m => `
                    <img src="${m.url}" style="width:72px; height:50px; object-fit:cover; border-radius:var(--radius-sm); border:1px solid var(--border-default); cursor:pointer;" alt="${m.caption || ''}" onclick="window.auroraOpenLightbox('${m.url}', '${m.caption || p.titleEn}')" />
                  `).join('')}
                </div>
              ` : ''}
            </div>

            <div style="display:flex; flex-direction:column; gap:8px; align-items:flex-end;">
              <div style="display:flex; gap:8px; flex-wrap:wrap;">
                <!-- Requirement D.3.1: Reject button with reason -->
                <button class="btn btn-sm btn-outline" style="color:var(--status-error);" onclick="window.auroraOpenRejectProject('${p.id}')">Reject</button>
                ${!p.isApproved ? `<button class="btn btn-sm btn-secondary" onclick="window.auroraApproveProject('${p.id}')">Approve (Staged)</button>` : ''}
                <!-- Requirement D.3.2: Only show Publish Live if already approved/live -->
                ${canPublish ? `<button class="btn btn-sm btn-primary" onclick="window.auroraPublishProject('${p.id}')">Publish Live</button>` : ''}
              </div>
              ${!canPublish ? `<span style="font-size:0.78rem; color:var(--text-muted);">Must stage/approve before publishing live</span>` : ''}
            </div>
          </div>
        </div>
      `;
      }).join('');
    } else {
      container.innerHTML = `<p style="color:var(--text-muted);">No projects awaiting review.</p>`;
    }
  } catch (err) {
    console.error('Error loading approvals:', err);
  }
}

export function openRejectProject(id) {
  document.getElementById('rejectProjectIdInput').value = id;
  document.getElementById('rejectProjectReasonInput').value = '';
  document.getElementById('rejectProjectModal')?.classList.add('active');
}

export async function submitRejectProject(e) {
  e.preventDefault();
  const id = document.getElementById('rejectProjectIdInput').value;
  const reason = document.getElementById('rejectProjectReasonInput').value.trim();

  try {
    const res = await api.rejectProject(id, reason);
    if (res.success) {
      alert('Project review rejected and feedback recorded.');
      closeAllModalsAndDrawers();
      await Promise.allSettled([
        loadAdminAwaitingReview(),
        loadAdminProjectsControl(),
        loadPortalApproveProjects(),
        loadPortalPublishProjects()
      ]);
    } else {
      alert(res.error || 'Failed to reject project.');
    }
  } catch (err) {
    alert('Network error: ' + err.message);
  }
}

export async function approveProject(id) {
  const res = await api.approveProject(id);
  if (res.success) {
    showToastNotification('Project approved (staged)! Ready to be published live.', 'success');
    await Promise.allSettled([
      loadAdminAwaitingReview(),
      loadAdminProjectsControl(),
      loadPortalApproveProjects(),
      loadPortalPublishProjects()
    ]);
  }
}

export async function publishProject(id) {
  const res = await api.publishProject(id);
  if (res.success) {
    showToastNotification('Project published live to the public website!', 'success');
    await Promise.allSettled([
      loadAdminAwaitingReview(),
      loadAdminProjectsControl(),
      loadPortalApproveProjects(),
      loadPortalPublishProjects(),
      loadProjects()
    ]);
  }
}

// 4. Projects Control Panel (Requirements D.4.1 & D.4.2)
async function loadAdminProjectsControl() {
  const tbody = document.getElementById('adminProjectsTableBody');
  if (!tbody) return;

  try {
    const res = await api.fetchProjects('all');
    if (res.success && res.data) {
      tbody.innerHTML = res.data.map(p => `
        <tr>
          <td><strong>${p.titleEn}</strong><br><span style="font-size:12px; color:var(--text-muted);">${p.clientName}</span></td>
          <td>${p.industryCategory}</td>
          <td>${p.projectYear}</td>
          <td><span class="badge ${p.isApproved ? 'badge-success' : 'badge-warning'}">${p.isApproved ? 'Approved' : 'Pending'}</span></td>
          <td><span class="badge ${p.isPublished ? 'badge-teal' : 'badge-gray'}">${p.isPublished ? 'Live' : 'Draft'}</span></td>
          <td>
            <div style="display:flex; gap:6px; flex-wrap:wrap;">
              <!-- Requirement D.4.1: Edit project drawer -->
              <button class="btn btn-sm btn-secondary" onclick="window.auroraOpenEditProject('${p.id}')">Edit</button>
              ${!p.isPublished 
                ? `<button class="btn btn-sm btn-primary" onclick="window.auroraPublishProject('${p.id}')">Publish</button>` 
                : `<!-- Requirement D.4.2: Withdraw to Draft --><button class="btn btn-sm btn-outline" style="color:var(--status-warning);" onclick="window.auroraWithdrawProject('${p.id}')">Withdraw</button>`}
              <button class="btn btn-sm btn-outline" onclick="window.auroraNavigate('/projects/${p.slug}')">View</button>
            </div>
          </td>
        </tr>
      `).join('');
    }
  } catch (err) {
    console.error('Error loading projects control:', err);
  }
}

export async function openEditProject(id) {
  const user = getAuthenticatedUser();
  if (!user || (user.role !== 'super_admin' && user.role !== 'manager')) {
    console.warn('[Security Guard] Blocked attempt to open editProjectDrawer without admin privileges.');
    return;
  }

  let project = activeProjects.find(p => p.id === id);
  if (!project) {
    const allRes = await api.fetchProjects('all');
    project = allRes.data?.find(p => p.id === id);
  }
  if (!project) {
    alert('Project details could not be found.');
    return;
  }

  document.getElementById('editProjectIdInput').value = project.id;
  document.getElementById('editProjectTitleEn').value = project.titleEn || '';
  document.getElementById('editProjectTitleAr').value = project.titleAr || '';
  document.getElementById('editProjectClient').value = project.clientName || '';
  document.getElementById('editProjectYear').value = project.projectYear || 2026;
  document.getElementById('editProjectYoutube').value = project.youtubeId || '';
  document.getElementById('editProjectHeroImage').value = project.heroImage || '';
  document.getElementById('editProjectSummaryEn').value = project.summaryEn || '';
  document.getElementById('editProjectChallengeEn').value = project.challengeEn || '';
  document.getElementById('editProjectSolutionEn').value = project.solutionEn || '';
  document.getElementById('editProjectResultEn').value = project.resultEn || '';
  document.getElementById('editProjectDeliverables').value = (project.deliverables || []).join(', ');

  await populateNewWorkIndustries();
  const select = document.getElementById('editProjectIndustrySelect');
  if (select) select.value = project.industryCategory || 'General';

  const modal = document.getElementById('editProjectModal') || document.getElementById('editProjectDrawer');
  const overlay = document.getElementById('drawerOverlay');
  if (modal) {
    modal.classList.add('active');
    modal.style.display = 'flex';
  }
  if (overlay) {
    overlay.classList.add('active');
  }
  previewEditProjectVideo(project.youtubeId || '');
}

export async function submitEditProject(e) {
  e.preventDefault();
  const user = getAuthenticatedUser();
  if (!user || (user.role !== 'super_admin' && user.role !== 'manager')) {
    showToastNotification('Unauthorized: You must be logged in as a Manager or Super Admin to edit projects.', 'error');
    return;
  }
  const id = document.getElementById('editProjectIdInput').value;
  const deliverables = (document.getElementById('editProjectDeliverables').value || '').split(',').map(s => s.trim()).filter(Boolean);

  const updates = {
    titleEn: document.getElementById('editProjectTitleEn').value.trim(),
    titleAr: document.getElementById('editProjectTitleAr').value.trim(),
    clientName: document.getElementById('editProjectClient').value.trim(),
    industryCategory: document.getElementById('editProjectIndustrySelect').value,
    projectYear: Number(document.getElementById('editProjectYear').value) || 2026,
    youtubeId: parseYoutubeVideoId(document.getElementById('editProjectYoutube')?.value?.trim() || ''),
    heroImage: document.getElementById('editProjectHeroImage').value.trim() || '/assets/Image_error.jpg',
    summaryEn: document.getElementById('editProjectSummaryEn').value.trim(),
    challengeEn: document.getElementById('editProjectChallengeEn').value.trim(),
    solutionEn: document.getElementById('editProjectSolutionEn').value.trim(),
    resultEn: document.getElementById('editProjectResultEn').value.trim(),
    deliverables: deliverables
  };

  try {
    const res = await api.updateProject(id, updates);
    if (res.success) {
      showToastNotification('Project updated successfully!', 'success');
      closeAllModalsAndDrawers();
      loadAdminProjectsControl();
      loadProjects();
    } else {
      showToastNotification(res.error || 'Failed to update project.', 'error');
    }
  } catch (err) {
    showToastNotification('Network error: ' + err.message, 'error');
  }
}

export async function withdrawProject(id) {
  if (!confirm('Withdraw this project from the live website back to draft status?')) return;
  try {
    const res = await api.withdrawProject(id);
    if (res.success) {
      alert('Project withdrawn from live website.');
      loadAdminProjectsControl();
      loadProjects();
    } else {
      alert(res.error || 'Failed to withdraw project.');
    }
  } catch (err) {
    alert('Network error: ' + err.message);
  }
}

// 5. Staff Users & Permissions (Super Admin Only)
let allAdminUsers = [];

async function loadAdminUsers() {
  const tbody = document.getElementById('adminUsersTableBody');
  if (!tbody) return;

  try {
    const res = await api.fetchUsers();
    if (res.success && res.data) {
      allAdminUsers = res.data;
      tbody.innerHTML = res.data.map(u => {
        const p = u.permissions || {};
        const isMasterAdmin = u.email === 'admin@aurora.eg';
        const mustChangeBadge = (u.mustChangePassword || u.mustResetPassword)
          ? `<span class="badge" style="background:rgba(255,154,0,0.15); color:#ff9a00; font-size:10px; padding:2px 6px; margin-left:6px;" title="User is required to change password on next sign-in">🔒 Pass Change Req.</span>`
          : '';

        return `
          <tr>
            <td>
              <strong>${escapeHtml(u.name)}</strong>${mustChangeBadge}<br>
              <span style="font-size:12px; color:var(--text-muted);">${escapeHtml(u.title || 'Staff')} &bull; ${escapeHtml(u.department || 'General')}</span>
            </td>
            <td><code>${escapeHtml(u.email)}</code></td>
            <td>
              <select class="form-select" style="padding:4px 8px; font-size:0.85rem;" onchange="window.auroraUpdateUserRole('${u.id}', this.value)" ${isMasterAdmin ? 'disabled title="Master Admin role cannot be modified"' : ''}>
                <option value="employee" ${u.role === 'employee' ? 'selected' : ''}>Employee</option>
                <option value="manager" ${u.role === 'manager' ? 'selected' : ''}>Manager</option>
                <option value="super_admin" ${u.role === 'super_admin' ? 'selected' : ''}>Super Admin</option>
              </select>
            </td>
            <td><input type="checkbox" ${p.canApproveProjects ? 'checked' : ''} onchange="window.auroraTogglePerm('${u.id}', 'canApproveProjects', this.checked)"></td>
            <td><input type="checkbox" ${p.canPublishProjects ? 'checked' : ''} onchange="window.auroraTogglePerm('${u.id}', 'canPublishProjects', this.checked)"></td>
            <td><input type="checkbox" ${p.canViewBriefs ? 'checked' : ''} onchange="window.auroraTogglePerm('${u.id}', 'canViewBriefs', this.checked)"></td>
            <td><input type="checkbox" ${p.canGenerateBriefs ? 'checked' : ''} onchange="window.auroraTogglePerm('${u.id}', 'canGenerateBriefs', this.checked)"></td>
            <td><input type="checkbox" ${p.canViewCRM ? 'checked' : ''} onchange="window.auroraTogglePerm('${u.id}', 'canViewCRM', this.checked)"></td>
            <td>
              <div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap;">
                <button type="button" class="btn btn-sm btn-secondary" style="font-size:0.78rem; padding:4px 8px; white-space:nowrap;" onclick="window.auroraOpenEditStaffModal('${u.id}')" title="Edit staff details & sync to Firebase">✏️ Edit</button>
                <button type="button" class="btn btn-sm btn-secondary" style="color:var(--brand-electric-teal); border-color:rgba(0,255,192,0.3); font-size:0.78rem; padding:4px 8px; white-space:nowrap;" onclick="window.auroraExpireAndResetStaffPassword('${u.id}', '${u.email}', '${u.name}')" title="Expire old password & trigger reset email">🔑 Reset Pass</button>
                ${isMasterAdmin ? '<span style="font-size:11px; color:var(--text-muted); margin-left:4px;">Protected</span>' : `
                  <button type="button" class="btn btn-sm btn-secondary" style="color:var(--status-error); border-color:rgba(255,71,87,0.3); font-size:0.78rem; padding:4px 8px;" onclick="window.auroraDeleteStaff('${u.id}', '${u.name}')" title="Revoke access & delete from portal and Firebase">🗑️ Delete</button>
                `}
              </div>
            </td>
          </tr>
        `;
      }).join('');
    }
  } catch (err) {
    console.error('Error loading users:', err);
  }
}

export async function expireAndResetStaffPassword(userId, email, name) {
  const confirmed = confirm(`Are you sure you want to expire the password for ${name} (${email})?\n\nThis will invalidate their existing password, terminate any active sessions, and dispatch a secure password reset link to their email.`);
  if (!confirmed) return;

  try {
    const res = await api.expireStaffPassword(userId);
    if (res.success) {
      if (res.resetLink) {
        navigator.clipboard?.writeText(res.resetLink).catch(() => {});
      }
      alert(`✅ Success! The password for ${name} has been expired and synced to Firebase.`);
      await loadAdminUsers();
    } else {
      alert(`⚠️ Failed to expire password: ${res.error || 'Unknown error'}`);
    }
  } catch (err) {
    alert(`⚠️ Error: ${err.message}`);
  }
}

export async function updateUserRole(userId, newRole) {
  const res = await api.updateUserPermissions(userId, newRole, null);
  if (res.success) {
    alert(`Role updated to ${newRole} and synced automatically with Firebase.`);
    await loadAdminUsers();
  } else {
    alert(res.error || 'Failed to update role.');
  }
}

export async function togglePerm(userId, permKey, isChecked) {
  const res = await api.updateUserPermissions(userId, null, { [permKey]: isChecked });
  if (res.success) {
    showToastNotification('Permission updated and synced to Firebase.', 'success');
  } else {
    alert(res.error || 'Failed to update permission.');
  }
}

export function openAddStaffModal() {
  const modal = document.getElementById('addStaffModal');
  if (modal) {
    const form = document.getElementById('addStaffForm');
    if (form) form.reset();
    const toggle = document.getElementById('newStaffMustChangePassword');
    if (toggle) toggle.checked = true;
    modal.classList.add('active');
  }
}

export async function submitAddStaff(e) {
  if (e && e.preventDefault) e.preventDefault();
  const form = document.getElementById('addStaffForm');
  if (!form) return;

  const name = form.staffName.value.trim();
  const email = form.staffEmail.value.trim().toLowerCase();
  const role = form.staffRole.value;
  const department = form.staffDepartment.value.trim();
  const title = form.staffTitle.value.trim();
  const mustChangeEl = document.getElementById('newStaffMustChangePassword');
  const mustChangePassword = mustChangeEl ? mustChangeEl.checked : true;

  if (!name || !email) {
    alert('Please enter both name and email address.');
    return;
  }

  try {
    const res = await api.createUser({
      name,
      email,
      role,
      department,
      title,
      mustChangePassword
    });
    if (res.success) {
      const defPw = res.defaultPassword || 'Aurora@2026';
      showToastNotification(
        `Staff member ${name} (${email}) added, synced to Firebase, and welcomed via email with default password "${defPw}".`,
        'success',
        7000
      );
      closeAllModalsAndDrawers();
      await loadAdminUsers();
    } else {
      alert(res.error || 'Failed to add staff member.');
    }
  } catch (err) {
    alert('Network error: ' + err.message);
  }
}

export function openEditStaffModal(userId) {
  const u = allAdminUsers.find(item => item.id === userId);
  if (!u) return;

  const modal = document.getElementById('editStaffModal');
  if (!modal) return;

  document.getElementById('editStaffId').value = u.id;
  document.getElementById('editStaffName').value = u.name || '';
  document.getElementById('editStaffEmail').value = u.email || '';
  document.getElementById('editStaffRole').value = u.role || 'employee';
  document.getElementById('editStaffDepartment').value = u.department || '';
  document.getElementById('editStaffTitle').value = u.title || '';

  const mustChangeEl = document.getElementById('editStaffMustChangePassword');
  if (mustChangeEl) {
    mustChangeEl.checked = Boolean(u.mustChangePassword || u.mustResetPassword);
  }

  const isMasterAdmin = u.email === 'admin@aurora.eg';
  const roleSelect = document.getElementById('editStaffRole');
  if (roleSelect) roleSelect.disabled = isMasterAdmin;

  modal.classList.add('active');
}

export async function submitEditStaff(e) {
  if (e && e.preventDefault) e.preventDefault();
  const id = document.getElementById('editStaffId')?.value;
  if (!id) return;

  const name = document.getElementById('editStaffName')?.value?.trim();
  const email = document.getElementById('editStaffEmail')?.value?.trim()?.toLowerCase();
  const role = document.getElementById('editStaffRole')?.value;
  const department = document.getElementById('editStaffDepartment')?.value?.trim();
  const title = document.getElementById('editStaffTitle')?.value?.trim();
  const mustChangePassword = Boolean(document.getElementById('editStaffMustChangePassword')?.checked);

  if (!name || !email) {
    showToastNotification('Name and email are required.', 'warning');
    return;
  }

  const btn = document.getElementById('saveEditStaffBtn');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Syncing with Firebase...';
  }

  try {
    const res = await api.updateUser(id, {
      name,
      email,
      role,
      department,
      title,
      mustChangePassword
    });
    if (res && res.success) {
      showToastNotification(`Staff details for ${name} updated and automatically synced with Firebase!`, 'success');
      closeAllModalsAndDrawers();
      await loadAdminUsers();
    } else {
      showToastNotification(res?.error || 'Failed to update staff member.', 'error');
    }
  } catch (err) {
    showToastNotification('Network error: ' + err.message, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Save & Sync to Firebase';
    }
  }
}

export async function deleteStaffUser(id, name) {
  if (!confirm(`Are you sure you want to revoke access and delete staff member "${name}" from both the portal and Firebase?`)) {
    return;
  }

  try {
    const res = await api.deleteUser(id);
    if (res.success) {
      alert(`Staff member "${name}" removed from portal and deleted from Firebase successfully.`);
      await loadAdminUsers();
    } else {
      alert(res.error || 'Failed to delete staff member.');
    }
  } catch (err) {
    alert('Network error: ' + err.message);
  }
}

// 6. Settings, Database & Services Toggles
async function loadAdminSettings() {
  try {
    const sRes = await api.fetchSettings();
    if (sRes.success && sRes.data) {
      const s = sRes.data;
      if (document.getElementById('settingsSheetUrl')) {
        document.getElementById('settingsSheetUrl').value = s.googleSheetsUrl || '';
      }
      if (document.getElementById('settingsSheetWebhookUrl')) {
        document.getElementById('settingsSheetWebhookUrl').value = s.googleSheetsWebhookUrl || '';
      }
      if (document.getElementById('settingsMongoUri')) {
        document.getElementById('settingsMongoUri').value = s.mongodbUri || '';
      }
      if (document.getElementById('settingsFirebaseProjectId')) {
        document.getElementById('settingsFirebaseProjectId').value = s.firebaseProjectId || '';
      }
      if (document.getElementById('settingsFirebaseApiKey')) {
        document.getElementById('settingsFirebaseApiKey').value = s.firebaseApiKey || '';
      }
      if (document.getElementById('settingsFirebaseAuthDomain')) {
        document.getElementById('settingsFirebaseAuthDomain').value = s.firebaseAuthDomain || '';
      }
      if (document.getElementById('settingsOfficeVenue')) {
        document.getElementById('settingsOfficeVenue').value = s.officeVenue || '';
      }
      if (document.getElementById('settingsAddressStreet')) {
        document.getElementById('settingsAddressStreet').value = s.addressStreet || '';
      }
      if (document.getElementById('settingsPhone')) {
        document.getElementById('settingsPhone').value = s.contactPhone || '';
      }
      if (document.getElementById('settingsEmail')) {
        document.getElementById('settingsEmail').value = s.contactEmail || '';
      }

      // Update Detected Sheet ID badge & external link
      const sheetUrl = s.googleSheetsUrl || '';
      const match = sheetUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
      const idBadge = document.getElementById('detectedSheetIdBadge');
      const openLink = document.getElementById('openSheetExternalLink');
      if (match) {
        if (idBadge) idBadge.innerHTML = `<strong>Spreadsheet ID:</strong> <code>${match[1]}</code>`;
        if (openLink) {
          openLink.href = sheetUrl;
          openLink.style.display = 'inline';
        }
      } else if (sheetUrl) {
        if (idBadge) idBadge.textContent = 'Custom Google Sheet link configured';
        if (openLink) {
          openLink.href = sheetUrl;
          openLink.style.display = 'inline';
        }
      }

      // Update Team Directory toggle & badge
      const teamToggle = document.getElementById('settingsEnableTeamDirectory');
      const teamBadge = document.getElementById('teamDirectoryStatusBadge');
      const isTeamEnabled = s.enableTeamDirectory !== false;
      if (teamToggle) {
        teamToggle.checked = isTeamEnabled;
      }
      if (teamBadge) {
        teamBadge.textContent = isTeamEnabled ? 'Active' : 'Disabled';
        teamBadge.className = isTeamEnabled ? 'badge badge-success' : 'badge badge-secondary';
      }
      updateTeamNavVisibility(isTeamEnabled);
    }

    // Refresh Database status
    await refreshDatabaseStatusUI();

    // Refresh Sheets status
    await refreshSheetsStatusUI();

    // Refresh Firebase status
    await refreshFirebaseStatusUI();

    // Fetch and populate core services toggles
    await loadAdminServicesToggles();
  } catch (err) {
    console.error('Error loading settings:', err);
  }
}

export async function loadAdminServicesToggles() {
  const togglesList = document.getElementById('adminServicesTogglesList');
  if (!togglesList) return;
  try {
    const srvRes = await api.fetchServices(true);
    if (srvRes && srvRes.success && srvRes.data) {
      togglesList.innerHTML = srvRes.data.map(srv => {
        const isAct = srv.isActive !== undefined ? srv.isActive : (srv.active !== undefined ? srv.active : true);
        return `
          <div style="display:flex; justify-content:space-between; align-items:center; background:var(--surface-sunken); padding:10px 14px; border-radius:var(--radius-sm); border:1px solid var(--border-default);">
            <div>
              <strong style="font-size:0.9rem;">${srv.nameEn || ''}</strong><br>
              <span style="font-size:12px; color:var(--text-muted);">${srv.nameAr || ''}</span>
            </div>
            <label class="toggle-switch">
              <input type="checkbox" ${isAct ? 'checked' : ''} onchange="window.auroraToggleService('${srv.id}', this.checked)">
              <span class="toggle-slider"></span>
            </label>
          </div>
        `;
      }).join('');
    }
  } catch (err) {
    console.error('Error loading service toggles:', err);
  }
}

export function toggleFirebaseGuide() {
  const box = document.getElementById('firebaseGuideBox');
  if (box) {
    box.style.display = (box.style.display === 'none' || !box.style.display) ? 'block' : 'none';
  }
}

export function toggleDatabaseGuide() {
  const box = document.getElementById('databaseGuideBox');
  if (box) {
    box.style.display = (box.style.display === 'none' || !box.style.display) ? 'block' : 'none';
  }
}

export async function refreshDatabaseStatusUI() {
  const badge = document.getElementById('dbStatusBadge');
  if (!badge) return;
  try {
    const res = await api.fetchDatabaseStatus();
    if (res.success && res.data) {
      if (res.data.connected) {
        badge.textContent = '🟢 Firebase Cloud Database (europe-west1)';
        badge.style.background = 'rgba(0, 240, 255, 0.15)';
        badge.style.color = 'var(--brand-electric-teal)';
      } else {
        badge.textContent = '🔒 Local Isolated Store (Remote DB Closed)';
        badge.style.background = 'rgba(34, 197, 94, 0.15)';
        badge.style.color = '#22c55e';
      }
    }
  } catch {
    badge.textContent = '🔒 Local Isolated Store (Remote DB Closed)';
  }
}

export async function refreshSheetsStatusUI() {
  const badge = document.getElementById('sheetsStatusBadge');
  if (!badge) return;
  try {
    const res = await api.fetchSheetsStatus();
    if (res.success && res.data) {
      if (res.data.hasWebhook) {
        badge.textContent = '🟢 Webhook Active (100% Live Writes)';
        badge.style.background = 'rgba(46, 213, 115, 0.15)';
        badge.style.color = '#2ed573';
      } else if (res.data.hasServiceAccount) {
        badge.textContent = '🟢 Google API Connected';
        badge.style.background = 'rgba(46, 213, 115, 0.15)';
        badge.style.color = '#2ed573';
      } else if (res.data.sheetUrl || res.data.sheetId) {
        badge.textContent = '🟡 Sheet Linked (Ready for Webhook)';
        badge.style.background = 'rgba(255, 179, 0, 0.15)';
        badge.style.color = '#ffb300';
      } else {
        badge.textContent = '⚪ Not Configured';
        badge.style.background = 'rgba(106, 0, 244, 0.15)';
        badge.style.color = 'var(--accent-action)';
      }
    }
  } catch {
    // Non-fatal
  }
}

export async function refreshFirebaseStatusUI() {
  const badge = document.getElementById('firebaseStatusBadge');
  if (!badge) return;
  try {
    const res = await api.fetchFirebaseStatus();
    if (res.success && res.data) {
      if (res.data.configured) {
        badge.textContent = `🟢 Firebase Active (${res.data.projectId})`;
        badge.style.background = 'rgba(255, 154, 0, 0.15)';
        badge.style.color = '#ff9a00';
      } else {
        badge.textContent = '⚪ Unconfigured (Dual DB Mode Active)';
        badge.style.background = 'rgba(255, 255, 255, 0.1)';
        badge.style.color = 'var(--text-muted)';
      }
    }
  } catch {
    // Non-fatal
  }
}

export function updateTeamNavVisibility(enabled) {
  const navLink = document.getElementById('navTeamLink');
  const mobLink = document.getElementById('mobileNavTeamLink');
  if (navLink) navLink.style.display = enabled ? '' : 'none';
  if (mobLink) mobLink.style.display = enabled ? '' : 'none';
}

export async function toggleTeamDirectory(enabled) {
  const teamBadge = document.getElementById('teamDirectoryStatusBadge');
  if (teamBadge) {
    teamBadge.textContent = enabled ? 'Active' : 'Disabled';
    teamBadge.className = enabled ? 'badge badge-success' : 'badge badge-secondary';
  }
  updateTeamNavVisibility(enabled);
  try {
    const res = await api.updateSettings({ enableTeamDirectory: enabled });
    if (!res.success) {
      showToastNotification(res.error || 'Failed to update team directory setting.', 'error');
    } else {
      showToastNotification(`Public Team Directory ${enabled ? 'activated' : 'deactivated'}.`, 'success');
    }
  } catch (err) {
    showToastNotification('Error updating team directory setting: ' + err.message, 'error');
  }
}

export async function saveSettings(e) {
  if (e && e.preventDefault) e.preventDefault();
  const form = document.getElementById('adminSettingsForm');
  const sheetUrlEl = document.getElementById('settingsSheetUrl');
  const webhookUrlEl = document.getElementById('settingsSheetWebhookUrl');
  const mongoUriEl = document.getElementById('settingsMongoUri');
  const firebaseProjectIdEl = document.getElementById('settingsFirebaseProjectId');
  const firebaseApiKeyEl = document.getElementById('settingsFirebaseApiKey');
  const firebaseAuthDomainEl = document.getElementById('settingsFirebaseAuthDomain');
  const teamToggleEl = document.getElementById('settingsEnableTeamDirectory');

  const updates = {
    googleSheetsUrl: sheetUrlEl ? sheetUrlEl.value.trim() : '',
    googleSheetsWebhookUrl: webhookUrlEl ? webhookUrlEl.value.trim() : '',
    mongodbUri: mongoUriEl ? mongoUriEl.value.trim() : '',
    firebaseProjectId: firebaseProjectIdEl ? firebaseProjectIdEl.value.trim() : '',
    firebaseApiKey: firebaseApiKeyEl ? firebaseApiKeyEl.value.trim() : '',
    firebaseAuthDomain: firebaseAuthDomainEl ? firebaseAuthDomainEl.value.trim() : '',
    enableTeamDirectory: teamToggleEl ? teamToggleEl.checked : true,
    officeVenue: form?.officeVenue?.value?.trim() || 'Sharks Office Space',
    addressStreet: form?.addressStreet?.value?.trim() || 'Abdelsalam El Shazly St, above Next Bank',
    contactPhone: form?.contactPhone?.value?.trim() || '+20 15 59192858',
    contactEmail: form?.contactEmail?.value?.trim() || 'contact.aurora.egy@gmail.com'
  };

  try {
    const res = await api.updateSettings(updates);
    if (res.success) {
      alert('Agency settings and sync links saved successfully!');
      await loadAdminSettings();
    } else {
      alert(res.error || 'Failed to save settings.');
    }
  } catch (err) {
    alert('Error saving settings: ' + err.message);
  }
}

export async function testFirebaseConnection() {
  const box = document.getElementById('firebaseConnectResultBox');
  if (box) {
    box.style.display = 'block';
    box.style.background = 'var(--surface-sunken)';
    box.style.color = 'var(--text-primary)';
    box.innerHTML = '<em>Testing connection to Firebase Auth...</em>';
  }

  // Auto-save any typed Firebase settings first
  const projectId = document.getElementById('settingsFirebaseProjectId')?.value?.trim();
  const apiKey = document.getElementById('settingsFirebaseApiKey')?.value?.trim();
  const authDomain = document.getElementById('settingsFirebaseAuthDomain')?.value?.trim();

  if (projectId || apiKey || authDomain) {
    await api.updateSettings({
      firebaseProjectId: projectId,
      firebaseApiKey: apiKey,
      firebaseAuthDomain: authDomain
    });
  }

  try {
    const statusRes = await api.fetchFirebaseStatus();
    const initClientRes = await firebaseAuth.initFirebaseClient();

    if (box && statusRes.data) {
      const d = statusRes.data;
      if (d.configured || initClientRes.success) {
        box.style.background = 'rgba(46, 213, 115, 0.12)';
        box.style.border = '1px solid rgba(46, 213, 115, 0.3)';
        box.style.color = '#2ed573';
        box.innerHTML = `<strong>🟢 Firebase Auth Configured &amp; Active!</strong><br>
        <span style="font-size:12px;">Project ID: <code>${d.projectId}</code> | Web SDK: ${initClientRes.success ? 'Loaded &amp; Ready' : 'Pending SDK load'}</span><br>
        <span style="font-size:12px;">Staff members can now sign in with Email/Password or Google Single Sign-On.</span>`;
      } else {
        box.style.background = 'rgba(255, 179, 0, 0.12)';
        box.style.border = '1px solid rgba(255, 179, 0, 0.3)';
        box.style.color = '#ffb300';
        box.innerHTML = `<strong>⚪ Firebase Auth Not Yet Configured</strong><br>
        <span style="font-size:12px;">Please enter your Firebase Project ID and Web API Key from the Firebase Console (instructions below).</span>`;
      }
    }
    await refreshFirebaseStatusUI();
  } catch (err) {
    if (box) {
      box.style.display = 'block';
      box.style.background = 'rgba(255, 71, 87, 0.12)';
      box.style.border = '1px solid rgba(255, 71, 87, 0.3)';
      box.style.color = '#ff4757';
      box.innerHTML = `<strong>❌ Firebase Check Error:</strong> ${err.message}`;
    }
  }
}

export async function installServiceAccount() {
  const jsonStr = prompt("Paste your Firebase Service Account Private Key JSON content here (or save it as server/serviceAccountKey.json):");
  if (!jsonStr) return;

  try {
    const res = await api.installFirebaseServiceAccount(jsonStr);
    if (res.success) {
      alert("Firebase Service Account installed successfully! Full Admin SDK privileges enabled. Staff credentials will now be managed directly on Firebase.");
      await refreshFirebaseStatusUI();
      await testFirebaseConnection();
    } else {
      alert(res.error || "Failed to install Service Account.");
    }
  } catch (err) {
    alert("Error installing Service Account: " + err.message);
  }
}

export async function syncStaffToFirebase() {
  const btn = document.getElementById('syncStaffFirebaseBtn');
  if (btn) btn.disabled = true;

  try {
    const res = await api.syncStaffToFirebase(true);
    if (res.success) {
      alert(`Firebase sync reset & reconnected! ${res.count || 0} active staff synced and ${res.deletedCount || 0} stale user(s) purged from Firebase.`);
    } else {
      alert(res.error || "Failed to sync staff to Firebase.");
    }
  } catch (err) {
    alert("Error syncing staff to Firebase: " + err.message);
  } finally {
    if (btn) btn.disabled = false;
  }
}

export async function testSheetsConnection() {
  const box = document.getElementById('sheetsTestResultBox');
  if (box) {
    box.style.display = 'block';
    box.style.background = 'var(--surface-sunken)';
    box.style.color = 'var(--text-primary)';
    box.innerHTML = '<em>Testing connection to Google Sheet...</em>';
  }

  // Auto-save any typed sheet URL or webhook URL first
  const sheetUrl = document.getElementById('settingsSheetUrl')?.value?.trim();
  const webhookUrl = document.getElementById('settingsSheetWebhookUrl')?.value?.trim();
  if (sheetUrl || webhookUrl) {
    await api.updateSettings({ googleSheetsUrl: sheetUrl, googleSheetsWebhookUrl: webhookUrl });
  }

  try {
    const res = await api.testSheetsConnection();
    if (box && res.result) {
      const r = res.result;
      if (r.status === 'connected') {
        box.style.background = 'rgba(46, 213, 115, 0.12)';
        box.style.border = '1px solid rgba(46, 213, 115, 0.3)';
        box.style.color = '#2ed573';
        box.innerHTML = `<strong>✅ Google Sheet Connected!</strong> Method: <code>${r.method}</code>. Submissions will write live to your spreadsheet.`;
      } else if (r.status === 'needs_webhook_or_service_account') {
        box.style.background = 'rgba(255, 179, 0, 0.12)';
        box.style.border = '1px solid rgba(255, 179, 0, 0.3)';
        box.style.color = '#ffb300';
        box.innerHTML = `<strong>⚠️ Google Sheet Link Detected (ID: <code>${r.sheetId}</code>)</strong><br>
        Because this Google Sheet is protected by Google permissions, client submissions cannot be injected without authorization.<br>
        <strong>Solution:</strong> Follow the 30-Second Guide below to deploy a quick Google Apps Script Webhook on your sheet, paste the Webhook URL above, and click Test again!`;
      } else {
        box.style.background = 'rgba(255, 71, 87, 0.12)';
        box.style.border = '1px solid rgba(255, 71, 87, 0.3)';
        box.style.color = '#ff4757';
        box.innerHTML = `<strong>❌ Connection Status:</strong> ${r.error || r.message || JSON.stringify(r)}`;
      }
    }
    await refreshSheetsStatusUI();
  } catch (err) {
    if (box) {
      box.style.display = 'block';
      box.style.background = 'rgba(255, 71, 87, 0.12)';
      box.style.color = '#ff4757';
      box.innerHTML = `<strong>❌ Network Error:</strong> ${err.message}`;
    }
  }
}

export async function syncAllSheets() {
  try {
    const res = await api.syncAllSheetsPending();
    if (res.success) {
      alert(`Sync completed! ${res.syncedCount || 0} pending submission(s) synced to Google Sheet.`);
    } else {
      alert(res.error || 'Failed to sync queue to Google Sheet.');
    }
    await refreshSheetsStatusUI();
  } catch (err) {
    alert('Error syncing sheets queue: ' + err.message);
  }
}

export function toggleAppsScriptGuide() {
  const box = document.getElementById('appsScriptGuideBox');
  if (box) {
    box.style.display = box.style.display === 'none' ? 'block' : 'none';
  }
}

export function copyAppsScript() {
  const code = document.getElementById('appsScriptCodeSnippet')?.value;
  if (code) {
    navigator.clipboard.writeText(code).then(() => {
      alert('Google Apps Script copied to clipboard! Paste it inside your Google Sheet > Extensions > Apps Script.');
    }).catch(() => {
      alert('Could not copy automatically. Please select and copy the text box manually.');
    });
  }
}

export async function testDatabaseConnection() {
  const box = document.getElementById('dbConnectResultBox');
  if (box) {
    box.style.display = 'block';
    box.style.background = 'var(--surface-sunken)';
    box.style.color = 'var(--text-primary)';
    box.textContent = 'Checking database status...';
  }

  try {
    const res = await api.fetchDatabaseStatus();
    if (box && res.data) {
      const d = res.data;
      if (d.connected) {
        box.style.background = 'rgba(0, 240, 255, 0.12)';
        box.style.color = 'var(--brand-electric-teal)';
        box.innerHTML = `<strong>🟢 Connected to Firebase Cloud Database:</strong> <code>${d.databaseName}</code><br><span style="font-size:12px;">URL: ${d.uri} (Region: ${d.region || 'europe-west1'}, Free Plan, Zero Open Ports)</span>`;
      } else {
        box.style.background = 'rgba(255, 179, 0, 0.12)';
        box.style.color = '#ffb300';
        box.innerHTML = `<strong>🟡 Operating on Persistent File DataStore:</strong><br><span style="font-size:12px;">${d.error ? `Notice: ${d.error}` : 'MongoDB not detected locally. All operations, briefs, users and CRM data are safely preserved in JSON DataStore.'}</span>`;
      }
    }
    await refreshDatabaseStatusUI();
  } catch (err) {
    if (box) {
      box.style.background = 'rgba(255, 71, 87, 0.12)';
      box.style.color = '#ff4757';
      box.textContent = 'Database check failed: ' + err.message;
    }
  }
}

export async function connectDatabase() {
  const uri = document.getElementById('settingsMongoUri')?.value?.trim();
  if (!uri) {
    alert('Please enter a MongoDB connection string (e.g. mongodb+srv://... or mongodb://127.0.0.1:27017/aurora)');
    return;
  }

  const box = document.getElementById('dbConnectResultBox');
  if (box) {
    box.style.display = 'block';
    box.style.background = 'var(--surface-sunken)';
    box.style.color = 'var(--text-primary)';
    box.textContent = 'Attempting connection to MongoDB cluster...';
  }

  try {
    const res = await api.connectDatabase(uri);
    if (res.success && res.connected) {
      if (box) {
        box.style.background = 'rgba(0, 240, 255, 0.12)';
        box.style.color = 'var(--brand-electric-teal)';
        box.innerHTML = `<strong>🟢 Successfully connected to MongoDB!</strong> Database: <code>${res.databaseName}</code>. Initial data seeded.`;
      }
      alert('MongoDB connected successfully!');
    } else {
      if (box) {
        box.style.background = 'rgba(255, 71, 87, 0.12)';
        box.style.color = '#ff4757';
        box.innerHTML = `<strong>❌ Connection Failed:</strong> ${res.error}<br><span style="font-size:12px;">The platform remains 100% operational on the file datastore. Verify your MongoDB credentials, network access, or IP whitelist in Atlas.</span>`;
      }
      alert('Could not connect to MongoDB: ' + res.error);
    }
    await refreshDatabaseStatusUI();
  } catch (err) {
    if (box) {
      box.style.background = 'rgba(255, 71, 87, 0.12)';
      box.style.color = '#ff4757';
      box.textContent = 'Error: ' + err.message;
    }
    alert('Connection error: ' + err.message);
  }
}

export async function disconnectDatabase() {
  const isAr = getLanguage() === 'ar';
  const confirmMsg = isAr
    ? 'هل أنت متأكد من رغبتك في فصل قاعدة البيانات الخارجية وإغلاق هذا المدخل تماماً؟\n\nستعمل المنصة بأمان وسرعة عبر مخزن البيانات المحلي المعزول ومصادقة Firebase.'
    : 'Are you sure you want to disconnect from external MongoDB and close this remote entry point completely?\n\nThe platform will run securely on the isolated local datastore with Firebase authentication.';

  if (!confirm(confirmMsg)) return;

  const box = document.getElementById('dbConnectResultBox');
  if (box) {
    box.style.display = 'block';
    box.style.background = 'var(--surface-sunken)';
    box.style.color = 'var(--text-primary)';
    box.textContent = 'Closing database connection and securing entry point...';
  }

  try {
    const res = await api.disconnectDatabase();
    if (box) {
      box.style.background = 'rgba(34, 197, 94, 0.12)';
      box.style.color = '#22c55e';
      box.innerHTML = '<strong>🔒 External Entry Point Closed:</strong> MongoDB disconnected. Running securely on Isolated Local DataStore with zero public exposure.';
    }
    const uriInput = document.getElementById('settingsMongoUri');
    if (uriInput) uriInput.value = '';
    await refreshDatabaseStatusUI();
    alert(isAr ? 'تم إغلاق مدخل قاعدة البيانات الخارجية بنجاح.' : 'External database entry point closed successfully.');
  } catch (err) {
    if (box) {
      box.style.background = 'rgba(255, 71, 87, 0.12)';
      box.style.color = '#ff4757';
      box.textContent = 'Error: ' + err.message;
    }
    alert('Failed to disconnect: ' + err.message);
  }
}

// 7. Activity Log (Requirement D.5.1: Search & Filter by Date, User, Action)
async function loadAdminActivityLogs() {
  const tbody = document.getElementById('adminActivityTableBody');
  if (!tbody) return;

  try {
    const res = await api.fetchActivityLogs();
    if (res.success && res.data) {
      allAdminActivityLogs = res.data;

      // Populate User and Action filter dropdowns
      const userSelect = document.getElementById('activityUserFilter');
      const actionSelect = document.getElementById('activityActionFilter');

      if (userSelect) {
        const users = Array.from(new Set(allAdminActivityLogs.map(l => l.user).filter(Boolean)));
        userSelect.innerHTML = `<option value="all">All Users</option>` + users.map(u => `<option value="${u}">${u}</option>`).join('');
      }
      if (actionSelect) {
        const actions = Array.from(new Set(allAdminActivityLogs.map(l => l.action).filter(Boolean)));
        actionSelect.innerHTML = `<option value="all">All Actions</option>` + actions.map(a => `<option value="${a}">${a}</option>`).join('');
      }

      renderAdminActivityTable(allAdminActivityLogs);
    }
  } catch (err) {
    console.error('Error loading activity logs:', err);
  }
}

function renderAdminActivityTable(logs) {
  const tbody = document.getElementById('adminActivityTableBody');
  if (!tbody) return;

  if (!logs.length) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:32px; color:var(--text-muted);">No activity logs match your filter criteria.</td></tr>`;
    return;
  }

  tbody.innerHTML = logs.map(log => `
    <tr>
      <td style="white-space:nowrap; font-size:12px; font-family:monospace;">${new Date(log.timestamp).toLocaleString()}</td>
      <td><strong style="color:var(--text-primary); font-size:0.9rem;">${escapeHtml(log.action)}</strong></td>
      <td><span class="badge badge-accent" style="font-size:0.8rem;">${escapeHtml(log.user || log.actor || 'system')}</span></td>
      <td style="font-size:12px; max-width:450px; overflow:hidden; text-overflow:ellipsis; word-break:break-word; color:var(--text-secondary);">${escapeHtml(typeof log.details === 'object' ? JSON.stringify(log.details) : String(log.details || '—'))}</td>
    </tr>
  `).join('');
}

export function filterActivity() {
  const query = (document.getElementById('activitySearchInput')?.value || '').toLowerCase();
  const dateVal = document.getElementById('activityDateFilter')?.value;
  const userVal = document.getElementById('activityUserFilter')?.value || 'all';
  const actionVal = document.getElementById('activityActionFilter')?.value || 'all';

  const filtered = allAdminActivityLogs.filter(log => {
    const matchesSearch = !query || 
      (log.action || '').toLowerCase().includes(query) ||
      (log.user || '').toLowerCase().includes(query) ||
      (log.details || '').toLowerCase().includes(query);

    const matchesDate = !dateVal || log.timestamp.startsWith(dateVal);
    const matchesUser = userVal === 'all' || log.user === userVal;
    const matchesAction = actionVal === 'all' || log.action === actionVal;

    return matchesSearch && matchesDate && matchesUser && matchesAction;
  });

  renderAdminActivityTable(filtered);
}

export function resetActivityFilter() {
  const searchInput = document.getElementById('activitySearchInput');
  const dateInput = document.getElementById('activityDateFilter');
  const userSelect = document.getElementById('activityUserFilter');
  const actionSelect = document.getElementById('activityActionFilter');

  if (searchInput) searchInput.value = '';
  if (dateInput) dateInput.value = '';
  if (userSelect) userSelect.value = 'all';
  if (actionSelect) actionSelect.value = 'all';

  renderAdminActivityTable(allAdminActivityLogs);
}

// Requirement B.1: Forgot Password Modal
export function openForgotPassword() {
  const modal = document.getElementById('forgotPasswordModal');
  const successBox = document.getElementById('forgotPasswordSuccess');
  if (successBox) successBox.style.display = 'none';
  if (modal) modal.classList.add('active');
}

export async function submitForgotPassword(e) {
  e.preventDefault();
  const emailInput = document.getElementById('forgotPasswordEmailInput');
  const submitBtn = e.target.querySelector('button[type="submit"]');
  const email = emailInput ? emailInput.value.trim() : '';
  if (!email) return;

  const originalBtnText = submitBtn ? submitBtn.textContent : '';
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Sending Reset Link...';
  }

  const successBox = document.getElementById('forgotPasswordSuccess');
  if (successBox) successBox.style.display = 'none';

  try {
    const res = await api.requestPasswordReset(email);

    if (res.success) {
      if (successBox) {
        successBox.style.display = 'block';
        successBox.style.background = 'rgba(0, 255, 192, 0.12)';
        successBox.style.borderColor = 'var(--brand-electric-teal)';
        successBox.innerHTML = `
          <div style="font-weight:700; color:var(--text-primary); margin-bottom:6px;">✓ Reset Email Dispatched!</div>
          <div style="font-size:0.85rem; color:var(--text-muted); line-height:1.5; margin-bottom:10px;">
            A password reset email has been sent to <strong>${email}</strong>. Please check your inbox and spam folder.
          </div>
          ${res.resetLink ? `
            <div style="padding-top:10px; border-top:1px solid rgba(255,255,255,0.1); margin-top:8px;">
              <span style="font-size:0.8rem; color:var(--text-muted); display:block; margin-bottom:6px;">Instant Reset Link (Active):</span>
              <a href="${res.resetLink}" target="_blank" class="btn btn-sm btn-primary" style="display:inline-block; font-size:0.82rem; padding:6px 14px; text-decoration:none;">Open Password Reset Page →</a>
            </div>
          ` : ''}
        `;
      }
    } else {
      if (successBox) {
        successBox.style.display = 'block';
        successBox.style.background = 'rgba(255, 60, 60, 0.12)';
        successBox.style.borderColor = 'rgba(255, 60, 60, 0.4)';
        successBox.innerHTML = `<span style="color:#ff6b6b; font-weight:600;">⚠️ ${res.error || 'Failed to send password reset.'}</span>`;
      }
    }
  } catch (err) {
    if (successBox) {
      successBox.style.display = 'block';
      successBox.style.background = 'rgba(255, 60, 60, 0.12)';
      successBox.style.borderColor = 'rgba(255, 60, 60, 0.4)';
      successBox.innerHTML = `<span style="color:#ff6b6b; font-weight:600;">⚠️ Error: ${err.message}</span>`;
    }
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = originalBtnText;
    }
  }
}

// 8. Monitoring
async function loadAdminMonitoring() {
  try {
    const res = await api.fetchMonitoring();
    if (res.success && res.data) {
      const m = res.data;
      if (document.getElementById('monTotalVisits')) document.getElementById('monTotalVisits').textContent = m.totalVisits || 0;
      if (document.getElementById('monHomeVisits')) document.getElementById('monHomeVisits').textContent = m.pageViews?.home || 0;
      if (document.getElementById('monProjectsVisits')) document.getElementById('monProjectsVisits').textContent = m.pageViews?.projects || 0;
      if (document.getElementById('monBriefVisits')) document.getElementById('monBriefVisits').textContent = m.pageViews?.brief || 0;

      const sessionsTable = document.getElementById('monSessionsTableBody');
      if (sessionsTable && m.recentSessions) {
        sessionsTable.innerHTML = m.recentSessions.map(s => `
          <tr>
            <td>${new Date(s.time).toLocaleTimeString()}</td>
            <td><code>${s.ip}</code></td>
            <td><strong>${s.page}</strong></td>
            <td>${s.referrer}</td>
          </tr>
        `).join('');
      }
    }
  } catch (err) {
    console.error('Error loading monitoring:', err);
  }
}

// -----------------------------------------------------------------------------
// MODALS & LIGHTBOX HELPERS
// -----------------------------------------------------------------------------
export function openLightbox(url, caption) {
  const modal = document.getElementById('lightboxModal');
  const img = document.getElementById('lightboxImg');
  const cap = document.getElementById('lightboxCaption');
  if (modal && img) {
    img.src = url || '/assets/Image_error.jpg';
    if (cap) cap.textContent = caption || '';
    modal.classList.add('active');
  }
}

export function closeAllModalsAndDrawers() {
  document.querySelectorAll('.modal-overlay.active').forEach((m) => m.classList.remove('active'));
  document.querySelectorAll('.drawer-overlay.active').forEach((d) => d.classList.remove('active'));
  document.querySelectorAll('.drawer-panel').forEach((p) => {
    p.classList.remove('active');
    if (p.id !== 'mobileNavDrawer') {
      p.style.display = 'none';
    }
  });
}

// -----------------------------------------------------------------------------
// PARTNER LOGOS & MARQUEE CONTROL (Admin & Manager Access)
// -----------------------------------------------------------------------------
export async function loadAdminMarquee() {
  const tbody = document.getElementById('adminMarqueeTableBody');
  if (!tbody) return;

  try {
    const res = await api.fetchMarquee();
    if (res && res.success && res.data) {
      allAdminMarqueeData = res.data;
    }
  } catch (err) {
    console.error('Failed to fetch marquee data:', err);
  }

  const slider = document.getElementById('marqueeSpeedSlider');
  const badge = document.getElementById('marqueeSpeedValueBadge');
  const currentSpeed = allAdminMarqueeData.speedSeconds || 35;
  if (slider) slider.value = currentSpeed;
  if (badge) badge.textContent = `${currentSpeed}s`;

  renderAdminMarqueeTable();
}

function renderAdminMarqueeTable() {
  const tbody = document.getElementById('adminMarqueeTableBody');
  if (!tbody) return;

  const logos = allAdminMarqueeData.logos || [];
  if (!logos.length) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:32px; color:var(--text-muted);">No partner logos configured yet.</td></tr>`;
    return;
  }

  tbody.innerHTML = logos.map((logo, idx) => `
    <tr>
      <td style="color:var(--text-muted); font-family:monospace; font-weight:700;">${idx + 1}</td>
      <td>
        <div style="width:70px; height:42px; background:var(--surface-sunken); border:1px solid var(--border-default); border-radius:4px; display:flex; align-items:center; justify-content:center; padding:4px;">
          <img src="${escapeHtml(logo.src)}" alt="${escapeHtml(logo.name)}" style="max-height:100%; max-width:100%; object-fit:contain;" />
        </div>
      </td>
      <td>
        <input type="text" class="form-input" style="padding:6px 10px; font-size:0.9rem;" value="${escapeHtml(logo.name)}" onchange="window.auroraUpdateMarqueeLogoName(${idx}, this.value)">
      </td>
      <td style="font-size:0.8rem; color:var(--text-muted); font-family:monospace; max-width:200px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
        ${escapeHtml(logo.src)}
      </td>
      <td style="text-align:center; white-space:nowrap;">
        <button type="button" class="btn btn-sm btn-secondary" onclick="window.auroraMoveMarqueeLogo(${idx}, -1)" ${idx === 0 ? 'disabled' : ''} title="Move Up">⬆️</button>
        <button type="button" class="btn btn-sm btn-secondary" onclick="window.auroraMoveMarqueeLogo(${idx}, 1)" ${idx === logos.length - 1 ? 'disabled' : ''} title="Move Down">⬇️</button>
      </td>
      <td style="text-align:right;">
        <button type="button" class="btn btn-sm btn-secondary" style="color:var(--status-error);" onclick="window.auroraRemoveMarqueeLogo(${idx})" title="Remove Logo">🗑️</button>
      </td>
    </tr>
  `).join('');
}

export function updateMarqueeSpeedLabel(val) {
  const badge = document.getElementById('marqueeSpeedValueBadge');
  if (badge) badge.textContent = `${val}s`;
  allAdminMarqueeData.speedSeconds = Number(val);
}

export function updateMarqueeLogoName(idx, val) {
  if (allAdminMarqueeData.logos[idx]) {
    allAdminMarqueeData.logos[idx].name = val.trim();
  }
}

export function moveMarqueeLogo(idx, dir) {
  const logos = allAdminMarqueeData.logos;
  const targetIdx = idx + dir;
  if (targetIdx < 0 || targetIdx >= logos.length) return;
  const temp = logos[idx];
  logos[idx] = logos[targetIdx];
  logos[targetIdx] = temp;
  renderAdminMarqueeTable();
}

export function removeMarqueeLogo(idx) {
  allAdminMarqueeData.logos.splice(idx, 1);
  renderAdminMarqueeTable();
}

export async function addNewMarqueeLogo() {
  const nameInput = document.getElementById('newMarqueeLogoName');
  const fileInput = document.getElementById('newMarqueeLogoFile');
  const name = (nameInput?.value || '').trim();
  const file = fileInput?.files?.[0];

  if (!name) {
    showToastNotification('Please enter a brand or client name.', 'warning');
    nameInput?.focus();
    return;
  }
  if (!file) {
    showToastNotification('Please select a logo image file to upload.', 'warning');
    return;
  }

  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const dataUrl = e.target.result;
      const res = await api.authFetch('/api/content/upload-photo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataUrl, filename: file.name })
      });
      const data = await res.json();
      if (data.success && data.url) {
        allAdminMarqueeData.logos.push({
          id: 'ml-' + Date.now(),
          name,
          src: data.url
        });
        nameInput.value = '';
        fileInput.value = '';
        renderAdminMarqueeTable();
        showToastNotification(`Partner logo for "${name}" added to list. Click "Save & Publish" to update live website.`, 'success');
      } else {
        showToastNotification(data.error || 'Failed to upload logo image', 'error');
      }
    } catch (err) {
      showToastNotification('Upload error: ' + err.message, 'error');
    }
  };
  reader.readAsDataURL(file);
}

export async function saveMarqueeChanges() {
  const speed = Number(document.getElementById('marqueeSpeedSlider')?.value) || allAdminMarqueeData.speedSeconds || 35;
  allAdminMarqueeData.speedSeconds = speed;

  try {
    const res = await api.saveMarquee(allAdminMarqueeData);
    if (res && res.success) {
      showToastNotification('Partner logos and marquee speed saved & published live!', 'success');
      renderPublicMarquee(allAdminMarqueeData);
      await loadAdminActivityLogs();
    } else {
      showToastNotification((res && res.error) || 'Failed to save marquee settings', 'error');
    }
  } catch (err) {
    showToastNotification('Error saving marquee: ' + err.message, 'error');
  }
}

export function renderPublicMarquee(data) {
  const track = document.getElementById('clientLogosMarqueeTrack');
  if (!track) return;

  const logos = (data && Array.isArray(data.logos) && data.logos.length) ? data.logos : [];
  if (!logos.length) return;

  const speed = Number(data.speedSeconds) || 35;
  track.style.animationDuration = `${speed}s`;

  // Render Set 1 and Set 2 (for seamless endless loop)
  const renderCards = (list) => list.map(l => `
    <div class="client-logo-card">
      <img src="${escapeHtml(l.src)}" alt="${escapeHtml(l.name)}" loading="lazy">
    </div>
  `).join('');

  track.innerHTML = renderCards(logos) + renderCards(logos);
}

// -----------------------------------------------------------------------------
// SITE CONTENT & MEDIA CMS (Super Admin Only) (Requirement 2.4 & Requirement 3)
// -----------------------------------------------------------------------------
let cmsSliderPhotosData = [];
let allAdminServices = [];

export async function hydrateSiteContent(fetchFromApi = true) {
  try {
    if (fetchFromApi || !currentSiteContent) {
      const res = await api.fetchSiteContent();
      if (res && res.success && res.data) {
        currentSiteContent = res.data;
      }
    }
  } catch (err) {
    console.error('Failed to load site content:', err);
  }

  if (!currentSiteContent) return;

  const isAr = getLanguage() === 'ar';
  const c = currentSiteContent;

  // 1. Home Page Texts
  if (c.home) {
    const heroEye = document.querySelector('#screen-home .section-eyebrow');
    if (heroEye && (c.home.heroEyebrowEn || c.home.heroEyebrowAr)) {
      heroEye.textContent = isAr && c.home.heroEyebrowAr ? c.home.heroEyebrowAr : c.home.heroEyebrowEn || heroEye.textContent;
    }

    const heroTitle = document.querySelector('#screen-home .hero-title');
    if (heroTitle && (c.home.heroTitleEn || c.home.heroTitleAr)) {
      heroTitle.textContent = isAr && c.home.heroTitleAr ? c.home.heroTitleAr : c.home.heroTitleEn || heroTitle.textContent;
    }

    const heroSub = document.querySelector('#screen-home .hero-sub');
    if (heroSub && (c.home.heroSubEn || c.home.heroSubAr)) {
      heroSub.textContent = isAr && c.home.heroSubAr ? c.home.heroSubAr : c.home.heroSubEn || heroSub.textContent;
    }

    const brandsTitle = document.querySelector('#screen-home .brands-title');
    if (brandsTitle && (c.home.brandsTitleEn || c.home.brandsTitleAr)) {
      brandsTitle.textContent = isAr && c.home.brandsTitleAr ? c.home.brandsTitleAr : c.home.brandsTitleEn || brandsTitle.textContent;
    }

    // Capabilities
    const capEye = document.querySelector('#screen-home [data-i18n="home.capabilitiesEyebrow"]');
    if (capEye && (c.home.capabilitiesEyebrowEn || c.home.capabilitiesEyebrowAr)) {
      capEye.textContent = isAr && c.home.capabilitiesEyebrowAr ? c.home.capabilitiesEyebrowAr : c.home.capabilitiesEyebrowEn || capEye.textContent;
    }

    const capTitle = document.querySelector('#screen-home [data-i18n="home.capabilitiesTitle"]');
    if (capTitle && (c.home.capabilitiesTitleEn || c.home.capabilitiesTitleAr)) {
      capTitle.textContent = isAr && c.home.capabilitiesTitleAr ? c.home.capabilitiesTitleAr : c.home.capabilitiesTitleEn || capTitle.textContent;
    }

    // Capabilities cards
    const growthTitle = document.querySelector('#screen-home [data-i18n="home.capGrowthTitle"]');
    if (growthTitle && (c.home.capGrowthTitleEn || c.home.capGrowthTitleAr)) {
      growthTitle.textContent = isAr && c.home.capGrowthTitleAr ? c.home.capGrowthTitleAr : c.home.capGrowthTitleEn || growthTitle.textContent;
    }
    const growthDesc = document.querySelector('#screen-home [data-i18n="home.capGrowthDesc"]');
    if (growthDesc && (c.home.capGrowthDescEn || c.home.capGrowthDescAr)) {
      growthDesc.textContent = isAr && c.home.capGrowthDescAr ? c.home.capGrowthDescAr : c.home.capGrowthDescEn || growthDesc.textContent;
    }

    const prodTitle = document.querySelector('#screen-home [data-i18n="home.capProductionTitle"]');
    if (prodTitle && (c.home.capProductionTitleEn || c.home.capProductionTitleAr)) {
      prodTitle.textContent = isAr && c.home.capProductionTitleAr ? c.home.capProductionTitleAr : c.home.capProductionTitleEn || prodTitle.textContent;
    }
    const prodDesc = document.querySelector('#screen-home [data-i18n="home.capProductionDesc"]');
    if (prodDesc && (c.home.capProductionDescEn || c.home.capProductionDescAr)) {
      prodDesc.textContent = isAr && c.home.capProductionDescAr ? c.home.capProductionDescAr : c.home.capProductionDescEn || prodDesc.textContent;
    }

    const creativeTitle = document.querySelector('#screen-home [data-i18n="home.capCreativeTitle"]');
    if (creativeTitle && (c.home.capCreativeTitleEn || c.home.capCreativeTitleAr)) {
      creativeTitle.textContent = isAr && c.home.capCreativeTitleAr ? c.home.capCreativeTitleAr : c.home.capCreativeTitleEn || creativeTitle.textContent;
    }
    const creativeDesc = document.querySelector('#screen-home [data-i18n="home.capCreativeDesc"]');
    if (creativeDesc && (c.home.capCreativeDescEn || c.home.capCreativeDescAr)) {
      creativeDesc.textContent = isAr && c.home.capCreativeDescAr ? c.home.capCreativeDescAr : c.home.capCreativeDescEn || creativeDesc.textContent;
    }

    // Metrics
    if (c.home.numbersProjectsVal) {
      const el = document.querySelector('#screen-home [data-i18n="numbers.projectsVal"]');
      if (el) el.textContent = c.home.numbersProjectsVal;
    }
    if (c.home.numbersReachVal) {
      const el = document.querySelector('#screen-home [data-i18n="numbers.reachVal"]');
      if (el) el.textContent = c.home.numbersReachVal;
    }
    if (c.home.numbersVideosVal) {
      const el = document.querySelector('#screen-home [data-i18n="numbers.videosVal"]');
      if (el) el.textContent = c.home.numbersVideosVal;
    }
    if (c.home.numbersClientsVal) {
      const el = document.querySelector('#screen-home [data-i18n="numbers.clientsVal"]');
      if (el) el.textContent = c.home.numbersClientsVal;
    }
  }

  // 2. About Page Texts
  if (c.about) {
    const aboutP1 = document.querySelector('#screen-about p[data-i18n="about.p1"]');
    if (aboutP1 && (c.about.whoWeAreTextEn || c.about.whoWeAreTextAr)) {
      aboutP1.textContent = isAr && c.about.whoWeAreTextAr ? c.about.whoWeAreTextAr : c.about.whoWeAreTextEn || aboutP1.textContent;
    }

    // Dynamic BTS Photo Slider (Authentic Production Stills)
    renderPublicAboutSliderPhotos(c.about.sliderPhotos);
  }

  // 3. Services Page Texts
  if (c.services) {
    const srvTitle = document.querySelector('#screen-services .section-title');
    if (srvTitle && (c.services.headerTitleEn || c.services.headerTitleAr)) {
      srvTitle.textContent = isAr && c.services.headerTitleAr ? c.services.headerTitleAr : c.services.headerTitleEn || srvTitle.textContent;
    }

    const srvSub = document.querySelector('#screen-services .section-subtitle');
    if (srvSub && (c.services.headerSubEn || c.services.headerSubAr)) {
      srvSub.textContent = isAr && c.services.headerSubAr ? c.services.headerSubAr : c.services.headerSubEn || srvSub.textContent;
    }

    const srvProc = document.querySelector('#screen-services [data-i18n="services.processTitle"]');
    if (srvProc && (c.services.processTitleEn || c.services.processTitleAr)) {
      srvProc.textContent = isAr && c.services.processTitleAr ? c.services.processTitleAr : c.services.processTitleEn || srvProc.textContent;
    }
  }

  // 4. Projects Page Texts
  if (c.projects) {
    const prjTitle = document.querySelector('#screen-projects .section-title');
    if (prjTitle && (c.projects.headerTitleEn || c.projects.headerTitleAr)) {
      prjTitle.textContent = isAr && c.projects.headerTitleAr ? c.projects.headerTitleAr : c.projects.headerTitleEn || prjTitle.textContent;
    }
  }

  // 5. Contact Page Texts
  if (c.contact) {
    const cntTitle = document.querySelector('#screen-contact .section-title');
    if (cntTitle && (c.contact.headerTitleEn || c.contact.headerTitleAr)) {
      cntTitle.textContent = isAr && c.contact.headerTitleAr ? c.contact.headerTitleAr : c.contact.headerTitleEn || cntTitle.textContent;
    }

    const cntSub = document.querySelector('#screen-contact .section-subtitle');
    if (cntSub && (c.contact.headerSubEn || c.contact.headerSubAr)) {
      cntSub.textContent = isAr && c.contact.headerSubAr ? c.contact.headerSubAr : c.contact.headerSubEn || cntSub.textContent;
    }
  }

  // 6. KYC Brief Page Texts
  if (c.kyc) {
    const officeStrong = document.querySelector('#venueCardOffice strong');
    if (officeStrong && (c.kyc.venueOfficeEn || c.kyc.venueOfficeAr)) {
      officeStrong.textContent = isAr && c.kyc.venueOfficeAr ? c.kyc.venueOfficeAr : c.kyc.venueOfficeEn || officeStrong.textContent;
    }
    const officeSub = document.querySelector('#venueCardOffice div div');
    if (officeSub && (c.kyc.venueOfficeSubEn || c.kyc.venueOfficeSubAr)) {
      officeSub.textContent = isAr && c.kyc.venueOfficeSubAr ? c.kyc.venueOfficeSubAr : c.kyc.venueOfficeSubEn || officeSub.textContent;
    }

    const meetStrong = document.querySelector('#venueCardMeet strong');
    if (meetStrong && (c.kyc.venueMeetEn || c.kyc.venueMeetAr)) {
      meetStrong.textContent = isAr && c.kyc.venueMeetAr ? c.kyc.venueMeetAr : c.kyc.venueMeetEn || meetStrong.textContent;
    }
    const meetSub = document.querySelector('#venueCardMeet div div');
    if (meetSub && (c.kyc.venueMeetSubEn || c.kyc.venueMeetSubAr)) {
      meetSub.textContent = isAr && c.kyc.venueMeetSubAr ? c.kyc.venueMeetSubAr : c.kyc.venueMeetSubEn || meetSub.textContent;
    }
  }

  // Render Dynamic BTS Photo Slider & Trigger Counter Animations
  if (c.about && c.about.sliderPhotos) {
    renderPublicAboutSliderPhotos(c.about.sliderPhotos);
  }
  setTimeout(() => animateNumberCounters(), 60);
}

async function loadAdminContentManager() {
  try {
    const res = await api.fetchSiteContent();
    if (res.success && res.data) {
      currentSiteContent = res.data;
      const c = currentSiteContent;

      // 1. Home inputs
      if (c.home) {
        if (document.getElementById('cms_home_heroEyebrowEn')) document.getElementById('cms_home_heroEyebrowEn').value = c.home.heroEyebrowEn || '';
        if (document.getElementById('cms_home_heroEyebrowAr')) document.getElementById('cms_home_heroEyebrowAr').value = c.home.heroEyebrowAr || '';
        if (document.getElementById('cms_home_heroTitleEn')) document.getElementById('cms_home_heroTitleEn').value = c.home.heroTitleEn || '';
        if (document.getElementById('cms_home_heroTitleAr')) document.getElementById('cms_home_heroTitleAr').value = c.home.heroTitleAr || '';
        if (document.getElementById('cms_home_heroSubEn')) document.getElementById('cms_home_heroSubEn').value = c.home.heroSubEn || '';
        if (document.getElementById('cms_home_heroSubAr')) document.getElementById('cms_home_heroSubAr').value = c.home.heroSubAr || '';
        if (document.getElementById('cms_home_brandsTitleEn')) document.getElementById('cms_home_brandsTitleEn').value = c.home.brandsTitleEn || '';
        if (document.getElementById('cms_home_brandsTitleAr')) document.getElementById('cms_home_brandsTitleAr').value = c.home.brandsTitleAr || '';
        if (document.getElementById('cms_home_capabilitiesEyebrowEn')) document.getElementById('cms_home_capabilitiesEyebrowEn').value = c.home.capabilitiesEyebrowEn || '';
        if (document.getElementById('cms_home_capabilitiesEyebrowAr')) document.getElementById('cms_home_capabilitiesEyebrowAr').value = c.home.capabilitiesEyebrowAr || '';
        if (document.getElementById('cms_home_capabilitiesTitleEn')) document.getElementById('cms_home_capabilitiesTitleEn').value = c.home.capabilitiesTitleEn || '';
        if (document.getElementById('cms_home_capabilitiesTitleAr')) document.getElementById('cms_home_capabilitiesTitleAr').value = c.home.capabilitiesTitleAr || '';
        if (document.getElementById('cms_home_capGrowthTitleEn')) document.getElementById('cms_home_capGrowthTitleEn').value = c.home.capGrowthTitleEn || '';
        if (document.getElementById('cms_home_capGrowthTitleAr')) document.getElementById('cms_home_capGrowthTitleAr').value = c.home.capGrowthTitleAr || '';
        if (document.getElementById('cms_home_capGrowthDescEn')) document.getElementById('cms_home_capGrowthDescEn').value = c.home.capGrowthDescEn || '';
        if (document.getElementById('cms_home_capGrowthDescAr')) document.getElementById('cms_home_capGrowthDescAr').value = c.home.capGrowthDescAr || '';
        if (document.getElementById('cms_home_capProductionTitleEn')) document.getElementById('cms_home_capProductionTitleEn').value = c.home.capProductionTitleEn || '';
        if (document.getElementById('cms_home_capProductionTitleAr')) document.getElementById('cms_home_capProductionTitleAr').value = c.home.capProductionTitleAr || '';
        if (document.getElementById('cms_home_capProductionDescEn')) document.getElementById('cms_home_capProductionDescEn').value = c.home.capProductionDescEn || '';
        if (document.getElementById('cms_home_capProductionDescAr')) document.getElementById('cms_home_capProductionDescAr').value = c.home.capProductionDescAr || '';
        if (document.getElementById('cms_home_capCreativeTitleEn')) document.getElementById('cms_home_capCreativeTitleEn').value = c.home.capCreativeTitleEn || '';
        if (document.getElementById('cms_home_capCreativeTitleAr')) document.getElementById('cms_home_capCreativeTitleAr').value = c.home.capCreativeTitleAr || '';
        if (document.getElementById('cms_home_capCreativeDescEn')) document.getElementById('cms_home_capCreativeDescEn').value = c.home.capCreativeDescEn || '';
        if (document.getElementById('cms_home_capCreativeDescAr')) document.getElementById('cms_home_capCreativeDescAr').value = c.home.capCreativeDescAr || '';
        if (document.getElementById('cms_home_numbersProjectsVal')) document.getElementById('cms_home_numbersProjectsVal').value = c.home.numbersProjectsVal || '150+';
        if (document.getElementById('cms_home_numbersReachVal')) document.getElementById('cms_home_numbersReachVal').value = c.home.numbersReachVal || '5M+';
        if (document.getElementById('cms_home_numbersVideosVal')) document.getElementById('cms_home_numbersVideosVal').value = c.home.numbersVideosVal || '150+';
        if (document.getElementById('cms_home_numbersClientsVal')) document.getElementById('cms_home_numbersClientsVal').value = c.home.numbersClientsVal || '35+';
      }

      // 2. About inputs
      if (c.about) {
        if (document.getElementById('cms_about_headingEn')) document.getElementById('cms_about_headingEn').value = c.about.whoWeAreHeadingEn || '';
        if (document.getElementById('cms_about_headingAr')) document.getElementById('cms_about_headingAr').value = c.about.whoWeAreHeadingAr || '';
        if (document.getElementById('cms_about_whoWeAreEn')) document.getElementById('cms_about_whoWeAreEn').value = c.about.whoWeAreTextEn || '';
        if (document.getElementById('cms_about_whoWeAreAr')) document.getElementById('cms_about_whoWeAreAr').value = c.about.whoWeAreTextAr || '';
        if (document.getElementById('cms_about_metricProjects')) document.getElementById('cms_about_metricProjects').value = c.about.metricProjects || '150+';
        if (document.getElementById('cms_about_metricIndustries')) document.getElementById('cms_about_metricIndustries').value = c.about.metricIndustries || '5+';
        if (document.getElementById('cms_about_metricClients')) document.getElementById('cms_about_metricClients').value = c.about.metricClients || '35+';
        if (document.getElementById('cms_about_metricReach')) document.getElementById('cms_about_metricReach').value = c.about.metricReach || '5M+';
        if (document.getElementById('cms_about_visionEn')) document.getElementById('cms_about_visionEn').value = c.about.visionTextEn || '';
        if (document.getElementById('cms_about_visionAr')) document.getElementById('cms_about_visionAr').value = c.about.visionTextAr || '';
        if (document.getElementById('cms_about_missionEn')) document.getElementById('cms_about_missionEn').value = c.about.missionTextEn || '';
        if (document.getElementById('cms_about_missionAr')) document.getElementById('cms_about_missionAr').value = c.about.missionTextAr || '';

        // 4-Photo Slider Editor
        cmsSliderPhotosData = c.about.sliderPhotos || [
          { url: "/assets/Image_error.jpg", captionEn: "Commercial Production", captionAr: "إنتاج تجاري وسينمائي" },
          { url: "/assets/Image_error.jpg", captionEn: "Cinema Lighting", captionAr: "إضاءة استوديو سينمائية" },
          { url: "/assets/Image_error.jpg", captionEn: "DaVinci Hollywood Grade", captionAr: "تلوين سينمائي DaVinci" },
          { url: "/assets/Image_error.jpg", captionEn: "Set Design & Art Direction", captionAr: "تصميم الديكور والإخراج الفني" }
        ];

        renderCMSAboutPhotoSlider();
      }

      // 3. Services inputs
      if (c.services) {
        if (document.getElementById('cms_services_headerTitleEn')) document.getElementById('cms_services_headerTitleEn').value = c.services.headerTitleEn || '';
        if (document.getElementById('cms_services_headerTitleAr')) document.getElementById('cms_services_headerTitleAr').value = c.services.headerTitleAr || '';
        if (document.getElementById('cms_services_headerSubEn')) document.getElementById('cms_services_headerSubEn').value = c.services.headerSubEn || '';
        if (document.getElementById('cms_services_headerSubAr')) document.getElementById('cms_services_headerSubAr').value = c.services.headerSubAr || '';
      }

      // 4. Projects inputs
      if (c.projects) {
        if (document.getElementById('cms_projects_headerTitleEn')) document.getElementById('cms_projects_headerTitleEn').value = c.projects.headerTitleEn || '';
        if (document.getElementById('cms_projects_headerTitleAr')) document.getElementById('cms_projects_headerTitleAr').value = c.projects.headerTitleAr || '';
        if (document.getElementById('cms_projects_disclaimerEn')) document.getElementById('cms_projects_disclaimerEn').value = c.projects.disclaimerEn || '';
        if (document.getElementById('cms_projects_disclaimerAr')) document.getElementById('cms_projects_disclaimerAr').value = c.projects.disclaimerAr || '';
      }

      // 5. Contact inputs
      if (c.contact) {
        if (document.getElementById('cms_contact_headerTitleEn')) document.getElementById('cms_contact_headerTitleEn').value = c.contact.headerTitleEn || '';
        if (document.getElementById('cms_contact_headerTitleAr')) document.getElementById('cms_contact_headerTitleAr').value = c.contact.headerTitleAr || '';
        if (document.getElementById('cms_contact_headerSubEn')) document.getElementById('cms_contact_headerSubEn').value = c.contact.headerSubEn || '';
        if (document.getElementById('cms_contact_headerSubAr')) document.getElementById('cms_contact_headerSubAr').value = c.contact.headerSubAr || '';
        if (document.getElementById('cms_contact_phone')) document.getElementById('cms_contact_phone').value = c.contact.phone || '';
        if (document.getElementById('cms_contact_email')) document.getElementById('cms_contact_email').value = c.contact.email || '';
      }

      // 6. KYC inputs (Requirement 3)
      if (c.kyc) {
        if (document.getElementById('cms_kyc_headerTitleEn')) document.getElementById('cms_kyc_headerTitleEn').value = c.kyc.headerTitleEn || '';
        if (document.getElementById('cms_kyc_headerTitleAr')) document.getElementById('cms_kyc_headerTitleAr').value = c.kyc.headerTitleAr || '';
        if (document.getElementById('cms_kyc_subtitleEn')) document.getElementById('cms_kyc_subtitleEn').value = c.kyc.subtitleEn || '';
        if (document.getElementById('cms_kyc_subtitleAr')) document.getElementById('cms_kyc_subtitleAr').value = c.kyc.subtitleAr || '';
        if (document.getElementById('cms_kyc_venueOfficeEn')) document.getElementById('cms_kyc_venueOfficeEn').value = c.kyc.venueOfficeEn || '';
        if (document.getElementById('cms_kyc_venueOfficeAr')) document.getElementById('cms_kyc_venueOfficeAr').value = c.kyc.venueOfficeAr || '';
        if (document.getElementById('cms_kyc_venueOfficeSubEn')) document.getElementById('cms_kyc_venueOfficeSubEn').value = c.kyc.venueOfficeSubEn || '';
        if (document.getElementById('cms_kyc_venueOfficeSubAr')) document.getElementById('cms_kyc_venueOfficeSubAr').value = c.kyc.venueOfficeSubAr || '';
        if (document.getElementById('cms_kyc_venueMeetEn')) document.getElementById('cms_kyc_venueMeetEn').value = c.kyc.venueMeetEn || '';
        if (document.getElementById('cms_kyc_venueMeetAr')) document.getElementById('cms_kyc_venueMeetAr').value = c.kyc.venueMeetAr || '';
        if (document.getElementById('cms_kyc_venueMeetSubEn')) document.getElementById('cms_kyc_venueMeetSubEn').value = c.kyc.venueMeetSubEn || '';
        if (document.getElementById('cms_kyc_venueMeetSubAr')) document.getElementById('cms_kyc_venueMeetSubAr').value = c.kyc.venueMeetSubAr || '';
      }
    }

    // Load Services catalog table in Services CMS tab
    await loadAdminServicesTable();
  } catch (err) {
    console.error('Failed to load CMS content in admin:', err);
  }
}

// -----------------------------------------------------------------------------
// PUBLIC ABOUT SLIDER & ANIMATED NUMBER COUNTERS
// -----------------------------------------------------------------------------
export function renderPublicAboutSliderPhotos(photos) {
  const container = document.getElementById('aboutPhotoSlider');
  if (!container) return;
  const list = photos && photos.length ? photos : [
    { url: "/assets/Image_error.jpg", captionEn: "Commercial Production", captionAr: "إنتاج تجاري وسينمائي" },
    { url: "/assets/Image_error.jpg", captionEn: "Cinema Lighting", captionAr: "إضاءة استوديو سينمائية" },
    { url: "/assets/Image_error.jpg", captionEn: "DaVinci Hollywood Grade", captionAr: "تلوين سينمائي DaVinci" },
    { url: "/assets/Image_error.jpg", captionEn: "Set Design & Art Direction", captionAr: "تصميم الديكور والإخراج الفني" }
  ];
  const isAr = getLanguage() === 'ar';
  container.innerHTML = list.map((photo, i) => {
    const caption = isAr && photo.captionAr ? photo.captionAr : photo.captionEn || '';
    return `
      <div class="photo-slider-item" style="cursor:default;" title="${escapeHtml(caption)}">
        <img src="${escapeHtml(photo.url || '/assets/Image_error.jpg')}" alt="${escapeHtml(caption || 'BTS Still ' + (i + 1))}" loading="lazy">
        ${caption ? `<div style="position:absolute; bottom:0; left:0; right:0; padding:10px 14px; background:linear-gradient(transparent, rgba(10,15,51,0.88)); color:#FFFFFF; font-size:0.85rem; font-weight:600; text-overflow:ellipsis; overflow:hidden; white-space:nowrap;">${escapeHtml(caption)}</div>` : ''}
      </div>
    `;
  }).join('');
}

export function animateNumberCounters(container = document) {
  const elements = container.querySelectorAll('.number-val, [data-counter]');
  elements.forEach((el) => {
    const raw = el.getAttribute('data-target-raw') || el.textContent.trim();
    if (!raw) return;
    el.setAttribute('data-target-raw', raw);

    const match = raw.match(/^([^\d]*)([\d,.]+)(.*)$/);
    if (!match) return;

    const prefix = match[1] || '';
    const numStr = match[2].replace(/,/g, '');
    const isDecimal = numStr.includes('.');
    const targetVal = parseFloat(numStr);
    const suffix = match[3] || '';

    if (isNaN(targetVal) || targetVal === 0) return;

    const duration = 1400;
    let startTimestamp = null;

    function step(timestamp) {
      if (!startTimestamp) startTimestamp = timestamp;
      const progress = Math.min((timestamp - startTimestamp) / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 3);
      const current = isDecimal ? (targetVal * ease).toFixed(1) : Math.round(targetVal * ease);
      const formatted = !isDecimal && targetVal >= 1000 ? Number(current).toLocaleString('en-US') : current;
      el.textContent = `${prefix}${formatted}${suffix}`;

      if (progress < 1) {
        requestAnimationFrame(step);
      } else {
        const finalFormatted = !isDecimal && targetVal >= 1000 ? targetVal.toLocaleString('en-US') : targetVal;
        el.textContent = `${prefix}${finalFormatted}${suffix}`;
      }
    }

    el.textContent = `${prefix}0${suffix}`;
    requestAnimationFrame(step);
  });
}

export function addAboutSliderPhoto() {
  if (!cmsSliderPhotosData) cmsSliderPhotosData = [];
  cmsSliderPhotosData.push({
    url: '/assets/Image_error.jpg',
    captionEn: 'BTS Production',
    captionAr: 'كواليس الإنتاج'
  });
  renderCMSAboutPhotoSlider();
}

export function removeAboutSliderPhoto(idx) {
  if (!cmsSliderPhotosData || idx < 0 || idx >= cmsSliderPhotosData.length) return;
  cmsSliderPhotosData.splice(idx, 1);
  renderCMSAboutPhotoSlider();
}

export function moveAboutSliderPhoto(idx, dir) {
  if (!cmsSliderPhotosData) return;
  const targetIdx = idx + dir;
  if (targetIdx < 0 || targetIdx >= cmsSliderPhotosData.length) return;
  const temp = cmsSliderPhotosData[idx];
  cmsSliderPhotosData[idx] = cmsSliderPhotosData[targetIdx];
  cmsSliderPhotosData[targetIdx] = temp;
  renderCMSAboutPhotoSlider();
}

export function updateAboutSliderPhotoField(idx, field, value) {
  if (!cmsSliderPhotosData || !cmsSliderPhotosData[idx]) return;
  cmsSliderPhotosData[idx][field] = value;
}

function renderCMSAboutPhotoSlider() {
  const container = document.getElementById('cmsAboutPhotoSliderGrid');
  if (!container) return;

  if (!cmsSliderPhotosData || !cmsSliderPhotosData.length) {
    container.innerHTML = `<div class="card card-flat" style="padding:24px; text-align:center; color:var(--text-muted);">No BTS photos added yet. Click "+ Add Photo" above.</div>`;
    return;
  }

  container.innerHTML = cmsSliderPhotosData.map((photo, i) => `
    <div style="background:var(--surface-sunken); padding:16px; border-radius:var(--radius-card); border:1px solid var(--border-default);">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; flex-wrap:wrap; gap:8px;">
        <div style="display:flex; align-items:center; gap:8px;">
          <strong style="font-size:0.95rem;">Photo #${i + 1}</strong>
          ${i === 0 ? '<span class="badge badge-accent" style="font-size:11px;">First in strip</span>' : ''}
        </div>
        <div style="display:flex; gap:6px;">
          <button type="button" class="btn btn-secondary btn-sm" onclick="window.auroraMoveAboutSliderPhoto(${i}, -1)" ${i === 0 ? 'disabled' : ''} title="Move Up" style="padding:4px 10px;">↑ Up</button>
          <button type="button" class="btn btn-secondary btn-sm" onclick="window.auroraMoveAboutSliderPhoto(${i}, 1)" ${i === cmsSliderPhotosData.length - 1 ? 'disabled' : ''} title="Move Down" style="padding:4px 10px;">↓ Down</button>
          <button type="button" class="btn btn-sm" onclick="window.auroraRemoveAboutSliderPhoto(${i})" style="background:rgba(209,67,67,0.15); color:#D14343; border:1px solid rgba(209,67,67,0.3); padding:4px 10px;" title="Delete">🗑 Remove</button>
        </div>
      </div>
      <div style="display:grid; grid-template-columns: 140px 1fr; gap:16px; align-items:start;">
        <div>
          <img id="cms_preview_photo_${i}" src="${photo.url || '/assets/Image_error.jpg'}" style="width:140px; height:105px; object-fit:cover; border-radius:var(--radius-sm); border:1px solid var(--border-default);">
          <div style="margin-top:6px;">
            <label class="form-label" style="font-size:11px; margin-bottom:2px;">Upload File</label>
            <input type="file" accept="image/*" class="form-input" style="padding:3px; font-size:11px;" onchange="window.auroraUploadSliderPhoto(${i}, this)">
          </div>
        </div>
        <div>
          <div class="form-group" style="margin-bottom:8px;">
            <label class="form-label" style="font-size:12px;">Image URL</label>
            <input type="text" class="form-input" id="cms_photo_${i}_url" value="${escapeHtml(photo.url || '')}" oninput="window.auroraUpdateAboutSliderPhotoField(${i}, 'url', this.value); document.getElementById('cms_preview_photo_${i}').src = this.value || '/assets/Image_error.jpg';" style="font-size:12px;">
          </div>
          <div class="grid grid-2" style="gap:8px;">
            <div>
              <label class="form-label" style="font-size:12px;">Caption (English)</label>
              <input type="text" class="form-input" id="cms_photo_${i}_capEn" value="${escapeHtml(photo.captionEn || '')}" oninput="window.auroraUpdateAboutSliderPhotoField(${i}, 'captionEn', this.value)" style="font-size:12px;">
            </div>
            <div>
              <label class="form-label" style="font-size:12px;">Caption (Arabic)</label>
              <input type="text" class="form-input" id="cms_photo_${i}_capAr" dir="rtl" value="${escapeHtml(photo.captionAr || '')}" oninput="window.auroraUpdateAboutSliderPhotoField(${i}, 'captionAr', this.value)" style="font-size:12px;">
            </div>
          </div>
        </div>
      </div>
    </div>
  `).join('');
}

export async function uploadSliderPhoto(idx, fileInput) {
  const file = fileInput.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (e) => {
    const dataUrl = e.target.result;
    try {
      const res = await api.uploadCMSPhoto(dataUrl, file.name);
      if (res.success && res.url) {
        if (cmsSliderPhotosData[idx]) {
          cmsSliderPhotosData[idx].url = res.url;
        }
        const urlInput = document.getElementById(`cms_photo_${idx}_url`);
        if (urlInput) urlInput.value = res.url;
        const prevImg = document.getElementById(`cms_preview_photo_${idx}`);
        if (prevImg) prevImg.src = res.url;
        showToastNotification(`Photo #${idx + 1} uploaded successfully!`, 'success');
      } else {
        showToastNotification(res.error || 'Failed to upload photo.', 'error');
      }
    } catch (err) {
      showToastNotification('Upload error: ' + err.message, 'error');
    }
  };
  reader.readAsDataURL(file);
}

export function switchCMSTab(tabKey) {
  const tabs = ['home', 'about', 'services', 'projects', 'contact', 'kyc', 'team'];
  tabs.forEach(t => {
    const panel = document.getElementById(`cms-panel-${t}`);
    const btn = document.getElementById(`cmsTabBtn-${t}`);
    if (panel) panel.style.display = t === tabKey ? 'block' : 'none';
    if (btn) {
      if (t === tabKey) btn.classList.add('active');
      else btn.classList.remove('active');
    }
  });

  if (tabKey === 'services') {
    loadAdminServicesTable();
    loadAdminServicesToggles();
  }
}

export async function saveCMSContent() {
  // Sync inputs with cmsSliderPhotosData
  cmsSliderPhotosData.forEach((photo, i) => {
    const urlVal = document.getElementById(`cms_photo_${i}_url`)?.value.trim();
    const capEnVal = document.getElementById(`cms_photo_${i}_capEn`)?.value.trim();
    const capArVal = document.getElementById(`cms_photo_${i}_capAr`)?.value.trim();
    if (urlVal !== undefined) photo.url = urlVal || '/assets/Image_error.jpg';
    if (capEnVal !== undefined) photo.captionEn = capEnVal;
    if (capArVal !== undefined) photo.captionAr = capArVal;
  });
  const updatedPhotos = JSON.parse(JSON.stringify(cmsSliderPhotosData));

  const payload = {
    home: {
      heroEyebrowEn: document.getElementById('cms_home_heroEyebrowEn')?.value.trim() || '',
      heroEyebrowAr: document.getElementById('cms_home_heroEyebrowAr')?.value.trim() || '',
      heroTitleEn: document.getElementById('cms_home_heroTitleEn')?.value.trim() || '',
      heroTitleAr: document.getElementById('cms_home_heroTitleAr')?.value.trim() || '',
      heroSubEn: document.getElementById('cms_home_heroSubEn')?.value.trim() || '',
      heroSubAr: document.getElementById('cms_home_heroSubAr')?.value.trim() || '',
      brandsTitleEn: document.getElementById('cms_home_brandsTitleEn')?.value.trim() || '',
      brandsTitleAr: document.getElementById('cms_home_brandsTitleAr')?.value.trim() || '',
      capabilitiesEyebrowEn: document.getElementById('cms_home_capabilitiesEyebrowEn')?.value.trim() || '',
      capabilitiesEyebrowAr: document.getElementById('cms_home_capabilitiesEyebrowAr')?.value.trim() || '',
      capabilitiesTitleEn: document.getElementById('cms_home_capabilitiesTitleEn')?.value.trim() || '',
      capabilitiesTitleAr: document.getElementById('cms_home_capabilitiesTitleAr')?.value.trim() || '',
      capGrowthTitleEn: document.getElementById('cms_home_capGrowthTitleEn')?.value.trim() || '',
      capGrowthTitleAr: document.getElementById('cms_home_capGrowthTitleAr')?.value.trim() || '',
      capGrowthDescEn: document.getElementById('cms_home_capGrowthDescEn')?.value.trim() || '',
      capGrowthDescAr: document.getElementById('cms_home_capGrowthDescAr')?.value.trim() || '',
      capProductionTitleEn: document.getElementById('cms_home_capProductionTitleEn')?.value.trim() || '',
      capProductionTitleAr: document.getElementById('cms_home_capProductionTitleAr')?.value.trim() || '',
      capProductionDescEn: document.getElementById('cms_home_capProductionDescEn')?.value.trim() || '',
      capProductionDescAr: document.getElementById('cms_home_capProductionDescAr')?.value.trim() || '',
      capCreativeTitleEn: document.getElementById('cms_home_capCreativeTitleEn')?.value.trim() || '',
      capCreativeTitleAr: document.getElementById('cms_home_capCreativeTitleAr')?.value.trim() || '',
      capCreativeDescEn: document.getElementById('cms_home_capCreativeDescEn')?.value.trim() || '',
      capCreativeDescAr: document.getElementById('cms_home_capCreativeDescAr')?.value.trim() || '',
      numbersProjectsVal: document.getElementById('cms_home_numbersProjectsVal')?.value.trim() || '150+',
      numbersReachVal: document.getElementById('cms_home_numbersReachVal')?.value.trim() || '5M+',
      numbersVideosVal: document.getElementById('cms_home_numbersVideosVal')?.value.trim() || '150+',
      numbersClientsVal: document.getElementById('cms_home_numbersClientsVal')?.value.trim() || '35+'
    },
    about: {
      whoWeAreHeadingEn: document.getElementById('cms_about_headingEn')?.value.trim() || '',
      whoWeAreHeadingAr: document.getElementById('cms_about_headingAr')?.value.trim() || '',
      whoWeAreTextEn: document.getElementById('cms_about_whoWeAreEn')?.value.trim() || '',
      whoWeAreTextAr: document.getElementById('cms_about_whoWeAreAr')?.value.trim() || '',
      metricProjects: document.getElementById('cms_about_metricProjects')?.value.trim() || '150+',
      metricIndustries: document.getElementById('cms_about_metricIndustries')?.value.trim() || '5+',
      metricClients: document.getElementById('cms_about_metricClients')?.value.trim() || '35+',
      metricReach: document.getElementById('cms_about_metricReach')?.value.trim() || '5M+',
      visionTextEn: document.getElementById('cms_about_visionEn')?.value.trim() || '',
      visionTextAr: document.getElementById('cms_about_visionAr')?.value.trim() || '',
      missionTextEn: document.getElementById('cms_about_missionEn')?.value.trim() || '',
      missionTextAr: document.getElementById('cms_about_missionAr')?.value.trim() || '',
      sliderPhotos: updatedPhotos
    },
    services: {
      headerTitleEn: document.getElementById('cms_services_headerTitleEn')?.value.trim() || '',
      headerTitleAr: document.getElementById('cms_services_headerTitleAr')?.value.trim() || '',
      headerSubEn: document.getElementById('cms_services_headerSubEn')?.value.trim() || '',
      headerSubAr: document.getElementById('cms_services_headerSubAr')?.value.trim() || ''
    },
    projects: {
      headerTitleEn: document.getElementById('cms_projects_headerTitleEn')?.value.trim() || '',
      headerTitleAr: document.getElementById('cms_projects_headerTitleAr')?.value.trim() || '',
      disclaimerEn: document.getElementById('cms_projects_disclaimerEn')?.value.trim() || '',
      disclaimerAr: document.getElementById('cms_projects_disclaimerAr')?.value.trim() || ''
    },
    contact: {
      headerTitleEn: document.getElementById('cms_contact_headerTitleEn')?.value.trim() || '',
      headerTitleAr: document.getElementById('cms_contact_headerTitleAr')?.value.trim() || '',
      headerSubEn: document.getElementById('cms_contact_headerSubEn')?.value.trim() || '',
      headerSubAr: document.getElementById('cms_contact_headerSubAr')?.value.trim() || '',
      phone: document.getElementById('cms_contact_phone')?.value.trim() || '',
      email: document.getElementById('cms_contact_email')?.value.trim() || ''
    },
    kyc: {
      headerTitleEn: document.getElementById('cms_kyc_headerTitleEn')?.value.trim() || '',
      headerTitleAr: document.getElementById('cms_kyc_headerTitleAr')?.value.trim() || '',
      subtitleEn: document.getElementById('cms_kyc_subtitleEn')?.value.trim() || '',
      subtitleAr: document.getElementById('cms_kyc_subtitleAr')?.value.trim() || '',
      venueOfficeEn: document.getElementById('cms_kyc_venueOfficeEn')?.value.trim() || '',
      venueOfficeAr: document.getElementById('cms_kyc_venueOfficeAr')?.value.trim() || '',
      venueOfficeSubEn: document.getElementById('cms_kyc_venueOfficeSubEn')?.value.trim() || '',
      venueOfficeSubAr: document.getElementById('cms_kyc_venueOfficeSubAr')?.value.trim() || '',
      venueMeetEn: document.getElementById('cms_kyc_venueMeetEn')?.value.trim() || '',
      venueMeetAr: document.getElementById('cms_kyc_venueMeetAr')?.value.trim() || '',
      venueMeetSubEn: document.getElementById('cms_kyc_venueMeetSubEn')?.value.trim() || '',
      venueMeetSubAr: document.getElementById('cms_kyc_venueMeetSubAr')?.value.trim() || ''
    }
  };

  try {
    const res = await api.updateSiteContent(payload);
    if (res.success) {
      currentSiteContent = res.data;
      hydrateSiteContent(false);
      renderPublicAboutSliderPhotos(updatedPhotos);
      showToastNotification('All CMS changes and BTS photos saved successfully! Public pages updated.', 'success');
    } else {
      showToastNotification(res.error || 'Failed to save CMS changes.', 'error');
    }
  } catch (err) {
    showToastNotification('Network error saving CMS changes: ' + err.message, 'error');
  }
}

// -----------------------------------------------------------------------------
// SERVICES CATALOG CRUD & SORTING MANAGER (Requirement 3.1)
// -----------------------------------------------------------------------------
async function loadAdminServicesTable() {
  const tbody = document.getElementById('adminServicesTableBody');
  if (!tbody) return;

  try {
    const res = await api.fetchServices(false); // get all (active and inactive)
    if (res.success && res.data) {
      allAdminServices = (res.data || []).sort((a, b) => (a.order || 0) - (b.order || 0));
      renderAdminServicesTable(allAdminServices);
    }
  } catch (err) {
    console.error('Failed to load admin services:', err);
  }
}

function renderAdminServicesTable(services) {
  const tbody = document.getElementById('adminServicesTableBody');
  if (!tbody) return;

  if (!services.length) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:32px; color:var(--text-muted);">No services configured yet. Click "+ Add New Service" to create one.</td></tr>`;
    return;
  }

  tbody.innerHTML = services.map((s, idx) => `
    <tr>
      <td style="white-space:nowrap;">
        <div style="display:flex; gap:4px; align-items:center;">
          <button type="button" class="btn btn-sm btn-secondary" style="padding:2px 6px;" title="Move Up" ${idx === 0 ? 'disabled' : ''} onclick="window.auroraMoveService('${s.id}', -1)">▲</button>
          <button type="button" class="btn btn-sm btn-secondary" style="padding:2px 6px;" title="Move Down" ${idx === services.length - 1 ? 'disabled' : ''} onclick="window.auroraMoveService('${s.id}', 1)">▼</button>
          <span style="font-weight:700; margin-inline-start:4px;">${s.order || (idx + 1)}</span>
        </div>
      </td>
      <td>
        <strong>${s.nameEn}</strong><br>
        <span style="color:var(--text-muted); font-size:12px;" dir="rtl">${s.nameAr || ''}</span>
      </td>
      <td>
        <span class="badge ${s.category === 'marketing' ? 'badge-accent' : 'badge-teal'}">${s.category === 'marketing' ? 'Marketing' : 'Production'}</span>
      </td>
      <td>
        <span class="badge badge-secondary">${s.tagEn || '—'}</span>
      </td>
      <td>
        <span style="font-size:12px; color:var(--text-muted);">${(s.items || []).length} deliverables:</span><br>
        <span style="font-size:12px;">${(s.items || []).slice(0, 3).join(', ')}${(s.items || []).length > 3 ? '...' : ''}</span>
      </td>
      <td>
        <button type="button" class="btn btn-sm ${s.isActive ? 'btn-teal' : 'btn-secondary'}" onclick="window.auroraToggleService('${s.id}', ${!s.isActive})" title="Toggle Active">
          ${s.isActive ? '✓ Active' : 'Off'}
        </button>
      </td>
      <td style="text-align:end; white-space:nowrap;">
        <div style="display:flex; gap:6px; justify-content:flex-end;">
          <button type="button" class="btn btn-sm btn-outline" onclick="window.auroraOpenEditServiceModal('${s.id}')">Edit</button>
          <button type="button" class="btn btn-sm btn-secondary" style="color:var(--status-error);" onclick="window.auroraDeleteService('${s.id}')">Delete</button>
        </div>
      </td>
    </tr>
  `).join('');
}

export function openAddServiceModal() {
  document.getElementById('serviceEditId').value = '';
  document.getElementById('serviceModalTitle').textContent = 'Add New Service';
  document.getElementById('serviceNameEn').value = '';
  document.getElementById('serviceNameAr').value = '';
  document.getElementById('serviceCategory').value = 'marketing';
  document.getElementById('serviceTagEn').value = '';
  document.getElementById('serviceDescEn').value = '';
  document.getElementById('serviceDescAr').value = '';
  document.getElementById('serviceItems').value = '';
  document.getElementById('serviceActive').checked = true;
  document.getElementById('serviceEditModal')?.classList.add('active');
}

export function openEditServiceModal(id) {
  const service = allAdminServices.find(s => s.id === id);
  if (!service) return;

  document.getElementById('serviceEditId').value = id;
  document.getElementById('serviceModalTitle').textContent = `Edit Service: ${service.nameEn}`;
  document.getElementById('serviceNameEn').value = service.nameEn || '';
  document.getElementById('serviceNameAr').value = service.nameAr || '';
  document.getElementById('serviceCategory').value = service.category || 'marketing';
  document.getElementById('serviceTagEn').value = service.tagEn || '';
  document.getElementById('serviceDescEn').value = service.descEn || '';
  document.getElementById('serviceDescAr').value = service.descAr || '';
  document.getElementById('serviceItems').value = (service.items || []).join(', ');
  document.getElementById('serviceActive').checked = service.isActive !== false;
  document.getElementById('serviceEditModal')?.classList.add('active');
}

export async function saveService(e) {
  if (e) e.preventDefault();
  const id = document.getElementById('serviceEditId').value.trim();
  const itemsRaw = document.getElementById('serviceItems').value;
  const items = itemsRaw.split(',').map(s => s.trim()).filter(Boolean);

  const payload = {
    nameEn: document.getElementById('serviceNameEn').value.trim(),
    nameAr: document.getElementById('serviceNameAr').value.trim(),
    category: document.getElementById('serviceCategory').value,
    tagEn: document.getElementById('serviceTagEn').value.trim(),
    descEn: document.getElementById('serviceDescEn').value.trim(),
    descAr: document.getElementById('serviceDescAr').value.trim(),
    items,
    isActive: document.getElementById('serviceActive').checked
  };

  try {
    let res;
    if (id) {
      res = await api.updateService(id, payload);
    } else {
      payload.order = allAdminServices.length + 1;
      res = await api.createService(payload);
    }

    if (res && res.success) {
      document.getElementById('serviceEditModal')?.classList.remove('active');
      await loadAdminServicesTable();
      await loadPublicServices();
      alert('Service saved successfully!');
    } else {
      alert(res?.error || 'Failed to save service.');
    }
  } catch (err) {
    alert('Error saving service: ' + err.message);
  }
}

export async function deleteService(id) {
  if (!confirm('Are you sure you want to delete this service and its deliverables?')) return;
  try {
    const res = await api.deleteService(id);
    if (res && res.success) {
      await loadAdminServicesTable();
      await loadPublicServices();
      alert('Service deleted successfully.');
    } else {
      alert(res?.error || 'Failed to delete service.');
    }
  } catch (err) {
    alert('Error deleting service: ' + err.message);
  }
}

export async function toggleService(id, isActive) {
  try {
    const res = await api.updateService(id, { isActive });
    if (res && res.success) {
      showToastNotification(`Service ${isActive ? 'activated' : 'deactivated'} successfully.`, 'success');
      await loadAdminServicesTable();
      await loadAdminServicesToggles();
      await loadPublicServices();
    } else {
      showToastNotification(res?.error || 'Failed to update service status.', 'error');
    }
  } catch (err) {
    showToastNotification('Error updating service status: ' + err.message, 'error');
  }
}

export async function moveService(id, direction) {
  const index = allAdminServices.findIndex(s => s.id === id);
  if (index < 0) return;
  const targetIndex = index + direction;
  if (targetIndex < 0 || targetIndex >= allAdminServices.length) return;

  const temp = allAdminServices[index];
  allAdminServices[index] = allAdminServices[targetIndex];
  allAdminServices[targetIndex] = temp;

  const orderArray = allAdminServices.map((s, idx) => ({ id: s.id, order: idx + 1 }));
  try {
    const res = await api.reorderServices(orderArray);
    if (res && res.success) {
      await loadAdminServicesTable();
      await loadPublicServices();
    }
  } catch (err) {
    console.error('Failed to reorder services:', err);
  }
}

// Global window exposure
export function togglePasswordVisibility(inputId, btn) {
  const el = document.getElementById(inputId);
  if (!el) return;
  const isPass = el.type === 'password';
  el.type = isPass ? 'text' : 'password';
  if (btn) btn.textContent = isPass ? '🔒' : '👁';
}

export function scrollSlider(id, dir) {
  const el = document.getElementById(id);
  if (!el) return;
  const isRtl = document.documentElement.getAttribute('dir') === 'rtl';
  const mult = isRtl ? -dir : dir;
  el.scrollBy({ left: mult * 340, behavior: 'smooth' });
}

window.auroraScrollSlider = scrollSlider;
window.auroraTogglePasswordVisibility = togglePasswordVisibility;
window.auroraNavigate = (path) => navigateTo(path, onScreenChange);
window.auroraFilterProjects = filterProjects;
window.auroraFilterProjectsByKeyword = filterProjectsByKeyword;
window.auroraOpenLightbox = openLightbox;
window.auroraCloseAll = closeAllModalsAndDrawers;
window.auroraOpenAddWork = openAddWorkDrawer;
window.auroraSubmitNewWork = submitNewWork;
window.auroraApproveProject = approveProject;
window.auroraPublishProject = publishProject;
window.auroraOpenGenerateBrief = openGenerateBriefModal;
window.auroraHandleGenerateBrief = handleGenerateBriefSubmit;
window.auroraCopyWa = copyWhatsAppMessage;
window.auroraOpenMeetingPrep = openMeetingPrep;
window.auroraOpenExtendBriefModal = openExtendBriefModal;
window.auroraSubmitExtendBrief = submitExtendBrief;
window.auroraDeactivateBrief = deactivateBrief;
window.auroraOpenBriefAnswers = openBriefAnswers;
window.auroraResetContact = resetContactForm;
window.auroraSwitchPortalTab = switchPortalTab;
window.auroraCopyMyProfileLink = copyMyProfileLink;
window.auroraPreviewMyProfile = previewMyProfile;
window.auroraSaveEmployeeProfile = saveEmployeeProfile;
window.auroraSetUserTheme = setUserTheme;
window.auroraSetUserLang = setUserLang;
window.auroraOpenRequestUpdate = openRequestUpdate;
window.auroraSubmitUpdateRequest = submitUpdateRequest;
window.auroraRemoveFromPortfolio = removeFromPortfolio;
window.auroraHandleLogin = handleLogin;
window.auroraSetLoginCreds = setLoginCreds;
window.auroraLogout = logout;
window.auroraSwitchAdminSection = switchAdminSection;
window.auroraOpenGoogleSheet = openGoogleSheet;
window.auroraFilterBriefs = filterBriefs;
window.auroraFilterPortalKyc = filterPortalKyc;
window.auroraRefreshBriefs = refreshBriefs;
window.auroraFilterCRM = filterCRM;
window.auroraFilterPortalCRM = filterPortalCRM;
window.auroraUpdateInquiryStatus = submitCRMStatusUpdate;
window.auroraUpdateUserRole = updateUserRole;
window.auroraTogglePerm = togglePerm;
window.auroraSaveSettings = saveSettings;
window.auroraToggleService = toggleService;
window.auroraSwitchCMSTab = switchCMSTab;
window.auroraSaveCMSContent = saveCMSContent;
window.auroraUploadSliderPhoto = uploadSliderPhoto;
window.auroraCopyBriefRowLink = copyBriefRowLink;
window.auroraOpenEditBriefModal = openEditBriefModal;
window.auroraSubmitEditBrief = submitEditBrief;
window.auroraOpenCRMDetails = openCRMDetails;
window.auroraOpenRejectProject = openRejectProject;
window.auroraSubmitRejectProject = submitRejectProject;
window.auroraOpenEditProject = openEditProject;
window.auroraSubmitEditProject = submitEditProject;
window.auroraWithdrawProject = withdrawProject;
window.auroraFilterActivity = filterActivity;
window.auroraResetActivityFilter = resetActivityFilter;
window.auroraOpenForgotPassword = openForgotPassword;
window.auroraSubmitForgotPassword = submitForgotPassword;
window.auroraHandleAvatarFileSelect = handleAvatarFileSelect;
window.auroraUpdateAvatarZoom = updateAvatarZoom;
window.auroraConfirmAvatarCrop = confirmAvatarCrop;
window.auroraOpenNewIndustryModal = openNewIndustryModal;
window.auroraSubmitNewIndustry = submitNewIndustry;
window.auroraHandleProjectPhotosSelect = handleProjectPhotosSelect;
window.auroraSetHeroPhoto = setHeroPhoto;
window.auroraRemoveProjectPhoto = removeProjectPhoto;
window.auroraOpenPortfolioContentPicker = openPortfolioContentPicker;
window.auroraToggleContentClip = toggleContentClip;
window.auroraSavePortfolioClips = savePortfolioClips;
window.auroraRemovePortfolioClip = removePortfolioClip;

// New Requirement Window Handlers
window.auroraOpenAddServiceModal = openAddServiceModal;
window.auroraOpenEditServiceModal = openEditServiceModal;
window.auroraSaveService = saveService;
window.auroraDeleteService = deleteService;
window.auroraMoveService = moveService;
window.auroraSaveBriefDraft = saveBriefDraft;
window.auroraNextBriefStep = nextBriefStep;
window.auroraPrevBriefStep = prevBriefStep;
window.auroraGoToBriefStep = goToBriefStep;
window.auroraSubmitBriefForm = submitBriefForm;
window.auroraUpdateVenueSelect = updateVenueSelect;
window.auroraToggleTheme = toggleTheme;
window.auroraToggleLanguage = () => { toggleLanguage(); renderCurrentScreenDynamicContent(); };

// Database, Sheets & Firebase Live Sync Bindings
window.auroraTestSheetsConnection = testSheetsConnection;
window.auroraSyncAllSheets = syncAllSheets;
window.auroraToggleAppsScriptGuide = toggleAppsScriptGuide;
window.auroraCopyAppsScript = copyAppsScript;
window.auroraTestDatabaseConnection = testDatabaseConnection;
window.auroraConnectDatabase = connectDatabase;
window.auroraDisconnectDatabase = disconnectDatabase;
window.auroraHandleGoogleSignIn = handleGoogleSignIn;
window.auroraTestFirebaseConnection = testFirebaseConnection;
window.auroraInstallServiceAccount = installServiceAccount;
window.auroraSyncStaffToFirebase = syncStaffToFirebase;

// Staff Management & Authorization Bindings
window.auroraOpenAddStaff = openAddStaffModal;
window.auroraSubmitAddStaff = submitAddStaff;
window.auroraOpenEditStaffModal = openEditStaffModal;
window.auroraSubmitEditStaff = submitEditStaff;
window.auroraSubmitFirstLoginPassword = submitFirstLoginPassword;
window.auroraDeleteStaff = deleteStaffUser;
window.auroraUpdateUserRole = updateUserRole;
window.auroraTogglePerm = togglePerm;
window.auroraExpireAndResetStaffPassword = expireAndResetStaffPassword;
window.auroraRequestMyPasswordReset = requestMyPasswordReset;
window.auroraToggleTeamDirectory = toggleTeamDirectory;
window.auroraUpdateTeamNavVisibility = updateTeamNavVisibility;

// Quotation & Commercial Invoice Generator (PART 4)
window.auroraOpenCreateInvoiceModal = openCreateInvoiceModal;
window.auroraUpdateInvoiceTypeLabel = updateInvoiceTypeLabel;
window.auroraAddInvoiceLineItem = addInvoiceLineItem;
window.auroraRemoveInvoiceLineItem = removeInvoiceLineItem;
window.auroraCalcInvoiceTotals = calcInvoiceTotals;
window.auroraSaveInvoice = saveInvoice;
window.auroraViewInvoicePrint = viewInvoicePrint;
window.auroraEditCurrentPrintedInvoice = editCurrentPrintedInvoice;
window.auroraDeleteInvoice = deleteInvoice;
window.auroraFilterInvoices = filterInvoices;

// CRM Status Modal Bindings
window.auroraOpenCRMStatusModal = openCRMStatusModal;
window.auroraSubmitCRMStatusUpdate = submitCRMStatusUpdate;

// Partner Logos & Trust Marquee Bindings
window.auroraLoadAdminMarquee = loadAdminMarquee;
window.auroraSaveMarqueeChanges = saveMarqueeChanges;
window.auroraUpdateMarqueeSpeedLabel = updateMarqueeSpeedLabel;
window.auroraUpdateMarqueeLogoName = updateMarqueeLogoName;
window.auroraMoveMarqueeLogo = moveMarqueeLogo;
window.auroraRemoveMarqueeLogo = removeMarqueeLogo;
window.auroraAddNewMarqueeLogo = addNewMarqueeLogo;
window.auroraShowToast = showToastNotification;

// BTS Slider & Industry Experience Bindings
window.auroraNavigateToIndustry = navigateToIndustry;
window.auroraAddAboutSliderPhoto = addAboutSliderPhoto;
window.auroraRemoveAboutSliderPhoto = removeAboutSliderPhoto;
window.auroraMoveAboutSliderPhoto = moveAboutSliderPhoto;
window.auroraUpdateAboutSliderPhotoField = updateAboutSliderPhotoField;
window.auroraAnimateCounters = animateNumberCounters;
window.auroraToggleFirebaseGuide = toggleFirebaseGuide;
window.auroraToggleDatabaseGuide = toggleDatabaseGuide;
window.auroraLoadAdminServicesToggles = loadAdminServicesToggles;

// KYC & Project Modal Window & Draft Bindings
window.auroraRefreshBriefs = refreshBriefs;
window.auroraSaveProjectDraftManual = saveProjectDraftManual;
window.auroraSaveProjectDraftDebounced = saveProjectDraftDebounced;
window.auroraClearProjectDraft = clearProjectDraft;
window.auroraToggleProjectVideoGuide = toggleProjectVideoGuide;
window.auroraPreviewProjectVideo = previewProjectVideo;
window.auroraToggleEditProjectVideoGuide = toggleEditProjectVideoGuide;
window.auroraPreviewEditProjectVideo = previewEditProjectVideo;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}




