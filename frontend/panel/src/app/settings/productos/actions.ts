"use server";

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
  nombre: string;
  descripcion: string | null;
  activo: boolean;
  metadata: Record<string, unknown>;
  creadoEn: string;
  actualizadoEn: string;
  fotoUrl: string | null;
  familiaId: string | null;
};

const transformLinea = (row: CrmRow): LineaDeNegocio => {
  const meta = normalizeMetadata(row.metadata);
  return {
    id: String(row.id ?? ""),
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
