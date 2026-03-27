"use server";

import { callCrmApi } from "@/lib/api/crm";

type ReassignSellerInput = {
  oportunidadId: string;
  usuarioId: string | null;
};

export type ReassignSellerResult =
  | { ok: true }
  | { ok: false; error: string };

export async function reassignOpportunitySeller(
  input: ReassignSellerInput,
): Promise<ReassignSellerResult> {
  if (!input.oportunidadId) {
    return { ok: false, error: "oportunidad_id_required" };
  }
  const body: Record<string, unknown> = {
    asignado_a_usuario_id: input.usuarioId,
  };
  const response = await callCrmApi(`/crm/pipeline/opportunities/${input.oportunidadId}`, {
    method: "PATCH",
    body,
  });
  if (!response.ok) {
    return { ok: false, error: response.error };
  }
  return { ok: true };
}
