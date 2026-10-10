"use client";

import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type ContractTemplate = {
  id: string;
  nombre: string;
  tipo_operacion: "reserva" | "compraventa" | "otro";
  version: number;
  contenido_plantilla: string;
  activo: boolean;
  actualizado_en: string;
};

type Props = { initialTemplates: ContractTemplate[] };

const VARIABLES = [
  "{{comprador.nombre_completo}}",
  "{{comprador.domicilio}}",
  "{{propiedad.nombre}}",
  "{{propiedad.direccion}}",
  "{{operacion.precio_acordado}}",
  "{{operacion.importe_reserva}}",
  "{{operacion.fecha_reserva}}",
  "{{inmobiliaria.nombre}}",
];

const EMPTY_FORM = {
  nombre: "",
  tipo_operacion: "reserva" as ContractTemplate["tipo_operacion"],
  version: "1",
  contenido_plantilla: "",
  activo: true,
};

export function InmobiliariaContractTemplates({ initialTemplates }: Props) {
  const [templates, setTemplates] = useState(initialTemplates);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function selectTemplate(template: ContractTemplate) {
    setSelectedId(template.id);
    setForm({
      nombre: template.nombre,
      tipo_operacion: template.tipo_operacion,
      version: String(template.version),
      contenido_plantilla: template.contenido_plantilla,
      activo: template.activo,
    });
    setMessage(null);
    setError(null);
  }

  function newTemplate() {
    setSelectedId(null);
    setForm(EMPTY_FORM);
    setMessage(null);
    setError(null);
  }

  async function saveTemplate() {
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch(
        selectedId
          ? `/api/crm/inmobiliaria/contratos/plantillas/${selectedId}`
          : "/api/crm/inmobiliaria/contratos/plantillas",
        {
          method: selectedId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...form, version: Number(form.version) }),
        },
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || "No se pudo guardar la plantilla.");
      const saved = payload as ContractTemplate;
      setTemplates((current) => {
        const withoutSaved = current.filter((item) => item.id !== saved.id);
        return [saved, ...withoutSaved].sort((a, b) => a.nombre.localeCompare(b.nombre));
      });
      setSelectedId(saved.id);
      setMessage("Plantilla guardada correctamente.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo guardar la plantilla.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(260px,0.8fr)_minmax(0,1.6fr)]">
      <Card>
        <CardHeader className="flex-row items-start justify-between gap-3">
          <div>
            <CardTitle>Plantillas guardadas</CardTitle>
            <CardDescription>Contratos disponibles para preparar una reserva.</CardDescription>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={newTemplate}>Nueva</Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {templates.length === 0 ? (
            <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Todavía no hay plantillas.</p>
          ) : templates.map((template) => (
            <button
              key={template.id}
              type="button"
              className={`w-full rounded-lg border p-3 text-left transition hover:bg-muted/50 ${selectedId === template.id ? "border-primary bg-muted/40" : ""}`}
              onClick={() => selectTemplate(template)}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{template.nombre}</span>
                <Badge variant={template.activo ? "secondary" : "outline"}>{template.activo ? "Activa" : "Inactiva"}</Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{template.tipo_operacion} · versión {template.version}</p>
            </button>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{selectedId ? "Editar plantilla" : "Nueva plantilla"}</CardTitle>
          <CardDescription>El texto legal lo proporciona y revisa la inmobiliaria.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-[1fr_180px_110px]">
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="contract-template-name">Nombre</label>
              <Input id="contract-template-name" value={form.nombre} onChange={(event) => setForm({ ...form, nombre: event.target.value })} placeholder="Reserva de compraventa" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="contract-template-type">Tipo</label>
              <select id="contract-template-type" className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={form.tipo_operacion} onChange={(event) => setForm({ ...form, tipo_operacion: event.target.value as ContractTemplate["tipo_operacion"] })}>
                <option value="reserva">Reserva</option>
                <option value="compraventa">Compraventa</option>
                <option value="otro">Otro</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="contract-template-version">Versión</label>
              <Input id="contract-template-version" type="number" min="1" value={form.version} onChange={(event) => setForm({ ...form, version: event.target.value })} />
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="contract-template-content">Texto del contrato</label>
            <Textarea id="contract-template-content" className="min-h-[420px] font-mono text-xs" value={form.contenido_plantilla} onChange={(event) => setForm({ ...form, contenido_plantilla: event.target.value })} placeholder="Escribe aquí el contrato y usa las variables disponibles." />
          </div>
          <div className="rounded-lg border bg-muted/20 p-3">
            <p className="text-sm font-medium">Variables disponibles</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {VARIABLES.map((variable) => <code key={variable} className="rounded bg-muted px-2 py-1 text-xs">{variable}</code>)}
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.activo} onChange={(event) => setForm({ ...form, activo: event.target.checked })} />
            Disponible para nuevas reservas
          </label>
          {message ? <p className="text-sm text-emerald-600">{message}</p> : null}
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <div className="flex justify-end">
            <Button type="button" onClick={() => void saveTemplate()} disabled={saving || !form.nombre.trim() || !form.contenido_plantilla.trim()}>
              {saving ? "Guardando…" : "Guardar plantilla"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
