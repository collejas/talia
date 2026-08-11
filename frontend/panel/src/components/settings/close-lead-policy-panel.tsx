"use client";

import { useState, useTransition } from "react";

import { saveCloseLeadPolicy, type CloseLeadChannel, type CloseLeadPolicy } from "@/app/settings/close-lead/actions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

type Props = { initialWhatsapp: CloseLeadPolicy; initialWebchat: CloseLeadPolicy };

const FIELDS = [
  ["nombre_requerido", "Nombre"],
  ["telefono_requerido", "Teléfono"],
  ["necesidad_proposito_requerido", "Necesidad / interés"],
  ["notes_requerido", "Notas"],
  ["correo_requerido", "Correo"],
  ["company_name_requerido", "Empresa"],
] as const;

export function CloseLeadPolicyPanel({ initialWhatsapp, initialWebchat }: Props) {
  const [policies, setPolicies] = useState<Record<CloseLeadChannel, CloseLeadPolicy>>({
    whatsapp: initialWhatsapp,
    webchat: initialWebchat,
  });
  const [saving, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function update(channel: CloseLeadChannel, field: keyof CloseLeadPolicy, value: boolean) {
    setPolicies((current) => ({ ...current, [channel]: { ...current[channel], [field]: value } }));
  }

  function submit(channel: CloseLeadChannel) {
    const policy = policies[channel];
    setMessage(null);
    startTransition(async () => {
      try {
        await saveCloseLeadPolicy({
          canal: channel,
          activo: policy.activo,
          nombre_requerido: policy.nombre_requerido,
          telefono_requerido: policy.telefono_requerido,
          necesidad_proposito_requerido: policy.necesidad_proposito_requerido,
          notes_requerido: policy.notes_requerido,
          correo_requerido: policy.correo_requerido,
          company_name_requerido: policy.company_name_requerido,
        });
        setMessage(`Política de ${channel} guardada.`);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "No se pudo guardar la política.");
      }
    });
  }

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {(["whatsapp", "webchat"] as CloseLeadChannel[]).map((channel) => {
        const policy = policies[channel];
        return (
          <section key={channel} className="rounded-xl border bg-card p-5 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="font-semibold">{channel === "whatsapp" ? "WhatsApp" : "Webchat"}</h2>
                <p className="mt-1 text-sm text-muted-foreground">Campos obligatorios para cerrar la oportunidad.</p>
              </div>
              <Button type="button" size="sm" onClick={() => submit(channel)} disabled={saving}>Guardar</Button>
            </div>
            <div className="mt-5 grid gap-3">
              {FIELDS.map(([field, label]) => (
                <label key={field} className="flex items-center gap-3 text-sm">
                  <Checkbox
                    checked={Boolean(policy[field])}
                    onCheckedChange={(checked) => update(channel, field, checked === true)}
                    disabled={saving}
                  />
                  <Label>{label}</Label>
                </label>
              ))}
            </div>
          </section>
        );
      })}
      {message ? <p className="text-sm text-muted-foreground xl:col-span-2">{message}</p> : null}
    </div>
  );
}
