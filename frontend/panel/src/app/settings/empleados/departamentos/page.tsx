import type { Metadata } from "next"

import { AppViewLayout } from "@/components/layouts/app-view-layout"
import { DepartmentCrudPanel } from "@/components/settings/hr/crud-forms"
import { SettingsErrorCallout, SettingsStatCard } from "@/components/settings/settings-helpers"
import { Card, CardContent, CardHeader, CardDescription, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formatDateTime } from "@/lib/formatters"
import { fetchDepartmentsDirectory, type HrDepartmentsDirectory } from "@/lib/settings/hr-directory"

export const metadata: Metadata = {
  title: "Departamentos · Settings",
}

export const dynamic = "force-dynamic"
export const revalidate = 0

export default async function DepartamentosSettingsPage() {
  const departmentsDirectory = await fetchDepartmentsDirectory()

  return (
    <AppViewLayout
      title="Settings · Departamentos"
      withThemeToggle={false}
      contentClassName="px-0"
    >
      <div className="flex flex-col gap-6 px-4 py-6 lg:px-6">
        <header className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            Empleados / Departamentos
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">Departamentos</h1>
          <p className="text-muted-foreground max-w-3xl text-sm">
            Cada departamento se mantiene aislado por organización para respetar límites de acceso. También puede
            formar parte de una jerarquía mediante la columna departamento_padre_id.
          </p>
        </header>
        <div className="space-y-6">
          <DepartmentCrudPanel />
          <DepartmentsDirectoryCard data={departmentsDirectory} />
        </div>
      </div>
    </AppViewLayout>
  )
}

function DepartmentsDirectoryCard({ data }: { data: HrDepartmentsDirectory }) {
  return (
    <Card>
      <CardHeader className="space-y-1">
        <CardTitle>Jerarquía de departamentos</CardTitle>
        <CardDescription>
          Mostramos hasta {data.items.length} registros recientes ({data.total} en total).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <SettingsErrorCallout
          title="No se pudo recuperar toda la información"
          messages={data.errors}
        />
        <div className="grid gap-3 sm:grid-cols-3">
          <SettingsStatCard label="Departamentos" value={data.total} />
          <SettingsStatCard label="Puestos definidos" value={data.stats.puestos} />
          <SettingsStatCard label="Colaboradores" value={data.stats.empleados} />
        </div>
        <div className="rounded-lg border border-border/60">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Departamento</TableHead>
                  <TableHead className="hidden md:table-cell">Superior</TableHead>
                  <TableHead>Puestos</TableHead>
                  <TableHead>Colaboradores</TableHead>
                  <TableHead className="hidden lg:table-cell">Creado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                      No hay departamentos registrados en la organización.
                    </TableCell>
                  </TableRow>
                ) : (
                  data.items.map((dept) => (
                    <TableRow key={dept.id}>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <span className="font-medium">{dept.nombre}</span>
                          <span className="text-[0.65rem] font-mono text-muted-foreground/80">
                            {dept.id}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-muted-foreground">
                        {dept.padreNombre}
                      </TableCell>
                      <TableCell>{dept.puestos}</TableCell>
                      <TableCell>{dept.empleados}</TableCell>
                      <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">
                        {formatDateTime(dept.creadoEn)}
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
