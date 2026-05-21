import { AppViewLayout } from "@/components/layouts/app-view-layout"
import { callCrmApi } from "@/lib/api/crm"

import { ComprasWorkspace } from "./compras-workspace.client"

type AnyRecord = Record<string, unknown>

async function fetchList(path: string, searchParams?: Record<string, string | number | boolean | undefined>) {
  const response = await callCrmApi<AnyRecord[]>(path, { searchParams })
  if (!response.ok || !Array.isArray(response.data)) {
    return []
  }
  return response.data
}

function asString(value: unknown, fallback = ""): string {
  if (typeof value === "string") {
    const trimmed = value.trim()
    return trimmed.length ? trimmed : fallback
  }
  if (value === null || value === undefined) {
    return fallback
  }
  return String(value)
}

function makeDefaultReceptionNumber(): string {
  const now = new Date()
  const pad = (value: number) => String(value).padStart(2, "0")
  return [
    "RC-",
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    "-",
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds()),
  ].join("")
}

export default async function SettingsComprasPage() {
  const [almacenes, ordenes, recepciones] = await Promise.all([
    fetchList("/crm/compras/almacenes", { include_inactive: false, limit: 100 }),
    fetchList("/crm/compras/ordenes", { limit: 100 }),
    fetchList("/crm/compras/recepciones", { limit: 25 }),
  ])

  const principalWarehouse = almacenes.find((almacen) => Boolean(almacen.es_principal)) ?? almacenes[0] ?? null
  const firstOrder = ordenes[0] ?? null
  const defaultWarehouseId = principalWarehouse
    ? asString(principalWarehouse.id)
    : firstOrder
      ? asString(firstOrder.almacen_destino_id)
      : ""
  const defaultOrderId = firstOrder ? asString(firstOrder.id) : ""

  return (
    <AppViewLayout title="Settings · Compras e inventario">
      <div className="space-y-6 px-4 py-6 lg:px-6">
        <header className="space-y-1">
          <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">Operación</p>
          <h1 className="text-2xl font-semibold">Compras e inventario</h1>
          <p className="text-sm text-muted-foreground">
            Captura almacenes y recepciones con una experiencia simple, visual y sin campos técnicos expuestos al usuario.
          </p>
        </header>

        <ComprasWorkspace
          almacenes={almacenes}
          ordenes={ordenes}
          recepciones={recepciones}
          defaultOrderId={defaultOrderId}
          defaultWarehouseId={defaultWarehouseId}
          defaultReceptionNumber={makeDefaultReceptionNumber()}
        />
      </div>
    </AppViewLayout>
  )
}
