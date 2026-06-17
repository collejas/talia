import { NextResponse } from "next/server";

import { callCrmApi } from "@/lib/api/crm";

type StageOption = { id: string; nombre: string };
type AccountOption = { id: string; nombre: string | null; razon_social?: string | null };
type PersonaOption = { persona_id?: string; nombre: string | null; correo: string | null };
type UserOption = { id: string; nombre_completo: string | null; correo: string | null };

type FilterOption = { id: string; label: string };
type FilterOptionsPayload = {
  etapas: FilterOption[];
  estados: FilterOption[];
  asignados: FilterOption[];
  cuentas: FilterOption[];
  personas: FilterOption[];
  canales: FilterOption[];
};

const STATUSES: FilterOption[] = [
  { id: "abierta", label: "abierta" },
  { id: "ganada", label: "ganada" },
  { id: "perdida", label: "perdida" },
];

export async function GET() {
  const [stagesResp, accountsResp, contactsResp, usersResp] = await Promise.all([
    callCrmApi<StageOption[]>("/crm/etapas"),
    callCrmApi<{ items: AccountOption[] }>("/crm/cuentas", {
      searchParams: { limit: "200", offset: "0", lite: "true" },
    }),
    callCrmApi<PersonaOption[]>("/crm/contacts/list", { searchParams: { limit: "200" } }),
    callCrmApi<UserOption[]>("/crm/usuarios", { searchParams: { limit: "200" } }),
  ]);

  return NextResponse.json<FilterOptionsPayload>({
    etapas: normalizeOptions(
      stagesResp.ok && Array.isArray(stagesResp.data)
        ? stagesResp.data.map((stage) => ({ id: stage.id, label: stage.nombre }))
        : [],
    ),
    estados: STATUSES,
    asignados: normalizeOptions(
      usersResp.ok && Array.isArray(usersResp.data)
        ? usersResp.data.map((user) => ({
            id: user.id,
            label: user.nombre_completo || user.correo || user.id,
          }))
        : [],
    ),
    cuentas: normalizeOptions(
      accountsResp.ok && accountsResp.data?.items
        ? accountsResp.data.items.map((account) => ({
            id: account.id,
            label: account.nombre || account.razon_social || account.id,
          }))
        : [],
    ),
    personas: normalizeOptions(
      contactsResp.ok && Array.isArray(contactsResp.data)
        ? contactsResp.data.map((contact) => ({
            id: contact.persona_id || "",
            label: contact.nombre || contact.correo || contact.persona_id || "",
          }))
        : [],
    ),
    canales: [],
  });
}

function normalizeOptions(options: FilterOption[]) {
  const seen = new Set<string>();
  return options.filter((option) => {
    if (!option.id || seen.has(option.id)) return false;
    seen.add(option.id);
    return true;
  });
}
