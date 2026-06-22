import { AppViewLayout } from "@/components/layouts/app-view-layout";
import { fetchPermissionContext } from "@/lib/auth/permissions";
import { loadCrmOpportunities } from "@/lib/crm/opportunities";
import {
  type OportunidadesFilterOptions,
  type OportunidadesFiltersState,
} from "./oportunidades-filters.client";
import { OportunidadesSummaryLazy } from "./oportunidades-summary-lazy.client";
import { OportunidadesTableClient } from "./oportunidades-table.client";

export const dynamic = "force-dynamic";

type PageSearchParams = Record<string, string | string[] | undefined>;

export default async function OportunidadesPage({
  searchParams,
}: {
  searchParams?: Promise<PageSearchParams>;
}) {
  const resolvedParams = searchParams ? await searchParams : {};
  const permissionContext = await fetchPermissionContext();
  const normalizedRoles = (permissionContext.roles ?? [])
    .map((role) => (role ?? "").toString().trim().toLowerCase())
    .filter(Boolean);
  const isAdminRole =
    Boolean(permissionContext.es_admin || permissionContext.es_owner) ||
    normalizedRoles.some((value) => value === "admin" || value.includes("admin"));
  const isSupervisorRole = normalizedRoles.some(
    (value) => value === "0002" || value === "supervisor" || value.includes("supervisor"),
  );
  const isPrivilegedRole = isAdminRole || isSupervisorRole;
  const isAgenteRole = normalizedRoles.some(
    (value) =>
      value === "0003" ||
      value === "agente" ||
      value === "vendedor" ||
      value.includes("agente") ||
      value.includes("vendedor"),
  );
  const assignedScopeId =
    isAgenteRole && !isPrivilegedRole && permissionContext.usuario_id
      ? permissionContext.usuario_id
      : undefined;
  const filters = resolveFilters(resolvedParams, assignedScopeId);

  const payload = await loadCrmOpportunities({ ...filters, asignadoId: assignedScopeId });

  const filteredRows = payload.rows;
  const channelOptions = buildChannelOptions(payload.rows);
  const initialFilterOptions: OportunidadesFilterOptions = {
    etapas: [],
    estados: normalizeOptions([
      { id: "abierta", label: "abierta" },
      { id: "ganada", label: "ganada" },
      { id: "perdida", label: "perdida" },
    ]),
    asignados: [],
    cuentas: [],
    personas: [],
    canales: channelOptions,
  };

  return (
    <AppViewLayout title="Oportunidades">
      <div className="flex flex-col gap-4">
        <div className="rounded-xl border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
          Listado maestro para consultar, filtrar y revisar oportunidades. El cambio de etapa vive en el embudo;
          aquí solo se muestra el resumen y el acceso rápido a esa operación.
        </div>
        <OportunidadesSummaryLazy
          days={filters.creadoDesde && filters.creadoHasta ? undefined : 30}
          desde={filters.creadoDesde || undefined}
          hasta={filters.creadoHasta || undefined}
        />
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
            filterOptions={initialFilterOptions}
            filterInitial={filters}
            permissionContext={permissionContext}
            columnLabels={{
              header: "Oportunidad",
              type: "Persona",
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

function resolveFilters(params: PageSearchParams, assignedScopeId?: string): OportunidadesFiltersState {
  const pick = (key: string) => {
    const value = params[key];
    return typeof value === "string" ? value : "";
  };

  return {
    q: pick("q"),
    etapaId: pick("etapa_id") || "all",
    estado: pick("estado") || "all",
    asignadoId: assignedScopeId || pick("asignado_id") || "all",
    cuentaId: pick("cuenta_id") || "all",
    personaId: pick("persona_id") || "all",
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
