/**
 * AURORA GROUP — ROUTER & SCREEN CONTROLLER (v3 - Hardened)
 * Multi-page navigation, strict RBAC route guards, custom 404 handler,
 * dynamic canonical URLs, and localized titles.
 */

import { getLanguage } from './i18n.js';

export const routes = {
  home: { title: 'Aurora Group | Integrated Marketing & Media Production', path: '/' },
  about: { title: 'About Us | Aurora Group Egypt', path: '/about' },
  services: { title: 'Capabilities & Services | Aurora Group', path: '/services' },
  projects: { title: 'Selected Works & Case Studies | Aurora Group', path: '/projects' },
  caseStudy: { title: 'Case Study | Aurora Group', path: '/projects/:slug' },
  contact: { title: 'Get in Touch | Aurora Group', path: '/contact' },
  team: { title: 'Creative Specialists | Aurora Group', path: '/team' },
  teamProfile: { title: 'Specialist Profile | Aurora Group', path: '/team/:slug' },
  brief: { title: 'Client Discovery Brief | Aurora Group', path: '/brief/:token' },
  privacy: { title: 'Privacy Policy | Aurora Group', path: '/privacy' },
  terms: { title: 'Terms & Conditions | Aurora Group', path: '/terms' },
  notFound: { title: 'Page Not Found | Aurora Group', path: '/404' },
  login: { title: 'Team Portal Login | Aurora Group', path: '/login' },
  portal: { title: 'Employee Portal | Aurora Group', path: '/portal' },
  admin: { title: 'Operations & Management Console | Aurora Group', path: '/admin' }
};

let currentScreen = 'home';
let currentParam = null;

export function initRouter(onNavigate) {
  // Handle browser back/forward buttons
  window.addEventListener('popstate', () => {
    handleUrl(window.location.pathname, onNavigate);
  });

  // Intercept anchor clicks with data-link or internal relative paths
  document.addEventListener('click', (e) => {
    const link = e.target.closest('a');
    if (link) {
      const href = link.getAttribute('href');
      if (href && (link.hasAttribute('data-link') || (href.startsWith('/') && !href.startsWith('/api') && !href.startsWith('/assets')))) {
        if (!link.hasAttribute('target') && !link.hasAttribute('download')) {
          e.preventDefault();
          navigateTo(href, onNavigate);
        }
      }
    }
  });

  // Restore dynamic SPA path forwarded from lightweight 404.html (?__p=...)
  const forwardedPath = new URLSearchParams(window.location.search).get('__p');
  if (forwardedPath && forwardedPath.startsWith('/')) {
    window.history.replaceState(null, '', forwardedPath + window.location.hash);
  }

  // Initial load
  handleUrl(window.location.pathname + window.location.search, onNavigate);
}

export function navigateTo(path, callback) {
  window.history.pushState(null, '', path);
  handleUrl(path, callback);
}

export function getAuthenticatedUser() {
  try {
    const raw = localStorage.getItem('aurora_current_user');
    if (!raw) return null;
    const user = JSON.parse(raw);
    if (!user || !user.email) {
      localStorage.removeItem('aurora_current_user');
      return null;
    }

    // Check sliding inactivity timeout (only if a last activity timestamp was previously established)
    const last = parseInt(localStorage.getItem('aurora_last_activity') || '0', 10);
    const SESSION_TIMEOUT_MS = 15 * 60 * 1000;
    if (last && (Date.now() - last > SESSION_TIMEOUT_MS)) {
      console.warn('[Session Guard] Session timeout limit exceeded.');
      localStorage.removeItem('aurora_current_user');
      localStorage.removeItem('aurora_last_activity');
      sessionStorage.setItem('aurora_login_notice', 'timeout');
      return null;
    }

    // Refresh active timestamp on navigation / refresh
    localStorage.setItem('aurora_last_activity', Date.now().toString());
    return user;
  } catch {
    localStorage.removeItem('aurora_current_user');
    localStorage.removeItem('aurora_last_activity');
    return null;
  }
}

function handleUrl(path, callback) {
  const [pathname, search] = (path || '/').split('?');
  const cleanPath = pathname.replace(/^\/ar/, '') || '/';
  const queryParams = new URLSearchParams(search || (typeof window !== 'undefined' ? window.location.search : ''));
  const user = getAuthenticatedUser();

  // Strict Security Route Guards: Prevent URL manipulation bypass
  if (cleanPath === '/admin' || cleanPath.startsWith('/admin')) {
    if (!user || (user.role !== 'super_admin' && user.role !== 'manager')) {
      console.warn('[Security Guard] Unauthorized attempt to access admin. Redirecting to /login.');
      window.history.replaceState(null, '', '/login');
      setScreen('login', null, callback);
      return;
    }
    setScreen('admin', null, callback);
    return;
  }

  if (cleanPath === '/portal' || cleanPath.startsWith('/portal')) {
    if (!user) {
      console.warn('[Security Guard] Unauthorized attempt to access portal. Redirecting to /login.');
      window.history.replaceState(null, '', '/login');
      setScreen('login', null, callback);
      return;
    }
    setScreen('portal', null, callback);
    return;
  }

  if (cleanPath === '/login') {
    if (user) {
      if (user.role === 'employee') {
        window.history.replaceState(null, '', '/portal');
        setScreen('portal', null, callback);
      } else {
        window.history.replaceState(null, '', '/admin');
        setScreen('admin', null, callback);
      }
      return;
    }
    setScreen('login', null, callback);
    return;
  }

  // Public Screens
  if (cleanPath === '/' || cleanPath === '') {
    setScreen('home', null, callback);
  } else if (cleanPath === '/about') {
    setScreen('about', null, callback);
  } else if (cleanPath === '/services') {
    setScreen('services', null, callback);
  } else if (cleanPath === '/projects') {
    const filterTerm = queryParams.get('filter');
    setScreen('projects', filterTerm, callback);
  } else if (cleanPath.startsWith('/projects/')) {
    const slug = cleanPath.split('/')[2];
    setScreen('caseStudy', slug, callback);
  } else if (cleanPath === '/contact') {
    setScreen('contact', null, callback);
  } else if (cleanPath === '/team' || cleanPath === '/team/') {
    setScreen('team', null, callback);
  } else if (cleanPath.startsWith('/team/')) {
    const slug = cleanPath.split('/')[2];
    if (!slug) {
      setScreen('team', null, callback);
    } else {
      setScreen('teamProfile', slug, callback);
    }
  } else if (cleanPath.startsWith('/brief/')) {
    const token = cleanPath.split('/')[2];
    setScreen('brief', token, callback);
  } else if (cleanPath === '/privacy') {
    setScreen('privacy', null, callback);
  } else if (cleanPath === '/terms') {
    setScreen('terms', null, callback);
  } else if (cleanPath === '/404') {
    setScreen('notFound', null, callback);
  } else {
    // Custom 404 Error Screen for all unmatched URLs
    setScreen('notFound', null, callback);
  }
}

export function ensureDeferredDomMounted() {
  let mountedAny = false;
  ['tpl-deferred-screens', 'tpl-deferred-modals'].forEach((tplId) => {
    const tpl = document.getElementById(tplId);
    if (tpl && tpl.content && tpl.parentNode) {
      tpl.parentNode.insertBefore(tpl.content, tpl);
      tpl.remove();
      mountedAny = true;
    }
  });
  if (mountedAny) {
    window.dispatchEvent(new CustomEvent('aurora:deferredDomMounted'));
  }
}

export function setScreen(screenId, param = null, callback) {
  if (screenId === 'brief' || screenId === 'login' || screenId === 'portal' || screenId === 'admin') {
    ensureDeferredDomMounted();
  }

  // Strict Guard: Never unhide protected screens without verified active session
  if (screenId === 'admin') {
    const user = getAuthenticatedUser();
    if (!user || (user.role !== 'super_admin' && user.role !== 'manager')) {
      window.history.replaceState(null, '', '/login');
      setScreen('login', null, callback);
      return;
    }
  }

  if (screenId === 'portal') {
    const user = getAuthenticatedUser();
    if (!user) {
      window.history.replaceState(null, '', '/login');
      setScreen('login', null, callback);
      return;
    }
  }

  currentScreen = screenId;
  currentParam = param;

  // Hide all screens
  document.querySelectorAll('.screen-view').forEach((s) => {
    s.style.display = 'none';
    s.classList.remove('active');
  });

  // Show target screen
  const targetId = screenId === 'notFound' ? 'screen-404' : `screen-${screenId}`;
  const target = document.getElementById(targetId);
  if (target) {
    target.style.display = 'block';
    target.classList.add('active');
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  // Header & Footer visibility rules:
  // Hide on standalone screens (brief, login, portal, admin)
  const isIsolated = ['brief', 'login', 'portal', 'admin'].includes(screenId);
  const header = document.getElementById('globalSiteHeader');
  const footer = document.getElementById('globalSiteFooter');

  if (header) header.style.display = isIsolated ? 'none' : 'block';
  if (footer) footer.style.display = (screenId === 'brief' || screenId === 'portal' || screenId === 'admin') ? 'none' : 'block';

  // Update active states on nav links
  document.querySelectorAll('.nav-link').forEach((link) => {
    const linkScreen = link.getAttribute('data-screen');
    link.classList.toggle('active', linkScreen === screenId);
  });

  // Update document title & canonical URL
  const routeMeta = routes[screenId];
  if (routeMeta) {
    document.title = routeMeta.title;

    let canonical = document.querySelector('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.rel = 'canonical';
      document.head.appendChild(canonical);
    }
    const cleanRoutePath = routeMeta.path.replace(':slug', param || '').replace(':token', param || '');
    canonical.href = `https://aurora-eg.ziadbahgat.me${cleanRoutePath === '/' ? '/' : cleanRoutePath}`;
  }

  if (typeof callback === 'function') {
    callback(screenId, param);
  }
}

export function getCurrentScreen() {
  return { screen: currentScreen, param: currentParam };
}
