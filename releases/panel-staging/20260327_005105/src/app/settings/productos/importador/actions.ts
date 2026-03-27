"use server"

import { callCrmApi } from "@/lib/api/crm"
import {
  ImporterField,
  ImporterFieldType,
  ImporterScheme,
} from "./types"

const FIELD_TYPES: ImporterFieldType[] = ["text", "number", "boolean", "select"]

function normalizeField(field: unknown): ImporterField | null {
  if (!field || typeof field !== "object") {
    return null
  }
  const record = field as Record<string, unknown>
  const id = String(record.id ?? record.slug ?? record.name ?? "")
  const label = String(record.label ?? record.name ?? "")
  const candidate = String(record.type ?? "").toLowerCase()
  const type = FIELD_TYPES.includes(candidate as ImporterFieldType)
    ? (candidate as ImporterFieldType)
    : "text"
  const required = Boolean(record.required)
  const description = typeof record.description === "string" ? record.description : undefined
  const options = Array.isArray(record.options)
    ? record.options.filter((item): item is string => typeof item === "string")
    : undefined
  return { id, label, type, required, description, options }
}

function normalizeScheme(row: unknown): ImporterScheme | null {
  if (!row || typeof row !== "object") {
    return null
  }
  const record = row as Record<string, unknown>
  const id = String(record.id ?? "")
  const name = String(record.name ?? "")
  if (!id || !name) {
    return null
  }
  const description = typeof record.description === "string" ? record.description : undefined
  const fieldsData = Array.isArray(record.fields) ? record.fields : []
  const fields = fieldsData
    .map((field) => normalizeField(field))
    .filter((field): field is ImporterField => field !== null)
  return { id, name, description, fields }
}

export async function fetchProductMetadataSchemes(): Promise<ImporterScheme[]> {
  const response = await callCrmApi("/crm/productos/importador/schemes")
  if (!response.ok) {
    throw new Error(response.error || "No se pudo cargar la configuración")
  }
  const data = Array.isArray(response.data) ? response.data : []
  return data
    .map((scheme) => normalizeScheme(scheme))
    .filter((scheme): scheme is ImporterScheme => scheme !== null)
}
