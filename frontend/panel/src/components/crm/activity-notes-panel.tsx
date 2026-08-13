"use client";

import * as React from "react";
import { IconCalendarPlus, IconNotes, IconPaperclip, IconPlus } from "@tabler/icons-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { NoteAttachments } from "@/components/crm/note-attachments";
import { uploadNoteAttachment } from "@/lib/crm/note-attachments";

export type ActivityContextEntityType = "persona" | "cuenta" | "oportunidad";

type ActivityNotesPanelProps = {
  entityType: ActivityContextEntityType;
  entityId: string;
};

type NoteRow = {
  id: string;
  texto: string;
  creado_en: string;
  tipo?: string;
};

type ActivityRow = {
  id: string;
  tipo: string;
  asunto: string | null;
  descripcion: string | null;
  estado: string;
  fecha_vencimiento: string | null;
  recordatorio_en: string | null;
  creado_en: string;
};

function formatDate(value: string | null | undefined): string {
  if (!value) return "Sin fecha";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("es-MX");
}

function toIso(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function ActivityNotesPanel({ entityType, entityId }: ActivityNotesPanelProps) {
  const basePath = `/api/crm/activity-context/${entityType}/${encodeURIComponent(entityId)}`;
  const [notes, setNotes] = React.useState<NoteRow[]>([]);
  const [activities, setActivities] = React.useState<ActivityRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [text, setText] = React.useState("");
  const [reminderEnabled, setReminderEnabled] = React.useState(false);
  const [reminderAt, setReminderAt] = React.useState("");
  const [activityType, setActivityType] = React.useState("seguimiento");
  const [pending, setPending] = React.useState(false);
  const [success, setSuccess] = React.useState<string | null>(null);
  const [pendingFiles, setPendingFiles] = React.useState<File[]>([]);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [notesResponse, activitiesResponse] = await Promise.all([
        fetch(`${basePath}/notes`, { cache: "no-store" }),
        fetch(`${basePath}/activities`, { cache: "no-store" }),
      ]);
      const notesBody = await notesResponse.json().catch(() => ({}));
      const activitiesBody = await activitiesResponse.json().catch(() => ({}));
      if (!notesResponse.ok) throw new Error(notesBody.error || "No se pudieron cargar las notas.");
      if (!activitiesResponse.ok) throw new Error(activitiesBody.error || "No se pudieron cargar las actividades.");
      setNotes(Array.isArray(notesBody.data) ? notesBody.data : []);
      setActivities(Array.isArray(activitiesBody.data) ? activitiesBody.data : []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo cargar el seguimiento.");
    } finally {
      setLoading(false);
    }
  }, [basePath]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) {
      setError("Escribe una nota o instrucción.");
      return;
    }
    const reminderIso = reminderEnabled ? toIso(reminderAt) : null;
    if (reminderEnabled && !reminderIso) {
      setError("Selecciona una fecha y hora válidas.");
      return;
    }

    setPending(true);
    setError(null);
    setSuccess(null);
    try {
      let activityId: string | undefined;
      if (reminderIso) {
        const activityResponse = await fetch(`${basePath}/activities`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tipo: activityType,
            asunto: trimmed.slice(0, 255),
            descripcion: trimmed,
            estado: "pendiente",
            prioridad: "media",
            fecha_vencimiento: reminderIso,
            recordatorio_en: reminderIso,
          }),
        });
        const activityBody = await activityResponse.json().catch(() => ({}));
        if (!activityResponse.ok) throw new Error(activityBody.error || "No se pudo programar la actividad.");
        activityId = typeof activityBody.data?.id === "string" ? activityBody.data.id : undefined;
      }

      const noteResponse = await fetch(`${basePath}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          texto: trimmed,
          actividad_id: activityId,
          tipo: "interna",
          visible_para_cliente: false,
        }),
      });
      const noteBody = await noteResponse.json().catch(() => ({}));
      if (!noteResponse.ok) throw new Error(noteBody.error || "No se pudo guardar la nota.");

      const createdNoteId = typeof noteBody.data?.id === "string" ? noteBody.data.id : null;
      if (createdNoteId && pendingFiles.length) {
        for (const file of pendingFiles) await uploadNoteAttachment(createdNoteId, file);
      }

      setText("");
      setPendingFiles([]);
      setReminderEnabled(false);
      setReminderAt("");
      setSuccess(activityId ? "Nota y recordatorio guardados." : "Nota guardada.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo guardar el seguimiento.");
    } finally {
      setPending(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Seguimiento</CardTitle>
        <CardDescription>
          Registra notas y programa recordatorios para esta {entityType === "persona" ? "persona" : entityType === "cuenta" ? "cuenta" : "oportunidad"}.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <form className="space-y-3 rounded-xl border bg-muted/20 p-4" onSubmit={handleSubmit}>
          <div className="flex items-center gap-2 text-sm font-medium"><IconNotes className="size-4" /> Nueva nota</div>
          <Textarea value={text} onChange={(event) => setText(event.target.value)} placeholder="Qué pidió, qué debes enviar o qué debes recordar…" rows={3} />
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/jpeg,image/png,image/webp,application/pdf,.doc,.docx,.xls,.xlsx"
              className="hidden"
              onChange={(event) => {
                setPendingFiles((current) => [...current, ...Array.from(event.target.files ?? [])]);
                event.target.value = "";
              }}
            />
            <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => fileInputRef.current?.click()}>
              <IconPaperclip className="size-4" /> Adjuntar evidencia
            </Button>
            {pendingFiles.length ? <span className="text-xs text-muted-foreground">{pendingFiles.length} archivo(s) listo(s) para subir</span> : null}
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={reminderEnabled} onChange={(event) => setReminderEnabled(event.target.checked)} />
            Programar actividad y recordatorio
          </label>
          {reminderEnabled ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor={`activity-type-${entityType}`}>Tipo</Label>
                <select id={`activity-type-${entityType}`} className="h-9 w-full rounded-md border bg-background px-3 text-sm" value={activityType} onChange={(event) => setActivityType(event.target.value)}>
                  <option value="seguimiento">Seguimiento</option>
                  <option value="llamada">Llamada</option>
                  <option value="mensaje">Mensaje</option>
                  <option value="enviar_informacion">Enviar información</option>
                  <option value="tarea">Tarea</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`activity-date-${entityType}`}>Fecha y hora</Label>
                <Input id={`activity-date-${entityType}`} type="datetime-local" value={reminderAt} onChange={(event) => setReminderAt(event.target.value)} />
              </div>
            </div>
          ) : null}
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {success ? <p className="text-sm text-emerald-600">{success}</p> : null}
          <Button type="submit" disabled={pending} className="gap-2"><IconPlus className="size-4" />{pending ? "Guardando…" : "Guardar seguimiento"}</Button>
        </form>

        {loading ? <p className="text-sm text-muted-foreground">Cargando seguimiento…</p> : null}
        {!loading && !notes.length && !activities.length ? <p className="text-sm text-muted-foreground">Aún no hay notas ni actividades.</p> : null}
        {activities.length ? (
          <div className="space-y-2">
            <h3 className="flex items-center gap-2 text-sm font-semibold"><IconCalendarPlus className="size-4" /> Actividades</h3>
            {activities.map((activity) => (
              <div key={activity.id} className="rounded-lg border p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-medium">{activity.asunto || activity.tipo}</span><Badge variant={activity.estado === "pendiente" ? "secondary" : "outline"}>{activity.estado}</Badge></div>
                {activity.descripcion ? <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{activity.descripcion}</p> : null}
                <p className="mt-2 text-xs text-muted-foreground">Recordatorio: {formatDate(activity.recordatorio_en || activity.fecha_vencimiento)}</p>
              </div>
            ))}
          </div>
        ) : null}
        {notes.length ? (
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">Notas recientes</h3>
            {notes.map((note) => (
              <div key={note.id} className="rounded-lg border p-3 text-sm">
                <p className="whitespace-pre-wrap">{note.texto}</p>
                <p className="mt-2 text-xs text-muted-foreground">{formatDate(note.creado_en)}</p>
                {entityType === "oportunidad" ? <NoteAttachments noteId={note.id} /> : null}
              </div>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
