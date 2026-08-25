"use client"

import { useActionState, useMemo } from "react"

import { updateWhatsappAssistantScheduleAction, type CrudActionState } from "@/app/settings/variables/actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type DayName = "lunes" | "martes" | "miercoles" | "jueves" | "viernes" | "sabado" | "domingo"

type Props = {
  initialValues: Record<string, unknown> | null
}

const DAYS: Array<{ key: DayName; label: string }> = [
  { key: "lunes", label: "Lunes" },
  { key: "martes", label: "Martes" },
  { key: "miercoles", label: "Miércoles" },
  { key: "jueves", label: "Jueves" },
  { key: "viernes", label: "Viernes" },
  { key: "sabado", label: "Sábado" },
  { key: "domingo", label: "Domingo" },
]

const INITIAL_STATE: CrudActionState = { status: "idle" }

function readBoolean(values: Record<string, unknown> | null, key: string, fallback: boolean): boolean {
  return typeof values?.[key] === "boolean" ? values[key] as boolean : fallback
}

function readString(values: Record<string, unknown> | null, key: string, fallback = ""): string {
  return typeof values?.[key] === "string" ? values[key] as string : fallback
}

export function WhatsAppAssistantSchedulePanel({ initialValues }: Props) {
  const [state, formAction] = useActionState(updateWhatsappAssistantScheduleAction, INITIAL_STATE)
  const formKey = useMemo(() => JSON.stringify(initialValues ?? {}), [initialValues])

  return (
    <form key={formKey} action={formAction} className="space-y-5 rounded-lg border border-border/60 p-4">
      <div className="space-y-1">
        <p className="text-sm font-medium">Horario del asistente WhatsApp</p>
        <p className="text-xs text-muted-foreground">
          El vendedor atiende dentro del horario configurado y la IA responde fuera de ese horario.
          La conversación siempre se asigna y notifica al vendedor.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="whatsapp_schedule_activo"
            defaultChecked={readBoolean(initialValues, "activo", false)}
            className="size-4 rounded border-input"
          />
          Activar horario de atención
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="whatsapp_schedule_aplica_a_normal"
            defaultChecked={readBoolean(initialValues, "aplica_a_normal", true)}
            className="size-4 rounded border-input"
          />
          WhatsApp normal
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="whatsapp_schedule_aplica_a_prospeccion"
            defaultChecked={readBoolean(initialValues, "aplica_a_prospeccion", true)}
            className="size-4 rounded border-input"
          />
          Prospección
        </label>
      </div>

      <div className="max-w-sm space-y-2">
        <Label htmlFor="whatsapp_schedule_zona_horaria">Zona horaria IANA</Label>
        <Input
          id="whatsapp_schedule_zona_horaria"
          name="whatsapp_schedule_zona_horaria"
          defaultValue={readString(initialValues, "zona_horaria", "UTC")}
          placeholder="America/Mexico_City"
        />
        <p className="text-xs text-muted-foreground">Ejemplo: `America/Mexico_City`.</p>
      </div>

      <div className="overflow-x-auto rounded-md border border-border/60">
        <table className="w-full min-w-[620px] text-sm">
          <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Día</th>
              <th className="px-3 py-2 font-medium">Humano activo</th>
              <th className="px-3 py-2 font-medium">Inicio</th>
              <th className="px-3 py-2 font-medium">Fin</th>
            </tr>
          </thead>
          <tbody>
            {DAYS.map(({ key, label }) => (
              <tr key={key} className="border-t border-border/50">
                <td className="px-3 py-2 font-medium">{label}</td>
                <td className="px-3 py-2">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      name={`whatsapp_schedule_${key}_activo`}
                      defaultChecked={readBoolean(initialValues, `${key}_activo`, false)}
                      className="size-4 rounded border-input"
                    />
                    <span className="sr-only">Activar {label}</span>
                  </label>
                </td>
                <td className="px-3 py-2">
                  <Input
                    type="time"
                    name={`whatsapp_schedule_${key}_inicio`}
                    defaultValue={readString(initialValues, `${key}_inicio`)}
                    aria-label={`Inicio ${label}`}
                  />
                </td>
                <td className="px-3 py-2">
                  <Input
                    type="time"
                    name={`whatsapp_schedule_${key}_fin`}
                    defaultValue={readString(initialValues, `${key}_fin`)}
                    aria-label={`Fin ${label}`}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p
          className={state.status === "error" ? "text-sm text-destructive" : "text-sm text-muted-foreground"}
          role={state.status === "error" ? "alert" : undefined}
        >
          {state.message ?? "Los cambios se aplican al siguiente mensaje entrante."}
        </p>
        <Button type="submit">Guardar horario</Button>
      </div>
    </form>
  )
}
