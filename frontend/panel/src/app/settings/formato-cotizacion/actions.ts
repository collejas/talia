"use server";

import { revalidatePath } from "next/cache";

import { callCrmApi } from "@/lib/api/crm";
import {
  DEFAULT_TEMPLATE_CONFIG,
  QUOTE_TEMPLATE_DEFAULTS,
  buildQuoteTemplateAssets,
  cloneQuoteTemplateDefaults,
  type QuoteTemplateConfig,
  type QuoteTemplateSettings,
  type QuoteTemplateSettingsInput,
} from "./template-schema"

const DEFAULT_SLUG = "default"

function normalizeHighlights(value: unknown): string[] {
  if (!Array.isArray(value)) return [...DEFAULT_TEMPLATE_CONFIG.highlights]
  const normalized = value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter((entry) => entry.length > 0)
  return normalized.length ? normalized : [...DEFAULT_TEMPLATE_CONFIG.highlights]
}

function normalizeConfig(source: unknown): QuoteTemplateConfig {
  let raw = source
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw)
    } catch {
      raw = null
    }
  }

  if (!raw || typeof raw !== "object") {
    return { ...DEFAULT_TEMPLATE_CONFIG, highlights: [...DEFAULT_TEMPLATE_CONFIG.highlights] }
  }

  const record = raw as Record<string, unknown>

  const pickString = (key: string, fallback: string) => {
    const value = record[key]
    return typeof value === "string" && value.trim().length ? value.trim() : fallback
  }

  return {
    logoUrl: pickString("logoUrl", DEFAULT_TEMPLATE_CONFIG.logoUrl),
    primaryColor: pickString("primaryColor", DEFAULT_TEMPLATE_CONFIG.primaryColor),
    accentColor: pickString("accentColor", DEFAULT_TEMPLATE_CONFIG.accentColor),
    headerTitle: pickString("headerTitle", DEFAULT_TEMPLATE_CONFIG.headerTitle),
    headerSubtitle: pickString("headerSubtitle", DEFAULT_TEMPLATE_CONFIG.headerSubtitle),
    introText: pickString("introText", DEFAULT_TEMPLATE_CONFIG.introText),
    highlights: normalizeHighlights(record.highlights),
    notesTitle: pickString("notesTitle", DEFAULT_TEMPLATE_CONFIG.notesTitle),
    notesBody: pickString("notesBody", DEFAULT_TEMPLATE_CONFIG.notesBody),
    termsTitle: pickString("termsTitle", DEFAULT_TEMPLATE_CONFIG.termsTitle),
    termsBody: pickString("termsBody", DEFAULT_TEMPLATE_CONFIG.termsBody),
    signatureName: pickString("signatureName", DEFAULT_TEMPLATE_CONFIG.signatureName),
    signatureRole: pickString("signatureRole", DEFAULT_TEMPLATE_CONFIG.signatureRole),
    footerNote: pickString("footerNote", DEFAULT_TEMPLATE_CONFIG.footerNote),
  }
}

function normalizeSettings(record: Record<string, unknown> | null | undefined): QuoteTemplateSettings {
  const fallback = cloneQuoteTemplateDefaults()
  if (!record) return fallback

  const slug = typeof record.slug === "string" && record.slug.length ? record.slug : fallback.slug
  const name =
    typeof record.nombre === "string" && record.nombre.trim().length
      ? record.nombre.trim()
      : fallback.name
  const description =
    typeof record.descripcion === "string" && record.descripcion.trim().length
      ? record.descripcion.trim()
      : fallback.description
  const config = normalizeConfig(record.config)
  const assets =
    typeof record.html === "string" && typeof record.css === "string"
      ? { html: record.html, css: record.css }
      : buildQuoteTemplateAssets(config)
  const variables =
    Array.isArray(record.variables) && record.variables.length
      ? (record.variables as string[])
      : [...QUOTE_TEMPLATE_DEFAULTS.variables]
  const versionValue = typeof record.version === "number" ? record.version : fallback.version
  const isActiveValue = typeof record.is_active === "boolean" ? record.is_active : fallback.isActive

  return {
    slug,
    name,
    description,
    config,
    html: assets.html,
    css: assets.css,
    variables: variables.length ? variables : [...fallback.variables],
    version: versionValue > 0 ? versionValue : fallback.version,
    isActive: isActiveValue,
    updatedAt:
      typeof record.updated_at === "string" && record.updated_at.length ? record.updated_at : undefined,
  }
}

export async function fetchQuoteTemplateSettings(): Promise<QuoteTemplateSettings> {
  const response = await callCrmApi<Record<string, unknown>>("/crm/settings/quote-template")

  if (!response.ok) {
    console.warn("[settings] fetch quote template failed:", response.error)
    return cloneQuoteTemplateDefaults()
  }
  if (!response.data) {
    console.warn("[settings] fetch quote template failed: respuesta vacía")
    return cloneQuoteTemplateDefaults()
  }

  return normalizeSettings(response.data)
}

function sanitizeConfig(input: QuoteTemplateConfig): QuoteTemplateConfig {
  return {
    logoUrl: input.logoUrl.trim() || DEFAULT_TEMPLATE_CONFIG.logoUrl,
    primaryColor: input.primaryColor.trim() || DEFAULT_TEMPLATE_CONFIG.primaryColor,
    accentColor: input.accentColor.trim() || DEFAULT_TEMPLATE_CONFIG.accentColor,
    headerTitle: input.headerTitle.trim() || DEFAULT_TEMPLATE_CONFIG.headerTitle,
    headerSubtitle: input.headerSubtitle.trim() || DEFAULT_TEMPLATE_CONFIG.headerSubtitle,
    introText: input.introText.trim() || DEFAULT_TEMPLATE_CONFIG.introText,
    highlights: normalizeHighlights(input.highlights),
    notesTitle: input.notesTitle.trim() || DEFAULT_TEMPLATE_CONFIG.notesTitle,
    notesBody: input.notesBody.trim() || DEFAULT_TEMPLATE_CONFIG.notesBody,
    termsTitle: input.termsTitle.trim() || DEFAULT_TEMPLATE_CONFIG.termsTitle,
    termsBody: input.termsBody.trim() || DEFAULT_TEMPLATE_CONFIG.termsBody,
    signatureName: input.signatureName.trim() || DEFAULT_TEMPLATE_CONFIG.signatureName,
    signatureRole: input.signatureRole.trim() || DEFAULT_TEMPLATE_CONFIG.signatureRole,
    footerNote: input.footerNote.trim() || DEFAULT_TEMPLATE_CONFIG.footerNote,
  }
}

export async function saveQuoteTemplateSettings(
  input: QuoteTemplateSettingsInput,
): Promise<QuoteTemplateSettings> {
  const sanitizedConfig = sanitizeConfig(input.config)
  const assets = buildQuoteTemplateAssets(sanitizedConfig)

  const payload = {
    slug: DEFAULT_SLUG,
    nombre: input.name.trim().length ? input.name.trim() : QUOTE_TEMPLATE_DEFAULTS.name,
    descripcion:
      input.description.trim().length ? input.description.trim() : QUOTE_TEMPLATE_DEFAULTS.description,
    html: assets.html,
    css: assets.css,
    variables: [...QUOTE_TEMPLATE_DEFAULTS.variables],
    config: sanitizedConfig,
    version: 1,
    is_active: true,
  }

  const response = await callCrmApi<Record<string, unknown>>("/crm/settings/quote-template", {
    method: "PUT",
    body: payload,
  })

  if (!response.ok) {
    throw new Error(response.error || "No se pudo guardar el formato.")
  }
  if (!response.data) {
    throw new Error("No se pudo guardar el formato.")
  }

  revalidatePath("/settings/formato-cotizacion")

  return normalizeSettings(response.data)
}
