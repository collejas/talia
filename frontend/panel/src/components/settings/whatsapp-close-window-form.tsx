"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const DEFAULT_HOURS = 12;
const MIN_HOURS = 1;
const MAX_HOURS = 168;

type Props = {
  initialMinutes?: number | null;
};

function minutesToHours(minutes?: number | null) {
  if (typeof minutes !== "number" || !Number.isFinite(minutes) || minutes <= 0) {
    return DEFAULT_HOURS;
  }
  return Math.max(MIN_HOURS, Math.min(MAX_HOURS, Math.round(minutes / 60)));
}

export function WhatsAppCloseWindowForm({ initialMinutes }: Props) {
  const [hours, setHours] = useState(String(minutesToHours(initialMinutes)));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const parsedHours = Number(hours);
    if (!Number.isInteger(parsedHours) || parsedHours < MIN_HOURS || parsedHours > MAX_HOURS) {
      setError(`Indica un periodo entero entre ${MIN_HOURS} y ${MAX_HOURS} horas.`);
      setMessage(null);
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/settings/variables/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          config: { whatsapp: { close_after_lead_minutes: parsedHours * 60 } },
        }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error || "No se pudo guardar el periodo de cierre.");
      }
      setMessage(`Periodo guardado: ${parsedHours} ${parsedHours === 1 ? "hora" : "horas"}.`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "No se pudo guardar el periodo de cierre.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="mb-4">
      <CardHeader className="space-y-1">
        <CardTitle className="text-base">Cierre automático de conversaciones de WhatsApp</CardTitle>
        <CardDescription>
          Después de ejecutar <code className="rounded bg-muted px-1 py-0.5 text-xs">close_lead</code>,
          la conversación queda disponible durante este periodo para agendar o continuar el proceso.
          Si no hay actividad, se cierra automáticamente y el siguiente mensaje inicia una nueva oportunidad.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-2 sm:max-w-sm">
          <Label htmlFor="whatsapp-close-window-hours">Tiempo antes de cerrar (horas)</Label>
          <Input
            id="whatsapp-close-window-hours"
            type="number"
            min={MIN_HOURS}
            max={MAX_HOURS}
            step={1}
            value={hours}
            onChange={(event) => setHours(event.target.value)}
            disabled={saving}
          />
          <p className="text-xs text-muted-foreground">Valor predeterminado: 12 horas. Máximo permitido: 7 días.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" onClick={save} disabled={saving}>
            {saving ? "Guardando…" : "Guardar periodo"}
          </Button>
          {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>
      </CardContent>
    </Card>
  );
}
