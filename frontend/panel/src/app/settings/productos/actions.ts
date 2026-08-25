"use server";

import { revalidatePath } from "next/cache";

import { callCrmApi, type CrmResult } from "@/lib/api/crm";

type CrmRow = Record<string, unknown>;

function normalizeMetadata(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object") {
    return value as Record<string, unknown>;
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (typeof parsed === "object" && parsed !== null) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // fall through
    }
  }
  return {};
}

function normalizeString(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
  }
  return null;
}

function normalizeBoolean(value: unknown, fallback = true): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    const lowered = value.toLowerCase();
    if (["true", "1", "t", "yes", "si"].includes(lowered)) {
      return true;
    }
    if (["false", "0", "f", "no"].includes(lowered)) {
      return false;
    }
  }
  return fallback;
}

function extractMediaUrl(metadata: Record<string, unknown> | null | undefined): string | null {
  if (!metadata) {
    return null;
  }
  const media = metadata.media;
  if (!Array.isArray(media)) {
    return null;
  }
  const candidates = [...media].sort((a, b) => {
    const pa = typeof a === "object" && a && "predeterminada" in a ? Boolean((a as Record<string, unknown>).predeterminada) : false;
    const pb = typeof b === "object" && b && "predeterminada" in b ? Boolean((b as Record<string, unknown>).predeterminada) : false;
    return Number(pb) - Number(pa);
  });
  for (const entry of candidates) {
    if (entry && typeof entry === "object") {
      const url = (entry as Record<string, unknown>).url;
      if (typeof url === "string" && url.trim()) {
        return url.trim();
      }
    }
  }
  return null;
}

async function fetchCrmRows(path: string, params: Record<string, string | undefined>): Promise<CrmRow[]> {
  const response = await callCrmApi<CrmRow[]>(path, { searchParams: params });
  if (!response.ok || !Array.isArray(response.data)) {
    if (!response.ok) {
      console.warn(`[crm] ${path} failed`, response.error, response.status);
    } else {
      console.warn(`[crm] ${path} returned empty data`);
    }
    return [];
  }
  return response.data;
}

export type LineaDeNegocio = {
  id: string;
  codigo: string | null;
  nombre: string;
  descripcion: string | null;
  activo: boolean;
  metadata: Record<string, unknown>;
  creadoEn: string;
  actualizadoEn: string;
  fotoUrl: string | null;
};

export type FamiliaProducto = {
  id: string;
  codigo: string | null;
  lineaId: string | null;
  nombre: string;
  descripcion: string | null;
  activo: boolean;
  metadata: Record<string, unknown>;
  creadoEn: string;
  actualizadoEn: string;
  fotoUrl: string | null;
};

export type ModeloProducto = {
  id: string;
  codigo: string | null;
  nombre: string;
  descripcion: string | null;
  activo: boolean;
  metadata: Record<string, unknown>;
  creadoEn: string;
  actualizadoEn: string;
  fotoUrl: string | null;
  familiaId: string | null;
};

export type UnidadMedida = {
  id: string;
  codigo: string;
  nombre: string;
  simbolo: string | null;
  activo: boolean;
  esBase: boolean;
  creadoEn: string;
  actualizadoEn: string;
};

const transformLinea = (row: CrmRow): LineaDeNegocio => {
  const meta = normalizeMetadata(row.metadata);
  return {
    id: String(row.id ?? ""),
    codigo: normalizeString(row.codigo),
    nombre: normalizeString(row.nombre) ?? "Sin nombre",
    descripcion: normalizeString(row.descripcion),
    activo: normalizeBoolean(row.activo, true),
    metadata: meta,
    creadoEn: String(row.creado_en ?? row.creadoEn ?? ""),
    actualizadoEn: String(row.actualizado_en ?? row.actualizadoEn ?? ""),
    fotoUrl: extractMediaUrl(meta),
  };
};

const transformFamilia = (row: CrmRow): FamiliaProducto => {
  const meta = normalizeMetadata(row.metadata);
  return {
    id: String(row.id ?? ""),
    codigo: normalizeString(row.codigo),
    lineaId: normalizeString(row.linea_id ?? row.lineaId),
    nombre: normalizeString(row.nombre) ?? "Sin nombre",
    descripcion: normalizeString(row.descripcion),
    activo: normalizeBoolean(row.activo, true),
    metadata: meta,
    creadoEn: String(row.creado_en ?? row.creadoEn ?? ""),
    actualizadoEn: String(row.actualizado_en ?? row.actualizadoEn ?? ""),
    fotoUrl: extractMediaUrl(meta),
  };
};

const transformModelo = (row: CrmRow): ModeloProducto => {
  const meta = normalizeMetadata(row.metadata);
  return {
    id: String(row.id ?? ""),
    codigo: normalizeString(row.codigo),
    nombre: normalizeString(row.nombre) ?? "Sin nombre",
    descripcion: normalizeString(row.descripcion),
    activo: normalizeBoolean(row.activo, true),
    metadata: meta,
    creadoEn: String(row.creado_en ?? row.creadoEn ?? ""),
    actualizadoEn: String(row.actualizado_en ?? row.actualizadoEn ?? ""),
    fotoUrl: extractMediaUrl(meta),
    familiaId: normalizeString(row.familia_id ?? row.familiaId) ?? null,
  };
};

const transformUnidadMedida = (row: CrmRow): UnidadMedida => {
  return {
    id: String(row.id ?? ""),
    codigo: normalizeString(row.codigo) ?? "unidad",
    nombre: normalizeString(row.nombre) ?? "Unidad",
    simbolo: normalizeString(row.simbolo),
    activo: normalizeBoolean(row.activo, true),
    esBase: normalizeBoolean(row.es_base, false),
    creadoEn: String(row.creado_en ?? row.creadoEn ?? ""),
    actualizadoEn: String(row.actualizado_en ?? row.actualizadoEn ?? ""),
  };
};

type FetchOptions = {
  includeInactive?: boolean;
  search?: string | null;
  limit?: number;
};

export async function fetchLineasDeNegocio(options?: FetchOptions): Promise<LineaDeNegocio[]> {
  const response = await fetchCrmRows("/crm/productos/lineas", {
    include_inactive: options?.includeInactive ? "true" : undefined,
    search: options?.search ?? undefined,
    limit: options?.limit ? String(options.limit) : undefined,
  });
  return response.map(transformLinea);
}

export async function fetchFamiliasDeProductos(options?: FetchOptions & { lineaId?: string | null }): Promise<FamiliaProducto[]> {
  const response = await fetchCrmRows("/crm/productos/familias", {
    include_inactive: options?.includeInactive ? "true" : undefined,
    search: options?.search ?? undefined,
    linea_id: options?.lineaId ?? undefined,
    limit: options?.limit ? String(options.limit) : undefined,
  });
  return response.map(transformFamilia);
}

export async function fetchModelosProductos(options?: FetchOptions): Promise<ModeloProducto[]> {
  const response = await fetchCrmRows("/crm/productos/modelos", {
    include_inactive: options?.includeInactive ? "true" : undefined,
    search: options?.search ?? undefined,
    limit: options?.limit ? String(options.limit) : undefined,
  });
  return response.map(transformModelo);
}

export async function fetchUnidadesMedida(options?: FetchOptions): Promise<UnidadMedida[]> {
  const response = await fetchCrmRows("/crm/productos/unidades-medida", {
    include_inactive: options?.includeInactive ? "true" : undefined,
    search: options?.search ?? undefined,
    limit: options?.limit ? String(options.limit) : undefined,
  });
  return response.map(transformUnidadMedida);
}

type CrmPayload = Record<string, unknown>

function normalizeResponseRow(response: CrmResult<CrmRow>): CrmRow {
  if (!response.ok) {
    throw new Error(response.error ?? "Respuesta inválida del CRM");
  }
  if (!response.data || typeof response.data !== "object") {
    throw new Error("Respuesta inválida del CRM");
  }
  return response.data as CrmRow;
}

export type LineaFormInput = {
  codigo?: string | null
  nombre: string
  descripcion?: string | null
  activo?: boolean
  metadata?: Record<string, unknown> | null
}

export async function createLineaDeNegocio(input: LineaFormInput): Promise<LineaDeNegocio> {
  const response = await callCrmApi<CrmRow>("/crm/productos/lineas", {
    method: "POST",
    body: {
      nombre: input.nombre,
      codigo: input.codigo ?? null,
      descripcion: input.descripcion ?? null,
      activo: input.activo ?? true,
      metadata: input.metadata ?? {},
    },
  })
  const row = normalizeResponseRow(response)
  return transformLinea(row)
}

export async function updateLineaDeNegocio(
  id: string,
  input: LineaFormInput,
): Promise<LineaDeNegocio> {
  if (!id) {
    throw new Error("Falta el identificador de la línea")
  }
  const payload: CrmPayload = {}
  if (input.nombre) payload.nombre = input.nombre
  if (input.codigo !== undefined) payload.codigo = input.codigo
  if (input.descripcion !== undefined) payload.descripcion = input.descripcion
  if (input.activo !== undefined) payload.activo = input.activo
  if (input.metadata !== undefined) payload.metadata = input.metadata
  if (!Object.keys(payload).length) {
    throw new Error("No hay cambios para guardar")
  }
  const response = await callCrmApi<CrmRow>(`/crm/productos/lineas/${id}`, {
    method: "PATCH",
    body: payload,
  })
  const row = normalizeResponseRow(response)
  return transformLinea(row)
}

export type FamiliaFormInput = {
  codigo?: string | null
  nombre: string
  lineaId: string
  descripcion?: string | null
  activo?: boolean
  metadata?: Record<string, unknown> | null
}

export async function createFamiliaProducto(input: FamiliaFormInput): Promise<FamiliaProducto> {
  const response = await callCrmApi<CrmRow>("/crm/productos/familias", {
    method: "POST",
    body: {
      nombre: input.nombre,
      codigo: input.codigo ?? null,
      descripcion: input.descripcion ?? null,
      linea_id: input.lineaId,
      activo: input.activo ?? true,
      metadata: input.metadata ?? {},
    },
  })
  const row = normalizeResponseRow(response)
  return transformFamilia(row)
}

export async function updateFamiliaProducto(
  id: string,
  input: FamiliaFormInput,
): Promise<FamiliaProducto> {
  if (!id) {
    throw new Error("Falta el identificador de la familia")
  }
  const payload: CrmPayload = {}
  if (input.nombre) payload.nombre = input.nombre
  if (input.codigo !== undefined) payload.codigo = input.codigo
  if (input.descripcion !== undefined) payload.descripcion = input.descripcion
  if (input.lineaId) payload.linea_id = input.lineaId
  if (input.activo !== undefined) payload.activo = input.activo
  if (input.metadata !== undefined) payload.metadata = input.metadata
  if (!Object.keys(payload).length) {
    throw new Error("No hay cambios para guardar")
  }
  const response = await callCrmApi<CrmRow>(`/crm/productos/familias/${id}`, {
    method: "PATCH",
    body: payload,
  })
  const row = normalizeResponseRow(response)
  return transformFamilia(row)
}

export type ModeloFormInput = {
  codigo?: string | null
  nombre: string
  descripcion?: string | null
  activo?: boolean
  metadata?: Record<string, unknown> | null
  familiaId?: string | null
}

export async function createModeloProducto(input: ModeloFormInput): Promise<ModeloProducto> {
  const response = await callCrmApi<CrmRow>("/crm/productos/modelos", {
    method: "POST",
    body: {
      nombre: input.nombre,
      codigo: input.codigo ?? null,
      descripcion: input.descripcion ?? null,
      activo: input.activo ?? true,
      metadata: input.metadata ?? {},
      familia_id: input.familiaId ?? null,
    },
  })
  const row = normalizeResponseRow(response)
  return transformModelo(row)
}

export async function updateModeloProducto(
  id: string,
  input: ModeloFormInput,
): Promise<ModeloProducto> {
  if (!id) {
    throw new Error("Falta el identificador del modelo")
  }
  const payload: CrmPayload = {}
  if (input.nombre) payload.nombre = input.nombre
  if (input.codigo !== undefined) payload.codigo = input.codigo
  if (input.descripcion !== undefined) payload.descripcion = input.descripcion
  if (input.activo !== undefined) payload.activo = input.activo
  if (input.metadata !== undefined) payload.metadata = input.metadata
  if (input.familiaId !== undefined) payload.familia_id = input.familiaId
  if (!Object.keys(payload).length) {
    throw new Error("No hay cambios para guardar")
  }
  const response = await callCrmApi<CrmRow>(`/crm/productos/modelos/${id}`, {
    method: "PATCH",
    body: payload,
  })
  const row = normalizeResponseRow(response)
  return transformModelo(row)
}

export async function deleteLineaDeNegocio(id: string): Promise<void> {
  if (!id) {
    throw new Error("Falta el identificador de la línea.")
  }
  const response = await callCrmApi(`/crm/productos/lineas/${id}`, {
    method: "DELETE",
  })
  if (!response.ok) {
    throw new Error(response.error || "No se pudo eliminar la línea.")
  }
}

export async function deleteFamiliaProducto(id: string): Promise<void> {
  if (!id) {
    throw new Error("Falta el identificador de la familia.")
  }
  const response = await callCrmApi(`/crm/productos/familias/${id}`, {
    method: "DELETE",
  })
  if (!response.ok) {
    throw new Error(response.error || "No se pudo eliminar la familia.")
  }
}

export type DeleteModeloResult = { ok: true } | { ok: false; error: string }

export type BulkDeleteResult = {
  requested: number
  deleted: number
  failed: number
  deleted_ids: string[]
  errors: { id: string; detail: string }[]
}

export async function deleteModeloProducto(id: string): Promise<DeleteModeloResult> {
  if (!id) {
    throw new Error("Falta el identificador del modelo.")
  }
  const response = await callCrmApi(`/crm/productos/modelos/${id}`, {
    method: "DELETE",
  })
  if (!response.ok) {
    return {
      ok: false,
      error: response.error || "No se pudo eliminar el modelo.",
    }
  }
  return { ok: true }
}

async function callBulkDelete(path: string, ids: string[]): Promise<BulkDeleteResult> {
  if (!ids.length) {
    return { requested: 0, deleted: 0, failed: 0, deleted_ids: [], errors: [] }
  }
  const response = await callCrmApi<BulkDeleteResult>(path, {
    method: "POST",
    body: { ids },
  })
  if (!response.ok) {
    throw new Error(response.error || "No se pudo ejecutar el borrado masivo.")
  }
  const payload = response.data
  if (!payload || typeof payload !== "object") {
    throw new Error("No se pudo ejecutar el borrado masivo.")
  }
  return {
    requested: Number(payload.requested ?? ids.length),
    deleted: Number(payload.deleted ?? 0),
    failed: Number(payload.failed ?? 0),
    deleted_ids: Array.isArray(payload.deleted_ids) ? payload.deleted_ids.map(String) : [],
    errors: Array.isArray(payload.errors)
      ? payload.errors.map((entry) => ({
          id: String(entry.id),
          detail: String(entry.detail ?? "Error desconocido"),
        }))
      : [],
  }
}

export async function deleteLineasDeNegocioBulk(ids: string[]): Promise<BulkDeleteResult> {
  return callBulkDelete("/crm/productos/lineas/bulk-delete", ids)
}

export async function deleteFamiliasProductoBulk(ids: string[]): Promise<BulkDeleteResult> {
  return callBulkDelete("/crm/productos/familias/bulk-delete", ids)
}

export async function deleteModelosProductoBulk(ids: string[]): Promise<BulkDeleteResult> {
  return callBulkDelete("/crm/productos/modelos/bulk-delete", ids)
}

export type UnidadMedidaFormInput = {
  codigo: string
  nombre: string
  simbolo?: string | null
  activo?: boolean
  esBase?: boolean
}

export async function createUnidadMedida(input: UnidadMedidaFormInput): Promise<UnidadMedida> {
  const response = await callCrmApi<CrmRow>("/crm/productos/unidades-medida", {
    method: "POST",
    body: {
      codigo: input.codigo,
      nombre: input.nombre,
      simbolo: input.simbolo ?? null,
      activo: input.activo ?? true,
      es_base: input.esBase ?? false,
    },
  })
  const row = normalizeResponseRow(response)
  return transformUnidadMedida(row)
}

export async function updateUnidadMedida(
  id: string,
  input: UnidadMedidaFormInput,
): Promise<UnidadMedida> {
  if (!id) {
    throw new Error("Falta el identificador de la unidad")
  }
  const payload: CrmPayload = {}
  if (input.codigo) payload.codigo = input.codigo
  if (input.nombre) payload.nombre = input.nombre
  if (input.simbolo !== undefined) payload.simbolo = input.simbolo
  if (input.activo !== undefined) payload.activo = input.activo
  if (input.esBase !== undefined) payload.es_base = input.esBase
  if (!Object.keys(payload).length) {
    throw new Error("No hay cambios para guardar")
  }
  const response = await callCrmApi<CrmRow>(`/crm/productos/unidades-medida/${id}`, {
    method: "PATCH",
    body: payload,
  })
  const row = normalizeResponseRow(response)
  return transformUnidadMedida(row)
}

export async function deleteUnidadMedida(id: string): Promise<void> {
  if (!id) {
    throw new Error("Falta el identificador de la unidad")
  }
  const response = await callCrmApi(`/crm/productos/unidades-medida/${id}`, {
    method: "DELETE",
  })
  if (!response.ok) {
    throw new Error(response.error || "No se pudo eliminar la unidad.")
  }
  revalidatePath("/settings/productos/unidades-medida")
}

export type CatalogVectorStoreStatus = {
  lastReindexAt: string | null
  lastReindexBy: string | null
  lastReindexChannel: string | null
  lastQueryAt: string | null
  lastQueryBy: string | null
  lastQueryChannel: string | null
}

export type CatalogVectorStoreMetricsBucket = {
  day: string
  tipo: string
  canal: string | null
  reason: string | null
  total: number
}

export type CatalogVectorStoreMetrics = {
  fromDate: string
  toDate: string
  totalEvents: number
  buckets: CatalogVectorStoreMetricsBucket[]
}

export type CatalogVectorAlertThresholds = {
  minQueryEvents30d: number
  fallbackRatioThreshold: number
  minFallbackEvents30d: number
  weeklyGrowthRatioThreshold: number
  minWeeklyQueries: number
}

export type CatalogVectorAlertThresholdsConfig = {
  globalThresholds: CatalogVectorAlertThresholds
  organizationThresholds: CatalogVectorAlertThresholds | null
  effectiveThresholds: CatalogVectorAlertThresholds
}

export type CatalogVectorAlertThresholdsHistoryEntry = {
  id: string
  scope: "global" | "organization" | string
  action: string
  changedBy: string | null
  changedByName: string | null
  createdAt: string
  targetOrganizacionId: string | null
  before: CatalogVectorAlertThresholds | null
  after: CatalogVectorAlertThresholds | null
}

function emptyCatalogMetrics(days: number): CatalogVectorStoreMetrics {
  const toDate = new Date()
  const fromDate = new Date()
  fromDate.setDate(toDate.getDate() - Math.max(days, 1))
  return {
    fromDate: fromDate.toISOString().slice(0, 10),
    toDate: toDate.toISOString().slice(0, 10),
    totalEvents: 0,
    buckets: [],
  }
}

export async function fetchCatalogVectorStoreStatus(): Promise<CatalogVectorStoreStatus> {
  const response = await callCrmApi<Record<string, unknown>>("/crm/catalog/vector-store/status")
  if (!response.ok || !response.data || typeof response.data !== "object") {
    if (!response.ok) {
      console.warn("[crm] /crm/catalog/vector-store/status failed", response.error, response.status)
    }
    return {
      lastReindexAt: null,
      lastReindexBy: null,
      lastReindexChannel: null,
      lastQueryAt: null,
      lastQueryBy: null,
      lastQueryChannel: null,
    }
  }
  const payload = response.data
  return {
    lastReindexAt: normalizeString(payload.last_reindex_at ?? payload.lastReindexAt),
    lastReindexBy: normalizeString(payload.last_reindex_by ?? payload.lastReindexBy),
    lastReindexChannel: normalizeString(payload.last_reindex_channel ?? payload.lastReindexChannel),
    lastQueryAt: normalizeString(payload.last_query_at ?? payload.lastQueryAt),
    lastQueryBy: normalizeString(payload.last_query_by ?? payload.lastQueryBy),
    lastQueryChannel: normalizeString(payload.last_query_channel ?? payload.lastQueryChannel),
  }
}

type FetchCatalogVectorStoreMetricsOptions = {
  days?: number
  tipo?: "query" | "reindex"
  canal?: string | null
  limit?: number
}

export async function fetchCatalogVectorStoreMetrics(
  options?: FetchCatalogVectorStoreMetricsOptions,
): Promise<CatalogVectorStoreMetrics> {
  const days = Math.min(Math.max(options?.days ?? 30, 1), 90)
  const limit = Math.min(Math.max(options?.limit ?? 2000, 100), 5000)
  const response = await callCrmApi<Record<string, unknown>>("/crm/catalog/vector-store/metrics", {
    searchParams: {
      days,
      tipo: options?.tipo,
      canal: options?.canal ?? undefined,
      limit,
    },
  })
  if (!response.ok || !response.data || typeof response.data !== "object") {
    if (!response.ok) {
      console.warn("[crm] /crm/catalog/vector-store/metrics failed", response.error, response.status)
    }
    return emptyCatalogMetrics(days)
  }
  const payload = response.data
  const rawBuckets = Array.isArray(payload.buckets) ? payload.buckets : []
  const buckets: CatalogVectorStoreMetricsBucket[] = rawBuckets
    .filter((entry) => entry && typeof entry === "object")
    .map((entry) => {
      const item = entry as Record<string, unknown>
      return {
        day: normalizeString(item.day) ?? "unknown",
        tipo: normalizeString(item.tipo) ?? "unknown",
        canal: normalizeString(item.canal),
        reason: normalizeString(item.reason),
        total: Number(item.total ?? 0),
      }
    })
  return {
    fromDate: normalizeString(payload.from_date ?? payload.fromDate) ?? emptyCatalogMetrics(days).fromDate,
    toDate: normalizeString(payload.to_date ?? payload.toDate) ?? emptyCatalogMetrics(days).toDate,
    totalEvents: Number(payload.total_events ?? payload.totalEvents ?? 0),
    buckets,
  }
}

function normalizeThresholds(raw: unknown): CatalogVectorAlertThresholds {
  const payload = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>
  return {
    minQueryEvents30d: Number(payload.min_query_events_30d ?? payload.minQueryEvents30d ?? 250),
    fallbackRatioThreshold: Number(payload.fallback_ratio_threshold ?? payload.fallbackRatioThreshold ?? 0.35),
    minFallbackEvents30d: Number(payload.min_fallback_events_30d ?? payload.minFallbackEvents30d ?? 20),
    weeklyGrowthRatioThreshold: Number(
      payload.weekly_growth_ratio_threshold ?? payload.weeklyGrowthRatioThreshold ?? 0.4,
    ),
    minWeeklyQueries: Number(payload.min_weekly_queries ?? payload.minWeeklyQueries ?? 20),
  }
}

function defaultThresholdsConfig(): CatalogVectorAlertThresholdsConfig {
  const defaults = normalizeThresholds({})
  return {
    globalThresholds: defaults,
    organizationThresholds: null,
    effectiveThresholds: defaults,
  }
}

export async function fetchCatalogVectorStoreAlertThresholds(): Promise<CatalogVectorAlertThresholdsConfig> {
  const response = await callCrmApi<Record<string, unknown>>("/crm/catalog/vector-store/alert-thresholds")
  if (!response.ok || !response.data || typeof response.data !== "object") {
    if (!response.ok) {
      console.warn("[crm] /crm/catalog/vector-store/alert-thresholds failed", response.error, response.status)
    }
    return defaultThresholdsConfig()
  }
  const payload = response.data
  const orgRaw = payload.organization_thresholds ?? payload.organizationThresholds
  return {
    globalThresholds: normalizeThresholds(payload.global_thresholds ?? payload.globalThresholds),
    organizationThresholds: orgRaw ? normalizeThresholds(orgRaw) : null,
    effectiveThresholds: normalizeThresholds(payload.effective_thresholds ?? payload.effectiveThresholds),
  }
}

function parseThresholdNumber(formData: FormData, key: string): number {
  const raw = formData.get(key)
  const value = typeof raw === "string" ? Number(raw.trim()) : Number(raw)
  if (!Number.isFinite(value)) {
    throw new Error(`Valor inválido para ${key}`)
  }
  return value
}

function buildThresholdPayloadFromForm(formData: FormData): Record<string, number> {
  return {
    min_query_events_30d: Math.max(1, Math.round(parseThresholdNumber(formData, "min_query_events_30d"))),
    fallback_ratio_threshold: Math.max(0, Math.min(1, parseThresholdNumber(formData, "fallback_ratio_threshold"))),
    min_fallback_events_30d: Math.max(1, Math.round(parseThresholdNumber(formData, "min_fallback_events_30d"))),
    weekly_growth_ratio_threshold: Math.max(0, parseThresholdNumber(formData, "weekly_growth_ratio_threshold")),
    min_weekly_queries: Math.max(1, Math.round(parseThresholdNumber(formData, "min_weekly_queries"))),
  }
}

export async function saveCatalogVectorStoreOrgThresholdsAction(formData: FormData): Promise<void> {
  const response = await callCrmApi("/crm/catalog/vector-store/alert-thresholds", {
    method: "PUT",
    body: buildThresholdPayloadFromForm(formData),
  })
  if (!response.ok) {
    throw new Error(response.error || "No se pudieron guardar los umbrales por organización.")
  }
  revalidatePath("/settings/productos/observabilidad")
}

export async function saveCatalogVectorStoreGlobalThresholdsAction(formData: FormData): Promise<void> {
  const response = await callCrmApi("/crm/catalog/vector-store/alert-thresholds/global", {
    method: "PUT",
    body: buildThresholdPayloadFromForm(formData),
  })
  if (!response.ok) {
    throw new Error(response.error || "No se pudieron guardar los umbrales globales.")
  }
  revalidatePath("/settings/productos/observabilidad")
}

export async function clearCatalogVectorStoreOrgThresholdsAction(): Promise<void> {
  const response = await callCrmApi("/crm/catalog/vector-store/alert-thresholds", {
    method: "DELETE",
  })
  if (!response.ok) {
    throw new Error(response.error || "No se pudo limpiar el override de umbrales por organización.")
  }
  revalidatePath("/settings/productos/observabilidad")
}

export async function fetchIsPlatformAdmin(): Promise<boolean> {
  const response = await callCrmApi<Record<string, unknown>>("/admin/me/platform-admin", {
    organizacionId: null,
  })
  if (!response.ok || !response.data || typeof response.data !== "object") {
    return false
  }
  const payload = response.data
  const value = payload.is_platform_admin ?? payload.isPlatformAdmin
  return value === true
}

export async function fetchCatalogVectorStoreAlertThresholdsHistory(options?: {
  scope?: "all" | "organization" | "global"
  limit?: number
}): Promise<CatalogVectorAlertThresholdsHistoryEntry[]> {
  const limit = Math.min(Math.max(options?.limit ?? 30, 1), 200)
  const response = await callCrmApi<Record<string, unknown>[]>(
    "/crm/catalog/vector-store/alert-thresholds/history",
    {
      searchParams: {
        scope: options?.scope ?? "all",
        limit,
      },
    },
  )
  if (!response.ok || !Array.isArray(response.data)) {
    if (!response.ok) {
      console.warn(
        "[crm] /crm/catalog/vector-store/alert-thresholds/history failed",
        response.error,
        response.status,
      )
    }
    return []
  }
  return response.data
    .filter((entry) => entry && typeof entry === "object")
    .map((entry) => {
      const row = entry as Record<string, unknown>
      return {
        id: String(row.id ?? ""),
        scope: String(row.scope ?? "organization"),
        action: String(row.action ?? "update"),
        changedBy: normalizeString(row.changed_by ?? row.changedBy),
        changedByName: normalizeString(row.changed_by_name ?? row.changedByName),
        createdAt: String(row.created_at ?? row.createdAt ?? ""),
        targetOrganizacionId: normalizeString(row.target_organizacion_id ?? row.targetOrganizacionId),
        before: row.before ? normalizeThresholds(row.before) : null,
        after: row.after ? normalizeThresholds(row.after) : null,
      }
    })
}
