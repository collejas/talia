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

const SALES_QUOTE_POSITION_NAME = "ejecutivo de ventas"
const SALES_QUOTE_ROLE_NAME = "agente"
const QUOTE_PERMISSION_CODE = "propuesta.view"

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
    await ensureSalesQuoteRoleAssignment({
      orgId,
      userId: usuarioId,
      puestoId: puestoId === "" ? null : puestoId,
    })
    revalidatePath(PATHS.empleados)
    return success("Empleado registrado.")
  } catch (error) {
    return failure(error)
  }
}

export const updateEmployeeAction: CrudActionHandler = async (_, formData) => {
  try {
    const orgId = await requireOrgId()
    const usuarioId = getText(formData, "usuario_id")
    const departamentoId = getOptionalText(formData, "departamento_id")
    const puestoId = getOptionalText(formData, "puesto_id")
    const supervisorId = getOptionalText(formData, "supervisor_id")
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
      forceServiceToken: true,
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
    await ensureSalesQuoteRoleAssignment({
      orgId,
      userId: usuarioId,
      puestoId: puestoId === "" ? null : puestoId,
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
      forceServiceToken: true,
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
      forceServiceToken: true,
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
      forceServiceToken: true,
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
      forceServiceToken: true,
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
      forceServiceToken: true,
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
      forceServiceToken: true,
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
      forceServiceToken: true,
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

function parseUserTimezone(raw: string | null): string | null {
  if (raw === null) return null
  const trimmed = raw.trim()
  if (!trimmed.length) return ""
  try {
    // Validación IANA sin depender de catálogos locales.
    new Intl.DateTimeFormat("en-US", { timeZone: trimmed }).format(new Date())
  } catch {
    throw new Error("Zona horaria inválida. Usa formato IANA, por ejemplo America/Mexico_City.")
  }
  return trimmed
}

function normalizeLookupText(raw: string | null | undefined): string {
  return typeof raw === "string" ? raw.trim().toLowerCase() : ""
}

async function syncUserEmployeeAssignment(params: {
  orgId: string
  userId: string
  departamentoId: string | null
  puestoId: string | null
}): Promise<void> {
  const { orgId, userId, departamentoId, puestoId } = params
  const shouldAssign = Boolean(departamentoId || puestoId)
  const existingRes = await callSupabaseRest<{ usuario_id: string }[]>("/rest/v1/empleados", {
    searchParams: {
      select: "usuario_id",
      usuario_id: `eq.${userId}`,
      limit: "1",
    },
    enforceOrganization: true,
    forceServiceToken: true,
  })
  if (!existingRes.ok) {
    throw new Error(existingRes.error || "No se pudo validar el empleado del usuario.")
  }
  const exists = Array.isArray(existingRes.data) && existingRes.data.length > 0

  if (exists) {
    await callAndValidate("/rest/v1/empleados", {
      method: "PATCH",
      body: {
        departamento_id: departamentoId,
        puesto_id: puestoId,
      },
      searchParams: {
        usuario_id: `eq.${userId}`,
      },
      prefer: "return=representation",
      enforceOrganization: true,
      forceServiceToken: true,
    })
    return
  }

  if (!shouldAssign) {
    return
  }

  await callAndValidate("/rest/v1/empleados", {
    method: "POST",
    body: {
      usuario_id: userId,
      organizacion_id: orgId,
      departamento_id: departamentoId,
      puesto_id: puestoId,
      es_gestor: false,
      es_vendedor: false,
    },
    prefer: "return=representation",
    forceServiceToken: true,
  })

  await ensureSalesQuoteRoleAssignment({
    orgId,
    userId,
    puestoId,
  })
}

async function ensureSalesQuoteRoleAssignment(params: {
  orgId: string
  userId: string
  puestoId: string | null
}): Promise<void> {
  const { orgId, userId, puestoId } = params
  if (!puestoId) return

  const puestoRes = await callSupabaseRest<{ nombre: string | null }[]>("/rest/v1/puestos", {
    searchParams: {
      select: "nombre",
      id: `eq.${puestoId}`,
      limit: "1",
    },
    enforceOrganization: true,
    forceServiceToken: true,
  })
  if (!puestoRes.ok) {
    throw new Error(puestoRes.error || "No se pudo validar el puesto del usuario.")
  }

  const puestoNombre = normalizeLookupText(puestoRes.data?.[0]?.nombre)
  if (puestoNombre !== SALES_QUOTE_POSITION_NAME) {
    return
  }

  const [currentRolesRes, rolesRes, rolesPermisosRes, permisosRes] = await Promise.all([
    callSupabaseRest<{ rol_id: string }[]>("/rest/v1/usuarios_roles", {
      searchParams: {
        select: "rol_id",
        usuario_id: `eq.${userId}`,
        limit: "50",
      },
      enforceOrganization: true,
      forceServiceToken: true,
    }),
    callSupabaseRest<{ id: string; nombre: string | null; codigo: string | null }[]>("/rest/v1/roles", {
      searchParams: {
        select: "id,nombre,codigo",
        limit: "1000",
      },
      enforceOrganization: true,
      forceServiceToken: true,
    }),
    callSupabaseRest<{ rol_id: string; permiso_id: string }[]>("/rest/v1/roles_permisos", {
      searchParams: {
        select: "rol_id,permiso_id",
        limit: "1000",
      },
      enforceOrganization: true,
      forceServiceToken: true,
    }),
    callSupabaseRest<{ id: string; codigo: string | null }[]>("/rest/v1/permisos", {
      searchParams: {
        select: "id,codigo",
        limit: "1000",
      },
      enforceOrganization: true,
      forceServiceToken: true,
    }),
  ])

  if (!currentRolesRes.ok) {
    throw new Error(currentRolesRes.error || "No se pudieron leer los roles del usuario.")
  }
  if (!rolesRes.ok) {
    throw new Error(rolesRes.error || "No se pudo recuperar el catálogo de roles.")
  }
  if (!rolesPermisosRes.ok) {
    throw new Error(rolesPermisosRes.error || "No se pudo recuperar la matriz de permisos.")
  }
  if (!permisosRes.ok) {
    throw new Error(permisosRes.error || "No se pudo recuperar el catálogo de permisos.")
  }

  const currentRoleIds = new Set(
    (Array.isArray(currentRolesRes.data) ? currentRolesRes.data : [])
      .map((row) => row?.rol_id)
      .filter((value): value is string => typeof value === "string" && value.length > 0),
  )
  if (currentRoleIds.size === 0) {
    // No tiene roles: le damos el rol comercial base para que pueda crear cotizaciones.
  } else {
    const proposalPermissionIds = new Set(
      (Array.isArray(permisosRes.data) ? permisosRes.data : [])
        .filter((permiso) => normalizeLookupText(permiso?.codigo) === QUOTE_PERMISSION_CODE)
        .map((permiso) => permiso.id)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    )
    const hasQuotePermission = (Array.isArray(rolesPermisosRes.data) ? rolesPermisosRes.data : []).some(
      (entry) =>
        currentRoleIds.has(entry.rol_id) &&
        proposalPermissionIds.has(entry.permiso_id),
    )
    if (hasQuotePermission) {
      return
    }
  }

  const agentRole = (Array.isArray(rolesRes.data) ? rolesRes.data : []).find((role) => {
    const nombre = normalizeLookupText(role?.nombre)
    const codigo = normalizeLookupText(role?.codigo)
    return nombre === SALES_QUOTE_ROLE_NAME || codigo === SALES_QUOTE_ROLE_NAME || codigo === "0004"
  })

  if (!agentRole?.id) {
    console.warn("[settings/hr] No se encontró el rol base de ventas para autoasignación.")
    return
  }

  const assignRes = await callSupabaseRest("/rest/v1/usuarios_roles", {
    method: "POST",
    body: {
      usuario_id: userId,
      rol_id: agentRole.id,
      organizacion_id: orgId,
    },
    prefer: "resolution=merge-duplicates,return=representation",
    forceServiceToken: true,
  })
  if (!assignRes.ok) {
    throw new Error(assignRes.error || "No se pudo asignar el rol comercial al usuario.")
  }
}

export const createUserAction: CrudActionHandler = async (_, formData) => {
  try {
    await requirePermission("user.manage")
    const orgId = await requireOrgId()
    const idInput = getOptionalText(formData, "id")
    const correo = getOptionalText(formData, "correo")
    const nombre = getOptionalText(formData, "nombre_completo")
    const telefono = parseTelefonoE164(getOptionalText(formData, "telefono"))
    const timezoneInput = getOptionalText(formData, "timezone")
    const timezoneValue = parseUserTimezone(timezoneInput)
    const estado = getOptionalText(formData, "estado")
    const departamentoIdInput = getOptionalText(formData, "departamento_id")
    const puestoIdInput = getOptionalText(formData, "puesto_id")
    const departamentoId = departamentoIdInput === null || departamentoIdInput === "" ? null : departamentoIdInput
    const puestoId = puestoIdInput === null || puestoIdInput === "" ? null : puestoIdInput

    let userId = idInput && idInput.length ? idInput : null
    let inviteEmailSent = false
    if (!userId) {
      if (!correo) {
        throw new Error("Proporciona un correo para crear la cuenta.")
      }
      const authUser = await createSupabaseAuthUser({
        email: correo,
        telefono,
        nombre,
        organizacion_id: orgId,
      })
      userId = authUser.id
      inviteEmailSent = authUser.inviteEmailSent
    }

    await callAndValidate("/rest/v1/usuarios", {
      method: "PATCH",
      body: {
        correo: correo || null,
        nombre_completo: nombre || null,
        telefono_e164: telefono ?? DEFAULT_TELEFONO_E164,
        timezone: timezoneValue || null,
        estado: estado || "activo",
      },
      searchParams: {
        id: `eq.${userId}`,
      },
      prefer: "return=representation",
      forceServiceToken: true,
    })

    if (userId) {
      await syncUserEmployeeAssignment({
        orgId,
        userId,
        departamentoId,
        puestoId,
      })
    }

    const message = correo
      ? inviteEmailSent
        ? "Usuario registrado. Enviamos un correo de invitación para establecer acceso."
        : "Usuario registrado, pero no pudimos enviar el correo de invitación."
      : "Usuario registrado."
    revalidatePath(PATHS.usuarios)
    return success(message)
  } catch (error) {
    return failure(error)
  }
}

export const updateUserAction: CrudActionHandler = async (_, formData) => {
  try {
    const orgId = await requireOrgId()
    const userId = getText(formData, "id")
    const correo = getOptionalText(formData, "correo")
    const nombre = getOptionalText(formData, "nombre_completo")
    const telefonoInput = getOptionalText(formData, "telefono")
    const telefono = telefonoInput === null ? null : parseTelefonoE164(telefonoInput)
    const timezoneInput = getOptionalText(formData, "timezone")
    const timezoneValue = timezoneInput === null ? null : parseUserTimezone(timezoneInput)
    const estado = getOptionalText(formData, "estado")
    const departamentoIdInput = getOptionalText(formData, "departamento_id")
    const puestoIdInput = getOptionalText(formData, "puesto_id")
    const departamentoId = departamentoIdInput === null || departamentoIdInput === "" ? null : departamentoIdInput
    const puestoId = puestoIdInput === null || puestoIdInput === "" ? null : puestoIdInput
    const body: Record<string, unknown> = {}
    if (correo !== null) body.correo = correo || null
    if (nombre !== null) body.nombre_completo = nombre || null
    if (telefonoInput !== null) {
      body.telefono_e164 = telefono ?? DEFAULT_TELEFONO_E164
    }
    if (timezoneInput !== null) {
      body.timezone = timezoneValue || null
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

    if (departamentoIdInput !== null || puestoIdInput !== null) {
      await syncUserEmployeeAssignment({
        orgId,
        userId,
        departamentoId,
        puestoId,
      })
    }

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
      for (const roleId of toRemove) {
        const removeRes = await callSupabaseRest("/rest/v1/usuarios_roles", {
          method: "DELETE",
          searchParams: {
            usuario_id: `eq.${userId}`,
            rol_id: `eq.${roleId}`,
          },
          forceServiceToken: true,
        })
        if (!removeRes.ok) {
          throw new Error(removeRes.error || "No se pudo remover roles.")
        }
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
