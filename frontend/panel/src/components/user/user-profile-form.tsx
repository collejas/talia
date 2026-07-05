"use client"

import { useActionState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { useFormStatus } from "react-dom"

import { updateUserProfileAction, type UserProfileActionState } from "@/app/user/actions"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

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

const INITIAL_STATE: UserProfileActionState = { status: "idle" }

export function UserProfileForm({ profile }: { profile: UserProfileResponse }) {
  const [personalState, personalAction] = useActionState(updateUserProfileAction, INITIAL_STATE)
  const [mailState, mailAction] = useActionState(updateUserProfileAction, INITIAL_STATE)
  const router = useRouter()

  useEffect(() => {
    if (personalState.status === "success") {
      router.refresh()
    }
  }, [personalState.status, router])

  useEffect(() => {
    if (mailState.status === "success") {
      router.refresh()
    }
  }, [mailState.status, router])

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
      <Card className="lg:sticky lg:top-6">
        <CardHeader>
          <CardTitle>Resumen del usuario</CardTitle>
          <CardDescription>
            Estos datos sirven para tu identidad operativa y para el envío de cotizaciones.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border border-border/60 bg-muted/25 px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Correo de acceso</p>
            <p className="mt-1 font-medium">{profile.correo || "No disponible"}</p>
            <p className="text-xs text-muted-foreground">
              Este dato lo administra un administrador desde <span className="font-medium text-foreground">settings/usuarios</span>.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant={profile.mail.configurado ? "default" : "secondary"}>
              {profile.mail.configurado ? "Correo propio configurado" : "Usa correo del sistema"}
            </Badge>
            <Badge variant={profile.mail.habilitado ? "default" : "outline"}>
              {profile.mail.habilitado ? "Conexión activa" : "Conexión desactivada"}
            </Badge>
            {!profile.mail.habilitado && profile.mail.configurado ? (
              <Badge variant="destructive">Configurado pero apagado</Badge>
            ) : null}
            {profile.mail.password_configured ? (
              <Badge variant="secondary">Credenciales guardadas</Badge>
            ) : (
              <Badge variant="outline">Sin contraseña guardada</Badge>
            )}
          </div>
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>Roles, permisos, puesto y departamento no se editan aquí.</p>
            <p>Si tu correo propio no está completo o falla, la plataforma usará el correo del sistema como fallback.</p>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Datos personales</CardTitle>
            <CardDescription>Solo puedes editar tu información operativa básica.</CardDescription>
          </CardHeader>
          <CardContent>
            <form action={personalAction} className="space-y-4">
              <input type="hidden" name="section" value="personal" />
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1 md:col-span-2">
                  <Label htmlFor="profile-name">Nombre completo</Label>
                  <Input id="profile-name" name="nombre_completo" defaultValue={profile.nombre_completo ?? ""} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="profile-phone">Teléfono</Label>
                  <Input id="profile-phone" name="telefono_e164" defaultValue={profile.telefono_e164 ?? ""} placeholder="+521234567890" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="profile-timezone">Zona horaria</Label>
                  <Input id="profile-timezone" name="timezone" defaultValue={profile.timezone ?? ""} placeholder="America/Mexico_City" />
                </div>
              </div>
              <FormStateMessage state={personalState} />
              <div className="flex justify-end">
                <SubmitButton label="Guardar datos personales" pendingLabel="Guardando..." />
              </div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Conexión de correo</CardTitle>
            <CardDescription>
              Configura tu buzón para que las cotizaciones salgan desde tu correo; si falta algo, se usará el correo del sistema.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={mailAction} className="space-y-6">
              <input type="hidden" name="section" value="mail" />
              <div className="rounded-lg border border-border/60 bg-muted/20 px-4 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="space-y-1">
                    <p className="font-medium">Usar tu correo para enviar cotizaciones</p>
                    <p className="text-xs text-muted-foreground">
                      Actívalo para que la app envíe desde tu cuenta personal; si está apagado o incompleto, usa el correo del sistema.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={profile.mail.habilitado ? "default" : "outline"}>
                      {profile.mail.habilitado ? "Activo" : "Apagado"}
                    </Badge>
                    <input type="hidden" name="mail_habilitado" value="false" />
                    <Checkbox
                      id="mail-enabled"
                      name="mail_habilitado"
                      value="true"
                      defaultChecked={profile.mail.habilitado || profile.mail.configurado}
                    />
                  </div>
                </div>
                {profile.mail.configurado && !profile.mail.habilitado ? (
                  <p className="mt-3 text-xs text-amber-600 dark:text-amber-400">
                    Tu correo ya está configurado, pero está apagado. Enciéndelo para que las cotizaciones salgan desde esta cuenta.
                  </p>
                ) : null}
                {!profile.mail.configurado ? (
                  <p className="mt-3 text-xs text-muted-foreground">
                    Completa usuario, contraseña y servidor SMTP para que la cuenta quede lista.
                  </p>
                ) : null}
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1 md:col-span-2">
                  <Label htmlFor="mail-username">Correo SMTP / usuario</Label>
                  <Input
                    id="mail-username"
                    name="mail_username"
                    type="email"
                    defaultValue={profile.mail.username ?? ""}
                    placeholder="vendedor@empresa.com"
                  />
                </div>
                <div className="space-y-1 md:col-span-2">
                  <Label htmlFor="mail-password">Contraseña / app password</Label>
                  <Input
                    id="mail-password"
                    name="mail_password"
                    type="password"
                    placeholder={profile.mail.password_configured ? "Dejar en blanco para conservar" : "Ingresa la contraseña"}
                    autoComplete="new-password"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="mail-incoming-server">Servidor IMAP</Label>
                  <Input
                    id="mail-incoming-server"
                    name="mail_incoming_server"
                    defaultValue={profile.mail.incoming_server ?? ""}
                    placeholder="imap.tu-proveedor.com"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="mail-incoming-port">Puerto IMAP</Label>
                  <Input
                    id="mail-incoming-port"
                    name="mail_incoming_port_imap"
                    type="number"
                    min={1}
                    max={65535}
                    defaultValue={profile.mail.incoming_port_imap ?? ""}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="mail-outgoing-server">Servidor SMTP</Label>
                  <Input
                    id="mail-outgoing-server"
                    name="mail_outgoing_server"
                    defaultValue={profile.mail.outgoing_server ?? ""}
                    placeholder="smtp.tu-proveedor.com"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="mail-outgoing-port">Puerto SMTP</Label>
                  <Input
                    id="mail-outgoing-port"
                    name="mail_outgoing_port_smtp"
                    type="number"
                    min={1}
                    max={65535}
                    defaultValue={profile.mail.outgoing_port_smtp ?? ""}
                  />
                </div>
                <div className="space-y-1 md:col-span-2">
                  <Label htmlFor="mail-from-name">Nombre remitente</Label>
                  <Input id="mail-from-name" name="mail_from_name" defaultValue={profile.mail.from_name ?? ""} />
                </div>
                <div className="space-y-1 md:col-span-2">
                  <Label htmlFor="mail-reply-to">Reply-To</Label>
                  <Input
                    id="mail-reply-to"
                    name="mail_reply_to"
                    type="email"
                    defaultValue={profile.mail.reply_to ?? ""}
                    placeholder="respuesta@empresa.com"
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <ToggleField
                  id="mail-use-ssl"
                  name="mail_use_ssl"
                  label="Usar SSL"
                  defaultChecked={profile.mail.use_ssl}
                />
                <ToggleField
                  id="mail-use-tls"
                  name="mail_use_tls"
                  label="Usar TLS"
                  defaultChecked={profile.mail.use_tls}
                />
              </div>

              <FormStateMessage state={mailState} />
              <div className="flex justify-end">
                <SubmitButton label="Guardar conexión de correo" pendingLabel="Guardando..." />
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function ToggleField({
  id,
  name,
  label,
  defaultChecked,
}: {
  id: string
  name: string
  label: string
  defaultChecked: boolean
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/15 px-4 py-3">
      <Label htmlFor={id} className="cursor-pointer">
        {label}
      </Label>
      <div className="flex items-center gap-3">
        <input type="hidden" name={name} value="false" />
        <Checkbox id={id} name={name} value="true" defaultChecked={defaultChecked} />
      </div>
    </div>
  )
}

function FormStateMessage({ state }: { state: UserProfileActionState }) {
  if (state.status === "idle" || !state.message) return null
  return (
    <p
      className={cn(
        "text-sm",
        state.status === "error" ? "text-destructive" : "text-emerald-600 dark:text-emerald-400",
      )}
    >
      {state.message}
    </p>
  )
}

function SubmitButton({
  label,
  pendingLabel,
}: {
  label: string
  pendingLabel: string
}) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending}>
      {pending ? pendingLabel : label}
    </Button>
  )
}
