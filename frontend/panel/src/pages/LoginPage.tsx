import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { getSupabaseClient } from '@/lib/supabase'
import { getSpaBasePath } from '@/lib/paths'

function sanitizeRedirect(raw?: string | null): string {
  if (!raw) return '/visitas'
  try {
    const url = new URL(raw, window.location.origin)
    // Evita open redirect: solo permitimos navegar dentro del basename
    const allowedBase = getSpaBasePath() || '/panel-react'
    if (!url.pathname.startsWith(allowedBase)) {
      return '/visitas'
    }
    const relative = url.pathname.replace(allowedBase, '') || '/'
    return `${relative}${url.search}${url.hash}`
  } catch {
    return '/visitas'
  }
}

export function LoginPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const redirectTo = useMemo(
    () => sanitizeRedirect(searchParams.get('redirect')),
    [searchParams],
  )

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    document.body.classList.add('theme-aurora')
    return () => {
      document.body.classList.remove('theme-aurora')
    }
  }, [])

  const supabase = useMemo(() => {
    try {
      return getSupabaseClient()
    } catch (error) {
      console.error('[login] Supabase no configurado', error)
      setMessage('Configura SUPABASE_URL y SUPABASE_ANON_KEY')
      return null
    }
  }, [])

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!supabase) return
    if (!email.trim() || !password.trim()) {
      setMessage('Completa usuario y contraseña')
      return
    }
    setLoading(true)
    setMessage('Ingresando...')
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      })
      if (error) {
        setMessage(error.message || 'Error de autenticación')
        return
      }
      setMessage('Listo, redirigiendo...')
      navigate(redirectTo, { replace: true })
    } catch (error) {
      console.error('[login] error', error)
      setMessage('Error de red al iniciar sesión')
    } finally {
      setLoading(false)
    }
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      const form = event.currentTarget.form
      form?.dispatchEvent(
        new Event('submit', { bubbles: true, cancelable: true }),
      )
    }
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="container mx-auto flex max-w-md flex-col gap-8 px-6 py-20">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="flex items-center gap-3">
            <img
              src="/api/shared/logos/Logo8.png"
              alt="TalIA logo"
              className="h-16 w-16"
            />
            <span className="text-3xl font-bold tracking-tight">
              Tal-<span className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">IA</span>
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            Conecta con tus métricas y conversaciones desde cualquier dispositivo.
          </p>
        </div>

        <Card className="border-border bg-surface shadow-panel-soft">
          <CardHeader>
            <CardTitle className="text-2xl font-semibold">Accede a tu panel</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
              <Input
                type="email"
                placeholder="Email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              onKeyDown={handleKeyDown}
              className="border-border bg-surface-alt text-foreground"
              disabled={loading}
              autoFocus
              required
            />
            <Input
              type="password"
              placeholder="Contraseña"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              onKeyDown={handleKeyDown}
              className="border-border bg-surface-alt text-foreground"
              disabled={loading}
              required
            />
            <Button type="submit" disabled={loading}>
              {loading ? 'Ingresando...' : 'Ingresar'}
            </Button>
            {message && (
              <p className="text-sm text-muted-foreground" role="status">
                {message}
              </p>
            )}
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
