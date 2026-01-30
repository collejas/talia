"use server"

import { revalidatePath } from "next/cache"

import { callCrmApi } from "@/lib/api/crm"

export async function createTenant(formData: FormData): Promise<void> {
  const nombre = String(formData.get("nombre") ?? "").trim()
  const razonSocial = String(formData.get("razon_social") ?? "").trim()
  const dominio = String(formData.get("dominio_principal") ?? "").trim()
  const webchatAlias = String(formData.get("webchat_alias") ?? "").trim()

  if (!nombre) {
    throw new Error("El nombre es obligatorio.")
  }

  const response = await callCrmApi<{ ok: boolean; tenant?: { id: string } }>(
    "/admin/tenants",
    {
      method: "POST",
      organizacionId: null,
      withUserToken: true,
      body: {
        nombre,
        razon_social: razonSocial || undefined,
        dominio_principal: dominio || undefined,
        webchat_alias: webchatAlias || undefined,
      },
    },
  )

  if (!response.ok) {
    throw new Error(response.error)
  }

  revalidatePath("/settings/tenants")
}
