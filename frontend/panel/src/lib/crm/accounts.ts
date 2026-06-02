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
  estado?: string | null;
  industria: string | null;
  tamano: string | null;
  sitio_web: string | null;
  telefono: string | null;
  correo: string | null;
  direccion: Record<string, unknown> | null;
  propietario_usuario_id: string | null;
  propietario_nombre: string | null;
  propietario?: {
    id: string;
    nombre_completo: string | null;
    correo: string | null;
  } | null;
  contacto_principal_nombre?: string | null;
  contacto_principal_codigo_contacto?: string | null;
  contacto_principal_correo?: string | null;
  contacto_principal_telefono?: string | null;
  contacto_principal_owner_id?: string | null;
  direccion_fiscal?: Record<string, unknown> | null;
  direccion_principal?: Record<string, unknown> | null;
  can_view_sensitive_fields?: boolean | null;
  regimen_capital?: string | null;
  metadata: Record<string, unknown> | null;
  creado_en: string;
  actualizado_en: string;
};

type CRMAccountsResponse = {
  items: CRMAccount[];
  limit: number;
  offset: number;
};

export type CrmAccountsPayload = {
  rows: DataTableRow[];
  total: number;
  errors: string[];
};

export async function loadCrmAccounts(): Promise<CrmAccountsPayload> {
  const accounts: CRMAccount[] = [];
  const errors: string[] = [];
  const pageSize = 200;

  for (let offset = 0; offset < 2000; offset += pageSize) {
    const accountsResult = await callCrmApi<CRMAccountsResponse>("/crm/cuentas", {
      searchParams: { limit: String(pageSize), offset: String(offset) },
    });

    if (!accountsResult.ok) {
      errors.push(accountsResult.error);
      break;
    }

    accounts.push(...accountsResult.data.items);
    if (accountsResult.data.items.length < pageSize) {
      break;
    }
  }

  const rows = accounts.map<DataTableRow>((account, index) => {
    const rawAccount = {
      id: account.id,
      organizacion_id: account.organizacion_id,
      codigo_cuenta: account.codigo_cuenta,
      nombre: account.nombre,
      alias: account.alias,
      tipo: account.tipo,
      estado: account.estado ?? null,
      industria: account.industria,
      tamano: account.tamano,
      sitio_web: account.sitio_web,
      telefono: account.telefono,
      correo: account.correo,
      propietario_usuario_id: account.propietario_usuario_id,
      propietario_nombre: account.propietario_nombre,
      propietario: account.propietario,
      contacto_principal_codigo_contacto: account.contacto_principal_codigo_contacto,
      contacto_principal_nombre: account.contacto_principal_nombre,
      contacto_principal_correo: account.contacto_principal_correo,
      contacto_principal_telefono: account.contacto_principal_telefono,
      contacto_principal_owner_id: account.contacto_principal_owner_id,
      can_view_sensitive_fields: account.can_view_sensitive_fields,
      creado_en: account.creado_en,
      actualizado_en: account.actualizado_en,
      rfc: (account as { rfc?: string | null }).rfc ?? null,
      regimen_capital: (account as { regimen_capital?: string | null }).regimen_capital ?? null,
      uso_cfdi: (account as { uso_cfdi?: string | null }).uso_cfdi ?? null,
      metodo_pago: (account as { metodo_pago?: string | null }).metodo_pago ?? null,
      forma_pago: (account as { forma_pago?: string | null }).forma_pago ?? null,
      email_facturacion: (account as { email_facturacion?: string | null }).email_facturacion ?? null,
      direccion_fiscal: (account as { direccion_fiscal?: Record<string, unknown> | null }).direccion_fiscal ?? null,
      direccion_principal: (account as { direccion_principal?: Record<string, unknown> | null }).direccion_principal ?? null,
      fecha_incorporacion: (account as { fecha_incorporacion?: string | null }).fecha_incorporacion ?? null,
      tipo_establecimiento: (account as { tipo_establecimiento?: string | null }).tipo_establecimiento ?? null,
      tipo_industria: (account as { tipo_industria?: string | null }).tipo_industria ?? null,
      razon_social: (account as { razon_social?: string | null }).razon_social ?? null,
    };
    return {
      id: index + 1,
      header: account.nombre,
      type: account.tipo || "Cuenta",
      status: account.industria || "Sin industria",
      target: account.sitio_web || "—",
      limit: account.telefono || account.correo || "—",
      reviewer: account.alias || "Sin alias",
      raw: rawAccount,
    };
  });

  return {
    rows,
    total: rows.length,
    errors,
  };
}
