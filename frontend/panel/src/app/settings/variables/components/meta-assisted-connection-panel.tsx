"use client"

import { useActionState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { operateMetaWhatsAppConnectionAction, type MetaConnectionActionState } from "../actions"

const INITIAL_STATE: MetaConnectionActionState = { status: "idle" }

export function MetaAssistedConnectionPanel({
  initialConnection,
  businessId,
}: {
  initialConnection: Record<string, unknown> | null
  businessId: string
}) {
  const [state, formAction, pending] = useActionState(operateMetaWhatsAppConnectionAction, INITIAL_STATE)
  const connection = state.connection ?? initialConnection
  const estado = typeof connection?.estado === "string" ? connection.estado : "pendiente"
  return (
    <div className="rounded-lg border border-border/60 p-4 space-y-4">
      <div className="space-y-1">
        <p className="text-sm font-medium">Conexión asistida · Meta WhatsApp Cloud API</p>
        <p className="text-xs text-muted-foreground">
          Autoriza el activo de WhatsApp de tu empresa a Talia y valida cada paso desde aquí. Talia no muestra ni guarda el PIN.
        </p>
      </div>
      <div className="rounded-md bg-muted/40 p-3 text-sm space-y-1">
        <p>1. En Meta, agrega o comparte tu WABA con el Business ID de Talia:</p>
        <p className="font-mono text-xs break-all">{businessId || "Configurar META_TALIA_BUSINESS_ID"}</p>
        <p className="text-xs text-muted-foreground">Concede a Talia acceso al WABA y al número que vas a conectar.</p>
      </div>
      <form action={formAction} className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2"><Label htmlFor="meta-assisted-waba">WABA ID</Label><Input id="meta-assisted-waba" name="waba_id" defaultValue={String(connection?.waba_id ?? "")} required /></div>
        <div className="space-y-2"><Label htmlFor="meta-assisted-phone">Phone Number ID</Label><Input id="meta-assisted-phone" name="phone_number_id" defaultValue={String(connection?.phone_number_id ?? "")} required /></div>
        <div className="md:col-span-2 flex flex-wrap gap-2">
          <Button name="accion" value="validar" type="submit" disabled={pending}>1. Validar acceso</Button>
          <Input className="w-32" name="pin" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} placeholder="PIN de 6 dígitos" aria-label="PIN de registro" />
          <Button name="accion" value="registrar" type="submit" variant="outline" disabled={pending}>2. Registrar número</Button>
          <Button name="accion" value="suscribir" type="submit" variant="outline" disabled={pending}>3. Suscribir aplicación</Button>
        </div>
      </form>
      <p className="text-xs text-muted-foreground">Estado registrado en Talia: <span className="font-medium text-foreground">{estado}</span></p>
      {state.status !== "idle" ? <p className={state.status === "error" ? "text-sm text-destructive" : "text-sm text-emerald-700"}>{state.message}</p> : null}
    </div>
  )
}
