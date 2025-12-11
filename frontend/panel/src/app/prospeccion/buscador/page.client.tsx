"use client"

import { type ChangeEvent, type FormEvent, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"

import { AppViewLayout } from "@/components/layouts/app-view-layout"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  crearBuscadorJob,
  guardarBuscadorProspectos,
  obtenerBuscadorJob,
  obtenerBuscadorResultados,
  type BuscadorJob,
  type BuscadorResult,
  type BuscadorRunPayload,
  type BuscadorStats,
} from "@/lib/prospeccion/buscador-client"

type FormState = {
  sitio: "domain" | "simple" | "demo"
  url: string
  mode: "generic" | "government" | "intelligent" | "auto"
  maxPages: string
  maxDepth: string
  maxRuntime: string
  maxQueueSize: string
  maxNoNewEmails: string
  maxMemoryMb: string
}

type SummaryEntry = { label: string; count: number }

const DEFAULT_FORM_STATE: FormState = {
  sitio: "domain",
  url: "",
  mode: "generic",
  maxPages: "200",
  maxDepth: "3",
  maxRuntime: "",
  maxQueueSize: "",
  maxNoNewEmails: "",
  maxMemoryMb: "",
}

export default function BuscadorClientPage() {
  return (
    <AppViewLayout title="Prospección · Buscador web">
      <BuscadorView />
    </AppViewLayout>
  )
}

function BuscadorView() {
  const [formValues, setFormValues] = useState<FormState>(DEFAULT_FORM_STATE)
  const [isRunning, setIsRunning] = useState(false)
  const [results, setResults] = useState<BuscadorResult[]>([])
  const [stats, setStats] = useState<BuscadorStats | null>(null)
  const [durationMs, setDurationMs] = useState<number | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [jobInfo, setJobInfo] = useState<BuscadorJob | null>(null)
  const [isPolling, setIsPolling] = useState(false)
  const [lastResultsJobId, setLastResultsJobId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [segmento, setSegmento] = useState("")
  const [savingProspectos, setSavingProspectos] = useState(false)

  const canDownload = results.length > 0

  const domainSummary = useMemo<SummaryEntry[] | null>(() => {
    if (!stats?.top_email_domains?.length) return null
    return stats.top_email_domains.map((item) => ({
      label: item.domain,
      count: item.count,
    }))
  }, [stats])

  const hostSummary = useMemo<SummaryEntry[] | null>(() => {
    if (!stats?.top_source_hosts?.length) return null
    return stats.top_source_hosts.map((item) => ({
      label: item.host,
      count: item.count,
    }))
  }, [stats])

  const handleInputChange = (key: keyof FormState) => (event: ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value
    setFormValues((prev) => ({ ...prev, [key]: value }))
  }

  const handleSelectChange = <K extends keyof FormState>(key: K, value: string) => {
    setFormValues((prev) => ({ ...prev, [key]: value as FormState[K] }))
  }

  const optionalNumber = (value: string): number | undefined => {
    const trimmed = value.trim()
    if (!trimmed.length) return undefined
    const num = Number(trimmed)
    return Number.isFinite(num) ? num : undefined
  }

  const buildPayload = (): BuscadorRunPayload => {
    const payload: BuscadorRunPayload = {
      sitio: formValues.sitio,
      mode: formValues.mode,
      max_pages: optionalNumber(formValues.maxPages) ?? 200,
      max_depth: optionalNumber(formValues.maxDepth) ?? 3,
      max_runtime: optionalNumber(formValues.maxRuntime) ?? undefined,
      max_queue_size: optionalNumber(formValues.maxQueueSize) ?? undefined,
      max_no_new_emails: optionalNumber(formValues.maxNoNewEmails) ?? undefined,
      max_memory_mb: optionalNumber(formValues.maxMemoryMb) ?? undefined,
    }

    const trimmedUrl = formValues.url.trim()
    if (formValues.sitio !== "demo" && trimmedUrl.length) {
      payload.url = trimmedUrl
    }

    return payload
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setIsRunning(true)
    setErrorMessage(null)
    setResults([])
    setStats(null)
    setDurationMs(null)

    try {
      const payload = buildPayload()
      const job = await crearBuscadorJob(payload)
      setJobInfo(job)
      setLastResultsJobId(null)
      toast.success("Búsqueda programada. Te avisaremos cuando termine.")
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo ejecutar el buscador."
      setErrorMessage(message)
      toast.error(message)
    } finally {
      setIsRunning(false)
    }
  }

  useEffect(() => {
    if (!jobInfo) {
      setIsPolling(false)
      return
    }

    if (jobInfo.status === "failed") {
      setIsPolling(false)
      return
    }

    if (jobInfo.status === "completed") {
      setIsPolling(false)
      if (lastResultsJobId === jobInfo.id) {
        return
      }
      ;(async () => {
        try {
          const data = await obtenerBuscadorResultados(jobInfo.id)
          setResults(data.items)
          setStats(data.stats ?? jobInfo.stats ?? null)
          setDurationMs(jobInfo.duration_ms ?? null)
          setLastResultsJobId(jobInfo.id)
          toast.success(`Búsqueda completada con ${data.total} resultados.`)
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "No se pudo obtener los resultados del buscador."
          setErrorMessage(message)
          toast.error(message)
        }
      })()
      return
    }

    let cancelled = false
    let timeoutId: ReturnType<typeof setTimeout> | null = null
    setIsPolling(true)

    const poll = async () => {
      if (cancelled || !jobInfo) return
      try {
        const updated = await obtenerBuscadorJob(jobInfo.id)
        if (cancelled) return
        setJobInfo(updated)
      } catch (error) {
        if (cancelled) return
        const message = error instanceof Error ? error.message : "No se pudo actualizar el estado del buscador."
        setErrorMessage(message)
        toast.error(message)
      }

      if (!cancelled) {
        timeoutId = setTimeout(poll, 5000)
      }
    }

    poll()

    return () => {
      cancelled = true
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
    }
  }, [jobInfo, lastResultsJobId])

  const handleReset = () => {
    setFormValues(DEFAULT_FORM_STATE)
    setResults([])
    setStats(null)
    setDurationMs(null)
    setErrorMessage(null)
    setJobInfo(null)
    setLastResultsJobId(null)
    setSelectedIds(new Set())
    setSegmento("")
  }

  useEffect(() => {
    if (!results.length) {
      setSelectedIds(new Set())
      return
    }
    const ids = results
      .map((result) => result.id?.trim())
      .filter((value): value is string => Boolean(value))
    setSelectedIds(new Set(ids))
  }, [results])

  const toggleSelectAll = (checked: boolean | "indeterminate") => {
    if (!results.length) return
    if (checked) {
      const ids = results
        .map((result) => result.id?.trim())
        .filter((value): value is string => Boolean(value))
      setSelectedIds(new Set(ids))
    } else {
      setSelectedIds(new Set())
    }
  }

  const toggleSelect = (id: string | undefined | null, checked: boolean | "indeterminate") => {
    if (!id) return
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (checked) {
        next.add(id)
      } else {
        next.delete(id)
      }
      return next
    })
  }

  const handleSaveProspectos = async () => {
    if (!jobInfo) return
    const ids = (selectedIds.size ? Array.from(selectedIds) : [])
      .map((value) => value.trim())
      .filter((value) => value.length > 0)
    if (!ids.length) {
      toast.error("Selecciona al menos un contacto para guardarlo como prospecto.")
      return
    }
    setSavingProspectos(true)
    try {
      const response = await guardarBuscadorProspectos(jobInfo.id, {
        result_ids: ids,
        segmento: segmento.trim() || undefined,
      })
      toast.success(`Se guardaron ${response.total} prospectos.`)
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "No se pudieron guardar los prospectos."
      toast.error(message)
    } finally {
      setSavingProspectos(false)
    }
  }

  const handleDownloadJson = () => {
    if (!canDownload) return
    const blob = new Blob([JSON.stringify(results, null, 2)], {
      type: "application/json;charset=utf-8",
    })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = `buscador-resultados-${Date.now()}.json`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Configura el buscador</CardTitle>
          <CardDescription>
            Ajusta los parámetros del crawler y ejecuta la búsqueda directamente desde TalIA.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-6" onSubmit={handleSubmit}>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="sitio">Tipo de scraper</Label>
                <Select
                  value={formValues.sitio}
                  onValueChange={(value) => handleSelectChange("sitio", value)}
                >
                  <SelectTrigger id="sitio">
                    <SelectValue placeholder="Selecciona un tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="domain">Dominio completo</SelectItem>
                    <SelectItem value="simple">Página única</SelectItem>
                    <SelectItem value="demo">Demo</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  El modo dominio recorre enlaces internos dentro del mismo sitio.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="mode">Modo de crawling</Label>
                <Select
                  value={formValues.mode}
                  onValueChange={(value) => handleSelectChange("mode", value)}
                  disabled={formValues.sitio !== "domain"}
                >
                  <SelectTrigger id="mode">
                    <SelectValue placeholder="Selecciona un modo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="generic">Genérico</SelectItem>
                    <SelectItem value="government">Gobierno</SelectItem>
                    <SelectItem value="intelligent">Inteligente</SelectItem>
                    <SelectItem value="auto">Auto (detecta)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Sólo aplica para dominios; prioriza secciones de transparencia o negocios.
                </p>
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="url">URL inicial</Label>
                <Input
                  id="url"
                  placeholder="https://www.ejemplo.gob.mx"
                  value={formValues.url}
                  onChange={handleInputChange("url")}
                  disabled={formValues.sitio === "demo"}
                  required={formValues.sitio !== "demo"}
                />
                <p className="text-xs text-muted-foreground">
                  Para sitios demo no necesitas URL; para dominio o página única es obligatoria.
                </p>
              </div>
            </div>

            <Separator />

            <div className="grid gap-4 md:grid-cols-3">
              <NumberField
                id="maxPages"
                label="Máx. páginas"
                placeholder="200"
                value={formValues.maxPages}
                onChange={handleInputChange("maxPages")}
              />
              <NumberField
                id="maxDepth"
                label="Profundidad"
                placeholder="3"
                value={formValues.maxDepth}
                onChange={handleInputChange("maxDepth")}
              />
              <NumberField
                id="maxRuntime"
                label="Tiempo máximo (s)"
                placeholder="Opcional"
                value={formValues.maxRuntime}
                onChange={handleInputChange("maxRuntime")}
              />
              <NumberField
                id="maxQueueSize"
                label="Máx. cola de URLs"
                placeholder="Opcional"
                value={formValues.maxQueueSize}
                onChange={handleInputChange("maxQueueSize")}
              />
              <NumberField
                id="maxNoEmails"
                label="Límite sin correos"
                placeholder="Opcional"
                value={formValues.maxNoNewEmails}
                onChange={handleInputChange("maxNoNewEmails")}
              />
              <NumberField
                id="maxMemory"
                label="Memoria (MB)"
                placeholder="Opcional"
                value={formValues.maxMemoryMb}
                onChange={handleInputChange("maxMemoryMb")}
              />
            </div>

            {errorMessage && (
              <p className="text-sm text-destructive">
                {errorMessage}
              </p>
            )}

            <div className="flex flex-wrap gap-3">
              <Button type="submit" disabled={isRunning || isPolling}>
                {isRunning ? "Programando..." : "Ejecutar buscador"}
              </Button>
              <Button type="button" variant="outline" onClick={handleReset} disabled={isRunning}>
                Reiniciar formulario
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {jobInfo && (
        <Card>
          <CardHeader>
            <CardTitle>Estado del job</CardTitle>
            <CardDescription>ID: {jobInfo.id}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-sm">
              Estado actual:{" "}
              <span className="font-medium capitalize">{jobInfo.status}</span>
              {(jobInfo.status === "pending" || jobInfo.status === "running") && " (procesando)"}
            </p>
            {jobInfo.status === "failed" && jobInfo.error && (
              <p className="text-sm text-destructive">Error: {jobInfo.error}</p>
            )}
            {jobInfo.started_at && (
              <p className="text-xs text-muted-foreground">
                Inicio: {new Date(jobInfo.started_at).toLocaleString()}
                {jobInfo.finished_at ? ` · Fin: ${new Date(jobInfo.finished_at).toLocaleString()}` : ""}
              </p>
            )}
            {isPolling && (
              <p className="text-xs text-muted-foreground">Consultando estado…</p>
            )}
          </CardContent>
        </Card>
      )}

      {stats && (
        <Card>
          <CardHeader>
            <CardTitle>Resumen de la búsqueda</CardTitle>
            <CardDescription>
              {durationMs !== null
                ? `Duración aproximada: ${(durationMs / 1000).toFixed(1)} s`
                : "Resultados listos."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <StatCard label="Correos detectados" value={stats.emails_total} />
              <StatCard label="Dominios únicos" value={stats.unique_email_domains} />
              <StatCard label="Hosts explorados" value={stats.unique_source_hosts} />
            </div>
            <div className="grid gap-6 md:grid-cols-2">
              <SummaryList title="Top dominios de correo" items={domainSummary} />
              <SummaryList title="Top hosts fuente" items={hostSummary} />
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle>Resultados</CardTitle>
            <CardDescription>
              {results.length
                ? `Mostrando ${results.length} registros.`
                : "Ejecuta el buscador para ver los correos encontrados."}
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={handleDownloadJson} disabled={!canDownload}>
              Descargar JSON
            </Button>
            <Button variant="outline" size="sm" onClick={() => setResults([])} disabled={!canDownload}>
              Limpiar tabla
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {results.length > 0 && (
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div className="w-full md:w-1/2">
                <Label htmlFor="segmento">Segmento (opcional)</Label>
                <Input
                  id="segmento"
                  placeholder="Ej. inbound, scraping mayo"
                  value={segmento}
                  onChange={(event) => setSegmento(event.target.value)}
                />
              </div>
              <Button
                type="button"
                onClick={handleSaveProspectos}
                disabled={!jobInfo || savingProspectos || selectedIds.size === 0}
              >
                {savingProspectos ? "Guardando..." : "Guardar como prospectos"}
              </Button>
            </div>
          )}
          {results.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay resultados todavía.</p>
          ) : (
            <ScrollArea className="h-[420px] rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        checked={
                          selectedIds.size > 0 &&
                          selectedIds.size ===
                            results.filter((item) => typeof item.id === "string" && item.id.trim().length).length
                        }
                        onCheckedChange={toggleSelectAll}
                        aria-label="Seleccionar todos"
                      />
                    </TableHead>
                    <TableHead>Correo</TableHead>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Puesto</TableHead>
                    <TableHead>Teléfono</TableHead>
                    <TableHead>Ext.</TableHead>
                    <TableHead>Dirección</TableHead>
                    <TableHead>URL origen</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.map((item, index) => (
                    <TableRow key={`${item.email}-${index}`}>
                      <TableCell>
                        <Checkbox
                          checked={item.id ? selectedIds.has(item.id) : false}
                          onCheckedChange={(checked) => toggleSelect(item.id ?? undefined, checked)}
                          disabled={!item.id}
                          aria-label="Seleccionar contacto"
                        />
                      </TableCell>
                      <TableCell>
                        <span className="font-medium">{item.email}</span>
                      </TableCell>
                      <TableCell>{item.name || "—"}</TableCell>
                      <TableCell>{item.position || "—"}</TableCell>
                      <TableCell>{item.phone || "—"}</TableCell>
                      <TableCell>{item.extension || "—"}</TableCell>
                      <TableCell className="max-w-[200px] truncate">{item.address || "—"}</TableCell>
                      <TableCell className="max-w-[240px] truncate">
                        <a href={item.source_url} target="_blank" rel="noreferrer" className="text-primary underline">
                          {item.source_url}
                        </a>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function NumberField({
  id,
  label,
  placeholder,
  value,
  onChange,
}: {
  id: string
  label: string
  placeholder?: string
  value: string
  onChange: (event: ChangeEvent<HTMLInputElement>) => void
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="text"
        inputMode="numeric"
        placeholder={placeholder}
        value={value}
        onChange={onChange}
      />
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="text-xs uppercase text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold">{value}</p>
    </div>
  )
}

function SummaryList({ title, items }: { title: string; items: SummaryEntry[] | null }) {
  if (!items || items.length === 0) {
    return (
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="text-sm text-muted-foreground">Sin datos suficientes.</p>
      </div>
    )
  }

  return (
    <div>
      <p className="text-sm font-medium">{title}</p>
      <ul className="mt-2 space-y-1 text-sm">
        {items.map((item) => (
          <li key={`${item.label}-${item.count}`} className="flex items-center justify-between">
            <span className="truncate pr-2">{item.label}</span>
            <span className="font-mono text-muted-foreground">× {item.count}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
