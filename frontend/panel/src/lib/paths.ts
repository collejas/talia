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
  if (typeof window === 'undefined') return `${getLegacyPanelBasePath()}/auth/login.html`
  const base = getLegacyPanelBasePath()
  const target = `${base}/auth/login.html`
  const redirect = encodeURIComponent(
    `${window.location.pathname}${window.location.search}`,
  )
  return `${target}?redirect=${redirect}`
}
