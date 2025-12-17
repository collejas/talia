import Link from "next/link"
import type { Metadata } from "next"

import { AppViewLayout } from "@/components/layouts/app-view-layout"
import { EntitySummaryCard, type EntitySchema } from "@/components/settings/entity-summary-card"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardDescription, CardTitle } from "@/components/ui/card"

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

export default function DepartamentosSettingsPage() {
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
