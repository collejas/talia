import type { Metadata } from "next"

import { AppViewLayout } from "@/components/layouts/app-view-layout"
import { QuoteVendorsForm } from "@/components/settings/quote-vendors-form"
import { PriceListsManager } from "@/components/settings/price-lists-manager"
import { DiscountLimitsManager } from "@/components/settings/discount-limits-manager"
import { type TenantScopedSettings } from "@/app/settings/variables/components/tenant-variables-panel"
import { callCrmApi } from "@/lib/api/crm"
import { fetchDiscountLimits, fetchPriceListPermissionOptions, fetchPriceLists } from "./actions"
import { TenantExtrasCatalogsForm } from "../tenants/[tenantId]/tenant-forms"

export const metadata: Metadata = {
  title: "Cuenta · Settings",
}

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"

export default async function SettingsAccountPage() {
  const [response, priceLists, permissionOptions, baseLimits] = await Promise.all([
    callCrmApi<TenantScopedSettings>("/tenant/me/settings", {
      organizacionId: null,
      withUserToken: true,
    }),
    fetchPriceLists(),
    fetchPriceListPermissionOptions(),
    fetchDiscountLimits({ tipoPrecio: "base" }),
  ])

  const listLimitEntries = await Promise.all(
    priceLists.filter((item) => item.activo).map(async (item) => [item.id, await fetchDiscountLimits({ tipoPrecio: "lista", listaPrecioId: item.id })] as const),
  )
  const listLimits = Object.fromEntries(listLimitEntries)

  const data = response.ok ? response.data : null
  return (
    <AppViewLayout title="Cuenta" withThemeToggle={false} contentClassName="px-0">
      <div className="flex flex-col gap-6 px-4 py-6 lg:px-6">
        <PriceListsManager initialLists={priceLists} permissionOptions={permissionOptions} />
        <DiscountLimitsManager
          lists={priceLists}
          permissionOptions={permissionOptions}
          initialBaseLimits={baseLimits}
          initialListLimits={listLimits}
        />
        {data ? (
          <div className="space-y-6">
            <div className="rounded-lg border border-border bg-card p-6">
              <div className="mb-4 space-y-1">
                <h2 className="text-lg font-semibold">Cotizaciones Vendedores</h2>
                <p className="text-sm text-muted-foreground">
                  Define la base estructurada que alimenta las secciones de condiciones comerciales y notas en todas las cotizaciones.
                </p>
              </div>
              <QuoteVendorsForm config={data.config ?? null} />
            </div>
            <div className="rounded-lg border border-border bg-card p-6">
              <div className="mb-4 space-y-1">
                <h2 className="text-lg font-semibold">Extras</h2>
                <p className="text-sm text-muted-foreground">
                  Cada tenant puede definir sus propios catálogos manuales para campos select, listas reutilizables y otras configuraciones operativas.
                </p>
              </div>
              <TenantExtrasCatalogsForm tenantId={data.organizacion_id} config={data.config ?? null} />
            </div>
          </div>
        ) : null}
      </div>
    </AppViewLayout>
  )
}
