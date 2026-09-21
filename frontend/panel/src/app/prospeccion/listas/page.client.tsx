"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { IconListDetails, IconLoader2, IconPlus, IconRefresh, IconSearch, IconTargetArrow } from "@tabler/icons-react"

import { ProspeccionCampaignWizard } from "@/components/prospeccion/prospeccion-campaign-wizard"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import {
  createProspeccionLista,
  listProspeccionListas,
  updateProspeccionLista,
  type ProspectoFiltroInput,
  type ProspeccionLista,
} from "@/lib/prospeccion/prospectos-client"

type FormState = {
  canal: "correo" | "whatsapp" | "llamada" | ""
  nombre: string
  descripcion: string
  segmento: string
  lookupStatus: string
  emailLookupStatus: string
  carrierType: string
  whatsappPermitido: string
  llamadaPermitida: string
  enviosMin: string
  enviosMax: string
}

const EMPTY_FORM: FormState = {
  canal: "",
  nombre: "",
  descripcion: "",
  segmento: "",
  lookupStatus: "",
  emailLookupStatus: "",
  carrierType: "",
  whatsappPermitido: "",
  llamadaPermitida: "",
  enviosMin: "",
  enviosMax: "",
}

function envioCountFields(canal: FormState["canal"]): {
  min: "envios_correo_min" | "envios_whatsapp_min" | "envios_voz_min"
  max: "envios_correo_max" | "envios_whatsapp_max" | "envios_voz_max"
} | null {
  if (canal === "correo") return { min: "envios_correo_min", max: "envios_correo_max" }
  if (canal === "whatsapp") return { min: "envios_whatsapp_min", max: "envios_whatsapp_max" }
  if (canal === "llamada") return { min: "envios_voz_min", max: "envios_voz_max" }
  return null
}

function inferChannel(filtros: Record<string, unknown>): FormState["canal"] {
  if (filtros.whatsapp_permitido !== undefined || filtros.envios_whatsapp_max !== undefined) return "whatsapp"
  if (filtros.llamada_permitida !== undefined || filtros.envios_voz_max !== undefined) return "llamada"
  if (typeof filtros.email_lookup_status === "string" || filtros.envios_correo_max !== undefined) return "correo"
  return ""
}

function formFromLista(lista?: ProspeccionLista | null): FormState {
  const filtros = lista?.filtros ?? {}
  const canal = lista?.canal ?? inferChannel(filtros)
  const countFields = envioCountFields(canal)
  const minCount = countFields ? filtros[countFields.min] : undefined
  const maxCount = countFields ? filtros[countFields.max] : undefined
  return {
    canal,
    nombre: lista?.nombre ?? "",
    descripcion: lista?.descripcion ?? "",
    segmento: typeof filtros.segmento === "string" ? filtros.segmento : "",
    lookupStatus: typeof filtros.lookup_status === "string" ? filtros.lookup_status : "",
    emailLookupStatus: typeof filtros.email_lookup_status === "string" ? filtros.email_lookup_status : "",
    carrierType: typeof filtros.carrier_type === "string" ? filtros.carrier_type : "",
    whatsappPermitido:
      typeof filtros.whatsapp_permitido === "boolean" ? String(filtros.whatsapp_permitido) : "",
    llamadaPermitida: typeof filtros.llamada_permitida === "boolean" ? String(filtros.llamada_permitida) : "",
    enviosMin: typeof minCount === "number" ? String(minCount) : "",
    enviosMax: typeof maxCount === "number" ? String(maxCount) : "",
  }
}

function filtersFromForm(form: FormState): ProspectoFiltroInput {
  const filtros: ProspectoFiltroInput = {}
  if (form.segmento.trim()) filtros.segmento = form.segmento.trim()
  const minCount = form.enviosMin.trim() ? Number.parseInt(form.enviosMin, 10) : undefined
  const maxCount = form.enviosMax.trim() ? Number.parseInt(form.enviosMax, 10) : undefined
  const countFields = envioCountFields(form.canal)
  if (countFields && typeof minCount === "number" && Number.isInteger(minCount) && minCount >= 0) {
    filtros[countFields.min] = minCount
  }
  if (countFields && typeof maxCount === "number" && Number.isInteger(maxCount) && maxCount >= 0) {
    filtros[countFields.max] = maxCount
  }
  if (form.canal === "correo") {
    if (form.emailLookupStatus) filtros.email_lookup_status = form.emailLookupStatus
  }
  if (form.canal === "whatsapp") {
    if (form.lookupStatus) filtros.lookup_status = form.lookupStatus
    if (form.carrierType) filtros.carrier_type = form.carrierType as ProspectoFiltroInput["carrier_type"]
    if (form.whatsappPermitido) filtros.whatsapp_permitido = form.whatsappPermitido === "true"
  }
  if (form.canal === "llamada") {
    if (form.lookupStatus) filtros.lookup_status = form.lookupStatus
    if (form.carrierType) filtros.carrier_type = form.carrierType as ProspectoFiltroInput["carrier_type"]
    if (form.llamadaPermitida) filtros.llamada_permitida = form.llamadaPermitida === "true"
  }
  return filtros
}

function ruleLabels(lista: ProspeccionLista): string[] {
  const filtros = lista.filtros ?? {}
  const labels: string[] = []
  if (typeof filtros.segmento === "string" && filtros.segmento.trim()) {
    labels.push(`Tipo de empresa: ${filtros.segmento}`)
  }
  if (filtros.email_lookup_status === "verified") labels.push("Correo válido")
  if (filtros.lookup_status === "verified") labels.push("Teléfono válido")
  if (filtros.carrier_type === "mobile") labels.push("Teléfono móvil")
  if (filtros.carrier_type === "landline") labels.push("Teléfono fijo")
  if (filtros.carrier_type === "voip") labels.push("Teléfono por internet")
  if (filtros.whatsapp_permitido === true) labels.push("Se le puede enviar WhatsApp")
  if (filtros.whatsapp_permitido === false) labels.push("No se le puede enviar WhatsApp")
  if (filtros.llamada_permitida === true) labels.push("Se le puede llamar")
  if (filtros.llamada_permitida === false) labels.push("No se le puede llamar")
  const canal = lista.canal ?? inferChannel(filtros)
  const countFields = envioCountFields(canal)
  const minimum = countFields ? filtros[countFields.min] : undefined
  const maximum = countFields ? filtros[countFields.max] : undefined
  if (typeof minimum === "number" || typeof maximum === "number") {
    const channelName = canal === "correo" ? "correos" : canal === "whatsapp" ? "WhatsApps" : "llamadas"
    const countLabel =
      typeof minimum === "number" && typeof maximum === "number" && minimum === maximum
        ? `Exactamente ${minimum} ${channelName}`
        : typeof minimum === "number" && typeof maximum === "number"
          ? `${minimum} a ${maximum} ${channelName}`
          : typeof minimum === "number"
            ? `${minimum} o más ${channelName}`
            : `Hasta ${maximum} ${channelName}`
    labels.push(countLabel)
  }
  return labels
}

function currentCount(lista: ProspeccionLista): string {
  return typeof lista.total_estimado === "number" ? lista.total_estimado.toLocaleString("es-MX") : "—"
}

export function ListasParaContactarClient() {
  const [listas, setListas] = useState<ProspeccionLista[]>([])
  const [search, setSearch] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editingLista, setEditingLista] = useState<ProspeccionLista | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [wizardLista, setWizardLista] = useState<ProspeccionLista | null>(null)

  const loadListas = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await listProspeccionListas({ limit: 100, search })
      setListas(response.items ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron cargar las listas.")
    } finally {
      setLoading(false)
    }
  }, [search])

  useEffect(() => {
    const timer = window.setTimeout(() => void loadListas(), 250)
    return () => window.clearTimeout(timer)
  }, [loadListas])

  const openCreate = () => {
    setEditingLista(null)
    setForm(EMPTY_FORM)
    setNotice(null)
    setEditorOpen(true)
  }

  const openEdit = (lista: ProspeccionLista) => {
    setEditingLista(lista)
    setForm(formFromLista(lista))
    setNotice(null)
    setEditorOpen(true)
  }

  const saveLista = async () => {
    if (!form.nombre.trim()) {
      setError("Escribe un nombre para la lista.")
      return
    }
    if (!form.canal) {
      setError("Elige primero cómo quieres contactar a estos prospectos.")
      return
    }
    const minCount = form.enviosMin.trim() ? Number.parseInt(form.enviosMin, 10) : undefined
    const maxCount = form.enviosMax.trim() ? Number.parseInt(form.enviosMax, 10) : undefined
    if (
      (minCount !== undefined && (!Number.isInteger(minCount) || minCount < 0)) ||
      (maxCount !== undefined && (!Number.isInteger(maxCount) || maxCount < 0))
    ) {
      setError("Los envíos deben ser números enteros iguales o mayores que cero.")
      return
    }
    if (minCount !== undefined && maxCount !== undefined && minCount > maxCount) {
      setError("El mínimo de envíos no puede ser mayor que el máximo.")
      return
    }
    setSaving(true)
    setError(null)
    try {
      const filtros = filtersFromForm(form)
      if (editingLista) {
        await updateProspeccionLista(editingLista.id, {
          nombre: form.nombre.trim(),
          descripcion: form.descripcion.trim() || null,
          canal: form.canal || undefined,
          filtros,
        })
        setNotice("Lista actualizada.")
      } else {
        await createProspeccionLista({
          nombre: form.nombre.trim(),
          descripcion: form.descripcion.trim() || undefined,
          canal: form.canal || undefined,
          filtros,
        })
        setNotice("Lista creada.")
      }
      setEditorOpen(false)
      await loadListas()
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar la lista.")
    } finally {
      setSaving(false)
    }
  }

  const filteredCount = useMemo(() => listas.length, [listas])

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <p className="text-sm text-muted-foreground">Prepara posibles clientes</p>
          <h1 className="text-2xl font-semibold tracking-tight">Listas para contactar</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Guarda grupos de prospectos que cumplan ciertas reglas para volver a contactarlos cuando lo necesites.
          </p>
        </div>
        <Button onClick={openCreate}>
          <IconPlus className="mr-2 size-4" />
          Crear lista
        </Button>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <IconSearch className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar una lista..."
            className="pl-9"
            aria-label="Buscar una lista"
          />
        </div>
        <Button variant="outline" onClick={() => void loadListas()} disabled={loading}>
          <IconRefresh className={loading ? "mr-2 size-4 animate-spin" : "mr-2 size-4"} />
          Actualizar
        </Button>
      </div>

      {error ? <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">{error}</div> : null}
      {notice ? <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-3 text-sm text-emerald-700">{notice}</div> : null}

      {loading ? (
        <div className="flex min-h-48 items-center justify-center rounded-xl border border-dashed text-sm text-muted-foreground">
          <IconLoader2 className="mr-2 size-4 animate-spin" /> Cargando listas...
        </div>
      ) : !listas.length ? (
        <Card>
          <CardContent className="flex min-h-56 flex-col items-center justify-center text-center">
            <IconListDetails className="size-10 text-muted-foreground/60" />
            <h2 className="mt-3 font-medium">Todavía no tienes listas</h2>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">
              Crea una lista con reglas como “teléfono móvil” o “nunca recibió WhatsApp”.
            </p>
            <Button className="mt-4" onClick={openCreate}>
              <IconPlus className="mr-2 size-4" /> Crear primera lista
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="text-sm text-muted-foreground">
            {filteredCount.toLocaleString("es-MX")} {filteredCount === 1 ? "lista" : "listas"}
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            {listas.map((lista) => {
              const labels = ruleLabels(lista)
              return (
                <Card key={lista.id} className="flex flex-col">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <CardTitle className="truncate text-lg">{lista.nombre}</CardTitle>
                        <CardDescription className="mt-1 line-clamp-2">
                          {lista.descripcion || (lista.canal ? `Lista para ${lista.canal === "llamada" ? "Voz" : lista.canal}.` : "Lista basada en reglas guardadas.")}
                        </CardDescription>
                      </div>
                      <Badge variant="secondary" className="shrink-0">
                        {currentCount(lista)} prospectos
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="flex flex-1 flex-col">
                    <div className="min-h-16 space-y-1.5">
                      {labels.length ? (
                        labels.map((label) => (
                          <div key={label} className="flex items-start gap-2 text-sm text-muted-foreground">
                            <span className="mt-1 text-emerald-600">✓</span>
                            <span>{label}</span>
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-muted-foreground">Sin reglas específicas.</p>
                      )}
                    </div>
                    <div className="mt-5 flex flex-wrap gap-2 border-t pt-4">
                      <Button onClick={() => setWizardLista(lista)}>
                        <IconTargetArrow className="mr-2 size-4" /> Contactar esta lista
                      </Button>
                      <Button variant="outline" onClick={() => openEdit(lista)}>
                        Editar reglas
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </>
      )}

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingLista ? "Editar lista" : "Crear lista para contactar"}</DialogTitle>
            <DialogDescription>
              Define reglas dinámicas. La lista se volverá a calcular al momento de contactar.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-5 py-2">
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
              <Label htmlFor="lista-canal">¿Cómo quieres contactar a estos prospectos?</Label>
              <p className="mt-1 text-xs text-muted-foreground">Mostraremos únicamente las reglas que aplican a ese canal.</p>
              <Select
                value={form.canal || ""}
                onValueChange={(value) =>
                  setForm((prev) => ({
                    ...prev,
                    canal: value as FormState["canal"],
                    lookupStatus: "",
                    emailLookupStatus: "",
                    carrierType: "",
                    whatsappPermitido: "",
                    llamadaPermitida: "",
                    enviosMin: "",
                    enviosMax: "",
                  }))
                }
              >
                <SelectTrigger id="lista-canal" className="mt-3">
                  <SelectValue placeholder="Elige un canal" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="correo">Correo</SelectItem>
                  <SelectItem value="whatsapp">WhatsApp</SelectItem>
                  <SelectItem value="llamada">Voz</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="lista-nombre">Nombre</Label>
              <Input
                id="lista-nombre"
                value={form.nombre}
                onChange={(event) => setForm((prev) => ({ ...prev, nombre: event.target.value }))}
                placeholder="WhatsApp · Inmobiliarias nuevas"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lista-descripcion">Descripción (opcional)</Label>
              <Textarea
                id="lista-descripcion"
                value={form.descripcion}
                onChange={(event) => setForm((prev) => ({ ...prev, descripcion: event.target.value }))}
                placeholder="Para explicar cuándo usar esta lista."
                rows={2}
              />
            </div>
            {form.canal ? <div className="rounded-lg border bg-muted/20 p-4">
              <p className="mb-4 text-sm font-medium">Quiero prospectos que...</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="lista-segmento">Sean de este tipo de empresa</Label>
                  <Input
                    id="lista-segmento"
                    value={form.segmento}
                    onChange={(event) => setForm((prev) => ({ ...prev, segmento: event.target.value }))}
                    placeholder="Inmobiliarias"
                  />
                </div>
                {form.canal === "correo" ? <div className="space-y-2">
                  <Label htmlFor="lista-correo-valido">Tengan</Label>
                  <Select value={form.emailLookupStatus || "any"} onValueChange={(value) => setForm((prev) => ({ ...prev, emailLookupStatus: value === "any" ? "" : value }))}>
                    <SelectTrigger id="lista-correo-valido"><SelectValue placeholder="Cualquier correo" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">Cualquier correo</SelectItem>
                      <SelectItem value="verified">Correo válido</SelectItem>
                    </SelectContent>
                  </Select>
                </div> : null}
                {form.canal !== "correo" ? <>
                  <div className="space-y-2">
                    <Label htmlFor="lista-telefono">Tengan</Label>
                    <Select value={form.lookupStatus || "any"} onValueChange={(value) => setForm((prev) => ({ ...prev, lookupStatus: value === "any" ? "" : value }))}>
                      <SelectTrigger id="lista-telefono"><SelectValue placeholder="Cualquier teléfono" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="any">Cualquier teléfono</SelectItem>
                        <SelectItem value="verified">Teléfono válido</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lista-tipo-telefono">Tipo de teléfono</Label>
                    <Select value={form.carrierType || "any"} onValueChange={(value) => setForm((prev) => ({ ...prev, carrierType: value === "any" ? "" : value }))}>
                      <SelectTrigger id="lista-tipo-telefono"><SelectValue placeholder="Cualquier tipo" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="any">Cualquier tipo</SelectItem>
                        <SelectItem value="mobile">Móvil</SelectItem>
                        <SelectItem value="landline">Fijo</SelectItem>
                        <SelectItem value="voip">Teléfono por internet</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </> : null}
                {form.canal === "whatsapp" ? <div className="space-y-2">
                  <Label htmlFor="lista-whatsapp">WhatsApp</Label>
                  <Select value={form.whatsappPermitido || "any"} onValueChange={(value) => setForm((prev) => ({ ...prev, whatsappPermitido: value === "any" ? "" : value }))}>
                    <SelectTrigger id="lista-whatsapp"><SelectValue placeholder="Sin regla de WhatsApp" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">Sin regla de WhatsApp</SelectItem>
                      <SelectItem value="true">Se le puede enviar WhatsApp</SelectItem>
                      <SelectItem value="false">No se le puede enviar WhatsApp</SelectItem>
                    </SelectContent>
                  </Select>
                </div> : null}
                {form.canal === "llamada" ? <div className="space-y-2">
                  <Label htmlFor="lista-llamada">Llamadas</Label>
                  <Select value={form.llamadaPermitida || "any"} onValueChange={(value) => setForm((prev) => ({ ...prev, llamadaPermitida: value === "any" ? "" : value }))}>
                    <SelectTrigger id="lista-llamada"><SelectValue placeholder="Sin regla de llamadas" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">Sin regla de llamadas</SelectItem>
                      <SelectItem value="true">Se le puede llamar</SelectItem>
                      <SelectItem value="false">No se le puede llamar</SelectItem>
                    </SelectContent>
                  </Select>
                </div> : null}
              </div>
              <div className="mt-5 border-t pt-4">
                <p className="text-sm font-medium">
                  ¿Cuántas veces ya fueron contactados por {form.canal === "correo" ? "correo" : form.canal === "whatsapp" ? "WhatsApp" : "voz"}?
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Deja un campo vacío si no quieres limitarlo. Si escribes el mismo número en ambos, buscarás exactamente esa cantidad.
                </p>
                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="lista-envios-min">Como mínimo</Label>
                    <Input
                      id="lista-envios-min"
                      type="number"
                      min={0}
                      step={1}
                      value={form.enviosMin}
                      onChange={(event) => setForm((prev) => ({ ...prev, enviosMin: event.target.value }))}
                      placeholder="Ej. 2"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lista-envios-max">Como máximo</Label>
                    <Input
                      id="lista-envios-max"
                      type="number"
                      min={0}
                      step={1}
                      value={form.enviosMax}
                      onChange={(event) => setForm((prev) => ({ ...prev, enviosMax: event.target.value }))}
                      placeholder="Ej. 5"
                    />
                  </div>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Ejemplos: mínimo 2 = “2 o más”; máximo 2 = “2 o menos”; ambos en 2 = “exactamente 2”.
                </p>
              </div>
            </div> : <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Elige un canal para mostrar las reglas correspondientes.</div>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditorOpen(false)} disabled={saving}>Cancelar</Button>
            <Button onClick={() => void saveLista()} disabled={saving}>
              {saving ? <IconLoader2 className="mr-2 size-4 animate-spin" /> : null}
              {editingLista ? "Guardar cambios" : "Guardar lista"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ProspeccionCampaignWizard
        open={Boolean(wizardLista)}
        onClose={() => setWizardLista(null)}
        selectedIds={[]}
        preset={wizardLista ? { source: "lista", listaId: wizardLista.id, canal: wizardLista.canal } : null}
        onCompleted={() => setWizardLista(null)}
      />
    </div>
  )
}
