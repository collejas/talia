import type { Metadata } from "next"

import { AppViewLayout } from "@/components/layouts/app-view-layout"
import {
  PositionCreateSection,
  PositionInlineRow,
} from "@/components/settings/hr/position-inline-row"
import { SettingsErrorCallout, SettingsStatCard } from "@/components/settings/settings-helpers"
import { Card, CardContent, CardHeader, CardDescription, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  fetchDepartmentOptions,
  fetchPositionsDirectory,
  type HrDepartmentOption,
  type HrPositionsDirectory,
} from "@/lib/settings/hr-directory"

export const metadata: Metadata = {
  title: "Puestos · Settings",
}

export const dynamic = "force-dynamic"
export const revalidate = 0

export default async function PuestosSettingsPage() {
  const [positionsDirectory, departmentOptions] = await Promise.all([
    fetchPositionsDirectory(),
    fetchDepartmentOptions(),
  ])

  return (
    <AppViewLayout
      title="Settings · Puestos"
      withThemeToggle={false}
      contentClassName="px-0"
    >
      <div className="flex flex-col gap-6 px-4 py-6 lg:px-6">
        <header className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            Empleados / Puestos
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">Puestos</h1>
          <p className="text-muted-foreground max-w-3xl text-sm">
            Cada puesto describe responsabilidades y se asigna a empleados dentro de un departamento. Mantiene la
            separación por organización y facilita la asignación de permisos.
          </p>
        </header>
        <PositionsDirectoryCard
          data={positionsDirectory}
          departments={departmentOptions.options}
          extraErrors={departmentOptions.errors}
        />
      </div>
    </AppViewLayout>
  )
}

function PositionsDirectoryCard({
  data,
  departments,
  extraErrors,
}: {
  data: HrPositionsDirectory
  departments: HrDepartmentOption[]
  extraErrors: string[]
}) {
  const vacantes = data.items.filter((item) => item.empleados === 0).length

  return (
    <Card>
      <CardHeader className="space-y-1">
        <CardTitle>Puestos disponibles</CardTitle>
        <CardDescription>
          Mostramos hasta {data.items.length} puestos recientes ({data.total} en total).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <SettingsErrorCallout
          title="No se pudo recuperar toda la información"
          messages={[...data.errors, ...extraErrors]}
        />
        <PositionCreateSection departments={departments} />
        <div className="grid gap-3 sm:grid-cols-3">
          <SettingsStatCard label="Puestos" value={data.total} />
          <SettingsStatCard label="Colaboradores asignados" value={data.stats.empleados} />
          <SettingsStatCard label="Vacantes" value={vacantes} />
        </div>
        <div className="rounded-lg border border-border/60">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Puesto</TableHead>
                  <TableHead className="hidden md:table-cell">Departamento</TableHead>
                  <TableHead className="hidden lg:table-cell">Descripción</TableHead>
                  <TableHead>Colaboradores</TableHead>
                  <TableHead className="hidden lg:table-cell">Creado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                      No hay puestos dados de alta todavía.
                    </TableCell>
                  </TableRow>
                ) : (
                  data.items.map((puesto) => (
                    <PositionInlineRow
                      key={puesto.id}
                      position={puesto}
                      departments={departments}
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
