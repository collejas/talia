"use client";

import { ClientDataTable } from "@/components/client-data-table";
import type { DataTableColumnLabels, DataTableRow } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { useEffect, useMemo, useState } from "react";
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

  const [reassignOpen, setReassignOpen] = useState(false);
  const [activeRow, setActiveRow] = useState<DataTableRow | null>(null);
  const [selectedVendorId, setSelectedVendorId] = useState("");
  const [vendorOptions, setVendorOptions] = useState<SalesRepOption[]>([]);
  const [vendorLoading, setVendorLoading] = useState(false);
  const [vendorError, setVendorError] = useState<string | null>(null);
  const [reassignPending, setReassignPending] = useState(false);
  const [reassignError, setReassignError] = useState<string | null>(null);
  const [reassignSuccess, setReassignSuccess] = useState<string | null>(null);
  const [auditItems, setAuditItems] = useState<AuditAssignment[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState<string | null>(null);

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
    if (!reassignOpen || !canReassign) {
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
  }, [reassignOpen, canReassign, canReassignAny]);

  const extraColumns: ColumnDef<DataTableRow>[] = buildExtraColumns({
    canReassign,
    onReassignClick: (row) => openReassignDialog(row),
  });
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

  const activeRaw = (activeRow?.raw ?? {}) as Record<string, unknown>;
  const activeOportunidadId = extractString(activeRaw, ["id"]) ?? activeRow?.id?.toString() ?? null;
  const activePersonaId = extractString(activeRaw, ["persona_id"]) || extractString(activeRaw, ["contacto_principal_id"]);
  const activeAsignadoId = extractAsignadoId(activeRow);

  function openReassignDialog(row: DataTableRow) {
    setActiveRow(row);
    setSelectedVendorId(extractAsignadoId(row) ?? "");
    setReassignError(null);
    setReassignSuccess(null);
    setReassignOpen(true);
  }

  const handleReassign = async () => {
    if (!activeOportunidadId || !selectedVendorId) return;
    setReassignPending(true);
    setReassignError(null);
    setReassignSuccess(null);
    try {
      const response = await fetch(`/api/embudo/leads/${activeOportunidadId}/reassign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          asignado_usuario_id: selectedVendorId,
          persona_id: activePersonaId || null,
          conversacion_id: null,
          alinear_persona: true,
          alinear_conversacion: false,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setReassignError(body?.error || `Error ${response.status}`);
        return;
      }
      setReassignSuccess("Vendedor reasignado.");
      router.refresh();
    } catch {
      setReassignError("No se pudo reasignar el vendedor.");
    } finally {
      setReassignPending(false);
    }
  };

  const handleLoadAudit = async () => {
    if (!activeOportunidadId) return;
    setAuditLoading(true);
    setAuditError(null);
    try {
      const response = await fetch(
        `/api/embudo/asignaciones?oportunidad_id=${activeOportunidadId}&limit=50`,
        { cache: "no-store" },
      );
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setAuditError(body?.error || `Error ${response.status}`);
        setAuditItems([]);
        return;
      }
      const items = Array.isArray(body?.items) ? body.items : [];
      setAuditItems(items);
    } catch {
      setAuditError("No se pudo cargar la auditoría.");
      setAuditItems([]);
    } finally {
      setAuditLoading(false);
    }
  };

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
          <OpportunityRowDetails row={row} onReassign={() => openReassignDialog(row)} />
        )}
        detailDescription="Resumen de la oportunidad y accesos rapidos al embudo."
      />
      <Dialog
        open={reassignOpen}
        onOpenChange={(open) => {
          setReassignOpen(open);
          if (open) {
            setAuditItems([]);
            setAuditError(null);
            handleLoadAudit();
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cambiar vendedor</DialogTitle>
            <DialogDescription>
              Selecciona el vendedor destino para esta oportunidad.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="text-sm text-muted-foreground">
              {activeRow?.header ?? "Oportunidad"}
            </div>
            <Select
              value={selectedVendorId || undefined}
              onValueChange={setSelectedVendorId}
              disabled={vendorLoading || reassignPending}
            >
              <SelectTrigger>
                <SelectValue placeholder={vendorLoading ? "Cargando..." : "Selecciona vendedor"} />
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
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                onClick={handleReassign}
                disabled={
                  reassignPending ||
                  vendorLoading ||
                  !selectedVendorId ||
                  (Boolean(activeAsignadoId) && selectedVendorId === activeAsignadoId)
                }
              >
                {reassignPending ? "Reasignando..." : "Reasignar"}
              </Button>
              {reassignSuccess ? (
                <span className="text-xs text-emerald-600">{reassignSuccess}</span>
              ) : null}
              {reassignError ? (
                <span className="text-xs text-destructive">{reassignError}</span>
              ) : null}
            </div>
            <div className="border-t border-border pt-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-muted-foreground">Auditoría</p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleLoadAudit}
                  disabled={auditLoading}
                >
                  {auditLoading ? "Cargando..." : "Actualizar"}
                </Button>
              </div>
              {auditError ? (
                <p className="text-xs text-destructive">{auditError}</p>
              ) : null}
              {!auditLoading && !auditError && auditItems.length === 0 ? (
                <p className="text-xs text-muted-foreground">Sin movimientos registrados.</p>
              ) : null}
              <div className="mt-2 space-y-2">
                {auditItems.map((item) => (
                  <div key={item.id} className="rounded-md border border-border/60 bg-muted/40 p-2 text-xs">
                    <div className="font-medium">{item.vendedor_nombre || item.vendedor_correo || "Vendedor"}</div>
                    <div className="text-muted-foreground">
                      {item.trigger_event} · {formatDate(item.creado_en)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
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

type ExtraColumnOptions = {
  canReassign: boolean;
  onReassignClick: (row: DataTableRow) => void;
};

type SalesRepOption = {
  id: string;
  nombre_completo: string | null;
  correo: string | null;
  telefono_e164: string | null;
  label: string;
};

type AuditAssignment = {
  id: string;
  creado_en: string;
  trigger_event: string;
  vendedor_nombre?: string | null;
  vendedor_correo?: string | null;
};

function buildExtraColumns(options?: ExtraColumnOptions): ColumnDef<DataTableRow>[] {
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

  if (options?.canReassign) {
    extraColumns.push({
      id: "acciones",
      header: () => <div className="w-full text-right">Acciones</div>,
      cell: ({ row }) => (
        <div className="flex justify-end gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href={buildEmbudoHref(row.original)}>Embudo</Link>
          </Button>
          <Button variant="ghost" size="sm" onClick={() => options.onReassignClick(row.original)}>
            Reasignar
          </Button>
        </div>
      ),
      meta: { label: "Acciones", reorderable: false },
    });
  } else {
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
  }

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
  onReassign,
}: {
  row: DataTableRow;
  onReassign: () => void;
}) {
  const raw = row.raw as Record<string, unknown> | undefined;
  const title = extractString(raw, ["titulo"]) || row.header || "Oportunidad sin nombre";
  const contact =
    extractString(raw, ["contacto", "nombre_completo"]) ||
    extractString(raw, ["metadata", "contacto_nombre"]) ||
    "Sin contacto";
  const account = extractString(raw, ["cuenta", "nombre"]) || "Sin cuenta";
  const stage =
    extractString(raw, ["etapa", "nombre"]) ||
    extractString(raw, ["metadata", "etapa_nombre"]) ||
    "Sin etapa";
  const state = extractString(raw, ["estado"]) || "Sin estado";
  const assigned =
    extractString(raw, ["asignado", "nombre_completo"]) ||
    extractString(raw, ["asignado_a_usuario_id"]) ||
    "Sin asignar";
  const canal = extractString(raw, ["metadata", "canal"]) || extractString(raw, ["metadata", "channel"]) || "Sin canal";
  const opportunityId = extractString(raw, ["id"]) || String(row.id);
  const restartSequence = parseNumber(extractUnknown(raw, ["metadata", "restart_sequence"])) ?? 1;
  const monetaryValue = extractNumber(raw, ["monto_estimado"]);
  const currency = extractString(raw, ["moneda"]) || "MXN";

  return (
    <div className="space-y-4 py-2">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{stage}</Badge>
            <Badge variant="outline">Reinicio #{restartSequence}</Badge>
            <Badge variant="outline">{state}</Badge>
          </div>
          <div>
            <h3 className="text-base font-semibold text-foreground">{title}</h3>
            <p className="text-sm text-muted-foreground">
              {contact} · {account} · {canal}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href={buildEmbudoHref(row)}>Abrir en embudo</Link>
          </Button>
          <Button variant="ghost" size="sm" onClick={onReassign}>
            Reasignar vendedor
          </Button>
        </div>
      </div>

      <Separator />

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <DetailField label="Monto" value={formatCurrency(monetaryValue, currency)} />
        <DetailField label="Cierre probable" value={formatDate(extractString(raw, ["fecha_cierre_probable"]))} />
        <DetailField label="Creado" value={formatDate(extractString(raw, ["creado_en"]))} />
        <DetailField label="Actualizado" value={formatDate(extractString(raw, ["actualizado_en"]))} />
        <DetailField label="Asignado" value={assigned} />
        <DetailField label="Oportunidad" value={opportunityId} monospace />
        <DetailField label="Persona" value={extractString(raw, ["contacto_principal_id"]) || "—"} monospace />
        <DetailField label="Cuenta" value={extractString(raw, ["cuenta_id"]) || "—"} monospace />
      </div>
    </div>
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
    <div className="rounded-lg border bg-muted/20 p-3">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={["mt-1 text-sm", monospace ? "font-mono" : ""].join(" ")}>{value}</div>
    </div>
  );
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" });
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
