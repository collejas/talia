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
