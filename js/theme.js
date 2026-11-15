// @ts-check
// Light (default) / dark theme switch. index.html applies the saved theme
// before first paint; this module reads and changes it.

const KEY = 'vt.theme';
const BAR_COLOR = { light: '#ffffff', dark: '#0c1616' };

/** @returns {'light' | 'dark'} */
export function getTheme() {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

/** @param {'light' | 'dark'} theme */
export function setTheme(theme) {
  if (theme === 'dark') document.documentElement.dataset.theme = 'dark';
  else delete document.documentElement.dataset.theme;
  const meta = /** @type {HTMLMetaElement | null} */ (document.querySelector('meta[name="theme-color"]'));
  if (meta) meta.content = BAR_COLOR[theme];
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    /* ignore – theme just won't be remembered */
  }
}
