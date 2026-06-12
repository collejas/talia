"use server";

import { revalidatePath } from "next/cache";

import { callCrmApi } from "@/lib/api/crm";

export type ScoringChannel = "whatsapp" | "webchat";

export type ScoringProfile = {
  id: string;
  canal: ScoringChannel;
  nombre: string;
  activo: boolean;
  weights: Record<string, unknown>;
  thresholds: Record<string, unknown>;
  confidence_thresholds: Record<string, unknown>;
  metadata: Record<string, unknown>;
};

export type ScoringQuestion = {
  id: string;
  canal: ScoringChannel;
  field_key: string;
  question_text: string;
  question_type?: string;
  orden: number;
  repregunta_max: number;
  required_for_case_a: boolean;
  activa: boolean;
  metadata: Record<string, unknown>;
  allow_unknown?: boolean;
  allow_refused?: boolean;
};

export type ScoringReprompt = {
  id: string;
  question_id: string;
  canal: ScoringChannel;
  intento: number;
  prompt_text: string;
  activa: boolean;
};

export type ScoringRule = {
  id: string;
  question_id: string;
  canal: ScoringChannel;
  rule_type: string;
  match_value: string | null;
  min_value: number | null;
  max_value: number | null;
  score: number;
  priority: number;
  activa: boolean;
};

export type ScoringConfigBundle = {
  canal: ScoringChannel;
  profiles: ScoringProfile[];
  questions: ScoringQuestion[];
  reprompts: ScoringReprompt[];
  rules: ScoringRule[];
};

export type ScoringFeatureStatus = {
  organizacion_id: string;
  canal?: ScoringChannel | null;
  profiling_enabled: boolean;
  profiling_enabled_global: boolean;
  profiling_enabled_by_channel: Record<ScoringChannel, boolean>;
};

export async function fetchScoringFeatureStatus(
  canal?: ScoringChannel,
): Promise<ScoringFeatureStatus> {
  const response = await callCrmApi<ScoringFeatureStatus>("/crm/pipeline/scoring/feature-status", {
    searchParams: canal ? { canal } : undefined,
  });
  if (!response.ok || !response.data) {
    throw new Error(response.ok ? "No se pudo cargar estado de perfilamiento." : response.error);
  }
  return response.data;
}

export async function fetchScoringConfig(canal: ScoringChannel): Promise<ScoringConfigBundle> {
  const response = await callCrmApi<ScoringConfigBundle>("/crm/pipeline/scoring/config", {
    searchParams: { canal, include_inactive: "true" },
  });
  if (!response.ok || !response.data) {
    throw new Error(response.ok ? "No se pudo cargar la configuración de scoring." : response.error);
  }
  return response.data;
}

export async function upsertScoringProfile(input: {
  canal: ScoringChannel;
  nombre: string;
  activo: boolean;
  weights: Record<string, unknown>;
  thresholds: Record<string, unknown>;
  confidence_thresholds: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}): Promise<ScoringProfile> {
  const response = await callCrmApi<ScoringProfile>("/crm/pipeline/scoring/config/profile", {
    method: "PUT",
    body: input,
  });
  if (!response.ok || !response.data) {
    throw new Error(response.ok ? "No se pudo guardar el perfil." : response.error);
  }
  revalidatePath("/settings/scoring");
  return response.data;
}

export async function upsertScoringQuestion(input: {
  id?: string;
  canal: ScoringChannel;
  field_key: string;
  question_text: string;
  question_type?: string;
  orden: number;
  repregunta_max: number;
  required_for_case_a?: boolean;
  activa?: boolean;
  allow_unknown?: boolean;
  allow_refused?: boolean;
  metadata?: Record<string, unknown>;
}): Promise<ScoringQuestion> {
  const response = await callCrmApi<ScoringQuestion>("/crm/pipeline/scoring/config/question", {
    method: "PUT",
    body: input,
  });
  if (!response.ok || !response.data) {
    throw new Error(response.ok ? "No se pudo guardar la pregunta." : response.error);
  }
  revalidatePath("/settings/scoring");
  return response.data;
}

export async function deleteScoringQuestion(questionId: string): Promise<void> {
  const response = await callCrmApi(`/crm/pipeline/scoring/config/question/${questionId}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    throw new Error(response.error || "No se pudo eliminar la pregunta.");
  }
  revalidatePath("/settings/scoring");
}

export async function upsertScoringReprompt(input: {
  id?: string;
  question_id: string;
  canal: ScoringChannel;
  intento: number;
  prompt_text: string;
  activa?: boolean;
}): Promise<ScoringReprompt> {
  const response = await callCrmApi<ScoringReprompt>(
    "/crm/pipeline/scoring/config/question-reprompt",
    {
      method: "PUT",
      body: input,
    },
  );
  if (!response.ok || !response.data) {
    throw new Error(response.ok ? "No se pudo guardar la repregunta." : response.error);
  }
  revalidatePath("/settings/scoring");
  return response.data;
}

export async function deleteScoringReprompt(repromptId: string): Promise<void> {
  const response = await callCrmApi(`/crm/pipeline/scoring/config/question-reprompt/${repromptId}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    throw new Error(response.error || "No se pudo eliminar la repregunta.");
  }
  revalidatePath("/settings/scoring");
}

export async function upsertScoringRule(input: {
  id?: string;
  question_id: string;
  canal: ScoringChannel;
  rule_type: string;
  match_value?: string | null;
  min_value?: number | null;
  max_value?: number | null;
  score: number;
  priority?: number;
  activa?: boolean;
}): Promise<ScoringRule> {
  const response = await callCrmApi<ScoringRule>("/crm/pipeline/scoring/config/rule", {
    method: "PUT",
    body: input,
  });
  if (!response.ok || !response.data) {
    throw new Error(response.ok ? "No se pudo guardar la regla." : response.error);
  }
  revalidatePath("/settings/scoring");
  return response.data;
}

export async function deleteScoringRule(ruleId: string): Promise<void> {
  const response = await callCrmApi(`/crm/pipeline/scoring/config/rule/${ruleId}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    throw new Error(response.error || "No se pudo eliminar la regla.");
  }
  revalidatePath("/settings/scoring");
}

export type ScoringSeedResult = {
  canal: ScoringChannel;
  seeded: boolean;
  profile_id: string | null;
  questions_upserted: number;
  reprompts_upserted: number;
  rules_inserted: number;
  message?: string | null;
};

export async function seedScoringDefaults(input: {
  canal: ScoringChannel;
  force?: boolean;
}): Promise<ScoringSeedResult> {
  const response = await callCrmApi<ScoringSeedResult>("/crm/pipeline/scoring/config/seed", {
    method: "POST",
    body: {
      canal: input.canal,
      force: Boolean(input.force),
    },
  });
  if (!response.ok || !response.data) {
    throw new Error(response.ok ? "No se pudo sembrar la configuración base." : response.error);
  }
  revalidatePath("/settings/scoring");
  return response.data;
}
