import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import Module from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const dirname = path.dirname(fileURLToPath(import.meta.url))
const source = path.join(dirname, '../src/app/dashboard/page.tsx')
const compiled = ts.transpileModule(fs.readFileSync(source, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
}).outputText
let onboarding
let token = 'valid-user-token'
let requestOptions
const pageModule = new Module(source)
pageModule.filename = source
pageModule.paths = Module._nodeModulePaths(dirname)
const originalRequire = pageModule.require.bind(pageModule)
pageModule.require = (name) => {
  if (name === '@/lib/api/crm') return { callCrmApi: async (_path, options) => { requestOptions = options; return onboarding } }
  if (name === '@/lib/auth/server-session') return { resolveServerAccessToken: async () => token }
  if (name === '@/lib/auth/jwt') return { decodeJwtUserId: (value) => value === 'valid-user-token' ? 'user' : null }
  if (name === '@/lib/dashboard/range') return { resolveDashboardRange: () => ({}) }
  if (name === 'next/navigation') return { redirect: (url) => { throw new Error(`redirect:${url}`) } }
  if (name.startsWith('@/components/')) return new Proxy({}, { get: () => () => null })
  return originalRequire(name)
}
pageModule._compile(compiled, source)
const Page = pageModule.exports.default

test('usuario autenticado sin settings.view puede entrar al dashboard sin renovar por 403', async () => {
  token = 'valid-user-token'
  onboarding = { ok: false, status: 403, error: 'forbidden' }
  assert.ok(await Page({}))
  assert.equal(requestOptions.retryOnForbidden, false)
})

test('sesion invalida sigue redirigiendo al login', async () => {
  token = 'valid-user-token'
  onboarding = { ok: false, status: 401, error: 'auth_required' }
  await assert.rejects(Page({}), /redirect:\/auth\/login/)
  token = null
  await assert.rejects(Page({}), /redirect:\/auth\/login/)
})

test('onboarding incompleto sigue redirigiendo para usuarios autorizados', async () => {
  token = 'valid-user-token'
  onboarding = { ok: true, data: { requiere_onboarding: true, completado: false } }
  await assert.rejects(Page({}), /redirect:\/onboarding/)
})

test('errores de backend no se presentan como login invalido', async () => {
  token = 'valid-user-token'
  onboarding = { ok: false, status: 502, error: 'unavailable' }
  await assert.rejects(Page({}), /No se pudo consultar la configuración/)
})
