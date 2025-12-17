import Link from "next/link"
import type { Metadata } from "next"

import { AppViewLayout } from "@/components/layouts/app-view-layout"
import { EntitySummaryCard, type EntitySchema } from "@/components/settings/entity-summary-card"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardDescription, CardTitle } from "@/components/ui/card"

const POSITIONS_SCHEMA: EntitySchema = {
  title: "Puestos",
  description:
    "Define responsabilidades abiertas dentro de un departamento. Los empleados y roles se apoyan en esta tabla para controlar qué pueden hacer.",
  tenantField: "organizacion_id",
  highlight: "Roles operativos",
  actionLabel: "Crear puesto",
  fields: [
    { name: "id", type: "uuid", required: true, notes: "PK" },
    { name: "nombre", type: "text", required: true },
    { name: "descripcion", type: "text", required: false },
    { name: "departamento_id", type: "uuid", required: false, notes: "FK → departamentos.id" },
    { name: "creado_en", type: "timestamp with time zone", required: true },
    { name: "organizacion_id", type: "uuid", required: true, notes: "FK → organizaciones.id" },
  ],
  relations: [
    { title: "Departamento", detail: "departamentos.id / organizacion_id" },
    { title: "Empleados", detail: "empleados.puesto_id" },
    { title: "Roles/Permisos", detail: "Roles heredan del puesto" },
  ],
  operations: ["Crear puesto", "Actualizar funciones", "Vincular empleados", "Respetar organización"],
}

export const metadata: Metadata = {
  title: "Puestos · Settings",
}

export default function PuestosSettingsPage() {
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
        <div className="space-y-6">
          <EntitySummaryCard schema={POSITIONS_SCHEMA} />
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle>Departamentos</CardTitle>
                <CardDescription>Asignan el contexto.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Un departamento puede ofrecer varios puestos y establecer jerarquías.
                </p>
                <Button asChild size="sm" variant="outline">
                  <Link href="/settings/empleados/departamentos">Ir a departamentos</Link>
                </Button>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Empleados</CardTitle>
                <CardDescription>Los dueños del puesto.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Cada empleado hereda funciones y permisos desde su puesto.
                </p>
                <Button asChild size="sm" variant="outline">
                  <Link href="/settings/empleados">Ir a empleados</Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </AppViewLayout>
  )
}
