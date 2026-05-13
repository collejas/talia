'use client'

import * as React from "react"

import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Textarea } from "@/components/ui/textarea"

type ContactSearchItem = {
  id: string
  nombre: string | null
  correo: string | null
  telefono: string | null
  empresa: string | null
}

type OpportunityItem = {
  id: string
  titulo: string
  estado: string
}

type OpportunityMode = "none" | "existing" | "create"
type BookingModalidad = "virtual" | "presencial" | "hibrida"

type AgendaCreateBookingSheetProps = {
  open: boolean
  onClose: () => void
  onCreated: () => void
}

function toLocalDateTimeInputValue(date: Date): string {
  const copy = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
  return copy.toISOString().slice(0, 16)
}

function formatContactSubtitle(contact: ContactSearchItem): string {
  return (
    contact.correo?.trim() ||
    contact.telefono?.trim() ||
    contact.empresa?.trim() ||
    "Sin datos adicionales"
  )
}

export function AgendaCreateBookingSheet({ open, onClose, onCreated }: AgendaCreateBookingSheetProps) {
  const [search, setSearch] = React.useState("")
  const [searching, setSearching] = React.useState(false)
  const [searchResults, setSearchResults] = React.useState<ContactSearchItem[]>([])
  const [selectedContact, setSelectedContact] = React.useState<ContactSearchItem | null>(null)
  const [creatingContact, setCreatingContact] = React.useState(false)
  const [createMode, setCreateMode] = React.useState(false)
  const [submitting, setSubmitting] = React.useState(false)
  const [notes, setNotes] = React.useState("")
  const [startAt, setStartAt] = React.useState(() => toLocalDateTimeInputValue(new Date(Date.now() + 3600000)))
  const [modalidad, setModalidad] = React.useState<BookingModalidad>("virtual")
  const [newContact, setNewContact] = React.useState({
    nombre_completo: "",
    telefono_e164: "",
    correo: "",
    company_name: "",
  })
  const [opportunitiesLoading, setOpportunitiesLoading] = React.useState(false)
  const [openOpportunities, setOpenOpportunities] = React.useState<OpportunityItem[]>([])
  const [opportunityMode, setOpportunityMode] = React.useState<OpportunityMode>("none")
  const [selectedOpportunityId, setSelectedOpportunityId] = React.useState<string>("")
  const [newOpportunityTitle, setNewOpportunityTitle] = React.useState("")

  React.useEffect(() => {
    if (!open) {
      setSearch("")
      setSearchResults([])
      setSelectedContact(null)
      setCreateMode(false)
      setNotes("")
      setStartAt(toLocalDateTimeInputValue(new Date(Date.now() + 3600000)))
      setModalidad("virtual")
      setNewContact({
        nombre_completo: "",
        telefono_e164: "",
        correo: "",
        company_name: "",
      })
      setOpenOpportunities([])
      setOpportunityMode("none")
      setSelectedOpportunityId("")
      setNewOpportunityTitle("")
      return
    }
  }, [open])

  React.useEffect(() => {
    if (!open) return
    const q = search.trim()
    if (q.length < 2) {
      setSearchResults([])
      setSearching(false)
      return
    }

    let cancelled = false
    const timeout = setTimeout(async () => {
      try {
        setSearching(true)
        const params = new URLSearchParams({ q, limit: "8" })
        const response = await fetch(`/api/agenda/contacts/search?${params.toString()}`, {
          method: "GET",
          cache: "no-store",
        })
        const data = (await response.json()) as { items?: ContactSearchItem[]; error?: string }
        if (!response.ok) {
          throw new Error(data?.error || "No se pudieron buscar contactos.")
        }
        if (cancelled) return
        setSearchResults(Array.isArray(data.items) ? data.items : [])
      } catch (error) {
        if (cancelled) return
        setSearchResults([])
        toast.error(error instanceof Error ? error.message : "No se pudieron buscar contactos.")
      } finally {
        if (!cancelled) setSearching(false)
      }
    }, 300)

    return () => {
      cancelled = true
      clearTimeout(timeout)
    }
  }, [search, open])

  React.useEffect(() => {
    const currentContact = selectedContact
    if (!open || !currentContact?.id) {
      setOpenOpportunities([])
      setOpportunityMode("none")
      setSelectedOpportunityId("")
      return
    }
    const contactId = currentContact.id

    let cancelled = false
    async function loadOpportunities() {
      try {
        setOpportunitiesLoading(true)
        const params = new URLSearchParams({ contacto_id: contactId })
        const response = await fetch(`/api/agenda/opportunities?${params.toString()}`, {
          method: "GET",
          cache: "no-store",
        })
        const data = (await response.json()) as {
          items?: Array<{ id: string; titulo: string; estado: string }>
          error?: string
        }
        if (!response.ok) {
          throw new Error(data.error || "No se pudieron consultar oportunidades.")
        }
        if (cancelled) return
        const opportunities = Array.isArray(data.items) ? data.items : []
        setOpenOpportunities(opportunities)
        if (opportunities.length > 0) {
          setOpportunityMode("existing")
          setSelectedOpportunityId(opportunities[0].id)
        } else {
          setOpportunityMode("none")
          setSelectedOpportunityId("")
          setNewOpportunityTitle("")
        }
      } catch (error) {
        if (cancelled) return
        setOpenOpportunities([])
        setOpportunityMode("none")
        setSelectedOpportunityId("")
        toast.error(error instanceof Error ? error.message : "No se pudieron consultar oportunidades.")
      } finally {
        if (!cancelled) setOpportunitiesLoading(false)
      }
    }
    loadOpportunities()
    return () => {
      cancelled = true
    }
  }, [selectedContact, open])

  React.useEffect(() => {
    if (!open || opportunityMode !== "create" || newOpportunityTitle.trim() || !selectedContact?.nombre) {
      return
    }
    setNewOpportunityTitle(`Seguimiento ${selectedContact.nombre.trim()}`)
  }, [newOpportunityTitle, open, opportunityMode, selectedContact?.nombre])

  async function handleCreateContact() {
    if (!newContact.nombre_completo.trim()) {
      toast.error("Ingresa el nombre del contacto.")
      return
    }

    try {
      setCreatingContact(true)
      const response = await fetch("/api/agenda/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombre_completo: newContact.nombre_completo.trim(),
          telefono_e164: newContact.telefono_e164.trim() || undefined,
          correo: newContact.correo.trim() || undefined,
          company_name: newContact.company_name.trim() || undefined,
          origen: "agenda_manual",
        }),
      })
      const data = (await response.json()) as {
        id?: string
        nombre_completo?: string | null
        correo?: string | null
        telefono_e164?: string | null
        company_name?: string | null
        error?: string
      }
      if (!response.ok || !data.id) {
        throw new Error(data.error || "No se pudo crear el contacto.")
      }
      const created: ContactSearchItem = {
        id: data.id,
        nombre: data.nombre_completo ?? newContact.nombre_completo.trim(),
        correo: data.correo ?? (newContact.correo.trim() || null),
        telefono: data.telefono_e164 ?? (newContact.telefono_e164.trim() || null),
        empresa: data.company_name ?? (newContact.company_name.trim() || null),
      }
      setSelectedContact(created)
      setCreateMode(false)
      setSearch(created.nombre || "")
      setSearchResults([created])
      toast.success("Contacto creado.")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo crear el contacto.")
    } finally {
      setCreatingContact(false)
    }
  }

  async function resolveOpportunityId(contactId: string): Promise<string | null> {
    if (opportunityMode === "none") return null
    if (opportunityMode === "existing") {
      if (!selectedOpportunityId) {
        throw new Error("Selecciona una oportunidad para vincular.")
      }
      return selectedOpportunityId
    }
    const title = newOpportunityTitle.trim()
    if (!title.length) {
      throw new Error("Ingresa el título de la oportunidad.")
    }
    const response = await fetch("/api/agenda/opportunities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contacto_id: contactId,
        titulo: title,
      }),
    })
    const data = (await response.json()) as { id?: string; error?: string }
    if (!response.ok || !data?.id) {
      throw new Error(data.error || "No se pudo crear la oportunidad.")
    }
    return data.id
  }

  async function handleCreateBooking() {
    if (!selectedContact?.id) {
      toast.error("Selecciona un contacto para agendar la cita.")
      return
    }
    if (!startAt.trim()) {
      toast.error("Selecciona fecha y hora para la cita.")
      return
    }

    const startAtIso = new Date(startAt).toISOString()
    if (Number.isNaN(Date.parse(startAtIso))) {
      toast.error("Fecha/hora inválida.")
      return
    }

    try {
      setSubmitting(true)
      const crearOportunidad = opportunityMode === "create"
      const oportunidadId = await resolveOpportunityId(selectedContact.id)
      const response = await fetch("/api/agenda/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contacto_id: selectedContact.id,
          oportunidad_id: oportunidadId || undefined,
          crear_oportunidad: crearOportunidad,
          modalidad,
          start_at: startAtIso,
          notes: notes.trim() || undefined,
          canal: "manual",
        }),
      })
      const data = (await response.json()) as { error?: string }
      if (!response.ok) {
        throw new Error(data?.error || "No se pudo crear la cita.")
      }
      toast.success("Cita creada correctamente.")
      onCreated()
      onClose()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo crear la cita.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={(value) => !value && onClose()}>
      <SheetContent side="right" className="sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Nueva cita</SheetTitle>
          <SheetDescription>Selecciona o crea un contacto para agendar la cita.</SheetDescription>
        </SheetHeader>
        <div className="space-y-4 px-4">
          <div className="space-y-2">
            <Label htmlFor="agenda-contact-search">Buscar contacto</Label>
            <Input
              id="agenda-contact-search"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value)
                setSelectedContact(null)
              }}
              placeholder="Nombre, correo o teléfono"
            />
            {searching ? <p className="text-xs text-muted-foreground">Buscando…</p> : null}
            {!createMode && searchResults.length > 0 ? (
              <div className="max-h-44 space-y-2 overflow-auto rounded-md border p-2">
                {searchResults.map((item) => {
                  const selected = selectedContact?.id === item.id
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setSelectedContact(item)}
                      className={`w-full rounded-md border px-3 py-2 text-left text-sm ${
                        selected ? "border-primary bg-primary/10" : "border-border"
                      }`}
                    >
                      <p className="font-medium">{item.nombre || "Sin nombre"}</p>
                      <p className="text-xs text-muted-foreground">{formatContactSubtitle(item)}</p>
                    </button>
                  )
                })}
              </div>
            ) : null}
            {!createMode ? (
              <Button type="button" variant="outline" onClick={() => setCreateMode(true)}>
                Crear contacto rápido
              </Button>
            ) : null}
          </div>

          {createMode ? (
            <div className="space-y-3 rounded-md border p-3">
              <p className="text-sm font-medium">Nuevo contacto</p>
              <div className="space-y-2">
                <Label htmlFor="new-contact-name">Nombre</Label>
                <Input
                  id="new-contact-name"
                  value={newContact.nombre_completo}
                  onChange={(event) =>
                    setNewContact((current) => ({ ...current, nombre_completo: event.target.value }))
                  }
                  placeholder="Nombre completo"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-contact-phone">Teléfono</Label>
                <Input
                  id="new-contact-phone"
                  value={newContact.telefono_e164}
                  onChange={(event) =>
                    setNewContact((current) => ({ ...current, telefono_e164: event.target.value }))
                  }
                  placeholder="+52..."
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-contact-email">Correo</Label>
                <Input
                  id="new-contact-email"
                  value={newContact.correo}
                  onChange={(event) =>
                    setNewContact((current) => ({ ...current, correo: event.target.value }))
                  }
                  placeholder="correo@dominio.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-contact-company">Empresa</Label>
                <Input
                  id="new-contact-company"
                  value={newContact.company_name}
                  onChange={(event) =>
                    setNewContact((current) => ({ ...current, company_name: event.target.value }))
                  }
                  placeholder="Nombre de la empresa"
                />
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => setCreateMode(false)}>
                  Cancelar
                </Button>
                <Button type="button" onClick={handleCreateContact} disabled={creatingContact}>
                  {creatingContact ? "Guardando..." : "Guardar contacto"}
                </Button>
              </div>
            </div>
          ) : null}

          {selectedContact ? (
            <div className="rounded-md border bg-muted/20 p-3 text-sm">
              <p className="font-medium">Contacto seleccionado</p>
              <p>{selectedContact.nombre || "Sin nombre"}</p>
              <p className="text-xs text-muted-foreground">{formatContactSubtitle(selectedContact)}</p>
            </div>
          ) : null}

          {selectedContact ? (
            <div className="space-y-2 rounded-md border p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">Oportunidad</p>
                {opportunitiesLoading ? (
                  <span className="text-xs text-muted-foreground">Cargando...</span>
                ) : null}
              </div>
              <Select
                value={opportunityMode}
                onValueChange={(value) => setOpportunityMode(value as OpportunityMode)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona opción" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin oportunidad</SelectItem>
                  <SelectItem value="existing" disabled={!openOpportunities.length}>
                    Vincular oportunidad existente
                  </SelectItem>
                  <SelectItem value="create">Crear nueva oportunidad</SelectItem>
                </SelectContent>
              </Select>

              {opportunityMode === "existing" ? (
                openOpportunities.length ? (
                  <Select value={selectedOpportunityId} onValueChange={setSelectedOpportunityId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecciona oportunidad" />
                    </SelectTrigger>
                    <SelectContent>
                      {openOpportunities.map((item) => (
                        <SelectItem key={item.id} value={item.id}>
                          {item.titulo || "Sin título"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <p className="text-xs text-muted-foreground">No hay oportunidades abiertas para este contacto.</p>
                )
              ) : null}

              {opportunityMode === "create" ? (
                <div className="space-y-2">
                  <Label htmlFor="new-opportunity-title">Título de oportunidad</Label>
                  <Input
                    id="new-opportunity-title"
                    value={newOpportunityTitle}
                    onChange={(event) => setNewOpportunityTitle(event.target.value)}
                    placeholder="Interesado en Tal-IA"
                  />
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="agenda-booking-modalidad">Modalidad</Label>
            <Select value={modalidad} onValueChange={(value) => setModalidad(value as BookingModalidad)}>
              <SelectTrigger id="agenda-booking-modalidad">
                <SelectValue placeholder="Selecciona la modalidad" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="virtual">Virtual</SelectItem>
                <SelectItem value="presencial">Presencial</SelectItem>
                <SelectItem value="hibrida">Híbrida</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Si eliges presencial, no se generará enlace de Zoom.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="agenda-booking-start-at">Fecha y hora</Label>
            <Input
              id="agenda-booking-start-at"
              type="datetime-local"
              value={startAt}
              onChange={(event) => setStartAt(event.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="agenda-booking-notes">Notas</Label>
            <Textarea
              id="agenda-booking-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={3}
              placeholder="Notas internas para la cita"
            />
          </div>
        </div>
        <SheetFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cerrar
          </Button>
          <Button type="button" onClick={handleCreateBooking} disabled={submitting}>
            {submitting ? "Creando..." : "Crear cita"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
