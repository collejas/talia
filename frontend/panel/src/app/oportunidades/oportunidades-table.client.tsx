"use client";

import { ClientDataTable } from "@/components/client-data-table";
import type { DataTableColumnLabels, DataTableRow } from "@/components/data-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  OportunidadesFiltersClient,
  type OportunidadesFilterOptions,
  type OportunidadesFiltersState,
} from "./oportunidades-filters.client";
import type { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

type Props = {
  rows: DataTableRow[];
  columnLabels?: DataTableColumnLabels;
  filters?: {
    q?: string;
    etapaId?: string;
    estado?: string;
    asignadoId?: string;
    cuentaId?: string;
    personaId?: string;
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
  permissionContext?: {
    permisos?: string[];
    es_admin?: boolean;
    es_owner?: boolean;
  };
};

export function OportunidadesTableClient({
  rows,
  columnLabels,
  filterOptions,
  filterInitial,
  permissionContext,
}: Props) {
  const router = useRouter();
  const [resolvedFilterOptions, setResolvedFilterOptions] = useState<OportunidadesFilterOptions | undefined>(
    filterOptions,
  );
  const normalizedPerms = useMemo(
    () => (permissionContext?.permisos ?? []).map((perm) => perm.toLowerCase()),
    [permissionContext?.permisos],
  );
  const canReassignAny =
    Boolean(permissionContext?.es_admin) ||
    Boolean(permissionContext?.es_owner) ||
    normalizedPerms.includes("pipeline.reassign.any");
  const canReassignTeam =
    Boolean(permissionContext?.es_admin) ||
    Boolean(permissionContext?.es_owner) ||
    normalizedPerms.includes("pipeline.reassign.team");
  const canReassign = canReassignAny || canReassignTeam;

  const [vendorOptions, setVendorOptions] = useState<SalesRepOption[]>([]);
  const [vendorLoading, setVendorLoading] = useState(false);
  const [vendorError, setVendorError] = useState<string | null>(null);

  useEffect(() => {
    setResolvedFilterOptions((current) => mergeFilterOptions(current ?? filterOptions, filterOptions));
  }, [filterOptions]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      fetch("/api/oportunidades/filter-options", {
        cache: "no-store",
        signal: controller.signal,
      })
        .then(async (response) => {
          if (!response.ok) {
            throw new Error(`filter_options_${response.status}`);
          }
          return response.json();
        })
        .then((json) => {
          setResolvedFilterOptions((current) => mergeFilterOptions(current, json as OportunidadesFilterOptions));
        })
        .catch((error) => {
          if ((error as Error).name === "AbortError") return;
        });
    }, 250);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, []);

  useEffect(() => {
    if (!canReassign) {
      return;
    }
    const controller = new AbortController();
    const fetchVendors = async () => {
      setVendorLoading(true);
      setVendorError(null);
      try {
        const scope = canReassignAny ? "all" : "team";
        const response = await fetch(`/api/embudo/vendedores?limit=200&scope=${scope}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          setVendorError(body.error || `Error ${response.status}`);
          setVendorOptions([]);
          return;
        }
        const body = (await response.json()) as { vendedores?: Array<Record<string, unknown>> };
        const vendors = Array.isArray(body?.vendedores) ? body.vendedores : [];
        const options: SalesRepOption[] = vendors
          .map((vendor) => {
            if (!vendor || typeof vendor !== "object") return null;
            const id = String((vendor as Record<string, unknown>).id || "").trim();
            if (!id) return null;
            const nombre = (vendor as Record<string, unknown>).nombre_completo as string | null;
            const correo = (vendor as Record<string, unknown>).correo as string | null;
            const telefono = (vendor as Record<string, unknown>).telefono_e164 as string | null;
            const label = nombre?.trim() || correo?.trim() || telefono?.trim() || "Sin nombre";
            return { id, nombre_completo: nombre ?? null, correo: correo ?? null, telefono_e164: telefono ?? null, label };
          })
          .filter((entry): entry is SalesRepOption => entry !== null);
        setVendorOptions(options);
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setVendorError("No se pudo cargar la lista de vendedores.");
        setVendorOptions([]);
      } finally {
        setVendorLoading(false);
      }
    };
    fetchVendors();
    return () => controller.abort();
  }, [canReassign, canReassignAny]);

  const handleReassign = async (row: DataTableRow, vendorId: string) => {
    const raw = row.raw as Record<string, unknown> | undefined;
    const opportunityId = extractString(raw, ["id"]) ?? String(row.id);
    const currentVendorId = extractAsignadoId(row);
    const personaId = extractString(raw, ["persona_id"]) || extractString(raw, ["contacto_principal_id"]);
    if (!opportunityId || !vendorId || vendorId === currentVendorId) return;

    const response = await fetch(`/api/embudo/leads/${opportunityId}/reassign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        asignado_usuario_id: vendorId,
        persona_id: personaId || null,
        conversacion_id: null,
        alinear_persona: true,
        alinear_conversacion: false,
      }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(body?.error || `Error ${response.status}`);
    }
    router.refresh();
  };

  const extraColumns: ColumnDef<DataTableRow>[] = buildExtraColumns();
  const initialVisibility = buildInitialVisibility();
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
          options={resolvedFilterOptions ?? filterOptions}
          initial={filterInitial}
          variant="modal"
          onApplied={() => setFiltersOpen(false)}
        />
      </DialogContent>
    </Dialog>
  ) : null;

  return (
    <>
      <ClientDataTable
        rows={rows}
        columnLabels={columnLabels}
        extraColumns={extraColumns}
        initialVisibility={initialVisibility}
        storageKey="oportunidades-table-columns"
        toolbarActions={toolbarActions}
        renderRowDetails={(row) => (
          <OpportunityRowDetails
            row={row}
            vendorOptions={vendorOptions}
            vendorLoading={vendorLoading}
            vendorError={vendorError}
            canReassign={canReassign}
            onReassign={async (vendorId) => {
              await handleReassign(row, vendorId);
            }}
          />
        )}
        detailDescription="Consulta y acceso rápido al embudo. La reasignación y los movimientos operativos quedan en el detalle."
      />
    </>
  );
}

function mergeFilterOptions(
  base: OportunidadesFilterOptions | undefined,
  incoming: OportunidadesFilterOptions | undefined,
): OportunidadesFilterOptions | undefined {
  if (!base && !incoming) return undefined;
  if (!base) return incoming;
  if (!incoming) return base;
  return {
    etapas: mergeUniqueOptions(base.etapas, incoming.etapas),
    estados: incoming.estados.length ? incoming.estados : base.estados,
    asignados: mergeUniqueOptions(base.asignados, incoming.asignados),
    cuentas: mergeUniqueOptions(base.cuentas, incoming.cuentas),
    personas: mergeUniqueOptions(base.personas, incoming.personas),
    canales: mergeUniqueOptions(base.canales, incoming.canales),
  };
}

function mergeUniqueOptions(
  base: { id: string; label: string }[],
  incoming: { id: string; label: string }[],
) {
  const seen = new Set<string>();
  const merged: { id: string; label: string }[] = [];
  for (const option of [...base, ...incoming]) {
    if (!option.id || seen.has(option.id)) continue;
    seen.add(option.id);
    merged.push(option);
  }
  return merged;
}

type SalesRepOption = {
  id: string;
  nombre_completo: string | null;
  correo: string | null;
  telefono_e164: string | null;
  label: string;
};

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
      header: () => <div className="w-full">Cita programada</div>,
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
      meta: { label: "Cita programada" },
    },
  ];

  extraColumns.push({
    id: "acciones",
    header: () => <div className="w-full text-right">Acciones</div>,
    cell: ({ row }) => (
      <div className="flex justify-end">
        <Button asChild variant="outline" size="sm">
          <Link href={buildEmbudoHref(row.original)}>Embudo</Link>
        </Button>
      </div>
    ),
    meta: { label: "Acciones", reorderable: false },
  });

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

function OpportunityRowDetails({
  row,
  vendorOptions,
  vendorLoading,
  vendorError,
  onReassign,
  canReassign,
}: {
  row: DataTableRow;
  vendorOptions: SalesRepOption[];
  vendorLoading: boolean;
  vendorError: string | null;
  onReassign: (vendorId: string) => Promise<void>;
  canReassign: boolean;
}) {
  const raw = row.raw as Record<string, unknown> | undefined;
  const opportunityCode =
    formatOpportunityCode(extractString(raw, ["codigo_oportunidad"])) || "Sin código";
  const stage =
    extractString(raw, ["etapa", "nombre"]) ||
    extractString(raw, ["metadata", "etapa_nombre"]) ||
    "Sin etapa";
  const state = extractString(raw, ["estado"]) || "Sin estado";
  const assigned =
    extractString(raw, ["asignado", "nombre_completo"]) ||
    extractString(raw, ["asignado", "correo"]) ||
    extractString(raw, ["asignado_a_usuario_id"]) ||
    "Sin asignar";
  const canal = extractString(raw, ["metadata", "canal"]) || extractString(raw, ["metadata", "channel"]) || "Sin canal";
  const restartSequence = parseNumber(extractUnknown(raw, ["metadata", "restart_sequence"])) ?? 1;
  const monetaryValue = extractNumber(raw, ["monto_estimado"]);
  const probability = extractNumber(raw, ["probabilidad"]);
  const currency = extractString(raw, ["moneda"]) || "MXN";
  const createdAt = extractString(raw, ["creado_en"]);
  const updatedAt = extractString(raw, ["actualizado_en"]);
  const closeAt = extractString(raw, ["fecha_cierre_probable"]);
  const ageDays = diffDays(createdAt);
  const staleDays = diffDays(updatedAt);
  const weightedValue =
    monetaryValue != null && probability != null ? (monetaryValue * probability) / 100 : null;
  const description = extractString(raw, ["descripcion"]);
  const source =
    extractString(raw, ["created_via"]) ||
    extractString(raw, ["metadata", "created_via"]) ||
    extractString(raw, ["metadata", "origen"]) ||
    extractString(raw, ["metadata", "source"]) ||
    "Sin origen";
  const lostReason = extractString(raw, ["motivo_perdida"]);
  const currentVendorId = extractAsignadoId(row) ?? "";
  const [selectedVendorId, setSelectedVendorId] = useState(currentVendorId);
  const [reassignPending, setReassignPending] = useState(false);
  const [reassignFeedback, setReassignFeedback] = useState<{ type: "error" | "success"; message: string } | null>(
    null,
  );

  useEffect(() => {
    setSelectedVendorId(currentVendorId);
  }, [currentVendorId]);

  const handleVendorChange = async (vendorId: string) => {
    setSelectedVendorId(vendorId);
    setReassignFeedback(null);
    if (!vendorId || vendorId === currentVendorId) return;
    setReassignPending(true);
    try {
      await onReassign(vendorId);
      setReassignFeedback({ type: "success", message: "Vendedor reasignado." });
    } catch (error) {
      setSelectedVendorId(currentVendorId);
      setReassignFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "No se pudo reasignar el vendedor.",
      });
    } finally {
      setReassignPending(false);
    }
  };

  return (
    <div className="space-y-4 py-2">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <Select
            value={selectedVendorId || undefined}
            onValueChange={handleVendorChange}
            disabled={!canReassign || vendorLoading || reassignPending}
          >
            <SelectTrigger className="w-full min-w-0 max-w-[260px]">
              <SelectValue
                placeholder={
                  vendorLoading ? "Cargando vendedores..." : "Reasignar vendedor"
                }
              />
            </SelectTrigger>
            <SelectContent>
              {vendorOptions.map((option) => (
                <SelectItem key={option.id} value={option.id}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {vendorError ? <p className="text-xs text-destructive">{vendorError}</p> : null}
          {reassignFeedback ? (
            <p
              className={reassignFeedback.type === "error" ? "text-xs text-destructive" : "text-xs text-emerald-600"}
            >
              {reassignFeedback.message}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2 lg:justify-end">
          <Button asChild variant="outline" size="sm">
            <Link href={buildEmbudoHref(row)}>Abrir en embudo</Link>
          </Button>
        </div>
      </div>

      <Separator />

      <div className="space-y-4">
        <SectionCard
          title="Resumen comercial"
          description="Lectura rápida del valor y del estado comercial de la oportunidad."
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <DetailField label="Monto" value={formatCurrency(monetaryValue, currency)} />
            <DetailField label="Probabilidad" value={formatProbability(probability)} />
            <DetailField label="Valor ponderado" value={formatCurrency(weightedValue, currency)} />
            <DetailField label="Cierre probable" value={formatDate(closeAt)} />
            <DetailField label="Antigüedad" value={formatDays(ageDays)} />
            <DetailField label="Sin cambios" value={formatDays(staleDays)} />
          </div>
          {lostReason ? (
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              <p className="text-xs font-semibold uppercase tracking-wide">Motivo pérdida</p>
              <p className="mt-1">{lostReason}</p>
            </div>
          ) : null}
        </SectionCard>

        <SectionCard
          title="Seguimiento"
          description="Tiempos de vida, actualización y responsable actual."
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <DetailField label="Creado" value={formatDate(createdAt)} />
            <DetailField label="Actualizado" value={formatDate(updatedAt)} />
            <DetailField label="Asignado" value={assigned} />
            <DetailField label="Reinicio" value={`#${restartSequence}`} />
          </div>
        </SectionCard>

        <SectionCard
          title="Relación y contexto"
          description="Canal, trazabilidad y señales operativas sin repetir identidad."
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <DetailField label="Canal" value={canal} />
            <DetailField label="Código" value={opportunityCode} />
            <DetailField label="Etapa" value={stage} />
            <DetailField label="Estado" value={state} />
            <DetailField label="Origen" value={source} />
            {description ? <DetailField label="Descripción" value={description} /> : null}
            {lostReason ? <DetailField label="Motivo pérdida" value={lostReason} /> : null}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}

function SectionCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <Card className="gap-0 min-w-0 overflow-hidden">
      <CardHeader className="pb-3 pt-4">
        <CardTitle className="text-sm font-semibold">{title}</CardTitle>
        <p className="break-words text-xs text-muted-foreground">{description}</p>
      </CardHeader>
      <CardContent className="space-y-0 pb-4">
        {children}
      </CardContent>
    </Card>
  );
}

function DetailField({
  label,
  value,
  monospace = false,
}: {
  label: string;
  value: string;
  monospace?: boolean;
}) {
  return (
    <div className="min-w-0 rounded-lg border bg-muted/20 p-3">
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={["mt-1 break-words text-sm leading-snug", monospace ? "font-mono" : ""].join(" ")}>
        {value}
      </div>
    </div>
  );
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" });
}

function formatProbability(value: number | null | undefined): string {
  if (value == null || Number.isNaN(Number(value))) return "—";
  return `${Math.round(Number(value))}%`;
}

function formatDays(value: number | null): string {
  if (value == null || Number.isNaN(value)) return "—";
  if (value <= 0) return "Hoy";
  if (value === 1) return "1 día";
  return `${value} días`;
}

function diffDays(value?: string | null): number | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const diff = Date.now() - date.getTime();
  return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
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

function formatOpportunityCode(code: string | null | undefined): string {
  const raw = typeof code === "string" ? code.trim() : "";
  if (!raw) return "";
  return raw.replace(/\s*-\s*/g, " - ");
}

function extractAsignadoId(row: DataTableRow | null): string | null {
  if (!row) return null;
  const raw = row.raw as Record<string, unknown> | undefined;
  return (
    extractString(raw, ["asignado", "id"]) ||
    extractString(raw, ["asignado_a_usuario_id"]) ||
    null
  );
}

function parseNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  if (Number.isNaN(parsed)) return null;
  return parsed;
}

function extractNumber(raw: Record<string, unknown> | undefined, path: string[]): number | null {
  const value = extractUnknown(raw, path);
  return parseNumber(value);
}

function buildEmbudoHref(row: DataTableRow): string {
  const raw = row.raw as Record<string, unknown> | undefined;
  const oportunidadId = extractString(raw, ["id"]) || String(row.id);
  return `/embudo?oportunidadId=${encodeURIComponent(oportunidadId)}`;
}

function formatCurrency(value: number | null, currency: string): string {
  if (value == null || Number.isNaN(value)) return "—";
  try {
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return value.toLocaleString("es-MX");
  }
}
