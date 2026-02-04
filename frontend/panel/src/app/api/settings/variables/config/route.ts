import { NextResponse } from "next/server"

import { revalidatePath } from "next/cache"

import { callCrmApi } from "@/lib/api/crm"

type TenantSettingsResponse = {
  organizacion_id: string
  config?: Record<string, unknown> | null
}

function mergeDeep(target: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
  for (const [key, value] of Object.entries(patch)) {
    const current = target[key]
    if (value && typeof value === "object" && !Array.isArray(value) && current && typeof current === "object") {
      target[key] = mergeDeep({ ...(current as Record<string, unknown>) }, value as Record<string, unknown>)
      continue
    }
    target[key] = value
  }
  return target
}

export async function POST(request: Request) {
  const body = (await request.json()) as { config?: Record<string, unknown> }
  if (!body.config) {
    return NextResponse.json({ error: "No se indicó la configuración a guardar." }, { status: 400 })
  }

  const settingsResp = await callCrmApi<TenantSettingsResponse>("/tenant/me/settings", {
    organizacionId: null,
    withUserToken: true,
  })

  if (!settingsResp.ok) {
    return NextResponse.json({ error: settingsResp.error }, { status: settingsResp.status ?? 400 })
  }

  const currentConfig = settingsResp.data.config ?? {}
  const mergedConfig = mergeDeep({ ...currentConfig }, body.config)

  const updateResp = await callCrmApi<{ ok: boolean; organizacion_id: string; config: Record<string, unknown> }>(
    "/tenant/me/config",
    {
      method: "PUT",
      organizacionId: null,
      withUserToken: true,
      body: { config: mergedConfig },
    },
  )

  if (!updateResp.ok) {
    return NextResponse.json({ error: updateResp.error }, { status: updateResp.status ?? 400 })
  }

  revalidatePath("/settings/variables")
  return NextResponse.json(updateResp.data)
}
