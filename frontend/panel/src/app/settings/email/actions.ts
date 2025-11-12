"use server";

import { revalidatePath } from "next/cache";

import { callSupabaseRest } from "@/lib/leads/supabase";

const TABLE_PATH = "panel_email_templates";
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
  updated_at?: string | null;
};

export type EmailTemplateSettingsInput = {
  intro: string;
  highlights: string[];
  resources: EmailTemplateResource[];
  closing: string;
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
};

function cloneDefaultSettings(): EmailTemplateSettings {
  return {
    intro: DEFAULT_SETTINGS.intro,
    highlights: [...DEFAULT_SETTINGS.highlights],
    resources: DEFAULT_SETTINGS.resources.map((resource) => ({ ...resource })),
    closing: DEFAULT_SETTINGS.closing,
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
    updated_at:
      typeof record.updated_at === "string" && record.updated_at.length
        ? record.updated_at
        : undefined,
  };
}

export async function fetchEmailTemplateSettings(): Promise<EmailTemplateSettings> {
  const response = await callSupabaseRest<unknown[]>(TABLE_PATH, {
    query: {
      slug: `eq.${DEFAULT_SLUG}`,
      limit: 1,
      select: "slug,intro,highlights,resources,closing,updated_at",
    },
  });

  if (!response.ok) {
    console.warn("[settings] fetch email template failed:", response.error);
    return cloneDefaultSettings();
  }

  const rows = Array.isArray(response.data) ? response.data : [];
  const record = (rows[0] as Record<string, unknown> | undefined) ?? null;
  return normalizeSettings(record);
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
  };

  const response = await callSupabaseRest<unknown[]>(TABLE_PATH, {
    method: "POST",
    headers: {
      Prefer: "return=representation,resolution=merge-duplicates",
    },
    body: payload,
  });

  if (!response.ok) {
    throw new Error(response.error);
  }

  const rows = Array.isArray(response.data) ? response.data : [];
  const record = (rows[0] as Record<string, unknown> | undefined) ?? payload;

  revalidatePath("/settings/email");

  return normalizeSettings(record);
}
