"use server"

import {
  HrAssignmentLookups,
  HrDepartmentItem,
  HrDepartmentOption,
  HrDepartmentsDirectory,
  HrEmployeeItem,
  HrEmployeeUserOption,
  HrEmployeesDirectory,
  HrPermissionItem,
  HrPermissionsDirectory,
  HrPositionItem,
  HrPositionsDirectory,
  HrRoleItem,
  HrRolePermissionMatrix,
  HrRolesDirectory,
  HrRoleOption,
  HrUserItem,
  HrUsersDirectory,
} from "@/lib/settings/hr-types"
import { callSupabaseRest, type SupabaseRestResult } from "@/lib/supabase/rest"

export type {
  HrDepartmentItem,
  HrDepartmentOption,
  HrDepartmentsDirectory,
  HrEmployeeItem,
  HrEmployeesDirectory,
  HrAssignmentLookups,
  HrPermissionItem,
  HrPermissionsDirectory,
  HrPositionItem,
  HrPositionOption,
  HrPositionsDirectory,
  HrRoleItem,
  HrRolePermissionMatrix,
  HrRolesDirectory,
  HrRoleOption,
  HrUserItem,
  HrUsersDirectory,
} from "@/lib/settings/hr-types"

const DEFAULT_LIMIT = 200
const LARGE_LIMIT = 1000

type SupabaseEmployeeRow = {
  usuario_id: string
  departamento_id: string | null
  puesto_id: string | null
  es_gestor: boolean | null
  es_vendedor: boolean | null
  ultimo_lead_asignado_en: string | null
  creado_en: string | null
  usuario: {
    id: string
    correo: string | null
    nombre_completo: string | null
    estado: string | null
    telefono_e164: string | null
  } | null
  departamento: { id: string; nombre: string | null } | null
  puesto: { id: string; nombre: string | null } | null
}

type SupabaseSupervisorRow = {
  empleado_id: string
  supervisor_id: string
  supervisor: {
    id: string
    correo: string | null
    nombre_completo: string | null
  } | null
}

type SupabaseDepartmentRow = {
  id: string
  nombre: string | null
  departamento_padre_id: string | null
  creado_en: string | null
}

type SupabasePositionRow = {
  id: string
  nombre: string | null
  descripcion: string | null
  departamento_id: string | null
  creado_en: string | null
}

type SupabaseUserRow = {
  id: string
  correo: string | null
  nombre_completo: string | null
  estado: string | null
  telefono_e164: string | null
  timezone: string | null
  creado_en: string | null
  ultimo_acceso_en: string | null
}

type SupabaseSimpleEmployeeRow = {
  usuario_id: string
  departamento_id: string | null
  puesto_id: string | null
}

type SupabaseUserRoleRow = {
  usuario_id: string
  rol_id: string
}

type SupabaseRoleRow = {
  id: string
  codigo: string | null
  nombre: string | null
  descripcion: string | null
  creado_en: string | null
}

type SupabaseRolePermissionRow = {
  rol_id: string
  permiso_id: string
}

type SupabasePermissionRow = {
  id: string
  codigo: string | null
  descripcion: string | null
  creado_en: string | null
}

type RestSummary = { ok: true; count: number } | { ok: false; error: string }

function summarizeResult<T>(result: SupabaseRestResult<T[]>): RestSummary {
  if (result.ok) {
    return { ok: true, count: Array.isArray(result.data) ? result.data.length : 0 }
  }
  return { ok: false, error: result.error }
}

export async function fetchEmployeesDirectory(
  limit = DEFAULT_LIMIT,
): Promise<HrEmployeesDirectory> {
  const [employeesRes, supervisorsRes] = await Promise.all([
    callSupabaseRest<SupabaseEmployeeRow[]>("/rest/v1/empleados", {
      searchParams: {
        select:
          "usuario_id,departamento_id,puesto_id,es_gestor,es_vendedor,ultimo_lead_asignado_en,creado_en,usuario:usuarios(id,correo,nombre_completo,estado,telefono_e164),departamento:departamentos(id,nombre),puesto:puestos(id,nombre)",
        order: "creado_en.desc",
        limit: String(limit),
      },
      prefer: "count=exact",
      enforceOrganization: true,
    }),
    callSupabaseRest<SupabaseSupervisorRow[]>("/rest/v1/empleados_supervisores", {
      searchParams: {
        select:
          "empleado_id,supervisor_id,supervisor:usuarios!empleados_supervisores_supervisor_fk(id,correo,nombre_completo)",
        limit: String(LARGE_LIMIT),
      },
      enforceOrganization: true,
      forceServiceToken: true,
    }),
  ])

  if (!employeesRes.ok) {
    return {
      items: [],
      total: 0,
      stats: { gestores: 0, vendedores: 0 },
      errors: [employeesRes.error],
    }
  }

  const supervisorMap = new Map<string, SupabaseSupervisorRow>()
  if (supervisorsRes.ok && Array.isArray(supervisorsRes.data)) {
    supervisorsRes.data.forEach((row) => {
      if (row?.empleado_id) {
        supervisorMap.set(row.empleado_id, row)
      }
    })
  }

  const rows = Array.isArray(employeesRes.data) ? employeesRes.data : []
  const items = rows
    .map((row) => mapEmployeeRow(row, supervisorMap.get(row.usuario_id)))
    .sort((a, b) => a.nombre.localeCompare(b.nombre))
  const gestores = items.filter((item) => item.esGestor).length
  const vendedores = items.filter((item) => item.esVendedor).length
  const total = parseTotalFromRange(employeesRes.headers.get("content-range"))

  return {
    items,
    total,
    stats: { gestores, vendedores },
    errors: supervisorsRes.ok ? [] : [supervisorsRes.error],
  }
}

export async function fetchDepartmentsDirectory(): Promise<HrDepartmentsDirectory> {
  const errors: string[] = []

  const [departamentosRes, empleadosRes, puestosRes] = await Promise.all([
    callSupabaseRest<SupabaseDepartmentRow[]>("/rest/v1/departamentos", {
      searchParams: {
        select: "id,nombre,departamento_padre_id,creado_en",
        order: "nombre.asc",
        limit: String(LARGE_LIMIT),
      },
      prefer: "count=exact",
      enforceOrganization: true,
      forceServiceToken: true,
    }),
    callSupabaseRest<SupabaseSimpleEmployeeRow[]>("/rest/v1/empleados", {
      searchParams: {
        select: "usuario_id,departamento_id,puesto_id",
        limit: String(LARGE_LIMIT),
      },
      enforceOrganization: true,
      forceServiceToken: true,
    }),
    callSupabaseRest<SupabasePositionRow[]>("/rest/v1/puestos", {
      searchParams: {
        select: "id,nombre,descripcion,departamento_id,creado_en",
        limit: String(LARGE_LIMIT),
      },
      enforceOrganization: true,
      forceServiceToken: true,
    }),
  ])

  const departamentos = departamentosRes.ok && Array.isArray(departamentosRes.data)
    ? departamentosRes.data
    : []
  if (!departamentosRes.ok) {
    errors.push(departamentosRes.error)
  }

  const empleadosPorDepto = new Map<string, number>()
  if (empleadosRes.ok && Array.isArray(empleadosRes.data)) {
    for (const row of empleadosRes.data) {
      if (!row?.departamento_id) continue
      empleadosPorDepto.set(
        row.departamento_id,
        (empleadosPorDepto.get(row.departamento_id) ?? 0) + 1,
      )
    }
  } else if (!empleadosRes.ok) {
    errors.push(empleadosRes.error)
  }

  const puestosPorDepto = new Map<string, number>()
  let totalPuestos = 0
  if (puestosRes.ok && Array.isArray(puestosRes.data)) {
    totalPuestos = puestosRes.data.length
    for (const row of puestosRes.data) {
      if (!row?.departamento_id) continue
      puestosPorDepto.set(
        row.departamento_id,
        (puestosPorDepto.get(row.departamento_id) ?? 0) + 1,
      )
    }
  } else if (!puestosRes.ok) {
    errors.push(puestosRes.error)
  }

  const parentLookup = new Map<string, SupabaseDepartmentRow>()
  departamentos.forEach((dept) => {
    parentLookup.set(dept.id, dept)
  })

  const items: HrDepartmentItem[] = departamentos.map((dept) => {
    const parentId = dept.departamento_padre_id
    const parentName = parentId
      ? sanitizeText(parentLookup.get(parentId)?.nombre) || "—"
      : "Raíz"
    return {
      id: dept.id,
      nombre: sanitizeText(dept.nombre) || "Sin nombre",
      padreId: parentId,
      padreNombre: parentName,
      puestos: puestosPorDepto.get(dept.id) ?? 0,
      empleados: empleadosPorDepto.get(dept.id) ?? 0,
      creadoEn: dept.creado_en ?? null,
    }
  })

  const total = departamentosRes.ok
    ? parseTotalFromRange(departamentosRes.headers.get("content-range"))
    : 0
  const totalEmpleados = Array.from(empleadosPorDepto.values()).reduce(
    (sum, value) => sum + value,
    0,
  )

  return {
    items,
    total,
    stats: { puestos: totalPuestos, empleados: totalEmpleados },
    errors,
  }
}

export async function fetchPositionsDirectory(): Promise<HrPositionsDirectory> {
  const errors: string[] = []

  const [puestosRes, departamentosRes, empleadosRes] = await Promise.all([
    callSupabaseRest<SupabasePositionRow[]>("/rest/v1/puestos", {
      searchParams: {
        select: "id,nombre,descripcion,departamento_id,creado_en",
        order: "creado_en.desc",
        limit: String(LARGE_LIMIT),
      },
      prefer: "count=exact",
      enforceOrganization: true,
      forceServiceToken: true,
    }),
    callSupabaseRest<SupabaseDepartmentRow[]>("/rest/v1/departamentos", {
      searchParams: {
        select: "id,nombre",
        limit: String(LARGE_LIMIT),
      },
      enforceOrganization: true,
      forceServiceToken: true,
    }),
    callSupabaseRest<SupabaseSimpleEmployeeRow[]>("/rest/v1/empleados", {
      searchParams: {
        select: "usuario_id,puesto_id",
        limit: String(LARGE_LIMIT),
      },
      enforceOrganization: true,
      forceServiceToken: true,
    }),
  ])

  const puestos = puestosRes.ok && Array.isArray(puestosRes.data) ? puestosRes.data : []
  if (!puestosRes.ok) {
    errors.push(puestosRes.error)
  }

  const departamentos = new Map<string, string>()
  if (departamentosRes.ok && Array.isArray(departamentosRes.data)) {
    departamentosRes.data.forEach((dept) => {
      departamentos.set(dept.id, sanitizeText(dept.nombre) || "Sin nombre")
    })
  } else if (!departamentosRes.ok) {
    errors.push(departamentosRes.error)
  }

  const empleadosPorPuesto = new Map<string, number>()
  if (empleadosRes.ok && Array.isArray(empleadosRes.data)) {
    for (const row of empleadosRes.data) {
      if (!row?.puesto_id) continue
      empleadosPorPuesto.set(
        row.puesto_id,
        (empleadosPorPuesto.get(row.puesto_id) ?? 0) + 1,
      )
    }
  } else if (!empleadosRes.ok) {
    errors.push(empleadosRes.error)
  }

  const items: HrPositionItem[] = puestos
    .map((puesto) => ({
      id: puesto.id,
      nombre: sanitizeText(puesto.nombre) || "Sin nombre",
      descripcion: sanitizeText(puesto.descripcion) || "—",
      departamentoId: puesto.departamento_id ?? null,
      departamento: puesto.departamento_id
        ? departamentos.get(puesto.departamento_id) || "Sin departamento"
        : "Sin departamento",
      empleados: empleadosPorPuesto.get(puesto.id) ?? 0,
      creadoEn: puesto.creado_en ?? null,
    }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre))

  const total = puestosRes.ok
    ? parseTotalFromRange(puestosRes.headers.get("content-range"))
    : 0
  const totalEmpleados = Array.from(empleadosPorPuesto.values()).reduce(
    (sum, value) => sum + value,
    0,
  )

  return {
    items,
    total,
    stats: { empleados: totalEmpleados },
    errors,
  }
}

export async function fetchUsersDirectory(limit = LARGE_LIMIT): Promise<HrUsersDirectory> {
  const errors: string[] = []

  const [usuariosRes, empleadosRes, departamentosRes, puestosRes, usuariosRolesRes, rolesRes] =
    await Promise.all([
      callSupabaseRest<SupabaseUserRow[]>("/rest/v1/usuarios", {
        searchParams: {
          select: "id,correo,nombre_completo,estado,telefono_e164,timezone,creado_en,ultimo_acceso_en",
          order: "creado_en.desc",
          limit: String(limit),
        },
        prefer: "count=exact",
        enforceOrganization: true,
        forceServiceToken: true,
      }),
      callSupabaseRest<SupabaseSimpleEmployeeRow[]>("/rest/v1/empleados", {
        searchParams: {
          select: "usuario_id,departamento_id,puesto_id",
          limit: String(LARGE_LIMIT),
        },
        enforceOrganization: true,
        forceServiceToken: true,
      }),
      callSupabaseRest<SupabaseDepartmentRow[]>("/rest/v1/departamentos", {
        searchParams: {
          select: "id,nombre",
          limit: String(LARGE_LIMIT),
        },
        enforceOrganization: true,
        forceServiceToken: true,
      }),
      callSupabaseRest<SupabasePositionRow[]>("/rest/v1/puestos", {
        searchParams: {
          select: "id,nombre",
          limit: String(LARGE_LIMIT),
        },
        enforceOrganization: true,
        forceServiceToken: true,
      }),
      callSupabaseRest<SupabaseUserRoleRow[]>("/rest/v1/usuarios_roles", {
        searchParams: {
          select: "usuario_id,rol_id",
          limit: String(LARGE_LIMIT),
        },
        enforceOrganization: true,
        forceServiceToken: true,
      }),
      callSupabaseRest<SupabaseRoleRow[]>("/rest/v1/roles", {
        searchParams: {
          select: "id,codigo,nombre,descripcion,creado_en",
          limit: String(LARGE_LIMIT),
        },
        enforceOrganization: true,
        forceServiceToken: true,
      }),
    ])

  const usuarios = usuariosRes.ok && Array.isArray(usuariosRes.data) ? usuariosRes.data : []
  if (!usuariosRes.ok) {
    errors.push(usuariosRes.error)
  }

  const empleadoPorUsuario = new Map<string, SupabaseSimpleEmployeeRow>()
  if (empleadosRes.ok && Array.isArray(empleadosRes.data)) {
    empleadosRes.data.forEach((row) => {
      if (row?.usuario_id) {
        empleadoPorUsuario.set(row.usuario_id, row)
      }
    })
  } else if (!empleadosRes.ok) {
    errors.push(empleadosRes.error)
  }

  const departamentos = new Map<string, string>()
  if (departamentosRes.ok && Array.isArray(departamentosRes.data)) {
    departamentosRes.data.forEach((dept) => {
      departamentos.set(dept.id, sanitizeText(dept.nombre) || "Sin nombre")
    })
  } else if (!departamentosRes.ok) {
    errors.push(departamentosRes.error)
  }

  const puestos = new Map<string, string>()
  if (puestosRes.ok && Array.isArray(puestosRes.data)) {
    puestosRes.data.forEach((puesto) => {
      puestos.set(puesto.id, sanitizeText(puesto.nombre) || "Sin nombre")
    })
  } else if (!puestosRes.ok) {
    errors.push(puestosRes.error)
  }

  const roles = new Map<string, string>()
  const rolesCatalog: HrRoleOption[] = []
  if (rolesRes.ok && Array.isArray(rolesRes.data)) {
    rolesRes.data.forEach((rol) => {
      const nombre = sanitizeText(rol.nombre) || sanitizeText(rol.codigo) || rol.id
      roles.set(rol.id, nombre)
      rolesCatalog.push({
        id: rol.id,
        codigo: sanitizeText(rol.codigo) || rol.id,
        nombre,
      })
    })
  } else if (!rolesRes.ok) {
    errors.push(rolesRes.error)
  }

  const rolesPorUsuario = new Map<string, string[]>()
  if (usuariosRolesRes.ok && Array.isArray(usuariosRolesRes.data)) {
    usuariosRolesRes.data.forEach((entry) => {
      if (!entry?.usuario_id || !entry?.rol_id) return
      const list = rolesPorUsuario.get(entry.usuario_id) ?? []
      list.push(entry.rol_id)
      rolesPorUsuario.set(entry.usuario_id, list)
    })
  } else if (!usuariosRolesRes.ok) {
    errors.push(usuariosRolesRes.error)
  }

  const items: HrUserItem[] = usuarios.map((usuario) => {
    const empleado = empleadoPorUsuario.get(usuario.id)
    const departamentoNombre = empleado?.departamento_id
      ? departamentos.get(empleado.departamento_id) || "Sin departamento"
      : "Sin departamento"
    const puestoNombre = empleado?.puesto_id
      ? puestos.get(empleado.puesto_id) || "Sin puesto"
      : "Sin puesto"
    const roleIds = rolesPorUsuario.get(usuario.id) ?? []
    const roleNames = roleIds
      .map((rolId) => roles.get(rolId))
      .filter((name): name is string => Boolean(name))

    return {
      id: usuario.id,
      nombre: sanitizeText(usuario.nombre_completo) || "Sin nombre",
      correo: sanitizeText(usuario.correo).toLowerCase(),
      estado: normalizeEstado(usuario.estado),
      telefono: sanitizeText(usuario.telefono_e164) || "—",
      timezone: sanitizeText(usuario.timezone) || null,
      roleIds,
      roles: roleNames,
      departamento: departamentoNombre,
      departamentoId: empleado?.departamento_id ?? null,
      puesto: puestoNombre,
      puestoId: empleado?.puesto_id ?? null,
      creadoEn: usuario.creado_en ?? null,
      ultimoAcceso: usuario.ultimo_acceso_en ?? null,
    }
  })

  const total = usuariosRes.ok
    ? parseTotalFromRange(usuariosRes.headers.get("content-range"))
    : 0

  const stats = {
    activos: items.filter((user) => user.estado === "activo").length,
    bloqueados: items.filter((user) => user.estado === "bloqueado").length,
    sinRoles: items.filter((user) => user.roles.length === 0).length,
  }

  return {
    items,
    total,
    stats,
    rolesCatalog,
    errors,
  }
}

export async function fetchRolesDirectory(): Promise<HrRolesDirectory> {
  const errors: string[] = []

  const [rolesRes, rolesPermisosRes, usuariosRolesRes, permisosRes] = await Promise.all([
    callSupabaseRest<SupabaseRoleRow[]>("/rest/v1/roles", {
      searchParams: {
        select: "id,codigo,nombre,descripcion,creado_en",
        order: "creado_en.desc",
        limit: String(LARGE_LIMIT),
      },
      prefer: "count=exact",
      enforceOrganization: true,
      forceServiceToken: true,
    }),
    callSupabaseRest<SupabaseRolePermissionRow[]>("/rest/v1/roles_permisos", {
      searchParams: {
        select: "rol_id,permiso_id",
        limit: String(LARGE_LIMIT),
      },
      enforceOrganization: true,
      forceServiceToken: true,
    }),
    callSupabaseRest<SupabaseUserRoleRow[]>("/rest/v1/usuarios_roles", {
      searchParams: {
        select: "usuario_id,rol_id",
        limit: String(LARGE_LIMIT),
      },
      enforceOrganization: true,
      forceServiceToken: true,
    }),
    callSupabaseRest<SupabasePermissionRow[]>("/rest/v1/permisos", {
      searchParams: {
        select: "id,codigo,descripcion,creado_en",
        limit: String(LARGE_LIMIT),
      },
      enforceOrganization: true,
      forceServiceToken: true,
    }),
  ])

  const roles = rolesRes.ok && Array.isArray(rolesRes.data) ? rolesRes.data : []
  if (!rolesRes.ok) {
    errors.push(rolesRes.error)
  }

  const permisos = new Map<string, SupabasePermissionRow>()
  if (permisosRes.ok && Array.isArray(permisosRes.data)) {
    permisosRes.data.forEach((permiso) => {
      permisos.set(permiso.id, permiso)
    })
  } else if (!permisosRes.ok) {
    errors.push(permisosRes.error)
  }

  const permisosPorRol = new Map<string, string[]>()
  if (rolesPermisosRes.ok && Array.isArray(rolesPermisosRes.data)) {
    rolesPermisosRes.data.forEach((entry) => {
      if (!entry?.rol_id || !entry?.permiso_id) return
      const list = permisosPorRol.get(entry.rol_id) ?? []
      list.push(entry.permiso_id)
      permisosPorRol.set(entry.rol_id, list)
    })
  } else if (!rolesPermisosRes.ok) {
    errors.push(rolesPermisosRes.error)
  }

  const usuariosPorRol = new Map<string, number>()
  if (usuariosRolesRes.ok && Array.isArray(usuariosRolesRes.data)) {
    usuariosRolesRes.data.forEach((entry) => {
      if (!entry?.rol_id) return
      usuariosPorRol.set(entry.rol_id, (usuariosPorRol.get(entry.rol_id) ?? 0) + 1)
    })
  } else if (!usuariosRolesRes.ok) {
    errors.push(usuariosRolesRes.error)
  }

  const items: HrRoleItem[] = roles.map((rol) => {
    const permisoIds = permisosPorRol.get(rol.id) ?? []
    const permisoLabels = permisoIds
      .map((permisoId) => {
        const registro = permisos.get(permisoId)
        return sanitizeText(registro?.codigo) || sanitizeText(registro?.descripcion) || permisoId
      })
      .filter((value) => Boolean(value))

    return {
      id: rol.id,
      codigo: sanitizeText(rol.codigo) || rol.id,
      nombre: sanitizeText(rol.nombre) || sanitizeText(rol.codigo) || "Sin nombre",
      descripcion: sanitizeText(rol.descripcion) || "—",
      usuarios: usuariosPorRol.get(rol.id) ?? 0,
      permisos: permisoLabels as string[],
      creadoEn: rol.creado_en ?? null,
    }
  })

  const total = rolesRes.ok
    ? parseTotalFromRange(rolesRes.headers.get("content-range"))
    : 0
  const totalPermisosAsignados = Array.from(permisosPorRol.values()).reduce(
    (sum, list) => sum + list.length,
    0,
  )
  const totalUsuariosConRol = Array.from(usuariosPorRol.values()).reduce(
    (sum, count) => sum + count,
    0,
  )

  console.info("[settings/hr.roles] fetch summary", {
    roles: summarizeResult(rolesRes),
    permisos: summarizeResult(permisosRes),
    rolesPermisos: summarizeResult(rolesPermisosRes),
    usuariosRoles: summarizeResult(usuariosRolesRes),
    errors,
  })

  return {
    items,
    total,
    stats: {
      permisos: totalPermisosAsignados,
      usuarios: totalUsuariosConRol,
    },
    errors,
  }
}

export async function fetchPermissionsDirectory(): Promise<HrPermissionsDirectory> {
  const errors: string[] = []

  const [permisosRes, rolesPermisosRes, rolesRes] = await Promise.all([
    callSupabaseRest<SupabasePermissionRow[]>("/rest/v1/permisos", {
      searchParams: {
        select: "id,codigo,descripcion,creado_en",
        order: "creado_en.desc",
        limit: String(LARGE_LIMIT),
      },
      prefer: "count=exact",
      enforceOrganization: true,
      forceServiceToken: true,
    }),
    callSupabaseRest<SupabaseRolePermissionRow[]>("/rest/v1/roles_permisos", {
      searchParams: {
        select: "rol_id,permiso_id",
        limit: String(LARGE_LIMIT),
      },
      enforceOrganization: true,
      forceServiceToken: true,
    }),
    callSupabaseRest<SupabaseRoleRow[]>("/rest/v1/roles", {
      searchParams: {
        select: "id,codigo,nombre",
        limit: String(LARGE_LIMIT),
      },
      enforceOrganization: true,
      forceServiceToken: true,
    }),
  ])

  const permisos = permisosRes.ok && Array.isArray(permisosRes.data) ? permisosRes.data : []
  if (!permisosRes.ok) {
    errors.push(permisosRes.error)
  }

  const roles = new Map<string, string>()
  if (rolesRes.ok && Array.isArray(rolesRes.data)) {
    rolesRes.data.forEach((rol) => {
      roles.set(rol.id, sanitizeText(rol.nombre) || sanitizeText(rol.codigo) || rol.id)
    })
  } else if (!rolesRes.ok) {
    errors.push(rolesRes.error)
  }

  const rolesPorPermiso = new Map<string, string[]>()
  if (rolesPermisosRes.ok && Array.isArray(rolesPermisosRes.data)) {
    rolesPermisosRes.data.forEach((entry) => {
      if (!entry?.permiso_id || !entry?.rol_id) return
      const list = rolesPorPermiso.get(entry.permiso_id) ?? []
      list.push(entry.rol_id)
      rolesPorPermiso.set(entry.permiso_id, list)
    })
  } else if (!rolesPermisosRes.ok) {
    errors.push(rolesPermisosRes.error)
  }

  const items: HrPermissionItem[] = permisos.map((permiso) => {
    const roleIds = rolesPorPermiso.get(permiso.id) ?? []
    const roleNames = roleIds
      .map((rolId) => roles.get(rolId))
      .filter((value): value is string => Boolean(value))

    return {
      id: permiso.id,
      codigo: sanitizeText(permiso.codigo) || permiso.id,
      descripcion: sanitizeText(permiso.descripcion) || "—",
      roles: roleNames,
      creadoEn: permiso.creado_en ?? null,
    }
  })

  const total = permisosRes.ok
    ? parseTotalFromRange(permisosRes.headers.get("content-range"))
    : 0
  const sinRol = items.filter((permiso) => permiso.roles.length === 0).length

  return {
    items,
    total,
    stats: { sinRol },
    errors,
  }
}

export async function fetchRolePermissionMatrix(): Promise<HrRolePermissionMatrix> {
  const errors: string[] = []

  const [rolesRes, permisosRes, rolesPermisosRes] = await Promise.all([
    callSupabaseRest<SupabaseRoleRow[]>("/rest/v1/roles", {
      searchParams: {
        select: "id,codigo,nombre",
        order: "creado_en.asc",
        limit: String(LARGE_LIMIT),
      },
      enforceOrganization: true,
      forceServiceToken: true,
    }),
    callSupabaseRest<SupabasePermissionRow[]>("/rest/v1/permisos", {
      searchParams: {
        select: "id,codigo,descripcion",
        order: "codigo.asc",
        limit: String(LARGE_LIMIT),
      },
      enforceOrganization: true,
      forceServiceToken: true,
    }),
    callSupabaseRest<SupabaseRolePermissionRow[]>("/rest/v1/roles_permisos", {
      searchParams: {
        select: "rol_id,permiso_id",
        limit: String(LARGE_LIMIT),
      },
      enforceOrganization: true,
      forceServiceToken: true,
    }),
  ])

  const roles = rolesRes.ok && Array.isArray(rolesRes.data) ? rolesRes.data : []
  if (!rolesRes.ok) {
    errors.push(rolesRes.error)
  }

  const permisos = permisosRes.ok && Array.isArray(permisosRes.data) ? permisosRes.data : []
  if (!permisosRes.ok) {
    errors.push(permisosRes.error)
  }

  const assignments: Record<string, string[]> = {}
  if (rolesPermisosRes.ok && Array.isArray(rolesPermisosRes.data)) {
    rolesPermisosRes.data.forEach((entry) => {
      if (!entry?.rol_id || !entry?.permiso_id) return
      const list = assignments[entry.rol_id] ?? []
      list.push(entry.permiso_id)
      assignments[entry.rol_id] = list
    })
  } else if (!rolesPermisosRes.ok) {
    errors.push(rolesPermisosRes.error)
  }

  return {
    roles: roles.map((rol) => ({
      id: rol.id,
      codigo: sanitizeText(rol.codigo) || rol.id,
      nombre: sanitizeText(rol.nombre) || sanitizeText(rol.codigo) || "Sin nombre",
    })),
    permisos: permisos.map((permiso) => ({
      id: permiso.id,
      codigo: sanitizeText(permiso.codigo) || permiso.id,
      descripcion: sanitizeText(permiso.descripcion) || "—",
    })),
    assignments,
    errors,
  }
}

export async function fetchDepartmentOptions(): Promise<{
  options: HrDepartmentOption[]
  errors: string[]
}> {
  const response = await callSupabaseRest<SupabaseDepartmentRow[]>("/rest/v1/departamentos", {
    searchParams: {
      select: "id,nombre",
      order: "nombre.asc",
      limit: String(LARGE_LIMIT),
    },
    enforceOrganization: true,
    forceServiceToken: true,
  })

  if (!response.ok) {
    return { options: [], errors: [response.error] }
  }

  const departamentos = Array.isArray(response.data) ? response.data : []
  const options = departamentos.map((dept) => ({
    id: dept.id,
    nombre: sanitizeText(dept.nombre) || "Sin nombre",
  }))

  return { options, errors: [] }
}

export async function fetchAssignmentLookups(): Promise<HrAssignmentLookups> {
  const errors: string[] = []

  const [departamentosRes, puestosRes, usuariosRes, empleadosRes, supervisorsRes] = await Promise.all([
    callSupabaseRest<SupabaseDepartmentRow[]>("/rest/v1/departamentos", {
      searchParams: {
        select: "id,nombre",
        order: "nombre.asc",
        limit: String(LARGE_LIMIT),
      },
      enforceOrganization: true,
      forceServiceToken: true,
    }),
    callSupabaseRest<SupabasePositionRow[]>("/rest/v1/puestos", {
      searchParams: {
        select: "id,nombre,departamento_id",
        order: "nombre.asc",
        limit: String(LARGE_LIMIT),
      },
      enforceOrganization: true,
      forceServiceToken: true,
    }),
    callSupabaseRest<SupabaseUserRow[]>("/rest/v1/usuarios", {
      searchParams: {
        select: "id,correo,nombre_completo",
        order: "nombre_completo.asc",
        limit: String(LARGE_LIMIT),
      },
      enforceOrganization: true,
      forceServiceToken: true,
    }),
    callSupabaseRest<SupabaseSimpleEmployeeRow[]>("/rest/v1/empleados", {
      searchParams: {
        select: "usuario_id",
        limit: String(LARGE_LIMIT),
      },
      enforceOrganization: true,
      forceServiceToken: true,
    }),
    callSupabaseRest<SupabaseEmployeeRow[]>("/rest/v1/empleados", {
      searchParams: {
        select: "usuario_id,usuario:usuarios(id,correo,nombre_completo)",
        limit: String(LARGE_LIMIT),
      },
      enforceOrganization: true,
      forceServiceToken: true,
    }),
  ])

  const departamentos =
    departamentosRes.ok && Array.isArray(departamentosRes.data)
      ? departamentosRes.data.map((dept) => ({
          id: dept.id,
          nombre: sanitizeText(dept.nombre) || "Sin nombre",
        }))
      : []
  if (!departamentosRes.ok) {
    errors.push(departamentosRes.error)
  }

  const departamentoNombreMap = new Map(departamentos.map((dept) => [dept.id, dept.nombre]))
  const puestos =
    puestosRes.ok && Array.isArray(puestosRes.data)
      ? puestosRes.data.map((puesto) => ({
          id: puesto.id,
          nombre: sanitizeText(puesto.nombre) || "Sin nombre",
          departamentoNombre: puesto.departamento_id
            ? departamentoNombreMap.get(puesto.departamento_id) || "Sin departamento"
            : "Sin departamento",
        }))
      : []
  if (!puestosRes.ok) {
    errors.push(puestosRes.error)
  }

  const usuariosAsignados = new Set<string>()
  if (empleadosRes.ok && Array.isArray(empleadosRes.data)) {
    empleadosRes.data.forEach((row) => {
      if (row?.usuario_id) {
        usuariosAsignados.add(row.usuario_id)
      }
    })
  } else if (!empleadosRes.ok) {
    errors.push(empleadosRes.error)
  }

  const usuarios =
    usuariosRes.ok && Array.isArray(usuariosRes.data)
      ? usuariosRes.data
          .filter((usuario) => !usuariosAsignados.has(usuario.id))
          .map((usuario) => ({
            id: usuario.id,
            nombre: sanitizeText(usuario.nombre_completo) || "Sin nombre",
            correo: sanitizeText(usuario.correo).toLowerCase(),
          }))
      : []
  if (!usuariosRes.ok) {
    errors.push(usuariosRes.error)
  }

  const supervisores =
    supervisorsRes.ok && Array.isArray(supervisorsRes.data)
      ? supervisorsRes.data
          .map((row) => {
            const user = row.usuario
            if (!user?.id) return null
            return {
              id: user.id,
              nombre: sanitizeText(user.nombre_completo) || "Sin nombre",
              correo: sanitizeText(user.correo).toLowerCase(),
            }
          })
          .filter((item): item is HrEmployeeUserOption => Boolean(item))
      : []
  if (!supervisorsRes.ok) {
    errors.push(supervisorsRes.error)
  }

  return {
    departamentos,
    puestos,
    usuarios,
    supervisores,
    errors,
  }
}

function mapEmployeeRow(
  row: SupabaseEmployeeRow,
  supervisor: SupabaseSupervisorRow | undefined,
): HrEmployeeItem {
  return {
    id: row.usuario_id,
    nombre: sanitizeText(row.usuario?.nombre_completo) || "Sin nombre",
    correo: sanitizeText(row.usuario?.correo).toLowerCase(),
    telefono: sanitizeText(row.usuario?.telefono_e164) || "—",
    estado: normalizeEstado(row.usuario?.estado),
    supervisorId: supervisor?.supervisor_id ?? null,
    supervisorNombre: sanitizeText(supervisor?.supervisor?.nombre_completo) || null,
    supervisorCorreo: sanitizeText(supervisor?.supervisor?.correo).toLowerCase() || null,
    departamento: row.departamento?.nombre
      ? sanitizeText(row.departamento.nombre) || "Sin departamento"
      : "Sin departamento",
    departamentoId: row.departamento_id,
    puesto: row.puesto?.nombre
      ? sanitizeText(row.puesto.nombre) || "Sin puesto"
      : "Sin puesto",
    puestoId: row.puesto_id,
    esGestor: Boolean(row.es_gestor),
    esVendedor: Boolean(row.es_vendedor),
    creadoEn: row.creado_en ?? null,
  }
}

function sanitizeText(value: string | null | undefined): string {
  if (typeof value !== "string") return ""
  const trimmed = value.trim()
  return trimmed.length ? trimmed : ""
}

function normalizeEstado(value: string | null | undefined): string {
  if (!value) return "desconocido"
  const normalized = value.trim().toLowerCase()
  if (!normalized.length) return "desconocido"
  return normalized
}

function parseTotalFromRange(range: string | null): number {
  if (!range) return 0
  const match = range.match(/\/(\d+)$/)
  return match ? Number(match[1]) : 0
}
