import type { Metadata } from "next"

import { AppViewLayout } from "@/components/layouts/app-view-layout"
import { UserCrudPanel } from "@/components/settings/hr/crud-forms"
import { UserInlineRow } from "@/components/settings/hr/user-inline-row"
import { SettingsErrorCallout, SettingsStatCard } from "@/components/settings/settings-helpers"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { fetchUsersDirectory, type HrUsersDirectory } from "@/lib/settings/hr-directory"

export const metadata: Metadata = {
  title: "Usuarios · Settings",
}

export const dynamic = "force-dynamic"
export const revalidate = 0

export default async function UsuariosSettingsPage() {
  const usersDirectory = await fetchUsersDirectory()

  return (
    <AppViewLayout
      title="Settings · Usuarios"
      withThemeToggle={false}
      contentClassName="px-0"
    >
      <div className="flex flex-col gap-6 px-4 py-6 lg:px-6">
        <header className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            Configuración / Seguridad
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">Usuarios</h1>
          <p className="text-muted-foreground max-w-3xl text-sm">
            Cada registro representa una identidad que puede autenticarse en la plataforma. Asegúrate de validar la
            organización activa antes de crear o modificar usuarios, y reutiliza los roles y permisos que definamos en
            esta misma sección.
          </p>
        </header>
        <div className="space-y-6">
          <UserCrudPanel />
          <UsersDirectoryCard data={usersDirectory} />
        </div>
      </div>
    </AppViewLayout>
  )
}

function UsersDirectoryCard({ data }: { data: HrUsersDirectory }) {
  return (
    <Card>
      <CardHeader className="space-y-1">
        <CardTitle>Identidades de la organización</CardTitle>
        <CardDescription>
          Se listan los últimos {data.items.length} usuarios ({data.total} en total).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <SettingsErrorCallout
          title="No se pudo recuperar toda la información"
          messages={data.errors}
        />
        <div className="grid gap-3 sm:grid-cols-4">
          <SettingsStatCard label="Usuarios" value={data.total} />
          <SettingsStatCard label="Activos" value={data.stats.activos} />
          <SettingsStatCard label="Bloqueados" value={data.stats.bloqueados} />
          <SettingsStatCard label="Sin rol asignado" value={data.stats.sinRoles} />
        </div>
        <div className="rounded-lg border border-border/60">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Usuario</TableHead>
                  <TableHead className="hidden lg:table-cell">Roles</TableHead>
                  <TableHead className="hidden md:table-cell">Departamento</TableHead>
                  <TableHead className="hidden lg:table-cell">Puesto</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="hidden xl:table-cell">Último acceso</TableHead>
                  <TableHead className="hidden xl:table-cell">Creado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-sm text-muted-foreground">
                      No hay usuarios registrados.
                    </TableCell>
                  </TableRow>
                ) : (
                  data.items.map((user) => <UserInlineRow key={user.id} user={user} />)
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
