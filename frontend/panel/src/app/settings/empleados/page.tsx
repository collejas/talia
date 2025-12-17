import Link from "next/link"
import type { Metadata } from "next"

import { AppViewLayout } from "@/components/layouts/app-view-layout"
import { EntitySummaryCard, type EntitySchema } from "@/components/settings/entity-summary-card"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardDescription, CardTitle } from "@/components/ui/card"

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

export default function EmpleadosSettingsPage() {
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
