import Link from "next/link"
import type { Metadata } from "next"

import { AppViewLayout } from "@/components/layouts/app-view-layout"
import { EntitySummaryCard, type EntitySchema } from "@/components/settings/entity-summary-card"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardDescription, CardTitle } from "@/components/ui/card"

const PERMISSIONS_SCHEMA: EntitySchema = {
  title: "Permisos",
  description:
    "Listado de capacidades atómicas. Los roles combinan estos permisos, pero cada permiso se declara con nivel de organización.",
  tenantField: "organizacion_id",
  highlight: "Acceso",
  actionLabel: "Registrar permiso",
  fields: [
    { name: "id", type: "uuid", required: true, notes: "Identificador único" },
    { name: "codigo", type: "text", required: true, notes: "Llave superficial para UI/backoffice" },
    { name: "descripcion", type: "text", required: false },
    { name: "creado_en", type: "timestamp with time zone", required: true },
    { name: "organizacion_id", type: "uuid", required: true, notes: "FK → organizaciones.id" },
  ],
  relations: [
    { title: "Roles", detail: "roles.organizacion_id" },
    { title: "Usuarios", detail: "usuarios.organizacion_id" },
    { title: "Empleados", detail: "empleados.organizacion_id" },
  ],
  operations: ["Registrar permiso", "Asignar a roles", "Auditar usos", "Restringir por organización"],
}

export const metadata: Metadata = {
  title: "Permisos · Settings",
}

export default function PermisosSettingsPage() {
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
          <EntitySummaryCard schema={PERMISSIONS_SCHEMA} />
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle>Roles</CardTitle>
                <CardDescription>Agregan permisos en bloque.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Cada permiso puede sumarse a varios roles sin salir de la misma organización.
                </p>
                <Button asChild size="sm" variant="outline">
                  <Link href="/settings/usuarios/roles">Ir a roles</Link>
                </Button>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Empleados</CardTitle>
                <CardDescription>El sujeto de los permisos.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Los permisos llegan a empleados a través de sus roles y su puesto dentro del departamento.
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
