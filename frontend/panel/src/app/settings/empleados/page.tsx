import Link from "next/link"
import type { Metadata } from "next"

import { AppViewLayout } from "@/components/layouts/app-view-layout"
import { EntitySummaryCard, type EntitySchema } from "@/components/settings/entity-summary-card"
import { SettingsErrorCallout, SettingsStatCard } from "@/components/settings/settings-helpers"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardDescription, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formatDateTime } from "@/lib/formatters"
import { fetchEmployeesDirectory, type HrEmployeesDirectory } from "@/lib/settings/hr-directory"

const EMPLEADOS_SCHEMA: EntitySchema = {
  title: "Empleados",
  description:
    "Registra el equipo humano y lo vincula a su usuario, departamento y puesto. Nos ayuda a identificar quién realiza cada actividad.",
  tenantField: "organizacion_id",
  highlight: "Talento",
  actionLabel: "Agregar empleado",
  fields: [
    { name: "usuario_id", type: "uuid", required: true, notes: "FK → usuarios.id" },
    { name: "departamento_id", type: "uuid", required: false, notes: "FK opcional" },
    { name: "es_gestor", type: "boolean", required: true, notes: "Indica si puede ver todo el departamento" },
    { name: "puesto_id", type: "uuid", required: false, notes: "FK → puestos.id" },
    { name: "es_vendedor", type: "boolean", required: true, notes: "Marca si puede cerrar leads" },
    { name: "ultimo_lead_asignado_en", type: "timestamp with time zone", required: false },
    { name: "creado_en", type: "timestamp with time zone", required: true },
    { name: "organizacion_id", type: "uuid", required: true, notes: "FK → organizaciones.id" },
  ],
  relations: [
    { title: "Usuario", detail: "usuarios.id / usuarios.organizacion_id" },
    { title: "Departamento", detail: "departamentos.id / departamentos.organizacion_id" },
    { title: "Puesto", detail: "puestos.id / puestos.organizacion_id" },
  ],
  operations: ["Asignar puesto", "Reasignar departamento", "Marcar gestor", "Actualizar leads"],
}

export const metadata: Metadata = {
  title: "Empleados · Settings",
}

export default async function EmpleadosSettingsPage() {
  const empleadosDirectory = await fetchEmployeesDirectory()

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
        <div className="space-y-6">
          <EntitySummaryCard schema={EMPLEADOS_SCHEMA} />
          <EmployeesDirectoryCard data={empleadosDirectory} />
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle>Departamentos</CardTitle>
                <CardDescription>Organiza equipos por funciones.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Cada departamento agrupa empleados y puestos, y mantiene la jerarquía por organización.
                </p>
                <Button asChild size="sm" variant="outline">
                  <Link href="/settings/empleados/departamentos">Ir a departamentos</Link>
                </Button>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Puestos</CardTitle>
                <CardDescription>Roles operativos dentro de cada departamento.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Los puestos definen flujos de autorización y sirvieron para aplicar permisos específicos.
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

function EmployeesDirectoryCard({ data }: { data: HrEmployeesDirectory }) {
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
          messages={data.errors}
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
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-sm text-muted-foreground">
                      No hay empleados registrados en esta organización.
                    </TableCell>
                  </TableRow>
                ) : (
                  data.items.map((employee) => (
                    <TableRow key={employee.id}>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <span className="font-medium">{employee.nombre}</span>
                          <span className="text-xs text-muted-foreground">{employee.correo || "—"}</span>
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">{employee.departamento}</TableCell>
                      <TableCell className="hidden lg:table-cell">{employee.puesto}</TableCell>
                      <TableCell>
                        <Badge variant={employee.esGestor ? "secondary" : "outline"}>
                          {employee.esGestor ? "Sí" : "No"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={employee.esVendedor ? "secondary" : "outline"}>
                          {employee.esVendedor ? "Sí" : "No"}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        <Badge variant={estadoVariant(employee.estado)}>{employee.estado}</Badge>
                      </TableCell>
                      <TableCell className="hidden xl:table-cell">
                        <span className="text-xs text-muted-foreground">
                          {formatDateTime(employee.creadoEn)}
                        </span>
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

function estadoVariant(estado: string): "secondary" | "outline" | "destructive" {
  if (estado === "activo") return "secondary"
  if (estado === "bloqueado") return "destructive"
  return "outline"
}
