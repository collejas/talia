"use client";

import { ClientDataTable } from "@/components/client-data-table";
import type { DataTableColumnLabels, DataTableRow } from "@/components/data-table";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  OportunidadesFiltersClient,
  type OportunidadesFilterOptions,
  type OportunidadesFiltersState,
} from "./oportunidades-filters.client";
import type { ColumnDef } from "@tanstack/react-table";
import { useState } from "react";

type Props = {
  rows: DataTableRow[];
  columnLabels?: DataTableColumnLabels;
  filters?: {
    q?: string;
    etapaId?: string;
    estado?: string;
    asignadoId?: string;
    cuentaId?: string;
    contactoId?: string;
    canal?: string;
    montoMin?: string;
    montoMax?: string;
    cierreDesde?: string;
    cierreHasta?: string;
    creadoDesde?: string;
    creadoHasta?: string;
    reinicioMin?: string;
  };
  filterOptions?: OportunidadesFilterOptions;
  filterInitial?: Partial<OportunidadesFiltersState>;
};

export function OportunidadesTableClient({
  rows,
  columnLabels,
  filters,
  filterOptions,
  filterInitial,
}: Props) {
  const extraColumns: ColumnDef<DataTableRow>[] = buildExtraColumns();
  const initialVisibility = buildInitialVisibility();
  const filteredRows = filters ? applyClientFilters(rows, filters) : rows;
  const [filtersOpen, setFiltersOpen] = useState(false);

  const toolbarActions = filterOptions ? (
    <Dialog open={filtersOpen} onOpenChange={setFiltersOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Filtros
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>Filtros de oportunidades</DialogTitle>
        </DialogHeader>
        <OportunidadesFiltersClient
          options={filterOptions}
          initial={filterInitial}
          variant="modal"
          onApplied={() => setFiltersOpen(false)}
        />
      </DialogContent>
    </Dialog>
  ) : null;

  return (
    <ClientDataTable
      rows={filteredRows}
      columnLabels={columnLabels}
      extraColumns={extraColumns}
      initialVisibility={initialVisibility}
      storageKey="oportunidades-table-columns"
      toolbarActions={toolbarActions}
    />
  );
}

function buildExtraColumns(): ColumnDef<DataTableRow>[] {
  const extraColumns: ColumnDef<DataTableRow>[] = [
    {
      id: "cuenta",
      header: () => <div className="w-full">Cuenta</div>,
      accessorFn: (row) => {
        const raw = row.raw as { cuenta?: { nombre?: string | null } } | undefined;
        const name = raw?.cuenta?.nombre;
        if (typeof name === "string" && name.trim().length) return name.trim();
        return "Sin cuenta";
      },
      cell: ({ row }) => {
        const raw = row.original.raw as { cuenta?: { nombre?: string | null } } | undefined;
        const name = raw?.cuenta?.nombre;
        return (
          <div className="text-sm text-muted-foreground">
            {typeof name === "string" && name.trim().length ? name.trim() : "Sin cuenta"}
          </div>
        );
      },
      meta: { label: "Cuenta" },
    },
    {
      id: "estado",
      header: () => <div className="w-full">Estado</div>,
      accessorFn: (row) => {
        const raw = row.raw as { estado?: string | null } | undefined;
        return raw?.estado ?? "Sin estado";
      },
      cell: ({ row }) => {
        const raw = row.original.raw as { estado?: string | null } | undefined;
        return (
          <div className="text-sm text-muted-foreground">
            {raw?.estado ?? "Sin estado"}
          </div>
        );
      },
      meta: { label: "Estado" },
    },
    {
      id: "canal",
      header: () => <div className="w-full">Canal</div>,
      accessorFn: (row) => {
        const raw = row.raw as { metadata?: { canal?: string } } | undefined;
        return raw?.metadata?.canal ?? "Sin canal";
      },
      cell: ({ row }) => {
        const raw = row.original.raw as { metadata?: { canal?: string } } | undefined;
        return (
          <div className="text-sm text-muted-foreground">
            {raw?.metadata?.canal ?? "Sin canal"}
          </div>
        );
      },
      meta: { label: "Canal" },
    },
    {
      id: "reinicio",
      header: () => <div className="w-full text-right">Reinicio</div>,
      accessorFn: (row) => {
        const raw = row.raw as { metadata?: { restart_sequence?: number } } | undefined;
        return Number(raw?.metadata?.restart_sequence ?? 1);
      },
      cell: ({ row }) => {
        const raw = row.original.raw as { metadata?: { restart_sequence?: number } } | undefined;
        const value = Number(raw?.metadata?.restart_sequence ?? 1);
        return <div className="text-right tabular-nums">{value}</div>;
      },
      meta: { label: "Reinicio" },
    },
    {
      id: "probabilidad",
      header: () => <div className="w-full text-right">Probabilidad</div>,
      accessorFn: (row) => {
        const raw = row.raw as { probabilidad?: number | null } | undefined;
        return raw?.probabilidad ?? null;
      },
      cell: ({ row }) => {
        const raw = row.original.raw as { probabilidad?: number | null } | undefined;
        const value = raw?.probabilidad;
        if (value == null || Number.isNaN(Number(value))) {
          return <div className="text-right text-muted-foreground">—</div>;
        }
        return <div className="text-right tabular-nums">{Number(value).toFixed(0)}%</div>;
      },
      meta: { label: "Probabilidad" },
    },
    {
      id: "creado",
      header: () => <div className="w-full">Creado</div>,
      accessorFn: (row) => {
        const raw = row.raw as { creado_en?: string | null } | undefined;
        return raw?.creado_en ?? "";
      },
      cell: ({ row }) => {
        const raw = row.original.raw as { creado_en?: string | null } | undefined;
        return <div className="text-sm text-muted-foreground">{formatDate(raw?.creado_en)}</div>;
      },
      meta: { label: "Creado" },
    },
    {
      id: "actualizado",
      header: () => <div className="w-full">Actualizado</div>,
      accessorFn: (row) => {
        const raw = row.raw as { actualizado_en?: string | null } | undefined;
        return raw?.actualizado_en ?? "";
      },
      cell: ({ row }) => {
        const raw = row.original.raw as { actualizado_en?: string | null } | undefined;
        return <div className="text-sm text-muted-foreground">{formatDate(raw?.actualizado_en)}</div>;
      },
      meta: { label: "Actualizado" },
    },
    {
      id: "cerrado",
      header: () => <div className="w-full">Cerrado</div>,
      accessorFn: (row) => {
        const raw = row.raw as { cerrado_en?: string | null } | undefined;
        return raw?.cerrado_en ?? "";
      },
      cell: ({ row }) => {
        const raw = row.original.raw as { cerrado_en?: string | null } | undefined;
        return <div className="text-sm text-muted-foreground">{formatDate(raw?.cerrado_en)}</div>;
      },
      meta: { label: "Cerrado" },
    },
    {
      id: "motivo",
      header: () => <div className="w-full">Motivo pérdida</div>,
      accessorFn: (row) => {
        const raw = row.raw as { motivo_perdida?: string | null } | undefined;
        return raw?.motivo_perdida ?? "—";
      },
      cell: ({ row }) => {
        const raw = row.original.raw as { motivo_perdida?: string | null } | undefined;
        return <div className="text-sm text-muted-foreground">{raw?.motivo_perdida ?? "—"}</div>;
      },
      meta: { label: "Motivo pérdida" },
    },
    {
      id: "demo",
      header: () => <div className="w-full">Demo programada</div>,
      accessorFn: (row) => {
        const raw = row.raw as {
          metadata?: { stage_prep?: { demo?: { demo_scheduled_at?: string } } };
        } | undefined;
        return raw?.metadata?.stage_prep?.demo?.demo_scheduled_at ?? "";
      },
      cell: ({ row }) => {
        const raw = row.original.raw as {
          metadata?: { stage_prep?: { demo?: { demo_scheduled_at?: string } } };
        } | undefined;
        return (
          <div className="text-sm text-muted-foreground">
            {formatDate(raw?.metadata?.stage_prep?.demo?.demo_scheduled_at)}
          </div>
        );
      },
      meta: { label: "Demo programada" },
    },
  ];

  return extraColumns;
}

function buildInitialVisibility(): Record<string, boolean> {
  return {
    cuenta: false,
    estado: false,
    canal: false,
    reinicio: false,
    probabilidad: false,
    creado: false,
    actualizado: false,
    cerrado: false,
    motivo: false,
    demo: false,
  };
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" });
}

function applyClientFilters(
  rows: DataTableRow[],
  filters: NonNullable<Props["filters"]>,
): DataTableRow[] {
  const search = (filters.q ?? "").trim().toLowerCase();
  const minMonto = parseNumber(filters.montoMin);
  const maxMonto = parseNumber(filters.montoMax);
  const reinicioMin = parseNumber(filters.reinicioMin);
  const cierreDesde = parseDate(filters.cierreDesde);
  const cierreHasta = parseDate(filters.cierreHasta);
  const creadoDesde = parseDate(filters.creadoDesde);
  const creadoHasta = parseDate(filters.creadoHasta);

  return rows.filter((row) => {
    const raw = row.raw as Record<string, unknown> | undefined;
    const contacto = extractString(raw, ["contacto", "nombre_completo"]) || extractString(raw, ["metadata", "contacto_nombre"]) || "";
    const cuenta = extractString(raw, ["cuenta", "nombre"]) || "";
    const titulo = extractString(raw, ["titulo"]) || row.header || "";
    const etapaId = extractString(raw, ["etapa", "id"]) || extractString(raw, ["etapa_id"]) || "";
    const etapaNombre = extractString(raw, ["etapa", "nombre"]) || extractString(raw, ["metadata", "etapa_nombre"]) || "";
    const estado = extractString(raw, ["estado"]) || "";
    const asignadoId = extractString(raw, ["asignado", "id"]) || extractString(raw, ["asignado_a_usuario_id"]) || "";
    const cuentaId = extractString(raw, ["cuenta", "id"]) || extractString(raw, ["cuenta_id"]) || "";
    const contactoId = extractString(raw, ["contacto", "id"]) || extractString(raw, ["contacto_principal_id"]) || "";
    const canal = extractString(raw, ["metadata", "canal"]) || extractString(raw, ["metadata", "channel"]) || "";

    if (search) {
      const haystack = `${titulo} ${contacto} ${cuenta}`.toLowerCase();
      if (!haystack.includes(search)) return false;
    }

    if (filters.etapaId && filters.etapaId !== "all") {
      if (filters.etapaId !== etapaId && filters.etapaId !== etapaNombre) return false;
    }
    if (filters.estado && filters.estado !== "all" && estado !== filters.estado) return false;
    if (filters.asignadoId && filters.asignadoId !== "all" && asignadoId !== filters.asignadoId) return false;
    if (filters.cuentaId && filters.cuentaId !== "all" && cuentaId !== filters.cuentaId) return false;
    if (filters.contactoId && filters.contactoId !== "all" && contactoId !== filters.contactoId) return false;
    if (filters.canal && filters.canal !== "all" && canal !== filters.canal) return false;

    const monto = parseNumber(extractUnknown(raw, ["monto_estimado"]));
    if (minMonto !== null && (monto === null || monto < minMonto)) return false;
    if (maxMonto !== null && (monto === null || monto > maxMonto)) return false;

    const cierre = parseDate(extractUnknown(raw, ["fecha_cierre_probable"]));
    if (cierreDesde && (!cierre || cierre < cierreDesde)) return false;
    if (cierreHasta && (!cierre || cierre > cierreHasta)) return false;

    const creado = parseDate(extractUnknown(raw, ["creado_en"]));
    if (creadoDesde && (!creado || creado < creadoDesde)) return false;
    if (creadoHasta && (!creado || creado > creadoHasta)) return false;

    if (reinicioMin !== null) {
      const reinicio = parseNumber(extractUnknown(raw, ["metadata", "restart_sequence"])) ?? 1;
      if (reinicio < reinicioMin) return false;
    }

    return true;
  });
}

function extractUnknown(raw: Record<string, unknown> | undefined, path: string[]): unknown {
  if (!raw) return undefined;
  let current: unknown = raw;
  for (const key of path) {
    if (!current || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

function extractString(raw: Record<string, unknown> | undefined, path: string[]): string | null {
  const value = extractUnknown(raw, path);
  if (typeof value === "string" && value.trim().length) return value.trim();
  return null;
}

function parseNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  if (Number.isNaN(parsed)) return null;
  return parsed;
}

function parseDate(value: unknown): Date | null {
  if (!value || typeof value !== "string") return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}
