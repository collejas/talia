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
