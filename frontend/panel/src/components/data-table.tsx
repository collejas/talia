"use client"

import * as React from "react"
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type UniqueIdentifier,
} from "@dnd-kit/core"
// no directional modifier at DnD context level; we clamp transforms per draggable
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  horizontalListSortingStrategy,
} from "@dnd-kit/sortable"
import {
  IconChevronDown,
  IconChevronLeft,
  IconChevronRight,
  IconChevronUp,
  IconChevronsLeft,
  IconChevronsRight,
  IconArrowsUpDown,
  IconCircleCheckFilled,
  IconDotsVertical,
  IconGripVertical,
  IconLayoutColumns,
  IconLoader,
  IconTrendingUp,
} from "@tabler/icons-react"
import {
  ColumnDef,
  ColumnFiltersState,
  flexRender,
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type Column,
  Row,
  SortingState,
  useReactTable,
  VisibilityState,
  type Header,
} from "@tanstack/react-table"
import { Area, AreaChart, CartesianGrid, XAxis } from "recharts"
import { z } from "zod"
import Link from "next/link"

import { useIsMobile } from '@/hooks/use-mobile'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Tabs,
  TabsContent,
} from '@/components/ui/tabs'

export const schema = z.object({
  id: z.number(),
  header: z.string(),
  type: z.string(),
  status: z.string(),
  target: z.string(),
  limit: z.string(),
  reviewer: z.string(),
  raw: z.record(z.string(), z.any()).optional(),
})

type TableRowData = z.infer<typeof schema>
export type DataTableRow = TableRowData

type ColumnMeta = {
  label?: string
  reorderable?: boolean
}

type ColumnLabels = {
  header?: string
  type?: string
  status?: string
  target?: string
  limit?: string
  reviewer?: string
}
export type DataTableColumnLabels = ColumnLabels

type MetricColumnConfig = {
  id: string
  label: string
  metricKey: string
}

const COLUMN_DRAG_PREFIX = "column:"
const NON_REORDERABLE_COLUMN_IDS = new Set(["drag-handle", "row-select"])
const BADGE_VARIANTS = new Set(["default", "secondary", "destructive", "outline"])

function columnDragId(columnId: string): string {
  return `${COLUMN_DRAG_PREFIX}${columnId}`
}

function stripColumnDragId(dragId: string): string {
  return dragId.replace(COLUMN_DRAG_PREFIX, "")
}

function isColumnReorderable(columnId: string, meta?: ColumnMeta): boolean {
  if (meta?.reorderable === false) return false
  if (NON_REORDERABLE_COLUMN_IDS.has(columnId)) return false
  return true
}

function normalizeOrder(order: string[], reference: string[]): string[] {
  const filtered = order.filter((id) => reference.includes(id))
  const missing = reference.filter((id) => !filtered.includes(id))
  const next = [...filtered, ...missing]
  if (next.length === order.length && next.every((id, index) => id === order[index])) {
    return order
  }
  return next
}

function isSameOrder(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index])
}

function normalizeSorting(order: SortingState, reference: string[]): SortingState {
  const seen = new Set<string>()
  const filtered = order.filter((entry) => {
    if (!reference.includes(entry.id)) return false
    if (seen.has(entry.id)) return false
    seen.add(entry.id)
    return true
  })
  if (
    filtered.length === order.length &&
    filtered.every((entry, index) => entry.id === order[index]?.id && entry.desc === order[index]?.desc)
  ) {
    return order
  }
  return filtered
}

// Create a separate component for the drag handle
function DragHandle({ id }: { id: number }) {
  const { attributes, listeners } = useSortable({
    id,
  })

  return (
    <Button
      {...attributes}
      {...listeners}
      variant="ghost"
      size="icon"
      className="text-muted-foreground size-7 hover:bg-transparent"
    >
      <IconGripVertical className="text-muted-foreground size-3" />
      <span className="sr-only">Drag to reorder</span>
    </Button>
  )
}

export function SortButton<TData>({
  column,
  label,
  align = "left",
}: {
  column: Column<TData, unknown>
  label: string
  align?: "left" | "right"
}) {
  const direction = column.getIsSorted()

  return (
    <button
      type="button"
      onClick={column.getToggleSortingHandler()}
      className={["flex w-full items-center gap-1 text-xs font-medium uppercase tracking-wide text-muted-foreground", align === "right" ? "justify-end" : "justify-start"].join(" ")}
    >
      <span>{label}</span>
      <SortIcon direction={direction} />
    </button>
  )
}

function SortIcon({ direction }: { direction: false | "asc" | "desc" }) {
  if (direction === "asc") {
    return <IconChevronUp className="size-3" aria-hidden />
  }
  if (direction === "desc") {
    return <IconChevronDown className="size-3" aria-hidden />
  }
  return <IconArrowsUpDown className="size-3" aria-hidden />
}

function createBaseColumns(
  labels: ColumnLabels = {},
  detailRenderer?: (row: TableRowData) => React.ReactNode,
  detailDescription?: string,
  hideDefaultActions = false,
  expandedRowId?: string | null,
  setExpandedRowId?: (rowId: string | null) => void,
): ColumnDef<TableRowData>[] {
  const headerLabel = labels.header ?? "Sesión"
  const typeLabel = labels.type ?? "Ubicación / Etapa"
  const statusLabel = labels.status ?? "Chat"
  const targetLabel = labels.target ?? "Visitas / Valor"
  const reviewerLabel = labels.reviewer ?? "Vendedor Asig."

  return [
    {
      id: "drag-handle",
      header: () => null,
      cell: ({ row }) => <DragHandle id={row.original.id} />,
      meta: { label: "Mover fila", reorderable: false } satisfies ColumnMeta,
    },
    {
      id: "row-select",
      header: ({ table }) => (
        <div className="flex items-center justify-center">
          <Checkbox
            checked={
              table.getIsAllPageRowsSelected() ||
              (table.getIsSomePageRowsSelected() && "indeterminate")
            }
            onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
            aria-label="Select all"
          />
        </div>
      ),
      cell: ({ row }) => (
        <div className="flex items-center justify-center">
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(value) => row.toggleSelected(!!value)}
            aria-label="Select row"
          />
        </div>
      ),
      enableSorting: false,
      enableHiding: false,
      meta: { label: "Seleccionar", reorderable: false } satisfies ColumnMeta,
    },
    {
      accessorKey: "header",
      id: "session",
      header: ({ column }) => <SortButton column={column} label={headerLabel} />,
      cell: ({ row }) => {
        const raw = row.original.raw as Record<string, unknown> | undefined
        const detailHref = typeof raw?.detail_href === "string" ? raw.detail_href : ""
        if (detailHref) {
          return (
            <Link href={detailHref} className="font-medium text-primary underline-offset-2 hover:underline">
              {row.original.header}
            </Link>
          )
        }
        return (
          <TableCellViewer
            item={row.original}
            renderDetails={detailRenderer}
            detailDescription={detailDescription}
            open={expandedRowId === row.original.id.toString()}
            onOpenChange={(open) => setExpandedRowId?.(open ? row.original.id.toString() : null)}
          />
        )
      },
      meta: { label: headerLabel } satisfies ColumnMeta,
    },
    {
      accessorKey: "type",
      id: "type",
      header: ({ column }) => <SortButton column={column} label={typeLabel} />,
      cell: ({ row }) => (
        <div className="w-32">
          <Badge variant="outline" className="text-muted-foreground px-1.5">
            {row.original.type}
          </Badge>
        </div>
      ),
      meta: { label: typeLabel } satisfies ColumnMeta,
    },
    {
      accessorKey: "status",
      id: "chat",
      header: ({ column }) => <SortButton column={column} label={statusLabel} />,
      cell: ({ row }) => {
        const raw = row.original.raw as Record<string, unknown> | undefined
        const statusMeta =
          raw && typeof raw === "object"
            ? (raw as { status_meta?: { label?: string; variant?: string } }).status_meta
            : undefined
        if (statusMeta?.label) {
          const variant = BADGE_VARIANTS.has(statusMeta.variant ?? "")
            ? (statusMeta.variant as "default" | "secondary" | "destructive" | "outline")
            : "outline"
          return (
            <Badge variant={variant} className="text-muted-foreground px-1.5">
              {statusMeta.label}
            </Badge>
          )
        }
        const hasChat = row.original.status === "Done"
        return (
          <Badge
            variant={hasChat ? "default" : "outline"}
            className="text-muted-foreground px-1.5"
          >
            {hasChat ? (
              <>
                <IconCircleCheckFilled className="fill-green-500 dark:fill-green-400" />
                Con chat
              </>
            ) : (
              <>
                <IconLoader />
                Sin chat
              </>
            )}
          </Badge>
        )
      },
      meta: { label: statusLabel } satisfies ColumnMeta,
    },
    {
      accessorKey: "target",
      id: "visits",
      header: ({ column }) => <SortButton column={column} label={targetLabel} align="right" />,
      meta: { label: targetLabel } satisfies ColumnMeta,
      cell: ({ row }) => {
        const raw = row.original.raw as Record<string, unknown> | undefined
        const metricMeta =
          raw && typeof raw === "object"
            ? (raw as { metric_meta?: { formatted?: string; value?: unknown } }).metric_meta
            : undefined
        if (metricMeta?.formatted) {
          return <div className="text-right tabular-nums">{metricMeta.formatted}</div>
        }
        const rawCount =
          raw && typeof raw === "object"
            ? (raw as { visit_count?: unknown }).visit_count
            : undefined
        const fallback = Number(row.original.target)
        const value =
          typeof rawCount === "number" && Number.isFinite(rawCount) ? rawCount : fallback
        const formatted = Number.isFinite(value)
          ? value.toLocaleString("es-MX")
          : row.original.target
        return <div className="text-right tabular-nums">{formatted}</div>
      },
    },
    {
      accessorKey: "reviewer",
      id: "reviewer",
      header: ({ column }) => <SortButton column={column} label={reviewerLabel} />,
      cell: ({ row }) => {
        const isAssigned = row.original.reviewer !== "Assign reviewer"

        if (isAssigned) {
          return row.original.reviewer
        }

        return (
          <>
            <Label htmlFor={`${row.original.id}-reviewer`} className="sr-only">
              {reviewerLabel}
            </Label>
            <Select>
              <SelectTrigger
                className="w-38 **:data-[slot=select-value]:block **:data-[slot=select-value]:truncate"
                size="sm"
                id={`${row.original.id}-reviewer`}
              >
                <SelectValue placeholder="Assign reviewer" />
              </SelectTrigger>
              <SelectContent align="end">
                <SelectItem value="Eddie Lake">Eddie Lake</SelectItem>
                <SelectItem value="Jamik Tashpulatov">
                  Jamik Tashpulatov
                </SelectItem>
              </SelectContent>
            </Select>
          </>
        )
      },
      meta: { label: reviewerLabel } satisfies ColumnMeta,
    },
    ...(hideDefaultActions
      ? []
      : [
          {
            id: "actions",
            cell: () => (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    className="data-[state=open]:bg-muted text-muted-foreground flex size-8"
                    size="icon"
                  >
                    <IconDotsVertical />
                    <span className="sr-only">Open menu</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-32">
                  <DropdownMenuItem>Edit</DropdownMenuItem>
                  <DropdownMenuItem>Make a copy</DropdownMenuItem>
                  <DropdownMenuItem>Favorite</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive">Delete</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ),
            meta: { label: "Acciones", reorderable: false } satisfies ColumnMeta,
          } as ColumnDef<TableRowData>,
        ]),
  ]
}

function extractMetric(row: TableRowData, key: string): number {
  const raw = row.raw as { metrics?: Record<string, unknown> } | undefined
  const metrics = raw && typeof raw === "object" ? raw.metrics : undefined
  if (!metrics) return 0
  const value = metrics[key]
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string") {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return 0
}

function formatMetric(value: number): string {
  if (!Number.isFinite(value)) return "0"
  return new Intl.NumberFormat("es-MX").format(value)
}

type SortableColumnHeaderProps = {
  header: Header<TableRowData, unknown>
  id: string
  mounted: boolean
}

function SortableColumnHeader({ header, id, mounted }: SortableColumnHeaderProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id })

  const translateX = transform?.x ?? 0
  const style: React.CSSProperties = {
    transform: `translate3d(${translateX}px, 0, 0)` ,
    transition,
    opacity: isDragging ? 0.6 : undefined,
  }

  if (!mounted) {
    return (
      <TableHead colSpan={header.colSpan}>
        {flexRender(header.column.columnDef.header, header.getContext())}
      </TableHead>
    )
  }

  return (
    <TableHead ref={setNodeRef} colSpan={header.colSpan} style={style}>
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label="Reordenar columna"
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          className="text-muted-foreground hover:text-foreground focus:outline-none"
        >
          <IconGripVertical className="size-3" aria-hidden />
        </button>
        <div className="flex-1">
          {flexRender(header.column.columnDef.header, header.getContext())}
        </div>
      </div>
    </TableHead>
  )
}

function DraggableRow({
  row,
  mounted,
}: {
  row: Row<z.infer<typeof schema>>
  mounted: boolean
}) {
  const { transform, transition, setNodeRef, isDragging } = useSortable({
    id: row.original.id,
  })

  if (!mounted) {
    return (
      <TableRow>
        {row.getVisibleCells().map((cell) => (
          <TableCell key={cell.id}>
            {flexRender(cell.column.columnDef.cell, cell.getContext())}
          </TableCell>
        ))}
      </TableRow>
    )
  }

  return (
    <TableRow
      data-state={row.getIsSelected() && "selected"}
      data-dragging={isDragging}
      ref={setNodeRef}
      className="relative z-0 data-[dragging=true]:z-10 data-[dragging=true]:opacity-80"
      style={{
        transform: `translate3d(0, ${transform?.y ?? 0}px, 0)` ,
        transition: transition,
      }}
    >
      {row.getVisibleCells().map((cell) => (
        <TableCell key={cell.id}>
          {flexRender(cell.column.columnDef.cell, cell.getContext())}
        </TableCell>
      ))}
    </TableRow>
  )
}

export function DataTable({
  data: initialData,
  extraColumns = [],
  initialVisibility,
  storageKey,
  columnLabels,
  metricColumns = [],
  renderRowDetails,
  detailDescription,
  toolbarLeadingActions,
  toolbarActions,
  toolbarBelowActions,
  selectionActions,
  forcedColumnOrder,
  hideDefaultActions = false,
  loading = false,
}: {
  data: TableRowData[]
  extraColumns?: ColumnDef<TableRowData>[]
  initialVisibility?: VisibilityState
  storageKey?: string
  columnLabels?: ColumnLabels
  metricColumns?: MetricColumnConfig[]
  renderRowDetails?: (row: TableRowData) => React.ReactNode
  detailDescription?: string
  toolbarLeadingActions?: React.ReactNode
  toolbarActions?: React.ReactNode
  toolbarBelowActions?: React.ReactNode
  selectionActions?: (selectedRows: TableRowData[]) => React.ReactNode
  forcedColumnOrder?: string[]
  hideDefaultActions?: boolean
  loading?: boolean
}) {
  const [data, setData] = React.useState(() => initialData)
  const [rowSelection, setRowSelection] = React.useState({})
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>(
    () => initialVisibility ?? {}
  )
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>(
    []
  )
  const [sorting, setSorting] = React.useState<SortingState>([])
  const [expandedRowId, setExpandedRowId] = React.useState<string | null>(null)
  const [pagination, setPagination] = React.useState({
    pageIndex: 0,
    pageSize: 10,
  })
  const [mounted, setMounted] = React.useState(false)
  const sortableId = React.useId()
  const sensors = useSensors(
    useSensor(MouseSensor, {}),
    useSensor(TouchSensor, {}),
    useSensor(KeyboardSensor, {})
  )

  React.useEffect(() => {
    setData(initialData)
  }, [initialData])

  React.useEffect(() => {
    setMounted(true)
  }, [])

  React.useEffect(() => {
    if (!storageKey || typeof window === "undefined") return
    try {
      const stored = window.localStorage.getItem(`${storageKey}:visibility`)
      if (stored) {
        const parsed = JSON.parse(stored)
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          setColumnVisibility((current) => ({ ...current, ...(parsed as VisibilityState) }))
        }
      }
    } catch (error) {
      console.warn("[visitas] No se pudo leer la visibilidad de columnas", error)
    }
  }, [storageKey])

  React.useEffect(() => {
    if (!storageKey || typeof window === "undefined") return
    try {
      window.localStorage.setItem(`${storageKey}:visibility`, JSON.stringify(columnVisibility))
    } catch (error) {
      console.warn("[visitas] No se pudo guardar la visibilidad de columnas", error)
    }
  }, [columnVisibility, storageKey])

  React.useEffect(() => {
    if (!storageKey || typeof window === "undefined") return
    try {
      const stored = window.localStorage.getItem(`${storageKey}:expanded-row`)
      if (stored) {
        const parsed = JSON.parse(stored)
        if (typeof parsed === "string" && parsed.trim().length) {
          setExpandedRowId(parsed)
        }
      }
    } catch (error) {
      console.warn("[visitas] No se pudo leer la fila expandida", error)
    }
  }, [storageKey])

  React.useEffect(() => {
    if (!storageKey || typeof window === "undefined") return
    try {
      if (expandedRowId) {
        window.localStorage.setItem(`${storageKey}:expanded-row`, JSON.stringify(expandedRowId))
      } else {
        window.localStorage.removeItem(`${storageKey}:expanded-row`)
      }
    } catch (error) {
      console.warn("[visitas] No se pudo guardar la fila expandida", error)
    }
  }, [expandedRowId, storageKey])


  const dataIds = React.useMemo<UniqueIdentifier[]>(
    () => data?.map(({ id }) => id) || [],
    [data]
  )

  React.useEffect(() => {
    if (expandedRowId && !dataIds.some((id) => String(id) === expandedRowId)) {
      setExpandedRowId(null)
    }
  }, [dataIds, expandedRowId])

  const resolvedBaseColumns = React.useMemo(
    () =>
      createBaseColumns(
        columnLabels,
        renderRowDetails,
        detailDescription,
        hideDefaultActions,
        expandedRowId,
        setExpandedRowId,
      ),
    [columnLabels, renderRowDetails, detailDescription, hideDefaultActions, expandedRowId]
  )

  const metricColumnDefs = React.useMemo<ColumnDef<TableRowData>[]>(() => {
    if (!metricColumns.length) return []
    return metricColumns.map((config) => ({
      id: config.id,
      accessorFn: (row) => extractMetric(row, config.metricKey),
      header: () => <div className="w-full text-right">{config.label}</div>,
      cell: ({ row }) => {
        const value = extractMetric(row.original, config.metricKey)
        return <div className="text-right tabular-nums">{formatMetric(value)}</div>
      },
      meta: { label: config.label },
    }))
  }, [metricColumns])

  const mergedColumns = React.useMemo(
    () => [...resolvedBaseColumns, ...metricColumnDefs, ...extraColumns],
    [resolvedBaseColumns, metricColumnDefs, extraColumns]
  )

  const defaultColumnOrder = React.useMemo(() => {
    return mergedColumns
      .map((column) => {
        const colId = column.id
        if (typeof colId === "string" && colId.length) {
          return colId
        }
        const accessorKey = (column as { accessorKey?: unknown }).accessorKey
        return typeof accessorKey === "string" && accessorKey.length ? accessorKey : ""
      })
      .filter((id): id is string => id !== "")
  }, [mergedColumns])

  const resolvedColumnOrder = React.useMemo(() => {
    if (!forcedColumnOrder?.length) return defaultColumnOrder
    return normalizeOrder(forcedColumnOrder, defaultColumnOrder)
  }, [defaultColumnOrder, forcedColumnOrder])

  const [columnOrder, setColumnOrder] = React.useState<string[]>(resolvedColumnOrder)
  const hasLoadedColumnOrder = React.useRef(false)
  const hasLoadedSorting = React.useRef(false)

  React.useEffect(() => {
    if (forcedColumnOrder?.length) {
      setColumnOrder((current) =>
        isSameOrder(current, resolvedColumnOrder) ? current : resolvedColumnOrder
      )
      return
    }
    if (!storageKey || typeof window === "undefined" || hasLoadedColumnOrder.current) {
      return
    }
    try {
      const stored = window.localStorage.getItem(storageKey)
      if (stored) {
        const parsed = JSON.parse(stored)
        if (Array.isArray(parsed)) {
          setColumnOrder(normalizeOrder(parsed, defaultColumnOrder))
        }
      }
    } catch (error) {
      console.warn("[visitas] No se pudo leer el orden de columnas", error)
    } finally {
      hasLoadedColumnOrder.current = true
    }
  }, [storageKey, defaultColumnOrder, forcedColumnOrder, resolvedColumnOrder])

  React.useEffect(() => {
    setColumnOrder((prev) => normalizeOrder(prev, defaultColumnOrder))
  }, [defaultColumnOrder])

  React.useEffect(() => {
    if (!storageKey || typeof window === "undefined" || hasLoadedSorting.current) {
      return
    }
    try {
      const stored = window.localStorage.getItem(`${storageKey}:sorting`)
      if (stored) {
        const parsed = JSON.parse(stored)
        if (Array.isArray(parsed)) {
          const normalized = normalizeSorting(
            parsed.filter(
              (entry): entry is { id: string; desc: boolean } =>
                Boolean(entry) &&
                typeof entry === "object" &&
                typeof (entry as { id?: unknown }).id === "string" &&
                typeof (entry as { desc?: unknown }).desc === "boolean",
            ),
            defaultColumnOrder,
          )
          setSorting(normalized)
        }
      }
    } catch (error) {
      console.warn("[visitas] No se pudo leer el orden de columnas", error)
    } finally {
      hasLoadedSorting.current = true
    }
  }, [storageKey, defaultColumnOrder])

  React.useEffect(() => {
    setSorting((prev) => normalizeSorting(prev, defaultColumnOrder))
  }, [defaultColumnOrder])

  React.useEffect(() => {
    if (!storageKey || typeof window === "undefined") return
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(columnOrder))
    } catch (error) {
      console.warn("[visitas] No se pudo guardar el orden de columnas", error)
    }
  }, [columnOrder, storageKey])

  React.useEffect(() => {
    if (!storageKey || typeof window === "undefined" || !hasLoadedSorting.current) return
    try {
      window.localStorage.setItem(`${storageKey}:sorting`, JSON.stringify(sorting))
    } catch (error) {
      console.warn("[visitas] No se pudo guardar el ordenamiento", error)
    }
  }, [sorting, storageKey])

  const table = useReactTable({
    data,
    columns: mergedColumns,
    state: {
      sorting,
      columnVisibility,
      rowSelection,
      columnFilters,
      pagination,
      columnOrder,
    },
    getRowId: (row) => row.id.toString(),
    enableRowSelection: true,
    onRowSelectionChange: setRowSelection,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onPaginationChange: setPagination,
    onColumnOrderChange: setColumnOrder,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
  })

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over) return

    if (
      typeof active.id === "string" &&
      typeof over.id === "string" &&
      active.id.startsWith(COLUMN_DRAG_PREFIX) &&
      over.id.startsWith(COLUMN_DRAG_PREFIX)
    ) {
      const sourceId = stripColumnDragId(active.id)
      const targetId = stripColumnDragId(over.id)
      if (sourceId !== targetId) {
        setColumnOrder((prev) => {
          const oldIndex = prev.indexOf(sourceId)
          const newIndex = prev.indexOf(targetId)
          if (oldIndex === -1 || newIndex === -1) return prev
          const next = arrayMove(prev, oldIndex, newIndex)
          table.setColumnOrder(next)
          return next
        })
      }
      return
    }

    if (active.id !== over.id) {
      setData((data) => {
        const oldIndex = dataIds.indexOf(active.id)
        const newIndex = dataIds.indexOf(over.id)
        return arrayMove(data, oldIndex, newIndex)
      })
    }
  }

  return (
    <Tabs
      defaultValue="outline"
      className="w-full flex-col justify-start gap-6"
    >
      <div className="flex items-center justify-between gap-4 px-4 lg:px-6">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {toolbarLeadingActions}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {toolbarActions}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <IconLayoutColumns />
                <span className="hidden lg:inline">Personalizar columnas</span>
                <span className="lg:hidden">Columnas</span>
                <IconChevronDown />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {table
                .getAllColumns()
                .filter(
                  (column) =>
                    typeof column.accessorFn !== "undefined" &&
                    column.getCanHide()
                )
                .map((column) => {
                    return (
                      <DropdownMenuCheckboxItem
                        key={column.id}
                        className="capitalize"
                        checked={column.getIsVisible()}
                        onCheckedChange={(value) =>
                          column.toggleVisibility(!!value)
                        }
                        onSelect={(event) => event.preventDefault()}
                      >
                      {((column.columnDef.meta as { label?: string } | undefined)?.label)
                        ?? (typeof column.columnDef.header === "string"
                          ? column.columnDef.header
                          : column.id)}
                      </DropdownMenuCheckboxItem>
                    )
                  })}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      {toolbarBelowActions ? (
        <div className="px-4 lg:px-6">{toolbarBelowActions}</div>
      ) : null}
      <TabsContent
        value="outline"
        className="relative flex flex-col gap-4 overflow-auto px-4 lg:px-6"
      >
        <div className="overflow-hidden rounded-lg border">
          <DndContext
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
            sensors={sensors}
            id={sortableId}
          >
            <Table>
              <TableHeader className="bg-muted sticky top-0 z-10">
                {table.getHeaderGroups().map((headerGroup) => {
                  const sortableHeaders = headerGroup.headers.filter((header) => {
                    if (header.isPlaceholder) return false
                    const meta = header.column.columnDef.meta as ColumnMeta | undefined
                    return isColumnReorderable(header.column.id, meta)
                  })
                  const sortableItems = sortableHeaders.map((header) =>
                    columnDragId(header.column.id)
                  )

                  return (
                    <TableRow key={headerGroup.id}>
                      <SortableContext
                        items={sortableItems}
                        strategy={horizontalListSortingStrategy}
                      >
                        {headerGroup.headers.map((header) => {
                          if (header.isPlaceholder) {
                            return (
                              <TableHead key={header.id} colSpan={header.colSpan} />
                            )
                          }

                          const meta = header.column.columnDef.meta as ColumnMeta | undefined
                          const reorderable = isColumnReorderable(
                            header.column.id,
                            meta
                          )

                          if (reorderable) {
                            return (
                              <SortableColumnHeader
                                key={header.id}
                                header={header}
                                id={columnDragId(header.column.id)}
                                mounted={mounted}
                              />
                            )
                          }

                          return (
                            <TableHead key={header.id} colSpan={header.colSpan}>
                              {flexRender(
                                header.column.columnDef.header,
                                header.getContext()
                              )}
                            </TableHead>
                          )
                        })}
                      </SortableContext>
                    </TableRow>
                  )
                })}
              </TableHeader>
              <TableBody className="**:data-[slot=table-cell]:first:w-8">
                {table.getRowModel().rows?.length ? (
                  <SortableContext
                    items={dataIds}
                    strategy={verticalListSortingStrategy}
                  >
                    {table.getRowModel().rows.map((row) => (
                      <DraggableRow key={row.id} row={row} mounted={mounted} />
                    ))}
                  </SortableContext>
                ) : (
                  <TableRow>
                    <TableCell
                      colSpan={mergedColumns.length}
                      className="h-24 text-center"
                    >
                      {loading ? "Cargando datos..." : "No results."}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </DndContext>
        </div>
        <div className="flex items-center justify-between px-4">
          <div className="hidden flex-1 items-center gap-3 text-sm lg:flex">
            <div className="text-muted-foreground">
              {table.getFilteredSelectedRowModel().rows.length} of{" "}
              {table.getFilteredRowModel().rows.length} row(s) selected.
            </div>
            {selectionActions ? selectionActions(table.getFilteredSelectedRowModel().rows.map((row) => row.original)) : null}
          </div>
          <div className="flex w-full items-center gap-8 lg:w-fit">
            <div className="hidden items-center gap-2 lg:flex">
              <Label htmlFor="rows-per-page" className="text-sm font-medium">
                Rows per page
              </Label>
              <Select
                value={`${table.getState().pagination.pageSize}`}
                onValueChange={(value) => {
                  table.setPageSize(Number(value))
                }}
              >
                <SelectTrigger size="sm" className="w-20" id="rows-per-page">
                  <SelectValue
                    placeholder={table.getState().pagination.pageSize}
                  />
                </SelectTrigger>
                <SelectContent side="top">
                  {[10, 20, 30, 40, 50].map((pageSize) => (
                    <SelectItem key={pageSize} value={`${pageSize}`}>
                      {pageSize}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex w-fit items-center justify-center text-sm font-medium">
              Page {table.getState().pagination.pageIndex + 1} of{" "}
              {table.getPageCount()}
            </div>
            <div className="ml-auto flex items-center gap-2 lg:ml-0">
              <Button
                variant="outline"
                className="hidden h-8 w-8 p-0 lg:flex"
                onClick={() => table.setPageIndex(0)}
                disabled={mounted ? !table.getCanPreviousPage() : undefined}
              >
                <span className="sr-only">Go to first page</span>
                <IconChevronsLeft />
              </Button>
              <Button
                variant="outline"
                className="size-8"
                size="icon"
                onClick={() => table.previousPage()}
                disabled={mounted ? !table.getCanPreviousPage() : undefined}
              >
                <span className="sr-only">Go to previous page</span>
                <IconChevronLeft />
              </Button>
              <Button
                variant="outline"
                className="size-8"
                size="icon"
                onClick={() => table.nextPage()}
                disabled={mounted ? !table.getCanNextPage() : undefined}
              >
                <span className="sr-only">Go to next page</span>
                <IconChevronRight />
              </Button>
              <Button
                variant="outline"
                className="hidden size-8 lg:flex"
                size="icon"
                onClick={() => table.setPageIndex(table.getPageCount() - 1)}
                disabled={mounted ? !table.getCanNextPage() : undefined}
              >
                <span className="sr-only">Go to last page</span>
                <IconChevronsRight />
              </Button>
            </div>
          </div>
        </div>
      </TabsContent>
      <TabsContent
        value="past-performance"
        className="flex flex-col px-4 lg:px-6"
      >
        <div className="aspect-video w-full flex-1 rounded-lg border border-dashed"></div>
      </TabsContent>
      <TabsContent value="key-personnel" className="flex flex-col px-4 lg:px-6">
        <div className="aspect-video w-full flex-1 rounded-lg border border-dashed"></div>
      </TabsContent>
      <TabsContent
        value="focus-documents"
        className="flex flex-col px-4 lg:px-6"
      >
        <div className="aspect-video w-full flex-1 rounded-lg border border-dashed"></div>
      </TabsContent>
    </Tabs>
  )
}

const chartData = [
  { month: "January", desktop: 186, mobile: 80 },
  { month: "February", desktop: 305, mobile: 200 },
  { month: "March", desktop: 237, mobile: 120 },
  { month: "April", desktop: 73, mobile: 190 },
  { month: "May", desktop: 209, mobile: 130 },
  { month: "June", desktop: 214, mobile: 140 },
]

const chartConfig = {
  desktop: {
    label: "Desktop",
    color: "var(--primary)",
  },
  mobile: {
    label: "Mobile",
    color: "var(--primary)",
  },
} satisfies ChartConfig

function TableCellViewer({ item, renderDetails, detailDescription, open, onOpenChange }: {
  item: TableRowData
  renderDetails?: (row: TableRowData) => React.ReactNode
  detailDescription?: string
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const isMobile = useIsMobile()
  const drawerDescription = resolveDrawerDescription(item, detailDescription)

  const fallbackChart = (
    <>
      <ChartContainer config={chartConfig}>
        <AreaChart
          accessibilityLayer
          data={chartData}
          margin={{
            left: 0,
            right: 10,
          }}
        >
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="month"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            tickFormatter={(value) => value.slice(0, 3)}
          />
          <ChartTooltip
            cursor={false}
            content={<ChartTooltipContent indicator="dot" />}
          />
          <Area
            dataKey="mobile"
            type="natural"
            fill="var(--color-mobile)"
            fillOpacity={0.6}
            stroke="var(--color-mobile)"
            stackId="a"
          />
          <Area
            dataKey="desktop"
            type="natural"
            fill="var(--color-desktop)"
            fillOpacity={0.4}
            stroke="var(--color-desktop)"
            stackId="a"
          />
        </AreaChart>
      </ChartContainer>
      <Separator />
      <div className="grid gap-2">
        <div className="flex gap-2 leading-none font-medium">
          Trending up by 5.2% this month{" "}
          <IconTrendingUp className="size-4" />
        </div>
        <div className="text-muted-foreground">
          Showing total visitors for the last 6 months. This is just
          some random text to test the layout. It spans multiple lines
          and should wrap around.
        </div>
      </div>
      <Separator />
    </>
  )

  const customContent = renderDetails ? renderDetails(item) : null

  return (
    <Drawer direction={isMobile ? "bottom" : "right"} open={open} onOpenChange={onOpenChange}>
      <DrawerTrigger asChild>
        <Button variant="link" className="text-foreground w-fit px-0 text-left">
          {item.header}
        </Button>
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader className="gap-1">
          <DrawerTitle>{item.header}</DrawerTitle>
          <DrawerDescription>
            {drawerDescription}
          </DrawerDescription>
        </DrawerHeader>
        <div className="flex flex-col gap-4 overflow-y-auto px-4 text-sm">
          {customContent ?? (
            <>
              {!isMobile ? fallbackChart : null}
              <form className="flex flex-col gap-4">
                <div className="flex flex-col gap-3">
                  <Label htmlFor="header">Sesión</Label>
                  <Input id="header" defaultValue={item.header} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col gap-3">
                    <Label htmlFor="type">Estado o País</Label>
                    <Select defaultValue={item.type}>
                      <SelectTrigger id="type" className="w-full">
                        <SelectValue placeholder="Select a type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Table of Contents">
                          Table of Contents
                        </SelectItem>
                        <SelectItem value="Executive Summary">
                          Executive Summary
                        </SelectItem>
                        <SelectItem value="Technical Approach">
                          Technical Approach
                        </SelectItem>
                        <SelectItem value="Design">Design</SelectItem>
                        <SelectItem value="Capabilities">Capabilities</SelectItem>
                        <SelectItem value="Focus Documents">
                          Focus Documents
                        </SelectItem>
                        <SelectItem value="Narrative">Narrative</SelectItem>
                        <SelectItem value="Cover Page">Cover Page</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-col gap-3">
                    <Label htmlFor="status">Chat</Label>
                    <Select defaultValue={item.status}>
                      <SelectTrigger id="status" className="w-full">
                        <SelectValue placeholder="Select a status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Done">Done</SelectItem>
                        <SelectItem value="In Progress">In Progress</SelectItem>
                        <SelectItem value="Not Started">Not Started</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col gap-3">
                    <Label htmlFor="target">Visitas</Label>
                    <Input id="target" defaultValue={item.target} />
                  </div>
                  <div className="flex flex-col gap-3">
                    <Label htmlFor="limit">Estancia prom. (s)</Label>
                    <Input id="limit" defaultValue={item.limit} />
                  </div>
                </div>
                <div className="flex flex-col gap-3">
                  <Label htmlFor="reviewer">Vendedor Asig.</Label>
                  <Select defaultValue={item.reviewer}>
                    <SelectTrigger id="reviewer" className="w-full">
                      <SelectValue placeholder="Select a reviewer" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Eddie Lake">Eddie Lake</SelectItem>
                      <SelectItem value="Jamik Tashpulatov">
                        Jamik Tashpulatov
                      </SelectItem>
                      <SelectItem value="Emily Whalen">Emily Whalen</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </form>
            </>
          )}
        </div>
        <DrawerFooter>
          <DrawerClose asChild>
            <Button variant="outline">Cerrar</Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}

function resolveDrawerDescription(item: TableRowData, fallback?: string): string {
  const raw = (item.raw ?? {}) as Record<string, unknown>
  const contact =
    extractString(raw, ["contacto", "nombre_completo"]) ??
    extractString(raw, ["contacto_nombre"]) ??
    extractString(raw, ["metadata", "contacto_nombre"])
  const account =
    extractString(raw, ["cuenta", "nombre"]) ??
    extractString(raw, ["metadata", "cuenta_nombre"]) ??
    extractString(raw, ["metadata", "empresa"])
  if (contact || account) {
    return [contact ?? "Sin contacto", account ?? "Sin empresa"].join(" · ")
  }
  return fallback ?? "Showing total visitors for the last 6 months"
}

function extractString(raw: Record<string, unknown> | undefined, path: string[]): string | null {
  if (!raw) return null
  let current: unknown = raw
  for (const key of path) {
    if (!current || typeof current !== "object") return null
    current = (current as Record<string, unknown>)[key]
  }
  if (typeof current === "string" && current.trim().length) return current.trim()
  return null
}
