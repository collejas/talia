"use client"

import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

export type TemplateAiLayout = {
  id: string
  organizacion_id: string
  codigo: string
  nombre: string
  descripcion: string
  instrucciones_composicion: string
  logo_ancho_px: number
  canal: "correo" | "whatsapp"
  activo: boolean
  orden: number
  habilitado: boolean
  predeterminado: boolean
  actualizado_por?: string | null
  creado_en?: string | null
  actualizado_en?: string | null
}

type Props = { initialItems: TemplateAiLayout[] }
type FormState = {
  nombre: string
  descripcion: string
  instrucciones_composicion: string
  logo_ancho_px: string
  orden: string
}

const EMPTY_FORM: FormState = {
  nombre: "",
  descripcion: "",
  instrucciones_composicion: "",
  logo_ancho_px: "140",
  orden: "1000",
}

function errorMessage(payload: unknown) {
  if (payload && typeof payload === "object" && "error" in payload) {
    const value = (payload as { error?: unknown }).error
    if (typeof value === "string" && value.trim()) return value
  }
  return "No se pudo guardar la configuración de estilos."
}

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 78)
}

export function TenantTemplateAiLayoutsPanel({ initialItems }: Props) {
  const [items, setItems] = useState(initialItems)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)

  const startCreate = () => {
    setEditingId("")
    setForm(EMPTY_FORM)
    setMessage(null)
  }

  const startEdit = (item: TemplateAiLayout) => {
    setEditingId(item.id)
    setForm({
      nombre: item.nombre,
      descripcion: item.descripcion,
      instrucciones_composicion: item.instrucciones_composicion,
      logo_ancho_px: String(item.logo_ancho_px),
      orden: String(item.orden),
    })
    setMessage(null)
  }

  const save = async () => {
    const name = form.nombre.trim()
    const code = slugify(name)
    if (code.length < 2) return setMessage({ type: "error", text: "Define un nombre o código válido para el estilo." })
    if (name.length < 2) return setMessage({ type: "error", text: "El nombre del estilo es obligatorio." })
    if (form.instrucciones_composicion.trim().length < 10) return setMessage({ type: "error", text: "Escribe instrucciones de composición más detalladas." })
    setSaving(true)
    setMessage(null)
    try {
      const isEdit = Boolean(editingId)
      const response = await fetch(
        isEdit
          ? `/api/settings/variables/prospeccion-template-ai-layouts/${encodeURIComponent(editingId ?? "")}`
          : "/api/settings/variables/prospeccion-template-ai-layouts",
        {
          method: isEdit ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            isEdit
              ? {
                  nombre: name,
                  descripcion: form.descripcion.trim(),
                  instrucciones_composicion: form.instrucciones_composicion.trim(),
                  logo_ancho_px: Number(form.logo_ancho_px) || 140,
                  orden: Number(form.orden) || 1000,
                }
              : {
                  codigo: code,
                  nombre: name,
                  descripcion: form.descripcion.trim(),
                  instrucciones_composicion: form.instrucciones_composicion.trim(),
                  logo_ancho_px: Number(form.logo_ancho_px) || 140,
                  canal: "correo",
                  orden: Number(form.orden) || 1000,
                  habilitado: true,
                  predeterminado: items.length === 0,
                },
          ),
        },
      )
      const payload = await response.json()
      if (!response.ok) throw new Error(errorMessage(payload))
      if (isEdit) setItems((current) => current.map((item) => (item.id === editingId ? payload : item)))
      else setItems((current) => [...current, payload])
      setEditingId(null)
      setForm(EMPTY_FORM)
      setMessage({ type: "success", text: isEdit ? "Estilo actualizado." : "Estilo creado." })
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : errorMessage(null) })
    } finally {
      setSaving(false)
    }
  }

  const updateItem = async (item: TemplateAiLayout, patch: Record<string, boolean>) => {
    setMessage(null)
    try {
      const response = await fetch(`/api/settings/variables/prospeccion-template-ai-layouts/${encodeURIComponent(item.id)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(errorMessage(payload))
      setItems((current) => current.map((candidate) => {
        if (candidate.id === item.id) return payload
        return patch.predeterminado ? { ...candidate, predeterminado: false } : candidate
      }))
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : errorMessage(null) })
    }
  }

  const remove = async (item: TemplateAiLayout) => {
    if (!window.confirm(`¿Eliminar el estilo “${item.nombre}”?`)) return
    setMessage(null)
    try {
      const response = await fetch(`/api/settings/variables/prospeccion-template-ai-layouts/${encodeURIComponent(item.id)}`, { method: "DELETE" })
      const payload = response.status === 204 ? null : await response.json()
      if (!response.ok) throw new Error(errorMessage(payload))
      setItems((current) => current.filter((candidate) => candidate.id !== item.id))
      if (editingId === item.id) setEditingId(null)
      setMessage({ type: "success", text: "Estilo eliminado." })
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : errorMessage(null) })
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Estilo de diseño</CardTitle>
            <CardDescription>
              Estos son los estilos base de Tal-IA para este tenant. Puedes editarlos, eliminarlos o crear estilos propios; solo los estilos habilitados estarán disponibles para el asistente.
            </CardDescription>
          </div>
          <Button type="button" variant="outline" onClick={startCreate}>Nuevo estilo</Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {message ? <p className={message.type === "error" ? "text-sm text-destructive" : "text-sm text-emerald-600"}>{message.text}</p> : null}
        {editingId !== null ? (
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
            <p className="font-medium">{editingId ? "Editar estilo" : "Crear estilo"}</p>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2"><Label htmlFor="ai-layout-name">Nombre</Label><Input id="ai-layout-name" value={form.nombre} onChange={(event) => setForm((current) => ({ ...current, nombre: event.target.value }))} placeholder="Elegante corporativo" /></div>
              <div className="space-y-2 md:col-span-2"><Label htmlFor="ai-layout-description">Descripción</Label><Input id="ai-layout-description" value={form.descripcion} onChange={(event) => setForm((current) => ({ ...current, descripcion: event.target.value }))} placeholder="Diseño sobrio para empresas B2B" maxLength={500} /></div>
              <div className="space-y-2 md:col-span-2"><Label htmlFor="ai-layout-instructions">Instrucciones de composición</Label><Textarea id="ai-layout-instructions" rows={5} value={form.instrucciones_composicion} onChange={(event) => setForm((current) => ({ ...current, instrucciones_composicion: event.target.value }))} placeholder="Usa encabezado limpio, espacio en blanco, tarjetas discretas y un CTA azul..." maxLength={6000} /></div>
              <div className="space-y-2"><Label htmlFor="ai-layout-order">Orden</Label><Input id="ai-layout-order" type="number" min={0} max={9999} value={form.orden} onChange={(event) => setForm((current) => ({ ...current, orden: event.target.value }))} /></div>
              <div className="space-y-2"><Label htmlFor="ai-layout-logo-width">Ancho del logo (px)</Label><Input id="ai-layout-logo-width" type="number" min={80} max={240} value={form.logo_ancho_px} onChange={(event) => setForm((current) => ({ ...current, logo_ancho_px: event.target.value }))} /><p className="text-xs text-muted-foreground">Se aplica al logo cuando el asistente inserta la imagen. Usa entre 80 y 240 px.</p></div>
            </div>
            <div className="mt-4 flex gap-2"><Button type="button" onClick={() => void save()} disabled={saving}>{saving ? "Guardando…" : "Guardar estilo"}</Button><Button type="button" variant="ghost" onClick={() => setEditingId(null)}>Cancelar</Button></div>
          </div>
        ) : null}
        <div className="grid gap-3 md:grid-cols-2">
          {items.map((item) => (
            <div key={item.id} className="rounded-lg border p-4">
              <div className="flex items-start justify-between gap-3">
                <div><p className="font-medium">{item.nombre}</p><p className="mt-1 text-xs text-muted-foreground">{item.descripcion}</p></div>
                <code className="rounded bg-muted px-1.5 py-0.5 text-[10px]">{item.codigo}</code>
              </div>
              <p className="mt-3 line-clamp-3 text-xs text-muted-foreground">{item.instrucciones_composicion}</p>
              <p className="mt-2 text-xs text-muted-foreground">Logo: {item.logo_ancho_px} px</p>
              <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                <label className="flex items-center gap-2"><input type="checkbox" checked={item.habilitado} onChange={(event) => void updateItem(item, { habilitado: event.target.checked })} /> Disponible</label>
                <label className="flex items-center gap-2"><input type="radio" name="template-ai-default-layout" checked={item.predeterminado} onChange={() => void updateItem(item, { predeterminado: true })} /> Predeterminado</label>
              </div>
              <div className="mt-3 flex gap-2"><Button type="button" variant="outline" size="sm" onClick={() => startEdit(item)}>Editar</Button><Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={() => void remove(item)}>Eliminar</Button></div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
