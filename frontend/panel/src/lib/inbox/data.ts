"use server";

import { callCrmApi } from "@/lib/api/crm";
import { mapThreads } from "@/lib/inbox/threads";
import type { InboxSummary, InboxPayload, InboxThreadRow } from "@/lib/inbox/types";

type InboxResumenResponse = {
  total?: number;
  unread?: number;
  awaiting?: number;
  folders?: Array<{
    id?: string;
    label?: string | null;
    count?: number;
  }>;
};

export type { InboxFolder, InboxSummary, InboxThread, InboxPayload, InboxMessage } from "@/lib/inbox/types";
export type { InboxMessageRow } from "@/lib/inbox/types";

const FOLDER_LABELS: Record<string, string> = {
  inbox: "Bandeja de entrada",
  assigned: "Asignados a mí",
  pending: "Seguimiento",
  closed: "Cerrados",
};

export async function loadInboxData(): Promise<InboxPayload> {
  const [resumen, threads] = await Promise.all([
    callCrmApi<InboxResumenResponse>("/crm/inbox/summary", { withUserToken: true }),
    callCrmApi<InboxThreadRow[]>("/crm/inbox/threads", {
      withUserToken: true,
      searchParams: { limit: "25", message_limit: "20" },
    }),
  ]);

  const errors: string[] = [];
  if (!resumen.ok) errors.push(resumen.error);
  if (!threads.ok) errors.push(threads.error);

  const summary = mapSummary(resumen.ok ? resumen.data : undefined);
  const mappedThreads = mapThreads(threads.ok ? threads.data : undefined);
  const totalThreads =
    threads.ok && Array.isArray(threads.data) && threads.data.length
      ? threads.data[0].total_rows ?? threads.data.length
      : 0;

  return {
    summary,
    threads: mappedThreads,
    totalThreads,
    errors: Array.from(new Set(errors)),
  };
}

function mapSummary(payload?: InboxResumenResponse): InboxSummary {
  const folders = (payload?.folders ?? []).flatMap((folder) => {
    if (!folder?.id) return [];
    return [
      {
        id: folder.id,
        label: folder.label ?? FOLDER_LABELS[folder.id] ?? folder.id,
        count: folder.count ?? 0,
      },
    ];
  });

  return {
    total: payload?.total ?? 0,
    unread: payload?.unread ?? 0,
    awaiting: payload?.awaiting ?? 0,
    folders,
  };
}
