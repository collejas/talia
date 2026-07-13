import type { DemografiaSummaryResponse } from "@/lib/mapa-conversion/api";
import type { VisitTableRow, VisitsPayload } from "@/lib/visitas/data";
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

export type AcquisitionConversionBucket = {
  value: string;
  label: string;
  canal: string | null;
  total: number;
  sent: number;
  rate: number;
};

export type AcquisitionMetrics = {
  totalSessions: number;
  convertedSessions: number;
  conversionRate: number;
  sourceClassRows: AcquisitionSourceBucket[];
  referrerRows: AcquisitionHostBucket[];
  topUtmRows: AcquisitionUtmBucket[];
  whatsappChannelRows: AcquisitionSourceBucket[];
  campaignConversionRows: AcquisitionConversionBucket[];
  templateConversionRows: AcquisitionConversionBucket[];
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

function getSourceClassFromVisit(row: VisitTableRow): string {
  const raw = row.raw;
  if (!raw || typeof raw !== "object") return "desconocido";
  return normalizeAcquisitionSourceClass({
    sourceClass: typeof raw.source_class === "string" ? raw.source_class : null,
    referrerHost: typeof raw.referrer_host === "string" ? raw.referrer_host : null,
    referrer: typeof raw.referrer === "string" ? raw.referrer : null,
    landingUrl: typeof raw.landing_url === "string" ? raw.landing_url : null,
    utmSource: typeof raw.utm_source === "string" ? raw.utm_source : null,
    utmMedium: typeof raw.utm_medium === "string" ? raw.utm_medium : null,
    utmCampaign: typeof raw.utm_campaign === "string" ? raw.utm_campaign : null,
  });
}

function getReferrerHostFromVisit(row: VisitTableRow): string {
  const raw = row.raw;
  if (!raw || typeof raw !== "object") return "";
  const referrerHost = parseHost(typeof raw.referrer_host === "string" ? raw.referrer_host : null);
  if (referrerHost) return referrerHost;
  return parseHost(typeof raw.referrer === "string" ? raw.referrer : null);
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

function aggregateConversionRows(
  rows:
    | Array<{
        value: string;
        label: string;
        canal?: string | null;
        sesiones_utm: number;
        envios_enviados: number;
        conversion_rate_pct: number;
      }>
    | undefined,
): AcquisitionConversionBucket[] {
  return Array.isArray(rows)
    ? rows
        .map((row) => ({
          value: String(row?.value || "").trim(),
          label: String(row?.label || "").trim() || "Sin dato",
          canal: typeof row?.canal === "string" && row.canal.trim() ? row.canal.trim() : null,
          total: toNumber(row?.sesiones_utm),
          sent: toNumber(row?.envios_enviados),
          rate: toNumber(row?.conversion_rate_pct),
        }))
        .filter((row) => row.total > 0)
        .sort((a, b) => b.total - a.total || b.rate - a.rate || a.label.localeCompare(b.label))
        .slice(0, 6)
    : [];
}

function aggregateSourceClassesFromSummary(
  summary: DemografiaSummaryResponse | null,
): AcquisitionSourceBucket[] {
  const totals = new Map<string, AcquisitionSourceBucket>();
  const items = Array.isArray(summary?.visitantes?.items) ? summary?.visitantes?.items ?? [] : [];
  for (const item of items) {
    for (const sourceRow of item.fuentes_top ?? []) {
      const source = String(sourceRow?.source || "").trim();
      if (!source) continue;
      const normalized = normalizeAcquisitionSourceClass({
        sourceClass: source,
        referrerHost: source,
        referrer: source,
      });
      const existing = totals.get(normalized) ?? {
        source: normalized,
        total: 0,
        converted: 0,
      };
      existing.total += toNumber(sourceRow?.total);
      totals.set(normalized, existing);
    }
  }
  return Array.from(totals.values()).sort((a, b) => b.total - a.total || a.source.localeCompare(b.source));
}

function aggregateReferrersFromSummary(summary: DemografiaSummaryResponse | null): AcquisitionHostBucket[] {
  const totals = new Map<string, AcquisitionHostBucket>();
  const items = Array.isArray(summary?.visitantes?.items) ? summary?.visitantes?.items ?? [] : [];
  for (const item of items) {
    for (const sourceRow of item.fuentes_top ?? []) {
      const host = String(sourceRow?.source || "").trim().toLowerCase();
      if (!host) continue;
      const existing = totals.get(host) ?? {
        host,
        total: 0,
        converted: 0,
      };
      existing.total += toNumber(sourceRow?.total);
      totals.set(host, existing);
    }
  }
  return Array.from(totals.values())
    .sort((a, b) => b.total - a.total || a.host.localeCompare(b.host))
    .slice(0, 5);
}

export function buildAcquisitionMetrics(
  summary: DemografiaSummaryResponse | null,
  visitsPayload: VisitsPayload | null = null,
): AcquisitionMetrics {
  const sourceBuckets = new Map<string, AcquisitionSourceBucket>();
  const hostBuckets = new Map<string, AcquisitionHostBucket>();

  const items = Array.isArray(summary?.visitantes?.items) ? summary?.visitantes?.items ?? [] : [];
  const sourceSessionTotals = new Map<string, number>();
  const sourceConvertedTotals = new Map<string, number>();
  const hostSessionTotals = new Map<string, number>();
  const hostConvertedTotals = new Map<string, number>();
  const seenConvertedContacts = new Set<string>();

  if (visitsPayload?.table?.length) {
    for (const row of visitsPayload.table) {
      const raw = row.raw;
      if (!raw || typeof raw !== "object") continue;
      const contactKey = [
        typeof raw.contacto_id === "string" ? raw.contacto_id.trim().toLowerCase() : "",
        typeof raw.persona_id === "string" ? raw.persona_id.trim().toLowerCase() : "",
        typeof raw.contacto_correo === "string" ? raw.contacto_correo.trim().toLowerCase() : "",
        typeof raw.contacto_telefono === "string" ? raw.contacto_telefono.trim().toLowerCase() : "",
      ].find((value) => Boolean(value)) || "";
      const sourceClass = getSourceClassFromVisit(row);
      const host = getReferrerHostFromVisit(row);

      sourceSessionTotals.set(sourceClass, (sourceSessionTotals.get(sourceClass) ?? 0) + 1);
      if (host) {
        hostSessionTotals.set(host, (hostSessionTotals.get(host) ?? 0) + 1);
      }
      if (contactKey && !seenConvertedContacts.has(contactKey)) {
        seenConvertedContacts.add(contactKey);
        sourceConvertedTotals.set(sourceClass, (sourceConvertedTotals.get(sourceClass) ?? 0) + 1);
        if (host) {
          hostConvertedTotals.set(host, (hostConvertedTotals.get(host) ?? 0) + 1);
        }
      }
    }
  } else {
    for (const item of items) {
      for (const sourceRow of item.fuentes_top ?? []) {
        const source = String(sourceRow?.source || "").trim();
        if (!source) continue;
        const sourceClass = normalizeAcquisitionSourceClass({
          sourceClass: source,
          referrerHost: source,
          referrer: source,
        });
        sourceSessionTotals.set(sourceClass, (sourceSessionTotals.get(sourceClass) ?? 0) + toNumber(sourceRow?.total));

        const host = parseHost(source);
        if (!host) continue;
        hostSessionTotals.set(host, (hostSessionTotals.get(host) ?? 0) + toNumber(sourceRow?.total));
      }
    }
  }

  for (const [source, total] of sourceSessionTotals.entries()) {
    sourceBuckets.set(source, {
      source,
      total,
      converted: sourceConvertedTotals.get(source) ?? 0,
    });
  }
  for (const [host, total] of hostSessionTotals.entries()) {
    hostBuckets.set(host, {
      host,
      total,
      converted: hostConvertedTotals.get(host) ?? 0,
    });
  }

  const sessionsFromVisits = visitsPayload?.cards?.totalVisits ? toNumber(visitsPayload.cards.totalVisits) : 0;
  const sessionsFromSummary =
    toNumber(summary?.visitantes?.totals?.sesiones_web_total) ||
    items.reduce((acc, item) => acc + toNumber(item.sesiones_web_total), 0);
  const convertedFromSummary =
    toNumber(summary?.visitantes?.totals?.con_chat) ||
    items.reduce((acc, item) => acc + toNumber(item.con_chat), 0);

  const sessions = sessionsFromVisits > 0 ? sessionsFromVisits : sessionsFromSummary;
  const convertedFromContacts = Array.from(sourceConvertedTotals.values()).reduce((acc, value) => acc + value, 0);
  const converted = convertedFromContacts > 0 ? convertedFromContacts : convertedFromSummary;

  const sourceClassRowsFromVisits = Array.from(sourceBuckets.values()).sort(
    (a, b) => b.total - a.total || a.source.localeCompare(b.source),
  );
  const sourceClassRows =
    sourceClassRowsFromVisits.length > 0 ? sourceClassRowsFromVisits : aggregateSourceClassesFromSummary(summary);
  const referrerRowsFromVisits = Array.from(hostBuckets.values())
    .sort((a, b) => b.total - a.total || a.host.localeCompare(b.host))
    .slice(0, 5);
  const referrerRows =
    referrerRowsFromVisits.length > 0 ? referrerRowsFromVisits : aggregateReferrersFromSummary(summary);
  const topSource = sourceClassRows[0] ?? null;

  return {
    totalSessions: sessions,
    convertedSessions: converted,
    conversionRate: sessions > 0 ? (converted / sessions) * 100 : 0,
    sourceClassRows,
    referrerRows,
    topUtmRows: aggregateTopUtm(summary),
    whatsappChannelRows: aggregateWhatsappChannels(summary),
    campaignConversionRows: aggregateConversionRows(summary?.attribution_rankings?.campaigns),
    templateConversionRows: aggregateConversionRows(summary?.attribution_rankings?.templates),
    topSource,
  };
}

export function formatAcquisitionSourceLabel(value: string | null | undefined): string {
  const normalized = normalizeText(value);
  if (!normalized) return "Sin datos";
  return normalized;
}
