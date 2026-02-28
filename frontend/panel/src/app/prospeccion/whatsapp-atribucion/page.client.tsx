"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { IconLoader, IconPencil, IconTrash } from "@tabler/icons-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  createWhatsAppAtribucionRegla,
  deleteWhatsAppAtribucionRegla,
  listWhatsAppAtribucionReglas,
  simulateWhatsAppAtribucionRegla,
  updateWhatsAppAtribucionRegla,
  type WhatsAppAtribucionRule,
  type WhatsAppAtribucionTipoMatch,
} from "@/lib/prospeccion/prospectos-client"

type RuleFormState = {
  id?: string
  nombre_regla: string
  canal_publicitario: string
  frase_objetivo: string
  tipo_match: WhatsAppAtribucionTipoMatch
  campana_publicitaria: string
  adset: string
  anuncio: string
  prioridad: number
  activo: boolean
}

const EMPTY_FORM: RuleFormState = {
  nombre_regla: "",
  canal_publicitario: "",
  frase_objetivo: "",
  tipo_match: "contiene",
  campana_publicitaria: "",
  adset: "",
  anuncio: "",
  prioridad: 100,
  activo: true,
}

function toForm(rule: WhatsAppAtribucionRule): RuleFormState {
  return {
    id: rule.id,
    nombre_regla: rule.nombre_regla ?? "",
    canal_publicitario: rule.canal_publicitario ?? "",
    frase_objetivo: rule.frase_objetivo ?? "",
    tipo_match: rule.tipo_match ?? "contiene",
    campana_publicitaria: rule.campana_publicitaria ?? "",
    adset: rule.adset ?? "",
    anuncio: rule.anuncio ?? "",
    prioridad: Number(rule.prioridad || 100),
    activo: Boolean(rule.activo),
  }
}

export default function WhatsAppAtribucionPageClient() {
  const [rules, setRules] = useState<WhatsAppAtribucionRule[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const [form, setForm] = useState<RuleFormState>(EMPTY_FORM)

  const [filterCanal, setFilterCanal] = useState<string>("todos")
  const [filterEstado, setFilterEstado] = useState<string>("todos")
  const [filterSearch, setFilterSearch] = useState("")

  const [simPhrase, setSimPhrase] = useState("")
  const [simulating, setSimulating] = useState(false)
  const [simResult, setSimResult] = useState<{
    match: boolean
    frase_normalizada?: string
    applied_match_type?: string | null
    regla?: WhatsAppAtribucionRule | null
  } | null>(null)

  const isEditing = Boolean(form.id)

  const loadRules = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await listWhatsAppAtribucionReglas({
        limit: 500,
        canal_publicitario: filterCanal !== "todos" ? filterCanal : undefined,
        activo: filterEstado === "activos" ? true : filterEstado === "inactivos" ? false : undefined,
        search: filterSearch.trim() || undefined,
      })
      setRules(Array.isArray(response.items) ? response.items : [])
    } catch (err) {
      const message = err instanceof Error ? err.message : "No se pudieron cargar las reglas."
      setError(message)
    } finally {
      setLoading(false)
    }
  }, [filterCanal, filterEstado, filterSearch])

  useEffect(() => {
    void loadRules()
  }, [loadRules])

  const channels = useMemo(() => {
    const values = new Set<string>()
    for (const rule of rules) {
      const channel = String(rule.canal_publicitario || "").trim()
      if (channel) {
        values.add(channel)
      }
    }
    return Array.from(values).sort((a, b) => a.localeCompare(b, "es-MX"))
  }, [rules])

  const resetForm = () => {
    setForm(EMPTY_FORM)
  }

  const submitForm = async () => {
    setSaving(true)
    setError(null)
    setNotice(null)
    try {
      const payload = {
        nombre_regla: form.nombre_regla,
        canal_publicitario: form.canal_publicitario,
        frase_objetivo: form.frase_objetivo,
        tipo_match: form.tipo_match,
        campana_publicitaria: form.campana_publicitaria || null,
        adset: form.adset || null,
        anuncio: form.anuncio || null,
        prioridad: Number.isFinite(form.prioridad) ? form.prioridad : 100,
        activo: form.activo,
      }
      if (form.id) {
        await updateWhatsAppAtribucionRegla(form.id, payload)
        setNotice("Regla actualizada.")
      } else {
        await createWhatsAppAtribucionRegla(payload)
        setNotice("Regla creada.")
      }
      resetForm()
      await loadRules()
    } catch (err) {
      const message = err instanceof Error ? err.message : "No se pudo guardar la regla."
      setError(message)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (rule: WhatsAppAtribucionRule) => {
    if (!window.confirm(`Eliminar la regla "${rule.nombre_regla}"?`)) {
      return
    }
    setDeletingId(rule.id)
    setError(null)
    setNotice(null)
    try {
      await deleteWhatsAppAtribucionRegla(rule.id)
      setNotice("Regla eliminada.")
      await loadRules()
      if (form.id === rule.id) {
        resetForm()
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "No se pudo eliminar la regla."
      setError(message)
    } finally {
      setDeletingId(null)
    }
  }

  const runSimulation = async () => {
    if (!simPhrase.trim()) return
    setSimulating(true)
    setError(null)
    try {
      const result = await simulateWhatsAppAtribucionRegla({ frase: simPhrase.trim() })
      setSimResult(result)
    } catch (err) {
      const message = err instanceof Error ? err.message : "No se pudo simular la frase."
      setError(message)
    } finally {
      setSimulating(false)
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{isEditing ? "Editar regla" : "Nueva regla"}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Nombre</Label>
            <Input
              value={form.nombre_regla}
              onChange={(event) => setForm((prev) => ({ ...prev, nombre_regla: event.target.value }))}
              placeholder="Meta WA CDMX - Prospectos"
            />
          </div>
          <div className="space-y-2">
            <Label>Canal publicitario</Label>
            <Input
              value={form.canal_publicitario}
              onChange={(event) => setForm((prev) => ({ ...prev, canal_publicitario: event.target.value }))}
              placeholder="Meta Ads"
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label>Frase objetivo</Label>
            <Input
              value={form.frase_objetivo}
              onChange={(event) => setForm((prev) => ({ ...prev, frase_objetivo: event.target.value }))}
              placeholder="Hola, vengo del anuncio de departamentos"
            />
          </div>
          <div className="space-y-2">
            <Label>Tipo de match</Label>
            <Select
              value={form.tipo_match}
              onValueChange={(value) => setForm((prev) => ({ ...prev, tipo_match: value as WhatsAppAtribucionTipoMatch }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecciona" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="contiene">Contiene</SelectItem>
                <SelectItem value="exacta">Exacta</SelectItem>
                <SelectItem value="regex">Regex</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Prioridad</Label>
            <Input
              type="number"
              min={1}
              value={form.prioridad}
              onChange={(event) => setForm((prev) => ({ ...prev, prioridad: Number(event.target.value || 100) }))}
            />
          </div>
          <div className="space-y-2">
            <Label>Campaña publicitaria</Label>
            <Input
              value={form.campana_publicitaria}
              onChange={(event) => setForm((prev) => ({ ...prev, campana_publicitaria: event.target.value }))}
              placeholder="Campaña Febrero MX"
            />
          </div>
          <div className="space-y-2">
            <Label>Adset</Label>
            <Input
              value={form.adset}
              onChange={(event) => setForm((prev) => ({ ...prev, adset: event.target.value }))}
              placeholder="Interes inmobiliario"
            />
          </div>
          <div className="space-y-2">
            <Label>Anuncio</Label>
            <Input
              value={form.anuncio}
              onChange={(event) => setForm((prev) => ({ ...prev, anuncio: event.target.value }))}
              placeholder="Anuncio 01"
            />
          </div>
          <div className="flex items-center justify-between rounded-md border p-3">
            <Label htmlFor="regla-activa">Activa</Label>
            <Checkbox
              id="regla-activa"
              checked={form.activo}
              onCheckedChange={(checked: boolean | "indeterminate") =>
                setForm((prev) => ({ ...prev, activo: checked === true }))
              }
            />
          </div>
          <div className="flex items-end gap-2 md:col-span-2">
            <Button onClick={() => void submitForm()} disabled={saving}>
              {saving ? <IconLoader className="mr-2 h-4 w-4 animate-spin" /> : null}
              {isEditing ? "Guardar cambios" : "Crear regla"}
            </Button>
            {isEditing ? (
              <Button variant="outline" onClick={resetForm} disabled={saving}>
                Cancelar edición
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Simulador rápido</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-col gap-2 md:flex-row">
            <Input
              value={simPhrase}
              onChange={(event) => setSimPhrase(event.target.value)}
              placeholder="Pega aquí la frase inbound para probar"
            />
            <Button onClick={() => void runSimulation()} disabled={simulating || !simPhrase.trim()}>
              {simulating ? <IconLoader className="mr-2 h-4 w-4 animate-spin" /> : null}
              Simular
            </Button>
          </div>
          {simResult ? (
            <div className="rounded-md border bg-muted/30 p-3 text-sm">
              <p>
                <strong>Frase normalizada:</strong> {simResult.frase_normalizada || "-"}
              </p>
              <p>
                <strong>Match:</strong> {simResult.match ? "Sí" : "No"}
              </p>
              <p>
                <strong>Tipo aplicado:</strong> {simResult.applied_match_type || "-"}
              </p>
              <p>
                <strong>Regla:</strong> {simResult.regla?.nombre_regla || "Sin coincidencia"}
              </p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="space-y-3">
          <CardTitle>Reglas configuradas</CardTitle>
          <div className="grid gap-2 md:grid-cols-3">
            <div className="space-y-1">
              <Label>Buscar</Label>
              <Input value={filterSearch} onChange={(event) => setFilterSearch(event.target.value)} placeholder="Nombre o frase" />
            </div>
            <div className="space-y-1">
              <Label>Canal</Label>
              <Select value={filterCanal} onValueChange={setFilterCanal}>
                <SelectTrigger>
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  {channels.map((channel) => (
                    <SelectItem key={channel} value={channel}>
                      {channel}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Estado</Label>
              <Select value={filterEstado} onValueChange={setFilterEstado}>
                <SelectTrigger>
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  <SelectItem value="activos">Activos</SelectItem>
                  <SelectItem value="inactivos">Inactivos</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Button variant="outline" onClick={() => void loadRules()} disabled={loading}>
              {loading ? <IconLoader className="mr-2 h-4 w-4 animate-spin" /> : null}
              Refrescar
            </Button>
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {notice ? <p className="text-sm text-emerald-600">{notice}</p> : null}
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-2 py-2">Regla</th>
                  <th className="px-2 py-2">Canal</th>
                  <th className="px-2 py-2">Frase</th>
                  <th className="px-2 py-2">Match</th>
                  <th className="px-2 py-2">Prioridad</th>
                  <th className="px-2 py-2">Estado</th>
                  <th className="px-2 py-2 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {rules.map((rule) => {
                  const deleting = deletingId === rule.id
                  return (
                    <tr key={rule.id} className="border-b align-top">
                      <td className="px-2 py-2 font-medium">{rule.nombre_regla}</td>
                      <td className="px-2 py-2">{rule.canal_publicitario}</td>
                      <td className="px-2 py-2">{rule.frase_objetivo}</td>
                      <td className="px-2 py-2">{rule.tipo_match}</td>
                      <td className="px-2 py-2">{rule.prioridad}</td>
                      <td className="px-2 py-2">
                        <Badge variant={rule.activo ? "default" : "secondary"}>{rule.activo ? "Activa" : "Inactiva"}</Badge>
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex justify-end gap-2">
                          <Button
                            size="icon"
                            variant="outline"
                            onClick={() => setForm(toForm(rule))}
                            title="Editar regla"
                          >
                            <IconPencil className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="outline"
                            onClick={() => void handleDelete(rule)}
                            disabled={deleting}
                            title="Eliminar regla"
                          >
                            {deleting ? <IconLoader className="h-4 w-4 animate-spin" /> : <IconTrash className="h-4 w-4" />}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
                {!loading && rules.length === 0 ? (
                  <tr>
                    <td className="px-2 py-6 text-center text-sm text-muted-foreground" colSpan={7}>
                      No hay reglas con los filtros actuales.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
