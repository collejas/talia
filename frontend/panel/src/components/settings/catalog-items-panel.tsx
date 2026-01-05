"use client"

import { useCallback, useEffect, useMemo, useState, useTransition } from "react"
import { useForm, useWatch } from "react-hook-form"
import {
  IconArchive,
  IconCircleCheck,
  IconCircleX,
  IconPencil,
  IconPlus,
  IconRefresh,
  IconTrash,
} from "@tabler/icons-react"

import {
  type CatalogItem,
  type CatalogItemInput,
  createCatalogItem,
  deleteCatalogItem,
  fetchCatalogItems,
  updateCatalogItem,
} from "@/app/settings/catalogo/actions"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import {
  MediaEditor,
  buildMetadataWithMedia,
  normalizeMediaList,
  type MediaEntry,
} from "@/components/settings/productos/media-editor"

type StatusBanner = { type: "success" | "error"; message: string } | null

type LineaOption = {
  id: string
  nombre: string
}

type FamiliaOption = {
  id: string
  nombre: string
  lineaId: string | null
}

type ModeloOption = {
  id: string
  nombre: string
  familiaId: string | null
}

type CatalogItemFormValues = {
  nombre: string
  slug: string
  tipo: "producto" | "servicio" | "paquete"
  descripcionCorta: string
  descripcionLarga: string
  unidad: string
  precioBase: string
  moneda: string
  requiereFactura: boolean
  activo: boolean
  claveSat: string
  unidadSat: string
  lineaId: string
  familiaId: string
  modeloId: string
}

const EMPTY_FORM: CatalogItemFormValues = {
  nombre: "",
  slug: "",
  tipo: "servicio",
  descripcionCorta: "",
  descripcionLarga: "",
  unidad: "unidad",
  precioBase: "",
  moneda: "MXN",
  requiereFactura: false,
  activo: true,
  claveSat: "",
  unidadSat: "",
  lineaId: "",
  familiaId: "",
  modeloId: "",
}

const CURRENCY_OPTIONS = ["MXN", "USD", "COP", "CLP", "EUR"]
const EMPTY_SELECT_VALUE = "__none__"
const UPDATED_AT_FORMATTER = new Intl.DateTimeFormat("es-MX", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "America/Mexico_City",
})

function formatCurrency(value: number | null | undefined, currency: string): string {
  if (value == null || Number.isNaN(value)) {
    return "—"
  }
  try {
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(value)
  } catch {
    return `${value.toFixed(2)} ${currency}`
  }
}

function sortItems(list: CatalogItem[]): CatalogItem[] {
  return [...list].sort((a, b) => a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" }))
}

function mapItemToFormValues(item: CatalogItem): CatalogItemFormValues {
  return {
    nombre: item.nombre,
    slug: item.slug ?? "",
    tipo: item.tipo,
    descripcionCorta: item.descripcionCorta ?? "",
    descripcionLarga: item.descripcionLarga ?? "",
    unidad: item.unidad ?? "unidad",
    precioBase: item.precioBase != null ? String(item.precioBase) : "",
    moneda: item.moneda || "MXN",
    requiereFactura: item.requiereFactura,
    activo: item.activo,
    claveSat: item.claveSat ?? "",
    unidadSat: item.unidadSat ?? "",
    lineaId: item.lineaId ?? "",
    familiaId: item.familiaId ?? "",
    modeloId: item.modeloId ?? "",
  }
}

function formValuesToInput(values: CatalogItemFormValues, impuestos?: CatalogItem["impuestos"], metadatos?: Record<string, unknown>): CatalogItemInput {
  return {
    nombre: values.nombre,
    slug: values.slug || null,
    tipo: values.tipo,
    descripcionCorta: values.descripcionCorta || null,
    descripcionLarga: values.descripcionLarga || null,
    unidad: values.unidad || "unidad",
    precioBase: values.precioBase.trim().length ? Number(values.precioBase) : null,
    moneda: values.moneda || "MXN",
    impuestos: impuestos ?? [],
    activo: values.activo,
    requiereFactura: values.requiereFactura,
    claveSat: values.claveSat || null,
    unidadSat: values.unidadSat || null,
    metadatos: metadatos ?? {},
    lineaId: values.lineaId || null,
    familiaId: values.familiaId || null,
    modeloId: values.modeloId || null,
  }
}

function catalogItemToInput(item: CatalogItem): CatalogItemInput {
  return {
    nombre: item.nombre,
    slug: item.slug,
    tipo: item.tipo,
    descripcionCorta: item.descripcionCorta,
    descripcionLarga: item.descripcionLarga,
    unidad: item.unidad,
    precioBase: item.precioBase,
    moneda: item.moneda,
    impuestos: item.impuestos,
    activo: item.activo,
    requiereFactura: item.requiereFactura,
    claveSat: item.claveSat,
    unidadSat: item.unidadSat,
    metadatos: item.metadatos,
    lineaId: item.lineaId,
    familiaId: item.familiaId,
    modeloId: item.modeloId,
  }
}

export function CatalogItemsPanel({
  initialItems,
  lineas,
  familias,
  modelos,
}: {
  initialItems: CatalogItem[]
  lineas: LineaOption[]
  familias: FamiliaOption[]
  modelos: ModeloOption[]
}) {
  const [items, setItems] = useState<CatalogItem[]>(() => sortItems(initialItems))
  const [search, setSearch] = useState("")
  const [includeInactive, setIncludeInactive] = useState(true)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editing, setEditing] = useState<CatalogItem | null>(null)
  const [feedback, setFeedback] = useState<StatusBanner>(null)
  const [pendingAction, setPendingAction] = useState<"save" | "delete" | "refresh" | "toggle" | null>(null)
  const [isPending, startTransition] = useTransition()
  const [filterLinea, setFilterLinea] = useState("")
  const [filterFamilia, setFilterFamilia] = useState("")
  const [filterModelo, setFilterModelo] = useState("")
  const ALL_OPTION_VALUE = "__all__"

  const form = useForm<CatalogItemFormValues>({ defaultValues: EMPTY_FORM })
  const [metadataSeed, setMetadataSeed] = useState<Record<string, unknown>>({})
  const [mediaItems, setMediaItems] = useState<MediaEntry[]>([])

  const tipoWatch = useWatch({ control: form.control, name: "tipo" }) as CatalogItemFormValues["tipo"] | undefined;
  const monedaWatch = useWatch({ control: form.control, name: "moneda" }) as string | undefined;
  const activoWatch = useWatch({ control: form.control, name: "activo" }) as boolean | undefined;
  const requiereFacturaWatch = useWatch({ control: form.control, name: "requiereFactura" }) as boolean | undefined;
  const lineaWatch = useWatch({ control: form.control, name: "lineaId" }) ?? ""
  const familiaWatch = useWatch({ control: form.control, name: "familiaId" }) ?? ""
  const modeloWatch = useWatch({ control: form.control, name: "modeloId" }) ?? ""

  const filteredFamilias = useMemo(() => {
    if (!lineaWatch) {
      return familias
    }
    return familias.filter((familia) => familia.lineaId === lineaWatch)
  }, [familias, lineaWatch])

  const filteredModelos = useMemo(() => {
    if (!familiaWatch) {
      return modelos
    }
    return modelos.filter((modelo) => modelo.familiaId === familiaWatch)
  }, [familiaWatch, modelos])

  useEffect(() => {
    if (!familiaWatch) {
      return
    }
    const familia = familias.find((entry) => entry.id === familiaWatch)
    if (!familia || (lineaWatch && familia.lineaId !== lineaWatch)) {
      form.setValue("familiaId", "")
      form.setValue("modeloId", "")
    }
  }, [familiaWatch, familias, lineaWatch, form])

  useEffect(() => {
    if (!modeloWatch) {
      return
    }
    if (!filteredModelos.some((modelo) => modelo.id === modeloWatch)) {
      form.setValue("modeloId", "")
    }
  }, [filteredModelos, modeloWatch, form])

  useEffect(() => {
    setFilterFamilia("")
    setFilterModelo("")
  }, [filterLinea])

  useEffect(() => {
    setFilterModelo("")
  }, [filterFamilia])

  const visibleItems = useMemo(() => {
    const query = search.trim().toLowerCase()
    return items.filter((item) => {
      if (!includeInactive && !item.activo) {
        return false
      }
      if (filterLinea && item.lineaId !== filterLinea) {
        return false
      }
      if (filterFamilia && item.familiaId !== filterFamilia) {
        return false
      }
      if (filterModelo && item.modeloId !== filterModelo) {
        return false
      }
      if (!query) {
        return true
      }
      const haystack = [item.nombre, item.slug ?? "", item.tipo].join(" ").toLowerCase()
      return haystack.includes(query)
    })
  }, [items, search, includeInactive, filterLinea, filterFamilia, filterModelo])

  const activeCount = useMemo(() => items.filter((item) => item.activo).length, [items])
  const inactiveCount = items.length - activeCount

  const resetForm = useCallback(() => {
    form.reset(EMPTY_FORM)
    setEditing(null)
    setMetadataSeed({})
    setMediaItems([])
  }, [form])

  const openCreateSheet = useCallback(() => {
    resetForm()
    setSheetOpen(true)
  }, [resetForm])

  const openEditSheet = useCallback(
    (item: CatalogItem) => {
      setEditing(item)
      form.reset(mapItemToFormValues(item))
      const baseMetadata =
        item.metadatos && typeof item.metadatos === "object"
          ? JSON.parse(JSON.stringify(item.metadatos))
          : {}
      setMetadataSeed(baseMetadata)
      setMediaItems(normalizeMediaList(baseMetadata))
      setSheetOpen(true)
    },
    [form],
  )

  const closeSheet = useCallback(() => {
    setSheetOpen(false)
    setTimeout(() => {
      resetForm()
    }, 200)
  }, [resetForm])

  const upsertItem = useCallback((next: CatalogItem) => {
    setItems((prev) => sortItems([...prev.filter((row) => row.id !== next.id), next]))
  }, [])

  const removeItem = useCallback((id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id))
  }, [])

  const handleSubmit = form.handleSubmit((values) => {
    if (!values.nombre.trim()) {
      setFeedback({ type: "error", message: "El nombre del producto es obligatorio." })
      return
    }
    setFeedback(null)
    setPendingAction("save")
    startTransition(() => {
      const metadataPayload = buildMetadataWithMedia(metadataSeed, mediaItems)
      const payload = formValuesToInput(values, editing?.impuestos, metadataPayload)
      const action = editing ? updateCatalogItem(editing.id, payload) : createCatalogItem(payload)
      action
        .then((item) => {
          upsertItem(item)
          setFeedback({
            type: "success",
            message: editing ? "Producto actualizado correctamente." : "Producto creado correctamente.",
          })
          if (!editing) {
            form.reset(EMPTY_FORM)
          }
          setSheetOpen(false)
          setEditing(null)
        })
        .catch((error) => {
          console.error("[catalog] save failed", error)
          setFeedback({
            type: "error",
            message:
              error instanceof Error
                ? error.message
                : "No se pudo guardar el producto. Inténtalo nuevamente.",
          })
        })
        .finally(() => setPendingAction(null))
    })
  })

  const handleToggleActive = useCallback(
    (item: CatalogItem) => {
      setFeedback(null)
      setPendingAction("toggle")
      startTransition(() => {
        updateCatalogItem(item.id, { ...catalogItemToInput(item), activo: !item.activo })
          .then((updated) => {
            upsertItem(updated)
            setFeedback({
              type: "success",
              message: updated.activo
                ? "Producto reactivado correctamente."
                : "Producto archivado correctamente.",
            })
          })
          .catch((error) => {
            console.error("[catalog] toggle failed", error)
            setFeedback({
              type: "error",
              message:
                error instanceof Error
                  ? error.message
                  : "No se pudo actualizar el estado del producto.",
            })
          })
          .finally(() => setPendingAction(null))
      })
    },
    [upsertItem],
  )

  const handleDelete = useCallback(
    (item: CatalogItem, hard = false) => {
      const confirmation = hard
        ? window.confirm(
            "Esta acción eliminará el producto de forma permanente y no podrá recuperarse. ¿Deseas continuar?",
          )
        : window.confirm("El producto se marcará como archivado. ¿Continuar?")
      if (!confirmation) {
        return
      }
      setFeedback(null)
      setPendingAction("delete")
      startTransition(() => {
        deleteCatalogItem(item.id, { hard })
          .then((result) => {
            if (hard) {
              removeItem(item.id)
              setFeedback({ type: "success", message: "Producto eliminado permanentemente." })
            } else if (result) {
              upsertItem(result)
              setFeedback({ type: "success", message: "Producto archivado." })
            }
          })
          .catch((error) => {
            console.error("[catalog] delete failed", error)
            setFeedback({
              type: "error",
              message:
                error instanceof Error
                  ? error.message
                  : "No se pudo eliminar el producto. Inténtalo más tarde.",
            })
          })
          .finally(() => setPendingAction(null))
      })
    },
    [removeItem, upsertItem],
  )

  const handleRefresh = useCallback(() => {
    setFeedback(null)
    setPendingAction("refresh")
    startTransition(() => {
      fetchCatalogItems({ includeInactive })
        .then((rows) => {
          setItems(sortItems(rows))
          setFeedback({ type: "success", message: "Catálogo actualizado." })
        })
        .catch((error) => {
          console.error("[catalog] refresh failed", error)
          setFeedback({
            type: "error",
            message:
              error instanceof Error ? error.message : "No se pudo recargar el catálogo.",
          })
        })
        .finally(() => setPendingAction(null))
    })
  }, [includeInactive])

  return (
    <Card>
      <CardHeader className="gap-4 space-y-0 border-b py-4">
        <div className="flex flex-wrap items-center gap-3">
          <CardTitle className="text-xl font-semibold">Catálogo de productos</CardTitle>
          <Badge variant="outline" className="font-semibold">
            {items.length} ítems ({activeCount} activos · {inactiveCount} archivados)
          </Badge>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <Checkbox
              id="toggle-inactive"
              checked={includeInactive}
              onCheckedChange={(checked) => setIncludeInactive(Boolean(checked))}
            />
            <label htmlFor="toggle-inactive">Mostrar archivados</label>
          </div>
          <div className="ms-auto flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={isPending && pendingAction === "refresh"}
            >
              <IconRefresh className={cn("me-2 size-4", isPending && pendingAction === "refresh" && "animate-spin")} />
              Actualizar
            </Button>
            <Button onClick={openCreateSheet} size="sm">
              <IconPlus className="me-2 size-4" /> Nuevo producto
            </Button>
          </div>
        </div>
        {feedback ? (
          <div
            className={cn(
              "mt-2 flex items-start gap-2 rounded-md border px-3 py-2 text-sm",
              feedback.type === "success"
                ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-900"
                : "border-red-500/50 bg-red-500/10 text-red-900",
            )}
          >
            {feedback.type === "success" ? (
              <IconCircleCheck className="mt-0.5 size-4" />
            ) : (
              <IconCircleX className="mt-0.5 size-4" />
            )}
            <span>{feedback.message}</span>
          </div>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-4 py-6">
          <div className="flex flex-wrap gap-3">
            <div className="flex-1 min-w-[200px]">
              <Label htmlFor="search-items" className="sr-only">
                Buscar en catálogo
              </Label>
            <Input
              id="search-items"
              placeholder="Buscar por nombre, slug o tipo"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Línea de negocio
              </Label>
              <Select
                value={filterLinea ? filterLinea : ALL_OPTION_VALUE}
                onValueChange={(value) => {
                  const normalized = value === ALL_OPTION_VALUE ? "" : value
                  setFilterLinea(normalized)
                  if (!normalized) {
                    setFilterFamilia("")
                    setFilterModelo("")
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Todas las líneas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_OPTION_VALUE}>Todas las líneas</SelectItem>
                  {lineas.map((linea) => (
                    <SelectItem key={linea.id} value={linea.id}>
                      {linea.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Familia
              </Label>
              <Select
                value={filterFamilia ? filterFamilia : ALL_OPTION_VALUE}
                onValueChange={(value) => {
                  const normalized = value === ALL_OPTION_VALUE ? "" : value
                  setFilterFamilia(normalized)
                  if (!normalized) {
                    setFilterModelo("")
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Todas las familias" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_OPTION_VALUE}>Todas las familias</SelectItem>
                  {familias
                    .filter((familia) => !filterLinea || familia.lineaId === filterLinea)
                    .map((familia) => (
                      <SelectItem key={familia.id} value={familia.id}>
                        {familia.nombre}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Modelo
              </Label>
              <Select
                value={filterModelo ? filterModelo : ALL_OPTION_VALUE}
                onValueChange={(value) => {
                  const normalized = value === ALL_OPTION_VALUE ? "" : value
                  setFilterModelo(normalized)
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Todos los modelos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_OPTION_VALUE}>Todos los modelos</SelectItem>
                  {modelos
                    .filter((modelo) => {
                      if (filterFamilia) {
                        return modelo.familiaId === filterFamilia
                      }
                      if (filterLinea) {
                        const familia = familias.find((entry) => entry.id === modelo.familiaId)
                        return familia?.lineaId === filterLinea
                      }
                      return true
                    })
                    .map((modelo) => (
                      <SelectItem key={modelo.id} value={modelo.id}>
                        {modelo.nombre}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Producto / servicio</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Precio base</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Actualizado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleItems.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    No encontramos elementos que coincidan con tu búsqueda.
                  </TableCell>
                </TableRow>
              ) : (
                visibleItems.map((item) => (
                  <TableRow key={item.id} className={!item.activo ? "bg-muted/30" : undefined}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="h-12 w-12 overflow-hidden rounded-md border border-muted/40 bg-muted/5">
                          {item.fotoUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={item.fotoUrl} alt={item.nombre} className="h-full w-full object-cover" />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
                              Sin imagen
                            </div>
                          )}
                        </div>
                        <div>
                          <div className="font-medium leading-tight">{item.nombre}</div>
                          <div className="text-muted-foreground text-xs">
                            {item.descripcionCorta || "Sin descripción"}
                          </div>
                        </div>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                        {item.lineaNombre ? (
                          <span className="rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide">
                            Línea: {item.lineaNombre}
                          </span>
                        ) : null}
                        {item.familiaNombre ? (
                          <span className="rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide">
                            Familia: {item.familiaNombre}
                          </span>
                        ) : null}
                        {item.modeloNombre ? (
                          <span className="rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide">
                            Modelo: {item.modeloNombre}
                          </span>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="capitalize">
                        {item.tipo}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="font-semibold">
                        {formatCurrency(item.precioBase, item.moneda || "MXN")}
                      </div>
                      <div className="text-muted-foreground text-xs">{item.unidad}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={item.activo ? "default" : "outline"}>
                        {item.activo ? "Activo" : "Archivado"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {item.actualizadoEn ? UPDATED_AT_FORMATTER.format(new Date(item.actualizadoEn)) : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" size="icon" onClick={() => openEditSheet(item)}>
                          <IconPencil className="size-4" />
                          <span className="sr-only">Editar</span>
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => handleToggleActive(item)}
                          disabled={isPending && pendingAction === "toggle"}
                        >
                          {item.activo ? (
                            <IconArchive className="size-4" />
                          ) : (
                            <IconCircleCheck className="size-4" />
                          )}
                          <span className="sr-only">{item.activo ? "Archivar" : "Reactivar"}</span>
                        </Button>
                        <Button
                          variant="destructive"
                          size="icon"
                          onClick={() => handleDelete(item, true)}
                          disabled={isPending && pendingAction === "delete"}
                        >
                          <IconTrash className="size-4" />
                          <span className="sr-only">Eliminar</span>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>

      <Sheet open={sheetOpen} onOpenChange={(open) => (!open ? closeSheet() : setSheetOpen(true))}>
        <SheetContent
          side="right"
          className="flex w-full flex-col gap-4 overflow-y-auto p-0 sm:max-w-2xl"
        >
          <SheetHeader className="space-y-2 border-b px-6 py-4 text-left">
            <SheetTitle>{editing ? "Editar producto" : "Nuevo producto"}</SheetTitle>
            <SheetDescription>
              Captura la información que aparecerá en las cotizaciones y reportes. El nombre y precio base son obligatorios.
            </SheetDescription>
          </SheetHeader>
          <form
            onSubmit={handleSubmit}
            className="flex flex-1 flex-col gap-4 overflow-y-auto px-6 py-4"
          >
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="catalog-nombre">Nombre</Label>
                <Input id="catalog-nombre" {...form.register("nombre")} placeholder="Implementación Tal-IA" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="catalog-descripcion-corta">Descripción corta</Label>
                <Input
                  id="catalog-descripcion-corta"
                  {...form.register("descripcionCorta")}
                  placeholder="Resumen que verás en los listados"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="catalog-descripcion-larga">Descripción detallada</Label>
              <Textarea
                id="catalog-descripcion-larga"
                rows={4}
                {...form.register("descripcionLarga")}
                placeholder="Incluye usos recomendados, alcances o entregables."
              />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="catalog-tipo">Tipo</Label>
                <Select value={tipoWatch} onValueChange={(value) => form.setValue("tipo", value as CatalogItemFormValues["tipo"])}>
                  <SelectTrigger id="catalog-tipo">
                    <SelectValue placeholder="Selecciona un tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="producto">Producto</SelectItem>
                    <SelectItem value="servicio">Servicio</SelectItem>
                    <SelectItem value="paquete">Paquete</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="catalog-slug">Slug / código</Label>
                <Input id="catalog-slug" {...form.register("slug")} placeholder="tal-ia-implementacion" />
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="catalog-linea">Línea de negocio</Label>
              <Select
                  value={lineaWatch || EMPTY_SELECT_VALUE}
                  onValueChange={(value) =>
                    form.setValue("lineaId", value === EMPTY_SELECT_VALUE ? "" : value)
                  }
              >
                <SelectTrigger id="catalog-linea">
                  <SelectValue placeholder="Selecciona una línea" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value={EMPTY_SELECT_VALUE}>Sin línea</SelectItem>
                    {lineas.map((linea) => (
                      <SelectItem key={linea.id} value={linea.id}>
                        {linea.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            <div className="space-y-2">
              <Label htmlFor="catalog-familia">Familia</Label>
              <Select
                  value={familiaWatch || EMPTY_SELECT_VALUE}
                  onValueChange={(value) =>
                    form.setValue("familiaId", value === EMPTY_SELECT_VALUE ? "" : value)
                  }
              >
                <SelectTrigger id="catalog-familia">
                  <SelectValue placeholder="Selecciona una familia" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value={EMPTY_SELECT_VALUE}>Sin familia</SelectItem>
                    {filteredFamilias.map((familia) => (
                      <SelectItem key={familia.id} value={familia.id}>
                        {familia.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            <div className="space-y-2">
              <Label htmlFor="catalog-modelo">Modelo</Label>
              <Select
                  value={modeloWatch || EMPTY_SELECT_VALUE}
                  onValueChange={(value) =>
                    form.setValue("modeloId", value === EMPTY_SELECT_VALUE ? "" : value)
                  }
              >
                <SelectTrigger id="catalog-modelo">
                  <SelectValue placeholder="Selecciona un modelo" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value={EMPTY_SELECT_VALUE}>Sin modelo</SelectItem>
                    {filteredModelos.map((modelo) => (
                      <SelectItem key={modelo.id} value={modelo.id}>
                        {modelo.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="catalog-precio">Precio base</Label>
                <Input
                  id="catalog-precio"
                  type="number"
                  step="0.01"
                  min="0"
                  {...form.register("precioBase")}
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="catalog-moneda">Moneda</Label>
                <Select value={monedaWatch} onValueChange={(value) => form.setValue("moneda", value)}>
                  <SelectTrigger id="catalog-moneda">
                    <SelectValue placeholder="Moneda" />
                  </SelectTrigger>
                  <SelectContent>
                    {CURRENCY_OPTIONS.map((currency) => (
                      <SelectItem key={currency} value={currency}>
                        {currency}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="catalog-unidad">Unidad</Label>
                <Input id="catalog-unidad" {...form.register("unidad")} placeholder="unidad, hora, licencia" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="catalog-clave-sat">Clave SAT</Label>
                <Input id="catalog-clave-sat" {...form.register("claveSat")} placeholder="81112100" />
              </div>
            </div>
            <Separator />
            <div className="grid gap-4 md:grid-cols-2">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="catalog-activo"
                  checked={activoWatch}
                  onCheckedChange={(checked) => form.setValue("activo", Boolean(checked))}
                />
                <Label htmlFor="catalog-activo" className="text-sm font-normal">
                  Producto activo
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="catalog-requiere-factura"
                  checked={requiereFacturaWatch}
                  onCheckedChange={(checked) => form.setValue("requiereFactura", Boolean(checked))}
                />
                <Label htmlFor="catalog-requiere-factura" className="text-sm font-normal">
                  Requiere factura obligatoria
                </Label>
              </div>
            </div>
            <MediaEditor
              items={mediaItems}
              onChange={setMediaItems}
              title="Imágenes del producto"
              description="Agrega imágenes o enlaces de recursos multimedia y selecciona la predeterminada."
            />
            <SheetFooter className="flex flex-col gap-2 border-t pt-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                {editing ? (
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={() => handleDelete(editing, true)}
                    disabled={isPending && pendingAction === "delete"}
                  >
                    <IconTrash className="me-2 size-4" /> Eliminar
                  </Button>
                ) : null}
                <Button type="button" variant="outline" onClick={closeSheet}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={isPending && pendingAction === "save"}>
                  {editing ? "Guardar cambios" : "Crear producto"}
                </Button>
              </div>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
    </Card>
  )
}
