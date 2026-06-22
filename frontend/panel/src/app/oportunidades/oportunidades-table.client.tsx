"use client";

import { ClientDataTable } from "@/components/client-data-table";
import type { DataTableColumnLabels, DataTableRow } from "@/components/data-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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

type OpportunityDetailResponse = {
  ok: true;
  opportunity: Record<string, unknown> | null;
  notes: OpportunityNote[];
  activities: OpportunityActivity[];
  quotes: OpportunityQuote[];
  history: OpportunityHistory[];
  errors: Partial<Record<"notes" | "activities" | "quotes" | "history", string>>;
};

type OpportunityNote = {
  id: string;
  texto: string;
  tipo: string;
  actividad_id: string | null;
  creado_por_usuario_id: string | null;
  creado_por_usuario?: OpportunityUserSummary | null;
  creado_en: string;
  actualizado_en: string;
};

type OpportunityActivity = {
  id: string;
  tipo: string;
  asunto: string | null;
  descripcion: string | null;
  estado: string;
  prioridad: string;
  recordatorio_en: string | null;
  fecha_vencimiento: string | null;
  asignado_a_usuario_id: string | null;
  creado_por_usuario_id: string | null;
  creado_por_usuario?: OpportunityUserSummary | null;
  asignado_a_usuario?: OpportunityUserSummary | null;
  completado_en: string | null;
  cancelado_en: string | null;
  cerrado_por_usuario_id: string | null;
  creado_en: string;
};

type OpportunityUserSummary = {
  id: string;
  nombre_completo: string | null;
  correo: string | null;
  telefono_e164: string | null;
  rol_principal?: string | null;
  roles?: string[];
};

type OpportunityQuote = {
  id: string;
  estatus: string;
  total: number | null;
  moneda: string;
  valida_hasta: string | null;
  creado_en: string;
};

type OpportunityHistory = {
  movimiento_id?: string;
  id?: string;
  tipo: string;
  cambiado_en: string;
  cambiado_por_nombre?: string | null;
  fuente?: string | null;
  etapa_origen_nombre?: string | null;
  etapa_destino_nombre?: string | null;
  motivo?: string | null;
  nota?: string | null;
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
  const opportunityId = extractString(raw, ["id"]) || String(row.id);
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
  const [detailState, setDetailState] = useState<{
    status: "idle" | "loading" | "loaded" | "error";
    data: OpportunityDetailResponse | null;
    error: string | null;
  }>({
    status: "idle",
    data: null,
    error: null,
  });
  const [activityType, setActivityType] = useState("seguimiento");
  const [activitySubject, setActivitySubject] = useState("Seguimiento de oportunidad");
  const [activityDescription, setActivityDescription] = useState("");
  const [activityDueAt, setActivityDueAt] = useState("");
  const [activityAssigneeId, setActivityAssigneeId] = useState(currentVendorId);
  const [activityPending, setActivityPending] = useState(false);
  const [activityFeedback, setActivityFeedback] = useState<{ type: "error" | "success"; message: string } | null>(
    null,
  );
  const selectedVendorLabel =
    vendorOptions.find((option) => option.id === selectedVendorId)?.label?.trim() || "";
  const opportunityAssigneeId = extractAsignadoId(row) ?? "";

  const detailOpportunity = detailState.data?.opportunity ?? raw;
  const opportunityDetail = (detailOpportunity ?? {}) as Record<string, unknown>;
  const opportunityAssigneeLabel = selectedVendorLabel || opportunityAssigneeId || "Sin asignar";
  const contactName =
    extractString(opportunityDetail, ["contacto", "nombre_completo"]) ||
    extractString(opportunityDetail, ["contacto", "nombres"]) ||
    "Sin contacto";
  const companyName = extractString(opportunityDetail, ["cuenta", "nombre"]) || "Sin cuenta";
  const projectName =
    extractString(opportunityDetail, ["metadata", "project_name"]) ||
    extractString(opportunityDetail, ["titulo"]) ||
    "Sin proyecto";
  const projectNeeds =
    extractString(opportunityDetail, ["metadata", "proyecto_necesidades"]) ||
    extractString(opportunityDetail, ["descripcion"]) ||
    "Sin necesidades";
  const talIaSummary =
    extractString(opportunityDetail, ["metadata", "tal_ia", "resumen"]) ||
    extractString(opportunityDetail, ["contacto", "notes"]) ||
    extractString(opportunityDetail, ["contacto", "notas"]) ||
    "Sin resumen generado";
  const talIaNeed =
    extractString(opportunityDetail, ["contacto", "necesidad_proposito"]) ||
    extractString(opportunityDetail, ["metadata", "tal_ia", "necesidad"]) ||
    extractString(opportunityDetail, ["metadata", "proyecto_necesidades"]) ||
    "Sin necesidad detectada";
  const quoteItems = detailState.data?.quotes ?? [];
  const noteItems = detailState.data?.notes ?? [];
  const activityItems = detailState.data?.activities ?? [];
  const historyItems = detailState.data?.history ?? [];

  useEffect(() => {
    setSelectedVendorId(currentVendorId);
    setActivityAssigneeId(currentVendorId);
  }, [currentVendorId]);

  useEffect(() => {
    if (!opportunityId) {
      setDetailState({ status: "error", data: null, error: "No se encontró la oportunidad." });
      return;
    }
    const controller = new AbortController();
    let cancelled = false;
    const loadDetail = async () => {
      setDetailState((current) => ({ ...current, status: "loading", error: null }));
      try {
        const response = await fetch(`/api/oportunidades/${opportunityId}/detail`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const body = await response.json().catch(() => ({}));
        if (cancelled) return;
        if (!response.ok) {
          setDetailState({
            status: "error",
            data: null,
            error: typeof body.error === "string" && body.error ? body.error : `Error ${response.status}`,
          });
          return;
        }
        setDetailState({
          status: "loaded",
          data: body as OpportunityDetailResponse,
          error: null,
        });
      } catch (error) {
        if (cancelled || (error as Error).name === "AbortError") return;
        setDetailState({
          status: "error",
          data: null,
          error: error instanceof Error ? error.message : "No se pudo cargar el detalle.",
        });
      }
    };
    void loadDetail();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [opportunityId]);

  const handleVendorChange = async (vendorId: string) => {
    setSelectedVendorId(vendorId);
    setActivityAssigneeId(vendorId);
    setReassignFeedback(null);
    if (!vendorId || vendorId === currentVendorId) return;
    setReassignPending(true);
    try {
      await onReassign(vendorId);
      setReassignFeedback({ type: "success", message: "Vendedor reasignado." });
    } catch (error) {
      setSelectedVendorId(currentVendorId);
      setActivityAssigneeId(currentVendorId);
      setReassignFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "No se pudo reasignar el vendedor.",
      });
    } finally {
      setReassignPending(false);
    }
  };

  const handleCreateActivity = async () => {
    const subject = activitySubject.trim();
    if (!subject) {
      setActivityFeedback({ type: "error", message: "Escribe un asunto para la actividad." });
      return;
    }

    setActivityPending(true);
    setActivityFeedback(null);
    try {
      const response = await fetch(`/api/oportunidades/${opportunityId}/activities`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo: activityType,
          asunto: subject,
          descripcion: activityDescription.trim() || undefined,
          estado: "pendiente",
          prioridad: "media",
          fecha_vencimiento: activityDueAt || undefined,
          asignado_a_usuario_id: activityAssigneeId || undefined,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message = typeof body.error === "string" && body.error ? body.error : `Error ${response.status}`;
        throw new Error(message);
      }
      const created = body?.data as OpportunityActivity | undefined;
      if (created) {
        setDetailState((current) => {
          if (!current.data) return current;
          const nextActivities = [created, ...current.data.activities].filter(
            (candidate, index, array) => array.findIndex((item) => item.id === candidate.id) === index,
          );
          return {
            ...current,
            status: "loaded",
            data: {
              ...current.data,
              activities: nextActivities,
            },
          };
        });
      }
      setActivityType("seguimiento");
      setActivitySubject("Seguimiento de oportunidad");
      setActivityDescription("");
      setActivityDueAt("");
      setActivityAssigneeId(selectedVendorId || currentVendorId);
      setActivityFeedback({ type: "success", message: "Actividad creada." });
    } catch (error) {
      setActivityFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "No se pudo crear la actividad.",
      });
    } finally {
      setActivityPending(false);
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
            <SelectTrigger
              className={[
                "w-full min-w-0 max-w-[260px]",
                selectedVendorId ? "border-emerald-300 bg-emerald-50 text-emerald-900" : "",
              ].join(" ")}
            >
              {selectedVendorId ? (
                <span className="min-w-0 flex-1 truncate text-left">
                  {`Asignado: ${selectedVendorLabel || "Sin nombre"}`}
                </span>
              ) : (
                <SelectValue placeholder={vendorLoading ? "Cargando..." : "Reasignar vendedor"} />
              )}
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
      {detailState.status === "error" && detailState.error ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          No se pudo cargar el detalle ampliado: {detailState.error}
        </div>
      ) : null}

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

        <SectionCard title="Seguimiento" description="Tiempos de vida, actualización y responsable actual.">
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
            <DetailField label="Contacto" value={contactName} />
            <DetailField label="Cuenta" value={companyName} />
            <DetailField label="Canal" value={canal} />
            <DetailField label="Código" value={opportunityCode} />
            <DetailField label="Etapa" value={stage} />
            <DetailField label="Estado" value={state} />
            <DetailField label="Origen" value={source} />
            {lostReason ? <DetailField label="Motivo pérdida" value={lostReason} /> : null}
          </div>
        </SectionCard>

        <SectionCard
          title="Insights generados por Tal-IA"
          description="Lectura rápida de los campos que hoy se capturan en el embudo."
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <DetailField label="Resumen" value={talIaSummary} />
            <DetailField label="Necesidad / propósito" value={talIaNeed} />
          </div>
        </SectionCard>

        <SectionCard
          title="Proyecto"
          description="Nombre y alcance comercial del proyecto asociado a la oportunidad."
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <DetailField label="Nombre del proyecto" value={projectName} />
            <DetailField label="Necesidades / objetivos" value={projectNeeds} />
          </div>
        </SectionCard>

        <SectionCard title="Estimación" description="Valor económico y probabilidad de conversión.">
          <div className="grid gap-3 sm:grid-cols-2">
            <DetailField label="Monto" value={formatCurrency(monetaryValue, currency)} />
            <DetailField label="Probabilidad" value={formatProbability(probability)} />
            <DetailField label="Valor ponderado" value={formatCurrency(weightedValue, currency)} />
            <DetailField label="Cierre probable" value={formatDate(closeAt)} />
          </div>
        </SectionCard>

        <SectionCard title="Cotizaciones" description="Cotizaciones vinculadas a la oportunidad.">
          {detailState.status === "loading" && quoteItems.length === 0 ? (
            <p className="rounded-lg border border-dashed border-muted-foreground/40 p-4 text-xs text-muted-foreground">
              Cargando cotizaciones...
            </p>
          ) : null}
          {detailState.data?.errors?.quotes ? (
            <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
              {detailState.data.errors.quotes}
            </p>
          ) : null}
          {quoteItems.length ? (
            <div className="space-y-2">
              {quoteItems.map((quote) => (
                <div key={quote.id} className="rounded-lg border border-border/60 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium text-foreground">
                      {quote.moneda} {formatCurrency(quote.total, quote.moneda)}
                    </p>
                    <Badge
                      variant={quote.estatus === "aceptada" ? "default" : quote.estatus === "borrador" ? "outline" : "secondary"}
                    >
                      {quote.estatus}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Vence: {formatDate(quote.valida_hasta)} · Creada: {formatDate(quote.creado_en)}
                  </p>
                </div>
              ))}
            </div>
          ) : detailState.status === "loaded" ? (
            <p className="rounded-lg border border-dashed border-muted-foreground/40 p-4 text-xs text-muted-foreground">
              No hay cotizaciones registradas para esta oportunidad.
            </p>
          ) : null}
        </SectionCard>

        <SectionCard title="Notas" description="Registro rápido de observaciones y seguimiento comercial.">
          {detailState.status === "loading" && noteItems.length === 0 ? (
            <p className="rounded-lg border border-dashed border-muted-foreground/40 p-4 text-xs text-muted-foreground">
              Cargando notas...
            </p>
          ) : null}
          {detailState.data?.errors?.notes ? (
            <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
              {detailState.data.errors.notes}
            </p>
          ) : null}
          {noteItems.length ? (
            <div className="space-y-2">
              {noteItems.map((note) => (
                <div key={note.id} className="rounded-lg border border-border/60 p-3">
                  <p className="whitespace-pre-wrap text-sm text-foreground">{note.texto}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
                      {note.tipo}
                    </Badge>
                    {note.actividad_id ? (
                      <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">
                        Vinculada a actividad
                      </Badge>
                    ) : null}
                    {renderUserAuthorBadge(note.creado_por_usuario, opportunityAssigneeId)}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {renderUserLine(note.creado_por_usuario, "Nota", note.creado_en)}
                  </p>
                </div>
              ))}
            </div>
          ) : detailState.status === "loaded" ? (
            <p className="rounded-lg border border-dashed border-muted-foreground/40 p-4 text-xs text-muted-foreground">
              No hay notas registradas para esta oportunidad.
            </p>
          ) : null}
        </SectionCard>

        <SectionCard title="Actividades" description="Alta rápida de tareas y seguimiento asociado a la oportunidad.">
          <div className="space-y-3 rounded-lg border border-border/60 bg-muted/10 p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground" htmlFor={`activity-type-${opportunityId}`}>
                  Tipo
                </label>
                <Select value={activityType} onValueChange={setActivityType}>
                  <SelectTrigger id={`activity-type-${opportunityId}`}>
                    <SelectValue placeholder="Selecciona tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="seguimiento">Seguimiento</SelectItem>
                    <SelectItem value="llamada">Llamada</SelectItem>
                    <SelectItem value="correo">Correo</SelectItem>
                    <SelectItem value="reunion">Reunión</SelectItem>
                    <SelectItem value="interno">Interno</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground" htmlFor={`activity-due-${opportunityId}`}>
                  Vencimiento
                </label>
                <Input
                  id={`activity-due-${opportunityId}`}
                  type="datetime-local"
                  value={activityDueAt}
                  onChange={(event) => setActivityDueAt(event.target.value)}
                  placeholder="Opcional"
                />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <label className="text-xs font-medium text-muted-foreground" htmlFor={`activity-subject-${opportunityId}`}>
                  Asunto
                </label>
                <Input
                  id={`activity-subject-${opportunityId}`}
                  value={activitySubject}
                  onChange={(event) => setActivitySubject(event.target.value)}
                  placeholder="Seguimiento de oportunidad"
                />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <label className="text-xs font-medium text-muted-foreground" htmlFor={`activity-description-${opportunityId}`}>
                  Descripción
                </label>
                <Textarea
                  id={`activity-description-${opportunityId}`}
                  value={activityDescription}
                  onChange={(event) => setActivityDescription(event.target.value)}
                  placeholder="Describe la tarea o el siguiente paso."
                  rows={3}
                />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <label className="text-xs font-medium text-muted-foreground" htmlFor={`activity-assignee-${opportunityId}`}>
                  Asignar a
                </label>
                {canReassign ? (
                  <Select value={activityAssigneeId || "default"} onValueChange={(value) => setActivityAssigneeId(value === "default" ? "" : value)}>
                    <SelectTrigger id={`activity-assignee-${opportunityId}`}>
                      <SelectValue placeholder="Asignado por defecto" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="default">Asignado por defecto</SelectItem>
                      {vendorOptions.map((vendor) => (
                        <SelectItem key={vendor.id} value={vendor.id}>
                          {vendor.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="rounded-md border bg-background px-3 py-2 text-sm text-muted-foreground">
                    Se usará el vendedor asignado actual.
                  </div>
                )}
              </div>
            </div>
            {activityFeedback ? (
              <p className={activityFeedback.type === "error" ? "text-xs text-destructive" : "text-xs text-emerald-600"}>
                {activityFeedback.message}
              </p>
            ) : null}
            <div className="flex justify-end">
              <Button type="button" onClick={handleCreateActivity} disabled={activityPending}>
                {activityPending ? "Creando..." : "Crear actividad"}
              </Button>
            </div>
          </div>
          {detailState.data?.errors?.activities ? (
            <p className="mt-3 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
              {detailState.data.errors.activities}
            </p>
          ) : null}
          {activityItems.length ? (
            <div className="mt-3 space-y-2">
              {activityItems.map((activity) => (
                <div key={activity.id} className="rounded-lg border border-border/60 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium text-foreground">
                      {activity.asunto ?? activity.tipo}
                    </p>
                    <Badge
                      variant={
                        activity.estado === "completada"
                          ? "default"
                          : activity.estado === "cancelada"
                            ? "outline"
                            : "secondary"
                      }
                    >
                      {activity.estado}
                    </Badge>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">
                    {activity.descripcion ?? "Sin descripción."}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
                      {activity.tipo}
                    </Badge>
                    {activity.asignado_a_usuario_id ? (
                      <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">
                        {activity.asignado_a_usuario_id === opportunityAssigneeId
                          ? `Asignada a ${opportunityAssigneeLabel}`
                          : "Asignada a otro usuario"}
                      </Badge>
                    ) : null}
                    {renderUserAuthorBadge(activity.creado_por_usuario, opportunityAssigneeId)}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {renderUserLine(activity.creado_por_usuario, "Actividad", activity.creado_en)}
                    {activity.fecha_vencimiento ? ` · Vence ${formatDate(activity.fecha_vencimiento)}` : " · Sin vencimiento"}
                  </p>
                </div>
              ))}
            </div>
          ) : detailState.status === "loaded" ? (
            <p className="mt-3 rounded-lg border border-dashed border-muted-foreground/40 p-4 text-xs text-muted-foreground">
              No hay actividades registradas para esta oportunidad.
            </p>
          ) : null}
        </SectionCard>

        <SectionCard title="Historial" description="Trazabilidad de cambios, notas y movimientos del pipeline.">
          {detailState.status === "loading" && historyItems.length === 0 ? (
            <p className="rounded-lg border border-dashed border-muted-foreground/40 p-4 text-xs text-muted-foreground">
              Cargando historial...
            </p>
          ) : null}
          {detailState.data?.errors?.history ? (
            <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
              {detailState.data.errors.history}
            </p>
          ) : null}
          {historyItems.length ? (
            <div className="space-y-2">
              {historyItems.map((entry) => (
                <div key={entry.movimiento_id || entry.id || entry.cambiado_en} className="rounded-lg border border-border/60 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-foreground">
                        {describeOpportunityHistory(entry)}
                      </p>
                      {entry.motivo ? (
                        <p className="text-xs text-muted-foreground">Motivo: {entry.motivo}</p>
                      ) : null}
                      {entry.nota ? (
                        <p className="whitespace-pre-wrap text-xs text-muted-foreground">{entry.nota}</p>
                      ) : null}
                    </div>
                    <span className="text-xs text-muted-foreground">{formatDate(entry.cambiado_en)}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>{entry.cambiado_por_nombre || "Usuario desconocido"}</span>
                    {entry.fuente ? <span>Fuente: {entry.fuente}</span> : null}
                  </div>
                </div>
              ))}
            </div>
          ) : detailState.status === "loaded" ? (
            <p className="rounded-lg border border-dashed border-muted-foreground/40 p-4 text-xs text-muted-foreground">
              No hay movimientos registrados todavía.
            </p>
          ) : null}
        </SectionCard>
      </div>
    </div>
  );
}

function describeOpportunityHistory(entry: OpportunityHistory): string {
  if (entry.tipo === "nota") {
    return entry.nota?.trim() || "Nota registrada";
  }
  if (entry.etapa_destino_nombre) {
    return `Movido a ${entry.etapa_destino_nombre}`;
  }
  if (entry.etapa_origen_nombre) {
    return `Cambio de etapa desde ${entry.etapa_origen_nombre}`;
  }
  return entry.tipo || "Movimiento";
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

function formatUserDisplay(user: OpportunityUserSummary | null | undefined): string {
  if (!user) return "Usuario no identificado";
  const name = user.nombre_completo?.trim();
  const role = user.rol_principal?.trim();
  if (name && role) return `${role} ${name}`;
  if (name) return name;
  if (role) return role;
  return user.correo?.trim() || "Usuario no identificado";
}

function renderUserAuthorBadge(
  user: OpportunityUserSummary | null | undefined,
  assigneeId: string,
) {
  if (!user) return null;
  const isAssignee = user.id === assigneeId;
  return (
    <Badge
      variant={isAssignee ? "default" : "secondary"}
      className="text-[10px] uppercase tracking-wide"
    >
      {isAssignee ? `Creada por ${formatUserDisplay(user)}` : `Enviada por ${formatUserDisplay(user)}`}
    </Badge>
  );
}

function renderUserLine(
  user: OpportunityUserSummary | null | undefined,
  entityLabel: string,
  createdAt: string,
) {
  const author = formatUserDisplay(user);
  return `${entityLabel} · ${author} · ${formatDate(createdAt)}`;
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
