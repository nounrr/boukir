/**
 * Thème clair / sombre / système. Le choix est mémorisé dans ce navigateur (clé ui.theme).
 * La classe `dark` est posée sur <html> ; un petit script dans index.html l'applique avant
 * le premier affichage pour éviter un flash blanc.
 */
export type ThemePreference = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'ui.theme';
const listeners = new Set<(pref: ThemePreference) => void>();

const media = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null);

export function getThemePreference(): ThemePreference {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    if (value === 'light' || value === 'dark' || value === 'system') return value;
  } catch { /* stockage indisponible */ }
  return 'light';
}

export function resolveTheme(pref: ThemePreference): 'light' | 'dark' {
  if (pref === 'system') return media()?.matches ? 'dark' : 'light';
  return pref;
}

export function applyTheme(pref: ThemePreference, animate = false) {
  const root = document.documentElement;
  const dark = resolveTheme(pref) === 'dark';
  if (animate) {
    root.classList.add('theme-switching');
    window.setTimeout(() => root.classList.remove('theme-switching'), 260);
  }
  root.classList.toggle('dark', dark);
  root.style.colorScheme = dark ? 'dark' : 'light';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0d1119' : '#1e3a8a');
}

export function setThemePreference(pref: ThemePreference) {
  try { localStorage.setItem(STORAGE_KEY, pref); } catch { /* stockage indisponible */ }
  applyTheme(pref, true);
  listeners.forEach((fn) => fn(pref));
}

export function subscribeTheme(fn: (pref: ThemePreference) => void) {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** À appeler une fois au démarrage : applique le thème et suit le réglage du système. */
export function initTheme() {
  applyTheme(getThemePreference());
  media()?.addEventListener?.('change', () => {
    if (getThemePreference() === 'system') applyTheme('system', true);
  });
  // Autre onglet : même choix partout.
  window.addEventListener('storage', (event) => {
    if (event.key === STORAGE_KEY) {
      const pref = getThemePreference();
      applyTheme(pref);
      listeners.forEach((fn) => fn(pref));
    }
  });
}
