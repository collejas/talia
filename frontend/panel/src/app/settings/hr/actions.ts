"use server"
import { revalidatePath } from "next/cache"

import { callSupabaseRest } from "@/lib/supabase/rest"
import { createSupabaseAuthUser, deleteSupabaseAuthUser } from "@/lib/supabase/auth-admin"
import { resolveOrganizacionId } from "@/lib/settings/org"

export type CrudActionState = {
  status: "idle" | "success" | "error"
  message?: string
}

const PATHS = {
  empleados: "/settings/empleados",
  departamentos: "/settings/empleados/departamentos",
  puestos: "/settings/empleados/puestos",
  usuarios: "/settings/usuarios",
  roles: "/settings/usuarios/roles",
  permisos: "/settings/usuarios/permisos",
} as const

export type CrudActionHandler = (
  prevState: CrudActionState,
  formData: FormData,
) => Promise<CrudActionState>

function success(message?: string): CrudActionState {
  return { status: "success", message: message ?? "Operación completada." }
}

function failure(error: unknown, fallback = "No se pudo completar la acción."): CrudActionState {
  const message =
    error instanceof Error
      ? error.message || fallback
      : typeof error === "string"
        ? error
        : fallback
  console.error("[settings/hr]", error)
  return { status: "error", message }
}

async function requireOrgId(): Promise<string> {
  const orgId = await resolveOrganizacionId()
  if (!orgId) {
    throw new Error("Configura PANEL_ORGANIZACION_ID para gestionar registros.")
  }
  return orgId
}

function getText(formData: FormData, key: string): string {
  const value = formData.get(key)
  if (typeof value !== "string" || !value.trim().length) {
    throw new Error(`El campo ${key} es requerido.`)
  }
  return value.trim()
}

function getOptionalText(formData: FormData, key: string): string | null {
  if (!formData.has(key)) return null
  const value = formData.get(key)
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed.length ? trimmed : ""
}

function parseBoolean(value: FormDataEntryValue | null): boolean {
  if (value === null) return false
  if (typeof value === "string") {
    const normalized = value.toLowerCase()
    return normalized === "on" || normalized === "true" || normalized === "1" || normalized === "sí"
  }
  return Boolean(value)
}

function generateTemporaryPassword(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID().replace(/-/g, "")
  }
  return Math.random().toString(36).slice(2)
}

async function callAndValidate(
  path: string,
  options: Parameters<typeof callSupabaseRest>[1],
): Promise<void> {
  const response = await callSupabaseRest(path, options)
  if (!response.ok) {
    const context = path.startsWith("/rest/v1/") ? path.replace("/rest/v1/", "") : path
    throw new Error(`[${context}] ${response.error || "Operación falló."}`)
  }
}

export const createEmployeeAction: CrudActionHandler = async (_, formData) => {
  try {
    const orgId = await requireOrgId()
    const usuarioId = getText(formData, "usuario_id")
    const departamentoId = getOptionalText(formData, "departamento_id")
    const puestoId = getOptionalText(formData, "puesto_id")
    const esGestor = parseBoolean(formData.get("es_gestor"))
    const esVendedor = parseBoolean(formData.get("es_vendedor"))

    await callAndValidate("/rest/v1/empleados", {
      method: "POST",
      body: {
        usuario_id: usuarioId,
        departamento_id: departamentoId === "" ? null : departamentoId,
        puesto_id: puestoId === "" ? null : puestoId,
        es_gestor: esGestor,
        es_vendedor: esVendedor,
        organizacion_id: orgId,
      },
      prefer: "return=representation",
      forceServiceToken: true,
    })
    revalidatePath(PATHS.empleados)
    return success("Empleado registrado.")
  } catch (error) {
    return failure(error)
  }
}

export const updateEmployeeAction: CrudActionHandler = async (_, formData) => {
  try {
    const usuarioId = getText(formData, "usuario_id")
    const departamentoId = getOptionalText(formData, "departamento_id")
    const puestoId = getOptionalText(formData, "puesto_id")
    const body: Record<string, unknown> = {
      es_gestor: parseBoolean(formData.get("es_gestor")),
      es_vendedor: parseBoolean(formData.get("es_vendedor")),
    }
    if (departamentoId !== null) {
      body.departamento_id = departamentoId === "" ? null : departamentoId
    }
    if (puestoId !== null) {
      body.puesto_id = puestoId === "" ? null : puestoId
    }

    await callAndValidate("/rest/v1/empleados", {
      method: "PATCH",
      body,
      searchParams: {
        usuario_id: `eq.${usuarioId}`,
      },
      prefer: "return=representation",
      enforceOrganization: true,
    })
    revalidatePath(PATHS.empleados)
    return success("Empleado actualizado.")
  } catch (error) {
    return failure(error)
  }
}

export const deleteEmployeeAction: CrudActionHandler = async (_, formData) => {
  try {
    const usuarioId = getText(formData, "usuario_id")
    await callAndValidate("/rest/v1/empleados", {
      method: "DELETE",
      searchParams: {
        usuario_id: `eq.${usuarioId}`,
      },
      enforceOrganization: true,
    })
    revalidatePath(PATHS.empleados)
    return success("Empleado eliminado.")
  } catch (error) {
    return failure(error)
  }
}

export const createDepartmentAction: CrudActionHandler = async (_, formData) => {
  try {
    const orgId = await requireOrgId()
    const nombre = getText(formData, "nombre")
    const padreId = getOptionalText(formData, "departamento_padre_id")
    await callAndValidate("/rest/v1/departamentos", {
      method: "POST",
      body: {
        nombre,
        departamento_padre_id: padreId === "" ? null : padreId,
        organizacion_id: orgId,
      },
      prefer: "return=representation",
    })
    revalidatePath(PATHS.departamentos)
    return success("Departamento creado.")
  } catch (error) {
    return failure(error)
  }
}

export const updateDepartmentAction: CrudActionHandler = async (_, formData) => {
  try {
    const deptId = getText(formData, "id")
    const nombre = getOptionalText(formData, "nombre")
    const padreId = getOptionalText(formData, "departamento_padre_id")
    const body: Record<string, unknown> = {}

    if (nombre !== null) {
      if (!nombre.length) throw new Error("El nombre no puede estar vacío.")
      body.nombre = nombre
    }
    if (padreId !== null) {
      body.departamento_padre_id = padreId === "" ? null : padreId
    }

    await callAndValidate(`/rest/v1/departamentos`, {
      method: "PATCH",
      body,
      searchParams: {
        id: `eq.${deptId}`,
      },
      prefer: "return=representation",
      enforceOrganization: true,
    })
    revalidatePath(PATHS.departamentos)
    return success("Departamento actualizado.")
  } catch (error) {
    return failure(error)
  }
}

export const deleteDepartmentAction: CrudActionHandler = async (_, formData) => {
  try {
    const deptId = getText(formData, "id")
    await callAndValidate("/rest/v1/departamentos", {
      method: "DELETE",
      searchParams: {
        id: `eq.${deptId}`,
      },
      enforceOrganization: true,
    })
    revalidatePath(PATHS.departamentos)
    return success("Departamento eliminado.")
  } catch (error) {
    return failure(error)
  }
}

export const createPositionAction: CrudActionHandler = async (_, formData) => {
  try {
    const orgId = await requireOrgId()
    const nombre = getText(formData, "nombre")
    const descripcion = getOptionalText(formData, "descripcion")
    const departamentoId = getOptionalText(formData, "departamento_id")

    await callAndValidate("/rest/v1/puestos", {
      method: "POST",
      body: {
        nombre,
        descripcion: descripcion === null ? null : descripcion || null,
        departamento_id: departamentoId === "" ? null : departamentoId,
        organizacion_id: orgId,
      },
      prefer: "return=representation",
    })
    revalidatePath(PATHS.puestos)
    return success("Puesto registrado.")
  } catch (error) {
    return failure(error)
  }
}

export const updatePositionAction: CrudActionHandler = async (_, formData) => {
  try {
    const puestoId = getText(formData, "id")
    const nombre = getOptionalText(formData, "nombre")
    const descripcion = getOptionalText(formData, "descripcion")
    const departamentoId = getOptionalText(formData, "departamento_id")
    const body: Record<string, unknown> = {}
    if (nombre !== null) {
      if (!nombre.length) throw new Error("El nombre es requerido.")
      body.nombre = nombre
    }
    if (descripcion !== null) {
      body.descripcion = descripcion || null
    }
    if (departamentoId !== null) {
      body.departamento_id = departamentoId === "" ? null : departamentoId
    }

    await callAndValidate("/rest/v1/puestos", {
      method: "PATCH",
      body,
      searchParams: {
        id: `eq.${puestoId}`,
      },
      prefer: "return=representation",
      enforceOrganization: true,
    })
    revalidatePath(PATHS.puestos)
    return success("Puesto actualizado.")
  } catch (error) {
    return failure(error)
  }
}

export const deletePositionAction: CrudActionHandler = async (_, formData) => {
  try {
    const puestoId = getText(formData, "id")
    await callAndValidate("/rest/v1/puestos", {
      method: "DELETE",
      searchParams: {
        id: `eq.${puestoId}`,
      },
      enforceOrganization: true,
    })
    revalidatePath(PATHS.puestos)
    return success("Puesto eliminado.")
  } catch (error) {
    return failure(error)
  }
}

const TELEFONO_E164_REGEX = /^\+[1-9]\d{7,14}$/
const DEFAULT_TELEFONO_E164 = "+00000000000"

function parseTelefonoE164(raw: string | null): string | null {
  if (raw === null) return null
  const trimmed = raw.trim()
  if (!trimmed.length) return null
  const normalized = trimmed.replace(/\s+/g, "")
  if (!TELEFONO_E164_REGEX.test(normalized)) {
    throw new Error("El teléfono debe estar en formato internacional E.164 (por ejemplo +521234567890).")
  }
  return normalized
}

export const createUserAction: CrudActionHandler = async (_, formData) => {
  try {
    const orgId = await requireOrgId()
    const idInput = getOptionalText(formData, "id")
    const correo = getOptionalText(formData, "correo")
    const nombre = getOptionalText(formData, "nombre_completo")
    const telefono = parseTelefonoE164(getOptionalText(formData, "telefono"))
    const estado = getOptionalText(formData, "estado")

    let userId = idInput && idInput.length ? idInput : null
    if (!userId) {
      if (!correo) {
        throw new Error("Proporciona un correo para crear la cuenta.")
      }
      const provisionalPassword = generateTemporaryPassword()
      const authUser = await createSupabaseAuthUser({
        email: correo,
        password: provisionalPassword,
        telefono,
        nombre,
        organizacion_id: orgId,
      })
      userId = authUser.id
    }

    await callAndValidate("/rest/v1/usuarios", {
      method: "PATCH",
      body: {
        correo: correo || null,
        nombre_completo: nombre || null,
        telefono_e164: telefono ?? DEFAULT_TELEFONO_E164,
        estado: estado || "activo",
      },
      searchParams: {
        id: `eq.${userId}`,
      },
      prefer: "return=representation",
    })
    const message = correo
      ? "Usuario registrado. Enviamos un correo para que establezca su contraseña."
      : "Usuario registrado."
    revalidatePath(PATHS.usuarios)
    return success(message)
  } catch (error) {
    return failure(error)
  }
}

export const updateUserAction: CrudActionHandler = async (_, formData) => {
  try {
    const userId = getText(formData, "id")
    const correo = getOptionalText(formData, "correo")
    const nombre = getOptionalText(formData, "nombre_completo")
    const telefonoInput = getOptionalText(formData, "telefono")
    const telefono = telefonoInput === null ? null : parseTelefonoE164(telefonoInput)
    const estado = getOptionalText(formData, "estado")
    const body: Record<string, unknown> = {}
    if (correo !== null) body.correo = correo || null
    if (nombre !== null) body.nombre_completo = nombre || null
    if (telefonoInput !== null) {
      body.telefono_e164 = telefono ?? DEFAULT_TELEFONO_E164
    }
    if (estado !== null) {
      if (!estado.length) throw new Error("Estado inválido.")
      body.estado = estado
    }

    await callAndValidate("/rest/v1/usuarios", {
      method: "PATCH",
      body,
      searchParams: {
        id: `eq.${userId}`,
      },
      prefer: "return=representation",
      enforceOrganization: true,
      forceServiceToken: true,
    })
    revalidatePath(PATHS.usuarios)
    return success("Usuario actualizado.")
  } catch (error) {
    return failure(error)
  }
}

export const deleteUserAction: CrudActionHandler = async (_, formData) => {
  try {
    const userId = getText(formData, "id")
    await callAndValidate("/rest/v1/usuarios", {
      method: "DELETE",
      searchParams: {
        id: `eq.${userId}`,
      },
      enforceOrganization: true,
      forceServiceToken: true,
    })
    await deleteSupabaseAuthUser(userId)
    revalidatePath(PATHS.usuarios)
    return success("Usuario eliminado.")
  } catch (error) {
    return failure(error)
  }
}

export const createRoleAction: CrudActionHandler = async (_, formData) => {
  try {
    const orgId = await requireOrgId()
    const nombre = getText(formData, "nombre")
    const descripcion = getOptionalText(formData, "descripcion")
    const body: Record<string, unknown> = {
      nombre,
      descripcion: descripcion || null,
      organizacion_id: orgId,
    }

    await callAndValidate("/rest/v1/roles", {
      method: "POST",
      body,
      prefer: "return=representation",
      forceServiceToken: true,
    })
    revalidatePath(PATHS.roles)
    return success("Rol creado.")
  } catch (error) {
    return failure(error)
  }
}

export const updateRoleAction: CrudActionHandler = async (_, formData) => {
  try {
    const roleId = getText(formData, "id")
    const nombre = getOptionalText(formData, "nombre")
    const descripcion = getOptionalText(formData, "descripcion")
    const body: Record<string, unknown> = {}
    if (nombre !== null) {
      if (!nombre.length) throw new Error("El nombre no puede estar vacío.")
      body.nombre = nombre
    }
    if (descripcion !== null) {
      body.descripcion = descripcion || null
    }

    await callAndValidate("/rest/v1/roles", {
      method: "PATCH",
      body,
      searchParams: {
        id: `eq.${roleId}`,
      },
      prefer: "return=representation",
      enforceOrganization: true,
      forceServiceToken: true,
    })
    revalidatePath(PATHS.roles)
    return success("Rol actualizado.")
  } catch (error) {
    return failure(error)
  }
}

export const deleteRoleAction: CrudActionHandler = async (_, formData) => {
  try {
    const roleId = getText(formData, "id")
    await callAndValidate("/rest/v1/roles", {
      method: "DELETE",
      searchParams: {
        id: `eq.${roleId}`,
      },
      enforceOrganization: true,
      forceServiceToken: true,
    })
    revalidatePath(PATHS.roles)
    return success("Rol eliminado.")
  } catch (error) {
    return failure(error)
  }
}

export const createPermissionAction: CrudActionHandler = async (_, formData) => {
  try {
    const orgId = await requireOrgId()
    const codigo = getText(formData, "codigo")
    const descripcion = getOptionalText(formData, "descripcion")
    await callAndValidate("/rest/v1/permisos", {
      method: "POST",
      body: {
        codigo,
        descripcion: descripcion || null,
        organizacion_id: orgId,
      },
      prefer: "return=representation",
      forceServiceToken: true,
    })
    revalidatePath(PATHS.permisos)
    return success("Permiso creado.")
  } catch (error) {
    return failure(error)
  }
}

export const updatePermissionAction: CrudActionHandler = async (_, formData) => {
  try {
    const permisoId = getText(formData, "id")
    const codigo = getOptionalText(formData, "codigo")
    const descripcion = getOptionalText(formData, "descripcion")
    const body: Record<string, unknown> = {}
    if (codigo !== null) {
      if (!codigo.length) throw new Error("El código es requerido.")
      body.codigo = codigo
    }
    if (descripcion !== null) {
      body.descripcion = descripcion || null
    }

    await callAndValidate("/rest/v1/permisos", {
      method: "PATCH",
      body,
      searchParams: {
        id: `eq.${permisoId}`,
      },
      prefer: "return=representation",
      enforceOrganization: true,
      forceServiceToken: true,
    })
    revalidatePath(PATHS.permisos)
    return success("Permiso actualizado.")
  } catch (error) {
    return failure(error)
  }
}

export const deletePermissionAction: CrudActionHandler = async (_, formData) => {
  try {
    const permisoId = getText(formData, "id")
    await callAndValidate("/rest/v1/permisos", {
      method: "DELETE",
      searchParams: {
        id: `eq.${permisoId}`,
      },
      enforceOrganization: true,
      forceServiceToken: true,
    })
    revalidatePath(PATHS.permisos)
    return success("Permiso eliminado.")
  } catch (error) {
    return failure(error)
  }
}
