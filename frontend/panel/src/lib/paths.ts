function safePathname(): string {
  if (typeof window === 'undefined') return ''
  try {
    return window.location.pathname || ''
  } catch {
    return ''
  }
}

export function getLegacyPanelBasePath(): string {
  const pathname = safePathname()
  if (pathname.startsWith('/api/panel')) return '/api/panel'
  return '/panel'
}

export function getSpaBasePath(): string {
  const pathname = safePathname()
  if (pathname.startsWith('/api/panel-react')) return '/api/panel-react'
  return '/panel-react'
}

export function buildLoginUrl(): string {
  const spaBase = getSpaBasePath()
  if (typeof window === 'undefined') return `${spaBase}/auth/login`
  const redirect = encodeURIComponent(
    `${window.location.pathname}${window.location.search}${window.location.hash}`,
  )
  return `${spaBase}/auth/login?redirect=${redirect}`
}
