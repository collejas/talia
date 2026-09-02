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
      <div className="rounded-md bg-muted/40 p-3 text-sm space-y-3">
        <p className="font-medium">INSTRUCCIONES:</p>
        <ol className="list-decimal space-y-3 pl-5">
          <li>
            <p>En Meta, agrega el número en WhatsApp Manager y verifícalo mediante SMS o llamada.</p>
            <p className="text-xs text-muted-foreground">Si el número ya está agregado y aparece como verificado, omite este paso.</p>
          </li>
          <li>
            <p>Agrega a Talia como empresa asociada o partner usando este Business ID:</p>
            <p className="font-mono text-xs break-all">{businessId || "Configurar META_TALIA_BUSINESS_ID"}</p>
            <p className="text-xs text-muted-foreground">
              Entra a{" "}
              <a
                className="underline underline-offset-2"
                href="https://business.facebook.com/business/"
                target="_blank"
                rel="noreferrer"
              >
                business.facebook.com/business/
              </a>
              {" "}y abre la cuenta donde agregaste tu número de WhatsApp Business API. Entra a “Socios”, pulsa “+ Agregar”, captura el identificador del negocio y sigue el proceso.
            </p>
            <p className="text-xs text-muted-foreground">Concede a Talia estos permisos:</p>
            <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
              <li>Administrar WhatsApp Account.</li>
              <li>Administrar plantillas.</li>
              <li>Administrar números.</li>
            </ul>
          </li>
          <li>Regresa a Talia y captura el WABA ID y el Phone Number ID.</li>
          <li>En Talia, haz clic en “Validar acceso” (Paso 1). Este botón no concede permisos; solo comprueba que Talia tenga acceso a la WABA y que el número pertenezca a ella.</li>
          <li>
            <p>Si la validación es correcta, captura un PIN de seis dígitos y ejecuta “Registrar número” (Paso 2).</p>
            <p className="text-xs text-muted-foreground">El PIN puede ser nuevo si el número nunca tuvo registro Cloud API. Si ya tenía verificación en dos pasos, usa el PIN existente. No es el código SMS.</p>
          </li>
          <li>Solo cuando el paso 2 termine correctamente, ejecuta el paso 3: “Suscribir aplicación”.</li>
        </ol>
      </div>
      <form action={formAction} className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2"><Label htmlFor="meta-assisted-waba">WABA ID <span className="text-destructive" aria-hidden="true">*</span></Label><Input id="meta-assisted-waba" name="waba_id" defaultValue={String(connection?.waba_id ?? "")} required /></div>
        <div className="space-y-2"><Label htmlFor="meta-assisted-phone">Phone Number ID <span className="text-destructive" aria-hidden="true">*</span></Label><Input id="meta-assisted-phone" name="phone_number_id" defaultValue={String(connection?.phone_number_id ?? "")} required /></div>
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
