import Link from "next/link"
import { AppViewLayout } from "@/components/layouts/app-view-layout"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  IconUsersGroup,
  IconHierarchy,
  IconBriefcase,
  IconUsers,
  IconShieldCheck,
  IconShieldLock,
} from "@tabler/icons-react"

const COLLABORATORS = [
  {
    title: "Usuarios",
    description: "Gestiona cuentas de acceso vinculadas a empleados.",
    url: "/settings/usuarios",
    icon: IconUsers,
  },
  {
    title: "Empleados",
    description: "Administra fichas, estatus y datos operativos del equipo.",
    url: "/settings/empleados",
    icon: IconUsersGroup,
  },
]

const STRUCTURE = [
  {
    title: "Departamentos",
    description: "Estructura áreas y equipos para mantener orden organizacional.",
    url: "/settings/empleados/departamentos",
    icon: IconHierarchy,
  },
  {
    title: "Puestos",
    description: "Define puestos, responsabilidades y ubicaciones dentro del organigrama.",
    url: "/settings/empleados/puestos",
    icon: IconBriefcase,
  },
  {
    title: "Permisos",
    description: "Asigna permisos granulares por rol.",
    url: "/settings/usuarios/permisos",
    icon: IconShieldLock,
  },
  {
    title: "Roles",
    description: "Configura roles y jerarquías de acceso.",
    url: "/settings/usuarios/roles",
    icon: IconShieldCheck,
  },
]

export default function SettingsRhPage() {
  return (
    <AppViewLayout title="Settings · Recursos Humanos">
      <div className="space-y-6 px-4 py-6 lg:px-6">
        <header className="space-y-1">
          <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            Configuración
          </p>
          <h1 className="text-2xl font-semibold">Recursos Humanos</h1>
          <p className="text-sm text-muted-foreground">
            Centraliza la configuración de tu equipo, roles y estructura organizacional.
            Las cotizaciones se habilitan por rol: para ventas usamos <span className="font-medium text-foreground">Agente</span>,
            que incluye <span className="font-medium text-foreground">propuesta.view</span>.
          </p>
        </header>
        <div className="space-y-6">
          <section className="space-y-3 rounded-2xl border border-border/60 bg-muted/20 p-4">
            <div className="space-y-1">
              <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
                Colaboradores
              </h2>
              <p className="text-sm text-muted-foreground">
                Gestiona usuarios y empleados que conforman el equipo.
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {COLLABORATORS.map((section) => (
                <Card key={section.title} className="flex flex-col justify-between">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <section.icon className="h-4 w-4 text-primary" />
                      {section.title}
                    </CardTitle>
                    <p className="text-sm text-muted-foreground">{section.description}</p>
                  </CardHeader>
                  <CardContent>
                    <Button asChild size="sm">
                      <Link href={section.url}>Gestionar</Link>
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
          <section className="space-y-3 rounded-2xl border border-border/60 bg-muted/20 p-4">
            <div className="space-y-1">
              <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
                Estructura y acceso
              </h2>
              <p className="text-sm text-muted-foreground">
                Define la estructura organizacional y los permisos de acceso.
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {STRUCTURE.map((section) => (
                <Card key={section.title} className="flex flex-col justify-between">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <section.icon className="h-4 w-4 text-primary" />
                      {section.title}
                    </CardTitle>
                    <p className="text-sm text-muted-foreground">{section.description}</p>
                  </CardHeader>
                  <CardContent>
                    <Button asChild size="sm">
                      <Link href={section.url}>Gestionar</Link>
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        </div>
      </div>
    </AppViewLayout>
  )
}
