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

type ApiResponse<T> = {
  ok?: boolean;
  rows?: T[];
  error?: string;
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
  const { tenantId: activeTenantId, tenantName: activeTenantName } = useTenantContext();
  const [dateFrom, setDateFrom] = React.useState(() => isoDate(new Date(today.getTime() - 29 * 24 * 60 * 60 * 1000)));
  const [dateTo, setDateTo] = React.useState(() => isoDate(today));
  const [channel, setChannel] = React.useState("__all__");
  const [feature, setFeature] = React.useState("__all__");
  const [scope, setScope] = React.useState<"tenant" | "master">("tenant");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [dailyRows, setDailyRows] = React.useState<DailyRow[]>([]);
  const [conversationRows, setConversationRows] = React.useState<ConversationRow[]>([]);
  const [modelRows, setModelRows] = React.useState<ModelRow[]>([]);
  const [projectRows, setProjectRows] = React.useState<ProjectRow[]>([]);
  const [assistantRows, setAssistantRows] = React.useState<AssistantRow[]>([]);

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

      const conversationParams = new URLSearchParams(commonDaily);
      conversationParams.set("limit", "20");

      const [daily, conversations, models, projects, assistants] = await Promise.all([
        fetchRows<DailyRow>(dailyBasePath, commonDaily),
        fetchRows<ConversationRow>(conversationsBasePath, conversationParams),
        fetchRows<ModelRow>(modelsBasePath, commonMonthly),
        fetchRows<ProjectRow>(projectsBasePath, commonMonthly),
        fetchRows<AssistantRow>(assistantsBasePath, commonMonthly),
      ]);

      setDailyRows(daily);
      setConversationRows(conversations);
      setModelRows(models);
      setProjectRows(projects);
      setAssistantRows(assistants);
    } catch (fetchError) {
      console.error("[openai-costs] fetch failed", fetchError);
      setError(fetchError instanceof Error ? fetchError.message : "No se pudieron cargar los costos OpenAI.");
    } finally {
      setLoading(false);
    }
  }, [activeTenantId, channel, dateFrom, dateTo, feature, permissionContext.es_admin, permissionContext.es_owner, permissionContext.organizacion_id, scope]);

  const masterScopeEnabled = canUseMasterScope(
    permissionContext.organizacion_id,
    permissionContext.es_owner,
    permissionContext.es_admin,
  );

  React.useEffect(() => {
    void load();
  }, [load]);

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
        <CardContent className="flex flex-col gap-3 lg:flex-row lg:items-end">
          {masterScopeEnabled ? (
            <div className="grid gap-2">
              <label className="text-xs font-medium text-muted-foreground">Alcance</label>
              <Select value={scope} onValueChange={(value) => setScope(value as "tenant" | "master")}>
                <SelectTrigger className="w-full lg:w-[180px]">
                  <SelectValue placeholder="Tenant actual" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="tenant">Tenant actual</SelectItem>
                  <SelectItem value="master">Master global</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ) : null}
          <div className="grid gap-2">
            <label className="text-xs font-medium text-muted-foreground">Desde</label>
            <Input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} className="w-full lg:w-[180px]" />
          </div>
          <div className="grid gap-2">
            <label className="text-xs font-medium text-muted-foreground">Hasta</label>
            <Input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} className="w-full lg:w-[180px]" />
          </div>
          <div className="grid gap-2">
            <label className="text-xs font-medium text-muted-foreground">Canal</label>
            <Select value={channel} onValueChange={setChannel}>
              <SelectTrigger className="w-full lg:w-[200px]">
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
          <div className="grid gap-2">
            <label className="text-xs font-medium text-muted-foreground">Feature</label>
            <Select value={feature} onValueChange={setFeature}>
              <SelectTrigger className="w-full lg:w-[220px]">
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
          <Button type="button" variant="outline" onClick={() => void load()} disabled={loading}>
            {loading ? "Actualizando..." : "Actualizar"}
          </Button>
          {scope === "master" && activeTenantId ? (
            <Badge variant="outline">Tenant filtro: {activeTenantName ?? shortId(activeTenantId)}</Badge>
          ) : null}
          {totals.missingPricing > 0 ? <Badge variant="secondary">Pricing faltante: {totals.missingPricing}</Badge> : null}
        </CardContent>
      </Card>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Costo total" value={formatUsd(totals.cost)} />
        <MetricCard label="Requests" value={formatInt(totals.requests)} />
        <MetricCard label="Tokens" value={formatInt(totals.tokens)} />
        <MetricCard label="Conversaciones" value={formatInt(totals.conversations)} />
      </div>

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
                  dailyRows.slice(0, 12).map((row) => (
                    <TableRow key={`${row.usage_date}-${row.channel}-${row.openai_model_family}-${row.feature}`}>
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
                  projectRows.slice(0, 12).map((row) => (
                    <TableRow key={`${row.usage_month}-${row.openai_project_key}`}> 
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
                  modelRows.slice(0, 12).map((row) => (
                    <TableRow key={`${row.usage_month}-${row.channel}-${row.openai_model_family}`}> 
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
                  assistantRows.slice(0, 12).map((row) => (
                    <TableRow key={`${row.usage_month}-${row.channel}-${row.assistant_kind}-${row.assistant_ref ?? "null"}`}>
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
