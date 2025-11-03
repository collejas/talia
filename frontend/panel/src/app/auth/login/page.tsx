import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"

import { LoginForm } from "@/components/auth/LoginForm"
import { ThemeToggle } from "@/components/ThemeToggle"

export const metadata: Metadata = {
  title: "Iniciar sesión | Tal-IA Panel",
  description: "Accede al panel administrativo de Tal-IA con tus credenciales.",
}

type LoginPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

function extractRedirect(
  searchParams?: Record<string, string | string[] | undefined>,
) {
  if (!searchParams) return undefined
  const candidate = searchParams.redirectTo
  if (!candidate) return undefined
  if (Array.isArray(candidate)) {
    return typeof candidate[0] === "string" ? candidate[0] : undefined
  }
  return typeof candidate === "string" ? candidate : undefined
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined
  const redirectTo = extractRedirect(resolvedSearchParams)

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-surface text-foreground">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,_rgba(130,147,255,0.25),transparent_55%),radial-gradient(circle_at_bottom,_rgba(255,170,196,0.2),transparent_55%)]"
      />
      <header className="flex items-center justify-between px-6 py-6 sm:px-10">
        <Link href="/" className="flex items-center gap-3 text-sm font-semibold">
          <Image
            src="/assets/logos/Logo8.png"
            alt="Tal-IA"
            width={44}
            height={44}
            className="rounded-xl border border-border/50 bg-surface-alt p-2 shadow-panel-soft"
            priority
          />
          <span className="hidden text-base text-muted-foreground sm:inline">tal-ia.mx</span>
        </Link>
        <Link
          href="/"
          className="hidden text-sm font-medium text-muted-foreground underline-offset-4 hover:underline sm:inline"
        >
          Regresar a inicio
        </Link>
      </header>

      <main className="flex flex-1 flex-col-reverse items-center gap-12 px-6 pb-10 sm:px-10 md:flex-row md:items-stretch md:justify-center md:pb-16">
        <section className="flex w-full max-w-lg flex-col justify-between gap-10 rounded-3xl border border-border/40 bg-surface-alt/80 p-8 shadow-panel-soft backdrop-blur-sm md:h-auto md:max-w-sm lg:max-w-md">
          <div className="space-y-4">
            <span className="inline-flex items-center rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-primary">
              Webchat Tal-IA
            </span>
            <h1 className="text-3xl font-semibold leading-tight md:text-4xl">
              Todo tu panel en un solo lugar
            </h1>
            <p className="text-base leading-relaxed text-muted-foreground">
              Monitorea conversaciones, visitas y embudos con análisis en tiempo real. Configura alertas,
              segmenta audiencias y coordina al equipo sin salir del panel.
            </p>
          </div>
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <div className="flex flex-col">
              <span className="font-semibold text-foreground">Soporte 24/7</span>
              <span>Equipo Tal-IA listo para ayudarte.</span>
            </div>
          </div>
        </section>

        <section className="flex w-full justify-center md:max-w-md">
          <LoginForm redirectTo={redirectTo} />
        </section>
      </main>

      <ThemeToggle />
    </div>
  )
}
