import { useEffect, useMemo, useState } from 'react'

export type ThemeValue = 'theme-aurora' | 'theme-ice' | 'theme-void'

type ThemeOption = {
  value: ThemeValue
  label: string
  themeColor: string
}

const STORAGE_KEY = 'talia-panel-theme'

export const THEME_OPTIONS: ThemeOption[] = [
  {
    value: 'theme-aurora',
    label: 'Aurora violeta',
    themeColor: '#060414',
  },
  {
    value: 'theme-ice',
    label: 'Espectro vibrante',
    themeColor: '#fdf4ff',
  },
  {
    value: 'theme-void',
    label: 'Nocturno',
    themeColor: '#050505',
  },
]

function safeLocalStorageGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function safeLocalStorageSet(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    /* ignore */
  }
}

function getInitialTheme(): ThemeValue {
  if (typeof document === 'undefined') {
    return 'theme-aurora'
  }
  const stored = safeLocalStorageGet(STORAGE_KEY) as ThemeValue | null
  if (stored && THEME_OPTIONS.some((opt) => opt.value === stored)) {
    return stored
  }
  const current = Array.from(document.body.classList).find((cls) =>
    THEME_OPTIONS.some((opt) => opt.value === cls as ThemeValue),
  )
  if (current) {
    return current as ThemeValue
  }
  return 'theme-aurora'
}

function applyTheme(theme: ThemeValue) {
  if (typeof document === 'undefined') return
  const body = document.body
  const classes = THEME_OPTIONS.map((opt) => opt.value)
  body.classList.remove(...classes)
  body.classList.add(theme)
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) {
    const themeConfig = THEME_OPTIONS.find((opt) => opt.value === theme)
    if (themeConfig) {
      meta.setAttribute('content', themeConfig.themeColor)
    }
  }
  safeLocalStorageSet(STORAGE_KEY, theme)
}

export function useTheme() {
  const [theme, setTheme] = useState<ThemeValue>(() => getInitialTheme())

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  const options = useMemo(() => THEME_OPTIONS, [])

  return {
    theme,
    setTheme,
    options,
  }
}
