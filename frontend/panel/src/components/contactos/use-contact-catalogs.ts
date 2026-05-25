"use client"

import { useEffect, useMemo, useState } from "react"

import type { ContactCatalogOption } from "@/components/contactos/contact-catalog-select"

type SessionResponse = {
  tenantConfig?: Record<string, unknown> | null
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function normalizeValues(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter(Boolean)
  }
  if (typeof value === "string") {
    return value
      .split(/\r?\n|,|;/)
      .map((item) => item.trim())
      .filter(Boolean)
  }
  return []
}

function valuesToOptions(values: string[]): ContactCatalogOption[] {
  const seen = new Set<string>()
  return values
    .map((value) => value.trim())
    .filter((value) => {
      if (!value || seen.has(value)) return false
      seen.add(value)
      return true
    })
    .map((value) => ({ value, label: value }))
}

export function useTenantContactCatalogs() {
  const [puestoOptions, setPuestoOptions] = useState<ContactCatalogOption[]>([])
  const [rolDecisionOptions, setRolDecisionOptions] = useState<ContactCatalogOption[]>([])
  const [clasificacionNegocioOptions, setClasificacionNegocioOptions] = useState<ContactCatalogOption[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const controller = new AbortController()

    const load = async () => {
      try {
        const response = await fetch("/api/session", {
          method: "GET",
          cache: "no-store",
          credentials: "same-origin",
          signal: controller.signal,
        })
        if (!response.ok) {
          setPuestoOptions([])
          setRolDecisionOptions([])
          setClasificacionNegocioOptions([])
          setLoading(false)
          return
        }
        const payload = (await response.json()) as SessionResponse
        const config = asRecord(payload.tenantConfig)
        const extras = config ? asRecord(config.extras) : null
        const catalogos = extras ? asRecord(extras.catalogos) : null
        const puestosRaw = catalogos ? catalogos.puesto ?? catalogos.puestos : null
        const rolesRaw =
          catalogos ? catalogos.rol_decision ?? catalogos.rol_decisiones ?? catalogos.roles_decision : null
        const clasificacionesRaw =
          catalogos ? catalogos.clasificacion_negocio ?? catalogos.clasificaciones_negocio : null
        setPuestoOptions(valuesToOptions(normalizeValues(puestosRaw)))
        setRolDecisionOptions(valuesToOptions(normalizeValues(rolesRaw)))
        setClasificacionNegocioOptions(valuesToOptions(normalizeValues(clasificacionesRaw)))
      } catch {
        if (controller.signal.aborted) return
        setPuestoOptions([])
        setRolDecisionOptions([])
        setClasificacionNegocioOptions([])
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false)
        }
      }
    }

    void load()

    return () => controller.abort()
  }, [])

  return useMemo(
    () => ({
      puestoOptions,
      rolDecisionOptions,
      clasificacionNegocioOptions,
      loading,
    }),
    [loading, puestoOptions, rolDecisionOptions, clasificacionNegocioOptions],
  )
}
