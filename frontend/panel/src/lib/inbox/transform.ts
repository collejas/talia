import type { InboxAttachment, InboxMessage, InboxMessageRow } from "@/lib/inbox/types";

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

    const attachments: InboxAttachment[] = normalizeAttachments(row);

    return [
      {
        id,
        author,
        role,
        timestamp,
        body,
        tipo,
        datos,
        attachments,
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
      attachments: normalizeAttachments(record),
    });
  }
  return mapMessageRows(rows);
}

function normalizeAttachments(source: Record<string, unknown> | InboxMessageRow): InboxAttachment[] {
  const results: InboxAttachment[] = [];

  const candidates: unknown[] = [];
  const direct = (source as InboxMessageRow).attachments;
  if (Array.isArray(direct)) candidates.push(direct);

  const datos = (source as InboxMessageRow).datos;
  if (datos && typeof datos === "object") {
    const maybe = (datos as Record<string, unknown>).attachments;
    if (Array.isArray(maybe)) candidates.push(maybe);
  }

  for (const candidate of candidates) {
    if (!Array.isArray(candidate)) continue;
    for (const raw of candidate) {
      if (!raw || typeof raw !== "object") continue;
      const record = raw as Record<string, unknown>;
      const url = typeof record.url === "string" ? record.url : null;
      if (!url) continue;
      const sizeValue = record.size;
      let size: number | undefined;
      if (typeof sizeValue === "number") {
        size = Math.trunc(sizeValue);
      } else if (typeof sizeValue === "string") {
        const parsed = Number(sizeValue);
        if (!Number.isNaN(parsed)) size = Math.trunc(parsed);
      }

      results.push({
        id: typeof record.id === "string" ? record.id : undefined,
        url,
        mime: typeof record.mime === "string" ? record.mime : undefined,
        size,
        name: typeof record.name === "string" ? record.name : undefined,
        provider_id: typeof record.provider_id === "string" ? record.provider_id : undefined,
        path: typeof record.path === "string" ? record.path : undefined,
      });
    }
  }

  return results;
}
