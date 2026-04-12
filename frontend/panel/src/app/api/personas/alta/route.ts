import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { callCrmApi } from "@/lib/api/crm";

type UnknownRecord = Record<string, unknown>;

function cleanString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : undefined;
}

function cleanObject(input: UnknownRecord): UnknownRecord {
  const out: UnknownRecord = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === null || value === undefined) continue;
    if (typeof value === "string") {
      const cleaned = cleanString(value);
      if (cleaned !== undefined) out[key] = cleaned;
      continue;
    }
    if (typeof value === "boolean") {
      out[key] = value;
      continue;
    }
    if (typeof value === "object" && !Array.isArray(value)) {
      const nested = cleanObject(value as UnknownRecord);
      if (Object.keys(nested).length) out[key] = nested;
      continue;
    }
    out[key] = value;
  }
  return out;
}

function personToLegacyContact(
  persona: UnknownRecord,
  cuenta: UnknownRecord | null,
  extras: UnknownRecord,
  modo: string,
): UnknownRecord {
  const nombre = cleanString(persona.nombre) ?? "";
  const apellidoPaterno = cleanString(persona.apellido_paterno) ?? "";
  const apellidoMaterno = cleanString(persona.apellido_materno) ?? "";
  const nombreCompleto =
    cleanString(persona.nombre_completo) ??
    [nombre, apellidoPaterno, apellidoMaterno].filter(Boolean).join(" ").trim();

  const fiscales = (extras.fiscales as UnknownRecord | undefined) ?? {};
  const direccion = (extras.direccion as UnknownRecord | undefined) ?? {};
  const contacto: UnknownRecord = cleanObject({
    cuenta_id: cleanString(cuenta?.cuenta_id),
    nombre_nombres: nombre,
    apellido_paterno: apellidoPaterno,
    apellido_materno: apellidoMaterno,
    nombre_completo: nombreCompleto,
    correo: cleanString(persona.correo_principal),
    telefono_e164: cleanString(persona.telefono_principal_e164),
    puesto: cleanString(persona.puesto),
    area: cleanString(persona.area),
    rol_decision: cleanString(persona.rol_decision),
    origen: cleanString(persona.origen),
    notes: cleanString(persona.notas),
    propietario_usuario_id: cleanString(persona.propietario_usuario_id),
    company_name:
      modo === "empresa_existente" || modo === "empresa_nueva" || modo === "persona_fisica_actividad_empresarial"
        ? cleanString(cuenta?.nombre_comercial) ?? cleanString(cuenta?.razon_social)
        : undefined,
    persona_fisica_moral:
      modo === "persona_fisica_actividad_empresarial"
        ? "fisica"
        : cleanString(cuenta?.tipo_persona),
    razon_social: cleanString(cuenta?.razon_social),
    rfc: cleanString(cuenta?.rfc),
    tipo_industria: cleanString(cuenta?.industria),
    website: cleanString(cuenta?.sitio_web),
    email_facturacion: cleanString(fiscales.email_facturacion),
    uso_cfdi: cleanString(fiscales.uso_cfdi),
    forma_pago: cleanString(fiscales.forma_pago),
    metodo_pago: cleanString(fiscales.metodo_pago),
    pais: cleanString(direccion.pais),
    entidad: cleanString(direccion.entidad),
    municipio: cleanString(direccion.municipio),
    tipo_vialidad: cleanString(direccion.tipo_vialidad),
    nombre_vialidad: cleanString(direccion.nombre_vialidad),
    numero_exterior: cleanString(direccion.numero_exterior),
    numero_interior: cleanString(direccion.numero_interior),
    codigo_postal: cleanString(direccion.codigo_postal),
  });
  return contacto;
}

function accountToLegacyAccount(cuenta: UnknownRecord, persona: UnknownRecord, modo: string): UnknownRecord {
  const nombreCompleto =
    cleanString(persona.nombre_completo) ??
    [cleanString(persona.nombre), cleanString(persona.apellido_paterno), cleanString(persona.apellido_materno)]
      .filter(Boolean)
      .join(" ")
      .trim();
  return cleanObject({
    nombre: cleanString(cuenta.nombre_comercial) ?? cleanString(cuenta.razon_social) ?? nombreCompleto,
    razon_social: cleanString(cuenta.razon_social) ?? (modo === "persona_fisica_actividad_empresarial" ? nombreCompleto : undefined),
    rfc: cleanString(cuenta.rfc),
    industria: cleanString(cuenta.industria),
    sitio_web: cleanString(cuenta.sitio_web),
    correo: cleanString(cuenta.correo_principal),
    telefono: cleanString(cuenta.telefono_principal),
    tipo: cleanString(cuenta.tipo_cuenta) ?? "empresa",
    tamano: cleanString(cuenta.tamano),
    alias: cleanString(cuenta.alias),
    propietario_usuario_id: cleanString(persona.propietario_usuario_id),
  });
}

export async function POST(request: NextRequest) {
  let payload: UnknownRecord;
  try {
    payload = (await request.json()) as UnknownRecord;
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const persona = payload.persona && typeof payload.persona === "object" ? cleanObject(payload.persona as UnknownRecord) : {};
  const contexto = payload.contexto_comercial && typeof payload.contexto_comercial === "object"
    ? cleanObject(payload.contexto_comercial as UnknownRecord)
    : {};
  const cuenta = payload.cuenta && typeof payload.cuenta === "object" ? cleanObject(payload.cuenta as UnknownRecord) : null;
  const extras = payload.extras && typeof payload.extras === "object" ? cleanObject(payload.extras as UnknownRecord) : {};

  const modo = cleanString(contexto.modo) ?? "solo_persona";
  const contactoBody = personToLegacyContact(persona, cuenta, extras, modo);

  if (!cleanString(contactoBody.nombre_nombres) || !cleanString(contactoBody.apellido_paterno)) {
    return NextResponse.json({ error: "persona_incompleta" }, { status: 400 });
  }
  if (!cleanString(contactoBody.correo) && !cleanString(contactoBody.telefono_e164)) {
    return NextResponse.json({ error: "medio_contacto_required" }, { status: 400 });
  }

  let cuentaId = cleanString(cuenta?.cuenta_id);
  let cuentaData: UnknownRecord | null = null;

  if (modo === "empresa_existente" && !cuentaId) {
    return NextResponse.json({ error: "cuenta_id_required" }, { status: 400 });
  }

  if ((modo === "empresa_nueva" || modo === "persona_fisica_actividad_empresarial") && cuenta) {
    const accountRes = await callCrmApi<UnknownRecord>("/crm/cuentas", {
      method: "POST",
      body: accountToLegacyAccount(cuenta, persona, modo),
      withUserToken: true,
    });
    if (!accountRes.ok) {
      return NextResponse.json(
        { error: accountRes.error || "cuenta_create_failed" },
        { status: accountRes.status ?? 502 },
      );
    }
    cuentaData = accountRes.data;
    cuentaId = cleanString((accountRes.data as UnknownRecord).id);
    if (cuentaId) {
      contactoBody.cuenta_id = cuentaId;
    }
  }

  if (modo === "empresa_existente" && cuentaId) {
    contactoBody.cuenta_id = cuentaId;
  }

  const contactRes = await callCrmApi<UnknownRecord>("/crm/contacts", {
    method: "POST",
    body: contactoBody,
    withUserToken: true,
  });

  if (!contactRes.ok) {
    return NextResponse.json(
      { error: contactRes.error || "contacto_create_failed" },
      { status: contactRes.status ?? 502 },
    );
  }

  return NextResponse.json({
    persona: contactRes.data,
    cuenta: cuentaData,
    relacion: null,
    resumen: {
      modo,
      persona_id: cleanString((contactRes.data as UnknownRecord).id) ?? null,
      cuenta_id: cuentaId ?? null,
    },
  });
}
