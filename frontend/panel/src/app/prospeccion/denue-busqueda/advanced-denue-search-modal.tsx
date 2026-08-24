"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import { ChevronDownIcon, RefreshCw } from "lucide-react"

import {
  DenueCatalogosResponse,
  DenueScianNode,
  listDenueCatalogos,
  listScianClaseIndice,
} from "@/lib/prospeccion/denue-client"

export type DenueAdvancedFilters = {
  search: {
    nombre: string
    calle: string
    colonia: string
    cp: string
  }
  actividad: string[]
  allActivitiesSelected: boolean
  estrato: string[]
  geografia: {
    estados: string[]
    municipios: string[]
  }
}

type Props = {
  open: boolean
  onOpenChange: (value: boolean) => void
  onApply?: (filters: DenueAdvancedFilters) => void
  canApply?: boolean
}

type AdvancedSection = "search" | "activity" | "size" | "geography"

type ScianTreeNode = DenueScianNode & {
  children: ScianTreeNode[]
}

const SIZE_OPTIONS = [
  { value: "0", label: "Todos los tamaños" },
  { value: "1", label: "0 a 5 personas" },
  { value: "2", label: "6 a 10 personas" },
  { value: "3", label: "11 a 30 personas" },
  { value: "4", label: "31 a 50 personas" },
  { value: "5", label: "51 a 100 personas" },
  { value: "6", label: "101 a 250 personas" },
  { value: "7", label: "251 y más personas" },
]

const MUNICIPALITY_KEY_SEPARATOR = "::"

function createScianMap(rows: DenueScianNode[]): Map<string, ScianTreeNode> {
  const map = new Map<string, ScianTreeNode>()
  for (const row of rows) {
    const codigo = (row.codigo ?? "").trim()
    if (!codigo) {
      continue
    }
    map.set(codigo, {
      ...row,
      codigo,
      children: [],
    })
  }
  return map
}

function expandScianSectorKeys(codigo: string): string[] {
  const normalized = codigo.trim()
  if (!normalized) {
    return []
  }
  const rangeMatch = normalized.match(/^(\d{2})-(\d{2})$/)
  if (!rangeMatch) {
    return [normalized]
  }
  const start = Number.parseInt(rangeMatch[1], 10)
  const end = Number.parseInt(rangeMatch[2], 10)
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    return [normalized]
  }
  const keys: string[] = []
  for (let value = start; value <= end; value += 1) {
    keys.push(String(value).padStart(2, "0"))
  }
  return keys
}

function createScianSectorLookup(
  sectorMap: Map<string, ScianTreeNode>,
): Map<string, ScianTreeNode> {
  const lookup = new Map<string, ScianTreeNode>()
  sectorMap.forEach((node, codigo) => {
    lookup.set(codigo, node)
    for (const key of expandScianSectorKeys(codigo)) {
      if (!lookup.has(key)) {
        lookup.set(key, node)
      }
    }
  })
  return lookup
}

function attachScianChildren(
  parent: Map<string, ScianTreeNode>,
  child: Map<string, ScianTreeNode>,
  prefixLength: number,
) {
  child.forEach((node) => {
    if (node.codigo.length < prefixLength) {
      return
    }
    const parentCode = node.codigo.slice(0, prefixLength)
    const parentNode = parent.get(parentCode)
    if (!parentNode) {
      return
    }
    parentNode.children.push(node)
  })
}

function sortScianTree(nodes: ScianTreeNode[]) {
  nodes.sort((a, b) => a.codigo.localeCompare(b.codigo))
  nodes.forEach((node) => sortScianTree(node.children))
}

function buildScianTree(scian: DenueCatalogosResponse["scian"] | null): ScianTreeNode[] {
  if (!scian) {
    return []
  }
  const sectorMap = createScianMap(scian.sector)
  const sectorLookup = createScianSectorLookup(sectorMap)
  const subsectorMap = createScianMap(scian.subsector)
  const ramaMap = createScianMap(scian.rama)
  const subramaMap = createScianMap(scian.subrama)
  const claseMap = createScianMap(scian.clase)

  attachScianChildren(sectorLookup, subsectorMap, 2)
  attachScianChildren(subsectorMap, ramaMap, 3)
  attachScianChildren(ramaMap, subramaMap, 4)
  attachScianChildren(subramaMap, claseMap, 5)

  const roots = Array.from(sectorMap.values())
  sortScianTree(roots)
  return roots
}

export function DenueAdvancedSearchModal({ open, onOpenChange, onApply, canApply = true }: Props) {
  const [catalogs, setCatalogs] = useState<DenueCatalogosResponse | null>(null)
  const [loadingCatalogs, setLoadingCatalogs] = useState(false)
  const [catalogError, setCatalogError] = useState<string | null>(null)
  const [expandedSections, setExpandedSections] = useState<Record<AdvancedSection, boolean>>({
    search: false,
    activity: false,
    size: false,
    geography: true,
  })
  const [searchFields, setSearchFields] = useState({
    nombre: "",
    calle: "",
    colonia: "",
    cp: "",
  })
  const [selectedScianCodes, setSelectedScianCodes] = useState<Set<string>>(() => new Set())
  const [expandedScianCodes, setExpandedScianCodes] = useState<Set<string>>(() => new Set())
  const [sizeSelections, setSizeSelections] = useState<Set<string>>(() => new Set())
  const [selectedStates, setSelectedStates] = useState<Set<string>>(() => new Set())
  const [selectedMunicipalities, setSelectedMunicipalities] = useState<Set<string>>(() => new Set())
  const [expandedStates, setExpandedStates] = useState<Set<string>>(() => new Set())
  const [claseIndice, setClaseIndice] = useState<Record<string, string[]>>({})
  const [loadingClaseIndice, setLoadingClaseIndice] = useState<Set<string>>(() => new Set())
  const [scianIndiceErrors, setScianIndiceErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!open || catalogs) {
      return
    }
    setLoadingCatalogs(true)
    setCatalogError(null)
    listDenueCatalogos()
      .then((response) => setCatalogs(response))
      .catch((error) => {
        const message = error instanceof Error ? error.message : "No fue posible cargar los catálogos"
        setCatalogError(message)
      })
      .finally(() => {
        setLoadingCatalogs(false)
      })
  }, [open, catalogs])

  const scianTree = useMemo(
    () => buildScianTree(catalogs?.scian ?? null),
    [catalogs?.scian],
  )

  const stateOnlyGeography = selectedStates.size === 1 && selectedMunicipalities.size === 0

  useEffect(() => {
    if (!stateOnlyGeography) {
      return
    }
    const sectorCodes = new Set(scianTree.map((node) => node.codigo))
    setSelectedScianCodes((previous) => {
      const next = new Set(Array.from(previous).filter((code) => !sectorCodes.has(code)))
      return next.size === previous.size ? previous : next
    })
  }, [scianTree, stateOnlyGeography])

  const toggleSection = useCallback((section: AdvancedSection) => {
    setExpandedSections((prev) => {
      const currently = prev[section]
      const next: Record<AdvancedSection, boolean> = {
        search: false,
        activity: false,
        size: false,
        geography: false,
      }
      if (!currently) {
        next[section] = true
      }
      return next
    })
  }, [])

  const handleFieldChange = useCallback((key: keyof typeof searchFields, value: string) => {
    setSearchFields((prev) => ({ ...prev, [key]: value }))
  }, [])

  const toggleScianSelection = useCallback((codigo: string, level: number) => {
    if (stateOnlyGeography && level === 0) {
      return
    }
    setSelectedScianCodes((prev) => {
      if (prev.has(codigo)) return new Set()
      return new Set([codigo])
    })
  }, [stateOnlyGeography])

  const toggleSize = useCallback((value: string) => {
    setSizeSelections((previous) => {
      if (value === "0") {
        return previous.has("0") ? new Set() : new Set(["0"])
      }
      const next = new Set(previous)
      next.delete("0")
      if (next.has(value)) next.delete(value)
      else next.add(value)
      return next
    })
  }, [])

  const loadScianClaseIndice = useCallback(
    async (codigo: string, options?: { force?: boolean }) => {
      const force = options?.force ?? false
      if (!force && claseIndice[codigo]) {
        return
      }
      setLoadingClaseIndice((prev) => {
        const next = new Set(prev)
        next.add(codigo)
        return next
      })
      setScianIndiceErrors((prev) => {
        const next = { ...prev }
        delete next[codigo]
        return next
      })
      try {
        const response = await listScianClaseIndice({ codigoClase: codigo })
        const items = response.items.map((item) => item.item).filter(Boolean)
        setClaseIndice((prev) => ({ ...prev, [codigo]: items }))
      } catch {
        setClaseIndice((prev) => ({ ...prev, [codigo]: [] }))
        setScianIndiceErrors((prev) => ({
          ...prev,
          [codigo]: "No fue posible cargar el índice. Revisa que los datos SCIAN estén disponibles.",
        }))
      } finally {
        setLoadingClaseIndice((prev) => {
          const next = new Set(prev)
          next.delete(codigo)
          return next
        })
      }
    },
    [claseIndice],
  )

  const toggleScianExpansion = useCallback(
    (codigo: string, isLeaf: boolean) => {
      let shouldLoad = false
      setExpandedScianCodes((prev) => {
        const next = new Set(prev)
        if (next.has(codigo)) {
          next.delete(codigo)
        } else {
          next.add(codigo)
          shouldLoad = true
        }
        return next
      })
      if (isLeaf && shouldLoad) {
        void loadScianClaseIndice(codigo)
      }
    },
    [loadScianClaseIndice],
  )

  const toggleStateSelection = useCallback((code: string) => {
    setSelectedStates((prev) => {
      if (prev.has(code)) return new Set()
      return new Set([code])
    })
    setSelectedMunicipalities(new Set())
  }, [])

  const toggleMunicipalitySelection = useCallback((code: string) => {
    setSelectedMunicipalities((prev) => {
      if (prev.has(code)) return new Set()
      return new Set([code])
    })
    setSelectedStates(new Set())
  }, [])

  const toggleStateExpansion = useCallback((code: string) => {
    setExpandedStates((prev) => {
      const next = new Set(prev)
      if (next.has(code)) {
        next.delete(code)
      } else {
        next.add(code)
      }
      return next
    })
  }, [])

  const hasRequiredSelection = selectedScianCodes.size === 1
    && selectedStates.size + selectedMunicipalities.size === 1
    && sizeSelections.size > 0

  const handleApply = useCallback(() => {
    if (!canApply || !hasRequiredSelection) {
      return
    }
    const filters: DenueAdvancedFilters = {
      search: { ...searchFields },
      actividad: Array.from(selectedScianCodes),
      allActivitiesSelected: false,
      estrato: Array.from(sizeSelections),
      geografia: {
        estados: Array.from(selectedStates),
        municipios: Array.from(selectedMunicipalities),
      },
    }
    onApply?.(filters)
    onOpenChange(false)
  }, [
    onApply,
    onOpenChange,
    searchFields,
    selectedScianCodes,
    sizeSelections,
    selectedStates,
    selectedMunicipalities,
    canApply,
    hasRequiredSelection,
  ])

  const renderScianNodes = useCallback(
    (nodes: ScianTreeNode[], level = 0) =>
      nodes.map((node) => {
        const hasChildren = node.children.length > 0
        const isExpanded = expandedScianCodes.has(node.codigo)
        const isLeaf = !hasChildren
        const loadingIndex = loadingClaseIndice.has(node.codigo)
        const items = claseIndice[node.codigo] ?? []
        const checked = selectedScianCodes.has(node.codigo)
        const activityDisabled = stateOnlyGeography && level === 0
        return (
          <div key={node.codigo} className="space-y-2">
            <div className="flex items-start gap-2">
              <button
                type="button"
                onClick={() => toggleScianExpansion(node.codigo, isLeaf)}
                className={cn(
                  "rounded-full p-1 text-muted-foreground transition hover:bg-muted/20",
                  isExpanded ? "text-primary" : "",
                )}
              >
                <ChevronDownIcon
                  className={cn("h-4 w-4 transition", isExpanded && "rotate-180")}
                />
              </button>
              <Checkbox
                checked={checked}
                disabled={activityDisabled}
                onCheckedChange={() => toggleScianSelection(node.codigo, level)}
              />
              <div className="flex flex-col">
                <div className="flex items-baseline gap-2 text-xs font-semibold">
                  <span className="text-[11px] text-muted-foreground">{node.codigo}</span>
                  <span>{node.titulo ?? "Sin título"}</span>
                </div>
              </div>
            </div>
            {isLeaf && isExpanded ? (
              <div className="ml-6 space-y-2 rounded-xl border border-border/60 bg-muted/5 p-2 text-xs">
                {loadingIndex ? (
                  <div className="flex items-center gap-2">
                    <RefreshCw className="h-3 w-3 animate-spin" />
                    <span>Cargando índice…</span>
                  </div>
                ) : items.length ? (
                  <ScrollArea className="max-h-32">
                    <div className="space-y-1">
                      {items.map((item) => (
                        <div key={item} className="rounded-md border border-border/60 bg-background px-2 py-1 text-[11px]">
                          {item}
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                ) : (
                  <>
                    <Button type="button" size="sm" variant="ghost" onClick={() => loadScianClaseIndice(node.codigo, { force: true })}>
                      Cargar índice
                    </Button>
                    {scianIndiceErrors[node.codigo] ? (
                      <p className="text-[10px] text-destructive">{scianIndiceErrors[node.codigo]}</p>
                    ) : (
                      <p className="text-[10px] text-muted-foreground">
                        No se encontró contenido del índice para esta clase de actividad.
                      </p>
                    )}
                    {node.descripcion ? (
                      <p className="text-[10px] text-muted-foreground">{node.descripcion}</p>
                    ) : null}
                    {node.incluye ? (
                      <p className="text-[10px] text-muted-foreground">Incluye: {node.incluye}</p>
                    ) : null}
                    {node.excluye ? (
                      <p className="text-[10px] text-muted-foreground">Excluye: {node.excluye}</p>
                    ) : null}
                  </>
                )}
              </div>
            ) : null}
            {hasChildren && isExpanded ? (
              <div className="ml-6 border-l border-border/60 pl-3">
                {renderScianNodes(node.children, level + 1)}
              </div>
            ) : null}
          </div>
        )
      }),
    [claseIndice, expandedScianCodes, loadingClaseIndice, selectedScianCodes, stateOnlyGeography, toggleScianExpansion, toggleScianSelection, loadScianClaseIndice, scianIndiceErrors],
  )

  const geoStates = catalogs?.geo.states ?? []

  const encodeMunicipalityKey = useCallback((stateCode: string, municipalityCode: string) => {
    return `${stateCode}${MUNICIPALITY_KEY_SEPARATOR}${municipalityCode}`
  }, [])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden">
        <DialogHeader className="space-y-1">
          <DialogTitle>Búsqueda avanzada</DialogTitle>
          <DialogDescription>
            Combina filtros por texto, actividad, tamaño y geografía para acotar los resultados de DENUE.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 max-h-[calc(90vh-10rem)] overflow-auto pr-1 text-[11px]">
          {/* Step 1 - Área geográfica */}
          <section className="space-y-1 rounded-lg border border-border/70 p-3 text-[11px] leading-tight">
            <button
              type="button"
              className="flex w-full items-center justify-between text-left text-sm font-semibold"
              onClick={() => toggleSection("geography")}
            >
              <span>1. Área geográfica <span className="text-destructive">*</span></span>
              <ChevronDownIcon
                className={cn("h-4 w-4 transition", expandedSections.geography && "rotate-180")}
              />
            </button>
            {expandedSections.geography ? (
              <div className="max-h-[50vh] overflow-auto pr-1 text-xs">
                <div className="rounded-lg border border-border/60 px-2 py-1 text-[11px]">
                  {loadingCatalogs ? (
                    <div className="flex items-center justify-center p-6 text-sm text-muted-foreground">
                      Cargando estados y municipios…
                    </div>
                  ) : catalogError ? (
                    <div className="p-4 text-sm text-destructive">{catalogError}</div>
                  ) : (
                    <div className="space-y-3 text-xs">
                      {geoStates.map((state) => {
                        const stateExpanded = expandedStates.has(state.code)
                        const stateSelected = selectedStates.has(state.code)
                        return (
                          <div key={state.code} className="space-y-2">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2 text-xs">
                                <button
                                  type="button"
                                  className={cn(
                                    "rounded-full p-1 text-muted-foreground transition hover:bg-muted/20",
                                    stateExpanded ? "text-primary" : "",
                                  )}
                                  onClick={() => toggleStateExpansion(state.code)}
                                >
                                  <ChevronDownIcon
                                    className={cn("h-4 w-4 transition", stateExpanded && "rotate-180")}
                                  />
                                </button>
                                <Checkbox
                                  checked={stateSelected}
                                  onCheckedChange={() => toggleStateSelection(state.code)}
                                />
                                <span className="font-medium">{state.name}</span>
                              </div>
                              <span className="text-xs text-muted-foreground">
                                {state.municipalities.length} municipios
                              </span>
                            </div>
                            {stateExpanded ? (
                              <div className="space-y-1 pl-10 text-xs">
                                {state.municipalities.map((municipio) => {
                                  const key = encodeMunicipalityKey(state.code, municipio.code)
                                  const checked = selectedMunicipalities.has(key)
                                  return (
                                    <label key={key} className="flex items-center gap-2">
                                      <Checkbox
                                        checked={checked}
                                        onCheckedChange={() => toggleMunicipalitySelection(key)}
                                      />
                                      <span>
                                        {municipio.code} · {municipio.name}
                                      </span>
                                    </label>
                                  )
                                })}
                              </div>
                            ) : null}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            ) : null}
          </section>

          {/* Step 2 - Tamaño */}
          <section className="space-y-1 rounded-lg border border-border/70 p-3 text-[11px] leading-tight">
            <button
              type="button"
              className="flex w-full items-center justify-between text-left text-sm font-semibold"
              onClick={() => toggleSection("size")}
            >
              <span>2. Tamaño del establecimiento <span className="text-destructive">*</span></span>
              <ChevronDownIcon
                className={cn("h-4 w-4 transition", expandedSections.size && "rotate-180")}
              />
            </button>
            {expandedSections.size ? (
              <div className="max-h-48 overflow-auto pr-1 text-xs">
                <p className="mb-2 text-muted-foreground">Selecciona uno o varios tamaños.</p>
                <div className="grid grid-cols-2 gap-1">
                  {SIZE_OPTIONS.map((option) => {
                    const checked = sizeSelections.has(option.value)
                    return (
                      <label
                        key={option.value}
                        className={cn(
                          "flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px]",
                          checked ? "border-primary bg-primary/5" : "border-border/60",
                        )}
                      >
                        <Checkbox checked={checked} onCheckedChange={() => toggleSize(option.value)} />
                        <span>{option.label}</span>
                      </label>
                    )
                  })}
                </div>
              </div>
            ) : null}
          </section>

          {/* Step 3 - Actividad */}
          <section className="space-y-1 rounded-lg border border-border/70 p-3 text-[11px] leading-tight">
            <button
              type="button"
              className="flex w-full items-center justify-between text-left text-sm font-semibold"
              onClick={() => toggleSection("activity")}
            >
              <span>3. Actividad económica <span className="text-destructive">*</span></span>
              <ChevronDownIcon
                className={cn("h-4 w-4 transition", expandedSections.activity && "rotate-180")}
              />
            </button>
            {expandedSections.activity ? (
              <div className="max-h-[50vh] overflow-auto pr-1 text-xs">
                <div className="space-y-2">
                  <div className="space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <Label htmlFor="actividad-busqueda" className="text-[11px]">Actividad</Label>
                      <span className="text-[11px] text-muted-foreground">Selecciona una actividad</span>
                    </div>
                    <Input id="actividad-busqueda" placeholder="Ej. servicios, comercio" className="text-[11px] py-2" />
                  </div>
                  <div className="rounded-lg border border-border/60">
                    {loadingCatalogs ? (
                      <div className="flex items-center justify-center p-6 text-sm text-muted-foreground">
                        Cargando catálogo SCIAN…
                      </div>
                    ) : catalogError ? (
                      <div className="p-4 text-sm text-destructive">{catalogError}</div>
                    ) : (
                      <div className="max-h-[40vh] overflow-auto px-2 py-3 text-xs">
                        <label className="flex items-center gap-2 rounded-md border-b border-border/60 pb-2 text-[11px]">
                          <span className="text-muted-foreground">La selección incluye automáticamente todos sus niveles hijos.</span>
                        </label>
                        <div className="space-y-2 pt-2">{renderScianNodes(scianTree)}</div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : null}
          </section>

          {/* Step 4 - Texto opcional */}
          <section className="space-y-1 rounded-lg border border-border/70 p-3 text-[11px] leading-tight">
            <button
              type="button"
              className="flex w-full items-center justify-between text-left text-sm font-semibold"
              onClick={() => toggleSection("search")}
            >
              <span>4. Texto adicional <span className="text-xs font-normal text-muted-foreground">(opcional)</span></span>
              <ChevronDownIcon
                className={cn("h-4 w-4 transition", expandedSections.search && "rotate-180")}
              />
            </button>
            {expandedSections.search ? (
              <div className="max-h-36 overflow-auto pr-1 text-xs">
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label htmlFor="advanced-nombre" className="text-[11px]">Nombre o razón social</Label>
                    <Input
                      id="advanced-nombre"
                      value={searchFields.nombre}
                      onChange={(event) => handleFieldChange("nombre", event.target.value)}
                      placeholder="Ej. OXXO, hospital"
                      className="text-[11px] py-2"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="advanced-calle" className="text-[11px]">Calle o avenida</Label>
                    <Input
                      id="advanced-calle"
                      value={searchFields.calle}
                      onChange={(event) => handleFieldChange("calle", event.target.value)}
                      placeholder="Ej. Reforma"
                      className="text-[11px] py-2"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="advanced-colonia" className="text-[11px]">Colonia o fraccionamiento</Label>
                    <Input
                      id="advanced-colonia"
                      value={searchFields.colonia}
                      onChange={(event) => handleFieldChange("colonia", event.target.value)}
                      placeholder="Ej. Roma Norte"
                      className="text-[11px] py-2"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="advanced-cp" className="text-[11px]">Código postal</Label>
                    <Input
                      id="advanced-cp"
                      value={searchFields.cp}
                      onChange={(event) => handleFieldChange("cp", event.target.value)}
                      placeholder="Ej. 06000"
                      className="text-[11px] py-2"
                    />
                  </div>
                </div>
              </div>
            ) : null}
          </section>

        </div>
        <DialogFooter>
          {!hasRequiredSelection ? (
            <p className="mr-auto text-xs text-muted-foreground">
              Completa los pasos 1, 2 y 3 para buscar.
            </p>
          ) : null}
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
          <Button type="button" onClick={handleApply} disabled={!canApply || !hasRequiredSelection}>
            Buscar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
