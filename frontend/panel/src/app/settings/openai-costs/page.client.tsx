"use client";

import * as React from "react";

import { usePermissions } from "@/hooks/use-permissions";
import { useTenantContext } from "@/hooks/use-tenant-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type DailyRow = {
  usage_date: string;
  organizacion_nombre: string | null;
  source_tenant_mode: string | null;
  channel: string | null;
  feature: string | null;
  openai_project_key: string | null;
  openai_project_display_name: string | null;
  openai_model_family: string | null;
  requests_count: number;
  conversations_count: number;
  total_tokens: number;
  estimated_total_cost_usd: number | string;
  avg_latency_ms: number | string | null;
  missing_pricing_count: number;
};

type ConversationRow = {
  conversation_id: string;
  conversation_display_name: string | null;
  organizacion_nombre: string | null;
  channel: string | null;
  feature: string | null;
  openai_project_key: string | null;
  openai_project_display_name: string | null;
  models_used: string[] | null;
  requests_count: number;
  total_tokens: number;
  estimated_total_cost_usd: number | string;
  avg_latency_ms: number | string | null;
  fallback_count: number;
  quality_retry_count: number;
};

type ModelRow = {
  usage_month: string;
  organizacion_nombre: string | null;
  channel: string | null;
  feature: string | null;
  openai_project_key: string | null;
  openai_project_display_name: string | null;
  openai_model_family: string | null;
  requests_count: number;
  total_tokens: number;
  estimated_total_cost_usd: number | string;
  avg_latency_ms: number | string | null;
};

type ProjectRow = {
  usage_month: string;
  organizacion_nombre: string | null;
  source_tenant_mode: string | null;
  openai_project_key: string | null;
  openai_project_display_name: string | null;
  requests_count: number;
  conversations_count: number;
  models_count: number;
  total_tokens: number;
  estimated_total_cost_usd: number | string;
  avg_latency_ms: number | string | null;
  missing_pricing_count: number;
};

type AssistantRow = {
  usage_month: string;
  organizacion_nombre: string | null;
  source_tenant_mode: string | null;
  channel: string | null;
  feature: string | null;
  openai_project_key: string | null;
  openai_project_display_name: string | null;
  openai_model_family: string | null;
  assistant_kind: string | null;
  assistant_ref: string | null;
  assistant_display_name: string | null;
  requests_count: number;
  conversations_count: number;
  total_tokens: number;
  estimated_total_cost_usd: number | string;
  avg_latency_ms: number | string | null;
};

type ReconciliationRow = {
  usage_date: string;
  openai_project_id: string | null;
  openai_project_display_name: string | null;
  openai_organization_id: string | null;
  openai_organization_name: string | null;
  internal_requests_count: number;
  internal_estimated_cost_usd: number | string;
  official_cost_usd: number | string;
  variance_usd: number | string;
  variance_pct: number | string | null;
};

type MeasurementAuditRow = {
  organizacion_id: string;
  organizacion_nombre: string | null;
  activo: boolean | null;
  openai_project_id: string | null;
  has_openai_api_secret: boolean;
  has_openai_voice_secret: boolean;
  webchat_assistant_id: string | null;
  whatsapp_prompt_id: string | null;
  whatsapp_assistant_id: string | null;
  webchat_enabled: boolean;
  whatsapp_enabled: boolean;
  internal_requests_30d: number;
  requests_missing_project_30d: number;
  measurement_incomplete_requests_30d: number;
  last_request_at: string | null;
  uses_openai: boolean;
  measurement_status: string;
  measurement_reason: string;
};

type ApiResponse<T> = {
  ok?: boolean;
  rows?: T[];
  error?: string;
};

type TenantOption = {
  id: string;
  nombre: string | null;
};

const CHANNEL_OPTIONS = [
  { value: "__all__", label: "Todos los canales" },
  { value: "webchat", label: "Webchat" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "summary", label: "Summary" },
];

const FEATURE_OPTIONS = [
  { value: "__all__", label: "Todas las features" },
  { value: "sales_chat", label: "sales_chat" },
  { value: "conversation_summary", label: "conversation_summary" },
];

const ASSISTANT_KIND_OPTIONS = [
  { value: "__all__", label: "Todos los tipos" },
  { value: "prompt", label: "Prompt" },
  { value: "assistant", label: "Assistant" },
  { value: "raw_model", label: "Raw model" },
];

const MASTER_TENANT_ID = "00000000-0000-0000-0000-000000000001";

function canUseMasterScope(
  organizacionId: string | undefined,
  isOwner: boolean,
  isAdmin: boolean,
): boolean {
  return Boolean((isOwner || isAdmin) && organizacionId === MASTER_TENANT_ID);
}

function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function monthStart(value: string): string {
  return `${value.slice(0, 7)}-01`;
}

function parseNumber(value: number | string | null | undefined): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function formatUsd(value: number | string | null | undefined): string {
  const amount = parseNumber(value);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 4,
    maximumFractionDigits: 6,
  }).format(amount);
}

function formatInt(value: number | string | null | undefined): string {
  return new Intl.NumberFormat("es-MX").format(parseNumber(value));
}

function shortId(value: string | null | undefined): string {
  if (!value) return "—";
  if (value.length <= 12) return value;
  return `${value.slice(0, 8)}…${value.slice(-4)}`;
}

function projectLabel(displayName: string | null | undefined, key: string | null | undefined): string {
  if (displayName && displayName.trim().length) return displayName.trim();
  if (key && key.trim().length) return key.trim();
  return "—";
}

function assistantLabel(
  displayName: string | null | undefined,
  kind: string | null | undefined,
  ref: string | null | undefined,
): string {
  const base = displayName && displayName.trim().length ? displayName.trim() : kind ?? "Asistente";
  if (!ref || !ref.trim().length) return base;
  return `${base} · ${shortId(ref.trim())}`;
}

function conversationLabel(displayName: string | null | undefined, conversationId: string): string {
  if (displayName && displayName.trim().length) return displayName.trim();
  return `Conversación · ${shortId(conversationId)}`;
}

function formatMonthLabel(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("es-MX", { year: "numeric", month: "short" });
}

function measurementStatusLabel(value: string | null | undefined): string {
  switch (value) {
    case "complete":
      return "Completo";
    case "degraded":
      return "Degradado";
    case "incomplete":
      return "Incompleto";
    case "not_reconcilable":
      return "No reconciliable";
    case "not_applicable":
      return "No aplica";
    default:
      return value ?? "—";
  }
}

function measurementStatusVariant(value: string | null | undefined): "default" | "secondary" | "destructive" | "outline" {
  switch (value) {
    case "complete":
      return "default";
    case "degraded":
    case "incomplete":
    case "not_reconcilable":
      return "destructive";
    case "not_applicable":
      return "secondary";
    default:
      return "outline";
  }
}

function csvValue(value: unknown): string {
  if (value == null) return "";
  if (Array.isArray(value)) return value.join(", ");
  const text = String(value);
  if (/[",\n]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

function buildCsv<T extends Record<string, unknown>>(rows: T[], columns: Array<{ key: keyof T; label: string }>): string {
  const header = columns.map((column) => csvValue(column.label)).join(",");
  const lines = rows.map((row) =>
    columns.map((column) => csvValue(row[column.key])).join(","),
  );
  return [header, ...lines].join("\n");
}

function downloadCsv(filename: string, content: string): void {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

async function fetchRows<T>(path: string, searchParams: URLSearchParams): Promise<T[]> {
  const response = await fetch(`${path}?${searchParams.toString()}`, { cache: "no-store" });
  const body = (await response.json().catch(() => ({}))) as ApiResponse<T>;
  if (!response.ok) {
    throw new Error(body.error || `Error ${response.status}`);
  }
  return Array.isArray(body.rows) ? body.rows : [];
}

export function OpenAiCostsPageClient() {
  const today = React.useMemo(() => new Date(), []);
  const { context: permissionContext } = usePermissions();
  const { tenantId: activeTenantId, tenantName: activeTenantName, refresh } = useTenantContext();
  const [dateFrom, setDateFrom] = React.useState(() => isoDate(new Date(today.getTime() - 29 * 24 * 60 * 60 * 1000)));
  const [dateTo, setDateTo] = React.useState(() => isoDate(today));
  const [channel, setChannel] = React.useState("__all__");
  const [feature, setFeature] = React.useState("__all__");
  const [projectKey, setProjectKey] = React.useState("__all__");
  const [assistantKind, setAssistantKind] = React.useState("__all__");
  const [scope, setScope] = React.useState<"tenant" | "master">("tenant");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [dailyRows, setDailyRows] = React.useState<DailyRow[]>([]);
  const [conversationRows, setConversationRows] = React.useState<ConversationRow[]>([]);
  const [modelRows, setModelRows] = React.useState<ModelRow[]>([]);
  const [projectRows, setProjectRows] = React.useState<ProjectRow[]>([]);
  const [assistantRows, setAssistantRows] = React.useState<AssistantRow[]>([]);
  const [reconciliationRows, setReconciliationRows] = React.useState<ReconciliationRow[]>([]);
  const [measurementAuditRows, setMeasurementAuditRows] = React.useState<MeasurementAuditRow[]>([]);
  const [tenantOptions, setTenantOptions] = React.useState<TenantOption[]>([]);
  const [tenantsLoading, setTenantsLoading] = React.useState(false);
  const [syncingReconciliation, setSyncingReconciliation] = React.useState(false);

  const loadTenantOptions = React.useCallback(async () => {
    if (!canUseMasterScope(permissionContext.organizacion_id, permissionContext.es_owner, permissionContext.es_admin)) {
      setTenantOptions([]);
      return;
    }
    setTenantsLoading(true);
    try {
      const response = await fetch("/api/platform-admin/tenants", { cache: "no-store" });
      const body = (await response.json().catch(() => ({}))) as { items?: TenantOption[] };
      setTenantOptions(
        Array.isArray(body.items)
          ? body.items
              .filter((item) => typeof item?.id === "string" && item.id.trim().length)
              .map((item) => ({ id: item.id.trim(), nombre: typeof item.nombre === "string" ? item.nombre : null }))
          : [],
      );
    } catch {
      setTenantOptions([]);
    } finally {
      setTenantsLoading(false);
    }
  }, [permissionContext.es_admin, permissionContext.es_owner, permissionContext.organizacion_id]);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const useMasterScope = scope === "master" && canUseMasterScope(permissionContext.organizacion_id, permissionContext.es_owner, permissionContext.es_admin);
      const dailyBasePath = "/api/analytics/openai/costs/daily";
      const conversationsBasePath = "/api/analytics/openai/costs/conversations";
      const modelsBasePath = "/api/analytics/openai/costs/models";
      const projectsBasePath = "/api/analytics/openai/costs/projects";
      const assistantsBasePath = "/api/analytics/openai/costs/assistants";
      const reconciliationBasePath = "/api/analytics/openai/reconciliation/daily";
      const measurementAuditBasePath = "/api/analytics/openai/measurement-audit";
      const commonDaily = new URLSearchParams({ date_from: dateFrom, date_to: dateTo });
      const commonMonthly = new URLSearchParams({
        month_from: monthStart(dateFrom),
        month_to: monthStart(dateTo),
      });
      if (useMasterScope) {
        commonDaily.set("scope", "master");
        commonMonthly.set("scope", "master");
      }
      if (useMasterScope && activeTenantId) {
        commonDaily.set("tenant_id", activeTenantId);
        commonMonthly.set("tenant_id", activeTenantId);
      }
      if (channel !== "__all__") {
        commonDaily.set("channel", channel);
        commonMonthly.set("channel", channel);
      }
      if (feature !== "__all__") {
        commonDaily.set("feature", feature);
        commonMonthly.set("feature", feature);
      }
      if (projectKey !== "__all__") {
        commonDaily.set("project_key", projectKey);
        commonMonthly.set("project_key", projectKey);
      }

      const conversationParams = new URLSearchParams(commonDaily);
      conversationParams.set("limit", "20");
      const assistantParams = new URLSearchParams(commonMonthly);
      if (assistantKind !== "__all__") {
        assistantParams.set("assistant_kind", assistantKind);
      }

      const reconciliationParams = new URLSearchParams({ date_from: dateFrom, date_to: dateTo });
      if (projectKey !== "__all__") {
        reconciliationParams.set("project_id", projectKey);
      }
      const measurementAuditParams = new URLSearchParams();
      if (useMasterScope && activeTenantId) {
        measurementAuditParams.set("tenant_id", activeTenantId);
      }

      const [daily, conversations, models, projects, assistants, reconciliation, measurementAudit] = await Promise.all([
        fetchRows<DailyRow>(dailyBasePath, commonDaily),
        fetchRows<ConversationRow>(conversationsBasePath, conversationParams),
        fetchRows<ModelRow>(modelsBasePath, commonMonthly),
        fetchRows<ProjectRow>(projectsBasePath, commonMonthly),
        fetchRows<AssistantRow>(assistantsBasePath, assistantParams),
        useMasterScope ? fetchRows<ReconciliationRow>(reconciliationBasePath, reconciliationParams) : Promise.resolve([]),
        useMasterScope ? fetchRows<MeasurementAuditRow>(measurementAuditBasePath, measurementAuditParams) : Promise.resolve([]),
      ]);

      setDailyRows(daily);
      setConversationRows(conversations);
      setModelRows(models);
      setProjectRows(projects);
      setAssistantRows(assistants);
      setReconciliationRows(reconciliation);
      setMeasurementAuditRows(measurementAudit);
    } catch (fetchError) {
      console.error("[openai-costs] fetch failed", fetchError);
      setError(fetchError instanceof Error ? fetchError.message : "No se pudieron cargar los costos OpenAI.");
    } finally {
      setLoading(false);
    }
  }, [activeTenantId, assistantKind, channel, dateFrom, dateTo, feature, permissionContext.es_admin, permissionContext.es_owner, permissionContext.organizacion_id, projectKey, scope]);

  const masterScopeEnabled = canUseMasterScope(
    permissionContext.organizacion_id,
    permissionContext.es_owner,
    permissionContext.es_admin,
  );

  React.useEffect(() => {
    void load();
  }, [load]);

  React.useEffect(() => {
    void loadTenantOptions();
  }, [loadTenantOptions]);

  const totals = React.useMemo(() => {
    return dailyRows.reduce(
      (acc, row) => {
        acc.cost += parseNumber(row.estimated_total_cost_usd);
        acc.requests += parseNumber(row.requests_count);
        acc.tokens += parseNumber(row.total_tokens);
        acc.conversations += parseNumber(row.conversations_count);
        acc.missingPricing += parseNumber(row.missing_pricing_count);
        return acc;
      },
      { cost: 0, requests: 0, tokens: 0, conversations: 0, missingPricing: 0 },
    );
  }, [dailyRows]);

  const projectOptions = React.useMemo(() => {
    const seen = new Map<string, string>();
    const push = (key: string | null | undefined, displayName: string | null | undefined) => {
      const normalizedKey = typeof key === "string" ? key.trim() : "";
      if (!normalizedKey.length || seen.has(normalizedKey)) return;
      seen.set(normalizedKey, projectLabel(displayName, normalizedKey));
    };

    for (const row of dailyRows) push(row.openai_project_key, row.openai_project_display_name);
    for (const row of projectRows) push(row.openai_project_key, row.openai_project_display_name);
    for (const row of modelRows) push(row.openai_project_key, row.openai_project_display_name);
    for (const row of assistantRows) push(row.openai_project_key, row.openai_project_display_name);
    for (const row of conversationRows) push(row.openai_project_key, row.openai_project_display_name);

    return Array.from(seen.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label, "es"));
  }, [assistantRows, conversationRows, dailyRows, modelRows, projectRows]);

  const selectedTenantValue = activeTenantId ?? "__all__";
  const exportPrefix = `openai-costs-${scope}-${dateFrom}-${dateTo}`;
  const reconciliationSummary = React.useMemo(() => {
    return reconciliationRows.reduce(
      (acc, row) => {
        acc.internal += parseNumber(row.internal_estimated_cost_usd);
        acc.official += parseNumber(row.official_cost_usd);
        acc.variance += parseNumber(row.variance_usd);
        return acc;
      },
      { internal: 0, official: 0, variance: 0 },
    );
  }, [reconciliationRows]);
  const measurementAuditSummary = React.useMemo(() => {
    return measurementAuditRows.reduce(
      (acc, row) => {
        acc.total += 1;
        if (row.measurement_status === "complete") acc.complete += 1;
        if (row.measurement_status === "degraded") acc.degraded += 1;
        if (row.measurement_status === "incomplete" || row.measurement_status === "not_reconcilable") acc.incomplete += 1;
        return acc;
      },
      { total: 0, complete: 0, degraded: 0, incomplete: 0 },
    );
  }, [measurementAuditRows]);

  const handleExportDaily = React.useCallback(() => {
    downloadCsv(
      `${exportPrefix}-daily.csv`,
      buildCsv(dailyRows, [
        { key: "usage_date", label: "Fecha" },
        { key: "organizacion_nombre", label: "Organización" },
        { key: "channel", label: "Canal" },
        { key: "feature", label: "Feature" },
        { key: "openai_project_display_name", label: "Proyecto" },
        { key: "openai_model_family", label: "Modelo" },
        { key: "requests_count", label: "Requests" },
        { key: "conversations_count", label: "Conversaciones" },
        { key: "total_tokens", label: "Tokens" },
        { key: "avg_latency_ms", label: "Latencia promedio ms" },
        { key: "estimated_total_cost_usd", label: "Costo USD" },
        { key: "missing_pricing_count", label: "Pricing faltante" },
      ]),
    );
  }, [dailyRows, exportPrefix]);

  const handleExportProjects = React.useCallback(() => {
    downloadCsv(
      `${exportPrefix}-projects.csv`,
      buildCsv(projectRows, [
        { key: "usage_month", label: "Mes" },
        { key: "organizacion_nombre", label: "Organización" },
        { key: "openai_project_display_name", label: "Proyecto" },
        { key: "source_tenant_mode", label: "Modo" },
        { key: "requests_count", label: "Requests" },
        { key: "conversations_count", label: "Conversaciones" },
        { key: "models_count", label: "Modelos" },
        { key: "total_tokens", label: "Tokens" },
        { key: "avg_latency_ms", label: "Latencia promedio ms" },
        { key: "estimated_total_cost_usd", label: "Costo USD" },
        { key: "missing_pricing_count", label: "Pricing faltante" },
      ]),
    );
  }, [exportPrefix, projectRows]);

  const handleExportModels = React.useCallback(() => {
    downloadCsv(
      `${exportPrefix}-models.csv`,
      buildCsv(modelRows, [
        { key: "usage_month", label: "Mes" },
        { key: "organizacion_nombre", label: "Organización" },
        { key: "channel", label: "Canal" },
        { key: "feature", label: "Feature" },
        { key: "openai_project_display_name", label: "Proyecto" },
        { key: "openai_model_family", label: "Modelo" },
        { key: "requests_count", label: "Requests" },
        { key: "total_tokens", label: "Tokens" },
        { key: "avg_latency_ms", label: "Latencia promedio ms" },
        { key: "estimated_total_cost_usd", label: "Costo USD" },
      ]),
    );
  }, [exportPrefix, modelRows]);

  const handleExportAssistants = React.useCallback(() => {
    downloadCsv(
      `${exportPrefix}-assistants.csv`,
      buildCsv(assistantRows, [
        { key: "usage_month", label: "Mes" },
        { key: "organizacion_nombre", label: "Organización" },
        { key: "channel", label: "Canal" },
        { key: "feature", label: "Feature" },
        { key: "openai_project_display_name", label: "Proyecto" },
        { key: "assistant_kind", label: "Tipo" },
        { key: "assistant_display_name", label: "Asistente" },
        { key: "assistant_ref", label: "Referencia" },
        { key: "requests_count", label: "Requests" },
        { key: "conversations_count", label: "Conversaciones" },
        { key: "total_tokens", label: "Tokens" },
        { key: "avg_latency_ms", label: "Latencia promedio ms" },
        { key: "estimated_total_cost_usd", label: "Costo USD" },
      ]),
    );
  }, [assistantRows, exportPrefix]);

  const handleExportConversations = React.useCallback(() => {
    downloadCsv(
      `${exportPrefix}-conversations.csv`,
      buildCsv(conversationRows, [
        { key: "conversation_id", label: "Conversación ID" },
        { key: "conversation_display_name", label: "Conversación" },
        { key: "organizacion_nombre", label: "Organización" },
        { key: "channel", label: "Canal" },
        { key: "feature", label: "Feature" },
        { key: "openai_project_display_name", label: "Proyecto" },
        { key: "models_used", label: "Modelos" },
        { key: "requests_count", label: "Requests" },
        { key: "total_tokens", label: "Tokens" },
        { key: "avg_latency_ms", label: "Latencia promedio ms" },
        { key: "fallback_count", label: "Fallbacks" },
        { key: "quality_retry_count", label: "Quality retries" },
        { key: "estimated_total_cost_usd", label: "Costo USD" },
      ]),
    );
  }, [conversationRows, exportPrefix]);

  const handleSyncReconciliation = React.useCallback(async () => {
    setSyncingReconciliation(true);
    try {
      const params = new URLSearchParams({ date_from: dateFrom, date_to: dateTo });
      const response = await fetch(`/api/analytics/openai/reconciliation/sync?${params.toString()}`, {
        method: "POST",
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(body.error || `Error ${response.status}`);
      }
      await load();
    } catch (syncError) {
      console.error("[openai-reconciliation] sync failed", syncError);
      setError(syncError instanceof Error ? syncError.message : "No se pudo sincronizar la reconciliación OpenAI.");
    } finally {
      setSyncingReconciliation(false);
    }
  }, [dateFrom, dateTo, load]);

  return (
    <div className="flex flex-col gap-6 px-4 py-2 lg:px-6">
      <header className="space-y-2">
        <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">Cost ledger</p>
        <h1 className="text-3xl font-semibold tracking-tight">Costos OpenAI</h1>
        <p className="max-w-4xl text-sm text-muted-foreground">
          Vista operativa de costos, tokens, latencia y retries por canal, modelo, proyecto y conversación.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Filtros</CardTitle>
          <CardDescription>Consulta rápida para el tenant actual autenticado.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-5">
          {masterScopeEnabled ? (
            <div className="grid gap-2 min-w-0">
              <label className="text-xs font-medium text-muted-foreground">Alcance</label>
              <Select value={scope} onValueChange={(value) => setScope(value as "tenant" | "master")}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Tenant actual" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="tenant">Tenant actual</SelectItem>
                  <SelectItem value="master">Master global</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ) : null}
          {masterScopeEnabled && scope === "master" ? (
            <div className="grid gap-2 min-w-0">
              <label className="text-xs font-medium text-muted-foreground">Organización / tenant</label>
              <Select
                value={selectedTenantValue}
                onValueChange={async (value) => {
                  try {
                    if (value === "__all__") {
                      await fetch("/api/platform-admin/tenant-context", { method: "DELETE" });
                    } else {
                      await fetch("/api/platform-admin/tenant-context", {
                        method: "PUT",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ tenant_id: value }),
                      });
                    }
                  } finally {
                    await refresh();
                  }
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={tenantsLoading ? "Cargando tenants..." : "Todos los tenants"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todos los tenants</SelectItem>
                  {tenantOptions.map((tenant) => (
                    <SelectItem key={tenant.id} value={tenant.id}>
                      {tenant.nombre ?? shortId(tenant.id)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          <div className="grid gap-2 min-w-0">
            <label className="text-xs font-medium text-muted-foreground">Proyecto</label>
            <Select value={projectKey} onValueChange={setProjectKey}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Todos los proyectos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos los proyectos</SelectItem>
                {projectOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2 min-w-0">
            <label className="text-xs font-medium text-muted-foreground">Desde</label>
            <Input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} className="w-full" />
          </div>
          <div className="grid gap-2 min-w-0">
            <label className="text-xs font-medium text-muted-foreground">Hasta</label>
            <Input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} className="w-full" />
          </div>
          <div className="grid gap-2 min-w-0">
            <label className="text-xs font-medium text-muted-foreground">Canal</label>
            <Select value={channel} onValueChange={setChannel}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                {CHANNEL_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2 min-w-0">
            <label className="text-xs font-medium text-muted-foreground">Feature</label>
            <Select value={feature} onValueChange={setFeature}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Todas" />
              </SelectTrigger>
              <SelectContent>
                {FEATURE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2 min-w-0">
            <label className="text-xs font-medium text-muted-foreground">Tipo de asistente</label>
            <Select value={assistantKind} onValueChange={setAssistantKind}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                {ASSISTANT_KIND_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2 min-w-0">
            <label className="text-xs font-medium text-muted-foreground">Acción</label>
            <Button type="button" variant="outline" onClick={() => void load()} disabled={loading} className="w-full">
              {loading ? "Actualizando..." : "Actualizar"}
            </Button>
          </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {scope === "master" && activeTenantId ? (
              <Badge variant="outline">Tenant filtro: {activeTenantName ?? shortId(activeTenantId)}</Badge>
            ) : null}
            {totals.missingPricing > 0 ? <Badge variant="secondary">Pricing faltante: {totals.missingPricing}</Badge> : null}
          </div>
        </CardContent>
      </Card>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Costo total" value={formatUsd(totals.cost)} />
        <MetricCard label="Requests" value={formatInt(totals.requests)} />
        <MetricCard label="Tokens" value={formatInt(totals.tokens)} />
        <MetricCard label="Conversaciones" value={formatInt(totals.conversations)} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Export CSV</CardTitle>
          <CardDescription>Descarga el dataset visible con los filtros activos.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={handleExportDaily} disabled={!dailyRows.length}>
            Diario
          </Button>
          <Button type="button" variant="outline" onClick={handleExportProjects} disabled={!projectRows.length}>
            Proyectos
          </Button>
          <Button type="button" variant="outline" onClick={handleExportModels} disabled={!modelRows.length}>
            Modelos
          </Button>
          <Button type="button" variant="outline" onClick={handleExportAssistants} disabled={!assistantRows.length}>
            Asistentes
          </Button>
          <Button type="button" variant="outline" onClick={handleExportConversations} disabled={!conversationRows.length}>
            Conversaciones
          </Button>
        </CardContent>
      </Card>

      {masterScopeEnabled && scope === "master" ? (
        <Card>
          <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="space-y-1">
              <CardTitle>Reconciliación oficial OpenAI</CardTitle>
              <CardDescription>
                Compara costo oficial diario de `organization/costs` contra el ledger interno por proyecto.
              </CardDescription>
            </div>
            <Button type="button" variant="outline" onClick={() => void handleSyncReconciliation()} disabled={syncingReconciliation}>
              {syncingReconciliation ? "Sincronizando..." : "Sincronizar OpenAI"}
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <MetricCard label="Interno" value={formatUsd(reconciliationSummary.internal)} />
              <MetricCard label="Oficial OpenAI" value={formatUsd(reconciliationSummary.official)} />
              <MetricCard label="Delta" value={formatUsd(reconciliationSummary.variance)} />
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Proyecto</TableHead>
                  <TableHead className="text-right">Req internos</TableHead>
                  <TableHead className="text-right">Interno</TableHead>
                  <TableHead className="text-right">Oficial</TableHead>
                  <TableHead className="text-right">Delta</TableHead>
                  <TableHead className="text-right">Delta %</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reconciliationRows.length ? (
                  reconciliationRows.slice(0, 20).map((row, index) => (
                    <TableRow key={[row.usage_date, row.openai_project_id ?? "project", index].join("-")}>
                      <TableCell>{row.usage_date}</TableCell>
                      <TableCell>{projectLabel(row.openai_project_display_name, row.openai_project_id)}</TableCell>
                      <TableCell className="text-right">{formatInt(row.internal_requests_count)}</TableCell>
                      <TableCell className="text-right">{formatUsd(row.internal_estimated_cost_usd)}</TableCell>
                      <TableCell className="text-right">{formatUsd(row.official_cost_usd)}</TableCell>
                      <TableCell className="text-right">{formatUsd(row.variance_usd)}</TableCell>
                      <TableCell className="text-right">
                        {row.variance_pct == null ? "—" : `${parseNumber(row.variance_pct).toFixed(2)}%`}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <EmptyTable colSpan={7} label={loading ? "Cargando reconciliación..." : "Sin datos de reconciliación para el rango actual."} />
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}

      {masterScopeEnabled && scope === "master" ? (
        <Card>
          <CardHeader>
            <CardTitle>Auditoría de medibilidad por tenant</CardTitle>
            <CardDescription>
              Verifica qué tenants están completos, degradados o incompletos para medición y reconciliación OpenAI.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-4">
              <MetricCard label="Tenants auditados" value={formatInt(measurementAuditSummary.total)} />
              <MetricCard label="Completos" value={formatInt(measurementAuditSummary.complete)} />
              <MetricCard label="Degradados" value={formatInt(measurementAuditSummary.degraded)} />
              <MetricCard label="Incompletos" value={formatInt(measurementAuditSummary.incomplete)} />
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tenant</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Motivo</TableHead>
                  <TableHead>Proyecto</TableHead>
                  <TableHead className="text-right">Req 30d</TableHead>
                  <TableHead className="text-right">Sin project</TableHead>
                  <TableHead className="text-right">Última req</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {measurementAuditRows.length ? (
                  measurementAuditRows.slice(0, 20).map((row, index) => (
                    <TableRow key={[row.organizacion_id, row.measurement_status, index].join("-")}>
                      <TableCell>{row.organizacion_nombre ?? shortId(row.organizacion_id)}</TableCell>
                      <TableCell>
                        <Badge variant={measurementStatusVariant(row.measurement_status)}>
                          {measurementStatusLabel(row.measurement_status)}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-[280px] whitespace-normal text-xs text-muted-foreground">
                        {row.measurement_reason ?? "—"}
                      </TableCell>
                      <TableCell>{projectLabel(row.openai_project_id, row.openai_project_id)}</TableCell>
                      <TableCell className="text-right">{formatInt(row.internal_requests_30d)}</TableCell>
                      <TableCell className="text-right">{formatInt(row.requests_missing_project_30d)}</TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground">
                        {row.last_request_at ? new Date(row.last_request_at).toLocaleString("es-MX") : "—"}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <EmptyTable colSpan={7} label={loading ? "Cargando auditoría..." : "Sin datos de auditoría para el contexto actual."} />
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Diario por canal / modelo</CardTitle>
            <CardDescription>Agregado diario para vigilar costo, tokens y pricing faltante.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Organización</TableHead>
                  <TableHead>Canal</TableHead>
                  <TableHead>Proyecto</TableHead>
                  <TableHead>Modelo</TableHead>
                  <TableHead className="text-right">Req</TableHead>
                  <TableHead className="text-right">Tokens</TableHead>
                  <TableHead className="text-right">Costo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dailyRows.length ? (
                  dailyRows.slice(0, 12).map((row, index) => (
                    <TableRow
                      key={[
                        row.usage_date,
                        row.organizacion_nombre ?? "org",
                        row.channel ?? "channel",
                        row.openai_project_key ?? "project",
                        row.openai_model_family ?? "model",
                        row.feature ?? "feature",
                        index,
                      ].join("-")}
                    >
                      <TableCell>{row.usage_date}</TableCell>
                      <TableCell>{row.organizacion_nombre ?? "—"}</TableCell>
                      <TableCell>{row.channel ?? "—"}</TableCell>
                      <TableCell>{projectLabel(row.openai_project_display_name, row.openai_project_key)}</TableCell>
                      <TableCell>{row.openai_model_family ?? "—"}</TableCell>
                      <TableCell className="text-right">{formatInt(row.requests_count)}</TableCell>
                      <TableCell className="text-right">{formatInt(row.total_tokens)}</TableCell>
                      <TableCell className="text-right font-medium">{formatUsd(row.estimated_total_cost_usd)}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <EmptyTable colSpan={8} label={loading ? "Cargando diario..." : "Sin datos diarios para el rango actual."} />
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Mensual por proyecto</CardTitle>
            <CardDescription>Útil para reconciliar costo por proyecto OpenAI y modo tenant.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mes</TableHead>
                  <TableHead>Organización</TableHead>
                  <TableHead>Proyecto</TableHead>
                  <TableHead>Modo</TableHead>
                  <TableHead className="text-right">Req</TableHead>
                  <TableHead className="text-right">Conv</TableHead>
                  <TableHead className="text-right">Costo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {projectRows.length ? (
                  projectRows.slice(0, 12).map((row, index) => (
                    <TableRow key={[row.usage_month, row.organizacion_nombre ?? "org", row.openai_project_key ?? "project", index].join("-")}> 
                      <TableCell>{formatMonthLabel(row.usage_month)}</TableCell>
                      <TableCell>{row.organizacion_nombre ?? "—"}</TableCell>
                      <TableCell>{projectLabel(row.openai_project_display_name, row.openai_project_key)}</TableCell>
                      <TableCell>{row.source_tenant_mode ?? "—"}</TableCell>
                      <TableCell className="text-right">{formatInt(row.requests_count)}</TableCell>
                      <TableCell className="text-right">{formatInt(row.conversations_count)}</TableCell>
                      <TableCell className="text-right font-medium">{formatUsd(row.estimated_total_cost_usd)}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <EmptyTable colSpan={7} label={loading ? "Cargando proyectos..." : "Sin datos de proyectos."} />
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Mensual por modelo</CardTitle>
            <CardDescription>Comparativo de gasto y tokens por familia de modelo.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mes</TableHead>
                  <TableHead>Organización</TableHead>
                  <TableHead>Canal</TableHead>
                  <TableHead>Proyecto</TableHead>
                  <TableHead>Modelo</TableHead>
                  <TableHead className="text-right">Req</TableHead>
                  <TableHead className="text-right">Tokens</TableHead>
                  <TableHead className="text-right">Costo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {modelRows.length ? (
                  modelRows.slice(0, 12).map((row, index) => (
                    <TableRow
                      key={[
                        row.usage_month,
                        row.organizacion_nombre ?? "org",
                        row.channel ?? "channel",
                        row.openai_project_key ?? "project",
                        row.openai_model_family ?? "model",
                        index,
                      ].join("-")}
                    > 
                      <TableCell>{formatMonthLabel(row.usage_month)}</TableCell>
                      <TableCell>{row.organizacion_nombre ?? "—"}</TableCell>
                      <TableCell>{row.channel ?? "—"}</TableCell>
                      <TableCell>{projectLabel(row.openai_project_display_name, row.openai_project_key)}</TableCell>
                      <TableCell>{row.openai_model_family ?? "—"}</TableCell>
                      <TableCell className="text-right">{formatInt(row.requests_count)}</TableCell>
                      <TableCell className="text-right">{formatInt(row.total_tokens)}</TableCell>
                      <TableCell className="text-right font-medium">{formatUsd(row.estimated_total_cost_usd)}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <EmptyTable colSpan={8} label={loading ? "Cargando modelos..." : "Sin datos por modelo."} />
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Mensual por asistente</CardTitle>
            <CardDescription>Desglose por `assistant_kind` y referencia efectiva usada en cada request.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mes</TableHead>
                  <TableHead>Organización</TableHead>
                  <TableHead>Canal</TableHead>
                  <TableHead>Proyecto</TableHead>
                  <TableHead>Asistente</TableHead>
                  <TableHead className="text-right">Req</TableHead>
                  <TableHead className="text-right">Costo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {assistantRows.length ? (
                  assistantRows.slice(0, 12).map((row, index) => (
                    <TableRow
                      key={[
                        row.usage_month,
                        row.organizacion_nombre ?? "org",
                        row.channel ?? "channel",
                        row.openai_project_key ?? "project",
                        row.assistant_kind ?? "kind",
                        row.assistant_ref ?? "ref",
                        index,
                      ].join("-")}
                    >
                      <TableCell>{formatMonthLabel(row.usage_month)}</TableCell>
                      <TableCell>{row.organizacion_nombre ?? "—"}</TableCell>
                      <TableCell>{row.channel ?? "—"}</TableCell>
                      <TableCell>{projectLabel(row.openai_project_display_name, row.openai_project_key)}</TableCell>
                      <TableCell className="max-w-[260px] whitespace-normal text-xs text-muted-foreground">
                        {assistantLabel(row.assistant_display_name, row.assistant_kind, row.assistant_ref)}
                      </TableCell>
                      <TableCell className="text-right">{formatInt(row.requests_count)}</TableCell>
                      <TableCell className="text-right font-medium">{formatUsd(row.estimated_total_cost_usd)}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <EmptyTable colSpan={7} label={loading ? "Cargando asistentes..." : "Sin datos por asistente."} />
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Conversaciones más costosas</CardTitle>
            <CardDescription>Top conversaciones del rango con modelos usados, retries y fallback.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Conversación</TableHead>
                  <TableHead>Organización</TableHead>
                  <TableHead>Canal</TableHead>
                  <TableHead>Proyecto</TableHead>
                  <TableHead>Modelos</TableHead>
                  <TableHead className="text-right">Req</TableHead>
                  <TableHead className="text-right">Costo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {conversationRows.length ? (
                  conversationRows.map((row) => (
                    <TableRow key={row.conversation_id}>
                      <TableCell className="max-w-[240px] whitespace-normal text-xs">
                        {conversationLabel(row.conversation_display_name, row.conversation_id)}
                      </TableCell>
                      <TableCell>{row.organizacion_nombre ?? "—"}</TableCell>
                      <TableCell>{row.channel ?? "—"}</TableCell>
                      <TableCell>{projectLabel(row.openai_project_display_name, row.openai_project_key)}</TableCell>
                      <TableCell className="max-w-[260px] whitespace-normal text-xs text-muted-foreground">
                        {(row.models_used ?? []).length ? (row.models_used ?? []).join(", ") : "—"}
                      </TableCell>
                      <TableCell className="text-right">{formatInt(row.requests_count)}</TableCell>
                      <TableCell className="text-right font-medium">{formatUsd(row.estimated_total_cost_usd)}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <EmptyTable colSpan={7} label={loading ? "Cargando conversaciones..." : "Sin conversaciones para el rango actual."} />
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold">{value}</div>
      </CardContent>
    </Card>
  );
}

function EmptyTable({ colSpan, label }: { colSpan: number; label: string }) {
  return (
    <TableRow>
      <TableCell colSpan={colSpan} className="text-center text-muted-foreground">
        {label}
      </TableCell>
    </TableRow>
  );
}
