"use server"
import { revalidatePath } from "next/cache"

import { requirePermission } from "@/lib/auth/permissions"
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
  const normalizedPath = path.toLowerCase()
  if (
    normalizedPath.includes("/roles") ||
    normalizedPath.includes("/roles_permisos") ||
    normalizedPath.includes("/permisos")
  ) {
    await requirePermission("role.manage")
  } else {
    await requirePermission("user.manage")
  }

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
    const supervisorId = getOptionalText(formData, "supervisor_id")
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
    if (supervisorId !== null && supervisorId !== "") {
      await callAndValidate("/rest/v1/empleados_supervisores", {
        method: "POST",
        body: {
          organizacion_id: orgId,
          empleado_id: usuarioId,
          supervisor_id: supervisorId,
        },
        prefer: "resolution=merge-duplicates,return=representation",
        forceServiceToken: true,
      })
    }
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
    const supervisorId = getOptionalText(formData, "supervisor_id")
    const orgId = supervisorId !== null ? await requireOrgId() : null
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

    if (supervisorId !== null) {
      await callAndValidate("/rest/v1/empleados_supervisores", {
        method: "DELETE",
        searchParams: {
          empleado_id: `eq.${usuarioId}`,
        },
        enforceOrganization: true,
        forceServiceToken: true,
      })
      if (supervisorId !== "") {
        await callAndValidate("/rest/v1/empleados_supervisores", {
          method: "POST",
          body: {
            organizacion_id: orgId,
            empleado_id: usuarioId,
            supervisor_id: supervisorId,
          },
          prefer: "resolution=merge-duplicates,return=representation",
          enforceOrganization: true,
          forceServiceToken: true,
        })
      }
    }
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
    await requirePermission("user.manage")
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

export const updateUserRolesAction: CrudActionHandler = async (_, formData) => {
  try {
    await requirePermission("user.manage")
    const orgId = await requireOrgId()
    const userId = getText(formData, "usuario_id")
    const selectedRoles = formData
      .getAll("role_ids")
      .filter((value): value is string => typeof value === "string" && value.trim().length > 0)

    const currentRes = await callSupabaseRest<{ rol_id: string }[]>("/rest/v1/usuarios_roles", {
      searchParams: {
        select: "rol_id",
        usuario_id: `eq.${userId}`,
      },
      enforceOrganization: true,
      forceServiceToken: true,
    })
    if (!currentRes.ok) {
      throw new Error(currentRes.error || "No se pudo leer los roles actuales.")
    }

    const currentRoles = new Set(
      (currentRes.data || [])
        .map((row) => row?.rol_id)
        .filter((value): value is string => typeof value === "string" && value.length > 0),
    )

    const desiredRoles = new Set(selectedRoles)
    const toAdd = selectedRoles.filter((roleId) => !currentRoles.has(roleId))
    const toRemove = Array.from(currentRoles).filter((roleId) => !desiredRoles.has(roleId))

    if (toAdd.length) {
      const body = toAdd.map((roleId) => ({
        usuario_id: userId,
        rol_id: roleId,
        organizacion_id: orgId,
      }))
      const addRes = await callSupabaseRest("/rest/v1/usuarios_roles", {
        method: "POST",
        body,
        prefer: "return=representation",
        forceServiceToken: true,
      })
      if (!addRes.ok) {
        throw new Error(addRes.error || "No se pudo asignar roles.")
      }
    }

    if (toRemove.length) {
      const inClause = `in.(${toRemove.join(",")})`
      const removeRes = await callSupabaseRest("/rest/v1/usuarios_roles", {
        method: "DELETE",
        searchParams: {
          usuario_id: `eq.${userId}`,
          rol_id: inClause,
        },
        forceServiceToken: true,
      })
      if (!removeRes.ok) {
        throw new Error(removeRes.error || "No se pudo remover roles.")
      }
    }

    revalidatePath(PATHS.usuarios)
    return success("Roles actualizados.")
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

export const updateRolePermissionsAction: CrudActionHandler = async (_, formData) => {
  try {
    const orgId = await requireOrgId()
    const roleId = getText(formData, "role_id")
    const selected = formData
      .getAll("permiso_ids")
      .filter((value): value is string => typeof value === "string")
      .map((value) => value.trim())
      .filter((value) => value.length > 0)

    const currentRes = await callSupabaseRest<{ permiso_id: string }[]>(
      "/rest/v1/roles_permisos",
      {
        searchParams: {
          select: "permiso_id",
          rol_id: `eq.${roleId}`,
          limit: "1000",
        },
        enforceOrganization: true,
        forceServiceToken: true,
      },
    )
    if (!currentRes.ok) {
      throw new Error(currentRes.error || "No se pudo leer los permisos actuales del rol.")
    }

    const currentIds = new Set(
      (Array.isArray(currentRes.data) ? currentRes.data : [])
        .map((row) => row?.permiso_id)
        .filter((value): value is string => Boolean(value)),
    )
    const selectedIds = new Set(selected)

    const toAdd = Array.from(selectedIds).filter((id) => !currentIds.has(id))
    const toRemove = Array.from(currentIds).filter((id) => !selectedIds.has(id))

    if (toAdd.length) {
      const body = toAdd.map((permisoId) => ({
        rol_id: roleId,
        permiso_id: permisoId,
        organizacion_id: orgId,
      }))
      await callAndValidate("/rest/v1/roles_permisos", {
        method: "POST",
        body,
        prefer: "return=representation",
        forceServiceToken: true,
      })
    }

    if (toRemove.length) {
      const inClause = `in.(${toRemove.map((id) => `"${id}"`).join(",")})`
      await callAndValidate("/rest/v1/roles_permisos", {
        method: "DELETE",
        searchParams: {
          rol_id: `eq.${roleId}`,
          permiso_id: inClause,
        },
        enforceOrganization: true,
        forceServiceToken: true,
      })
    }

    revalidatePath(PATHS.roles)
    revalidatePath(PATHS.permisos)
    return success("Permisos actualizados.")
  } catch (error) {
    return failure(error)
  }
}
