import type { InboxMessage, InboxMessageRow } from "@/lib/inbox/types";

export function mapMessageRows(rows?: InboxMessageRow[] | null): InboxMessage[] {
  if (!rows || !rows.length) return [];
  return rows.flatMap((row) => {
    if (!row || typeof row !== "object") return [];
    const id = typeof row.message_id === "string" && row.message_id ? row.message_id : null;
    if (!id) return [];

    const role: "contacto" | "usuario" =
      row.role === "usuario" ? "usuario" : "contacto";
    const timestamp =
      typeof row.creado_en === "string" && row.creado_en.length
        ? row.creado_en
        : new Date().toISOString();
    const body =
      Array.isArray(row.body) && row.body.length
        ? row.body.map((paragraph) => String(paragraph))
        : ["(mensaje sin texto)"];
    const tipo =
      typeof row.tipo_contenido === "string" && row.tipo_contenido.length
        ? row.tipo_contenido
        : "texto";
    const datos =
      row.datos && typeof row.datos === "object" ? (row.datos as Record<string, unknown>) : null;

    const author =
      typeof row.author === "string" && row.author.trim().length
        ? row.author.trim()
        : role === "usuario"
          ? "Equipo Tal-IA"
          : "Contacto";

    return [
      {
        id,
        author,
        role,
        timestamp,
        body,
        tipo,
        datos,
      },
    ];
  });
}

export function mapMessagesFromRaw(raw: unknown): InboxMessage[] {
  if (!Array.isArray(raw)) return [];
  const rows: InboxMessageRow[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const id = typeof record.message_id === "string" ? record.message_id : null;
    if (!id) continue;

    const role =
      record.role === "usuario" || record.role === "contacto"
        ? (record.role as "usuario" | "contacto")
        : null;
    const body = Array.isArray(record.body)
      ? record.body.map((paragraph) => String(paragraph))
      : record.body != null
        ? [String(record.body)]
        : null;
    rows.push({
      message_id: id,
      conversacion_id:
        typeof record.conversacion_id === "string" ? record.conversacion_id : null,
      author: typeof record.author === "string" ? record.author : null,
      role,
      body,
      tipo_contenido:
        typeof record.tipo_contenido === "string" ? record.tipo_contenido : null,
      datos:
        record.datos && typeof record.datos === "object"
          ? (record.datos as Record<string, unknown>)
          : null,
      creado_en: typeof record.timestamp === "string" ? record.timestamp : null,
    });
  }
  return mapMessageRows(rows);
}
