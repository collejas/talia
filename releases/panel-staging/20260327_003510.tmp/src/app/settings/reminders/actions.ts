"use server";

import { revalidatePath } from "next/cache";

import { callCrmApi } from "@/lib/api/crm";

const DEFAULT_SLUG = "default";
const MIN_OFFSET = 15;
const MAX_OFFSET = 720;
const DEFAULT_OFFSET = 120;

export type ReminderSettings = {
  reminderEnabled: boolean;
  reminderOffsetMinutes: number;
  updatedAt?: string | null;
};

export type ReminderSettingsInput = {
  reminderEnabled: boolean;
  reminderOffsetMinutes: number;
};

const DEFAULT_SETTINGS: ReminderSettings = {
  reminderEnabled: true,
  reminderOffsetMinutes: DEFAULT_OFFSET,
};

function normalizeOffset(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_OFFSET;
  return Math.max(MIN_OFFSET, Math.min(MAX_OFFSET, Math.trunc(parsed)));
}

function normalizeRecord(record: Record<string, unknown> | null | undefined): ReminderSettings {
  if (!record) return DEFAULT_SETTINGS;
  const reminderEnabled =
    typeof record.reminder_enabled === "boolean"
      ? record.reminder_enabled
      : DEFAULT_SETTINGS.reminderEnabled;
  const offset = normalizeOffset(record.reminder_offset_minutes);
  return {
    reminderEnabled,
    reminderOffsetMinutes: offset,
    updatedAt:
      typeof record.updated_at === "string" && record.updated_at.length ? record.updated_at : undefined,
  };
}

export async function fetchReminderSettings(): Promise<ReminderSettings> {
  const response = await callCrmApi<Record<string, unknown>>("/crm/settings/reminders");

  if (!response.ok) {
    console.warn("[settings] fetch reminder settings failed:", response.error);
    return DEFAULT_SETTINGS;
  }
  if (!response.data) {
    console.warn("[settings] fetch reminder settings failed: respuesta vacía");
    return DEFAULT_SETTINGS;
  }

  return normalizeRecord(response.data);
}

export async function saveReminderSettings(
  input: ReminderSettingsInput,
): Promise<ReminderSettings> {
  const payload = {
    slug: DEFAULT_SLUG,
    reminder_enabled: Boolean(input.reminderEnabled),
    reminder_offset_minutes: normalizeOffset(input.reminderOffsetMinutes),
  };

  const response = await callCrmApi<Record<string, unknown>>("/crm/settings/reminders", {
    method: "PUT",
    body: payload,
  });

  if (!response.ok) {
    throw new Error(response.error || "No se pudieron guardar los recordatorios.");
  }
  if (!response.data) {
    throw new Error("No se pudieron guardar los recordatorios.");
  }

  const normalized = normalizeRecord(response.data);
  revalidatePath("/settings/reminders");
  return normalized;
}
