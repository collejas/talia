"use server"

import { revalidatePath } from "next/cache"

import { callCrmApi } from "@/lib/api/crm"

type CommercialPlanPayload = {
  code?: string
  name: string
  description?: string
  active?: boolean
  sort_order?: number
  contract_duration_months?: 1 | 3 | 6 | 9 | 12
  max_installment_count?: 1 | 3 | 6 | 9 | 12
  pricing_model?: "legacy" | "one_time_plus_license"
}

type CommercialPlanPricePayload = {
  plan_id?: string
  billing_provider?: string
  provider_product_id?: string
  provider_price_id?: string
  currency?: string
  billing_interval?: "month" | "year" | "one_time" | "custom"
  amount_cents?: number
  active?: boolean
}

type CommercialPlanEntitlementPayload = {
  plan_id?: string
  entitlement_key?: string
  value_type?: "boolean" | "integer" | "decimal" | "text" | "json"
  enabled?: boolean
  limit_value?: number
  value_text?: string
  value_json?: unknown
  limit_unit?: string
  scope?: string
}

type CommercialPlanDefaultPayload = {
  plan_id?: string
  default_key?: string
  default_value?: string
  scope?: string
}

export type CommercialPlanActionState =
  | { ok: true; message: string }
  | { ok: false; error: string }

function success(message: string): CommercialPlanActionState {
  return { ok: true, message }
}

function failure(error: unknown, fallback: string): CommercialPlanActionState {
  const message =
    error instanceof Error
      ? error.message || fallback
      : typeof error === "string"
        ? error
        : fallback
  console.error("[settings/commercial-plans]", error)
  return { ok: false, error: message }
}

function getText(formData: FormData, key: string): string {
  const value = formData.get(key)
  return typeof value === "string" ? value.trim() : ""
}

function getNumber(formData: FormData, key: string): number | undefined {
  const raw = getText(formData, key)
  if (!raw) return undefined
  const value = Number(raw)
  return Number.isFinite(value) ? value : undefined
}

function getBoolean(formData: FormData, key: string): boolean {
  const value = formData.get(key)
  return value === "on" || value === "true" || value === "1"
}

function requirePlanId(formData: FormData): string {
  const planId = getText(formData, "plan_id")
  if (!planId) throw new Error("Falta plan_id.")
  return planId
}

function requirePriceId(formData: FormData): string {
  const priceId = getText(formData, "price_id")
  if (!priceId) throw new Error("Falta price_id.")
  return priceId
}

function requireEntitlementId(formData: FormData): string {
  const entitlementId = getText(formData, "entitlement_id")
  if (!entitlementId) throw new Error("Falta entitlement_id.")
  return entitlementId
}

function requireDefaultId(formData: FormData): string {
  const defaultId = getText(formData, "default_id")
  if (!defaultId) throw new Error("Falta default_id.")
  return defaultId
}

function buildPayload(formData: FormData, includeCode = true): CommercialPlanPayload {
  const payload: CommercialPlanPayload = {
    name: getText(formData, "name"),
    description: getText(formData, "description") || undefined,
    active: getBoolean(formData, "active"),
    sort_order: getNumber(formData, "sort_order") ?? 0,
    contract_duration_months: getNumber(formData, "contract_duration_months") as CommercialPlanPayload["contract_duration_months"],
    max_installment_count: getNumber(formData, "max_installment_count") as CommercialPlanPayload["max_installment_count"],
    pricing_model: (getText(formData, "pricing_model") as CommercialPlanPayload["pricing_model"]) || "legacy",
  }
  if (includeCode) {
    payload.code = getText(formData, "code")
  }
  return payload
}

function buildPricePayload(formData: FormData, includePlan = true): CommercialPlanPricePayload {
  const payload: CommercialPlanPricePayload = {
    billing_provider: getText(formData, "billing_provider") || "stripe",
    provider_product_id: getText(formData, "provider_product_id"),
    provider_price_id: getText(formData, "provider_price_id"),
    currency: getText(formData, "currency").toUpperCase(),
    billing_interval: (getText(formData, "billing_interval") as CommercialPlanPricePayload["billing_interval"]) || "month",
    amount_cents: getNumber(formData, "amount_cents") ?? 0,
    active: getBoolean(formData, "active"),
  }
  if (includePlan) {
    payload.plan_id = getText(formData, "plan_id")
  }
  return payload
}

function buildEntitlementPayload(formData: FormData, includePlan = true): CommercialPlanEntitlementPayload {
  const rawJson = getText(formData, "value_json")
  let parsedJson: unknown
  if (rawJson) {
    try {
      parsedJson = JSON.parse(rawJson)
    } catch {
      throw new Error("El JSON del valor es inválido.")
    }
  }
  const payload: CommercialPlanEntitlementPayload = {
    entitlement_key: getText(formData, "entitlement_key"),
    value_type: (getText(formData, "value_type") as CommercialPlanEntitlementPayload["value_type"]) || "boolean",
    enabled: getBoolean(formData, "enabled"),
    limit_value: getNumber(formData, "limit_value"),
    value_text: getText(formData, "value_text") || undefined,
    value_json: parsedJson,
    limit_unit: getText(formData, "limit_unit") || undefined,
    scope: getText(formData, "scope") || undefined,
  }
  if (includePlan) {
    payload.plan_id = getText(formData, "plan_id")
  }
  return payload
}

function buildDefaultPayload(formData: FormData, includePlan = true): CommercialPlanDefaultPayload {
  const payload: CommercialPlanDefaultPayload = {
    default_key: getText(formData, "default_key"),
    default_value: getText(formData, "default_value"),
    scope: getText(formData, "scope") || undefined,
  }
  if (includePlan) {
    payload.plan_id = getText(formData, "plan_id")
  }
  return payload
}

export async function createCommercialPlanAction(
  _: CommercialPlanActionState,
  formData: FormData,
): Promise<CommercialPlanActionState> {
  try {
    const payload = buildPayload(formData, true)
    if (!payload.code) throw new Error("El código es obligatorio.")
    if (!payload.name) throw new Error("El nombre es obligatorio.")

    const response = await callCrmApi<{ ok: boolean; plan?: { id: string } }>("/admin/commercial-plans", {
      method: "POST",
      organizacionId: null,
      withUserToken: true,
      body: payload,
    })
    if (!response.ok) throw new Error(response.error)

    revalidatePath("/settings/commercial/plans")
    return success("Plan creado.")
  } catch (error) {
    return failure(error, "No se pudo crear el plan.")
  }
}

export async function createCommercialPlanPriceAction(
  _: CommercialPlanActionState,
  formData: FormData,
): Promise<CommercialPlanActionState> {
  try {
    const payload = buildPricePayload(formData, true)
    if (!payload.plan_id) throw new Error("El plan es obligatorio.")
    if (!payload.provider_product_id) throw new Error("El producto es obligatorio.")
    if (!payload.provider_price_id) throw new Error("El price ID es obligatorio.")
    if (!payload.currency || payload.currency.length !== 3) throw new Error("La moneda es obligatoria.")
    if (!payload.billing_interval) throw new Error("El intervalo es obligatorio.")

    const response = await callCrmApi<{ ok: boolean; price?: { id: string } }>("/admin/commercial-plan-prices", {
      method: "POST",
      organizacionId: null,
      withUserToken: true,
      body: payload,
    })
    if (!response.ok) throw new Error(response.error)

    revalidatePath("/settings/commercial/plans")
    return success("Precio creado.")
  } catch (error) {
    return failure(error, "No se pudo crear el precio.")
  }
}

export async function updateCommercialPlanPriceAction(
  _: CommercialPlanActionState,
  formData: FormData,
): Promise<CommercialPlanActionState> {
  try {
    const priceId = requirePriceId(formData)
    const payload = buildPricePayload(formData, true)
    if (!payload.plan_id) throw new Error("El plan es obligatorio.")
    if (!payload.provider_product_id) throw new Error("El producto es obligatorio.")
    if (!payload.provider_price_id) throw new Error("El price ID es obligatorio.")
    if (!payload.currency || payload.currency.length !== 3) throw new Error("La moneda es obligatoria.")
    if (!payload.billing_interval) throw new Error("El intervalo es obligatorio.")

    const response = await callCrmApi<{ ok: boolean }>(`/admin/commercial-plan-prices/${priceId}`, {
      method: "PATCH",
      organizacionId: null,
      withUserToken: true,
      body: payload,
    })
    if (!response.ok) throw new Error(response.error)

    revalidatePath("/settings/commercial/plans")
    return success("Precio actualizado.")
  } catch (error) {
    return failure(error, "No se pudo actualizar el precio.")
  }
}

export async function syncCommercialPlanPriceToStripeAction(
  formData: FormData,
): Promise<CommercialPlanActionState> {
  try {
    const priceId = requirePriceId(formData)
    const response = await callCrmApi<{ ok: boolean; provider_price_id?: string }>(
      `/admin/commercial-plan-prices/${priceId}/sync-stripe`,
      { method: "POST", organizacionId: null, withUserToken: true },
    )
    if (!response.ok) throw new Error(response.error)
    revalidatePath("/settings/commercial/plans")
    return success(`Precio creado en Stripe: ${response.data.provider_price_id ?? "listo"}.`)
  } catch (error) {
    return failure(error, "No se pudo crear el precio en Stripe.")
  }
}

export async function syncCommercialLicensePriceToStripeAction(
  formData: FormData,
): Promise<CommercialPlanActionState> {
  try {
    const priceId = getText(formData, "license_price_id")
    if (!priceId) throw new Error("Falta license_price_id.")
    const response = await callCrmApi<{ ok: boolean; provider_price_id?: string }>(
      `/admin/commercial-license-prices/${priceId}/sync-stripe`,
      { method: "POST", organizacionId: null, withUserToken: true },
    )
    if (!response.ok) throw new Error(response.error)
    revalidatePath("/settings/commercial/plans")
    return success(`Licencia creada en Stripe: ${response.data.provider_price_id ?? "lista"}.`)
  } catch (error) {
    return failure(error, "No se pudo crear la licencia en Stripe.")
  }
}

export async function archiveCommercialPlanPriceAction(
  formData: FormData,
): Promise<CommercialPlanActionState> {
  try {
    const priceId = requirePriceId(formData)
    const response = await callCrmApi<{ ok: boolean }>(`/admin/commercial-plan-prices/${priceId}`, {
      method: "DELETE",
      organizacionId: null,
      withUserToken: true,
    })
    if (!response.ok) throw new Error(response.error)

    revalidatePath("/settings/commercial/plans")
    return success("Precio desactivado.")
  } catch (error) {
    return failure(error, "No se pudo desactivar el precio.")
  }
}

export async function createCommercialPlanEntitlementAction(
  _: CommercialPlanActionState,
  formData: FormData,
): Promise<CommercialPlanActionState> {
  try {
    const payload = buildEntitlementPayload(formData, true)
    if (!payload.plan_id) throw new Error("El plan es obligatorio.")
    if (!payload.entitlement_key) throw new Error("La llave es obligatoria.")
    if (!payload.value_type) throw new Error("El tipo es obligatorio.")

    const response = await callCrmApi<{ ok: boolean; entitlement?: { id: string } }>(
      "/admin/commercial-plan-entitlements",
      {
        method: "POST",
        organizacionId: null,
        withUserToken: true,
        body: payload,
      },
    )
    if (!response.ok) throw new Error(response.error)

    revalidatePath("/settings/commercial/plans")
    return success("Entitlement creado.")
  } catch (error) {
    return failure(error, "No se pudo crear el entitlement.")
  }
}

export async function updateCommercialPlanEntitlementAction(
  _: CommercialPlanActionState,
  formData: FormData,
): Promise<CommercialPlanActionState> {
  try {
    const entitlementId = requireEntitlementId(formData)
    const payload = buildEntitlementPayload(formData, true)
    if (!payload.plan_id) throw new Error("El plan es obligatorio.")
    if (!payload.entitlement_key) throw new Error("La llave es obligatoria.")
    if (!payload.value_type) throw new Error("El tipo es obligatorio.")

    const response = await callCrmApi<{ ok: boolean }>(
      `/admin/commercial-plan-entitlements/${entitlementId}`,
      {
        method: "PATCH",
        organizacionId: null,
        withUserToken: true,
        body: payload,
      },
    )
    if (!response.ok) throw new Error(response.error)

    revalidatePath("/settings/commercial/plans")
    return success("Entitlement actualizado.")
  } catch (error) {
    return failure(error, "No se pudo actualizar el entitlement.")
  }
}

export async function archiveCommercialPlanEntitlementAction(
  formData: FormData,
): Promise<CommercialPlanActionState> {
  try {
    const entitlementId = requireEntitlementId(formData)
    const response = await callCrmApi<{ ok: boolean }>(
      `/admin/commercial-plan-entitlements/${entitlementId}`,
      {
        method: "DELETE",
        organizacionId: null,
        withUserToken: true,
      },
    )
    if (!response.ok) throw new Error(response.error)

    revalidatePath("/settings/commercial/plans")
    return success("Entitlement desactivado.")
  } catch (error) {
    return failure(error, "No se pudo desactivar el entitlement.")
  }
}

export async function createCommercialPlanDefaultAction(
  _: CommercialPlanActionState,
  formData: FormData,
): Promise<CommercialPlanActionState> {
  try {
    const payload = buildDefaultPayload(formData, true)
    if (!payload.plan_id) throw new Error("El plan es obligatorio.")
    if (!payload.default_key) throw new Error("La llave es obligatoria.")
    if (!payload.default_value) throw new Error("El valor es obligatorio.")

    const response = await callCrmApi<{ ok: boolean; default?: { id: string } }>(
      "/admin/commercial-plan-defaults",
      {
        method: "POST",
        organizacionId: null,
        withUserToken: true,
        body: payload,
      },
    )
    if (!response.ok) throw new Error(response.error)

    revalidatePath("/settings/commercial/plans")
    return success("Default creado.")
  } catch (error) {
    return failure(error, "No se pudo crear el default.")
  }
}

export async function updateCommercialPlanDefaultAction(
  _: CommercialPlanActionState,
  formData: FormData,
): Promise<CommercialPlanActionState> {
  try {
    const defaultId = requireDefaultId(formData)
    const payload = buildDefaultPayload(formData, true)
    if (!payload.plan_id) throw new Error("El plan es obligatorio.")
    if (!payload.default_key) throw new Error("La llave es obligatoria.")
    if (!payload.default_value) throw new Error("El valor es obligatorio.")

    const response = await callCrmApi<{ ok: boolean }>(`/admin/commercial-plan-defaults/${defaultId}`, {
      method: "PATCH",
      organizacionId: null,
      withUserToken: true,
      body: payload,
    })
    if (!response.ok) throw new Error(response.error)

    revalidatePath("/settings/commercial/plans")
    return success("Default actualizado.")
  } catch (error) {
    return failure(error, "No se pudo actualizar el default.")
  }
}

export async function deleteCommercialPlanDefaultAction(
  formData: FormData,
): Promise<CommercialPlanActionState> {
  try {
    const defaultId = requireDefaultId(formData)
    const response = await callCrmApi<{ ok: boolean }>(`/admin/commercial-plan-defaults/${defaultId}`, {
      method: "DELETE",
      organizacionId: null,
      withUserToken: true,
    })
    if (!response.ok) throw new Error(response.error)

    revalidatePath("/settings/commercial/plans")
    return success("Default eliminado.")
  } catch (error) {
    return failure(error, "No se pudo eliminar el default.")
  }
}

export async function updateCommercialPlanAction(
  _: CommercialPlanActionState,
  formData: FormData,
): Promise<CommercialPlanActionState> {
  try {
    const planId = requirePlanId(formData)
    const payload = buildPayload(formData, false)
    if (!payload.name) throw new Error("El nombre es obligatorio.")

    const response = await callCrmApi<{ ok: boolean }>(`/admin/commercial-plans/${planId}`, {
      method: "PATCH",
      organizacionId: null,
      withUserToken: true,
      body: payload,
    })
    if (!response.ok) throw new Error(response.error)

    revalidatePath("/settings/commercial/plans")
    return success("Plan actualizado.")
  } catch (error) {
    return failure(error, "No se pudo actualizar el plan.")
  }
}

export async function archiveCommercialPlanAction(
  formData: FormData,
): Promise<CommercialPlanActionState> {
  try {
    const planId = requirePlanId(formData)
    const response = await callCrmApi<{ ok: boolean }>(`/admin/commercial-plans/${planId}`, {
      method: "DELETE",
      organizacionId: null,
      withUserToken: true,
    })
    if (!response.ok) throw new Error(response.error)

    revalidatePath("/settings/commercial/plans")
    return success("Plan desactivado.")
  } catch (error) {
    return failure(error, "No se pudo desactivar el plan.")
  }
}

export async function updateProspeccionPlanLimitsAction(
  _: CommercialPlanActionState,
  formData: FormData,
): Promise<CommercialPlanActionState> {
  try {
    const planId = requirePlanId(formData)
    const creditsMonth = getNumber(formData, "credits_month")
    const rawResultsMonth = getNumber(formData, "denue_raw_results_month")
    if (creditsMonth === undefined || !Number.isInteger(creditsMonth) || creditsMonth < 0) {
      throw new Error("Los créditos mensuales deben ser un entero mayor o igual a cero.")
    }
    if (rawResultsMonth === undefined || !Number.isInteger(rawResultsMonth) || rawResultsMonth < 0) {
      throw new Error("Los resultados crudos mensuales deben ser un entero mayor o igual a cero.")
    }

    const response = await callCrmApi<{ ok: boolean }>(
      `/admin/commercial-plans/${planId}/prospeccion-limits`,
      {
        method: "PUT",
        organizacionId: null,
        withUserToken: true,
        body: {
          credits_month: creditsMonth,
          denue_raw_results_month: rawResultsMonth,
        },
      },
    )
    if (!response.ok) throw new Error(response.error)

    revalidatePath("/settings/commercial/plans")
    revalidatePath("/settings/tenants")
    return success("Límites de prospección actualizados.")
  } catch (error) {
    return failure(error, "No se pudieron actualizar los límites de prospección.")
  }
}
