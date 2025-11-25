"use client"

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react"
import {
  BadgeCheck,
  CheckCircle2,
  CircleSlash,
  Mail,
  Phone,
  RefreshCw,
  ShieldCheck,
  TriangleAlert,
  UserCheck,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import {
  contactarProspectos,
  listProspectos,
  type ProspectoItem,
  type ProspectoLookupResponse,
  verificarProspectos,
} from "@/lib/prospeccion/prospectos-client"

const PAGE_SIZE = 50

type FeedbackState = { type: "success" | "error" | "info"; message: string } | null

/**
 * Render the saved prospect list with filters and bulk actions (lookup + contact).
 */
export function ProspectosView() {
  const [prospectos, setProspectos] = useState<ProspectoItem[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [feedback, setFeedback] = useState<FeedbackState>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isVerifying, setIsVerifying] = useState(false)
  const [isContacting, setIsContacting] = useState(false)
  const [search, setSearch] = useState("")
  const [fuenteFilter, setFuenteFilter] = useState<"all" | "google_places" | "denue">("all")
  const [statusFilter, setStatusFilter] = useState<"any" | "pendiente" | "verificado" | "error">("any")
  const [order, setOrder] = useState<"creado" | "nombre">("creado")
  const [pagination, setPagination] = useState({ limit: PAGE_SIZE, offset: 0, total: 0 })
  const [correoAsunto, setCorreoAsunto] = useState("Primer contacto")
  const [correoCuerpo, setCorreoCuerpo] = useState(
    "Hola, revisé su empresa y me gustaría compartir cómo podemos ayudarles a crecer. ¿Agendamos una llamada?",
  )
  const [whatsappMensaje, setWhatsappMensaje] = useState(
    "Hola, ¿cómo estás? Te escribo para presentarte una propuesta que podría ayudar a tu negocio. ¿Podemos hablar?",
  )
  const [llamadaNotas, setLlamadaNotas] = useState("Llamar en horario laboral y validar interés")

  const totalPages = Math.max(1, Math.ceil(pagination.total / pagination.limit))
  const currentPage = Math.floor(pagination.offset / pagination.limit) + 1

  const selectedCount = selectedIds.size

  const loadProspectos = useCallback(async () => {
    setIsLoading(true)
    const fuente = fuenteFilter === "all" ? undefined : fuenteFilter
    const lookupStatus = statusFilter === "any" ? undefined : statusFilter
    try {
      const response = await listProspectos({
        limit: pagination.limit,
        offset: pagination.offset,
        search: search.trim() || undefined,
        fuente,
        lookupStatus,
        order,
      })
      setProspectos(response.items ?? [])
      setPagination((prev) => ({
        ...prev,
        total: response.total ?? response.items.length,
        limit: response.limit ?? prev.limit,
        offset: response.offset ?? prev.offset,
      }))
      setSelectedIds(new Set())
      setFeedback(null)
    } catch (error) {
      setFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "No fue posible cargar los prospectos.",
      })
    } finally {
      setIsLoading(false)
    }
  }, [fuenteFilter, order, pagination.limit, pagination.offset, search, statusFilter])

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadProspectos()
    }, 250)
    return () => clearTimeout(timer)
  }, [loadProspectos])

  const handleToggleSelectAll = useCallback(
    (checked: boolean) => {
      if (!checked) {
        setSelectedIds(new Set())
        return
      }
      const ids = new Set(prospectos.map((item) => item.id))
      setSelectedIds(ids)
    },
    [prospectos],
  )

  const handleToggleSelect = useCallback((id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (checked) {
        next.add(id)
      } else {
        next.delete(id)
      }
      return next
    })
  }, [])

  const goToPage = useCallback(
    (pageIndex: number) => {
      const clamped = Math.min(Math.max(pageIndex, 1), totalPages)
      setPagination((prev) => ({ ...prev, offset: (clamped - 1) * prev.limit }))
    },
    [totalPages],
  )

  const handleVerify = useCallback(async () => {
    if (!selectedIds.size) {
      setFeedback({ type: "info", message: "Selecciona al menos un prospecto para verificar." })
      return
    }
    setIsVerifying(true)
    try {
      const payload = { prospecto_ids: Array.from(selectedIds), country_code: "MX", reintentar: true }
      const result: ProspectoLookupResponse = await verificarProspectos(payload)
      setFeedback({ type: "success", message: `Se procesaron ${result.procesados} prospectos.` })
      await loadProspectos()
    } catch (error) {
      setFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "No fue posible verificar los teléfonos.",
      })
    } finally {
      setIsVerifying(false)
    }
  }, [loadProspectos, selectedIds])

  const handleContactar = useCallback(async () => {
    if (!selectedIds.size) {
      setFeedback({ type: "info", message: "Selecciona al menos un prospecto para contactar." })
      return
    }
    const correoAsuntoValue = correoAsunto.trim()
    const correoCuerpoValue = correoCuerpo.trim()
    const whatsappValue = whatsappMensaje.trim()
    const llamadaValue = llamadaNotas.trim()
    if (!correoCuerpoValue && !whatsappValue && !llamadaValue) {
      setFeedback({
        type: "info",
        message: "Agrega al menos un canal (correo, WhatsApp o llamada) para enviar el contacto.",
      })
      return
    }
    setIsContacting(true)
    try {
      const payload = {
        prospecto_ids: Array.from(selectedIds),
        correo_asunto: correoAsuntoValue || undefined,
        correo_cuerpo: correoCuerpoValue || undefined,
        whatsapp_mensaje: whatsappValue || undefined,
        llamada_notas: llamadaValue || undefined,
      }
      const result = await contactarProspectos(payload)
      setFeedback({ type: "success", message: `Se registraron ${result.contactos.length} contactos.` })
      await loadProspectos()
    } catch (error) {
      setFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "No fue posible programar los contactos.",
      })
    } finally {
      setIsContacting(false)
    }
  }, [correoAsunto, correoCuerpo, whatsappMensaje, llamadaNotas, loadProspectos, selectedIds])

  const resumen = useMemo(() => {
    const whatsappReady = prospectos.filter((p) => p.whatsapp_permitido).length
    const llamadaReady = prospectos.filter((p) => p.llamada_permitida).length
    const verificados = prospectos.filter((p) => (p.lookup_status || "").toLowerCase() === "verificado").length
    return { whatsappReady, llamadaReady, verificados }
  }, [prospectos])

  return (
    <div className="space-y-6">
      {feedback ? (
        <div
          className={cn(
            "rounded-lg border px-4 py-3 text-sm",
            feedback.type === "error" && "border-destructive/70 bg-destructive/10 text-destructive",
            feedback.type === "success" && "border-emerald-500/60 bg-emerald-500/10 text-emerald-900 dark:text-emerald-200",
            feedback.type === "info" && "border-primary/40 bg-primary/5 text-primary",
          )}
        >
          {feedback.message}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Card>
          <CardHeader className="gap-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <UserCheck className="h-4 w-4" /> Prospectos guardados
            </CardTitle>
            <CardDescription>Administra los prospectos capturados desde Google y DENUE.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1">
                <Label htmlFor="search">Búsqueda</Label>
                <Input
                  id="search"
                  placeholder="Nombre, giro, teléfono o correo"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label>Fuente</Label>
                <Select value={fuenteFilter} onValueChange={(value) => setFuenteFilter(value as typeof fuenteFilter)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Todas las fuentes" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    <SelectItem value="google_places">Google Places</SelectItem>
                    <SelectItem value="denue">DENUE</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Estatus de lookup</Label>
                <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as typeof statusFilter)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Todos</SelectItem>
                    <SelectItem value="pendiente">Pendiente</SelectItem>
                    <SelectItem value="verificado">Verificado</SelectItem>
                    <SelectItem value="error">Error / sin número</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Ordenar</Label>
                <Select value={order} onValueChange={(value) => setOrder(value as typeof order)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Orden" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="creado">Más recientes</SelectItem>
                    <SelectItem value="nombre">Nombre</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => void loadProspectos()} disabled={isLoading}>
                <RefreshCw className={cn("mr-2 h-4 w-4", isLoading && "animate-spin")} />
                Refrescar
              </Button>
              <Badge variant="secondary">{pagination.total} resultados</Badge>
              <Badge variant="outline">{selectedCount} seleccionados</Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="gap-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="h-4 w-4" /> Disponibilidad
            </CardTitle>
            <CardDescription>WhatsApp, llamadas y verificaciones completadas.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-3">
            <MetricChip label="WhatsApp" value={resumen.whatsappReady} icon={<Phone className="h-3.5 w-3.5" />} />
            <MetricChip label="Llamadas" value={resumen.llamadaReady} icon={<Phone className="h-3.5 w-3.5" />} />
            <MetricChip label="Verificados" value={resumen.verificados} icon={<BadgeCheck className="h-3.5 w-3.5" />} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="space-y-1">
          <CardTitle className="flex items-center gap-2 text-base">
            <Mail className="h-4 w-4" /> Mensajes y notas para los canales
          </CardTitle>
          <CardDescription>Personaliza el correo, WhatsApp y notas de llamada que se enviarán.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="correoAsunto">Asunto del correo</Label>
            <Input
              id="correoAsunto"
              value={correoAsunto}
              onChange={(event) => setCorreoAsunto(event.target.value)}
              placeholder="Asunto"
            />
            <Label htmlFor="correoCuerpo">Contenido del correo</Label>
            <Textarea
              id="correoCuerpo"
              value={correoCuerpo}
              onChange={(event) => setCorreoCuerpo(event.target.value)}
              placeholder="Mensaje de correo"
              rows={5}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="whatsapp">WhatsApp</Label>
            <Textarea
              id="whatsapp"
              value={whatsappMensaje}
              onChange={(event) => setWhatsappMensaje(event.target.value)}
              placeholder="Mensaje a enviar por WhatsApp"
              rows={7}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="llamada">Notas para llamada</Label>
            <Textarea
              id="llamada"
              value={llamadaNotas}
              onChange={(event) => setLlamadaNotas(event.target.value)}
              placeholder="Notas para el equipo de llamadas"
              rows={7}
            />
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" onClick={() => setWhatsappMensaje("Hola, ¿podemos agendar una llamada de 10 minutos esta semana?")}>
                Usar mensaje corto
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setCorreoCuerpo("Hola, vi su negocio y tengo una propuesta para aumentar su captación digital. ¿Cuándo podemos conversar?")}>
                Sugerir correo
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <CardTitle className="text-base">Listado de prospectos</CardTitle>
            <CardDescription>Selecciona, verifica y programa contactos en lote.</CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={handleVerify} disabled={isVerifying || isLoading}>
              <RefreshCw className={cn("mr-2 h-4 w-4", isVerifying && "animate-spin")} />
              Verificar teléfonos
            </Button>
            <Button size="sm" onClick={handleContactar} disabled={isContacting || isLoading}>
              <Mail className={cn("mr-2 h-4 w-4", isContacting && "animate-spin")} />
              Programar contacto
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      aria-label="Seleccionar todos"
                      checked={selectedCount > 0 && selectedCount === prospectos.length}
                      indeterminate={selectedCount > 0 && selectedCount < prospectos.length}
                      onCheckedChange={(value) => handleToggleSelectAll(Boolean(value))}
                    />
                  </TableHead>
                  <TableHead>Prospecto</TableHead>
                  <TableHead>Contacto</TableHead>
                  <TableHead>Fuente</TableHead>
                  <TableHead>Estatus</TableHead>
                  <TableHead className="text-right">Creado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-6 text-center text-sm text-muted-foreground">
                      Cargando prospectos...
                    </TableCell>
                  </TableRow>
                ) : prospectos.length ? (
                  prospectos.map((item) => {
                    const isSelected = selectedIds.has(item.id)
                    return (
                      <TableRow key={item.id} className={cn(isSelected && "bg-primary/5")}> 
                        <TableCell>
                          <Checkbox
                            aria-label="Seleccionar prospecto"
                            checked={isSelected}
                            onCheckedChange={(value) => handleToggleSelect(item.id, Boolean(value))}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <div className="font-medium leading-tight">{item.display_name || "Sin nombre"}</div>
                            <div className="text-xs text-muted-foreground">{item.actividad || "Sin giro"}</div>
                            {item.address ? (
                              <div className="text-xs text-muted-foreground">{item.address}</div>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1 text-sm">
                            <div className="flex items-center gap-2">
                              <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                              <span>{item.phone_e164 || item.phone || "Sin teléfono"}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                              <span>{item.email || "Sin correo"}</span>
                            </div>
                            <div className="flex flex-wrap gap-2 text-xs">
                              {item.whatsapp_permitido ? (
                                <Badge variant="default">WhatsApp</Badge>
                              ) : (
                                <Badge variant="outline">WhatsApp no</Badge>
                              )}
                              {item.llamada_permitida ? (
                                <Badge variant="secondary">Llamada</Badge>
                              ) : (
                                <Badge variant="outline">Llamada no</Badge>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1 text-sm">
                            <Badge variant={item.fuente === "google_places" ? "default" : "secondary"}>
                              {item.fuente === "google_places" ? "Google" : "DENUE"}
                            </Badge>
                            {item.segmento ? <Badge variant="outline">{item.segmento}</Badge> : null}
                          </div>
                        </TableCell>
                        <TableCell>
                          <LookupBadge status={item.lookup_status} carrierType={item.carrier_type} />
                        </TableCell>
                        <TableCell className="text-right text-sm text-muted-foreground">
                          {formatDate(item.creado_en)}
                        </TableCell>
                      </TableRow>
                    )
                  })
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="py-6 text-center text-sm text-muted-foreground">
                      No hay prospectos cargados aún. Selecciona resultados en Google o DENUE y guárdalos como prospectos.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
            <div>
              Página {currentPage} de {totalPages}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => goToPage(currentPage - 1)} disabled={currentPage <= 1}>
                Anterior
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => goToPage(currentPage + 1)}
                disabled={currentPage >= totalPages}
              >
                Siguiente
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

/**
 * Render a badge reflecting lookup status and carrier type.
 */
function LookupBadge({ status, carrierType }: { status?: string | null; carrierType?: string | null }) {
  const normalized = (status || "pendiente").toLowerCase()
  if (normalized === "verificado") {
    const carrier = carrierType ? carrierType.toLowerCase() : ""
    const label = carrier ? `Verificado (${carrier})` : "Verificado"
    return (
      <Badge variant="default" className="flex items-center gap-1">
        <CheckCircle2 className="h-3.5 w-3.5" /> {label}
      </Badge>
    )
  }
  if (normalized === "error" || normalized === "sin_numero") {
    return (
      <Badge variant="destructive" className="flex items-center gap-1">
        <TriangleAlert className="h-3.5 w-3.5" /> {normalized === "sin_numero" ? "Sin número" : "Error"}
      </Badge>
    )
  }
  return (
    <Badge variant="outline" className="flex items-center gap-1">
      <CircleSlash className="h-3.5 w-3.5" /> Pendiente
    </Badge>
  )
}

/**
 * Show a small metric chip with icon and value.
 */
function MetricChip({ label, value, icon }: { label: string; value: number; icon: ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border p-3">
      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">{icon}</div>
      <div>
        <div className="text-sm text-muted-foreground">{label}</div>
        <div className="text-lg font-semibold">{value}</div>
      </div>
    </div>
  )
}

/**
 * Format ISO dates in a compact, locale-friendly way.
 */
function formatDate(value?: string | null): string {
  if (!value) return "-"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "-"
  return new Intl.DateTimeFormat("es-MX", { month: "short", day: "numeric" }).format(date)
}

