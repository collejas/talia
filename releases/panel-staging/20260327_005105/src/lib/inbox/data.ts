"use server";

import { callCrmApi } from "@/lib/api/crm";
import { mapThreads } from "@/lib/inbox/threads";
import type {
  InboxSummary,
  InboxPayload,
  InboxThread,
  InboxThreadRow,
} from "@/lib/inbox/types";

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
export type InboxThreadsFilters = {
  estado?: string | null;
  source?: string | null;
  channel?: string | null;
  date?: string | null;
  batchId?: string | null;
  campanaId?: string | null;
};

const FOLDER_LABELS: Record<string, string> = {
  inbox: "Bandeja de entrada",
  assigned: "Asignados a mí",
  pending: "Seguimiento",
  closed: "Cerrados",
};

type CrmTagRow = {
  nombre?: string | null;
};

type InboxFilterOptionsResponse = {
  batches?: Array<{ value?: string; label?: string | null }>;
  campanas?: Array<{ value?: string; label?: string | null }>;
};

type InboxBootstrapResponse = {
  summary?: InboxResumenResponse | null;
  threads?: {
    items?: InboxThreadRow[];
  } | null;
  filter_options?: InboxFilterOptionsResponse | null;
};

const REENGAGE_TAG_KEYWORDS = [
  "reeng",
  "reenganch",
  "reinici",
  "reinicio",
  "reinicios",
  "restart",
  "reintento",
  "reintentos",
  "followup",
];

function normalizeForMatching(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/gi, "")
    .toLowerCase();
}

function matchesReengageTag(value: string | null | undefined): boolean {
  const normalized = normalizeForMatching(value);
  if (!normalized.length) {
    return false;
  }
  return REENGAGE_TAG_KEYWORDS.some((keyword) => normalized.includes(keyword));
}

function gatherReengageTagsFromNames(
  names: Iterable<string | null | undefined>,
): string[] {
  const seen = new Set<string>();
  for (const raw of names) {
    const trimmed = raw?.trim();
    if (!trimmed) {
      continue;
    }
    if (matchesReengageTag(trimmed)) {
      seen.add(trimmed);
    }
  }
  return Array.from(seen);
}

function gatherReengageTagsFromThreads(threads: InboxThread[]): string[] {
  const seen = new Set<string>();
  for (const thread of threads) {
    for (const tag of gatherReengageTagsFromNames(thread.tags)) {
      seen.add(tag);
    }
  }
  return Array.from(seen);
}

export async function loadInboxData(filters?: InboxThreadsFilters): Promise<InboxPayload> {
  const normalizedFilters: Record<string, string> = {
    limit: "100",
    message_limit: "20",
  };
  const normalizedEstado = filters?.estado?.trim();
  const normalizedSource = filters?.source?.trim();
  const normalizedChannel = filters?.channel?.trim();
  const normalizedDate = filters?.date?.trim();
  const normalizedBatchId = filters?.batchId?.trim();
  const normalizedCampanaId = filters?.campanaId?.trim();
  if (normalizedEstado) normalizedFilters.estado = normalizedEstado;
  if (normalizedSource) normalizedFilters.source = normalizedSource;
  if (normalizedChannel) normalizedFilters.channel = normalizedChannel;
  if (normalizedDate) normalizedFilters.date = normalizedDate;
  if (normalizedBatchId) normalizedFilters.batch_id = normalizedBatchId;
  if (normalizedCampanaId) normalizedFilters.campana_id = normalizedCampanaId;

  const [bootstrap, tags] = await Promise.all([
    callCrmApi<InboxBootstrapResponse>("/crm/inbox/bootstrap", {
      withUserToken: true,
      searchParams: normalizedFilters,
    }),
    callCrmApi<CrmTagRow[]>("/crm/tags", { withUserToken: true }),
  ]);

  const errors: string[] = [];
  if (!bootstrap.ok) errors.push(bootstrap.error);
  if (!tags.ok) errors.push(tags.error);

  const summary = mapSummary(bootstrap.ok ? bootstrap.data?.summary ?? undefined : undefined);
  const threadRows =
    bootstrap.ok && Array.isArray(bootstrap.data?.threads?.items)
      ? bootstrap.data?.threads?.items
      : [];
  const mappedThreads = mapThreads(threadRows);
  const totalThreads =
    threadRows.length
      ? threadRows[0].total_rows ?? threadRows.length
      : 0;

  const reengageTagsFromApi = tags.ok
    ? gatherReengageTagsFromNames(tags.data.map((entry) => entry.nombre))
    : [];
  const reengageTagsFromThreads = gatherReengageTagsFromThreads(mappedThreads);
  const reengageTags = Array.from(
    new Set([...reengageTagsFromApi, ...reengageTagsFromThreads]),
  ).sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }));

  const batchOptions = mapContextOptions(
    bootstrap.ok ? bootstrap.data?.filter_options?.batches ?? undefined : undefined,
  );
  const campanaOptions = mapContextOptions(
    bootstrap.ok ? bootstrap.data?.filter_options?.campanas ?? undefined : undefined,
  );

  return {
    summary,
    threads: mappedThreads,
    totalThreads,
    reengageTags,
    batchOptions,
    campanaOptions,
    errors: Array.from(new Set(errors)),
  };
}

function mapContextOptions(
  items: Array<{ value?: string; label?: string | null }> | undefined,
): Array<{ value: string; label: string }> {
  if (!Array.isArray(items)) return [];
  const seen = new Set<string>();
  const mapped: Array<{ value: string; label: string }> = [];
  for (const item of items) {
    const value = item?.value?.trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    mapped.push({ value, label: item?.label?.trim() || value });
  }
  return mapped;
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
