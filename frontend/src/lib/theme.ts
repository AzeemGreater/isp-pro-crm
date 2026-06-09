export type ThemeMode = 'light' | 'dark' | 'system'

export const THEME_STORAGE_KEY = 'crm_theme_mode'

function getSystemTheme(): 'light' | 'dark' {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function getStoredThemeMode(): ThemeMode {
  const stored = localStorage.getItem(THEME_STORAGE_KEY)
  if (stored === 'light' || stored === 'dark' || stored === 'system') {
    return stored
  }
  return 'system'
}

export function resolveTheme(mode: ThemeMode): 'light' | 'dark' {
  return mode === 'system' ? getSystemTheme() : mode
}

export function applyTheme(mode: ThemeMode): void {
  const resolved = resolveTheme(mode)
  document.documentElement.classList.toggle('dark', resolved === 'dark')
  document.documentElement.setAttribute('data-theme-mode', mode)
}

export function setThemeMode(mode: ThemeMode): void {
  localStorage.setItem(THEME_STORAGE_KEY, mode)
  applyTheme(mode)
}

export function initializeTheme(): void {
  applyTheme(getStoredThemeMode())
}
