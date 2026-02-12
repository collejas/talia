import { AppViewLayout } from "@/components/layouts/app-view-layout";
import { ChartAreaInteractive } from "@/components/chart-area-interactive";
import { SectionCards } from "@/components/section-cards";
import { RestartKpiCards } from "@/components/leads/restart-kpi-cards";
import { IconChevronDown } from "@tabler/icons-react";
import { callCrmApi } from "@/lib/api/crm";
import { loadCrmOpportunities } from "@/lib/crm/opportunities";
import { loadLeadsData } from "@/lib/leads/data";
import {
  type OportunidadesFilterOptions,
  type OportunidadesFiltersState,
} from "./oportunidades-filters.client";
import { OportunidadesTableClient } from "./oportunidades-table.client";

export const dynamic = "force-dynamic";

type PageSearchParams = Record<string, string | string[] | undefined>;

export default async function OportunidadesPage({
  searchParams,
}: {
  searchParams?: Promise<PageSearchParams>;
}) {
  const resolvedParams = searchParams ? await searchParams : {};
  const filters = resolveFilters(resolvedParams);

  const [payload, leadsOverview, filterOptions] = await Promise.all([
    loadCrmOpportunities(filters),
    loadLeadsData(),
    loadFilterOptions(),
  ]);

  const filteredRows = payload.errors.length
    ? payload.rows
    : applyServerFilters(payload.rows, filters);
  const channelOptions = buildChannelOptions(payload.rows);
  const mergedOptions: OportunidadesFilterOptions = {
    ...filterOptions,
    canales: channelOptions,
  };

  return (
    <AppViewLayout title="Oportunidades">
      <div className="flex flex-col gap-4">
        <details open className="group px-4 lg:px-6">
          <summary className="list-none">
            <div className="flex cursor-pointer items-center justify-between rounded-xl border bg-white px-3 py-3">
              <div>
                <p className="text-xs uppercase text-muted-foreground">Resumen</p>
                <p className="text-sm font-medium text-slate-900">
                  KPIs y gráfica de oportunidades
                </p>
              </div>
              <span className="flex items-center gap-2 text-sm text-slate-700">
                Mostrar/Ocultar
                <IconChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
              </span>
            </div>
          </summary>
          <div className="mt-0 space-y-4 rounded-b-xl border border-t-0 bg-white pb-4 pt-4">
            <SectionCards data={leadsOverview.cards} />
            <div className="px-4 lg:px-6">
              <ChartAreaInteractive data={leadsOverview.chart} />
            </div>
            <div className="px-4 lg:px-6">
              <RestartKpiCards kpis={leadsOverview.restartKpis} />
            </div>
          </div>
        </details>
        {leadsOverview.errors.length > 0 ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            {leadsOverview.errors.map((error) => (
              <p key={error}>{error}</p>
            ))}
          </div>
        ) : null}
        {payload.errors.length > 0 ? (
          <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            {payload.errors.map((error) => (
              <p key={error}>{error}</p>
            ))}
          </div>
        ) : (
          <OportunidadesTableClient
            rows={filteredRows}
            filters={filters}
            filterOptions={mergedOptions}
            filterInitial={filters}
            columnLabels={{
              header: "Oportunidad",
              type: "Contacto",
              status: "Etapa",
              target: "Monto",
              limit: "Cierre probable",
              reviewer: "Asignado",
            }}
          />
        )}
      </div>
    </AppViewLayout>
  );
}

type StageOption = { id: string; nombre: string };
type AccountOption = { id: string; nombre: string | null; razon_social?: string | null };
type ContactOption = { contacto_id: string; nombre: string | null; correo: string | null };
type UserOption = { id: string; nombre_completo: string | null; correo: string | null };

async function loadFilterOptions(): Promise<OportunidadesFilterOptions> {
  const [stagesResp, accountsResp, contactsResp, usersResp] = await Promise.all([
    callCrmApi<StageOption[]>("/crm/etapas"),
    callCrmApi<{ items: AccountOption[] }>("/crm/cuentas", { searchParams: { limit: "200", offset: "0" } }),
    callCrmApi<ContactOption[]>("/crm/contacts/list", { searchParams: { limit: "200" } }),
    callCrmApi<UserOption[]>("/crm/usuarios", { searchParams: { limit: "200" } }),
  ]);

  return {
    etapas: normalizeOptions(
      stagesResp.ok && Array.isArray(stagesResp.data) ? stagesResp.data.map((s) => ({ id: s.id, label: s.nombre })) : [],
    ),
    estados: normalizeOptions(
      [
        { id: "abierta", label: "abierta" },
        { id: "ganada", label: "ganada" },
        { id: "perdida", label: "perdida" },
      ],
    ),
    asignados: normalizeOptions(
      usersResp.ok && Array.isArray(usersResp.data)
        ? usersResp.data.map((u) => ({ id: u.id, label: u.nombre_completo || u.correo || u.id }))
        : [],
    ),
    cuentas: normalizeOptions(
      accountsResp.ok && accountsResp.data?.items
        ? accountsResp.data.items.map((c) => ({ id: c.id, label: c.nombre || c.razon_social || c.id }))
        : [],
    ),
    contactos: normalizeOptions(
      contactsResp.ok && Array.isArray(contactsResp.data)
        ? contactsResp.data.map((c) => ({ id: c.contacto_id, label: c.nombre || c.correo || c.contacto_id }))
        : [],
    ),
    canales: [],
  };
}

function resolveFilters(params: PageSearchParams): OportunidadesFiltersState {
  const pick = (key: string) => {
    const value = params[key];
    return typeof value === "string" ? value : "";
  };

  return {
    q: pick("q"),
    etapaId: pick("etapa_id") || "all",
    estado: pick("estado") || "all",
    asignadoId: pick("asignado_id") || "all",
    cuentaId: pick("cuenta_id") || "all",
    contactoId: pick("contacto_id") || "all",
    canal: pick("canal") || "all",
    montoMin: pick("monto_min"),
    montoMax: pick("monto_max"),
    cierreDesde: pick("cierre_desde"),
    cierreHasta: pick("cierre_hasta"),
    creadoDesde: pick("creado_desde"),
    creadoHasta: pick("creado_hasta"),
    reinicioMin: pick("reinicio_min"),
  };
}

function normalizeOptions(options: { id: string; label: string }[]) {
  const seen = new Set<string>();
  return options.filter((option) => {
    if (!option.id || seen.has(option.id)) return false;
    seen.add(option.id);
    return true;
  });
}

function buildChannelOptions(rows: { raw?: Record<string, unknown> }[]) {
  const channels = new Set<string>(["webchat", "whatsapp", "instagram", "messenger", "email", "llamada", "manual"]);
  rows.forEach((row) => {
    const raw = row.raw as { metadata?: { canal?: string; channel?: string } } | undefined;
    const value = raw?.metadata?.canal || raw?.metadata?.channel;
    if (typeof value === "string" && value.trim()) channels.add(value.trim());
  });
  return Array.from(channels).map((value) => ({ id: value, label: value }));
}

function applyServerFilters(
  rows: import("@/components/data-table").DataTableRow[],
  filters: OportunidadesFiltersState,
): import("@/components/data-table").DataTableRow[] {
  const search = filters.q.trim().toLowerCase();
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

    if (filters.etapaId !== "all") {
      if (filters.etapaId !== etapaId && filters.etapaId !== etapaNombre) return false;
    }
    if (filters.estado !== "all" && estado !== filters.estado) return false;
    if (filters.asignadoId !== "all" && asignadoId !== filters.asignadoId) return false;
    if (filters.cuentaId !== "all" && cuentaId !== filters.cuentaId) return false;
    if (filters.contactoId !== "all" && contactoId !== filters.contactoId) return false;
    if (filters.canal !== "all" && canal !== filters.canal) return false;

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
    const value = (current as Record<string, unknown>)[key];
    current = value;
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
