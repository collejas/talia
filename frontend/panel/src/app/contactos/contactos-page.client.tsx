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
  const [cards, setCards] = React.useState<ContactCards>(initialCards)
  const [filters, setFilters] = React.useState<ContactFilters>({
    search: "",
    owner: "all",
    createdFrom: "",
    createdTo: "",
  })
  const [loadingCards, setLoadingCards] = React.useState(false)

  const handleFiltersChange = React.useCallback((nextFilters: ContactFilters) => {
    setFilters((prev) => (areFiltersEqual(prev, nextFilters) ? prev : nextFilters))
  }, [])

  React.useEffect(() => {
    const controller = new AbortController()
    const run = async () => {
      setLoadingCards(true)
      try {
        const params = new URLSearchParams()
        if (filters.search.trim()) params.set("search", filters.search.trim())
        if (filters.owner && filters.owner !== "all" && filters.owner !== "unassigned") params.set("propietario", filters.owner)
        if (filters.createdFrom.trim()) params.set("from", filters.createdFrom.trim())
        if (filters.createdTo.trim()) params.set("to", filters.createdTo.trim())
        const response = await fetch(`/api/contactos/summary?${params.toString()}`, {
          cache: "no-store",
          signal: controller.signal,
        })
        if (!response.ok) {
          return
        }
        const body = (await response.json().catch(() => null)) as ContactCards | null
        if (body) {
          setCards(body)
        }
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          // Mantener el último resumen válido si la petición filtrada falla.
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoadingCards(false)
        }
      }
    }
    void run()
    return () => controller.abort()
  }, [filters, initialCards])

  return (
    <div className="space-y-4">
      <ContactSectionCards data={cards} />
      <ContactsDataTable data={table} onFiltersChange={handleFiltersChange} />
      {loadingCards ? <div className="sr-only">Actualizando KPIs filtrados...</div> : null}
    </div>
  )
}

function areFiltersEqual(left: ContactFilters, right: ContactFilters): boolean {
  return (
    left.search === right.search &&
    left.owner === right.owner &&
    left.createdFrom === right.createdFrom &&
    left.createdTo === right.createdTo
  )
}
