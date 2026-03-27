"use client";

import { useState, useTransition } from "react";

import { ReminderSettings, saveReminderSettings } from "@/app/settings/reminders/actions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type ReminderSettingsFormProps = {
  initialSettings: ReminderSettings;
};

const MIN_OFFSET = 15;
const MAX_OFFSET = 720;

export function ReminderSettingsForm({ initialSettings }: ReminderSettingsFormProps) {
  const [enabled, setEnabled] = useState<boolean>(initialSettings.reminderEnabled);
  const [offsetMinutes, setOffsetMinutes] = useState<number>(initialSettings.reminderOffsetMinutes);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatusMessage(null);
    setErrorMessage(null);

    startTransition(async () => {
      try {
        const result = await saveReminderSettings({
          reminderEnabled: enabled,
          reminderOffsetMinutes: offsetMinutes,
        });
        setStatusMessage("Configuración actualizada correctamente.");
        setOffsetMinutes(result.reminderOffsetMinutes);
      } catch (error) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "No se pudo guardar la configuración. Inténtalo nuevamente.",
        );
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border bg-card px-4 py-3">
        <div>
          <p className="text-sm font-medium">Recordatorios automáticos</p>
          <p className="text-muted-foreground text-sm">
            Envía un correo previo a la demo con los datos confirmados.
          </p>
        </div>
        <Checkbox
          id="reminder-enabled"
          checked={enabled}
          onCheckedChange={(checked) => setEnabled(Boolean(checked))}
          disabled={isPending}
        />
      </div>

      <div className="rounded-lg border p-4">
        <Label htmlFor="offset-input" className="text-sm font-medium">
          Anticipación del recordatorio
        </Label>
        <p className="text-muted-foreground text-sm">
          Define cuántos minutos antes de la demo se enviará el recordatorio.
        </p>
        <Input
          id="offset-input"
          type="number"
          min={MIN_OFFSET}
          max={MAX_OFFSET}
          step={15}
          value={offsetMinutes}
          onChange={(event) => setOffsetMinutes(Number(event.target.value))}
          disabled={!enabled || isPending}
          className="mt-2 w-40"
        />
        <p className="text-muted-foreground mt-1 text-xs">
          Rango permitido: {MIN_OFFSET} a {MAX_OFFSET} minutos.
        </p>
      </div>

      {statusMessage ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          {statusMessage}
        </div>
      ) : null}

      {errorMessage ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {errorMessage}
        </div>
      ) : null}

      <Button type="submit" disabled={isPending}>
        {isPending ? "Guardando…" : "Guardar cambios"}
      </Button>
      {initialSettings.updatedAt ? (
        <p className="text-muted-foreground text-xs">
          Última actualización: {new Date(initialSettings.updatedAt).toLocaleString()}
        </p>
      ) : null}
    </form>
  );
}
