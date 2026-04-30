"use client"

import { type ChangeEvent, type FormEvent, useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { ChevronDown, ChevronLeft, ChevronRight, RefreshCw, Trash2 } from "lucide-react"

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
import { Badge } from "@/components/ui/badge"
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  crearBuscadorJob,
  eliminarBuscadorJob,
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
const RESULTS_PAGE_SIZES = [200, 500, 1000] as const
const DEFAULT_JOBS_PAGE_SIZE = 28
const JOBS_PAGE_SIZE_OPTIONS = [10, 20, 30, 40, 50] as const
const EXCLUDE_DOMAIN_SELECT_PLACEHOLDER = "__exclude_domain_placeholder__"

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
  const [resultsTotal, setResultsTotal] = useState(0)
  const [resultsLimit, setResultsLimit] = useState(DEFAULT_RESULTS_LIMIT)
  const [resultsOffset, setResultsOffset] = useState(0)
  const [resultsLoading, setResultsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [jobInfo, setJobInfo] = useState<BuscadorJob | null>(null)
  const [isPolling, setIsPolling] = useState(false)
  const [lastResultsJobId, setLastResultsJobId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [segmento, setSegmento] = useState("")
  const [domainFilter, setDomainFilter] = useState("all")
  const [excludedDomains, setExcludedDomains] = useState<Set<string>>(new Set())
  const [savingProspectos, setSavingProspectos] = useState(false)
  const [jobs, setJobs] = useState<BuscadorJob[]>([])
  const [jobsLoading, setJobsLoading] = useState(false)
  const [jobsError, setJobsError] = useState<string | null>(null)
  const [jobsTotal, setJobsTotal] = useState(0)
  const [jobsOffset, setJobsOffset] = useState(0)
  const [jobsPageSize, setJobsPageSize] = useState(DEFAULT_JOBS_PAGE_SIZE)
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null)
  const [deletingJobId, setDeletingJobId] = useState<string | null>(null)

  const totalResultsCount = resultsTotal || jobInfo?.total || 0
  const pageStart = results.length ? resultsOffset + 1 : 0
  const pageEnd = resultsOffset + results.length
  const hasPreviousPage = resultsOffset > 0
  const hasNextPage = totalResultsCount ? pageEnd < totalResultsCount : results.length === resultsLimit
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

  const getEmailDomain = useCallback((email: string | null | undefined): string => {
    const normalized = (email || "").trim().toLowerCase()
    const atIndex = normalized.lastIndexOf("@")
    if (atIndex <= 0 || atIndex >= normalized.length - 1) return ""
    return normalized
      .slice(atIndex + 1)
      .trim()
      .replace(/[)>.,;:]+$/g, "")
      .replace(/^\(+/, "")
  }, [])

  const domainOptions = useMemo(() => {
    const counts = new Map<string, number>()
    for (const item of results) {
      const emailDomain = getEmailDomain(item.email)
      if (emailDomain) counts.set(emailDomain, (counts.get(emailDomain) ?? 0) + 1)
    }
    return Array.from(counts.entries())
      .filter(([, count]) => count > 2)
      .sort((a, b) => {
        if (b[1] !== a[1]) return b[1] - a[1]
        return a[0].localeCompare(b[0])
      })
      .map(([domain, count]) => ({ domain, count }))
  }, [getEmailDomain, results])

  const filteredResults = useMemo(() => {
    if (domainFilter === "all") return results
    return results.filter((item) => {
      return getEmailDomain(item.email) === domainFilter
    })
  }, [domainFilter, getEmailDomain, results])

  const excludedDomainList = useMemo(
    () => Array.from(excludedDomains).sort((a, b) => a.localeCompare(b, "es")),
    [excludedDomains]
  )

  const availableDomainsToExclude = useMemo(
    () => domainOptions.filter((item) => !excludedDomains.has(item.domain)),
    [domainOptions, excludedDomains]
  )

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
      setResultsTotal(data.total ?? job.total ?? data.items.length)
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
    setResultsTotal(0)
    setResultsOffset(0)
    setSelectedIds(new Set())
    setExcludedDomains(new Set())

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
    setResultsTotal(0)
    setResultsLimit(DEFAULT_RESULTS_LIMIT)
    setResultsOffset(0)
    setErrorMessage(null)
    setJobInfo(null)
    setLastResultsJobId(null)
    setSelectedIds(new Set())
    setExcludedDomains(new Set())
    setSegmento("")
    setDomainFilter("all")
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
      setResultsTotal(job.total ?? 0)
      setSelectedIds(new Set())
      setExcludedDomains(new Set())
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

  const handleDeleteJob = async (job: BuscadorJob) => {
    if (deletingJobId) return
    setDeletingJobId(job.id)
    try {
      await eliminarBuscadorJob(job.id)
      toast.success("Búsqueda eliminada.")
      if (selectedJobId === job.id) {
        handleClearResults()
        setJobInfo(null)
        setSelectedJobId(null)
        setSegmento("")
        setLastResultsJobId(null)
        setErrorMessage(null)
      }
      const nextOffset =
        jobsOffset > 0 && jobs.length <= 1 ? Math.max(0, jobsOffset - jobsPageSize) : jobsOffset
      void loadJobs(nextOffset)
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo eliminar la búsqueda."
      toast.error(message)
    } finally {
      setDeletingJobId(null)
    }
  }

  const toggleSelectAll = (checked: boolean | "indeterminate") => {
    if (!filteredResults.length) return
    if (checked) {
      const ids = filteredResults
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
    const allIds = (selectedIds.size ? Array.from(selectedIds) : [])
      .map((value) => value.trim())
      .filter((value) => value.length > 0)
    if (!allIds.length) {
      toast.error("Selecciona al menos un contacto para guardarlo como prospecto.")
      return
    }

    const idToDomain = new Map<string, string>()
    for (const item of results) {
      if (!item.id) continue
      idToDomain.set(item.id, getEmailDomain(item.email))
    }
    const ids = allIds.filter((id) => {
      if (!excludedDomains.size) return true
      const domain = idToDomain.get(id)
      if (!domain) return true
      return !excludedDomains.has(domain)
    })
    if (!ids.length) {
      toast.error("Con los dominios excluidos no quedan contactos para guardar.")
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

  const handleResultsLimitChange = (value: string) => {
    const parsed = Number(value)
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return
    }
    setResultsLimit(parsed)
    setResultsOffset(0)
    if (jobInfo?.status === "completed") {
      void loadJobResults(jobInfo, { limit: parsed, offset: 0, notify: false })
    }
  }

  useEffect(() => {
    if (domainFilter === "all") return
    if (!domainOptions.some((item) => item.domain === domainFilter)) {
      setDomainFilter("all")
    }
  }, [domainFilter, domainOptions])

  useEffect(() => {
    setExcludedDomains((prev) => {
      if (!prev.size) return prev
      const valid = new Set(domainOptions.map((item) => item.domain))
      const next = new Set(Array.from(prev).filter((domain) => valid.has(domain)))
      return next.size === prev.size ? prev : next
    })
  }, [domainOptions])

  const handleNextPage = () => {
    if (!jobInfo || !hasNextPage) return
    const nextOffset = resultsOffset + resultsLimit
    void loadJobResults(jobInfo, { offset: nextOffset, notify: false })
  }

  const handlePreviousPage = () => {
    if (!jobInfo || !hasPreviousPage) return
    const previousOffset = Math.max(resultsOffset - resultsLimit, 0)
    void loadJobResults(jobInfo, { offset: previousOffset, notify: false })
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

  const handleClearResults = () => {
    setResults([])
    setResultsTotal(0)
    setResultsOffset(0)
    setDomainFilter("all")
    setSelectedIds(new Set())
    setExcludedDomains(new Set())
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
              <div className="space-y-3">
                {jobs.map((job) => {
                  const domainInfo = getHistoryDomainGroup(job)
                  const crawl = job.stats?.crawl_metrics ?? null
                  const stageThreeReady = RESULT_READY_STATUSES.has(job.status)
                  const isSelectedJob = selectedJobId === job.id
                  return (
                    <div key={job.id} className="rounded-lg border">
                      <button
                        type="button"
                        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-muted/40"
                        onClick={() => handleSelectJob(job)}
                      >
                        <div className="space-y-1">
                          <p className="text-sm font-semibold break-all">Dominio: {domainInfo.label}</p>
                          <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            <span>Estado:</span>
                            <span
                              className={cn(
                                "rounded-md border px-1.5 py-0.5 text-[11px] font-medium",
                                getStatusPillClasses(job.status),
                              )}
                            >
                              {STATUS_LABELS[job.status]}
                            </span>
                            <span>Resultados encontrados:</span>
                            <span
                              className={cn(
                                "rounded-md border px-1.5 py-0.5 text-[11px] font-semibold",
                                getResultsCountPillClasses(job.total ?? 0),
                              )}
                            >
                              {job.total ?? 0}
                            </span>
                          </p>
                        </div>
                        <ChevronDown
                          className={cn("h-4 w-4 shrink-0 transition-transform", isSelectedJob && "rotate-180")}
                        />
                      </button>
                      {isSelectedJob ? (
                        <div className="border-t px-3 py-3 space-y-3">
                          <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2 lg:grid-cols-5">
                            <p>
                              Dominios únicos:{" "}
                              <span className="font-medium text-foreground">{job.stats?.unique_email_domains ?? 0}</span>
                            </p>
                            <p>
                              Hosts explorados:{" "}
                              <span className="font-medium text-foreground">{job.stats?.unique_source_hosts ?? 0}</span>
                            </p>
                            <p>
                              Páginas visitadas:{" "}
                              <span className="font-medium text-foreground">{Number(crawl?.pages_visited ?? 0)}</span>
                            </p>
                            <p>
                              HTTP 403/429:{" "}
                              <span className="font-medium text-foreground">
                                {Number(crawl?.status_403 ?? 0)} / {Number(crawl?.status_429 ?? 0)}
                              </span>
                            </p>
                            <p>
                              Tasa correos/página:{" "}
                              <span className="font-medium text-foreground">{Number(crawl?.emails_new_rate ?? 0)}</span>
                            </p>
                          </div>
                          <div className="flex items-center justify-end">
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              aria-label="Eliminar búsqueda"
                              onClick={() => handleDeleteJob(job)}
                              disabled={deletingJobId === job.id}
                              className="text-destructive hover:text-destructive"
                            >
                              {deletingJobId === job.id ? (
                                <RefreshCw className="h-4 w-4 animate-spin" />
                              ) : (
                                <Trash2 className="h-4 w-4" />
                              )}
                            </Button>
                          </div>
                          <div className="rounded-md border">
                            <div className="flex flex-col gap-2 border-b px-3 py-2 lg:flex-row lg:items-center lg:justify-between">
                              <p className="text-sm font-medium">Resultados</p>
                              <p className="text-xs text-muted-foreground">
                                {resultsLoading
                                  ? "Cargando resultados…"
                                  : totalResultsCount
                                    ? `Mostrando ${pageStart}-${pageEnd} de ${totalResultsCount} registros${domainFilter === "all" ? "" : ` · filtrados: ${filteredResults.length}`}.`
                                    : `Mostrando ${filteredResults.length} registros.`}
                              </p>
                            </div>
                            {!stageThreeReady ? (
                              <p className="p-3 text-sm text-muted-foreground">Este job aún no tiene resultados finales.</p>
                            ) : resultsLoading && selectedJobId === job.id ? (
                              <p className="p-3 text-sm text-muted-foreground">Cargando resultados…</p>
                            ) : !results.length ? (
                              <p className="p-3 text-sm text-muted-foreground">No hay resultados cargados todavía.</p>
                            ) : (
                              <div className="space-y-4 p-3">
                                <div className="flex flex-wrap items-center gap-2">
                                  <Button
                                    type="button"
                                    onClick={handleSaveProspectos}
                                    disabled={!jobInfo || savingProspectos || selectedIds.size === 0}
                                  >
                                    {savingProspectos ? "Guardando..." : "Guardar como prospectos"}
                                  </Button>
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm text-muted-foreground">Dominio de correo</span>
                                    <Select value={domainFilter} onValueChange={setDomainFilter}>
                                      <SelectTrigger className="w-[180px]">
                                        <SelectValue placeholder="Todos los dominios" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="all">Todos los dominios</SelectItem>
                                        {domainOptions.map((item) => (
                                          <SelectItem key={item.domain} value={item.domain}>
                                            {item.domain} ({item.count})
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm text-muted-foreground">Excluir al guardar</span>
                                    <div className="w-[250px] space-y-2">
                                      <Select
                                        value={EXCLUDE_DOMAIN_SELECT_PLACEHOLDER}
                                        onValueChange={(value) => {
                                          if (value === EXCLUDE_DOMAIN_SELECT_PLACEHOLDER) return
                                          setExcludedDomains((prev) => new Set(prev).add(value))
                                        }}
                                        disabled={!availableDomainsToExclude.length}
                                      >
                                        <SelectTrigger className="w-[180px]">
                                          <SelectValue placeholder="Selecciona dominio para excluir" />
                                        </SelectTrigger>
                                        <SelectContent>
                                          {availableDomainsToExclude.map((item) => (
                                            <SelectItem key={`exclude-option-${item.domain}`} value={item.domain}>
                                              {item.domain} ({item.count})
                                            </SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                      {excludedDomainList.length ? (
                                        <div className="flex flex-wrap gap-1">
                                          {excludedDomainList.map((domain) => (
                                            <Badge
                                              key={`excluded-badge-${domain}`}
                                              variant="secondary"
                                              className="cursor-pointer"
                                              onClick={() =>
                                                setExcludedDomains((prev) => {
                                                  const next = new Set(prev)
                                                  next.delete(domain)
                                                  return next
                                                })
                                              }
                                            >
                                              {domain} x
                                            </Badge>
                                          ))}
                                        </div>
                                      ) : null}
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm text-muted-foreground">Registros por página</span>
                                    <Select value={String(resultsLimit)} onValueChange={handleResultsLimitChange}>
                                      <SelectTrigger className="w-[120px]">
                                        <SelectValue placeholder="Límite" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {RESULTS_PAGE_SIZES.map((size) => (
                                          <SelectItem key={size} value={String(size)}>
                                            {size}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      onClick={handlePreviousPage}
                                      disabled={!hasPreviousPage || resultsLoading}
                                    >
                                      Anterior
                                    </Button>
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      onClick={handleNextPage}
                                      disabled={!hasNextPage || resultsLoading}
                                    >
                                      Siguiente
                                    </Button>
                                  </div>
                                </div>
                                <ScrollArea className="h-[420px] rounded-md border">
                                  <Table>
                                    <TableHeader className="sticky top-0 z-20 bg-background">
                                      <TableRow>
                                        <TableHead className="w-10 bg-background">
                                          <Checkbox
                                            checked={
                                              selectedIds.size > 0 &&
                                              selectedIds.size ===
                                                filteredResults.filter(
                                                  (item) => typeof item.id === "string" && item.id.trim().length,
                                                ).length
                                            }
                                            onCheckedChange={toggleSelectAll}
                                            aria-label="Seleccionar todos"
                                          />
                                        </TableHead>
                                        <TableHead className="bg-background">Correo</TableHead>
                                        <TableHead className="bg-background">Nombre</TableHead>
                                        <TableHead className="bg-background">Puesto</TableHead>
                                        <TableHead className="bg-background">Teléfono</TableHead>
                                        <TableHead className="bg-background">Ext.</TableHead>
                                        <TableHead className="bg-background">Dirección</TableHead>
                                        <TableHead className="bg-background">URL origen</TableHead>
                                      </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                      {filteredResults.length === 0 ? (
                                        <TableRow>
                                          <TableCell colSpan={8} className="text-center text-sm text-muted-foreground">
                                            No hay resultados para el dominio seleccionado.
                                          </TableCell>
                                        </TableRow>
                                      ) : (
                                        filteredResults.map((item, index) => (
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
                                        ))
                                      )}
                                    </TableBody>
                                  </Table>
                                </ScrollArea>
                              </div>
                            )}
                          </div>
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

function getResultsCountPillClasses(total: number): string {
  const safe = Number.isFinite(total) ? Math.max(0, total) : 0
  const scaled = Math.min(safe, 50)

  if (scaled === 0) return "border-zinc-300 bg-zinc-100 text-zinc-800"
  if (scaled <= 10) return "border-red-300 bg-red-100 text-red-800"
  if (scaled <= 20) return "border-orange-300 bg-orange-100 text-orange-800"
  if (scaled <= 35) return "border-amber-300 bg-amber-100 text-amber-800"
  return "border-emerald-300 bg-emerald-100 text-emerald-800"
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
