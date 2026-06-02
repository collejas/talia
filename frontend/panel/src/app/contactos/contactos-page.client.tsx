"use client"

import * as React from "react"

import { ContactSectionCards } from "@/components/contactos/section-cards"
import { ContactsDataTable } from "@/components/contactos/contacts-data-table"
import type { ContactFilters, ContactCards, ContactTableRow } from "@/lib/contactos/types"

type ContactosPageClientProps = {
  initialCards: ContactCards
  table: ContactTableRow[]
}

export default function ContactosPageClient({ initialCards, table }: ContactosPageClientProps) {
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
  const [visibleRows, setVisibleRows] = React.useState<ContactTableRow[]>(table)

  const handleFiltersChange = React.useCallback((nextFilters: ContactFilters) => {
    setFilters((prev) => (areFiltersEqual(prev, nextFilters) ? prev : nextFilters))
  }, [])

  const cards = React.useMemo(
    () => (isDefaultFilterSet(filters) ? initialCards : mapCardsFromRows(visibleRows)),
    [filters, initialCards, visibleRows],
  )

  return (
    <div className="space-y-4">
      <ContactSectionCards data={cards} />
      <ContactsDataTable
        data={table}
        onFiltersChange={handleFiltersChange}
        onVisibleRowsChange={setVisibleRows}
      />
    </div>
  )
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
    const captura = textValue(raw?.captura_estado).toLowerCase()
    const estado = textValue(raw?.estado).toLowerCase()
    if (captura === "completo") completos += 1
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
