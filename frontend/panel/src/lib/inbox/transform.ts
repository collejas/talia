import type { InboxAttachment, InboxMessage, InboxMessageRow } from "@/lib/inbox/types";

function coerceMetadata(value: unknown): Record<string, unknown> | null {
  if (!value) return null;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return null;
    }
    return null;
  }
  if (typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function extractNameCandidate(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length) {
      return trimmed;
    }
  }
  return null;
}

function extractAgentNameFromMetadata(metadata: Record<string, unknown> | null | undefined): string | null {
  if (!metadata) return null;

  const directKeys = ["manual_author", "manualAuthor", "agent_name", "agentName", "author", "author_name", "authorName"];
  for (const key of directKeys) {
    const candidate = extractNameCandidate(metadata[key]);
    if (candidate) {
      return candidate;
    }
  }

  const agent = metadata["agent"];
  if (agent && typeof agent === "object") {
    const agentRecord = agent as Record<string, unknown>;
    const agentKeys = ["name", "display_name", "displayName", "full_name", "fullName"];
    for (const key of agentKeys) {
      const candidate = extractNameCandidate(agentRecord[key]);
      if (candidate) {
        return candidate;
      }
    }
  }

  const extraRaw = metadata["extra"];
  const extra = coerceMetadata(extraRaw);
  if (extra) {
    const fromExtra = extractAgentNameFromMetadata(extra);
    if (fromExtra) {
      return fromExtra;
    }
  }

  return null;
}

function resolveAuthorForRow(row: InboxMessageRow, role: "contacto" | "usuario"): string {
  const baseAuthor = extractNameCandidate(row.author);
  if (role === "usuario") {
    const metadata = coerceMetadata(row.datos);
    const agentName = extractAgentNameFromMetadata(metadata);
    if (agentName) {
      const normalised = agentName.toLowerCase();
      if (normalised !== "agent" && normalised !== "agente") {
        return agentName;
      }
    }
    if (metadata) {
      let emailCandidate =
        extractNameCandidate(metadata["agent_email"]) ??
        extractNameCandidate(metadata["agentEmail"]) ??
        null;
      if (!emailCandidate) {
        const extra = coerceMetadata(metadata["extra"]);
        if (extra) {
          emailCandidate =
            extractNameCandidate(extra["agent_email"]) ??
            extractNameCandidate(extra["agentEmail"]) ??
            null;
        }
      }
      if (emailCandidate) {
        return emailCandidate;
      }
    }
    if (baseAuthor && baseAuthor.toLowerCase() !== "equipo tal-ia") {
      return baseAuthor;
    }
    if (agentName && agentName.trim().length) {
      return agentName;
    }
    return "Miembro del equipo";
  }

  return baseAuthor ?? "Contacto";
}

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
    const datos = coerceMetadata(row.datos);

    const author = resolveAuthorForRow(row, role);

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
    const metadata = coerceMetadata(record.datos);

    rows.push({
      message_id: id,
      conversacion_id:
        typeof record.conversacion_id === "string" ? record.conversacion_id : null,
      author: typeof record.author === "string" ? record.author : null,
      role,
      body,
      tipo_contenido:
        typeof record.tipo_contenido === "string" ? record.tipo_contenido : null,
      datos: metadata,
      creado_en: typeof record.timestamp === "string" ? record.timestamp : null,
    });
  }
  return mapMessageRows(rows);
}

function normalizeAttachments(source: Record<string, unknown> | InboxMessageRow): InboxAttachment[] {
  const results: InboxAttachment[] = [];
  const seen = new Set<string>();

  const candidates: unknown[] = [];
  const direct = (source as InboxMessageRow).attachments;
  if (Array.isArray(direct) && direct.length > 0) {
    candidates.push(direct);
  } else {
    const datos = (source as InboxMessageRow).datos;
    if (datos && typeof datos === "object") {
      const maybe = (datos as Record<string, unknown>).attachments;
      if (Array.isArray(maybe)) candidates.push(maybe);
    }
  }

  for (const candidate of candidates) {
    if (!Array.isArray(candidate)) continue;
    for (const raw of candidate) {
      if (!raw || typeof raw !== "object") continue;
      const record = raw as Record<string, unknown>;
      const url = typeof record.url === "string" ? record.url : null;
      const attachmentId = typeof record.id === "string" ? record.id : undefined;
      const path = typeof record.path === "string" ? record.path : undefined;
      if (!url && !path) continue;
      const effectiveUrl = path?.startsWith("whatsapp/")
        ? attachmentId
          ? `/api/crm/inbox/attachments/${attachmentId}`
          : `/api/crm/inbox/attachments/path?path=${encodeURIComponent(path)}`
        : url;
      if (!effectiveUrl) continue;
      const sizeValue = record.size;
      let size: number | undefined;
      if (typeof sizeValue === "number") {
        size = Math.trunc(sizeValue);
      } else if (typeof sizeValue === "string") {
        const parsed = Number(sizeValue);
        if (!Number.isNaN(parsed)) size = Math.trunc(parsed);
      }

      const key = `${effectiveUrl}::${typeof record.name === "string" ? record.name : ""}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);

      results.push({
        id: attachmentId,
        url: effectiveUrl,
        mime: typeof record.mime === "string" ? record.mime : undefined,
        size,
        name: typeof record.name === "string" ? record.name : undefined,
        provider_id: typeof record.provider_id === "string" ? record.provider_id : undefined,
        path,
      });
    }
  }

  return results;
}
