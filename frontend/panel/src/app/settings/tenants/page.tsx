import type { Metadata } from "next"

import { AppViewLayout } from "@/components/layouts/app-view-layout"
import { SettingsErrorCallout } from "@/components/settings/settings-helpers"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { callCrmApi } from "@/lib/api/crm"

import { createTenant } from "./actions"

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
}

export default async function TenantsSettingsPage() {
  const response = await callCrmApi<{ ok: boolean; items: TenantSummary[] }>("/admin/tenants", {
    organizacionId: null,
    withUserToken: true,
  })

  const items = response.ok ? response.data.items : []
  const errors = response.ok ? [] : [response.error]

  return (
    <AppViewLayout title="Settings · Tenants" withThemeToggle={false} contentClassName="px-0">
      <div className="flex flex-col gap-6 px-4 py-6 lg:px-6">
        <header className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            Configuración / Plataforma
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">Tenants</h1>
          <p className="text-muted-foreground max-w-3xl text-sm">
            Esta sección es global (cross-tenant): sirve para registrar nuevas organizaciones y sus claves de routing
            (por ejemplo, alias del widget webchat) sin crecer el archivo <code>.env</code>.
          </p>
        </header>

        <Card>
          <CardHeader className="space-y-1">
            <CardTitle>Crear tenant</CardTitle>
            <CardDescription>
              Crea la organización y, si indicas un alias, se registra como ruta <code>canal=webchat</code>.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={createTenant} className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="nombre">Nombre</Label>
                <Input id="nombre" name="nombre" placeholder="Cliente / Organización" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="razon_social">Razón social</Label>
                <Input id="razon_social" name="razon_social" placeholder="Opcional" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="dominio_principal">Dominio principal</Label>
                <Input id="dominio_principal" name="dominio_principal" placeholder="cliente.com" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="webchat_alias">Alias webchat</Label>
                <Input id="webchat_alias" name="webchat_alias" placeholder="cliente" />
              </div>
              <div className="sm:col-span-2 flex justify-end">
                <Button type="submit">Crear</Button>
              </div>
            </form>
          </CardContent>
        </Card>

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
                      <TableHead className="hidden lg:table-cell">Onboarding</TableHead>
                      <TableHead className="hidden lg:table-cell">Activo</TableHead>
                      <TableHead className="hidden xl:table-cell">ID</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                          No hay tenants registrados (o no tienes permiso de platform admin).
                        </TableCell>
                      </TableRow>
                    ) : (
                      items.map((tenant) => (
                        <TableRow key={tenant.id}>
                          <TableCell className="font-medium">{tenant.nombre}</TableCell>
                          <TableCell className="hidden md:table-cell">{tenant.dominio_principal ?? "—"}</TableCell>
                          <TableCell className="hidden lg:table-cell">
                            {tenant.estado_onboarding ?? "—"}
                          </TableCell>
                          <TableCell className="hidden lg:table-cell">
                            {tenant.activo === null || tenant.activo === undefined ? "—" : tenant.activo ? "Sí" : "No"}
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

