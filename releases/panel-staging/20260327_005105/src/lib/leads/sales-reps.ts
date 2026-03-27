"use server";

import { callSupabaseRest } from "@/lib/supabase/rest";

export type SalesRepOption = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
};

type SupabaseSalesRepRow = {
  usuario_id: string;
  usuario: {
    id: string;
    nombre_completo: string | null;
    telefono_e164: string | null;
    correo: string | null;
  } | null;
};

export async function loadSalesRepOptions(): Promise<SalesRepOption[]> {
  const response = await callSupabaseRest<SupabaseSalesRepRow[]>("/rest/v1/empleados", {
    searchParams: {
      select: "usuario_id,usuario:usuarios(id,nombre_completo,telefono_e164,correo)",
      es_vendedor: "eq.true",
      order: "nombre_completo.asc",
      limit: "200",
    },
    enforceOrganization: true,
  });

  if (!response.ok || !Array.isArray(response.data)) {
    return [];
  }

  return response.data
    .map((row) => ({
      id: row.usuario?.id || row.usuario_id,
      name: row.usuario?.nombre_completo || "Sin nombre",
      phone: row.usuario?.telefono_e164 || null,
      email: row.usuario?.correo || null,
    }))
    .filter((option) => option.id);
}
