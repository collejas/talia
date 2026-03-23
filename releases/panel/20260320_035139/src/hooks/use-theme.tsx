'use client'

import { useEffect, useState } from 'react'
import type { ThemeName } from '@/lib/theme'
import { getThemeFromStorage, setThemeClass, persistTheme } from '@/lib/theme'

export function useTheme() {
  const [theme, setTheme] = useState<ThemeName>(getThemeFromStorage)

  useEffect(() => {
    setThemeClass(theme)
    persistTheme(theme)
  }, [theme])

  return {
    theme,
    setTheme,
  }
}
