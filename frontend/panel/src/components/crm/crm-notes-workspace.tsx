"use client";

import Link from "next/link";

import { ActivityNotesPanel, type ActivityContextEntityType } from "@/components/crm/activity-notes-panel";
import { Button } from "@/components/ui/button";
import { ClientDataTable } from "@/components/client-data-table";
import type { DataTableRow, DateColumnConfig } from "@/components/data-table";

type NoteRecord = {
  id: string;
  relacion_tipo: string;
  relacion_id: string;
  actividad_id?: string | null;
  texto: string;
  visible_para_cliente: boolean;
  tipo: string;
  creado_por_usuario_id?: string | null;
  creado_en: string;
  oportunidad?: {
    id: string;
    codigo_oportunidad: string | null;
    titulo: string | null;
    contacto_nombre: string | null;
  } | null;
};

function resolveContextType(value: string): ActivityContextEntityType | null {
  if (value === "persona" || value === "cuenta" || value === "oportunidad") return value;
  return null;
}

function resolveContextHref(type: ActivityContextEntityType, id: string): string | null {
  if (type === "persona") return `/personas/${encodeURIComponent(id)}`;
  if (type === "oportunidad") return `/embudo?oportunidadId=${encodeURIComponent(id)}`;
  return null;
}

function NoteDetails({ row }: { row: DataTableRow }) {
  const note = row.raw as NoteRecord | undefined;
  if (!note) return null;

  const contextType = resolveContextType(note.relacion_tipo);
  const contextHref = contextType ? resolveContextHref(contextType, note.relacion_id) : null;
  const opportunityLabel = note.oportunidad
    ? [note.oportunidad.codigo_oportunidad, note.oportunidad.titulo].filter(Boolean).join(" · ")
    : null;

  return (
    <div className="space-y-4 pb-4">
      <div className="rounded-xl border bg-muted/20 p-4">
        <p className="whitespace-pre-wrap text-sm">{note.texto}</p>
        <p className="mt-3 text-xs text-muted-foreground">
          {note.tipo} · {note.visible_para_cliente ? "Visible para cliente" : "Nota interna"} · {new Date(note.creado_en).toLocaleString("es-MX")}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {opportunityLabel ? `Oportunidad: ${opportunityLabel}` : `Relación: ${note.relacion_tipo} · ${note.relacion_id}`}
        </p>
        {contextHref ? (
          <Button asChild variant="link" className="mt-2 h-auto px-0">
            <Link href={contextHref}>Abrir {contextType === "persona" ? "contacto" : "oportunidad"}</Link>
          </Button>
        ) : null}
      </div>

      {contextType ? (
        <ActivityNotesPanel entityType={contextType} entityId={note.relacion_id} />
      ) : (
        <p className="text-sm text-muted-foreground">Esta relación no tiene acciones contextuales disponibles.</p>
      )}
    </div>
  );
}

export function CrmNotesWorkspace({
  rows,
  dateColumns,
}: {
  rows: DataTableRow[];
  dateColumns?: DateColumnConfig[];
}) {
  return (
    <ClientDataTable
      rows={rows}
      storageKey="crm-notas"
      columnLabels={{
        header: "Nota",
        type: "Tipo",
        status: "Visibilidad",
        target: "Relación",
        limit: "Contexto",
        reviewer: "Creada por",
      }}
      detailDescription="Revisa la nota, abre el registro relacionado y agrega seguimiento."
      renderRowDetails={(row) => <NoteDetails row={row} />}
      initialVisibility={{ limit: false }}
      dateColumns={dateColumns}
    />
  );
}
