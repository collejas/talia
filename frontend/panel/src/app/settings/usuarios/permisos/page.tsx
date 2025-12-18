import type { Metadata } from "next"

import { AppViewLayout } from "@/components/layouts/app-view-layout"
import { SettingsErrorCallout, SettingsStatCard } from "@/components/settings/settings-helpers"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardDescription, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formatDateTime } from "@/lib/formatters"
import { fetchPermissionsDirectory, type HrPermissionsDirectory } from "@/lib/settings/hr-directory"

export const metadata: Metadata = {
  title: "Permisos · Settings",
}

export default async function PermisosSettingsPage() {
  const permissionsDirectory = await fetchPermissionsDirectory()

  return (
    <AppViewLayout title="Settings · Permisos" withThemeToggle={false} contentClassName="px-0">
      <div className="flex flex-col gap-6 px-4 py-6 lg:px-6">
        <header className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            Usuarios / Permisos
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">Permisos</h1>
          <p className="text-muted-foreground max-w-3xl text-sm">
            Define capacidades muy concretas (ejemplo: generar cotización, cerrar lead, leer conversaciones)
            y configura qué roles los incluyen. Como siempre, cada permiso queda ligado a una organización específica.
          </p>
        </header>
        <div className="space-y-6">
          <PermissionsDirectoryCard data={permissionsDirectory} />
        </div>
      </div>
    </AppViewLayout>
  )
}

function PermissionsDirectoryCard({ data }: { data: HrPermissionsDirectory }) {
  return (
    <Card>
      <CardHeader className="space-y-1">
        <CardTitle>Catálogo de permisos</CardTitle>
        <CardDescription>
          Registros mostrados: {data.items.length} (de {data.total} totales).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <SettingsErrorCallout
          title="No se pudo recuperar toda la información"
          messages={data.errors}
        />
        <div className="grid gap-3 sm:grid-cols-3">
          <SettingsStatCard label="Permisos" value={data.total} />
          <SettingsStatCard label="Sin rol asignado" value={data.stats.sinRol} />
          <SettingsStatCard
            label="Con rol"
            value={data.total - data.stats.sinRol}
            hint="Permisos enlazados al menos a un rol."
          />
        </div>
        <div className="rounded-lg border border-border/60">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Descripción</TableHead>
                  <TableHead className="hidden lg:table-cell">Roles asociados</TableHead>
                  <TableHead className="hidden xl:table-cell">Creado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-sm text-muted-foreground">
                      No hay permisos registrados.
                    </TableCell>
                  </TableRow>
                ) : (
                  data.items.map((permiso) => (
                    <TableRow key={permiso.id}>
                      <TableCell className="font-medium">{permiso.codigo}</TableCell>
                      <TableCell>{permiso.descripcion}</TableCell>
                      <TableCell className="hidden lg:table-cell">
                        {permiso.roles.length ? (
                          <div className="flex flex-wrap gap-1">
                            {permiso.roles.map((rol) => (
                              <Badge key={rol} variant="outline">
                                {rol}
                              </Badge>
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">Sin rol</span>
                        )}
                      </TableCell>
                      <TableCell className="hidden xl:table-cell text-xs text-muted-foreground">
                        {formatDateTime(permiso.creadoEn)}
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
