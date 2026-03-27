'use client'

const STORAGE_KEY = 'talia.theme.v1'
const DEFAULT_THEME = 'classic'

const THEMES = [
  { value: 'classic', label: 'Clásico' },
  { value: 'aurora', label: 'Aurora' },
  { value: 'ice', label: 'Ice' },
  { value: 'void', label: 'Void' },
] as const

type ThemeTuple = typeof THEMES[number]
export type ThemeName = ThemeTuple['value']

export const themeOptions = THEMES

export function getThemeFromStorage(): ThemeName {
  if (typeof window === 'undefined') return DEFAULT_THEME
  const stored = window.localStorage.getItem(STORAGE_KEY)
  if (stored && THEMES.some((entry) => entry.value === stored)) {
    return stored as ThemeName
  }
  return DEFAULT_THEME
}

export function setThemeClass(theme: ThemeName) {
  if (typeof document === 'undefined') return
  const body = document.body
  THEMES.forEach((entry) => body.classList.remove(`theme-${entry.value}`))
  body.classList.add(`theme-${theme}`)
}

export function persistTheme(theme: ThemeName) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(STORAGE_KEY, theme)
}

export function initializeTheme() {
  const theme = getThemeFromStorage()
  setThemeClass(theme)
}
