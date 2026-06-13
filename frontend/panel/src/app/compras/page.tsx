import Link from "next/link"
import { AppViewLayout } from "@/components/layouts/app-view-layout"
import { callCrmApi } from "@/lib/api/crm"

import { ComprasWorkspace } from "../settings/compras/compras-workspace.client"

type AnyRecord = Record<string, unknown>
type ComprasResumen = {
  almacenes: number
  ordenes_abiertas: number
  recepciones: number
}

async function fetchList(path: string, searchParams?: Record<string, string | number | boolean | undefined>) {
  const response = await callCrmApi<AnyRecord[]>(path, { searchParams })
  if (!response.ok || !Array.isArray(response.data)) {
    return []
  }
  return response.data
}

async function fetchOne(path: string) {
  const response = await callCrmApi<AnyRecord>(path)
  if (!response.ok || !response.data || typeof response.data !== "object") {
    return null
  }
  return response.data
}

async function fetchComprasResumen(): Promise<ComprasResumen> {
  const response = await callCrmApi<ComprasResumen>("/crm/compras/resumen")
  if (!response.ok || !response.data) {
    return { almacenes: 0, ordenes_abiertas: 0, recepciones: 0 }
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

function nextSequentialCode(prefix: string, values: Array<unknown>, width = 3): string {
  const normalizedPrefix = prefix.trim()
  const lowerPrefix = normalizedPrefix.toLowerCase()
  let highest = 0
  for (const value of values) {
    const code = asString(value).trim()
    if (!code.toLowerCase().startsWith(lowerPrefix)) {
      continue
    }
    const suffix = code.slice(normalizedPrefix.length).trim()
    const match = suffix.match(/(\d+)$/)
    if (!match) {
      continue
    }
    const parsed = Number(match[1])
    if (Number.isFinite(parsed)) {
      highest = Math.max(highest, parsed)
    }
  }
  return `${normalizedPrefix}${String(highest + 1).padStart(width, "0")}`
}

function isInventoryCatalogItem(item: AnyRecord): boolean {
  return Boolean(item.maneja_inventario ?? item.manejaInventario)
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

const COMPRAS_VIEWS = ["resumen", "almacenes", "proveedores", "ordenes", "pedimentos", "agentes", "inventario", "recepciones", "pagos"] as const
type ComprasView = (typeof COMPRAS_VIEWS)[number]

type ComprasPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

export default async function ComprasPage({ searchParams }: ComprasPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : {}
  const vistaParam = resolvedSearchParams.vista
  const requestedView = typeof vistaParam === "string" ? vistaParam : Array.isArray(vistaParam) ? vistaParam[0] : "resumen"
  const normalizedRequestedView = requestedView === "pagos" ? "ordenes" : requestedView
  const activeView: ComprasView = COMPRAS_VIEWS.includes(normalizedRequestedView as ComprasView)
    ? (normalizedRequestedView as ComprasView)
    : "resumen"
  const ordenIdParam = resolvedSearchParams.orden_id
  const defaultPaymentOrderId =
    typeof ordenIdParam === "string"
      ? ordenIdParam
      : Array.isArray(ordenIdParam)
        ? ordenIdParam[0] ?? ""
        : ""
  const isResumenView = activeView === "resumen"
  const isAlmacenesView = activeView === "almacenes"
  const isProveedoresView = activeView === "proveedores"
  const isOrdenesView = activeView === "ordenes"
  const isPedimentosView = activeView === "pedimentos"
  const isAgentesView = activeView === "agentes"
  const isInventarioView = activeView === "inventario"
  const isRecepcionesView = activeView === "recepciones"

  let almacenes: AnyRecord[] = []
  let proveedores: AnyRecord[] = []
  let proveedorContactos: AnyRecord[] = []
  let proveedorCuentasBancarias: AnyRecord[] = []
  let personas: AnyRecord[] = []
  let catalogItems: AnyRecord[] = []
  let ordenes: AnyRecord[] = []
  let recepciones: AnyRecord[] = []
  let existencias: AnyRecord[] = []
  let incoterms: AnyRecord[] = []
  let monedas: AnyRecord[] = []
  let modosTransporte: AnyRecord[] = []
  let paises: AnyRecord[] = []
  let agentesAduanales: AnyRecord[] = []
  let pedimentosImportacion: AnyRecord[] = []
  let comprasResumen: ComprasResumen = { almacenes: 0, ordenes_abiertas: 0, recepciones: 0 }

  if (isResumenView) {
    comprasResumen = await fetchComprasResumen()
  } else if (isAlmacenesView) {
    ;[almacenes] = await Promise.all([fetchList("/crm/compras/almacenes", { include_inactive: false, limit: 100 })])
  } else if (isProveedoresView) {
    ;[almacenes, proveedores, proveedorContactos, proveedorCuentasBancarias, personas] = await Promise.all([
      fetchList("/crm/compras/almacenes", { include_inactive: false, limit: 100 }),
      fetchList("/crm/compras/proveedores", { include_inactive: false, limit: 100 }),
      fetchList("/crm/compras/proveedores-relaciones/contactos", { include_inactive: false, limit: 500 }),
      fetchList("/crm/compras/proveedores-relaciones/cuentas-bancarias", { include_inactive: false, limit: 500 }),
      fetchList("/crm/personas/list", { limit: 500 }),
    ])
  } else if (isOrdenesView) {
    ;[almacenes, proveedores, catalogItems, ordenes, incoterms, monedas, modosTransporte, paises, agentesAduanales, pedimentosImportacion] =
      await Promise.all([
        fetchList("/crm/compras/almacenes", { include_inactive: false, limit: 100 }),
        fetchList("/crm/compras/proveedores", { include_inactive: false, limit: 100 }),
        fetchList("/crm/catalog/items", { include_inactive: false, limit: 1000 }),
        fetchList("/crm/compras/ordenes", { solo_abiertas: false, limit: 100 }),
        fetchList("/crm/compras/catalogos/incoterms", { limit: 200 }),
        fetchList("/crm/compras/catalogos/monedas", { limit: 200 }),
        fetchList("/crm/compras/catalogos/modos-transporte", { limit: 200 }),
        fetchList("/crm/compras/catalogos/paises", { limit: 250 }),
        fetchList("/crm/compras/agentes-aduanales", { incluir_inactivos: true, limit: 200 }),
        fetchList("/crm/compras/pedimentos", { incluir_cancelados: true, limit: 200 }),
      ])
  } else if (isPedimentosView || isAgentesView) {
    ;[ordenes, monedas, agentesAduanales, pedimentosImportacion] = await Promise.all([
      fetchList("/crm/compras/ordenes", { solo_abiertas: false, limit: 100 }),
      fetchList("/crm/compras/catalogos/monedas", { limit: 200 }),
      fetchList("/crm/compras/agentes-aduanales", { incluir_inactivos: true, limit: 200 }),
      fetchList("/crm/compras/pedimentos", { incluir_cancelados: true, limit: 200 }),
    ])
  } else if (isInventarioView) {
    ;[almacenes, catalogItems, existencias] = await Promise.all([
      fetchList("/crm/compras/almacenes", { include_inactive: false, limit: 100 }),
      fetchList("/crm/catalog/items", { include_inactive: false, limit: 1000 }),
      fetchList("/crm/compras/existencias", { limit: 200 }),
    ])
  } else if (isRecepcionesView) {
    ;[almacenes, ordenes, recepciones] = await Promise.all([
      fetchList("/crm/compras/almacenes", { include_inactive: false, limit: 100 }),
      fetchList("/crm/compras/ordenes", { solo_abiertas: false, limit: 100 }),
      fetchList("/crm/compras/recepciones", { limit: 25 }),
    ])
  }

  const inventoryCatalogItems = catalogItems.filter(isInventoryCatalogItem)

  const principalWarehouse = almacenes.find((almacen) => Boolean(almacen.es_principal)) ?? almacenes[0] ?? null
  const firstOrder = ordenes[0] ?? null
  const defaultWarehouseId = principalWarehouse
    ? asString(principalWarehouse.id)
    : firstOrder
      ? asString(firstOrder.almacen_destino_id)
      : ""
  const defaultWarehouseCode = nextSequentialCode("AL-", almacenes.map((almacen) => almacen.codigo))
  const defaultProviderCode = nextSequentialCode("Prov-", proveedores.map((proveedor) => proveedor.codigo_proveedor))
  const defaultOrderId = firstOrder ? asString(firstOrder.id) : ""
  const defaultOrderFolio = [
    "OC-",
    new Date().getFullYear(),
    String(new Date().getMonth() + 1).padStart(2, "0"),
    String(new Date().getDate()).padStart(2, "0"),
    "-",
    String(new Date().getHours()).padStart(2, "0"),
    String(new Date().getMinutes()).padStart(2, "0"),
    String(new Date().getSeconds()).padStart(2, "0"),
  ].join("")
  const defaultOrderEmissionIso = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City" }).format(new Date())
  const pedimentoIdParam = resolvedSearchParams.pedimento_id
  const requestedPedimentoId =
    typeof pedimentoIdParam === "string"
      ? pedimentoIdParam
      : Array.isArray(pedimentoIdParam)
        ? pedimentoIdParam[0] ?? ""
        : ""
  const effectivePedimentoId = requestedPedimentoId
  const selectedPedimento =
    effectivePedimentoId && (isPedimentosView || isAgentesView)
      ? await fetchOne(`/crm/compras/pedimentos/${encodeURIComponent(effectivePedimentoId)}`)
      : null

  const views: Array<{ value: ComprasView; label: string }> = [
    { value: "resumen", label: "Resumen" },
    { value: "almacenes", label: "Almacenes" },
    { value: "proveedores", label: "Proveedores" },
    { value: "ordenes", label: "Órdenes" },
    { value: "pedimentos", label: "Pedimentos" },
    { value: "agentes", label: "Agentes" },
    { value: "inventario", label: "Inventario" },
    { value: "recepciones", label: "Recepciones" },
  ]

  return (
    <AppViewLayout title="Compras">
      <div className="space-y-6 px-4 py-6 lg:px-6">
        <header className="space-y-1">
          <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">Operación</p>
          <h1 className="text-2xl font-semibold">Compras e inventario</h1>
          <p className="text-sm text-muted-foreground">
            Captura almacenes y recepciones con una experiencia simple, visual y sin campos técnicos expuestos al usuario.
          </p>
        </header>

        <div className="flex flex-wrap gap-2 rounded-2xl border bg-background p-2 shadow-sm">
          {views.map((view) => {
            const isActive = view.value === activeView
            return (
              <Link
                key={view.value}
                href={`/compras?vista=${view.value}`}
                className={`rounded-xl px-4 py-2 text-sm font-medium transition-colors ${
                  isActive ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                {view.label}
              </Link>
            )
          })}
        </div>

        <ComprasWorkspace
          almacenes={almacenes}
          proveedores={proveedores}
          proveedorContactos={proveedorContactos}
          proveedorCuentasBancarias={proveedorCuentasBancarias}
          personas={personas}
          catalogItems={inventoryCatalogItems}
          ordenes={ordenes}
          recepciones={recepciones}
          existencias={existencias}
          incoterms={incoterms}
          monedas={monedas}
          modosTransporte={modosTransporte}
          paises={paises}
          agentesAduanales={agentesAduanales}
          pedimentosImportacion={pedimentosImportacion}
          selectedPedimento={selectedPedimento}
          selectedPedimentoId={effectivePedimentoId}
          defaultOrderId={defaultOrderId}
          defaultWarehouseId={defaultWarehouseId}
          defaultWarehouseCode={defaultWarehouseCode}
          defaultProviderCode={defaultProviderCode}
          defaultReceptionNumber={makeDefaultReceptionNumber()}
          defaultOrderFolio={defaultOrderFolio}
          defaultOrderEmissionIso={defaultOrderEmissionIso}
          defaultPaymentOrderId={defaultPaymentOrderId}
          resumen={{
            almacenes: comprasResumen.almacenes,
            ordenesAbiertas: comprasResumen.ordenes_abiertas,
            recepciones: comprasResumen.recepciones,
          }}
          activeView={activeView}
        />
      </div>
    </AppViewLayout>
  )
}
