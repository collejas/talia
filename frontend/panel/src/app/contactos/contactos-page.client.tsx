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
  return (
    !filters.search.trim() &&
    filters.owner === "all" &&
    !filters.createdFrom.trim() &&
    !filters.createdTo.trim()
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
      webchat: 0,
      propietarios: 0,
      ultimo: null,
    }
  }

  const ownerSet = new Set<string>()
  let completos = 0
  let incompletos = 0
  let activos = 0
  let leads = 0
  let webchat = 0
  let ultimo: number | null = null

  for (const row of rows) {
    const raw = row.raw as Record<string, unknown> | undefined
    const captura = textValue(raw?.captura_estado).toLowerCase()
    const estado = textValue(raw?.estado).toLowerCase()
    const origen = textValue(raw?.origen).toLowerCase()
    if (captura === "completo") completos += 1
    else incompletos += 1
    if (estado === "activo") activos += 1
    if (estado === "lead") leads += 1
    if (origen === "webchat") webchat += 1
    const ownerId = textValue(raw?.propietario_id) || textValue(raw?.propietario_nombre)
    if (ownerId) ownerSet.add(ownerId)
    const createdAtRaw = textValue(raw?.creado_en)
    const createdAt = createdAtRaw ? Date.parse(createdAtRaw) : NaN
    if (!Number.isNaN(createdAt) && (ultimo === null || createdAt > ultimo)) {
      ultimo = createdAt
    }
  }

  return {
    total: rows.length,
    completos,
    incompletos,
    activos,
    leads,
    webchat,
    propietarios: ownerSet.size,
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
    left.createdTo === right.createdTo
  )
}
