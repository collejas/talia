"use server";

import { callCrmApi } from "@/lib/api/crm";

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

async function fetchCrmRows(path: string, params: Record<string, string | undefined>): Promise<CrmRow[]> {
  const response = await callCrmApi<CrmRow[]>(path, { searchParams: params });
  if (!response.ok || !Array.isArray(response.data)) {
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
};

export type ModeloProducto = {
  id: string;
  nombre: string;
  descripcion: string | null;
  activo: boolean;
  metadata: Record<string, unknown>;
  creadoEn: string;
  actualizadoEn: string;
};

const transformLinea = (row: CrmRow): LineaDeNegocio => ({
  id: String(row.id ?? ""),
  nombre: normalizeString(row.nombre) ?? "Sin nombre",
  descripcion: normalizeString(row.descripcion),
  activo: normalizeBoolean(row.activo, true),
  metadata: normalizeMetadata(row.metadata),
  creadoEn: String(row.creado_en ?? row.creadoEn ?? ""),
  actualizadoEn: String(row.actualizado_en ?? row.actualizadoEn ?? ""),
});

const transformFamilia = (row: CrmRow): FamiliaProducto => ({
  id: String(row.id ?? ""),
  lineaId: normalizeString(row.linea_id ?? row.lineaId),
  nombre: normalizeString(row.nombre) ?? "Sin nombre",
  descripcion: normalizeString(row.descripcion),
  activo: normalizeBoolean(row.activo, true),
  metadata: normalizeMetadata(row.metadata),
  creadoEn: String(row.creado_en ?? row.creadoEn ?? ""),
  actualizadoEn: String(row.actualizado_en ?? row.actualizadoEn ?? ""),
});

const transformModelo = (row: CrmRow): ModeloProducto => ({
  id: String(row.id ?? ""),
  nombre: normalizeString(row.nombre) ?? "Sin nombre",
  descripcion: normalizeString(row.descripcion),
  activo: normalizeBoolean(row.activo, true),
  metadata: normalizeMetadata(row.metadata),
  creadoEn: String(row.creado_en ?? row.creadoEn ?? ""),
  actualizadoEn: String(row.actualizado_en ?? row.actualizadoEn ?? ""),
});

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
