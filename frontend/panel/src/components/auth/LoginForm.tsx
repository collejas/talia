"use client"

import { useMemo, useState } from "react"
import { Loader2, LockKeyhole, Mail } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type LoginFields = {
  email: string
  password: string
  rememberMe: boolean
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase()
}

type LoginFormProps = {
  redirectTo?: string
}

export function LoginForm({ redirectTo }: LoginFormProps) {
  const [fields, setFields] = useState<LoginFields>({
    email: "",
    password: "",
    rememberMe: true,
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isDisabled = useMemo(() => {
    return !fields.email || !fields.password || isSubmitting
  }, [fields.email, fields.password, isSubmitting])

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isDisabled) return

    setIsSubmitting(true)
    setError(null)

    try {
      const payload = {
        email: normalizeEmail(fields.email),
        password: fields.password,
        rememberMe: fields.rememberMe,
        redirectTo,
      }

      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null
        const errorMessage = body?.error || "Credenciales inválidas. Intenta nuevamente."
        setError(errorMessage)
        return
      }

      const data = (await response.json()) as { redirectTo?: string }
      window.location.replace(data.redirectTo || "/dashboard")
    } catch (err) {
      console.error("[login] unexpected error", err)
      setError("No se pudo iniciar sesión. Intenta nuevamente.")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Card className="w-full max-w-[420px] border-border/60 bg-surface/95 backdrop-blur-sm">
      <CardHeader className="gap-4">
        <div className="flex items-center gap-3 text-primary">
          <span className="inline-flex size-11 items-center justify-center rounded-full border border-primary/20 bg-primary/10">
            <LockKeyhole className="size-5" />
          </span>
          <div className="flex flex-col text-left">
            <CardTitle className="text-xl">Inicia sesión</CardTitle>
            <CardDescription className="text-sm">
              Accede con tus credenciales para continuar al panel de control.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <form className="space-y-5" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="email" className="flex items-center gap-2 text-sm font-medium">
              <Mail className="size-4 text-muted-foreground" />
              Correo electrónico
            </Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              inputMode="email"
              placeholder="tucorreo@tal-ia.mx"
              value={fields.email}
              onChange={(event) =>
                setFields((prev) => ({
                  ...prev,
                  email: event.target.value,
                }))
              }
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password" className="text-sm font-medium">
              Contraseña
            </Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={fields.password}
              onChange={(event) =>
                setFields((prev) => ({
                  ...prev,
                  password: event.target.value,
                }))
              }
              required
            />
          </div>
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <Checkbox
                checked={fields.rememberMe}
                onCheckedChange={(checked) =>
                  setFields((prev) => ({
                    ...prev,
                    rememberMe: checked === true,
                  }))
                }
                aria-label="Recordarme"
              />
              Recordarme
            </label>
            <a
              href="mailto:soporte@tal-ia.mx?subject=Recuperar%20acceso%20al%20panel"
              className="text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              ¿Olvidaste tu contraseña?
            </a>
          </div>
          {error ? (
            <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <Button
            type="submit"
            className="w-full"
            disabled={isDisabled}
            aria-disabled={isDisabled}
          >
            {isSubmitting ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="size-4 animate-spin" />
                Validando credenciales...
              </span>
            ) : (
              "Ingresar"
            )}
          </Button>
        </form>
      </CardContent>
      <CardFooter className="flex flex-col items-start gap-2 text-sm text-muted-foreground">
        <span>
          ¿No tienes acceso?{" "}
          <a
            href="mailto:soporte@tal-ia.mx?subject=Alta%20de%20usuario%20en%20Tal-IA"
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            Contacta al administrador
          </a>
        </span>
      </CardFooter>
    </Card>
  )
}
