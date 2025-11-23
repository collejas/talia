"use server";

import { revalidatePath } from "next/cache";

import { callCrmApi } from "@/lib/api/crm";

const DEFAULT_SLUG = "default";

export type EmailTemplateResource = {
  label: string;
  url: string;
};

export type EmailTemplateSettings = {
  intro: string;
  highlights: string[];
  resources: EmailTemplateResource[];
  closing: string;
  useSummary: boolean;
  useHighlights: boolean;
  useResources: boolean;
  signatureSalutation: string;
  signature: string;
  updated_at?: string | null;
};

export type EmailTemplateSettingsInput = {
  intro: string;
  highlights: string[];
  resources: EmailTemplateResource[];
  closing: string;
  useSummary: boolean;
  useHighlights: boolean;
  useResources: boolean;
  signatureSalutation: string;
  signature: string;
};

const DEFAULT_SETTINGS: EmailTemplateSettings = {
  intro: "Gracias por tu interés en Tal-IA. Te comparto un resumen con la información que platicamos:",
  highlights: [
    "Automatiza la atención 24/7 en webchat, WhatsApp y voz con un solo asistente.",
    "Califica prospectos y agenda demos o recordatorios sin cargar al equipo comercial.",
    "Centraliza conversaciones, métricas y tareas en el panel de Tal-IA para dar seguimiento inteligente.",
  ],
  resources: [
    { label: "Sitio de Tal-IA", url: "https://talia.mx/" },
    { label: "Geoactiv · Casos y soluciones", url: "https://geoactiv.ai/" },
  ],
  closing:
    "Cuando quieras, puedo ayudarte a agendar una demo personalizada o resolver cualquier duda por este medio.",
  useSummary: true,
  useHighlights: true,
  useResources: true,
  signatureSalutation: "Saludos,",
  signature: "Equipo Geoactiv · Tal-IA",
};

function cloneDefaultSettings(): EmailTemplateSettings {
  return {
    intro: DEFAULT_SETTINGS.intro,
    highlights: [...DEFAULT_SETTINGS.highlights],
    resources: DEFAULT_SETTINGS.resources.map((resource) => ({ ...resource })),
    closing: DEFAULT_SETTINGS.closing,
    useSummary: DEFAULT_SETTINGS.useSummary,
    useHighlights: DEFAULT_SETTINGS.useHighlights,
    useResources: DEFAULT_SETTINGS.useResources,
    signatureSalutation: DEFAULT_SETTINGS.signatureSalutation,
    signature: DEFAULT_SETTINGS.signature,
    updated_at: undefined,
  };
}

function normalizeArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter((entry) => entry.length > 0);
}

function normalizeResources(value: unknown): EmailTemplateResource[] {
  if (!Array.isArray(value)) return [];
  const results: EmailTemplateResource[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    const label = typeof record.label === "string" ? record.label.trim() : "";
    const url = typeof record.url === "string" ? record.url.trim() : "";
    if (!label || !url) continue;
    results.push({ label, url });
  }
  return results;
}

function normalizeSettings(record: Record<string, unknown> | null | undefined): EmailTemplateSettings {
  const base = cloneDefaultSettings();
  if (!record) {
    return base;
  }

  const intro =
    typeof record.intro === "string" && record.intro.trim().length
      ? record.intro.trim()
      : base.intro;
  const closing =
    typeof record.closing === "string" && record.closing.trim().length
      ? record.closing.trim()
      : base.closing;

  const highlights = normalizeArray(record.highlights);
  const resources = normalizeResources(record.resources);

  return {
    intro,
    highlights: highlights.length ? highlights : base.highlights,
    resources: resources.length ? resources : base.resources,
    closing,
    useSummary:
      typeof record.use_summary === "boolean" ? record.use_summary : base.useSummary,
    useHighlights:
      typeof record.use_highlights === "boolean"
        ? record.use_highlights
        : base.useHighlights,
    useResources:
      typeof record.use_resources === "boolean"
        ? record.use_resources
        : base.useResources,
    signatureSalutation:
      typeof record.signature_salutation === "string" && record.signature_salutation.trim().length
        ? record.signature_salutation.trim()
        : base.signatureSalutation,
    signature:
      typeof record.signature === "string" && record.signature.trim().length
        ? record.signature.trim()
        : base.signature,
    updated_at:
      typeof record.updated_at === "string" && record.updated_at.length
        ? record.updated_at
        : undefined,
  };
}

export async function fetchEmailTemplateSettings(): Promise<EmailTemplateSettings> {
  const response = await callCrmApi<Record<string, unknown>>("/crm/settings/email-template");

  if (!response.ok) {
    console.warn("[settings] fetch email template failed:", response.error);
    return cloneDefaultSettings();
  }

  if (!response.data) {
    console.warn("[settings] fetch email template failed: respuesta vacía");
    return cloneDefaultSettings();
  }

  return normalizeSettings(response.data);
}

export async function saveEmailTemplateSettings(
  input: EmailTemplateSettingsInput,
): Promise<EmailTemplateSettings> {
  const payload = {
    slug: DEFAULT_SLUG,
    intro: input.intro.trim(),
    highlights: input.highlights.map((item) => item.trim()).filter((item) => item.length > 0),
    resources: input.resources
      .map((resource) => ({
        label: resource.label.trim(),
        url: resource.url.trim(),
      }))
      .filter((resource) => resource.label.length > 0 && resource.url.length > 0),
    closing: input.closing.trim(),
    use_summary: Boolean(input.useSummary),
    use_highlights: Boolean(input.useHighlights),
    use_resources: Boolean(input.useResources),
    signature_salutation:
      input.signatureSalutation.trim().length > 0
        ? input.signatureSalutation.trim()
        : DEFAULT_SETTINGS.signatureSalutation,
    signature:
      input.signature.trim().length > 0 ? input.signature.trim() : DEFAULT_SETTINGS.signature,
  };

  const response = await callCrmApi<Record<string, unknown>>("/crm/settings/email-template", {
    method: "PUT",
    body: payload,
  });

  if (!response.ok) {
    throw new Error(response.error || "No se pudo guardar la plantilla.");
  }
  if (!response.data) {
    throw new Error("No se pudo guardar la plantilla.");
  }

  revalidatePath("/settings/email");

  return normalizeSettings(response.data);
}
