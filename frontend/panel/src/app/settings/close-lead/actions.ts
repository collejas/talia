"use server";

import { revalidatePath } from "next/cache";

import { callCrmApi } from "@/lib/api/crm";

export type CloseLeadChannel = "whatsapp" | "webchat";

export type CloseLeadPolicy = {
  id: string;
  organizacion_id: string;
  canal: CloseLeadChannel;
  activo: boolean;
  nombre_requerido: boolean;
  telefono_requerido: boolean;
  necesidad_proposito_requerido: boolean;
  notes_requerido: boolean;
  correo_requerido: boolean;
  company_name_requerido: boolean;
};

export async function fetchCloseLeadPolicy(canal: CloseLeadChannel): Promise<CloseLeadPolicy> {
  const response = await callCrmApi<CloseLeadPolicy>("/crm/pipeline/close-lead-policy", {
    searchParams: { canal },
  });
  if (!response.ok || !response.data) {
    throw new Error(response.ok ? "No se pudo cargar la política de cierre." : response.error);
  }
  return response.data;
}

export async function saveCloseLeadPolicy(input: {
  canal: CloseLeadChannel;
  activo: boolean;
  nombre_requerido: boolean;
  telefono_requerido: boolean;
  necesidad_proposito_requerido: boolean;
  notes_requerido: boolean;
  correo_requerido: boolean;
  company_name_requerido: boolean;
}): Promise<CloseLeadPolicy> {
  const response = await callCrmApi<CloseLeadPolicy>("/crm/pipeline/close-lead-policy", {
    method: "PUT",
    body: input,
  });
  if (!response.ok || !response.data) {
    throw new Error(response.ok ? "No se pudo guardar la política de cierre." : response.error);
  }
  revalidatePath("/settings/close-lead");
  return response.data;
}
