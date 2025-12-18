import type { Metadata } from "next"

import { AppViewLayout } from "@/components/layouts/app-view-layout"
import { SettingsErrorCallout, SettingsStatCard } from "@/components/settings/settings-helpers"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardDescription, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formatDateTime } from "@/lib/formatters"
import { fetchRolesDirectory, type HrRolesDirectory } from "@/lib/settings/hr-directory"

export const metadata: Metadata = {
  title: "Roles · Settings",
}

export default async function RolesSettingsPage() {
  const rolesDirectory = await fetchRolesDirectory()

  return (
    <AppViewLayout
      title="Settings · Roles"
      withThemeToggle={false}
      contentClassName="px-0"
    >
      <div className="flex flex-col gap-6 px-4 py-6 lg:px-6">
        <header className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            Usuarios / Roles
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">Roles</h1>
          <p className="text-muted-foreground max-w-3xl text-sm">
            Los roles permiten encapsular permisos para simplificar la asignación masiva. Cada rol debe estar
            contenido dentro de la organización para evitar cruces y respetar la jerarquía de departamentos y
            puestos que controla qué puede ver cada empleado.
          </p>
        </header>
        <div className="space-y-6">
          <RolesDirectoryCard data={rolesDirectory} />
        </div>
      </div>
    </AppViewLayout>
  )
}

function RolesDirectoryCard({ data }: { data: HrRolesDirectory }) {
  return (
    <Card>
      <CardHeader className="space-y-1">
        <CardTitle>Roles configurados</CardTitle>
        <CardDescription>
          Mostramos hasta {data.items.length} registros ({data.total} totales).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <SettingsErrorCallout
          title="No se pudo recuperar toda la información"
          messages={data.errors}
        />
        <div className="grid gap-3 sm:grid-cols-3">
          <SettingsStatCard label="Roles" value={data.total} />
          <SettingsStatCard label="Permisos asignados" value={data.stats.permisos} />
          <SettingsStatCard label="Usuarios con rol" value={data.stats.usuarios} />
        </div>
        <div className="rounded-lg border border-border/60">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead className="hidden md:table-cell">Código</TableHead>
                  <TableHead className="hidden lg:table-cell">Descripción</TableHead>
                  <TableHead className="hidden lg:table-cell">Permisos</TableHead>
                  <TableHead>Usuarios</TableHead>
                  <TableHead className="hidden xl:table-cell">Creado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                      Aún no hay roles configurados.
                    </TableCell>
                  </TableRow>
                ) : (
                  data.items.map((rol) => (
                    <TableRow key={rol.id}>
                      <TableCell className="font-medium">{rol.nombre}</TableCell>
                      <TableCell className="hidden md:table-cell text-muted-foreground">
                        {rol.codigo}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                        {rol.descripcion}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        {rol.permisos.length ? (
                          <div className="flex flex-wrap gap-1">
                            {rol.permisos.map((permiso) => (
                              <Badge key={permiso} variant="outline">
                                {permiso}
                              </Badge>
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">Sin permisos</span>
                        )}
                      </TableCell>
                      <TableCell>{rol.usuarios}</TableCell>
                      <TableCell className="hidden xl:table-cell text-xs text-muted-foreground">
                        {formatDateTime(rol.creadoEn)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
