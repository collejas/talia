"use client"

import { FormEvent, useEffect, useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type Partner = {
  id: string
  tipo: string
  nombre: string
  rfc?: string | null
  contacto_nombre?: string | null
  correo?: string | null
  telefono?: string | null
  comision_porcentaje?: number | null
  activo: boolean
  notas?: string | null
}

type ExternalAgent = {
  id: string
  socio_comercial_id: string
  nombre: string
  correo?: string | null
  telefono?: string | null
  referencia_externa?: string | null
  activo: boolean
}

type PartnerForm = {
  tipo: string
  nombre: string
  rfc: string
  contacto_nombre: string
  correo: string
  telefono: string
  comision_porcentaje: string
  activo: boolean
  notas: string
}

type AgentForm = {
  nombre: string
  correo: string
  telefono: string
  referencia_externa: string
  activo: boolean
  notas: string
}

const emptyPartner: PartnerForm = {
  tipo: "inmobiliaria",
  nombre: "",
  rfc: "",
  contacto_nombre: "",
  correo: "",
  telefono: "",
  comision_porcentaje: "",
  activo: true,
  notas: "",
}

const emptyAgent: AgentForm = {
  nombre: "",
  correo: "",
  telefono: "",
  referencia_externa: "",
  activo: true,
  notas: "",
}

function partnerPayload(form: PartnerForm) {
  return {
    tipo: form.tipo,
    nombre: form.nombre.trim(),
    rfc: form.rfc.trim() || null,
    contacto_nombre: form.contacto_nombre.trim() || null,
    correo: form.correo.trim() || null,
    telefono: form.telefono.trim() || null,
    comision_porcentaje: form.comision_porcentaje.trim() ? Number(form.comision_porcentaje) : null,
    activo: form.activo,
    notas: form.notas.trim() || null,
  }
}

function agentPayload(form: AgentForm) {
  return {
    nombre: form.nombre.trim(),
    correo: form.correo.trim() || null,
    telefono: form.telefono.trim() || null,
    referencia_externa: form.referencia_externa.trim() || null,
    activo: form.activo,
    notas: form.notas.trim() || null,
  }
}

function apiError(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object") {
    const detail = "detail" in payload ? payload.detail : null
    if (typeof detail === "string") {
      const messages: Record<string, string> = {
        inmobiliaria_socio_ya_existente: "Ya existe un socio comercial con ese nombre.",
        inmobiliaria_agente_ya_existente: "Ya existe un agente con ese nombre dentro del socio comercial.",
        inmobiliaria_socio_not_found: "No se encontró el socio comercial seleccionado.",
        inmobiliaria_socio_tiene_operaciones_o_agentes: "No se puede eliminar porque tiene agentes u operaciones relacionadas.",
        inmobiliaria_agente_tiene_operaciones: "No se puede eliminar porque el agente tiene operaciones relacionadas.",
      }
      return messages[detail] ?? detail
    }
  }
  return fallback
}

export function ExternalPartnersManager() {
  const [partners, setPartners] = useState<Partner[]>([])
  const [agents, setAgents] = useState<ExternalAgent[]>([])
  const [selectedPartnerId, setSelectedPartnerId] = useState("")
  const [partnerForm, setPartnerForm] = useState<PartnerForm>(emptyPartner)
  const [agentForm, setAgentForm] = useState<AgentForm>(emptyAgent)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const selectedPartner = useMemo(
    () => partners.find((partner) => partner.id === selectedPartnerId) ?? null,
    [partners, selectedPartnerId],
  )

  async function loadPartners() {
    const response = await fetch("/api/crm/inmobiliaria/socios-comerciales?incluir_inactivos=true", { cache: "no-store" })
    const payload = await response.json().catch(() => null)
    if (!response.ok) throw new Error(apiError(payload, "No se pudieron cargar los socios comerciales."))
    const items = Array.isArray(payload?.items) ? payload.items : []
    setPartners(items)
    setSelectedPartnerId((current) => current || items[0]?.id || "")
  }

  async function loadAgents(partnerId: string) {
    if (!partnerId) {
      setAgents([])
      return
    }
    const response = await fetch(`/api/crm/inmobiliaria/socios-comerciales/${partnerId}/agentes?incluir_inactivos=true`, { cache: "no-store" })
    const payload = await response.json().catch(() => null)
    if (!response.ok) throw new Error(apiError(payload, "No se pudieron cargar los agentes externos."))
    setAgents(Array.isArray(payload?.items) ? payload.items : [])
  }

  useEffect(() => {
    let mounted = true
    setLoading(true)
    loadPartners()
      .catch((loadError) => {
        if (mounted) setError(loadError instanceof Error ? loadError.message : "No se pudieron cargar los socios comerciales.")
      })
      .finally(() => {
        if (mounted) setLoading(false)
      })
    return () => { mounted = false }
  }, [])

  useEffect(() => {
    setError(null)
    loadAgents(selectedPartnerId).catch((loadError) => {
      setError(loadError instanceof Error ? loadError.message : "No se pudieron cargar los agentes externos.")
    })
  }, [selectedPartnerId])

  async function savePartner(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      const response = await fetch("/api/crm/inmobiliaria/socios-comerciales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(partnerPayload(partnerForm)),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(apiError(payload, "No se pudo guardar el socio comercial."))
      setPartnerForm(emptyPartner)
      await loadPartners()
      setSelectedPartnerId(payload?.item?.id || "")
      setSuccess("Socio comercial guardado.")
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "No se pudo guardar el socio comercial.")
    } finally {
      setSaving(false)
    }
  }

  async function togglePartner(partner: Partner) {
    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      const response = await fetch(`/api/crm/inmobiliaria/socios-comerciales/${partner.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo: partner.tipo,
          nombre: partner.nombre,
          rfc: partner.rfc || null,
          contacto_nombre: partner.contacto_nombre || null,
          correo: partner.correo || null,
          telefono: partner.telefono || null,
          comision_porcentaje: partner.comision_porcentaje ?? null,
          activo: !partner.activo,
          notas: partner.notas || null,
        }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(apiError(payload, "No se pudo actualizar el socio comercial."))
      await loadPartners()
      setSuccess(partner.activo ? "Socio comercial desactivado." : "Socio comercial activado.")
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "No se pudo actualizar el socio comercial.")
    } finally {
      setSaving(false)
    }
  }

  async function saveAgent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedPartnerId) return
    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      const response = await fetch(`/api/crm/inmobiliaria/socios-comerciales/${selectedPartnerId}/agentes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(agentPayload(agentForm)),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(apiError(payload, "No se pudo guardar el agente externo."))
      setAgentForm(emptyAgent)
      await loadAgents(selectedPartnerId)
      setSuccess("Agente externo guardado.")
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "No se pudo guardar el agente externo.")
    } finally {
      setSaving(false)
    }
  }

  async function deletePartner(partner: Partner) {
    if (!window.confirm(`¿Eliminar el socio comercial ${partner.nombre}?`)) return
    setSaving(true)
    setError(null)
    try {
      const response = await fetch(`/api/crm/inmobiliaria/socios-comerciales/${partner.id}`, { method: "DELETE" })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(apiError(payload, "No se pudo eliminar el socio comercial."))
      await loadPartners()
      setSuccess("Socio comercial eliminado.")
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "No se pudo eliminar el socio comercial.")
    } finally {
      setSaving(false)
    }
  }

  async function deleteAgent(agent: ExternalAgent) {
    if (!window.confirm(`¿Eliminar el agente ${agent.nombre}?`)) return
    setSaving(true)
    setError(null)
    try {
      const response = await fetch(`/api/crm/inmobiliaria/agentes-externos/${agent.id}`, { method: "DELETE" })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(apiError(payload, "No se pudo eliminar el agente externo."))
      await loadAgents(selectedPartnerId)
      setSuccess("Agente externo eliminado.")
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "No se pudo eliminar el agente externo.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Socios y agentes externos</h1>
        <p className="mt-1 text-sm text-muted-foreground">Administra brokers sin crearles usuarios ni darles acceso a Talia.</p>
      </div>

      {error && <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>}
      {success && <div className="rounded-md border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{success}</div>}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Nuevo socio comercial</CardTitle>
            <CardDescription>Inmobiliaria, broker independiente o agencia.</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={savePartner}>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2"><Label htmlFor="partner-name">Nombre comercial</Label><Input id="partner-name" value={partnerForm.nombre} onChange={(event) => setPartnerForm((current) => ({ ...current, nombre: event.target.value }))} required /></div>
                <div className="space-y-2"><Label htmlFor="partner-type">Tipo</Label><select id="partner-type" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={partnerForm.tipo} onChange={(event) => setPartnerForm((current) => ({ ...current, tipo: event.target.value }))}><option value="inmobiliaria">Inmobiliaria</option><option value="broker_independiente">Broker independiente</option><option value="agencia">Agencia</option></select></div>
                <div className="space-y-2"><Label htmlFor="partner-rfc">RFC</Label><Input id="partner-rfc" value={partnerForm.rfc} onChange={(event) => setPartnerForm((current) => ({ ...current, rfc: event.target.value.toUpperCase() }))} maxLength={13} /></div>
                <div className="space-y-2"><Label htmlFor="partner-contact">Contacto principal</Label><Input id="partner-contact" value={partnerForm.contacto_nombre} onChange={(event) => setPartnerForm((current) => ({ ...current, contacto_nombre: event.target.value }))} /></div>
                <div className="space-y-2"><Label htmlFor="partner-email">Correo</Label><Input id="partner-email" type="email" value={partnerForm.correo} onChange={(event) => setPartnerForm((current) => ({ ...current, correo: event.target.value }))} /></div>
                <div className="space-y-2"><Label htmlFor="partner-phone">Teléfono</Label><Input id="partner-phone" value={partnerForm.telefono} onChange={(event) => setPartnerForm((current) => ({ ...current, telefono: event.target.value }))} /></div>
                <div className="space-y-2"><Label htmlFor="partner-commission">Comisión base (%)</Label><Input id="partner-commission" type="number" min="0" max="100" step="0.01" value={partnerForm.comision_porcentaje} onChange={(event) => setPartnerForm((current) => ({ ...current, comision_porcentaje: event.target.value }))} /></div>
              </div>
              <div className="flex justify-end"><Button type="submit" disabled={saving}>{saving ? "Guardando..." : "Guardar socio"}</Button></div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Socios registrados</CardTitle><CardDescription>Elige un socio para administrar sus agentes.</CardDescription></CardHeader>
          <CardContent>
            {loading ? <p className="text-sm text-muted-foreground">Cargando socios...</p> : partners.length === 0 ? <p className="text-sm text-muted-foreground">Aún no hay socios comerciales.</p> : <div className="space-y-2">{partners.map((partner) => <div key={partner.id} className={`flex items-center justify-between gap-3 rounded-md border p-3 ${selectedPartnerId === partner.id ? "border-primary bg-primary/5" : ""}`}><button type="button" className="min-w-0 flex-1 text-left" onClick={() => setSelectedPartnerId(partner.id)}><p className="truncate font-medium">{partner.nombre}</p><p className="text-xs text-muted-foreground">{partner.tipo} · {partner.activo ? "Activo" : "Inactivo"}</p></button><div className="flex gap-2"><Button type="button" variant="outline" size="sm" onClick={() => togglePartner(partner)} disabled={saving}>{partner.activo ? "Desactivar" : "Activar"}</Button><Button type="button" variant="ghost" size="sm" onClick={() => deletePartner(partner)} disabled={saving}>Eliminar</Button></div></div>)}</div>}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Agentes externos{selectedPartner ? ` · ${selectedPartner.nombre}` : ""}</CardTitle><CardDescription>Estos agentes recibirán la atribución comercial de las operaciones externas.</CardDescription></CardHeader>
        <CardContent className="space-y-6">
            {!selectedPartnerId ? <p className="text-sm text-muted-foreground">Primero registra o selecciona un socio comercial.</p> : <>
            <form className="grid gap-4 rounded-md border bg-muted/20 p-4 md:grid-cols-2" onSubmit={saveAgent}>
              <div className="space-y-2"><Label htmlFor="agent-name">Nombre del agente</Label><Input id="agent-name" value={agentForm.nombre} onChange={(event) => setAgentForm((current) => ({ ...current, nombre: event.target.value }))} required /></div>
              <div className="space-y-2"><Label htmlFor="agent-reference">Referencia externa</Label><Input id="agent-reference" value={agentForm.referencia_externa} onChange={(event) => setAgentForm((current) => ({ ...current, referencia_externa: event.target.value }))} /></div>
              <div className="space-y-2"><Label htmlFor="agent-email">Correo</Label><Input id="agent-email" type="email" value={agentForm.correo} onChange={(event) => setAgentForm((current) => ({ ...current, correo: event.target.value }))} /></div>
              <div className="space-y-2"><Label htmlFor="agent-phone">Teléfono</Label><Input id="agent-phone" value={agentForm.telefono} onChange={(event) => setAgentForm((current) => ({ ...current, telefono: event.target.value }))} /></div>
              <div className="md:col-span-2 flex justify-end"><Button type="submit" disabled={saving}>{saving ? "Guardando..." : "Guardar agente"}</Button></div>
            </form>
            {agents.length === 0 ? <p className="text-sm text-muted-foreground">Aún no hay agentes para este socio.</p> : <div className="divide-y rounded-md border">{agents.map((agent) => <div key={agent.id} className="flex items-center justify-between gap-3 p-3"><div><p className="font-medium">{agent.nombre}</p><p className="text-xs text-muted-foreground">{agent.correo || "Sin correo"} · {agent.telefono || "Sin teléfono"}</p></div><div className="flex items-center gap-2"><span className="text-xs text-muted-foreground">{agent.activo ? "Activo" : "Inactivo"}</span><Button type="button" variant="ghost" size="sm" onClick={() => deleteAgent(agent)} disabled={saving}>Eliminar</Button></div></div>)}</div>}
          </>}
        </CardContent>
      </Card>
    </div>
  )
}
