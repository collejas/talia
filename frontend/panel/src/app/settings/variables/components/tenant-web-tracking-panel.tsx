"use client"

import { useCallback, useEffect, useMemo, useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

type VerificationMethod = "dns" | "html_file" | "manual"
type VerificationStatus = "pending" | "verified" | "rejected" | "inactive"

type TrackingDomain = {
  id: string
  tracking_site_id: string
  domain: string
  domain_normalized: string
  verification_method: VerificationMethod
  verification_status: VerificationStatus
  verification_token?: string | null
  verified_at?: string | null
  verification_last_attempt_at?: string | null
  verification_attempt_count?: number
  verification_error_code?: string | null
  verification_error_message?: string | null
  active: boolean
}

type TrackingSite = {
  id: string
  public_site_id: string
  active: boolean
  consent_required: boolean
  last_event_at?: string | null
  domains: TrackingDomain[]
}

const COLLECTOR_ENDPOINT =
  process.env.NEXT_PUBLIC_TRACKING_COLLECTOR_URL || "https://talia.mx/api/crm/web/visit"
const TRACKING_SCRIPT_URL = "https://talia.mx/assets/js/site-tracking.js?v=20260815-cors1"

function errorMessage(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object" && "error" in payload) {
    const value = (payload as { error?: unknown }).error
    if (typeof value === "string" && value.trim()) return value
  }
  return fallback
}

function statusLabel(status: VerificationStatus) {
  if (status === "verified") return "Verificado"
  if (status === "rejected") return "Rechazado"
  if (status === "inactive") return "Inactivo"
  return "Pendiente"
}

function statusVariant(status: VerificationStatus): "default" | "secondary" | "destructive" | "outline" {
  if (status === "verified") return "default"
  if (status === "rejected") return "destructive"
  if (status === "inactive") return "secondary"
  return "outline"
}

export function TenantWebTrackingPanel() {
  const [sites, setSites] = useState<TrackingSite[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [domainBySite, setDomainBySite] = useState<Record<string, string>>({})
  const [methodBySite, setMethodBySite] = useState<Record<string, VerificationMethod>>({})
  const [scriptReadyBySite, setScriptReadyBySite] = useState<Record<string, boolean>>({})
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)
  const [copiedSiteId, setCopiedSiteId] = useState<string | null>(null)

  const loadSites = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch("/api/settings/variables/web-tracking", { cache: "no-store" })
      const payload = await response.json()
      if (!response.ok) throw new Error(errorMessage(payload, "No se pudo cargar el tracking web."))
      setSites(Array.isArray(payload?.items) ? (payload.items as TrackingSite[]) : [])
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "No se pudo cargar el tracking web." })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadSites()
  }, [loadSites])

  const createSite = async () => {
    setMessage(null)
    setSaving(true)
    try {
      const response = await fetch("/api/settings/variables/web-tracking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consent_required: true }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(errorMessage(payload, "No se pudo crear la instalación."))
      setMessage({ type: "success", text: "Instalación creada. Registra ahora el dominio del tenant." })
      await loadSites()
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "No se pudo crear la instalación." })
    } finally {
      setSaving(false)
    }
  }

  const updateSite = async (site: TrackingSite, updates: { active?: boolean; consent_required?: boolean }) => {
    setMessage(null)
    setSaving(true)
    try {
      const response = await fetch(`/api/settings/variables/web-tracking/sites/${encodeURIComponent(site.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(errorMessage(payload, "No se pudo actualizar la instalación."))
      setMessage({ type: "success", text: "Configuración actualizada." })
      await loadSites()
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "No se pudo actualizar la instalación." })
    } finally {
      setSaving(false)
    }
  }

  const addDomain = async (site: TrackingSite) => {
    const domain = (domainBySite[site.id] || "").trim()
    if (!domain) {
      setMessage({ type: "error", text: "Escribe el dominio del sitio antes de agregarlo." })
      return
    }
    setMessage(null)
    setSaving(true)
    try {
      const response = await fetch(`/api/settings/variables/web-tracking/sites/${encodeURIComponent(site.id)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          domain,
          verification_method: methodBySite[site.id] || "dns",
        }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(errorMessage(payload, "No se pudo agregar el dominio."))
      setDomainBySite((current) => ({ ...current, [site.id]: "" }))
      setMessage({ type: "success", text: "Dominio agregado y pendiente de verificación." })
      await loadSites()
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "No se pudo agregar el dominio." })
    } finally {
      setSaving(false)
    }
  }

  const deactivateDomain = async (domain: TrackingDomain) => {
    setMessage(null)
    setSaving(true)
    try {
      const response = await fetch(`/api/settings/variables/web-tracking/domains/${encodeURIComponent(domain.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: false }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(errorMessage(payload, "No se pudo desactivar el dominio."))
      setMessage({ type: "success", text: "Dominio desactivado." })
      await loadSites()
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "No se pudo desactivar el dominio." })
    } finally {
      setSaving(false)
    }
  }

  const updateDomain = async (domain: TrackingDomain, updates: { active?: boolean; verification_method?: VerificationMethod }) => {
    setMessage(null)
    setSaving(true)
    try {
      const response = await fetch(`/api/settings/variables/web-tracking/domains/${encodeURIComponent(domain.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(errorMessage(payload, "No se pudo actualizar el dominio."))
      setMessage({ type: "success", text: "Método de verificación actualizado." })
      await loadSites()
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "No se pudo actualizar el dominio." })
    } finally {
      setSaving(false)
    }
  }

  const verifyDomain = async (domain: TrackingDomain) => {
    setMessage(null)
    setSaving(true)
    try {
      const response = await fetch(`/api/settings/variables/web-tracking/domains/${encodeURIComponent(domain.id)}`, {
        method: "POST",
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(errorMessage(payload, "No se pudo probar el dominio."))
      setMessage({
        type: payload?.verified ? "success" : "error",
        text: typeof payload?.message === "string" ? payload.message : "La verificación no fue confirmada.",
      })
      await loadSites()
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "No se pudo probar el dominio." })
    } finally {
      setSaving(false)
    }
  }

  const snippetFor = useMemo(
    () => (site: TrackingSite) =>
      `<script type="module" src="${TRACKING_SCRIPT_URL}"\n  data-talia-public-site-id="${site.public_site_id}"\n  data-talia-tracking-endpoint="${COLLECTOR_ENDPOINT}"></script>`,
    [],
  )

  const copySnippet = async (site: TrackingSite) => {
    await navigator.clipboard.writeText(snippetFor(site))
    setCopiedSiteId(site.id)
    window.setTimeout(() => setCopiedSiteId(null), 1800)
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="space-y-2">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
            <div>
              <CardTitle>Página Web</CardTitle>
              <CardDescription>
                Instala un único script en el sitio del tenant para registrar sesiones, referrals y UTM en Mapa de Conversión.
              </CardDescription>
            </div>
            <Button type="button" onClick={() => void createSite()} disabled={saving}>
              {saving ? "Guardando…" : "Crear instalación"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            El identificador público no es una contraseña. La aplicación solo aceptará eventos cuando el dominio esté activo y verificado.
          </p>
          <ol className="list-decimal space-y-1 pl-5">
            <li>Crea una instalación.</li>
            <li>Agrega el dominio exacto que usará el tenant.</li>
            <li>Agrega primero el registro de verificación en el DNS del dominio.</li>
            <li>Instala el código en todas las páginas públicas del sitio.</li>
            <li>Regresa a esta pantalla y ejecuta la prueba.</li>
          </ol>
        </CardContent>
      </Card>

      {message ? (
        <p className={message.type === "error" ? "text-sm text-destructive" : "text-sm text-emerald-600"}>
          {message.text}
        </p>
      ) : null}

      {loading ? <p className="text-sm text-muted-foreground">Cargando instalaciones…</p> : null}
      {!loading && sites.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Aún no existe una instalación de tracking para este tenant.
          </CardContent>
        </Card>
      ) : null}

      {sites.map((site) => (
        <Card key={site.id}>
          <CardHeader>
            <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
              <div className="space-y-1">
                <CardTitle className="text-base">Instalación web</CardTitle>
                <CardDescription className="font-mono text-xs">{site.public_site_id}</CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <Badge variant={site.active ? "default" : "secondary"}>{site.active ? "Activa" : "Inactiva"}</Badge>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={site.active}
                    disabled={saving}
                    onChange={(event) => void updateSite(site, { active: event.target.checked })}
                  />
                  Recibir eventos
                </label>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-3 rounded-lg border border-border/60 p-4">
              <div>
                <p className="text-sm font-medium">Paso 1: configura el dominio y su DNS</p>
                <p className="text-xs text-muted-foreground">Agrega el dominio sin <span className="font-mono">https://</span> ni rutas. Solo los dominios verificados podrán atribuir visitas a este tenant.</p>
              </div>
              <div className="grid gap-3 md:grid-cols-[1fr_180px_auto] md:items-end">
                <div className="space-y-1">
                  <Label htmlFor={`tracking-domain-${site.id}`}>Dominio</Label>
                  <Input
                    id={`tracking-domain-${site.id}`}
                    value={domainBySite[site.id] || ""}
                    onChange={(event) => setDomainBySite((current) => ({ ...current, [site.id]: event.target.value }))}
                    placeholder="www.ejemplo.com"
                    disabled={saving}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`tracking-method-${site.id}`}>Verificación</Label>
                  <select
                    id={`tracking-method-${site.id}`}
                    className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
                    value={methodBySite[site.id] || "dns"}
                    onChange={(event) => setMethodBySite((current) => ({ ...current, [site.id]: event.target.value as VerificationMethod }))}
                    disabled={saving}
                  >
                    <option value="dns">DNS</option>
                    <option value="html_file">Archivo HTML</option>
                    <option value="manual">Manual</option>
                  </select>
                </div>
                <Button type="button" variant="outline" onClick={() => void addDomain(site)} disabled={saving}>
                  Agregar dominio
                </Button>
              </div>
              {site.domains.length === 0 ? (
                <p className="text-xs text-muted-foreground">No hay dominios registrados.</p>
              ) : (
                <div className="divide-y rounded-md border">
                  {site.domains.map((domain) => (
                    <div key={domain.id} className="flex flex-col gap-2 px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <span className="truncate font-mono text-xs">{domain.domain_normalized}</span>
                        <Badge variant={statusVariant(domain.verification_status)}>{statusLabel(domain.verification_status)}</Badge>
                        {domain.verification_status === "pending" ? (
                          <select
                            className="border-input bg-background h-7 rounded-md border px-2 text-xs"
                            value={domain.verification_method}
                            onChange={(event) => void updateDomain(domain, { verification_method: event.target.value as VerificationMethod })}
                            disabled={saving}
                            aria-label={`Método de verificación para ${domain.domain_normalized}`}
                          >
                            <option value="dns">DNS</option>
                            <option value="html_file">Archivo HTML</option>
                            <option value="manual">Manual</option>
                          </select>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-1">
                        {domain.active ? (
                          <Button type="button" variant="ghost" size="sm" onClick={() => void deactivateDomain(domain)} disabled={saving}>
                            Desactivar
                          </Button>
                        ) : null}
                      </div>
                      {domain.verification_method === "dns" ? (
                        <div className="w-full rounded-lg border border-amber-500/30 bg-amber-50/60 p-3 text-xs text-muted-foreground dark:bg-amber-950/20">
                          <p className="font-medium text-foreground">
                            {domain.verification_status === "verified" ? "Registro DNS de verificación" : "Cómo completar la verificación DNS"}
                          </p>
                          {domain.verification_status === "verified" ? (
                            <p className="mt-1">Este dominio ya está verificado. Conserva este registro si necesitas revisar o migrar la configuración DNS.</p>
                          ) : null}
                          <ol className="mt-2 list-decimal space-y-1 pl-5">
                            <li>Abre el panel DNS del proveedor que administra <span className="font-mono">{domain.domain_normalized}</span>.</li>
                            <li>Crea un registro de tipo <strong>TXT</strong>.</li>
                            <li>Si el panel ya muestra la zona <span className="font-mono">{domain.domain_normalized}</span>, captura solo este Host:</li>
                          </ol>
                          <div className="mt-2 space-y-1 rounded-md bg-background/80 p-2 font-mono">
                            <p className="break-all">Host: _talia-verification</p>
                            <p className="break-all">Valor: {domain.verification_token || "Desafío no disponible; vuelve a registrar el dominio."}</p>
                          </div>
                          <p className="mt-2">El resultado completo debe ser <span className="font-mono">_talia-verification.{domain.domain_normalized}</span>.</p>
                          <p className="mt-1">Si el proveedor solicita un nombre completo, usa ese resultado completo y no agregues el dominio dos veces.</p>
                          {domain.verification_status !== "verified" ? (
                            <p className="mt-1">Guarda el registro, espera la propagación y después presiona <strong>Probar DNS</strong>.</p>
                          ) : null}
                          {domain.verification_error_message ? <p className="mt-2 text-destructive">Último intento: {domain.verification_error_message}</p> : null}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-3">
              <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
                <div>
                  <p className="text-sm font-medium">Paso 2: instala el código en el sitio</p>
                  <p className="text-xs text-muted-foreground">Pégalo una vez en todas las vistas públicas, antes de cerrar <code>&lt;/body&gt;</code>.</p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={() => void copySnippet(site)}>
                  {copiedSiteId === site.id ? "Copiado" : "Copiar código"}
                </Button>
              </div>
              <Textarea value={snippetFor(site)} readOnly className="min-h-[112px] font-mono text-xs" aria-label="Código de instalación web" />
            </div>

            <div className="space-y-3 rounded-lg border border-primary/30 bg-primary/5 p-4">
              <div>
                <p className="text-sm font-medium">Paso 3: prueba la instalación</p>
                <p className="text-xs text-muted-foreground">
                  Después de guardar el TXT y publicar el código en el sitio, confirma que terminaste la instalación para habilitar la prueba.
                </p>
              </div>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={Boolean(scriptReadyBySite[site.id])}
                  disabled={saving}
                  onChange={(event) => setScriptReadyBySite((current) => ({ ...current, [site.id]: event.target.checked }))}
                />
                <span>Ya agregué el registro DNS y publiqué el código de instalación en el sitio.</span>
              </label>
              <div className="flex flex-wrap items-center gap-2">
                {site.domains.filter((domain) => domain.verification_status === "pending" && domain.verification_method === "dns").map((domain) => (
                  <Button
                    key={domain.id}
                    type="button"
                    onClick={() => void verifyDomain(domain)}
                    disabled={saving || !scriptReadyBySite[site.id]}
                  >
                    Probar DNS de {domain.domain_normalized}
                  </Button>
                ))}
                {site.domains.some((domain) => domain.verification_status === "verified") ? (
                  <p className="text-xs text-emerald-600">El DNS ya está verificado. La recepción de visitas se activará cuando el sitio publique el código.</p>
                ) : null}
                {!site.domains.some((domain) => domain.verification_status === "pending" && domain.verification_method === "dns") && !site.domains.some((domain) => domain.verification_status === "verified") ? (
                  <p className="text-xs text-muted-foreground">Agrega un dominio con verificación DNS para habilitar la prueba.</p>
                ) : null}
              </div>
            </div>

            <div className="rounded-lg bg-muted/40 p-4 text-xs text-muted-foreground">
              <p className="font-medium text-foreground">Importante</p>
              <p className="mt-1">Si el DNS sigue pendiente, la prueba mostrará el motivo exacto. Después de verificarlo, visita el sitio con una URL que incluya UTM para confirmar el evento en Mapa de Conversión.</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
