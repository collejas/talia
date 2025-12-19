export type HrEmployeeItem = {
  id: string
  nombre: string
  correo: string
  telefono: string
  estado: string
  departamento: string
  departamentoId: string | null
  puesto: string
  puestoId: string | null
  esGestor: boolean
  esVendedor: boolean
  creadoEn: string | null
}

export type HrEmployeesDirectory = {
  items: HrEmployeeItem[]
  total: number
  stats: { gestores: number; vendedores: number }
  errors: string[]
}

export type HrDepartmentItem = {
  id: string
  nombre: string
  padreId: string | null
  padreNombre: string
  puestos: number
  empleados: number
  creadoEn: string | null
}

export type HrDepartmentsDirectory = {
  items: HrDepartmentItem[]
  total: number
  stats: { puestos: number; empleados: number }
  errors: string[]
}

export type HrPositionItem = {
  id: string
  nombre: string
  descripcion: string
  departamento: string
  empleados: number
  creadoEn: string | null
}

export type HrPositionsDirectory = {
  items: HrPositionItem[]
  total: number
  stats: { empleados: number }
  errors: string[]
}

export type HrUserItem = {
  id: string
  nombre: string
  correo: string
  estado: string
  telefono: string
  roles: string[]
  departamento: string
  puesto: string
  creadoEn: string | null
  ultimoAcceso: string | null
}

export type HrUsersDirectory = {
  items: HrUserItem[]
  total: number
  stats: { activos: number; bloqueados: number; sinRoles: number }
  errors: string[]
}

export type HrRoleItem = {
  id: string
  codigo: string
  nombre: string
  descripcion: string
  usuarios: number
  permisos: string[]
  creadoEn: string | null
}

export type HrRolesDirectory = {
  items: HrRoleItem[]
  total: number
  stats: { permisos: number; usuarios: number }
  errors: string[]
}

export type HrPermissionItem = {
  id: string
  codigo: string
  descripcion: string
  roles: string[]
  creadoEn: string | null
}

export type HrPermissionsDirectory = {
  items: HrPermissionItem[]
  total: number
  stats: { sinRol: number }
  errors: string[]
}
