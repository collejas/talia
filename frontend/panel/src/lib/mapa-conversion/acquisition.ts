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
  parentCampaignValue: string | null;
  parentCampaignLabel: string | null;
  total: number;
  contextTotal: number;
  conversionLabel: string;
  contextLabel: string;
  rate: number;
};

export type AcquisitionMetrics = {
  totalSessions: number;
  sessionsWithContact: number | null;
  uniqueContacts: number;
  conversionRate: number;
  sourceClassRows: AcquisitionSourceBucket[];
  referrerRows: AcquisitionHostBucket[];
  topUtmRows: AcquisitionUtmBucket[];
  correoCampaignRows: AcquisitionConversionBucket[];
  correoTemplateRows: AcquisitionConversionBucket[];
  whatsappChannelRows: AcquisitionSourceBucket[];
  campaignConversionRows: AcquisitionConversionBucket[];
  templateConversionRows: AcquisitionConversionBucket[];
  topSource: AcquisitionSourceBucket | null;
};

export type DeferredCampaignAttribution = {
  campaign_rows?: Array<Record<string, unknown>>;
  whatsapp_rows?: Array<Record<string, unknown>>;
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

const SOURCE_CLASS_VALUES = new Set([
  "direct",
  "campaign",
  "organic_search",
  "organic_social",
  "referral",
  "ai_referral",
  "unknown",
]);

function parseExternalReferrerHost(value: string | null | undefined): string {
  const trimmed = (value || "").trim().toLowerCase();
  if (!trimmed || SOURCE_CLASS_VALUES.has(trimmed)) return "";

  try {
    const parsed = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
    const host = (parsed.hostname || "").trim().toLowerCase();
    if (!host || SOURCE_CLASS_VALUES.has(host) || !host.includes(".")) return "";
    return host;
  } catch {
    return "";
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
  const referrerHost = parseExternalReferrerHost(
    typeof raw.referrer_host === "string" ? raw.referrer_host : null,
  );
  const referrer = parseExternalReferrerHost(typeof raw.referrer === "string" ? raw.referrer : null);
  const landingHost = parseExternalReferrerHost(typeof raw.landing_url === "string" ? raw.landing_url : null);
  const externalHost = referrerHost || referrer;
  return externalHost && externalHost !== landingHost ? externalHost : "";
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
  return Array.from(totals.values()).sort(
    (a, b) => b.total - a.total || a.utm_source.localeCompare(b.utm_source),
  );
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
  return Array.from(totals.values()).sort(
    (a, b) => b.total - a.total || a.source.localeCompare(b.source),
  );
}

function aggregateConversionRows(
  rows:
    | Array<{
        value: string;
        label: string;
        canal?: string | null;
        parent_campaign_value?: string | null;
        parent_campaign_label?: string | null;
        conversion_total: number;
        context_total: number;
        conversion_label: string;
        context_label: string;
        conversion_rate_pct: number;
      }>
    | undefined,
): AcquisitionConversionBucket[] {
  if (!Array.isArray(rows)) return [];

  const totals = new Map<string, AcquisitionConversionBucket>();
  for (const row of rows) {
    const normalized = {
      value: String(row?.value || "").trim(),
      label: String(row?.label || "").trim() || "Sin dato",
      canal: typeof row?.canal === "string" && row.canal.trim() ? row.canal.trim() : null,
      parentCampaignValue:
        typeof row?.parent_campaign_value === "string" && row.parent_campaign_value.trim()
          ? row.parent_campaign_value.trim()
          : null,
      parentCampaignLabel:
        typeof row?.parent_campaign_label === "string" && row.parent_campaign_label.trim()
          ? row.parent_campaign_label.trim()
          : null,
      total: toNumber(row?.conversion_total),
      contextTotal: toNumber(row?.context_total),
      conversionLabel: String(row?.conversion_label || "").trim() || "Conversiones",
      contextLabel: String(row?.context_label || "").trim() || "Base",
      rate: toNumber(row?.conversion_rate_pct),
    };
    if (normalized.total <= 0) continue;
    const key = [
      normalized.canal || "",
      normalized.value,
      normalized.parentCampaignValue || "",
    ].join("::");
    const existing = totals.get(key);
    if (existing) {
      existing.total += normalized.total;
      existing.contextTotal += normalized.contextTotal;
      existing.rate = existing.contextTotal > 0
        ? (existing.total / existing.contextTotal) * 100
        : 0;
    } else {
      totals.set(key, normalized);
    }
  }

  return Array.from(totals.values()).sort(
    (a, b) => b.total - a.total || b.rate - a.rate || a.label.localeCompare(b.label),
  );
}

export function buildDeferredCampaignAttribution(
  data: DeferredCampaignAttribution,
  filters: { campanaTipo?: string | null; templateId?: string | null } = {},
): NonNullable<DemografiaSummaryResponse["attribution_rankings"]> {
  const campaignRank = new Map<string, Record<string, unknown>>();
  const templateRank = new Map<string, Record<string, unknown>>();
  const channelFilter = normalizeText(filters.campanaTipo);
  const templateFilter = normalizeText(filters.templateId);

  for (const row of data.campaign_rows ?? []) {
    const canal = normalizeText(typeof row.canal === "string" ? row.canal : null) || "correo";
    if (channelFilter && canal !== channelFilter) continue;
    const campaignId = String(row.campana_id || "").trim();
    const campaignLabel = String(row.campana_nombre || "Sin campaña").trim() || "Sin campaña";
    const templateId = String(row.template_id || "").trim();
    if (templateFilter && templateId !== templateFilter) continue;
    const sessions = toNumber(row.sesiones_utm);
    const sent = toNumber(row.envios_enviados);
    const campaignKey = `${canal}::${campaignId || campaignLabel}`;
    const campaign = campaignRank.get(campaignKey) ?? {
      value: campaignId || campaignKey,
      label: campaignLabel,
      canal,
      conversion_total: 0,
      context_total: 0,
      conversion_label: "Sesiones UTM",
      context_label: "Enviados",
    };
    campaign.conversion_total = toNumber(campaign.conversion_total) + sessions;
    campaign.context_total = toNumber(campaign.context_total) + sent;
    campaignRank.set(campaignKey, campaign);

    const templateKey = templateId || String(row.template_slug || row.template_nombre || "").trim();
    if (!templateKey) continue;
    const template = templateRank.get(`${campaignKey}::${templateKey}`) ?? {
      value: templateKey,
      label: String(row.template_nombre || row.template_slug || templateKey).trim(),
      canal,
      parent_campaign_value: campaignId || null,
      parent_campaign_label: campaignLabel,
      conversion_total: 0,
      context_total: 0,
      conversion_label: "Sesiones UTM",
      context_label: "Enviados",
    };
    template.conversion_total = toNumber(template.conversion_total) + sessions;
    template.context_total = toNumber(template.context_total) + sent;
    templateRank.set(`${campaignKey}::${templateKey}`, template);
  }

  for (const row of data.whatsapp_rows ?? []) {
    const canal = normalizeText(typeof row.canal === "string" ? row.canal : null) || "whatsapp";
    if (channelFilter && canal !== channelFilter) continue;
    const campaignId = String(row.campana_id || "").trim();
    const campaignLabel = String(row.campana_nombre || "Sin campaña").trim() || "Sin campaña";
    const key = `whatsapp::${campaignId || campaignLabel}`;
    const campaign = campaignRank.get(key) ?? {
      value: campaignId || key,
      label: campaignLabel,
      canal,
      conversion_total: 0,
      context_total: 0,
      conversion_label: "Oportunidades",
      context_label: "Conversaciones",
    };
    campaign.conversion_total = toNumber(campaign.conversion_total) + toNumber(row.oportunidades_total);
    campaign.context_total = toNumber(campaign.context_total) + toNumber(row.conversaciones_total);
    campaignRank.set(key, campaign);
  }

  const finalize = (rows: Record<string, unknown>[]) => rows
    .filter((row) => toNumber(row.conversion_total) > 0)
    .sort((a, b) => toNumber(b.conversion_total) - toNumber(a.conversion_total))
    .map((row) => ({
      ...row,
      conversion_rate_pct: toNumber(row.context_total) > 0
        ? (toNumber(row.conversion_total) / toNumber(row.context_total)) * 100
        : 0,
    }));

  return {
    campaigns: finalize(Array.from(campaignRank.values())) as NonNullable<DemografiaSummaryResponse["attribution_rankings"]>["campaigns"],
    templates: finalize(Array.from(templateRank.values())) as NonNullable<DemografiaSummaryResponse["attribution_rankings"]>["templates"],
  };
}

function normalizeLookupKey(value: string): string {
  return value.trim().toLowerCase().replace(/[\s_-]+/g, "");
}

function buildCampaignLabelLookup(summary: DemografiaSummaryResponse | null): Map<string, string> {
  const labels = new Map<string, string>();
  const catalog = summary?.attribution_catalog;
  for (const [key, label] of Object.entries(catalog?.utm_campaign_labels ?? {})) {
    const normalizedKey = normalizeLookupKey(String(key || ""));
    const normalizedLabel = String(label || "").trim();
    if (!normalizedKey || !normalizedLabel) continue;
    labels.set(normalizedKey, normalizedLabel);
    labels.set(String(key || "").trim().toLowerCase(), normalizedLabel);
    labels.set(String(key || "").trim(), normalizedLabel);
  }
  for (const option of catalog?.campana_options ?? []) {
    const value = String(option?.value || "").trim();
    const label = String(option?.label || "").trim();
    if (!value || !label) continue;
    labels.set(normalizeLookupKey(value), label);
    labels.set(value.toLowerCase(), label);
    labels.set(value, label);
  }
  return labels;
}

function buildTemplateLabelLookup(summary: DemografiaSummaryResponse | null): Map<string, string> {
  const labels = new Map<string, string>();
  const catalog = summary?.attribution_catalog;
  for (const option of catalog?.template_options ?? []) {
    const value = String(option?.value || "").trim();
    const label = String(option?.label || "").trim();
    if (!value || !label) continue;
    labels.set(normalizeLookupKey(value), label);
    labels.set(value.toLowerCase(), label);
    labels.set(value, label);
  }
  return labels;
}

function aggregateEmailTrafficRows(
  summary: DemografiaSummaryResponse | null,
  visitsPayload: VisitsPayload | null,
): {
  correoCampaignRows: AcquisitionConversionBucket[];
  correoTemplateRows: AcquisitionConversionBucket[];
} {
  const campaignLabelLookup = buildCampaignLabelLookup(summary);
  const templateLabelLookup = buildTemplateLabelLookup(summary);
  const campaignTotals = new Map<string, AcquisitionConversionBucket>();
  const templateTotals = new Map<string, AcquisitionConversionBucket>();
  const rows = Array.isArray(visitsPayload?.table) ? visitsPayload.table : [];

  if (!rows.length) {
    const trafficRankings = summary?.traffic_rankings;
    return {
      correoCampaignRows: (trafficRankings?.campaigns ?? []).map((row) => ({
        value: String(row.value || "").trim(),
        label: String(row.label || "Sin campaña identificada").trim(),
        canal: "correo",
        parentCampaignValue: null,
        parentCampaignLabel: null,
        total: toNumber(row.total),
        contextTotal: 0,
        conversionLabel: "Sesiones web",
        contextLabel: "Base de sesiones web",
        rate: 0,
      })).filter((row) => row.total > 0),
      correoTemplateRows: (trafficRankings?.templates ?? []).map((row) => ({
        value: String(row.value || "").trim(),
        label: String(row.label || "Sin plantilla identificada").trim(),
        canal: "correo",
        parentCampaignValue: row.parent_campaign_value ?? null,
        parentCampaignLabel: row.parent_campaign_label ?? null,
        total: toNumber(row.total),
        contextTotal: 0,
        conversionLabel: "Sesiones web",
        contextLabel: "Base de sesiones web",
        rate: 0,
      })).filter((row) => row.total > 0),
    };
  }

  for (const row of rows) {
    const raw = row?.raw;
    if (!raw || typeof raw !== "object") continue;

    const utmMedium = normalizeText(typeof raw.utm_medium === "string" ? raw.utm_medium : "");
    const utmCampaign = normalizeText(typeof raw.utm_campaign === "string" ? raw.utm_campaign : "");
    const campaignId = normalizeText(typeof raw.cid === "string" ? raw.cid : "");
    const campaignKey = campaignId || utmCampaign;
    if (utmMedium === "email" && campaignKey) {
      const campaignLabel =
        campaignLabelLookup.get(normalizeLookupKey(campaignKey)) ??
        campaignLabelLookup.get(campaignKey) ??
        campaignKey.replace(/[_-]+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
      const campaign = campaignTotals.get(campaignKey) ?? {
        value: campaignKey,
        label: campaignLabel,
        canal: "correo",
        parentCampaignValue: null,
        parentCampaignLabel: null,
        total: 0,
        contextTotal: 0,
        conversionLabel: "Sesiones web",
        contextLabel: "Base",
        rate: 0,
      };
      campaign.total += 1;
      campaignTotals.set(campaignKey, campaign);
    }

    const templateId = normalizeText(typeof raw.template_id === "string" ? raw.template_id : "");
    const templateSlug = normalizeText(typeof raw.template_slug === "string" ? raw.template_slug : "");
    const templateNombre = normalizeText(typeof raw.template_nombre === "string" ? raw.template_nombre : "");
    const templateKey = templateId || templateSlug || templateNombre;
    if (utmMedium !== "email" || !templateKey) continue;

    const templateLabel =
      templateLabelLookup.get(normalizeLookupKey(templateKey)) ??
      templateLabelLookup.get(templateKey) ??
      templateKey.replace(/[_-]+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
    const parentCampaignLabel = campaignKey
      ? campaignLabelLookup.get(normalizeLookupKey(campaignKey)) ??
        campaignLabelLookup.get(campaignKey) ??
        campaignKey.replace(/[_-]+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase())
      : "Sin campaña";

    const template = templateTotals.get(templateKey) ?? {
      value: templateKey,
      label: templateLabel,
      canal: "correo",
      parentCampaignValue: campaignKey || null,
      parentCampaignLabel,
      total: 0,
      contextTotal: 0,
      conversionLabel: "Sesiones web",
      contextLabel: "Base",
      rate: 0,
    };
    template.total += 1;
    templateTotals.set(templateKey, template);
  }

  return {
    correoCampaignRows: Array.from(campaignTotals.values()).sort(
      (a, b) => b.total - a.total || a.label.localeCompare(b.label),
    ),
    correoTemplateRows: Array.from(templateTotals.values()).sort(
      (a, b) => b.total - a.total || a.label.localeCompare(b.label),
    ),
  };
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
  const rows = summary?.traffic_contact_metrics?.referrer_rows;
  if (!Array.isArray(rows)) return [];
  return rows
    .map((row) => ({
      host: parseExternalReferrerHost(typeof row?.host === "string" ? row.host : null),
      total: toNumber(row?.total),
      converted: toNumber(row?.converted),
    }))
    .filter((row) => row.host && row.total > 0)
    .sort((a, b) => b.total - a.total || a.host.localeCompare(b.host));
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
  let sessionsWithContactFromVisits = 0;

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
      if (contactKey) {
        sessionsWithContactFromVisits += 1;
        if (!seenConvertedContacts.has(contactKey)) {
          seenConvertedContacts.add(contactKey);
          sourceConvertedTotals.set(sourceClass, (sourceConvertedTotals.get(sourceClass) ?? 0) + 1);
          if (host) {
            hostConvertedTotals.set(host, (hostConvertedTotals.get(host) ?? 0) + 1);
          }
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

  const contactMetrics = summary?.traffic_contact_metrics;
  const sessionsFromVisits = visitsPayload?.cards?.totalVisits ? toNumber(visitsPayload.cards.totalVisits) : 0;
  const sessionsFromSummary =
    toNumber(summary?.visitantes?.totals?.sesiones_web_total) ||
    (contactMetrics?.sessions ?? 0) ||
    items.reduce((acc, item) => acc + toNumber(item.sesiones_web_total), 0);
  const convertedFromSummary =
    contactMetrics?.unique_people ??
    (toNumber(summary?.visitantes?.totals?.con_chat) ||
      items.reduce((acc, item) => acc + toNumber(item.con_chat), 0));

  // The summary aggregate is authoritative for the range. The visits payload is a
  // detail dataset and must never replace the complete KPI with its page size.
  const sessions = sessionsFromSummary > 0 ? sessionsFromSummary : sessionsFromVisits;
  const convertedFromContacts = Array.from(sourceConvertedTotals.values()).reduce((acc, value) => acc + value, 0);
  const hasDetailedVisits = visitsPayload !== null;
  const uniqueContacts = hasDetailedVisits ? convertedFromContacts : convertedFromSummary;
  const sessionsWithContact = hasDetailedVisits
    ? sessionsWithContactFromVisits
    : contactMetrics
      ? toNumber(contactMetrics.sessions_with_contact)
      : null;
  const contactRateBase = sessionsWithContact ?? uniqueContacts;
  const emailTrafficRows = aggregateEmailTrafficRows(summary, visitsPayload);

  const sourceClassRowsFromVisits = Array.from(sourceBuckets.values()).sort(
    (a, b) => b.total - a.total || a.source.localeCompare(b.source),
  );
  const sourceClassRows =
    sourceClassRowsFromVisits.length > 0 ? sourceClassRowsFromVisits : aggregateSourceClassesFromSummary(summary);
  // The summary is the canonical aggregate for external referrers. The deferred
  // visits table may contain source classes and must not replace this dimension.
  const referrerRows = aggregateReferrersFromSummary(summary);
  const topSource = sourceClassRows[0] ?? null;

  return {
    totalSessions: sessions,
    sessionsWithContact,
    uniqueContacts,
    conversionRate: sessions > 0 ? (contactRateBase / sessions) * 100 : 0,
    sourceClassRows,
    referrerRows,
    topUtmRows: aggregateTopUtm(summary),
    correoCampaignRows: emailTrafficRows.correoCampaignRows,
    correoTemplateRows: emailTrafficRows.correoTemplateRows,
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
