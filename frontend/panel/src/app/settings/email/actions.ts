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

export type AssistantDocumentChannelScope = "email" | "whatsapp" | "both";

export type AssistantDocument = {
  id: string;
  organizacion_id: string;
  title: string;
  description: string | null;
  channel_scope: AssistantDocumentChannelScope;
  storage_bucket: string;
  storage_path: string;
  mime: string;
  size_bytes: number | null;
  tags: string[];
  category: string | null;
  active: boolean;
  sort_order: number;
  version: number;
  uploaded_by: string | null;
  created_at: string;
  updated_at: string;
  url: string | null;
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

function normalizeAssistantDocument(record: Record<string, unknown>): AssistantDocument {
  return {
    id: String(record.id),
    organizacion_id: String(record.organizacion_id),
    title: typeof record.title === "string" ? record.title : "",
    description: typeof record.description === "string" ? record.description : null,
    channel_scope:
      record.channel_scope === "email" || record.channel_scope === "whatsapp"
        ? record.channel_scope
        : "both",
    storage_bucket: typeof record.storage_bucket === "string" ? record.storage_bucket : "",
    storage_path: typeof record.storage_path === "string" ? record.storage_path : "",
    mime: typeof record.mime === "string" ? record.mime : "application/pdf",
    size_bytes:
      typeof record.size_bytes === "number"
        ? record.size_bytes
        : typeof record.size_bytes === "string"
          ? Number(record.size_bytes)
          : null,
    tags: Array.isArray(record.tags)
      ? record.tags.filter((item): item is string => typeof item === "string")
      : [],
    category: typeof record.category === "string" ? record.category : null,
    active: typeof record.active === "boolean" ? record.active : true,
    sort_order: typeof record.sort_order === "number" ? record.sort_order : 100,
    version: typeof record.version === "number" ? record.version : 1,
    uploaded_by: typeof record.uploaded_by === "string" ? record.uploaded_by : null,
    created_at: typeof record.created_at === "string" ? record.created_at : "",
    updated_at: typeof record.updated_at === "string" ? record.updated_at : "",
    url: typeof record.url === "string" ? record.url : null,
  };
}

export async function fetchAssistantDocuments(): Promise<AssistantDocument[]> {
  const response = await callCrmApi<Record<string, unknown>[]>("/crm/settings/assistant-documents");
  if (!response.ok || !Array.isArray(response.data)) {
    console.warn(
      "[settings] fetch assistant documents failed:",
      response.ok ? "respuesta inválida" : response.error,
    );
    return [];
  }
  return response.data
    .filter((entry): entry is Record<string, unknown> => !!entry && typeof entry === "object")
    .map((entry) => normalizeAssistantDocument(entry));
}

export async function uploadAssistantDocument(formData: FormData): Promise<AssistantDocument> {
  const response = await callCrmApi<Record<string, unknown>>(
    "/crm/settings/assistant-documents/upload",
    {
      method: "POST",
      body: formData,
    },
  );
  if (!response.ok || !response.data) {
    throw new Error(response.error || "No se pudo subir el PDF.");
  }
  revalidatePath("/settings/email");
  return normalizeAssistantDocument(response.data);
}

export async function updateAssistantDocument(
  documentId: string,
  input: Partial<{
    title: string;
    description: string;
    channel_scope: AssistantDocumentChannelScope;
    category: string;
    tags: string[];
    active: boolean;
    sort_order: number;
    version: number;
  }>,
): Promise<AssistantDocument> {
  const payload: Record<string, unknown> = {};
  if (typeof input.title === "string") payload.title = input.title.trim();
  if (typeof input.description === "string") payload.description = input.description.trim();
  if (typeof input.channel_scope === "string") payload.channel_scope = input.channel_scope;
  if (typeof input.category === "string") payload.category = input.category.trim();
  if (Array.isArray(input.tags)) payload.tags = input.tags.map((tag) => tag.trim()).filter(Boolean);
  if (typeof input.active === "boolean") payload.active = input.active;
  if (typeof input.sort_order === "number") payload.sort_order = input.sort_order;
  if (typeof input.version === "number") payload.version = input.version;

  const response = await callCrmApi<Record<string, unknown>>(
    `/crm/settings/assistant-documents/${documentId}`,
    {
      method: "PATCH",
      body: payload,
    },
  );
  if (!response.ok || !response.data) {
    throw new Error(response.error || "No se pudo actualizar el PDF.");
  }
  revalidatePath("/settings/email");
  return normalizeAssistantDocument(response.data);
}

export async function deleteAssistantDocument(documentId: string): Promise<void> {
  const response = await callCrmApi<never>(`/crm/settings/assistant-documents/${documentId}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    throw new Error(response.error || "No se pudo eliminar el PDF.");
  }
  revalidatePath("/settings/email");
}
