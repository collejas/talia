import Link from "next/link"
import type { Metadata } from "next"

import { AppViewLayout } from "@/components/layouts/app-view-layout"
import { EntitySummaryCard, type EntitySchema } from "@/components/settings/entity-summary-card"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

const USERS_SCHEMA: EntitySchema = {
  title: "Usuarios",
  description:
    "Repositorio maestro de cuentas que pueden autenticarse. Se sincroniza con el directorio de empleados y cualquier otra entidad sensible.",
  tenantField: "organizacion_id",
  highlight: "Identidades",
  actionLabel: "Agregar usuario",
  fields: [
    { name: "id", type: "uuid", required: true, notes: "Clave primaria con gen_random_uuid()" },
    { name: "correo", type: "text", required: false, notes: "Puede ser nulo si se crea manualmente" },
    { name: "nombre_completo", type: "text", required: false },
    {
      name: "estado",
      type: "text",
      required: true,
      notes: "Enum: activo | inactivo | bloqueado (default activo)",
    },
    { name: "ultimo_acceso_en", type: "timestamp with time zone", required: false },
    { name: "creado_en", type: "timestamp with time zone", required: true, notes: "now()" },
    {
      name: "telefono_e164",
      type: "text",
      required: true,
      notes: "Se llena con '+00000000000' si no hay número válido",
    },
    { name: "organizacion_id", type: "uuid", required: true, notes: "FK → organizaciones.id" },
  ],
  relations: [
    { title: "Organización", detail: "organizaciones.id" },
    { title: "Empleado asociado", detail: "empleados.usuario_id" },
    { title: "Roles/Permisos", detail: "Tablas intermedias en configuración" },
  ],
  operations: ["Crear usuario", "Asignar roles", "Bloquear acceso", "Sincronizar auth"],
}

export const metadata: Metadata = {
  title: "Usuarios · Settings",
}

export default function UsuariosSettingsPage() {
  return (
    <AppViewLayout
      title="Settings · Usuarios"
      withThemeToggle={false}
      contentClassName="px-0"
    >
      <div className="flex flex-col gap-6 px-4 py-6 lg:px-6">
        <header className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            Configuración / Seguridad
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">Usuarios</h1>
          <p className="text-muted-foreground max-w-3xl text-sm">
            Cada registro representa una identidad que puede autenticarse en la plataforma. Asegúrate de
            validar que {USERS_SCHEMA.tenantField} coincide con la organización activa antes de crear o modificar
            usuarios, y reutiliza los roles y permisos que definamos en esta misma sección.
          </p>
        </header>
        <div className="space-y-6">
          <EntitySummaryCard schema={USERS_SCHEMA} />
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle>Roles</CardTitle>
                <CardDescription>Define colecciones de privilegios reutilizables.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Los roles agrupan permisos que luego amarramos a usuarios y empleados para mantener consistencia.
                </p>
                <Button asChild size="sm" variant="outline">
                  <Link href="/settings/usuarios/roles">Ir a roles</Link>
                </Button>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Permisos</CardTitle>
                <CardDescription>Acciones aisladas que se pueden asignar.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Cada permiso se registra por organización para evitar cruzar límites y facilitar auditoría.
                </p>
                <Button asChild size="sm" variant="outline">
                  <Link href="/settings/usuarios/permisos">Ir a permisos</Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </AppViewLayout>
  )
}
