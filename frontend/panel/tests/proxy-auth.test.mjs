import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import Module from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { NextRequest } from 'next/server.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const source = path.join(__dirname, '../src/proxy.ts')
const compiled = ts.transpileModule(fs.readFileSync(source, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText
const proxyModule = new Module(source)
proxyModule.filename = source
proxyModule.paths = Module._nodeModulePaths(__dirname)
const originalRequire = proxyModule.require.bind(proxyModule)
proxyModule.require = (name) => {
  if (name === '@/lib/auth/cookies') return {
    ACCESS_TOKEN_COOKIE: 'talia.access_token', REFRESH_TOKEN_COOKIE: 'talia.refresh_token',
    SESSION_REMEMBER_COOKIE: 'talia.remember', TENANT_CONTEXT_COOKIE: 'talia.tenant_context',
    COOKIE_BASE_OPTIONS: { httpOnly: true, sameSite: 'lax', path: '/' },
  }
  if (name === '@/lib/auth/supabase') return { getSupabaseConfig: () => ({ url: 'https://auth.test', anonKey: 'public-test' }) }
  if (name === '@/lib/api/panel') return { getPanelApiBaseUrl: () => 'https://backend.test/api' }
  if (name === '@/lib/auth/master-tenant') return { MASTER_TENANT_ID: 'master', isMasterOnlyPath: (value) => value === '/visitas' }
  if (name === '@/lib/auth/tenant-context') return { parseTenantContextCookie: (value) => value ? JSON.parse(value) : null }
  return originalRequire(name)
}
proxyModule._compile(compiled, source)
const { proxy } = proxyModule.exports
const savedFetch = global.fetch
after(() => { global.fetch = savedFetch })

function request(pathname, cookies = '') {
  return new NextRequest(`https://panel.test${pathname}`, { headers: cookies ? { cookie: cookies } : {} })
}
function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } })
}

test('protege vistas sin sesion y preserva rutas publicas', async () => {
  global.fetch = () => { throw new Error('no debe consultar Auth') }
  const denied = await proxy(request('/contactos?x=1'))
  assert.equal(denied.status, 307)
  assert.equal(new URL(denied.headers.get('location')).searchParams.get('redirectTo'), '/contactos?x=1')
  for (const pathname of ['/auth/login', '/portal/enlace', '/webchat-landing', '/privacy-policy', '/webchat-widget.js']) {
    assert.equal((await proxy(request(pathname))).status, 200)
  }
})

test('un token falso no concede acceso y una falla de Auth cierra el acceso', async () => {
  global.fetch = async () => json({}, 403)
  assert.equal((await proxy(request('/contactos', 'talia.access_token=falso'))).status, 307)
  global.fetch = async () => { throw new Error('sin conexion') }
  assert.equal((await proxy(request('/contactos', 'talia.access_token=valido'))).status, 503)
})

test('acepta usuarios verificados y renueva las cookies en solicitud y respuesta', async () => {
  global.fetch = async (url) => String(url).includes('/token?')
    ? json({ access_token: 'nuevo-acceso', refresh_token: 'nuevo-refresh', user: { id: 'usuario' } })
    : json({}, 403)
  const result = await proxy(request('/contactos', 'talia.access_token=vencido; talia.refresh_token=refresh'))
  assert.equal(result.status, 200)
  assert.equal(result.cookies.get('talia.access_token').value, 'nuevo-acceso')
  assert.equal(result.cookies.get('talia.refresh_token').value, 'nuevo-refresh')
  assert.match(result.headers.get('x-middleware-request-cookie'), /talia.access_token=nuevo-acceso/)
  global.fetch = async () => json({ id: 'usuario' })
  assert.equal((await proxy(request('/contactos', 'talia.access_token=valido'))).status, 200)
})

test('valida la organizacion maestra en backend y conserva refresh si se deniega', async () => {
  global.fetch = async (url) => {
    if (String(url).includes('/auth/v1/user')) return json({}, 403)
    if (String(url).includes('/auth/v1/token')) return json({ access_token: 'nuevo', refresh_token: 'rotado', user: { id: 'usuario' } })
    return json({}, 403)
  }
  const result = await proxy(request('/visitas', 'talia.access_token=vencido; talia.refresh_token=refresh'))
  assert.equal(result.status, 307)
  assert.equal(new URL(result.headers.get('location')).pathname, '/unauthorized')
  assert.equal(result.cookies.get('talia.refresh_token').value, 'rotado')
})

test('solo autoriza vistas maestras cuando el backend confirma la organizacion', async () => {
  let tenantHeader = null
  global.fetch = async (url, options) => {
    if (String(url).includes('/auth/v1/user')) return json({ id: 'usuario' })
    tenantHeader = options.headers['X-Organizacion-Id']
    return json({ organizacion_id: tenantHeader || 'master' })
  }
  assert.equal((await proxy(request('/visitas', 'talia.access_token=valido'))).status, 200)
  const tenant = encodeURIComponent(JSON.stringify({ tenant_id: 'otro', user_id: 'usuario' }))
  const denied = await proxy(request('/visitas', `talia.access_token=valido; talia.tenant_context=${tenant}`))
  assert.equal(tenantHeader, 'otro')
  assert.equal(new URL(denied.headers.get('location')).pathname, '/unauthorized')
})
