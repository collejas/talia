"use server";

import { revalidatePath } from "next/cache";

import { callSupabaseRest } from "@/lib/leads/supabase";

const TABLE_PATH = "panel_calendar_settings";
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
  const response = await callSupabaseRest<unknown[]>(TABLE_PATH, {
    query: {
      slug: `eq.${DEFAULT_SLUG}`,
      limit: 1,
      select: "slug,reminder_enabled,reminder_offset_minutes,updated_at",
    },
  });

  if (!response.ok) {
    console.warn("[settings] fetch reminder settings failed:", response.error);
    return DEFAULT_SETTINGS;
  }

  const rows = Array.isArray(response.data) ? response.data : [];
  const record = (rows[0] as Record<string, unknown> | undefined) ?? null;
  return normalizeRecord(record);
}

export async function saveReminderSettings(
  input: ReminderSettingsInput,
): Promise<ReminderSettings> {
  const payload = {
    slug: DEFAULT_SLUG,
    reminder_enabled: Boolean(input.reminderEnabled),
    reminder_offset_minutes: normalizeOffset(input.reminderOffsetMinutes),
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
  const record = (rows[0] as Record<string, unknown> | undefined) ?? null;
  const normalized = normalizeRecord(record);
  revalidatePath("/settings/reminders");
  return normalized;
}
