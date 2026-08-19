"use client";

import * as React from "react";
import { toast } from "sonner";
import { IconCheck, IconClipboard } from "@tabler/icons-react";

import type { EmbudoCard, EmbudoStage } from "@/lib/embudo/data";
import { scheduleLeadDemo } from "@/lib/embudo/actions";
import { fromDateTimeLocalInput, toDateTimeLocalInput } from "@/lib/datetime";
import { Button } from "@/components/ui/button";
import { DateTimeCalendarPicker } from "@/components/ui/datetime-calendar-picker";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

type ScheduleOpportunitySheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  card: EmbudoCard | null;
  targetStage: EmbudoStage | null;
  onCreated?: () => void | Promise<void>;
};

export function ScheduleOpportunitySheet({
  open,
  onOpenChange,
  card,
  targetStage,
  onCreated,
}: ScheduleOpportunitySheetProps) {
  const [startAt, setStartAt] = React.useState(() => toDateTimeLocalInput(new Date(Date.now() + 3600000).toISOString()));
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [createdLink, setCreatedLink] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setStartAt(toDateTimeLocalInput(new Date(Date.now() + 3600000).toISOString()));
    setPending(false);
    setError(null);
    setCreatedLink(null);
    setCopied(false);
  }, [open]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!card?.oportunidadId) {
      setError("No se encontró la oportunidad.");
      return;
    }
    const isoValue = fromDateTimeLocalInput(startAt);
    if (!isoValue) {
      setError("La fecha de la cita no tiene un formato válido.");
      return;
    }

    setPending(true);
    setError(null);
    const result = await scheduleLeadDemo({
      conversationId: card.conversacionId,
      personaId: card.personaId,
      contactoId: card.contactoId,
      oportunidadId: card.oportunidadId,
      canal: card.canal,
      startAt: isoValue,
    });
    setPending(false);

    if (!result.ok) {
      setError(result.error || "No se pudo agendar la cita.");
      return;
    }

    const link = result.booking.meeting_url || result.booking.external_join_url || null;
    setCreatedLink(link);
    toast.success("Cita creada correctamente.");
    await onCreated?.();
  }

  async function handleCopy() {
    if (!createdLink) return;
    try {
      await navigator.clipboard.writeText(createdLink);
      setCopied(true);
      toast.success("Enlace de reunión copiado.");
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error("No se pudo copiar el enlace.");
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Nueva cita</SheetTitle>
          <SheetDescription>
            Agenda otra cita para esta oportunidad{targetStage ? ` en “${targetStage.nombre}”` : ""}.
          </SheetDescription>
        </SheetHeader>
        <form className="flex flex-col gap-4 px-4 pb-6" onSubmit={handleSubmit}>
          <DateTimeCalendarPicker
            id="inbox-opportunity-booking-datetime"
            label="Fecha y hora de la cita"
            value={startAt}
            onChange={setStartAt}
            minValue={toDateTimeLocalInput(new Date().toISOString())}
            disabled={pending}
          />
          {error ? <p className="rounded border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p> : null}
          {createdLink ? (
            <div className="space-y-3 rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-950">
              <p className="font-semibold">Cita creada. Enlace de reunión:</p>
              <p className="break-all">{createdLink}</p>
              <Button type="button" variant="outline" className="gap-1" onClick={handleCopy}>
                {copied ? <IconCheck className="size-4" /> : <IconClipboard className="size-4" />}
                {copied ? "Copiado" : "Copiar enlace"}
              </Button>
            </div>
          ) : null}
          <SheetFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
              Cerrar
            </Button>
            <Button type="submit" disabled={pending || !card}>
              {pending ? "Creando..." : "Crear cita"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
