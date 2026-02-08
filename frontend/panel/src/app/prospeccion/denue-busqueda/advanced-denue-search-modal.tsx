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
  const subsectorMap = createScianMap(scian.subsector)
  const ramaMap = createScianMap(scian.rama)
  const subramaMap = createScianMap(scian.subrama)
  const claseMap = createScianMap(scian.clase)

  attachScianChildren(sectorMap, subsectorMap, 2)
  attachScianChildren(subsectorMap, ramaMap, 3)
  attachScianChildren(ramaMap, subramaMap, 4)
  attachScianChildren(subramaMap, claseMap, 5)

  const roots = Array.from(sectorMap.values())
  sortScianTree(roots)
  return roots
}

export function DenueAdvancedSearchModal({ open, onOpenChange, onApply }: Props) {
  const [catalogs, setCatalogs] = useState<DenueCatalogosResponse | null>(null)
  const [loadingCatalogs, setLoadingCatalogs] = useState(false)
  const [catalogError, setCatalogError] = useState<string | null>(null)
  const [expandedSections, setExpandedSections] = useState<Record<AdvancedSection, boolean>>({
    search: true,
    activity: false,
    size: false,
    geography: false,
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

  const toggleSection = useCallback((section: AdvancedSection) => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }))
  }, [])

  const handleFieldChange = useCallback((key: keyof typeof searchFields, value: string) => {
    setSearchFields((prev) => ({ ...prev, [key]: value }))
  }, [])

  const toggleScianSelection = useCallback((codigo: string) => {
    setSelectedScianCodes((prev) => {
      const next = new Set(prev)
      if (next.has(codigo)) {
        next.delete(codigo)
      } else {
        next.add(codigo)
      }
      return next
    })
  }, [])

  const toggleScianExpansion = useCallback(
    (codigo: string, isLeaf: boolean) => {
      setExpandedScianCodes((prev) => {
        const next = new Set(prev)
        if (next.has(codigo)) {
          next.delete(codigo)
        } else {
          next.add(codigo)
        }
        return next
      })
      if (isLeaf && !claseIndice[codigo]) {
        void (async () => {
          setLoadingClaseIndice((prev) => {
            const next = new Set(prev)
            next.add(codigo)
            return next
          })
          try {
            const response = await listScianClaseIndice({ codigoClase: codigo })
            const items = response.items.map((item) => item.item).filter(Boolean)
            setClaseIndice((prev) => ({ ...prev, [codigo]: items }))
          } catch {
            setClaseIndice((prev) => ({ ...prev, [codigo]: [] }))
          } finally {
            setLoadingClaseIndice((prev) => {
              const next = new Set(prev)
              next.delete(codigo)
              return next
            })
          }
        })()
      }
    },
    [claseIndice],
  )

  const toggleSize = useCallback((value: string) => {
    setSizeSelections((prev) => {
      const next = new Set(prev)
      if (next.has(value)) {
        next.delete(value)
      } else {
        next.add(value)
      }
      return next
    })
  }, [])

  const toggleStateSelection = useCallback((code: string) => {
    setSelectedStates((prev) => {
      const next = new Set(prev)
      if (next.has(code)) {
        next.delete(code)
      } else {
        next.add(code)
      }
      return next
    })
  }, [])

  const toggleMunicipalitySelection = useCallback((code: string) => {
    setSelectedMunicipalities((prev) => {
      const next = new Set(prev)
      if (next.has(code)) {
        next.delete(code)
      } else {
        next.add(code)
      }
      return next
    })
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

  const handleApply = useCallback(() => {
    const filters: DenueAdvancedFilters = {
      search: { ...searchFields },
      actividad: Array.from(selectedScianCodes),
      estrato: Array.from(sizeSelections),
      geografia: {
        estados: Array.from(selectedStates),
        municipios: Array.from(selectedMunicipalities),
      },
    }
    onApply?.(filters)
    onOpenChange(false)
  }, [onApply, onOpenChange, searchFields, selectedScianCodes, sizeSelections, selectedStates, selectedMunicipalities])

  const renderScianNodes = useCallback(
    (nodes: ScianTreeNode[], level = 0) =>
      nodes.map((node) => {
        const hasChildren = node.children.length > 0
        const isExpanded = expandedScianCodes.has(node.codigo)
        const isLeaf = !hasChildren
        const loadingIndex = loadingClaseIndice.has(node.codigo)
        const items = claseIndice[node.codigo] ?? []
        const checked = selectedScianCodes.has(node.codigo)
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
              <Checkbox checked={checked} onCheckedChange={() => toggleScianSelection(node.codigo)} />
              <div className="flex flex-col">
                <div className="flex items-baseline gap-2 text-sm font-semibold">
                  <span className="text-xs text-muted-foreground">{node.codigo}</span>
                  <span>{node.titulo ?? "Sin título"}</span>
                </div>
                {node.descripcion ? (
                  <p className="text-[11px] text-muted-foreground">{node.descripcion}</p>
                ) : null}
              </div>
            </div>
            {isLeaf && isExpanded ? (
              <div className="ml-6 space-y-1 rounded-xl border border-border/60 bg-muted/5 p-2 text-xs">
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
                  <Button type="button" size="sm" variant="ghost" onClick={() => toggleScianExpansion(node.codigo, isLeaf)}>
                    Cargar índice
                  </Button>
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
    [claseIndice, expandedScianCodes, loadingClaseIndice, selectedScianCodes, toggleScianExpansion, toggleScianSelection],
  )

  const geoStates = catalogs?.geo.states ?? []

  const encodeMunicipalityKey = useCallback((stateCode: string, municipalityCode: string) => {
    return `${stateCode}${MUNICIPALITY_KEY_SEPARATOR}${municipalityCode}`
  }, [])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>Búsqueda avanzada</DialogTitle>
          <DialogDescription>
            Combina filtros por texto, actividad, tamaño y geografía para acotar los resultados de DENUE.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {/* Section 1 - Búsqueda */}
          <section className="space-y-2 rounded-lg border border-border/70 p-3">
            <button
              type="button"
              className="flex w-full items-center justify-between text-left text-sm font-semibold"
              onClick={() => toggleSection("search")}
            >
              <span>Búsqueda</span>
              <ChevronDownIcon
                className={cn("h-4 w-4 transition", expandedSections.search && "rotate-180")}
              />
            </button>
            {expandedSections.search ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="advanced-nombre">Nombre o razón social</Label>
                  <Input
                    id="advanced-nombre"
                    value={searchFields.nombre}
                    onChange={(event) => handleFieldChange("nombre", event.target.value)}
                    placeholder="Ej. OXXO, hospital"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="advanced-calle">Calle o avenida</Label>
                  <Input
                    id="advanced-calle"
                    value={searchFields.calle}
                    onChange={(event) => handleFieldChange("calle", event.target.value)}
                    placeholder="Ej. Reforma"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="advanced-colonia">Colonia o fraccionamiento</Label>
                  <Input
                    id="advanced-colonia"
                    value={searchFields.colonia}
                    onChange={(event) => handleFieldChange("colonia", event.target.value)}
                    placeholder="Ej. Roma Norte"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="advanced-cp">Código postal</Label>
                  <Input
                    id="advanced-cp"
                    value={searchFields.cp}
                    onChange={(event) => handleFieldChange("cp", event.target.value)}
                    placeholder="Ej. 06000"
                  />
                </div>
              </div>
            ) : null}
          </section>

          {/* Section 2 - Actividad Económica */}
          <section className="space-y-2 rounded-lg border border-border/70 p-3">
            <button
              type="button"
              className="flex w-full items-center justify-between text-left text-sm font-semibold"
              onClick={() => toggleSection("activity")}
            >
              <span>Actividad Económica</span>
              <ChevronDownIcon
                className={cn("h-4 w-4 transition", expandedSections.activity && "rotate-180")}
              />
            </button>
            {expandedSections.activity ? (
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label htmlFor="actividad-busqueda">Buscar actividad</Label>
                  <Input id="actividad-busqueda" placeholder="Ej. servicios, comercio" />
                </div>
                <div className="rounded-lg border border-border/60">
                  {loadingCatalogs ? (
                    <div className="flex items-center justify-center p-6 text-sm text-muted-foreground">
                      Cargando catálogo SCIAN…
                    </div>
                  ) : catalogError ? (
                    <div className="p-4 text-sm text-destructive">{catalogError}</div>
                  ) : (
                    <ScrollArea className="max-h-[50vh] px-2 py-3">
                      <div className="space-y-3">{renderScianNodes(scianTree)}</div>
                    </ScrollArea>
                  )}
                </div>
              </div>
            ) : null}
          </section>

          {/* Section 3 - Tamaño */}
          <section className="space-y-2 rounded-lg border border-border/70 p-3">
            <button
              type="button"
              className="flex w-full items-center justify-between text-left text-sm font-semibold"
              onClick={() => toggleSection("size")}
            >
              <span>Tamaño del establecimiento</span>
              <ChevronDownIcon
                className={cn("h-4 w-4 transition", expandedSections.size && "rotate-180")}
              />
            </button>
            {expandedSections.size ? (
              <div className="grid grid-cols-2 gap-2">
                {SIZE_OPTIONS.map((option) => {
                  const checked = sizeSelections.has(option.value)
                  return (
                    <label
                      key={option.value}
                      className={cn(
                        "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm",
                        checked ? "border-primary bg-primary/5" : "border-border/60",
                      )}
                    >
                      <Checkbox checked={checked} onCheckedChange={() => toggleSize(option.value)} />
                      <span>{option.label}</span>
                    </label>
                  )
                })}
              </div>
            ) : null}
          </section>

          {/* Section 4 - Área geográfica */}
          <section className="space-y-2 rounded-lg border border-border/70 p-3">
            <button
              type="button"
              className="flex w-full items-center justify-between text-left text-sm font-semibold"
              onClick={() => toggleSection("geography")}
            >
              <span>Área geográfica</span>
              <ChevronDownIcon
                className={cn("h-4 w-4 transition", expandedSections.geography && "rotate-180")}
              />
            </button>
            {expandedSections.geography ? (
              <div className="rounded-lg border border-border/60">
                {loadingCatalogs ? (
                  <div className="flex items-center justify-center p-6 text-sm text-muted-foreground">
                    Cargando estados y municipios…
                  </div>
                ) : catalogError ? (
                  <div className="p-4 text-sm text-destructive">{catalogError}</div>
                ) : (
                  <ScrollArea className="max-h-[50vh] px-2 py-3">
                    <div className="space-y-3">
                      {geoStates.map((state) => {
                        const stateExpanded = expandedStates.has(state.code)
                        const stateSelected = selectedStates.has(state.code)
                        return (
                          <div key={state.code} className="space-y-2">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2 text-sm">
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
                              <div className="space-y-1 pl-10 text-sm">
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
                  </ScrollArea>
                )}
              </div>
            ) : null}
          </section>
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
          <Button type="button" onClick={handleApply}>
            Aplicar filtros
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
