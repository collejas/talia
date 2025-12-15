"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"

import { cn } from "@/lib/utils"

type StageKey = "descubre" | "enriquecer" | "preparar" | "lanzar" | "evaluar"

type StageConfig = {
  key: StageKey
  label: string
  description: string
  href: string
  matches: string[]
}

const STAGES: StageConfig[] = [
  {
    key: "descubre",
    label: "Descubre",
    description: "Búsquedas en Google, DENUE y webscraper.",
    href: "/prospeccion/google-busqueda",
    matches: ["/prospeccion/google-busqueda", "/prospeccion/denue-busqueda", "/prospeccion/buscador"],
  },
  {
    key: "enriquecer",
    label: "Enriquecer",
    description: "Normaliza datos, verifica teléfonos y notas.",
    href: "/prospeccion/prospectos#enriquecer",
    matches: ["/prospeccion/prospectos"],
  },
  {
    key: "preparar",
    label: "Preparar",
    description: "Segmenta y convierte a contactos del CRM.",
    href: "/prospeccion/prospectos#preparar",
    matches: ["/prospeccion/prospectos"],
  },
  {
    key: "lanzar",
    label: "Lanzar",
    description: "Configura lotes de contacto y canales.",
    href: "/prospeccion/contactos",
    matches: ["/prospeccion/contactos"],
  },
  {
    key: "evaluar",
    label: "Evaluar",
    description: "Monitorea métricas y campañas recientes.",
    href: "/prospeccion/campanas",
    matches: ["/prospeccion/campanas", "/prospeccion/mensajes"],
  },
]

type StageSummaryResponse = {
  stages: Partial<Record<StageKey, number>>
}

export function ProspeccionStageNav() {
  const pathname = usePathname()
  const [summary, setSummary] = useState<Partial<Record<StageKey, number>>>({})
  const [loading, setLoading] = useState(true)
  const [hash, setHash] = useState<string>("")

  useEffect(() => {
    let cancelled = false
    const fetchSummary = async () => {
      setLoading(true)
      try {
        const response = await fetch("/api/prospeccion/stage-resumen", { cache: "no-store" })
        if (!response.ok) {
          throw new Error("stage_summary_failed")
        }
        const data = (await response.json()) as StageSummaryResponse
        if (!cancelled) {
          setSummary(data?.stages ?? {})
        }
      } catch {
        if (!cancelled) {
          setSummary({})
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }
    void fetchSummary()
    return () => {
      cancelled = true
    }
  }, [])

  const activeStage = useMemo(() => {
    if (pathname?.startsWith("/prospeccion/prospectos")) {
      return hash === "#preparar" ? "preparar" : "enriquecer"
    }
    return (
      STAGES.find((stage) => stage.matches.some((match) => pathname?.startsWith(match ?? "")))?.key ?? "descubre"
    )
  }, [pathname, hash])

  useEffect(() => {
    if (typeof window === "undefined") return
    const updateHash = () => {
      setHash(window.location.hash || "")
    }
    updateHash()
    window.addEventListener("hashchange", updateHash)
    return () => {
      window.removeEventListener("hashchange", updateHash)
    }
  }, [])

  return (
    <div className="rounded-2xl border bg-card p-4 shadow-sm">
      <div className="grid gap-3 md:grid-cols-5">
        {STAGES.map((stage) => {
          const isActive = stage.key === activeStage
          const value = summary[stage.key] ?? 0
          return (
            <Link key={stage.key} href={stage.href} className="group block focus:outline-none">
              <div
                className={cn(
                  "rounded-xl border p-4 transition hover:border-primary hover:bg-primary/5 focus-visible:ring-2 focus-visible:ring-offset-2",
                  isActive ? "border-primary bg-primary/5" : "border-transparent bg-muted/40",
                )}
              >
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {stage.label}
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-2xl font-bold">{loading ? "…" : value}</span>
                  <span className="text-xs text-muted-foreground">registros</span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">{stage.description}</p>
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
