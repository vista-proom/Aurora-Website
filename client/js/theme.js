/**
 * AURORA GROUP — THEME ENGINE (Light, Dark, System)
 * Per SRS v1.0 Section 2.2:
 * - Public site & Client Brief: Light default (Light/Dark toggle, no System)
 * - Operations portal & Admin: System default (Light/Dark/System selector)
 * - Theme switch uses a short fade animation, disabled under reduced-motion
 * - Global footer stays dark in both light and dark modes
 * - Prevents Flash of Unstyled Content (FOUC)
 */

const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
let currentTheme = (urlParams && (urlParams.get('theme') === 'dark' || urlParams.get('theme') === 'light'))
  ? urlParams.get('theme')
  : (typeof localStorage !== 'undefined' ? localStorage.getItem('aurora_theme') || 'light' : 'light');
let isSystemTheme = localStorage.getItem('aurora_theme_is_system') === 'true';

export function initTheme() {
  if (isSystemTheme) {
    applySystemTheme();
  } else {
    applyTheme(currentTheme);
  }

  // Listen to OS theme changes if in system mode
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    if (isSystemTheme) {
      applyTheme(e.matches ? 'dark' : 'light');
    }
  });
}

export function getTheme() {
  return currentTheme;
}

export function setTheme(theme, isSystem = false) {
  isSystemTheme = isSystem;
  localStorage.setItem('aurora_theme_is_system', isSystem ? 'true' : 'false');

  if (isSystem) {
    applySystemTheme();
  } else {
    currentTheme = theme;
    localStorage.setItem('aurora_theme', currentTheme);
    applyTheme(currentTheme);
  }
}

export function toggleTheme() {
  const nextTheme = currentTheme === 'light' ? 'dark' : 'light';
  setTheme(nextTheme, false);
  return nextTheme;
}

function applySystemTheme() {
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  currentTheme = prefersDark ? 'dark' : 'light';
  applyTheme(currentTheme);
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);

  // Update theme toggle UI elements
  const themeBtn = document.getElementById('themeToggleBtn');
  const themeIcon = document.getElementById('themeToggleIcon');
  const themeText = document.getElementById('themeToggleText');
  const footerToggle = document.getElementById('footerThemeToggle');

  // Next mode indicator
  const targetIcon = theme === 'light' ? '☾' : '☀';
  const targetLabel = theme === 'light' ? 'Dark' : 'Light';

  if (themeBtn) {
    themeBtn.setAttribute('aria-pressed', theme === 'dark' ? 'true' : 'false');
    themeBtn.setAttribute('aria-label', theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme');
  }
  if (themeIcon) themeIcon.textContent = targetIcon;
  document.querySelectorAll('.sub-theme-icon').forEach((el) => {
    el.textContent = targetIcon;
  });
  document.querySelectorAll('.sub-theme-label').forEach((el) => {
    el.textContent = theme === 'light' ? 'Dark Mode' : 'Light Mode';
  });
  document.querySelectorAll('.portal-theme-checkbox').forEach((cb) => {
    cb.checked = theme === 'dark';
  });
  document.querySelectorAll('.portal-theme-label').forEach((el) => {
    el.textContent = theme === 'dark' ? 'Dark Mode' : 'Light Mode';
  });
  if (themeText) themeText.textContent = targetLabel;
  if (footerToggle) {
    footerToggle.textContent = theme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode';
  }

  // Update segmented control buttons if present
  document.querySelectorAll('.theme-segment-btn').forEach((btn) => {
    const mode = btn.getAttribute('data-mode');
    if (isSystemTheme && mode === 'system') {
      btn.classList.add('active');
    } else if (!isSystemTheme && mode === theme) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
}
