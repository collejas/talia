import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { AppViewLayout } from "@/components/layouts/app-view-layout"
import { callCrmApi } from "@/lib/api/crm"

import { UserProfileForm } from "@/components/user/user-profile-form"

type UserProfileResponse = {
  organizacion_id: string
  usuario_id: string
  nombre_completo: string | null
  correo: string | null
  telefono_e164: string | null
  timezone: string | null
  mail: {
    habilitado: boolean
    configurado: boolean
    usa_fallback_sistema: boolean
    username: string | null
    incoming_server: string | null
    incoming_port_imap: number | null
    outgoing_server: string | null
    outgoing_port_smtp: number | null
    use_ssl: boolean
    use_tls: boolean
    from_name: string | null
    reply_to: string | null
    password_configured: boolean
  }
}

export const metadata: Metadata = {
  title: "User · Settings",
}

export const dynamic = "force-dynamic"
export const fetchCache = "force-no-store"

export default async function UserPage() {
  const response = await callCrmApi<UserProfileResponse>("/tenant/me/profile", {
    organizacionId: null,
    withUserToken: true,
  })

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      redirect("/unauthorized")
    }
    return (
      <AppViewLayout title="User" withThemeToggle={false} contentClassName="px-0">
        <div className="px-4 py-6 lg:px-6">
          <div className="rounded-lg border border-destructive/60 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            No se pudo cargar tu perfil. {response.error}
          </div>
        </div>
      </AppViewLayout>
    )
  }

  return (
    <AppViewLayout title="User" withThemeToggle={false} contentClassName="px-0">
      <div className="flex flex-col gap-6 px-4 py-6 lg:px-6">
        <header className="space-y-2">
          <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
            Perfil personal
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">User</h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Aquí puedes editar tus datos personales y la conexión del correo que usará la plataforma para enviar cotizaciones
            desde tu cuenta; si no está disponible, se usará el correo del sistema como fallback.
          </p>
        </header>
        <UserProfileForm profile={response.data} />
      </div>
    </AppViewLayout>
  )
}
