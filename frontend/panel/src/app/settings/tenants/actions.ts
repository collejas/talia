"use server"

import { revalidatePath } from "next/cache"

import { callCrmApi } from "@/lib/api/crm"

type TenantPayload = {
  nombre: string
  razon_social?: string
  dominio_principal?: string
  rfc?: string
  webchat_alias?: string
  pais?: string
  estado?: string
  ciudad?: string
  telefono?: string
  sitio_web?: string
  activo?: boolean
  estado_onboarding?: string
  config?: Record<string, unknown>
  commercial_plan_id?: string
  commercial_access_status?: "active" | "grace" | "blocked" | "manual_review" | "internal_free"
}

type AdminPayload = {
  correo: string
  nombre_completo?: string
  telefono?: string
  estado?: "activo" | "bloqueado"
}

export type TenantWithAdminPayload = {
  tenant: TenantPayload
  admin: AdminPayload
}

type SeedPayload = {
  departamento: string
  puesto: string
  rol_nombre: string
  rol_descripcion?: string
  permisos: { codigo: string; descripcion?: string }[]
}

export type TenantCreationResponse = {
  tenant_id: string
  usuario_id: string
  seed: {
    rol_id: string
    permisos_ids: string[]
    departamento_id: string
    puesto_id: string
    empleado_id: string
  }
  recovery_email_sent: boolean
  activo?: boolean | null
}

export type TenantCreationActionResult =
  | { ok: true; data: TenantCreationResponse }
  | { ok: false; error: string }

const DEFAULT_SEED: SeedPayload = {
  departamento: "Administración",
  puesto: "Admin CRM",
  rol_nombre: "Admin",
  rol_descripcion: "Administrador principal",
  permisos: [
    { codigo: "usuarios.write", descripcion: "Gestionar usuarios" },
    { codigo: "roles.write", descripcion: "Gestionar roles" },
  ],
}

export async function createTenantWithAdmin(
  payload: TenantWithAdminPayload,
): Promise<TenantCreationActionResult> {
  const nombre = payload.tenant.nombre?.trim()
  if (!nombre) {
    return { ok: false, error: "El nombre del tenant es obligatorio." }
  }
  const correo = payload.admin.correo?.trim()
  if (!correo) {
    return { ok: false, error: "El correo del admin es obligatorio." }
  }

  const tenantBody: TenantPayload = {
    nombre,
    razon_social: payload.tenant.razon_social?.trim() || undefined,
    dominio_principal: payload.tenant.dominio_principal?.trim() || undefined,
    webchat_alias: payload.tenant.webchat_alias?.trim().toLowerCase() || undefined,
    pais: payload.tenant.pais?.trim() || undefined,
    estado: payload.tenant.estado?.trim() || undefined,
    ciudad: payload.tenant.ciudad?.trim() || undefined,
    telefono: payload.tenant.telefono?.trim() || undefined,
    sitio_web: payload.tenant.sitio_web?.trim() || undefined,
    activo: payload.tenant.activo,
    estado_onboarding: payload.tenant.estado_onboarding?.trim() || undefined,
    rfc: payload.tenant.rfc?.trim() || undefined,
    config: payload.tenant.config,
    commercial_plan_id: payload.tenant.commercial_plan_id?.trim() || undefined,
    commercial_access_status: payload.tenant.commercial_access_status,
  }

  const response = await callCrmApi<TenantCreationResponse>("/admin/tenants/con_usuario", {
    method: "POST",
    organizacionId: null,
    withUserToken: true,
    body: {
      tenant: tenantBody,
      admin: {
        correo,
        nombre_completo: payload.admin.nombre_completo?.trim() || undefined,
        telefono: payload.admin.telefono?.trim() || undefined,
        estado: payload.admin.estado || "activo",
      },
      seed: DEFAULT_SEED,
    },
  })

  if (!response.ok) {
    return { ok: false, error: response.error || "No se pudo crear el tenant." }
  }

  revalidatePath("/settings/tenants")
  return { ok: true, data: response.data }
}
