import Link from "next/link"
import type { Metadata } from "next"

import { AppViewLayout } from "@/components/layouts/app-view-layout"
import { EntitySummaryCard, type EntitySchema } from "@/components/settings/entity-summary-card"
import { SettingsErrorCallout, SettingsStatCard } from "@/components/settings/settings-helpers"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardDescription, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formatDateTime } from "@/lib/formatters"
import { fetchDepartmentsDirectory, type HrDepartmentsDirectory } from "@/lib/settings/hr-directory"

const DEPARTMENTS_SCHEMA: EntitySchema = {
  title: "Departamentos",
  description:
    "Agrupan empleados y puestos en niveles jerárquicos. Cada departamento pertenece a una organización para mantener la separación multitenant.",
  tenantField: "organizacion_id",
  highlight: "Estructura",
  actionLabel: "Nuevo departamento",
  fields: [
    { name: "id", type: "uuid", required: true, notes: "PK autonumérico (gen_random_uuid)" },
    { name: "nombre", type: "text", required: true },
    {
      name: "departamento_padre_id",
      type: "uuid",
      required: false,
      notes: "Auto-relación para tipos jerárquicos",
    },
    { name: "creado_en", type: "timestamp with time zone", required: true },
    { name: "organizacion_id", type: "uuid", required: true, notes: "FK → organizaciones.id" },
  ],
  relations: [
    { title: "Organización", detail: "organizaciones.id" },
    { title: "Empleados", detail: "empleados.departamento_id" },
    { title: "Puestos", detail: "puestos.departamento_id" },
  ],
  operations: ["Crear departamento", "Reorganizar jerarquía", "Asignar empleados"],
}

export const metadata: Metadata = {
  title: "Departamentos · Settings",
}

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
          <EntitySummaryCard schema={DEPARTMENTS_SCHEMA} />
          <DepartmentsDirectoryCard data={departmentsDirectory} />
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle>Empleados</CardTitle>
                <CardDescription>Se reportan al departamento.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Los empleados pertenecen a un departamento, lo que ayuda a controlar visibilidad y liderazgo.
                </p>
                <Button asChild size="sm" variant="outline">
                  <Link href="/settings/empleados">Ir a empleados</Link>
                </Button>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Puestos</CardTitle>
                <CardDescription>Funciones dentro del departamento.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Cada departamento define los puestos disponibles que, a su vez, se asignan a empleados.
                </p>
                <Button asChild size="sm" variant="outline">
                  <Link href="/settings/empleados/puestos">Ir a puestos</Link>
                </Button>
              </CardContent>
            </Card>
          </div>
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
                      <TableCell className="font-medium">{dept.nombre}</TableCell>
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
