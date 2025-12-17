import Link from "next/link"
import type { Metadata } from "next"

import { AppViewLayout } from "@/components/layouts/app-view-layout"
import { EntitySummaryCard, type EntitySchema } from "@/components/settings/entity-summary-card"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardDescription, CardTitle } from "@/components/ui/card"

const ROLES_SCHEMA: EntitySchema = {
  title: "Roles",
  description:
    "Agrupan permisos y comportamientos para aplicarlos rápidamente a usuarios o empleados. Ayudan a mantener control de accesos por organización.",
  tenantField: "organizacion_id",
  highlight: "Privilegios",
  actionLabel: "Crear rol",
  fields: [
    { name: "id", type: "uuid", required: true, notes: "clave primaria" },
    { name: "codigo", type: "text", required: true, notes: "slug amigable para scripts" },
    { name: "nombre", type: "text", required: true },
    { name: "descripcion", type: "text", required: false },
    { name: "creado_en", type: "timestamp with time zone", required: true, notes: "timestamp default ahora" },
    { name: "organizacion_id", type: "uuid", required: true, notes: "FK → organizaciones.id" },
  ],
  relations: [
    { title: "Organización", detail: "organizaciones.id" },
    { title: "Permisos asignados", detail: "permisos.organizacion_id" },
    { title: "Usuarios conectados", detail: "usuarios.organizacion_id" },
  ],
  operations: ["Definir rol", "Asignar permisos", "Duplicar rol", "Auditar cambios"],
}

export const metadata: Metadata = {
  title: "Roles · Settings",
}

export default function RolesSettingsPage() {
  return (
    <AppViewLayout
      title="Settings · Roles"
      withThemeToggle={false}
      contentClassName="px-0"
    >
      <div className="flex flex-col gap-6 px-4 py-6 lg:px-6">
        <header className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            Usuarios / Roles
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">Roles</h1>
          <p className="text-muted-foreground max-w-3xl text-sm">
            Los roles permiten encapsular permisos para simplificar la asignación masiva. Cada rol debe estar
            contenido dentro de la organización para evitar cruces y respetar la jerarquía de departamentos y
            puestos que controla qué puede ver cada empleado.
          </p>
        </header>
        <div className="space-y-6">
          <EntitySummaryCard schema={ROLES_SCHEMA} />
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle>Permisos</CardTitle>
                <CardDescription>Elementos mínimos de autorización.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Los permisos se asignan a roles antes de llegar a los usuarios. De esta forma mantenemos trazabilidad.
                </p>
                <Button asChild size="sm" variant="outline">
                  <Link href="/settings/usuarios/permisos">Ir a permisos</Link>
                </Button>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Usuarios</CardTitle>
                <CardDescription>Personas con credenciales.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Los roles se aplican directamente a usuarios, pero también se heredan desde los empleados centrados
                  en equipos.
                </p>
                <Button asChild size="sm" variant="outline">
                  <Link href="/settings/usuarios">Ir a usuarios</Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </AppViewLayout>
  )
}
