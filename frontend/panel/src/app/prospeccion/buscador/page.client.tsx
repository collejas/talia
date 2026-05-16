"use client"

import { type ChangeEvent, type FormEvent, useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { ChevronLeft, ChevronRight } from "lucide-react"

import { ProspeccionViewLayout } from "@/components/layouts/prospeccion-view-layout"
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
import { cn } from "@/lib/utils"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import {
  crearBuscadorJob,
  guardarBuscadorProspectos,
  obtenerBuscadorJob,
  obtenerBuscadorResultados,
  listarBuscadorJobs,
  type BuscadorJob,
  type BuscadorJobResults,
  type BuscadorJobStatus,
  type BuscadorResult,
  type BuscadorRunPayload,
} from "@/lib/prospeccion/buscador-client"

type FormState = {
  sitio: "domain" | "simple" | "demo"
  url: string
  mode: "generic" | "government" | "intelligent" | "auto" | "stealth"
  maxPages: string
  maxDepth: string
  maxWorkers: string
  maxRuntime: string
  maxQueueSize: string
  maxNoNewEmails: string
  maxMemoryMb: string
}

const DEFAULT_FORM_STATE: FormState = {
  sitio: "domain",
  url: "",
  mode: "generic",
  maxPages: "200",
  maxDepth: "3",
  maxWorkers: "3",
  maxRuntime: "",
  maxQueueSize: "",
  maxNoNewEmails: "",
  maxMemoryMb: "",
}

const DEFAULT_RESULTS_LIMIT = 1000
const DEFAULT_JOBS_PAGE_SIZE = 28
const JOBS_PAGE_SIZE_OPTIONS = [10, 20, 30, 40, 50] as const

const STATUS_LABELS: Record<BuscadorJobStatus, string> = {
  pending: "Pendiente",
  running: "En progreso",
  pausing: "Pausando",
  canceling: "Cancelando",
  completed: "Completado",
  failed: "Fallido",
  paused: "Pausado",
  canceled: "Cancelado",
}

const RESULT_READY_STATUSES = new Set<BuscadorJobStatus>(["completed", "paused", "canceled"])

export default function BuscadorClientPage() {
  return (
    <ProspeccionViewLayout title="Prospección · Buscador web">
      <BuscadorView />
    </ProspeccionViewLayout>
  )
}

function BuscadorView() {
  const [formValues, setFormValues] = useState<FormState>(DEFAULT_FORM_STATE)
  const [isRunning, setIsRunning] = useState(false)
  const [results, setResults] = useState<BuscadorResult[]>([])
  const [resultsLimit, setResultsLimit] = useState(DEFAULT_RESULTS_LIMIT)
  const [resultsOffset, setResultsOffset] = useState(0)
  const [resultsLoading, setResultsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [jobInfo, setJobInfo] = useState<BuscadorJob | null>(null)
  const [isPolling, setIsPolling] = useState(false)
  const [lastResultsJobId, setLastResultsJobId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [segmento, setSegmento] = useState("")
  const [savingProspectos, setSavingProspectos] = useState(false)
  const [jobs, setJobs] = useState<BuscadorJob[]>([])
  const [jobsLoading, setJobsLoading] = useState(false)
  const [jobsError, setJobsError] = useState<string | null>(null)
  const [jobsTotal, setJobsTotal] = useState(0)
  const [jobsOffset, setJobsOffset] = useState(0)
  const [jobsPageSize, setJobsPageSize] = useState(DEFAULT_JOBS_PAGE_SIZE)
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null)

  const jobsPageStart = jobs.length ? jobsOffset + 1 : 0
  const jobsPageEnd = jobsOffset + jobs.length
  const jobsTotalPages = Math.max(1, Math.ceil(jobsTotal / jobsPageSize))
  const jobsCurrentPage = Math.floor(jobsOffset / jobsPageSize) + 1
  const jobsHasPreviousPage = jobsOffset > 0
  const jobsHasNextPage = jobsOffset + jobs.length < jobsTotal
  const jobsRangeDescription =
    jobsTotal > 0
      ? `Mostrando ${jobsPageStart}-${jobsPageEnd} de ${jobsTotal}`
      : jobsLoading
        ? "Cargando historial…"
        : "Sin ejecuciones registradas."

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

  const loadJobs = useCallback(async (offsetValue = 0, limitValue = jobsPageSize) => {
    const safeOffset = Math.max(0, offsetValue)
    const safeLimit = Math.max(1, Math.min(limitValue, 50))
    setJobsLoading(true)
    setJobsError(null)
    try {
      const listado = await listarBuscadorJobs(safeLimit, safeOffset)
      setJobs(listado.items)
      setJobsTotal(listado.total ?? listado.items.length)
      setJobsOffset(listado.offset ?? safeOffset)
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo cargar el historial del buscador."
      setJobsError(message)
      toast.error(message)
    } finally {
      setJobsLoading(false)
    }
  }, [jobsPageSize])

  useEffect(() => {
    void loadJobs(0)
  }, [loadJobs])

  type ApplyJobResultsOptions = {
    resetSelection?: boolean
    markAsFinal?: boolean
  }

  const applyJobResults = useCallback(
    (job: BuscadorJob, data: BuscadorJobResults, options?: ApplyJobResultsOptions) => {
      const resetSelection = options?.resetSelection ?? true
      setSelectedJobId(job.id)
      setResults(data.items)
      if (resetSelection) {
        const ids = data.items
          .map((result) => result.id?.trim())
          .filter((value): value is string => Boolean(value))
        setSelectedIds(new Set(ids))
      }
      if (options?.markAsFinal) {
        setLastResultsJobId(job.id)
      }
    },
    [],
  )

  const loadJobResults = useCallback(
    async (
      job: BuscadorJob,
      options?: {
        notify?: boolean
        resetSelection?: boolean
        markAsFinal?: boolean
        offset?: number
        limit?: number
      },
    ) => {
      const desiredLimit = options?.limit ?? resultsLimit
      const safeLimit = Math.max(1, desiredLimit)
      const desiredOffset = options?.offset ?? resultsOffset
      const safeOffset = Math.max(0, desiredOffset)
      setResultsLoading(true)
      try {
        const data = await obtenerBuscadorResultados(job.id, {
          limit: safeLimit,
          offset: safeOffset,
        })
        setResultsOffset(safeOffset)
        if (safeLimit !== resultsLimit) {
          setResultsLimit(safeLimit)
        }
        applyJobResults(job, data, {
          resetSelection: options?.resetSelection ?? true,
          markAsFinal: options?.markAsFinal ?? job.status === "completed",
        })
        if (options?.notify ?? true) {
          toast.success(`Búsqueda completada con ${data.total} resultados.`)
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "No se pudo obtener los resultados del buscador."
        setErrorMessage(message)
        toast.error(message)
      } finally {
        setResultsLoading(false)
      }
    },
    [applyJobResults, resultsLimit, resultsOffset],
  )

  const buildPayload = (): BuscadorRunPayload => {
    const payload: BuscadorRunPayload = {
      sitio: formValues.sitio,
      mode: formValues.mode,
      max_pages: optionalNumber(formValues.maxPages) ?? 200,
      max_depth: optionalNumber(formValues.maxDepth) ?? 3,
      max_workers: optionalNumber(formValues.maxWorkers) ?? 3,
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
    setResultsOffset(0)
    setSelectedIds(new Set())

    try {
      const payload = buildPayload()
      const job = await crearBuscadorJob(payload)
      setJobInfo(job)
      setSelectedJobId(job.id)
      setLastResultsJobId(null)
      toast.success("Búsqueda programada. Te avisaremos cuando termine.")
      void loadJobs(0)
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

    if (RESULT_READY_STATUSES.has(jobInfo.status)) {
      setIsPolling(false)
      if (lastResultsJobId === jobInfo.id) {
        return
      }
      void loadJobResults(jobInfo, { offset: 0 })
      void loadJobs(0)
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
  }, [jobInfo, lastResultsJobId, loadJobResults, loadJobs])

  const handleReset = () => {
    setFormValues(DEFAULT_FORM_STATE)
    setResults([])
    setResultsLimit(DEFAULT_RESULTS_LIMIT)
    setResultsOffset(0)
    setErrorMessage(null)
    setJobInfo(null)
    setLastResultsJobId(null)
    setSelectedIds(new Set())
    setSegmento("")
    setSelectedJobId(null)
    setResultsLoading(false)
  }

  const handleSelectJob = useCallback(
    (job: BuscadorJob) => {
      setJobInfo(job)
      setSelectedJobId(job.id)
      setErrorMessage(null)
      setResultsOffset(0)
      setResults([])
      setSelectedIds(new Set())
      if (!RESULT_READY_STATUSES.has(job.status)) {
        setLastResultsJobId(null)
        setResultsLoading(false)
        toast.message("Esta búsqueda aún no termina. Vuelve a intentarlo más tarde.")
        return
      }
      setLastResultsJobId(job.id)
      void loadJobResults(job, { offset: 0, notify: false, markAsFinal: true })
    },
    [loadJobResults],
  )

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
    const segmentoValue = segmento.trim() || undefined
    const ids = Array.from(selectedIds)
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
        segmento: segmentoValue,
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

  const handleJobsNextPage = () => {
    if (jobsLoading || !jobsHasNextPage) return
    const nextOffset = jobsOffset + jobsPageSize
    void loadJobs(nextOffset)
  }

  const handleJobsPreviousPage = () => {
    if (jobsLoading || !jobsHasPreviousPage) return
    const prevOffset = Math.max(0, jobsOffset - jobsPageSize)
    void loadJobs(prevOffset)
  }

  const handleJobsPageChange = (value: string) => {
    const page = Number(value)
    if (!Number.isFinite(page) || page < 1) return
    const safePage = Math.min(page, jobsTotalPages)
    const nextOffset = (safePage - 1) * jobsPageSize
    void loadJobs(nextOffset)
  }

  const handleJobsPageSizeChange = (value: string) => {
    const parsed = Number(value)
    if (!Number.isFinite(parsed) || parsed < 1) return
    const safeSize = Math.min(parsed, 50)
    setJobsPageSize(safeSize)
    setJobsOffset(0)
    void loadJobs(0, safeSize)
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
                <SelectItem value="stealth">Evasión WAF (beta)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Sólo aplica para dominios; prioriza secciones de transparencia o negocios. El modo evasión WAF
                  intenta identificar headers tipo navegador para sitios protegidos.
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
                id="maxWorkers"
                label="Workers concurrentes"
                placeholder="3"
                value={formValues.maxWorkers}
                onChange={handleInputChange("maxWorkers")}
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

      <Card>
        <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle>Historial de búsquedas web</CardTitle>
            <CardDescription>Haz clic en una búsqueda para abrir directamente sus resultados.</CardDescription>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
            <p className="text-xs text-muted-foreground sm:text-sm">{jobsRangeDescription}</p>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => void loadJobs(jobsOffset)} disabled={jobsLoading}>
                {jobsLoading ? "Actualizando..." : "Actualizar"}
              </Button>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground sm:text-sm">Página</span>
                <Select value={String(jobsCurrentPage)} onValueChange={handleJobsPageChange}>
                  <SelectTrigger className="w-[90px]">
                    <SelectValue placeholder="Página" />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: jobsTotalPages }, (_, index) => index + 1).map((page) => (
                      <SelectItem key={`jobs-page-${page}`} value={String(page)}>
                        {page}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground sm:text-sm">Por página</span>
                <Select value={String(jobsPageSize)} onValueChange={handleJobsPageSizeChange}>
                  <SelectTrigger className="w-[95px]">
                    <SelectValue placeholder="Límite" />
                  </SelectTrigger>
                  <SelectContent>
                    {JOBS_PAGE_SIZE_OPTIONS.map((size) => (
                      <SelectItem key={`jobs-size-${size}`} value={String(size)}>
                        {size}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Página anterior"
                  onClick={handleJobsPreviousPage}
                  disabled={!jobsHasPreviousPage || jobsLoading}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Página siguiente"
                  onClick={handleJobsNextPage}
                  disabled={!jobsHasNextPage || jobsLoading}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {jobsError ? <p className="text-sm text-destructive">{jobsError}</p> : null}
          {jobsLoading && !jobs.length ? (
            <p className="text-sm text-muted-foreground">Cargando historial…</p>
          ) : null}
          {jobs.length ? (
            <ScrollArea className="h-[360px] pr-2">
              <div className="space-y-1">
                {jobs.map((job) => {
                  const domainInfo = getHistoryDomainGroup(job)
                  const isSelectedJob = selectedJobId === job.id
                  const jobReady = RESULT_READY_STATUSES.has(job.status)
                  return (
                    <div key={job.id}>
                      <button
                        type="button"
                        className={cn(
                          "flex w-full items-center justify-between gap-3 px-2 py-2 text-left hover:bg-muted/40",
                          isSelectedJob && "bg-muted/50",
                        )}
                        onClick={() => handleSelectJob(job)}
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{domainInfo.label}</p>
                          <p className="text-xs text-muted-foreground">
                            {STATUS_LABELS[job.status]} · {job.total ?? 0} resultados
                          </p>
                        </div>
                        <span
                          className={cn(
                            "shrink-0 rounded-md border px-1.5 py-0.5 text-[11px] font-medium",
                            getStatusPillClasses(job.status),
                          )}
                        >
                          {STATUS_LABELS[job.status]}
                        </span>
                      </button>
                      {isSelectedJob ? (
                        <div className="ml-4 border-l pl-3 py-2">
                          {!jobReady ? (
                            <p className="text-sm text-muted-foreground">Este job aún no tiene resultados finales.</p>
                          ) : resultsLoading ? (
                            <p className="text-sm text-muted-foreground">Cargando resultados…</p>
                          ) : !results.length ? (
                            <p className="text-sm text-muted-foreground">No hay resultados para mostrar.</p>
                          ) : (
                            <div className="space-y-2">
                              <div className="flex items-center gap-2">
                                <Checkbox
                                  checked={
                                    selectedIds.size > 0 &&
                                    selectedIds.size ===
                                      results.filter((item) => typeof item.id === "string" && item.id.trim().length).length
                                  }
                                  onCheckedChange={toggleSelectAll}
                                  aria-label="Seleccionar todos"
                                />
                                <Button
                                  type="button"
                                  size="sm"
                                  onClick={handleSaveProspectos}
                                  disabled={!jobInfo || savingProspectos || selectedIds.size === 0}
                                >
                                  {savingProspectos ? "Guardando..." : "Guardar como prospectos"}
                                </Button>
                              </div>
                              <div className="space-y-1">
                                {results.map((item, index) => (
                                  <div key={`${item.email}-${index}`} className="flex items-start gap-2 text-sm">
                                    <Checkbox
                                      checked={item.id ? selectedIds.has(item.id) : false}
                                      onCheckedChange={(checked) => toggleSelect(item.id ?? undefined, checked)}
                                      disabled={!item.id}
                                      aria-label="Seleccionar contacto"
                                    />
                                    <div className="min-w-0 flex-1">
                                      <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
                                        <span className="font-medium">{item.email}</span>
                                        <span className="text-muted-foreground">{item.name || "—"}</span>
                                        <span className="text-muted-foreground">{item.position || "—"}</span>
                                        <span className="text-muted-foreground">{item.phone || "—"}</span>
                                        <span className="text-muted-foreground">{item.extension || "—"}</span>
                                      </div>
                                      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                                        <span>{item.address || "—"}</span>
                                        <a href={item.source_url} target="_blank" rel="noreferrer" className="text-primary underline">
                                          {item.source_url}
                                        </a>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            </ScrollArea>
          ) : (
            <p className="text-sm text-muted-foreground">
              {jobsLoading ? "Cargando historial…" : "Aún no tienes ejecuciones registradas."}
            </p>
          )}
        </CardContent>
      </Card>

    </div>
  )
}

function getHistoryDomainGroup(job: BuscadorJob): { key: string; label: string } {
  const rawUrl = (job.params.url || "").trim()
  if (!rawUrl || job.params.sitio === "demo") {
    return { key: "__sin_dominio__", label: "Sin dominio / demo" }
  }
  const normalized = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`
  try {
    const host = new URL(normalized).hostname.toLowerCase()
    return { key: host || "__sin_dominio__", label: host || "Sin dominio" }
  } catch {
    return { key: rawUrl.toLowerCase(), label: rawUrl }
  }
}

function getStatusPillClasses(status: BuscadorJobStatus): string {
  switch (status) {
    case "completed":
      return "border-emerald-300 bg-emerald-100 text-emerald-800"
    case "running":
      return "border-sky-300 bg-sky-100 text-sky-800"
    case "pending":
    case "pausing":
    case "canceling":
      return "border-amber-300 bg-amber-100 text-amber-800"
    case "paused":
      return "border-slate-300 bg-slate-100 text-slate-800"
    case "failed":
      return "border-red-300 bg-red-100 text-red-800"
    case "canceled":
      return "border-zinc-300 bg-zinc-100 text-zinc-800"
    default:
      return "border-slate-300 bg-slate-100 text-slate-800"
  }
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
