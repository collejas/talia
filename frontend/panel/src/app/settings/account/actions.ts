"use server"

import { revalidatePath } from "next/cache"

import { callCrmApi, type CrmResult } from "@/lib/api/crm"
import { fetchRolesDirectory, fetchUsersDirectory } from "@/lib/settings/hr-directory"

export type PriceList = {
  id: string
  organizacionId: string
  nombre: string
  activo: boolean
  creadoEn: string
  actualizadoEn: string
}

export type PriceListPermissions = {
  roleIds: string[]
  userIds: string[]
  employeeUserIds: string[]
}

export type PriceListPermissionOptions = {
  roles: { id: string; nombre: string; codigo: string }[]
  usuarios: { id: string; nombre: string; correo: string; esEmpleado: boolean }[]
}

export type DiscountLimit = {
  id: string
  organizacionId: string
  tipoPrecio: "base" | "lista"
  listaPrecioId: string | null
  rolId: string | null
  usuarioId: string | null
  empleadoUsuarioId: string | null
  descuentoMaximoPorcentaje: number
  activo: boolean
}

export type DiscountLimitInput = {
  tipo_precio: "base" | "lista"
  lista_precio_id: string | null
  rol_id: string | null
  usuario_id: string | null
  empleado_usuario_id: string | null
  descuento_maximo_porcentaje: number
  activo: boolean
}

type CrmRow = Record<string, unknown>

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

function normalizeBoolean(value: unknown, fallback = true): boolean {
  if (typeof value === "boolean") return value
  if (typeof value === "string") return ["true", "1", "t", "yes", "si"].includes(value.toLowerCase())
  return fallback
}

function transformPriceList(row: CrmRow): PriceList {
  return {
    id: normalizeString(row.id),
    organizacionId: normalizeString(row.organizacion_id ?? row.organizacionId),
    nombre: normalizeString(row.nombre),
    activo: normalizeBoolean(row.activo),
    creadoEn: normalizeString(row.creado_en ?? row.creadoEn),
    actualizadoEn: normalizeString(row.actualizado_en ?? row.actualizadoEn),
  }
}

function transformDiscountLimit(row: CrmRow): DiscountLimit {
  return {
    id: normalizeString(row.id),
    organizacionId: normalizeString(row.organizacion_id),
    tipoPrecio: row.tipo_precio === "lista" ? "lista" : "base",
    listaPrecioId: normalizeString(row.lista_precio_id) || null,
    rolId: normalizeString(row.rol_id) || null,
    usuarioId: normalizeString(row.usuario_id) || null,
    empleadoUsuarioId: normalizeString(row.empleado_usuario_id) || null,
    descuentoMaximoPorcentaje: Number(row.descuento_maximo_porcentaje ?? 0),
    activo: normalizeBoolean(row.activo),
  }
}

function getErrorMessage(response: CrmResult<unknown>, fallback: string): string {
  return response.ok ? fallback : response.error || fallback
}

export async function fetchPriceLists(): Promise<PriceList[]> {
  const response = await callCrmApi<CrmRow[]>("/crm/catalog/price-lists", {
    searchParams: { include_inactive: true },
    withUserToken: true,
  })
  if (!response.ok || !Array.isArray(response.data)) {
    console.warn("[crm] /crm/catalog/price-lists failed", response.ok ? "invalid_data" : response.error)
    return []
  }
  return response.data.map(transformPriceList).filter((item) => item.id && item.nombre)
}

export async function createPriceListAction(input: { nombre: string }): Promise<PriceList> {
  const nombre = input.nombre.trim()
  if (!nombre) throw new Error("Escribe el nombre de la lista de precios.")
  const response = await callCrmApi<CrmRow>("/crm/catalog/price-lists", {
    method: "POST",
    body: { nombre, activo: true },
    withUserToken: true,
  })
  if (!response.ok || !response.data) throw new Error(getErrorMessage(response, "No se pudo crear la lista de precios."))
  revalidatePath("/settings/account")
  return transformPriceList(response.data)
}

export async function updatePriceListAction(
  id: string,
  input: { nombre: string; activo?: boolean },
): Promise<PriceList> {
  const nombre = input.nombre.trim()
  if (!id) throw new Error("Falta el identificador de la lista.")
  if (!nombre) throw new Error("Escribe el nombre de la lista de precios.")
  const response = await callCrmApi<CrmRow>(`/crm/catalog/price-lists/${id}`, {
    method: "PATCH",
    body: { nombre, ...(input.activo === undefined ? {} : { activo: input.activo }) },
    withUserToken: true,
  })
  if (!response.ok || !response.data) throw new Error(getErrorMessage(response, "No se pudo actualizar la lista de precios."))
  revalidatePath("/settings/account")
  return transformPriceList(response.data)
}

export async function deactivatePriceListAction(id: string): Promise<PriceList> {
  if (!id) throw new Error("Falta el identificador de la lista.")
  const response = await callCrmApi<CrmRow>(`/crm/catalog/price-lists/${id}`, {
    method: "DELETE",
    withUserToken: true,
  })
  if (!response.ok || !response.data) throw new Error(getErrorMessage(response, "No se pudo desactivar la lista de precios."))
  revalidatePath("/settings/account")
  return transformPriceList(response.data)
}

export async function fetchPriceListPermissions(id: string): Promise<PriceListPermissions> {
  const response = await callCrmApi<CrmRow>(`/crm/catalog/price-lists/${id}/permissions`, {
    withUserToken: true,
  })
  if (!response.ok || !response.data) {
    throw new Error(getErrorMessage(response, "No se pudieron consultar los permisos de la lista."))
  }
  return {
    roleIds: Array.isArray(response.data.role_ids) ? response.data.role_ids.filter((value): value is string => typeof value === "string") : [],
    userIds: Array.isArray(response.data.user_ids) ? response.data.user_ids.filter((value): value is string => typeof value === "string") : [],
    employeeUserIds: Array.isArray(response.data.employee_user_ids)
      ? response.data.employee_user_ids.filter((value): value is string => typeof value === "string")
      : [],
  }
}

export async function fetchDiscountLimits(target: { tipoPrecio: "base" | "lista"; listaPrecioId?: string }): Promise<DiscountLimit[]> {
  const path = target.tipoPrecio === "base"
    ? "/crm/catalog/base-price/discount-limits"
    : `/crm/catalog/price-lists/${target.listaPrecioId}/discount-limits`
  const response = await callCrmApi<{ values?: CrmRow[] }>(path, { withUserToken: true })
  if (!response.ok || !response.data || !Array.isArray(response.data.values)) {
    throw new Error(getErrorMessage(response, "No se pudieron consultar los límites de descuento."))
  }
  return response.data.values.map(transformDiscountLimit)
}

export async function updateDiscountLimitsAction(
  target: { tipoPrecio: "base" | "lista"; listaPrecioId?: string },
  values: DiscountLimitInput[],
): Promise<DiscountLimit[]> {
  const path = target.tipoPrecio === "base"
    ? "/crm/catalog/base-price/discount-limits"
    : `/crm/catalog/price-lists/${target.listaPrecioId}/discount-limits`
  const response = await callCrmApi<{ values?: CrmRow[] }>(path, {
    method: "PUT",
    body: { values },
    withUserToken: true,
  })
  if (!response.ok || !response.data || !Array.isArray(response.data.values)) {
    throw new Error(getErrorMessage(response, "No se pudieron guardar los límites de descuento."))
  }
  revalidatePath("/settings/account")
  return response.data.values.map(transformDiscountLimit)
}

export async function updatePriceListPermissionsAction(
  id: string,
  permissions: PriceListPermissions,
): Promise<PriceListPermissions> {
  const response = await callCrmApi<CrmRow>(`/crm/catalog/price-lists/${id}/permissions`, {
    method: "PUT",
    body: {
      role_ids: permissions.roleIds,
      user_ids: permissions.userIds,
      employee_user_ids: permissions.employeeUserIds,
    },
    withUserToken: true,
  })
  if (!response.ok || !response.data) {
    throw new Error(getErrorMessage(response, "No se pudieron guardar los permisos de la lista."))
  }
  return {
    roleIds: Array.isArray(response.data.role_ids) ? response.data.role_ids.filter((value): value is string => typeof value === "string") : [],
    userIds: Array.isArray(response.data.user_ids) ? response.data.user_ids.filter((value): value is string => typeof value === "string") : [],
    employeeUserIds: Array.isArray(response.data.employee_user_ids)
      ? response.data.employee_user_ids.filter((value): value is string => typeof value === "string")
      : [],
  }
}

export async function fetchPriceListPermissionOptions(): Promise<PriceListPermissionOptions> {
  const [usersDirectory, rolesDirectory] = await Promise.all([fetchUsersDirectory(), fetchRolesDirectory()])
  return {
    roles: rolesDirectory.items.map((role) => ({ id: role.id, nombre: role.nombre, codigo: role.codigo })),
    usuarios: usersDirectory.items.map((user) => ({
      id: user.id,
      nombre: user.nombre,
      correo: user.correo,
      esEmpleado: Boolean(user.departamentoId || user.puestoId),
    })),
  }
}
