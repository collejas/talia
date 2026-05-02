import type { DemografiaSummaryResponse } from "@/lib/mapa-conversion/api";
import { normalizeAcquisitionSourceClass } from "@/lib/mapa-conversion/source-class";

export type AcquisitionSourceBucket = {
  source: string;
  total: number;
  converted: number;
};

export type AcquisitionHostBucket = {
  host: string;
  total: number;
  converted: number;
};

export type AcquisitionUtmBucket = {
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  total: number;
};

export type AcquisitionMetrics = {
  totalSessions: number;
  convertedSessions: number;
  conversionRate: number;
  sourceClassRows: AcquisitionSourceBucket[];
  referrerRows: AcquisitionHostBucket[];
  topUtmRows: AcquisitionUtmBucket[];
  whatsappChannelRows: AcquisitionSourceBucket[];
  topSource: AcquisitionSourceBucket | null;
};

function toNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function normalizeText(value: string | null | undefined): string {
  return (value || "").trim().toLowerCase();
}

function parseHost(value: string | null | undefined): string {
  const trimmed = (value || "").trim();
  if (!trimmed) return "";
  try {
    const parsed = new URL(trimmed);
    return (parsed.hostname || "").trim().toLowerCase();
  } catch {
    return trimmed.toLowerCase();
  }
}

function formatUtmPart(value: unknown): string {
  const text = typeof value === "string" ? value.trim() : "";
  return text.length ? text : "(none)";
}

function aggregateTopUtm(summary: DemografiaSummaryResponse | null): AcquisitionUtmBucket[] {
  const totals = new Map<string, AcquisitionUtmBucket>();
  const items = Array.isArray(summary?.visitantes?.items) ? summary?.visitantes?.items ?? [] : [];
  for (const item of items) {
    for (const utm of item.utm_top ?? []) {
      const source = formatUtmPart(utm?.utm_source);
      const medium = formatUtmPart(utm?.utm_medium);
      const campaign = formatUtmPart(utm?.utm_campaign);
      const key = `${source}::${medium}::${campaign}`;
      const existing = totals.get(key) ?? {
        utm_source: source,
        utm_medium: medium,
        utm_campaign: campaign,
        total: 0,
      };
      existing.total += toNumber(utm?.total);
      totals.set(key, existing);
    }
  }
  return Array.from(totals.values())
    .sort((a, b) => b.total - a.total || a.utm_source.localeCompare(b.utm_source))
    .slice(0, 5);
}

function aggregateWhatsappChannels(summary: DemografiaSummaryResponse | null): AcquisitionSourceBucket[] {
  const totals = new Map<string, AcquisitionSourceBucket>();
  const items = Array.isArray(summary?.visitantes?.items) ? summary?.visitantes?.items ?? [] : [];
  for (const item of items) {
    for (const row of item.wa_atribucion_top ?? []) {
      const channel = String(row?.canal_publicitario || "").trim();
      if (!channel) continue;
      const existing = totals.get(channel) ?? {
        source: channel,
        total: 0,
        converted: 0,
      };
      existing.total += toNumber(row?.total);
      totals.set(channel, existing);
    }
  }
  return Array.from(totals.values())
    .sort((a, b) => b.total - a.total || a.source.localeCompare(b.source))
    .slice(0, 6);
}

export function buildAcquisitionMetrics(
  summary: DemografiaSummaryResponse | null,
): AcquisitionMetrics {
  const sourceBuckets = new Map<string, AcquisitionSourceBucket>();
  const hostBuckets = new Map<string, AcquisitionHostBucket>();

  const items = Array.isArray(summary?.visitantes?.items) ? summary?.visitantes?.items ?? [] : [];
  const sessions =
    toNumber(summary?.visitantes?.totals?.sesiones_web_total) ||
    items.reduce((acc, item) => acc + toNumber(item.sesiones_web_total), 0);
  const converted =
    toNumber(summary?.visitantes?.totals?.con_chat) ||
    items.reduce((acc, item) => acc + toNumber(item.con_chat), 0);

  for (const item of items) {
    for (const sourceRow of item.fuentes_top ?? []) {
      const source = String(sourceRow?.source || "").trim();
      if (!source) continue;
      const sourceClass = normalizeAcquisitionSourceClass({
        sourceClass: source,
        referrerHost: source,
        referrer: source,
      });
      const sourceBucket = sourceBuckets.get(sourceClass) ?? {
        source: sourceClass,
        total: 0,
        converted: 0,
      };
      sourceBucket.total += toNumber(sourceRow?.total);
      sourceBuckets.set(sourceClass, sourceBucket);

      const host = parseHost(source);
      if (!host) continue;
      const hostBucket = hostBuckets.get(host) ?? {
        host,
        total: 0,
        converted: 0,
      };
      hostBucket.total += toNumber(sourceRow?.total);
      hostBuckets.set(host, hostBucket);
    }
  }

  const sourceClassRows = Array.from(sourceBuckets.values()).sort(
    (a, b) => b.total - a.total || a.source.localeCompare(b.source),
  );
  const referrerRows = Array.from(hostBuckets.values())
    .sort((a, b) => b.total - a.total || a.host.localeCompare(b.host))
    .slice(0, 5);
  const topSource = sourceClassRows[0] ?? null;

  return {
    totalSessions: sessions,
    convertedSessions: converted,
    conversionRate: sessions > 0 ? (converted / sessions) * 100 : 0,
    sourceClassRows,
    referrerRows,
    topUtmRows: aggregateTopUtm(summary),
    whatsappChannelRows: aggregateWhatsappChannels(summary),
    topSource,
  };
}

export function formatAcquisitionSourceLabel(value: string | null | undefined): string {
  const normalized = normalizeText(value);
  if (!normalized) return "Sin datos";
  return normalized;
}
