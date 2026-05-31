"use server";

import { DataTableRow } from "@/components/data-table";
import { callCrmApi } from "@/lib/api/crm";

type CRMAccount = {
  id: string;
  organizacion_id: string;
  codigo_cuenta: string | null;
  nombre: string;
  alias: string | null;
  tipo: string | null;
  industria: string | null;
  tamano: string | null;
  sitio_web: string | null;
  telefono: string | null;
  correo: string | null;
  direccion: Record<string, unknown> | null;
  propietario_usuario_id: string | null;
  metadata: Record<string, unknown> | null;
  creado_en: string;
  actualizado_en: string;
};

type CRMAccountsResponse = {
  items: CRMAccount[];
  limit: number;
  offset: number;
};

type CRMAccountRelation = {
  es_contacto_principal?: boolean;
  es_representante_legal?: boolean;
  activo?: boolean;
  persona?: {
    id: string;
    nombre_completo: string | null;
    correo_principal: string | null;
    telefono_principal_e164: string | null;
    company_name: string | null;
    propietario_usuario_id: string | null;
  } | null;
};

type CRMUser = {
  id: string;
  nombre_completo: string | null;
  correo: string | null;
};

export type CrmAccountsPayload = {
  rows: DataTableRow[];
  total: number;
  errors: string[];
};

export async function loadCrmAccounts(): Promise<CrmAccountsPayload> {
  const [accountsResult, usersResult] = await Promise.all([
    callCrmApi<CRMAccountsResponse>("/crm/cuentas", {
      searchParams: { limit: "100", offset: "0" },
    }),
    loadAllUsers(),
  ]);

  if (!accountsResult.ok) {
    return {
      rows: [],
      total: 0,
      errors: [accountsResult.error],
    };
  }

  const ownerMap = new Map<string, string>();
  if (usersResult.ok && Array.isArray(usersResult.data)) {
    for (const user of usersResult.data) {
      if (!user || typeof user !== "object") continue;
      const id = String(user.id || "").trim();
      if (!id) continue;
      ownerMap.set(id, user.nombre_completo?.trim() || user.correo?.trim() || "Sin asignar");
    }
  }

  const relationResults = await Promise.all(
    accountsResult.data.items.map(async (account) => {
      const response = await callCrmApi<CRMAccountRelation[]>(`/crm/cuentas/${encodeURIComponent(account.id)}/relaciones`, {
        searchParams: {},
      });
      return { account, response };
    }),
  );

  const rows = relationResults.map<DataTableRow>(({ account, response }, index) => {
    const relations = response.ok && Array.isArray(response.data) ? response.data : [];
    const activeRelations = relations.filter((relation) => relation?.activo !== false);
    const primaryRelation =
      activeRelations.find((relation) => relation?.es_contacto_principal) ||
      relations.find((relation) => relation?.es_contacto_principal) ||
      activeRelations[0] ||
      relations[0] ||
      null;
    const contact = primaryRelation?.persona ?? null;
    const contactOwnerId = contact?.propietario_usuario_id?.trim() || null;
    const relationOwnerId =
      relations.find((relation) => relation?.persona?.propietario_usuario_id?.trim())?.persona?.propietario_usuario_id?.trim() || null;
    const ownerId = account.propietario_usuario_id?.trim() || contactOwnerId || relationOwnerId;
    const ownerName = ownerId ? ownerMap.get(ownerId) ?? null : null;

    return {
      id: index + 1,
      header: account.nombre,
      type: account.tipo || "Cuenta",
      status: account.industria || "Sin industria",
      target: account.sitio_web || "—",
      limit: account.telefono || account.correo || "—",
      reviewer: account.alias || "Sin alias",
      raw: {
        ...account,
        codigo_cuenta: account.codigo_cuenta,
        contacto_principal_nombre: contact?.nombre_completo ?? null,
        contacto_principal_correo: contact?.correo_principal ?? null,
        contacto_principal_telefono: contact?.telefono_principal_e164 ?? null,
        contacto_principal_owner_id: contact?.propietario_usuario_id ?? null,
        propietario_nombre: ownerName,
      },
    };
  });

  const errors = [
    ...(!usersResult.ok ? [usersResult.error] : []),
    ...relationResults
      .filter(({ response }) => !response.ok)
      .map(({ response }) => (response.ok ? null : response.error))
      .filter((error): error is string => Boolean(error)),
  ];

  return {
    rows,
    total: accountsResult.data.items.length,
    errors: Array.from(new Set(errors)),
  };
}

async function loadAllUsers(): Promise<{ ok: true; data: CRMUser[] } | { ok: false; error: string }> {
  const items: CRMUser[] = [];
  const pageSize = 500;
  let offset = 0;

  while (true) {
    const response = await callCrmApi<CRMUser[]>("/crm/usuarios", {
      searchParams: {
        limit: String(pageSize),
        offset: String(offset),
      },
    });
    if (!response.ok) {
      return response;
    }

    const page = Array.isArray(response.data) ? response.data : [];
    items.push(...page);
    if (page.length < pageSize) break;
    offset += pageSize;
  }

  return { ok: true, data: items };
}
