"use client"

import * as React from "react"

import { ContactSectionCards } from "@/components/contactos/section-cards"
import { ContactsDataTable } from "@/components/contactos/contacts-data-table"
import { SessionRecovery } from "@/components/session-recovery"
import type { ContactFilters, ContactCards, ContactTableRow } from "@/lib/contactos/types"

type ContactosPageClientProps = {
  table?: ContactTableRow[]
}

export default function ContactosPageClient({ table = [] }: ContactosPageClientProps) {
  const [filters, setFilters] = React.useState<ContactFilters>({
    search: "",
    owner: "all",
    createdFrom: "",
    createdTo: "",
    advanced: {
      origen: "",
      puesto: "",
      rolDecision: "",
      estadoContacto: "",
      captura: "all",
      ligado: "all",
      tipoCuenta: "",
      tamano: "",
      clasificacion: "",
      fechaCreacionCuentaFrom: "",
      fechaCreacionCuentaTo: "",
      fechaIncorporacionFrom: "",
      fechaIncorporacionTo: "",
      fusionada: "all",
      pais: "",
      estadoDireccion: "",
      municipio: "",
    },
  })
  const [tableRows, setTableRows] = React.useState<ContactTableRow[]>(table)
  const [visibleRows, setVisibleRows] = React.useState<ContactTableRow[]>(table)
  const [loadingTable, setLoadingTable] = React.useState(true)
  const [errors, setErrors] = React.useState<string[]>([])

  const handleFiltersChange = React.useCallback((nextFilters: ContactFilters) => {
    setFilters((prev) => (areFiltersEqual(prev, nextFilters) ? prev : nextFilters))
  }, [])

  const handleContactsDeleted = React.useCallback((keys: string[]) => {
    const normalizedKeys = new Set(keys.map((key) => key.trim()).filter(Boolean))
    if (!normalizedKeys.size) return
    const matchesDeleted = (row: ContactTableRow) => {
      const raw = row.raw as Record<string, unknown> | undefined
      const rowKeys = [
        typeof raw?.codigo_contacto === "string" ? raw.codigo_contacto.trim() : "",
        typeof raw?.contacto_id === "string" ? raw.contacto_id.trim() : "",
        typeof raw?.id === "string" ? raw.id.trim() : "",
      ].filter(Boolean)
      return rowKeys.some((key) => normalizedKeys.has(key))
    }

    setTableRows((current) => current.filter((row) => !matchesDeleted(row)))
    setVisibleRows((current) => current.filter((row) => !matchesDeleted(row)))
  }, [])

  React.useEffect(() => {
    const controller = new AbortController()
    let alive = true

    const loadTable = async () => {
      setLoadingTable(true)
      try {
        const pageSize = 500
        let offset = 0
        let accumulated: ContactTableRow[] = []
        let totalRows: number | null = null

        while (true) {
          const response = await fetch(`/api/contactos/list?limit=${pageSize}&offset=${offset}`, {
            cache: "no-store",
            signal: controller.signal,
          })
          if (!response.ok) {
            const body = (await response.json().catch(() => ({}))) as { error?: string }
            throw new Error(body.error || `Error ${response.status}`)
          }
          const body = (await response.json()) as { items?: ContactTableRow[]; totalRows?: number }
          const nextRows = Array.isArray(body.items) ? body.items : []
          if (totalRows === null && typeof body.totalRows === "number") {
            totalRows = body.totalRows
          }
          accumulated = accumulated.concat(nextRows)
          if (nextRows.length < pageSize) break
          if (typeof totalRows === "number" && accumulated.length >= totalRows) break
          offset += pageSize
        }

        if (alive) {
          setTableRows(accumulated)
          setVisibleRows(accumulated)
        }
      } catch (error) {
        if ((error as Error).name !== "AbortError" && alive) {
          setErrors((current) => [...current, error instanceof Error ? error.message : "No se pudo cargar el listado de contactos."])
        }
      } finally {
        if (alive) setLoadingTable(false)
      }
    }

    void loadTable()

    return () => {
      alive = false
      controller.abort()
    }
  }, [])

  const derivedCards = React.useMemo(() => {
    if (!isDefaultFilterSet(filters)) {
      return mapCardsFromRows(visibleRows)
    }
    return mapCardsFromRows(tableRows)
  }, [filters, tableRows, visibleRows])

  return (
    <div className="space-y-4">
      <SessionRecovery errors={errors} />
      {errors.length ? (
        <div className="px-4 lg:px-6">
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            <p className="font-medium">No se pudieron cargar todos los datos:</p>
            <ul className="list-disc pl-5">
              {errors.map((message, index) => (
                <li key={index}>{sanitizeMessage(message)}</li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
      <ContactSectionCards data={derivedCards} loading={loadingTable} />
      <ContactsDataTable
        data={tableRows}
        onFiltersChange={handleFiltersChange}
        onVisibleRowsChange={setVisibleRows}
        onContactsDeleted={handleContactsDeleted}
        loading={loadingTable}
      />
    </div>
  )
}

function sanitizeMessage(message: string) {
  const trimmed = message.trim()
  if (trimmed.startsWith("<!DOCTYPE") || trimmed.startsWith("<html")) {
    return "El endpoint devolvió HTML en lugar de JSON (verifica la ruta o el proxy)."
  }
  if (/jwt\s+expired/i.test(trimmed)) {
    return "Tu sesión en Supabase caducó. Estamos intentando renovarla automáticamente; si persiste, vuelve a iniciar sesión."
  }
  return trimmed
}

function isDefaultFilterSet(filters: ContactFilters): boolean {
  const advanced = filters.advanced;
  return (
    !filters.search.trim() &&
    filters.owner === "all" &&
    !filters.createdFrom.trim() &&
    !filters.createdTo.trim() &&
    !advanced.origen.trim() &&
    !advanced.puesto.trim() &&
    !advanced.rolDecision.trim() &&
    !advanced.estadoContacto.trim() &&
    advanced.captura === "all" &&
    advanced.ligado === "all" &&
    !advanced.tipoCuenta.trim() &&
    !advanced.tamano.trim() &&
    !advanced.clasificacion.trim() &&
    !advanced.fechaCreacionCuentaFrom.trim() &&
    !advanced.fechaCreacionCuentaTo.trim() &&
    !advanced.fechaIncorporacionFrom.trim() &&
    !advanced.fechaIncorporacionTo.trim() &&
    advanced.fusionada === "all" &&
    !advanced.pais.trim() &&
    !advanced.estadoDireccion.trim() &&
    !advanced.municipio.trim()
  )
}

function mapCardsFromRows(rows: ContactTableRow[]): ContactCards {
  if (!rows.length) {
    return {
      total: 0,
      completos: 0,
      incompletos: 0,
      activos: 0,
      leads: 0,
      propietarios: 0,
      topPropietarioNombre: null,
      topPropietarioTotal: 0,
      ultimo: null,
    }
  }

  const ownerSet = new Set<string>()
  const ownerCounts = new Map<string, { label: string; count: number }>()
  let completos = 0
  let incompletos = 0
  let activos = 0
  let leads = 0
  let ultimo: number | null = null

  for (const row of rows) {
    const raw = row.raw as Record<string, unknown> | undefined
    const estado = textValue(raw?.estado).toLowerCase()
    if (isCaptureComplete(raw)) completos += 1
    else incompletos += 1
    if (estado === "activo") activos += 1
    if (estado === "lead") leads += 1
    const ownerId = textValue(raw?.propietario_id)
    const ownerName = textValue(raw?.propietario_nombre)
    if (ownerId) {
      ownerSet.add(ownerId)
      const current = ownerCounts.get(ownerId)
      ownerCounts.set(ownerId, {
        label: ownerName || ownerId,
        count: (current?.count ?? 0) + 1,
      })
    }
    const createdAtRaw = textValue(raw?.creado_en)
    const createdAt = createdAtRaw ? Date.parse(createdAtRaw) : NaN
    if (!Number.isNaN(createdAt) && (ultimo === null || createdAt > ultimo)) {
      ultimo = createdAt
    }
  }

  const topOwner = Array.from(ownerCounts.values()).sort((left, right) => {
    if (right.count !== left.count) return right.count - left.count
    return left.label.localeCompare(right.label, "es")
  })[0]

  return {
    total: rows.length,
    completos,
    incompletos,
    activos,
    leads,
    propietarios: ownerSet.size,
    topPropietarioNombre: topOwner?.label ?? null,
    topPropietarioTotal: topOwner?.count ?? 0,
    ultimo: ultimo ? new Date(ultimo).toISOString() : null,
  }
}

function textValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim()
}

function isCaptureComplete(raw: Record<string, unknown> | undefined): boolean {
  if (!raw) return false
  return [
    textValue(raw.cuenta_tipo) || textValue(raw.tipo),
    textValue(raw.tamano),
    textValue(raw.tipo_establecimiento),
    textValue(raw.estado),
    textValue(raw.origen),
    textValue(raw.puesto),
    textValue(raw.rol_decision),
    textValue(raw.area),
  ].every(Boolean)
}

function areFiltersEqual(left: ContactFilters, right: ContactFilters): boolean {
  return (
    left.search === right.search &&
    left.owner === right.owner &&
    left.createdFrom === right.createdFrom &&
    left.createdTo === right.createdTo &&
    left.advanced.origen === right.advanced.origen &&
    left.advanced.puesto === right.advanced.puesto &&
    left.advanced.rolDecision === right.advanced.rolDecision &&
    left.advanced.estadoContacto === right.advanced.estadoContacto &&
    left.advanced.captura === right.advanced.captura &&
    left.advanced.ligado === right.advanced.ligado &&
    left.advanced.tipoCuenta === right.advanced.tipoCuenta &&
    left.advanced.tamano === right.advanced.tamano &&
    left.advanced.clasificacion === right.advanced.clasificacion &&
    left.advanced.fechaCreacionCuentaFrom === right.advanced.fechaCreacionCuentaFrom &&
    left.advanced.fechaCreacionCuentaTo === right.advanced.fechaCreacionCuentaTo &&
    left.advanced.fechaIncorporacionFrom === right.advanced.fechaIncorporacionFrom &&
    left.advanced.fechaIncorporacionTo === right.advanced.fechaIncorporacionTo &&
    left.advanced.fusionada === right.advanced.fusionada &&
    left.advanced.pais === right.advanced.pais &&
    left.advanced.estadoDireccion === right.advanced.estadoDireccion &&
    left.advanced.municipio === right.advanced.municipio
  )
}
