import type { Metadata } from "next"

import { AppViewLayout } from "@/components/layouts/app-view-layout"
import {
  EmployeeCreateSection,
  EmployeeInlineRow,
} from "@/components/settings/hr/employee-inline-row"
import { SettingsErrorCallout, SettingsStatCard } from "@/components/settings/settings-helpers"
import { Card, CardContent, CardHeader, CardDescription, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  fetchAssignmentLookups,
  fetchEmployeesDirectory,
  type HrAssignmentLookups,
  type HrEmployeesDirectory,
} from "@/lib/settings/hr-directory"

export const metadata: Metadata = {
  title: "Empleados · Settings",
}

export const dynamic = "force-dynamic"
export const revalidate = 0

export default async function EmpleadosSettingsPage() {
  const [empleadosDirectory, assignments] = await Promise.all([
    fetchEmployeesDirectory(),
    fetchAssignmentLookups(),
  ])

  return (
    <AppViewLayout
      title="Settings · Empleados"
      withThemeToggle={false}
      contentClassName="px-0"
    >
      <div className="flex flex-col gap-6 px-4 py-6 lg:px-6">
        <header className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            Configuración / Personal
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">Empleados</h1>
          <p className="text-muted-foreground max-w-3xl text-sm">
            Vincula a cada empleado con su usuario, departamento y puesto para mantener trazabilidad sobre quién
            ejecuta qué procesos dentro de cada organización.
          </p>
        </header>
        <EmployeesDirectoryCard data={empleadosDirectory} lookups={assignments} />
      </div>
    </AppViewLayout>
  )
}

function EmployeesDirectoryCard({
  data,
  lookups,
}: {
  data: HrEmployeesDirectory
  lookups: HrAssignmentLookups
}) {
  return (
    <Card>
      <CardHeader className="space-y-1">
        <CardTitle>Directorio por organización</CardTitle>
        <CardDescription>
          Mostramos los últimos {data.items.length} registros ({data.total} en total).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <SettingsErrorCallout
          title="No se pudo recuperar toda la información"
          messages={[...data.errors, ...lookups.errors]}
        />
        <EmployeeCreateSection
          departments={lookups.departamentos}
          positions={lookups.puestos}
          userOptions={lookups.usuarios}
        />
        <div className="grid gap-3 sm:grid-cols-3">
          <SettingsStatCard label="Empleados" value={data.total} />
          <SettingsStatCard label="Gestores" value={data.stats.gestores} />
          <SettingsStatCard label="Vendedores" value={data.stats.vendedores} />
        </div>
        <div className="rounded-lg border border-border/60">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead className="hidden md:table-cell">Departamento</TableHead>
                  <TableHead className="hidden lg:table-cell">Puesto</TableHead>
                  <TableHead>Gestor</TableHead>
                  <TableHead>Vendedor</TableHead>
                  <TableHead className="hidden lg:table-cell">Estado</TableHead>
                  <TableHead className="hidden xl:table-cell">Creado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-sm text-muted-foreground">
                      No hay empleados registrados en esta organización.
                    </TableCell>
                  </TableRow>
                ) : (
                  data.items.map((employee) => (
                    <EmployeeInlineRow
                      key={employee.id}
                      employee={employee}
                      departments={lookups.departamentos}
                      positions={lookups.puestos}
                    />
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
