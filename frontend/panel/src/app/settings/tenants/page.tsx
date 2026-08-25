import type { Metadata } from "next"
import Link from "next/link"

import { AppViewLayout } from "@/components/layouts/app-view-layout"
import { SettingsErrorCallout } from "@/components/settings/settings-helpers"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { callCrmApi } from "@/lib/api/crm"
import { redirect } from "next/navigation"

import { TenantCreationPanel } from "./components/tenant-creation-panel"

export const metadata: Metadata = {
  title: "Tenants · Settings",
}

export const dynamic = "force-dynamic"
export const revalidate = 0

type TenantSummary = {
  id: string
  nombre: string
  razon_social?: string | null
  dominio_principal?: string | null
  estado_onboarding?: string | null
  activo?: boolean | null
  commercial_plan_code?: string | null
  commercial_plan_name?: string | null
  billing_provider?: string | null
  billing_status?: string | null
  commercial_access_status?: string | null
}

type CommercialPlanSummary = {
  id: string
  code: string
  name: string
  active: boolean
  sort_order: number
}

function getAccessBadgeVariant(status?: string | null) {
  switch (status) {
    case "active":
    case "internal_free":
      return "secondary" as const
    case "grace":
      return "outline" as const
    case "manual_review":
      return "default" as const
    case "blocked":
      return "destructive" as const
    default:
      return "outline" as const
  }
}

function getAccessStatusLabel(status?: string | null) {
  switch (status) {
    case "active":
      return "Activo"
    case "grace":
      return "Gracia"
    case "blocked":
      return "Bloqueado"
    case "manual_review":
      return "Revisión"
    case "internal_free":
      return "Interno"
    default:
      return status ?? "—"
  }
}

export default async function TenantsSettingsPage() {
  const access = await callCrmApi<{ is_platform_admin: boolean }>("/admin/me/platform-admin", {
    withUserToken: true,
  })
  if (!access.ok || !access.data.is_platform_admin) {
    redirect("/unauthorized")
  }

  const response = await callCrmApi<{ ok: boolean; items: TenantSummary[] }>("/admin/tenants", {
    organizacionId: null,
    withUserToken: true,
  })
  const plansResponse = await callCrmApi<{ ok: boolean; items: CommercialPlanSummary[] }>("/admin/commercial-plans", {
    organizacionId: null,
    withUserToken: true,
  })

  const items = response.ok ? response.data.items : []
  const errors = response.ok ? [] : [response.error]
  const commercialPlans = plansResponse.ok
    ? plansResponse.data.items.filter((plan) => plan.active)
    : []
  const commercialPlansError = plansResponse.ok ? null : plansResponse.error

  return (
    <AppViewLayout title="Settings · Tenants" withThemeToggle={false} contentClassName="px-0">
      <div className="flex flex-col gap-6 px-4 py-6 lg:px-6">
        <header className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            Configuración / Plataforma
          </p>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-2">
              <h1 className="text-3xl font-semibold tracking-tight">Tenants</h1>
              <p className="text-muted-foreground max-w-3xl text-sm">
                Esta sección es global (cross-tenant): sirve para registrar nuevas organizaciones y sus claves de
                routing (por ejemplo, alias del widget webchat) sin crecer el archivo <code>.env</code>.
              </p>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link href="/settings/commercial/plans">Ver planes comerciales</Link>
            </Button>
          </div>
        </header>

        <TenantCreationPanel commercialPlans={commercialPlans} commercialPlansError={commercialPlansError} />

        <Card>
          <CardHeader className="space-y-1">
            <CardTitle>Organizaciones</CardTitle>
            <CardDescription>Listado global de tenants (últimos {items.length}).</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <SettingsErrorCallout title="No se pudo recuperar la información" messages={errors} />
            <div className="rounded-lg border border-border/60">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nombre</TableHead>
                      <TableHead className="hidden md:table-cell">Dominio</TableHead>
                      <TableHead className="hidden lg:table-cell">Plan</TableHead>
                      <TableHead className="hidden xl:table-cell">Acceso</TableHead>
                      <TableHead className="hidden lg:table-cell">Onboarding</TableHead>
                      <TableHead className="hidden lg:table-cell">Activo</TableHead>
                      <TableHead>Acciones</TableHead>
                      <TableHead className="hidden xl:table-cell">ID</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center text-sm text-muted-foreground">
                          No hay tenants registrados (o no tienes permiso de platform admin).
                        </TableCell>
                      </TableRow>
                    ) : (
                      items.map((tenant) => (
                        <TableRow key={tenant.id}>
                          <TableCell className="font-medium">{tenant.nombre}</TableCell>
                          <TableCell className="hidden md:table-cell">{tenant.dominio_principal ?? "—"}</TableCell>
                          <TableCell className="hidden lg:table-cell">
                            <div className="space-y-1">
                              <div>{tenant.commercial_plan_name ?? tenant.commercial_plan_code ?? "—"}</div>
                              {tenant.billing_provider ? (
                                <div className="text-xs text-muted-foreground">{tenant.billing_provider}</div>
                              ) : null}
                            </div>
                          </TableCell>
                          <TableCell className="hidden xl:table-cell">
                            <Badge variant={getAccessBadgeVariant(tenant.commercial_access_status)}>
                              {getAccessStatusLabel(tenant.commercial_access_status)}
                            </Badge>
                            {tenant.billing_status ? (
                              <div className="mt-1 text-xs text-muted-foreground">{tenant.billing_status}</div>
                            ) : null}
                          </TableCell>
                          <TableCell className="hidden lg:table-cell">
                            {tenant.estado_onboarding ?? "—"}
                          </TableCell>
                          <TableCell className="hidden lg:table-cell">
                            {tenant.activo === null || tenant.activo === undefined ? "—" : tenant.activo ? "Sí" : "No"}
                          </TableCell>
                          <TableCell>
                            <Button asChild size="sm" variant="outline">
                              <Link href={`/settings/tenants/${tenant.id}`}>Configurar</Link>
                            </Button>
                          </TableCell>
                          <TableCell className="hidden xl:table-cell font-mono text-xs">{tenant.id}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppViewLayout>
  )
}
