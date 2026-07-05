"use client"

import { useEffect, useMemo, useState } from "react"

import type { ContactCatalogOption } from "@/components/contactos/contact-catalog-select"
import { usePermissions } from "@/hooks/use-permissions"

type CatalogsResponse = {
  catalogos?: Record<string, unknown> | null
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
  const { context: permissionContext } = usePermissions()
  const tenantKey = permissionContext.organizacion_id?.trim() || "unknown"
  const [puestoOptions, setPuestoOptions] = useState<ContactCatalogOption[]>([])
  const [rolDecisionOptions, setRolDecisionOptions] = useState<ContactCatalogOption[]>([])
  const [clasificacionNegocioOptions, setClasificacionNegocioOptions] = useState<ContactCatalogOption[]>([])
  const [tamanoOptions, setTamanoOptions] = useState<ContactCatalogOption[]>([])
  const [usoCfdiOptions, setUsoCfdiOptions] = useState<ContactCatalogOption[]>([])
  const [formaPagoOptions, setFormaPagoOptions] = useState<ContactCatalogOption[]>([])
  const [metodoPagoOptions, setMetodoPagoOptions] = useState<ContactCatalogOption[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const controller = new AbortController()

    const load = async () => {
      setLoading(true)
      try {
        const response = await fetch("/api/personas/catalogos/config", {
          method: "GET",
          cache: "no-store",
          credentials: "same-origin",
          signal: controller.signal,
        })
        if (!response.ok) {
          setPuestoOptions([])
          setRolDecisionOptions([])
          setClasificacionNegocioOptions([])
          setTamanoOptions([])
          setUsoCfdiOptions([])
          setFormaPagoOptions([])
          setMetodoPagoOptions([])
          setLoading(false)
          return
        }
        const payload = (await response.json()) as CatalogsResponse
        const catalogos = asRecord(payload.catalogos)
        const puestosRaw = catalogos ? catalogos.puesto ?? catalogos.puestos : null
        const rolesRaw =
          catalogos ? catalogos.rol_decision ?? catalogos.rol_decisiones ?? catalogos.roles_decision : null
        const clasificacionesRaw =
          catalogos ? catalogos.clasificacion_negocio ?? catalogos.clasificaciones_negocio : null
        const tamanosRaw = catalogos ? catalogos.tamano ?? catalogos.tamanos : null
        const usoCfdiRaw = catalogos ? catalogos.uso_cfdi ?? catalogos.usos_cfdi : null
        const formaPagoRaw = catalogos ? catalogos.forma_pago ?? catalogos.formas_pago : null
        const metodoPagoRaw = catalogos ? catalogos.metodo_pago ?? catalogos.metodos_pago : null
        setPuestoOptions(valuesToOptions(normalizeValues(puestosRaw)))
        setRolDecisionOptions(valuesToOptions(normalizeValues(rolesRaw)))
        setClasificacionNegocioOptions(valuesToOptions(normalizeValues(clasificacionesRaw)))
        setTamanoOptions(valuesToOptions(normalizeValues(tamanosRaw)))
        setUsoCfdiOptions(valuesToOptions(normalizeValues(usoCfdiRaw)))
        setFormaPagoOptions(valuesToOptions(normalizeValues(formaPagoRaw)))
        setMetodoPagoOptions(valuesToOptions(normalizeValues(metodoPagoRaw)))
      } catch {
        if (controller.signal.aborted) return
        setPuestoOptions([])
        setRolDecisionOptions([])
        setClasificacionNegocioOptions([])
        setTamanoOptions([])
        setUsoCfdiOptions([])
        setFormaPagoOptions([])
        setMetodoPagoOptions([])
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false)
        }
      }
    }

    setPuestoOptions([])
    setRolDecisionOptions([])
    setClasificacionNegocioOptions([])
    setTamanoOptions([])
    setUsoCfdiOptions([])
    setFormaPagoOptions([])
    setMetodoPagoOptions([])
    void load()

    return () => controller.abort()
  }, [tenantKey])

  return useMemo(
    () => ({
      puestoOptions,
      rolDecisionOptions,
      clasificacionNegocioOptions,
      tamanoOptions,
      usoCfdiOptions,
      formaPagoOptions,
      metodoPagoOptions,
      loading,
    }),
    [loading, puestoOptions, rolDecisionOptions, clasificacionNegocioOptions, tamanoOptions, usoCfdiOptions, formaPagoOptions, metodoPagoOptions],
  )
}
