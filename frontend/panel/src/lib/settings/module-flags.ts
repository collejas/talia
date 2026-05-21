"use server"

import { redirect } from "next/navigation"

import { callCrmApi } from "@/lib/api/crm"

export type TenantModuleFlags = {
  webchatEnabled: boolean
  whatsappEnabled: boolean
  messengerEnabled: boolean
  voiceEnabled: boolean
  productosEnabled: boolean
  propiedadesEnabled: boolean
}

type TenantSettingsResponse = {
  config?: Record<string, unknown> | null
}

function readFlag(features: Record<string, unknown> | null | undefined, key: string): boolean {
  if (!features || typeof features !== "object" || Array.isArray(features)) {
    return false
  }
  const entry = features[key]
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    return false
  }
  return Boolean((entry as Record<string, unknown>).enabled)
}

export async function fetchTenantModuleFlags(): Promise<TenantModuleFlags> {
  const response = await callCrmApi<TenantSettingsResponse>("/tenant/me/settings", {
    organizacionId: null,
    withUserToken: true,
  })
  if (!response.ok || !response.data?.config || typeof response.data.config !== "object") {
    return {
      webchatEnabled: false,
      whatsappEnabled: false,
      messengerEnabled: false,
      voiceEnabled: false,
      productosEnabled: false,
      propiedadesEnabled: false,
    }
  }
  const config = response.data.config
  const features = config.features
  return {
    webchatEnabled: readFlag(features as Record<string, unknown> | null | undefined, "webchat"),
    whatsappEnabled: readFlag(features as Record<string, unknown> | null | undefined, "whatsapp"),
    messengerEnabled: readFlag(features as Record<string, unknown> | null | undefined, "messenger"),
    voiceEnabled: readFlag(features as Record<string, unknown> | null | undefined, "voice"),
    productosEnabled: readFlag(features as Record<string, unknown> | null | undefined, "productos"),
    propiedadesEnabled: readFlag(features as Record<string, unknown> | null | undefined, "propiedades"),
  }
}

export async function requireTenantModuleEnabled(moduleName: "productos" | "propiedades"): Promise<void> {
  const flags = await fetchTenantModuleFlags()
  if (moduleName === "productos" && !flags.productosEnabled) {
    redirect("/unauthorized")
  }
  if (moduleName === "propiedades" && !flags.propiedadesEnabled) {
    redirect("/unauthorized")
  }
}
