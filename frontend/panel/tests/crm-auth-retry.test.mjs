import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import Module from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const dirname = path.dirname(fileURLToPath(import.meta.url))
const source = path.join(dirname, '../src/lib/api/crm.ts')
const compiled = ts.transpileModule(fs.readFileSync(source, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText
let forcedRefreshes = 0
const crmModule = new Module(source)
crmModule.filename = source
crmModule.paths = Module._nodeModulePaths(dirname)
const originalRequire = crmModule.require.bind(crmModule)
crmModule.require = (name) => {
  if (name === 'next/headers') return { cookies: async () => ({ get: () => undefined }) }
  if (name === '@/lib/api/panel') return { getPanelApiBaseUrl: () => 'https://backend.test/api' }
  if (name === '@/lib/auth/cookies') return { ACCESS_TOKEN_COOKIE: 'access', TENANT_CONTEXT_COOKIE: 'tenant' }
  if (name === '@/lib/auth/jwt') return { decodeJwtOrganizacionId: () => 'org', decodeJwtUserId: () => 'user', decodeJwtPayload: () => ({ role: 'authenticated' }) }
  if (name === '@/lib/auth/tenant-context') return { parseTenantContextCookie: () => null }
  if (name === '@/lib/auth/panel-token') return { resolvePanelApiToken: async () => 'user-token' }
  if (name === '@/lib/auth/server-session') return { resolveServerAccessToken: async (options) => { if (options?.forceRefresh) forcedRefreshes += 1; return 'user-token' } }
  return originalRequire(name)
}
crmModule._compile(compiled, source)
const { callCrmApi } = crmModule.exports
const savedFetch = global.fetch
after(() => { global.fetch = savedFetch })

test('onboarding 403 no intenta renovar la sesion cuando se desactiva el reintento', async () => {
  forcedRefreshes = 0
  let requests = 0
  global.fetch = async () => { requests += 1; return Response.json({ detail: 'forbidden' }, { status: 403 }) }
  const result = await callCrmApi('/tenant/me/onboarding', { withUserToken: true, retryOnForbidden: false })
  assert.equal(result.ok, false)
  assert.equal(result.status, 403)
  assert.equal(requests, 1)
  assert.equal(forcedRefreshes, 0)
})

test('un 401 todavia intenta renovar la sesion', async () => {
  forcedRefreshes = 0
  global.fetch = async () => Response.json({ detail: 'auth_required' }, { status: 401 })
  const result = await callCrmApi('/tenant/me/onboarding', { withUserToken: true, retryOnForbidden: false })
  assert.equal(result.status, 401)
  assert.equal(forcedRefreshes, 1)
})
