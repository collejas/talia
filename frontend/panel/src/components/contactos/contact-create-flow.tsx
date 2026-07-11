"use client";

import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { GeoLocationSelects } from "@/components/contactos/geo-location-selects";
import { ContactCatalogSelect, mergeCatalogOptions } from "@/components/contactos/contact-catalog-select";
import { usePermissions } from "@/hooks/use-permissions";
import {
  getRfcLengthMessage,
  isValidRfcLength,
  sanitizePhoneInput,
  sanitizeRfcInput,
} from "@/components/contactos/contact-input-sanitizers";
import { useTenantContactCatalogs } from "@/components/contactos/use-contact-catalogs";

type CreateMode =
  | "solo_persona"
  | "empresa_existente"
  | "empresa_nueva"
  | "persona_fisica_actividad_empresarial";

type PersonaDraft = {
  codigo_contacto: string;
  nombre: string;
  apellido_paterno: string;
  apellido_materno: string;
  correo_principal: string;
  correo_secundario: string;
  correo_institucional: string;
  correo_personal_3: string;
  telefono_principal_e164: string;
  telefono_principal_tipo_linea: string;
  telefono_principal_extension: string;
  telefono_movil_1_e164: string;
  telefono_movil_1_tipo_linea: string;
  telefono_movil_2_e164: string;
  telefono_movil_2_tipo_linea: string;
  telefono_movil_2_extension: string;
  telefono_secundario_e164: string;
  telefono_secundario_tipo_linea: string;
  telefono_secundario_extension: string;
  telefono_empresa_1_e164: string;
  telefono_empresa_1_extension: string;
  telefono_empresa_2_e164: string;
  telefono_empresa_2_extension: string;
  puesto: string;
  area: string;
  rol_decision: string;
  estado: string;
  origen: string;
  notas: string;
  propietario_usuario_id: string;
};

type CuentaDraft = {
  cuenta_id: string;
  nombre_comercial: string;
  razon_social: string;
  alias: string;
  tipo_persona: "" | "fisica" | "moral";
  tipo_cuenta: string;
  tipo: string;
  codigo_cuenta: string;
  rfc: string;
  industria: string;
  segmento: string;
  tamano: string;
  sitio_web: string;
  correo_principal: string;
  correo_secundario: string;
  telefono_principal: string;
  telefono_principal_e164: string;
  telefono_principal_tipo_linea: string;
  telefono_principal_extension: string;
  telefono_secundario_e164: string;
  telefono_secundario_tipo_linea: string;
  telefono_secundario_extension: string;
  correo: string;
  telefono: string;
  notas: string;
  necesidad_proposito: string;
  tipo_establecimiento: string;
  fecha_incorporacion: string;
  latitud: string;
  longitud: string;
};

type RelacionDraft = {
  rol_en_cuenta: string;
  es_contacto_principal: boolean;
  es_contacto_facturacion: boolean;
  es_representante_legal: boolean;
  activo: boolean;
  fecha_inicio: string;
  fecha_fin: string;
  notas: string;
};

type ExtrasDraft = {
  tipo: string;
  regimen_capital: string;
  uso_cfdi: string;
  forma_pago: string;
  metodo_pago: string;
  email_facturacion: string;
  pais: string;
  clave_entidad: string;
  entidad: string;
  clave_municipio: string;
  municipio: string;
  clave_localidad: string;
  localidad: string;
  tipo_vialidad: string;
  nombre_vialidad: string;
  numero_exterior: string;
  letra_exterior: string;
  edificio: string;
  edificio_piso: string;
  numero_interior: string;
  letra_interior: string;
  tipo_asentamiento: string;
  colonia: string;
  tipo_centro_comercial: string;
  corredor_industrial: string;
  numero_local: string;
  codigo_postal: string;
};

type AccountOption = {
  id: string;
  nombre: string;
  alias?: string | null;
  tipo?: string | null;
  codigo_cuenta?: string | null;
  correo?: string | null;
  telefono?: string | null;
  correo_principal?: string | null;
  correo_secundario?: string | null;
  telefono_principal_e164?: string | null;
  telefono_secundario_e164?: string | null;
};

type PersonaAltaResumen = {
  deduplicado?: boolean;
  contacto_reutilizado_id?: string | null;
  cuenta_reutilizada_id?: string | null;
};

type PersonaAltaResponse = {
  persona?: {
    id?: string | null;
  } | null;
  resumen?: PersonaAltaResumen;
};

type DedupeCandidate = {
  id: string;
  codigo_contacto?: string | null;
  codigo_cuenta?: string | null;
  nombre?: string | null;
  alias?: string | null;
  empresa?: string | null;
  correo?: string | null;
  telefono?: string | null;
  rfc?: string | null;
  tipo_registro?: string | null;
  coincidencia_en?: string | null;
  propietario_usuario_id?: string | null;
  propietario_nombre?: string | null;
  nivel?: "fuerte" | "medio" | "debil" | string;
  motivo?: string | null;
};

type PersonaAltaValidationResponse = {
  requiere_confirmacion: boolean;
  candidatos_persona: DedupeCandidate[];
  candidatos_cuenta: DedupeCandidate[];
  sugerencia_persona_reutilizar_id?: string | null;
  sugerencia_cuenta_reutilizar_id?: string | null;
};

type DedupeDecision = {
  confirmar_creacion?: boolean;
  persona_reutilizar_id?: string;
  cuenta_reutilizar_id?: string;
};

type ContactCreateState = {
  mode: CreateMode;
  persona: PersonaDraft;
  cuenta: CuentaDraft;
  relacion: RelacionDraft;
  extras: ExtrasDraft;
  extrasOpen: boolean;
  accountQuery: string;
  accountResults: AccountOption[];
  accountLoading: boolean;
  accountError: string | null;
  saving: boolean;
  error: string | null;
};

type ContactCreateAction =
  | { type: "reset" }
  | { type: "mode/set"; mode: CreateMode }
  | { type: "persona/set"; field: keyof PersonaDraft; value: string }
  | { type: "cuenta/set"; field: keyof CuentaDraft; value: string }
  | { type: "relacion/set"; field: keyof RelacionDraft; value: string | boolean }
  | { type: "extras/set"; field: keyof ExtrasDraft; value: string }
  | { type: "extras/toggle"; value?: boolean }
  | { type: "account-query/set"; value: string }
  | { type: "account-search/start" }
  | { type: "account-search/success"; items: AccountOption[] }
  | { type: "account-search/error"; message: string }
  | { type: "account/select"; account: AccountOption }
  | { type: "saving/set"; value: boolean }
  | { type: "error/set"; value: string | null };

type ContactCreateFlowProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (personaId: string) => void;
  initialMode?: CreateMode;
};

type CreateEntryOption = {
  mode: CreateMode;
  title: string;
  description: string;
};

type ValidationNoticeState = {
  open: boolean;
  title: string;
  message: string;
};

function formatDedupeRecordType(value: string | null | undefined): string {
  switch ((value || "").trim()) {
    case "empresa":
      return "Empresa";
    case "empresa_propia":
      return "Empresa propia";
    case "contacto":
      return "Contacto";
    default:
      return "Registro existente";
  }
}

function formatDedupeCode(candidate: DedupeCandidate): string {
  return candidate.codigo_contacto?.trim() || candidate.codigo_cuenta?.trim() || candidate.id;
}

function formatDedupeSeller(candidate: DedupeCandidate): string {
  return candidate.propietario_nombre?.trim() || candidate.propietario_usuario_id?.trim() || "Sin vendedor";
}

function formatDedupeCandidateClipboard(candidate: DedupeCandidate): string {
  const lines = [
    `Código: ${formatDedupeCode(candidate)}`,
    `Nombre: ${candidate.nombre || "Sin nombre"}`,
    `Tipo: ${formatDedupeRecordType(candidate.tipo_registro)}`,
    `Nivel: ${candidate.nivel || "debil"}`,
    `Coincidencia: ${candidate.coincidencia_en || "Coincidencia detectada"}`,
    `Vendedor: ${formatDedupeSeller(candidate)}`,
  ];
  if (candidate.correo) lines.push(`Correo: ${candidate.correo}`);
  if (candidate.telefono) lines.push(`Teléfono: ${candidate.telefono}`);
  if (candidate.empresa) lines.push(`Empresa: ${candidate.empresa}`);
  if (candidate.rfc) lines.push(`RFC: ${candidate.rfc}`);
  if (candidate.alias) lines.push(`Alias: ${candidate.alias}`);
  if (candidate.motivo) lines.push(`Motivo: ${candidate.motivo}`);
  return lines.join("\n");
}

function buildDedupeClipboardText(state: PersonaAltaValidationResponse | null): string {
  if (!state) return "Sin coincidencias detectadas.";
  const parts: string[] = [
    "Aviso de posibles duplicados",
    `Requiere confirmación: ${state.requiere_confirmacion ? "Sí" : "No"}`,
  ];

  if (state.candidatos_persona?.length) {
    parts.push("");
    parts.push("Personas:");
    state.candidatos_persona.forEach((candidate, index) => {
      parts.push(`${index + 1}. ${formatDedupeCandidateClipboard(candidate)}`);
    });
  }

  if (state.candidatos_cuenta?.length) {
    parts.push("");
    parts.push("Cuentas:");
    state.candidatos_cuenta.forEach((candidate, index) => {
      parts.push(`${index + 1}. ${formatDedupeCandidateClipboard(candidate)}`);
    });
  }

  return parts.join("\n");
}

const PERSONA_ESTADO_OPTIONS = [
  { value: "activo", label: "Activo" },
  { value: "inactivo", label: "Inactivo" },
] as const;

const PERSONA_ORIGEN_OPTIONS = [
  { value: "prospeccion_propia", label: "Prospección propia" },
  { value: "referido_cliente", label: "Referido cliente" },
  { value: "llamada_entrante", label: "Llamada entrante" },
  { value: "visita_oficina", label: "Visita oficina" },
  { value: "evento_feria", label: "Evento o feria" },
  { value: "redes_sociales", label: "Redes sociales" },
  { value: "importacion", label: "Importación" },
] as const;

const PHONE_LINE_TYPE_OPTIONS = [
  { value: "movil", label: "Móvil" },
  { value: "fijo", label: "Fijo" },
] as const;

function getTodayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function normalizePersonaEstado(value: string | null | undefined): "activo" | "inactivo" {
  return value === "inactivo" ? "inactivo" : "activo";
}

const INITIAL_STATE: ContactCreateState = {
  mode: "solo_persona",
  persona: {
    codigo_contacto: "",
    nombre: "",
    apellido_paterno: "",
    apellido_materno: "",
    correo_principal: "",
    correo_secundario: "",
    correo_institucional: "",
    correo_personal_3: "",
    telefono_principal_e164: "",
    telefono_principal_tipo_linea: "movil",
    telefono_principal_extension: "",
    telefono_movil_1_e164: "",
    telefono_movil_1_tipo_linea: "movil",
    telefono_movil_2_e164: "",
    telefono_movil_2_tipo_linea: "movil",
    telefono_movil_2_extension: "",
    telefono_secundario_e164: "",
    telefono_secundario_tipo_linea: "movil",
    telefono_secundario_extension: "",
    telefono_empresa_1_e164: "",
    telefono_empresa_1_extension: "",
    telefono_empresa_2_e164: "",
    telefono_empresa_2_extension: "",
    puesto: "",
    area: "",
    rol_decision: "",
    estado: "activo",
    origen: "",
    notas: "",
    propietario_usuario_id: "",
  },
  cuenta: {
    cuenta_id: "",
    nombre_comercial: "",
    razon_social: "",
    alias: "",
    tipo_persona: "",
    tipo_cuenta: "empresa",
    tipo: "empresa",
    codigo_cuenta: "",
    rfc: "",
    industria: "",
    segmento: "",
    tamano: "",
    sitio_web: "",
    correo_principal: "",
    correo_secundario: "",
    telefono_principal: "",
    telefono_principal_e164: "",
    telefono_principal_tipo_linea: "movil",
    telefono_principal_extension: "",
    telefono_secundario_e164: "",
    telefono_secundario_tipo_linea: "movil",
    telefono_secundario_extension: "",
    correo: "",
    telefono: "",
    notas: "",
    necesidad_proposito: "",
    tipo_establecimiento: "",
    fecha_incorporacion: "",
    latitud: "",
    longitud: "",
  },
  relacion: {
    rol_en_cuenta: "",
    es_contacto_principal: true,
    es_contacto_facturacion: false,
    es_representante_legal: false,
    activo: true,
    fecha_inicio: "",
    fecha_fin: "",
    notas: "",
  },
  extras: {
    tipo: "principal",
    regimen_capital: "",
    uso_cfdi: "",
    forma_pago: "",
    metodo_pago: "",
    email_facturacion: "",
    pais: "MX",
    clave_entidad: "",
    entidad: "",
    clave_municipio: "",
    municipio: "",
    clave_localidad: "",
    localidad: "",
    tipo_vialidad: "",
    nombre_vialidad: "",
    numero_exterior: "",
    letra_exterior: "",
    edificio: "",
    edificio_piso: "",
    numero_interior: "",
    letra_interior: "",
    tipo_asentamiento: "",
    colonia: "",
    tipo_centro_comercial: "",
    corredor_industrial: "",
    numero_local: "",
    codigo_postal: "",
  },
  extrasOpen: false,
  accountQuery: "",
  accountResults: [],
  accountLoading: false,
  accountError: null,
  saving: false,
  error: null,
};

function createReducer(state: ContactCreateState, action: ContactCreateAction): ContactCreateState {
  switch (action.type) {
    case "reset":
      return INITIAL_STATE;
    case "mode/set": {
      const nextType = action.mode === "persona_fisica_actividad_empresarial" ? "persona_fisica_actividad_empresarial" : "empresa";
      const nextState: ContactCreateState = {
        ...state,
        mode: action.mode,
        error: null,
        accountError: null,
        cuenta: {
          ...state.cuenta,
          cuenta_id: action.mode === "solo_persona" ? "" : action.mode === "empresa_nueva" ? "" : state.cuenta.cuenta_id,
          codigo_cuenta: action.mode === "solo_persona" || action.mode === "empresa_nueva" ? "" : state.cuenta.codigo_cuenta,
          tipo: action.mode === "solo_persona" ? "" : nextType,
          tipo_cuenta: action.mode === "solo_persona" ? "" : nextType,
          tipo_persona: action.mode === "solo_persona" ? "" : getPersonaTypeFromAccountType(nextType),
          alias:
            action.mode === "persona_fisica_actividad_empresarial"
              ? state.cuenta.alias || buildFullName(state.persona)
              : state.cuenta.alias,
          razon_social:
            action.mode === "persona_fisica_actividad_empresarial"
              ? state.cuenta.razon_social || buildFullName(state.persona)
              : state.cuenta.razon_social,
          nombre_comercial:
            action.mode === "persona_fisica_actividad_empresarial"
              ? state.cuenta.nombre_comercial || buildFullName(state.persona)
              : state.cuenta.nombre_comercial,
        },
      };
      if (action.mode === "solo_persona") {
        nextState.cuenta = { ...INITIAL_STATE.cuenta };
        nextState.relacion = { ...INITIAL_STATE.relacion };
        nextState.accountQuery = "";
        nextState.accountResults = [];
      }
      if (action.mode === "persona_fisica_actividad_empresarial") {
        nextState.relacion = {
          ...state.relacion,
          rol_en_cuenta: state.relacion.rol_en_cuenta || "dueno",
          es_contacto_principal: true,
          es_representante_legal: true,
          activo: true,
        };
      }
      if (action.mode === "empresa_nueva" || action.mode === "empresa_existente") {
        nextState.relacion = {
          ...state.relacion,
          rol_en_cuenta: state.relacion.rol_en_cuenta || "contacto_principal",
        };
      }
      return nextState;
    }
    case "persona/set":
      return {
        ...state,
        persona: { ...state.persona, [action.field]: action.value },
      };
    case "cuenta/set":
      return {
        ...state,
        cuenta: { ...state.cuenta, [action.field]: action.value },
      };
    case "relacion/set":
      return {
        ...state,
        relacion: { ...state.relacion, [action.field]: action.value },
      };
    case "extras/set":
      return {
        ...state,
        extras: { ...state.extras, [action.field]: action.value },
      };
    case "extras/toggle":
      return {
        ...state,
        extrasOpen: action.value ?? !state.extrasOpen,
      };
    case "account-query/set":
      return {
        ...state,
        accountQuery: action.value,
      };
    case "account-search/start":
      return {
        ...state,
        accountLoading: true,
        accountError: null,
      };
    case "account-search/success":
      return {
        ...state,
        accountLoading: false,
        accountResults: action.items,
        accountError: null,
      };
    case "account-search/error":
      return {
        ...state,
        accountLoading: false,
        accountError: action.message,
      };
    case "account/select": {
      const selectedType = action.account.tipo === "persona_fisica_actividad_empresarial" ? "persona_fisica_actividad_empresarial" : "empresa";
      return {
        ...state,
        cuenta: {
          ...state.cuenta,
          cuenta_id: action.account.id,
          nombre_comercial: action.account.nombre,
          codigo_cuenta: action.account.codigo_cuenta ?? state.cuenta.codigo_cuenta,
          tipo: selectedType,
          tipo_cuenta: selectedType,
          tipo_persona: getPersonaTypeFromAccountType(selectedType),
          correo_principal: action.account.correo_principal ?? action.account.correo ?? state.cuenta.correo_principal,
          correo_secundario: action.account.correo_secundario ?? state.cuenta.correo_secundario,
          telefono_principal_e164: sanitizePhoneInput(
            action.account.telefono_principal_e164 ?? action.account.telefono ?? state.cuenta.telefono_principal_e164,
          ),
          telefono_principal: sanitizePhoneInput(
            action.account.telefono_principal_e164 ?? action.account.telefono ?? state.cuenta.telefono_principal,
          ),
          telefono_secundario_e164: sanitizePhoneInput(action.account.telefono_secundario_e164 ?? state.cuenta.telefono_secundario_e164),
        },
        relacion: {
          ...state.relacion,
          rol_en_cuenta: state.relacion.rol_en_cuenta || "contacto_principal",
        },
      };
    }
    case "saving/set":
      return {
        ...state,
        saving: action.value,
      };
    case "error/set":
      return {
        ...state,
        error: action.value,
      };
    default:
      return state;
  }
}

function buildFullName(persona: PersonaDraft): string {
  return [persona.nombre.trim(), persona.apellido_paterno.trim(), persona.apellido_materno.trim()]
    .filter(Boolean)
    .join(" ")
    .trim();
}

function cleanObject<T extends Record<string, unknown>>(input: T): Partial<T> {
  const next = Object.entries(input).reduce<Record<string, unknown>>((acc, [key, value]) => {
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed) acc[key] = trimmed;
      return acc;
    }
    if (typeof value === "boolean") {
      acc[key] = value;
      return acc;
    }
    if (value !== null && value !== undefined) {
      acc[key] = value;
    }
    return acc;
  }, {});
  return next as Partial<T>;
}

function getAccountTypeFromMode(mode: CreateMode): "empresa" | "persona_fisica_actividad_empresarial" {
  return mode === "persona_fisica_actividad_empresarial" ? "persona_fisica_actividad_empresarial" : "empresa";
}

function resolveAccountType(
  mode: CreateMode,
  accountType: string,
): "empresa" | "persona_fisica_actividad_empresarial" {
  return accountType === "persona_fisica_actividad_empresarial" ? "persona_fisica_actividad_empresarial" : getAccountTypeFromMode(mode);
}

function getPersonaTypeFromAccountType(accountType: "empresa" | "persona_fisica_actividad_empresarial") {
  return accountType === "persona_fisica_actividad_empresarial" ? "fisica" : "moral";
}

function buildPayload(state: ContactCreateState, dedupe?: DedupeDecision, currentUserId?: string | null) {
  const nombreCompleto = buildFullName(state.persona);
  const persona = cleanObject({
    ...state.persona,
    nombre_nombres: state.persona.nombre.trim(),
    nombre_completo: nombreCompleto || state.persona.nombre.trim(),
    correo_institucional: state.persona.correo_institucional,
    correo_secundario: state.persona.correo_secundario,
    propietario_usuario_id: state.persona.propietario_usuario_id || currentUserId || undefined,
    estado: normalizePersonaEstado(state.persona.estado),
  });

  const accountType = resolveAccountType(state.mode, state.cuenta.tipo);
  const cuentaBase = cleanObject({
    ...state.cuenta,
    razon_social:
      accountType === "persona_fisica_actividad_empresarial"
        ? state.cuenta.razon_social || nombreCompleto
        : state.cuenta.razon_social,
    nombre_comercial:
      accountType === "persona_fisica_actividad_empresarial"
        ? state.cuenta.nombre_comercial || nombreCompleto
        : state.cuenta.nombre_comercial,
    alias: state.cuenta.alias,
    tipo_persona: getPersonaTypeFromAccountType(accountType),
    tipo_cuenta: accountType,
    tipo: accountType,
    rfc: sanitizeRfcInput(state.cuenta.rfc),
    tamano: state.cuenta.tamano,
    correo_principal: state.cuenta.correo_principal || state.cuenta.correo,
    correo_secundario: state.cuenta.correo_secundario,
    telefono_principal_e164:
      sanitizePhoneInput(state.cuenta.telefono_principal_e164) ||
      sanitizePhoneInput(state.cuenta.telefono_principal) ||
      sanitizePhoneInput(state.cuenta.telefono),
    telefono_principal_tipo_linea: state.cuenta.telefono_principal_tipo_linea,
    telefono_principal_extension: sanitizePhoneInput(state.cuenta.telefono_principal_extension),
    telefono_secundario_e164: sanitizePhoneInput(state.cuenta.telefono_secundario_e164),
    telefono_secundario_tipo_linea: state.cuenta.telefono_secundario_tipo_linea,
    telefono_secundario_extension: sanitizePhoneInput(state.cuenta.telefono_secundario_extension),
    correo: state.cuenta.correo || state.cuenta.correo_principal,
    telefono:
      sanitizePhoneInput(state.cuenta.telefono) ||
      sanitizePhoneInput(state.cuenta.telefono_principal_e164) ||
      sanitizePhoneInput(state.cuenta.telefono_principal),
    necesidad_proposito: state.cuenta.necesidad_proposito,
    tipo_establecimiento: state.cuenta.tipo_establecimiento,
    fecha_incorporacion: state.cuenta.fecha_incorporacion || undefined,
    latitud: state.cuenta.latitud || undefined,
    longitud: state.cuenta.longitud || undefined,
    propietario_usuario_id: currentUserId || undefined,
  });

  const relacion =
    state.mode === "solo_persona"
      ? null
      : cleanObject({
          ...state.relacion,
          rol_en_cuenta:
            state.relacion.rol_en_cuenta ||
            (state.mode === "persona_fisica_actividad_empresarial" ? "dueno" : "contacto_principal"),
          es_contacto_principal:
            state.mode === "persona_fisica_actividad_empresarial"
              ? true
              : state.relacion.es_contacto_principal,
          es_representante_legal:
            state.mode === "persona_fisica_actividad_empresarial"
              ? true
              : state.relacion.es_representante_legal,
        });

  const extras = cleanObject({
    fiscales: cleanObject({
      regimen_capital: state.extras.regimen_capital,
      uso_cfdi: state.extras.uso_cfdi,
      forma_pago: state.extras.forma_pago,
      metodo_pago: state.extras.metodo_pago,
      email_facturacion: state.extras.email_facturacion,
    }),
    direccion: cleanObject({
      tipo: state.extras.tipo,
      pais: state.extras.pais,
      clave_entidad: state.extras.clave_entidad,
      entidad: state.extras.entidad,
      clave_municipio: state.extras.clave_municipio,
      municipio: state.extras.municipio,
      clave_localidad: state.extras.clave_localidad,
      localidad: state.extras.localidad,
      tipo_vialidad: state.extras.tipo_vialidad,
      nombre_vialidad: state.extras.nombre_vialidad,
      numero_exterior: state.extras.numero_exterior,
      letra_exterior: state.extras.letra_exterior,
      edificio: state.extras.edificio,
      edificio_piso: state.extras.edificio_piso,
      numero_interior: state.extras.numero_interior,
      letra_interior: state.extras.letra_interior,
      tipo_asentamiento: state.extras.tipo_asentamiento,
      colonia: state.extras.colonia || null,
      tipo_centro_comercial: state.extras.tipo_centro_comercial,
      corredor_industrial: state.extras.corredor_industrial,
      numero_local: state.extras.numero_local,
      codigo_postal: state.extras.codigo_postal,
    }),
  });

  return {
    persona,
    contexto_comercial: {
      modo: state.mode,
      usar_cuenta_existente: state.mode === "empresa_existente",
      crear_cuenta_nueva:
        state.mode === "empresa_nueva" || state.mode === "persona_fisica_actividad_empresarial",
      es_persona_fisica_actividad_empresarial: state.mode === "persona_fisica_actividad_empresarial",
    },
    cuenta: state.mode === "solo_persona" ? null : cuentaBase,
    relacion,
    extras,
    dedupe: dedupe
      ? cleanObject({
          confirmar_creacion: dedupe.confirmar_creacion ?? false,
          persona_reutilizar_id: dedupe.persona_reutilizar_id ?? "",
          cuenta_reutilizar_id: dedupe.cuenta_reutilizar_id ?? "",
        })
      : undefined,
  };
}

function validateState(state: ContactCreateState): string | null {
  if (!state.persona.nombre.trim()) return "El nombre es obligatorio.";
  if (!state.persona.apellido_paterno.trim()) return "El apellido paterno es obligatorio.";
  if (!state.persona.origen.trim()) return "Selecciona el origen del contacto.";
  if (!state.persona.correo_principal.trim()) return "El correo 1 principal es obligatorio.";
  if (!state.persona.telefono_principal_e164.trim()) return "El teléfono principal es obligatorio.";
  if (state.mode === "empresa_existente" && !state.cuenta.cuenta_id.trim()) {
    return "Selecciona una empresa existente.";
  }
  if (
    (state.mode === "empresa_nueva" || state.mode === "persona_fisica_actividad_empresarial") &&
    !state.cuenta.nombre_comercial.trim() &&
    !state.cuenta.razon_social.trim()
  ) {
    return "La empresa requiere nombre comercial o razón social.";
  }
  const accountType = resolveAccountType(state.mode, state.cuenta.tipo);
  if (!isValidRfcLength(state.cuenta.rfc, accountType)) {
    return getRfcLengthMessage(accountType);
  }
  return null;
}

function FormSection({
  title,
  description,
  required = false,
  children,
}: {
  title: string;
  description?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4 rounded-xl border border-border/60 bg-muted/20 p-4 shadow-sm">
      <div className="space-y-1">
        <h3 className="flex items-center gap-1 text-sm font-semibold leading-none">
          <span>{title}</span>
          {required ? <span aria-hidden="true" className="text-destructive">*</span> : null}
          {required ? <span className="sr-only">obligatorio</span> : null}
        </h3>
        {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

function Field({
  label,
  children,
  hint,
  required = false,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
  required?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label>
        <span>{label}</span>
        {required ? <span aria-hidden="true" className="text-destructive">*</span> : null}
        {required ? <span className="sr-only">obligatorio</span> : null}
      </Label>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      {children}
    </div>
  );
}

export function ContactCreateFlow({ open, onOpenChange, onCreated, initialMode = "empresa_nueva" }: ContactCreateFlowProps) {
  const [state, dispatch] = React.useReducer(createReducer, INITIAL_STATE);
  const [hasSelectedFlow, setHasSelectedFlow] = React.useState(false);
  const { context: permissionContext } = usePermissions();
  const deferredAccountQuery = React.useDeferredValue(state.accountQuery);
  const [pendingDedupe, setPendingDedupe] = React.useState<PersonaAltaValidationResponse | null>(null);
  const [selectedPersonaReuseId, setSelectedPersonaReuseId] = React.useState("");
  const [selectedCuentaReuseId, setSelectedCuentaReuseId] = React.useState("");
  const [copyingDedupe, setCopyingDedupe] = React.useState(false);
  const [validationNotice, setValidationNotice] = React.useState<ValidationNoticeState | null>(null);
  const tenantCatalogs = useTenantContactCatalogs();
  const currentUserId = permissionContext.usuario_id?.trim() || null;
  const previousPfaeNameRef = React.useRef("");
  const entryOptions = React.useMemo<CreateEntryOption[]>(
    () => [
      {
        mode: "solo_persona",
        title: "Crear contacto",
        description: "Crea un contacto sin vincularlo a una empresa.",
      },
      {
        mode: "empresa_existente",
        title: "Vincular contacto a empresa",
        description: "Crea el contacto y relaciónalo con una empresa ya registrada.",
      },
      {
        mode: "empresa_nueva",
        title: "Crear contacto y empresa nueva",
        description: "Crea el contacto y una nueva cuenta tipo Moral o PFAE.",
      },
    ],
    [],
  );

  React.useEffect(() => {
    if (!open) {
      dispatch({ type: "reset" });
      setHasSelectedFlow(false);
      setPendingDedupe(null);
      setSelectedPersonaReuseId("");
      setSelectedCuentaReuseId("");
      setValidationNotice(null);
      return;
    }
    dispatch({ type: "reset" });
    dispatch({ type: "mode/set", mode: initialMode });
  }, [open, initialMode]);

  React.useEffect(() => {
    if (!open) return;
    if (state.persona.codigo_contacto.trim()) return;

    const controller = new AbortController();
    const run = async () => {
      try {
        const response = await fetch("/api/personas/codigo-siguiente", {
          cache: "no-store",
          signal: controller.signal,
        });
        const body = (await response.json().catch(() => ({}))) as { codigo_contacto?: string | null };
        if (!response.ok) return;
        const codigo = typeof body.codigo_contacto === "string" ? body.codigo_contacto.trim() : "";
        if (codigo) {
          dispatch({ type: "persona/set", field: "codigo_contacto", value: codigo });
        }
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          return;
        }
      }
    };

    run();
    return () => controller.abort();
  }, [open, state.persona.codigo_contacto]);

  React.useEffect(() => {
    if (state.mode !== "empresa_existente") return;
    const query = deferredAccountQuery.trim();
    if (query.length < 2) {
      dispatch({ type: "account-search/success", items: [] });
      return;
    }

    const controller = new AbortController();
    const run = async () => {
      dispatch({ type: "account-search/start" });
      try {
        const response = await fetch(`/api/personas/cuentas?q=${encodeURIComponent(query)}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const body = (await response.json().catch(() => ({}))) as {
          items?: AccountOption[];
          error?: string;
        };
        if (!response.ok) {
          dispatch({
            type: "account-search/error",
            message: body.error || "No se pudieron buscar cuentas.",
          });
          return;
        }
        dispatch({
          type: "account-search/success",
          items: Array.isArray(body.items) ? body.items : [],
        });
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          dispatch({
            type: "account-search/error",
            message: "No se pudieron buscar cuentas.",
          });
        }
      }
    };

    run();
    return () => controller.abort();
  }, [deferredAccountQuery, state.mode]);

  React.useEffect(() => {
    const fullName = buildFullName(state.persona);
    const previousDerivedName = previousPfaeNameRef.current;
    if (state.mode === "persona_fisica_actividad_empresarial") {
      const currentReasonName = state.cuenta.razon_social.trim();
      if ((!currentReasonName || currentReasonName === previousDerivedName) && currentReasonName !== fullName) {
        dispatch({ type: "cuenta/set", field: "razon_social", value: fullName });
      }
    }
    previousPfaeNameRef.current = fullName;
  }, [
    state.mode,
    state.persona.nombre,
    state.persona.apellido_paterno,
    state.persona.apellido_materno,
    state.cuenta.razon_social,
  ]);

  const dedupeClipboardText = React.useMemo(() => buildDedupeClipboardText(pendingDedupe), [pendingDedupe]);

  const copyDedupeSummary = React.useCallback(async () => {
    if (!dedupeClipboardText) return;
    try {
      setCopyingDedupe(true);
      await navigator.clipboard.writeText(dedupeClipboardText);
      toast.success("Aviso copiado");
    } catch {
      toast.error("No se pudo copiar el texto");
    } finally {
      setCopyingDedupe(false);
    }
  }, [dedupeClipboardText]);

  const isContactMode = state.mode === "empresa_existente";
  const isCompanyMode = state.mode === "empresa_nueva";
  const isPfaeMode = state.mode === "persona_fisica_actividad_empresarial";
  const isSelectionScreen = !hasSelectedFlow;
  const accountTypeLabel = isPfaeMode ? "Persona física con actividad empresarial" : "Persona moral";
  const selectedEntryMode: CreateMode = isPfaeMode ? "empresa_nueva" : state.mode;
  const selectedEntry = entryOptions.find((option) => option.mode === selectedEntryMode) ?? entryOptions[0];
  const puestoOptions = React.useMemo(
    () => mergeCatalogOptions(tenantCatalogs.puestoOptions, state.persona.puesto),
    [state.persona.puesto, tenantCatalogs.puestoOptions],
  );
  const rolDecisionOptions = React.useMemo(
    () => mergeCatalogOptions(tenantCatalogs.rolDecisionOptions, state.persona.rol_decision),
    [state.persona.rol_decision, tenantCatalogs.rolDecisionOptions],
  );
  const clasificacionNegocioOptions = React.useMemo(
    () => mergeCatalogOptions(tenantCatalogs.clasificacionNegocioOptions, state.cuenta.tipo_establecimiento),
    [state.cuenta.tipo_establecimiento, tenantCatalogs.clasificacionNegocioOptions],
  );
  const tamanoOptions = React.useMemo(
    () => mergeCatalogOptions(tenantCatalogs.tamanoOptions, state.cuenta.tamano),
    [state.cuenta.tamano, tenantCatalogs.tamanoOptions],
  );
  const usoCfdiOptions = React.useMemo(
    () => mergeCatalogOptions(tenantCatalogs.usoCfdiOptions, state.extras.uso_cfdi),
    [state.extras.uso_cfdi, tenantCatalogs.usoCfdiOptions],
  );
  const formaPagoOptions = React.useMemo(
    () => mergeCatalogOptions(tenantCatalogs.formaPagoOptions, state.extras.forma_pago),
    [state.extras.forma_pago, tenantCatalogs.formaPagoOptions],
  );
  const metodoPagoOptions = React.useMemo(
    () => mergeCatalogOptions(tenantCatalogs.metodoPagoOptions, state.extras.metodo_pago),
    [state.extras.metodo_pago, tenantCatalogs.metodoPagoOptions],
  );
  const rfcHint = React.useMemo(
    () => getRfcLengthMessage(isPfaeMode ? "persona_fisica_actividad_empresarial" : "empresa"),
    [isPfaeMode],
  );

  React.useEffect(() => {
    const desiredPrefix = isPfaeMode ? "PFAE-" : "Emp-";
    if (!isCompanyMode && !isPfaeMode) {
      if (!state.cuenta.cuenta_id && state.cuenta.codigo_cuenta) {
        dispatch({ type: "cuenta/set", field: "codigo_cuenta", value: "" });
      }
      return;
    }
    if (!state.cuenta.cuenta_id && state.cuenta.codigo_cuenta.startsWith(desiredPrefix)) {
      return;
    }
    if (state.cuenta.cuenta_id) {
      return;
    }

    const controller = new AbortController();
    const run = async () => {
      try {
        const response = await fetch(
          `/api/personas/cuentas/codigo-siguiente?tipo=${encodeURIComponent(
            isPfaeMode ? "persona_fisica_actividad_empresarial" : "empresa",
          )}`,
          {
            cache: "no-store",
            signal: controller.signal,
          },
        );
        const body = (await response.json().catch(() => ({}))) as { codigo_cuenta?: string | null };
        if (!response.ok) return;
        dispatch({ type: "cuenta/set", field: "codigo_cuenta", value: body.codigo_cuenta ?? "" });
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          return;
        }
      }
    };

    run();
    return () => controller.abort();
  }, [isCompanyMode, isPfaeMode, state.cuenta.cuenta_id, state.cuenta.codigo_cuenta]);

  const personSectionTitle =
    isContactMode
      ? "Datos del contacto"
      : isPfaeMode
        ? "Datos de la persona física"
        : "Datos del contacto";
  const personSectionDescription =
    isContactMode
      ? "Captura la persona y su vínculo con una empresa ya existente."
      : isCompanyMode
        ? "Captura la persona responsable y los datos de la nueva empresa moral."
        : isPfaeMode
          ? "Captura la persona y su nuevo registro fiscal como PFAE en un solo flujo."
          : "Captura la información principal del contacto.";
  const relationSectionTitle =
    isPfaeMode
      ? "Vínculo principal"
      : "Vinculación con empresa";
  const relationSectionDescription =
    isPfaeMode
      ? "La relación principal se creará automáticamente al guardar."
      : "Define el rol real de la persona dentro de la empresa.";

  const submitLabel = "Guardar contacto";

  const submit = async (dedupeDecision?: DedupeDecision) => {
    const validationError = validateState(state);
    if (validationError) {
      if (validationError === "Selecciona una empresa existente.") {
        dispatch({ type: "error/set", value: null });
        setValidationNotice({
          open: true,
          title: "Falta vincular una empresa",
          message: validationError,
        });
      } else {
        dispatch({ type: "error/set", value: validationError });
        toast.error(validationError);
      }
      return;
    }

    dispatch({ type: "saving/set", value: true });
    dispatch({ type: "error/set", value: null });
    try {
      const payload = buildPayload(state, dedupeDecision, currentUserId);
      if (!dedupeDecision) {
        const previewResponse = await fetch("/api/personas/alta/validar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const previewBody = (await previewResponse.json().catch(() => ({}))) as
          | PersonaAltaValidationResponse
          | { error?: string };
        if (!previewResponse.ok) {
          throw new Error((previewBody as { error?: string }).error || `Error ${previewResponse.status}`);
        }
        const preview = previewBody as PersonaAltaValidationResponse;
        if (preview.requiere_confirmacion) {
          setPendingDedupe(preview);
          setSelectedPersonaReuseId(preview.sugerencia_persona_reutilizar_id ?? "");
          setSelectedCuentaReuseId(preview.sugerencia_cuenta_reutilizar_id ?? "");
          toast.warning("Se detectaron posibles duplicados. Confirma cómo continuar.");
          return;
        }
      }

      const response = await fetch("/api/personas/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await response.json().catch(() => ({}))) as PersonaAltaResponse & { error?: string };
      if (!response.ok) {
        throw new Error(body.error || `Error ${response.status}`);
      }
      setPendingDedupe(null);
      setSelectedPersonaReuseId("");
      setSelectedCuentaReuseId("");
      const resumen = body.resumen ?? {};
      if (resumen.deduplicado && resumen.contacto_reutilizado_id) {
        toast.info(`Se reutilizó contacto existente (${resumen.contacto_reutilizado_id}).`);
      }
      if (resumen.cuenta_reutilizada_id) {
        toast.info(`Se reutilizó cuenta existente (${resumen.cuenta_reutilizada_id}).`);
      }
      toast.success("Alta creada.");
      const createdId = body.persona?.id?.trim() || resumen.contacto_reutilizado_id || "";
      onOpenChange(false);
      if (createdId) {
        onCreated?.(createdId);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo guardar.";
      dispatch({ type: "error/set", value: message });
      toast.error(message);
    } finally {
      dispatch({ type: "saving/set", value: false });
    }
  };

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-7xl">
        <DialogHeader className="space-y-2">
          <DialogTitle>Nuevo contacto</DialogTitle>
        </DialogHeader>

        <div className="grid gap-6">
          {isSelectionScreen ? (
            <div className="grid gap-4">
              <p className="text-sm text-muted-foreground">Selecciona cómo quieres dar de alta el contacto.</p>
              <div className="grid gap-3 md:grid-cols-3">
                {entryOptions.map((option) => (
                  <button
                    key={option.title}
                    type="button"
                    className="rounded-2xl border border-border/70 bg-background px-5 py-5 text-left transition hover:border-foreground/40 hover:bg-muted/40"
                    onClick={() => {
                      dispatch({ type: "mode/set", mode: option.mode });
                      setHasSelectedFlow(true);
                    }}
                  >
                    <div className="text-sm font-semibold">{option.title}</div>
                    <div className="mt-2 text-sm text-muted-foreground">{option.description}</div>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {!isSelectionScreen ? (
          <div className="space-y-5">
          <div className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-muted/20 px-4 py-3">
            <div>
              <div className="text-sm font-medium">{selectedEntry.title}</div>
              <div className="text-xs text-muted-foreground">{selectedEntry.description}</div>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => setHasSelectedFlow(false)}>
              Cambiar opción
            </Button>
          </div>
          {isCompanyMode || isPfaeMode ? (
          <FormSection title="Tipo de cuenta" description="El contacto se crea junto con una cuenta nueva. Define si será Moral o PFAE." required>
            <div className="grid gap-3 md:max-w-sm">
              <Field label="Tipo de cuenta a crear" required>
                <Select
                  value={isPfaeMode ? "persona_fisica_actividad_empresarial" : "empresa"}
                  onValueChange={(value) =>
                    dispatch({
                      type: "mode/set",
                      mode:
                        value === "persona_fisica_actividad_empresarial"
                          ? "persona_fisica_actividad_empresarial"
                          : "empresa_nueva",
                    })
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Selecciona un tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="empresa">Moral</SelectItem>
                    <SelectItem value="persona_fisica_actividad_empresarial">PFAE</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>
          </FormSection>
          ) : null}

          <FormSection title={personSectionTitle} description={personSectionDescription}>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field label="Nombre" required>
                <Input value={state.persona.nombre} onChange={(e) => dispatch({ type: "persona/set", field: "nombre", value: e.target.value })} />
              </Field>
              <Field label="Apellido paterno" required>
                <Input value={state.persona.apellido_paterno} onChange={(e) => dispatch({ type: "persona/set", field: "apellido_paterno", value: e.target.value })} />
              </Field>
              <Field label="Apellido materno">
                <Input value={state.persona.apellido_materno} onChange={(e) => dispatch({ type: "persona/set", field: "apellido_materno", value: e.target.value })} />
              </Field>
              <Field label="ID de contacto">
                <Input value={state.persona.codigo_contacto || "Se generará automáticamente"} readOnly disabled className="bg-muted" />
              </Field>
              <Field label="Correo 1 principal" required>
                <Input value={state.persona.correo_principal} onChange={(e) => dispatch({ type: "persona/set", field: "correo_principal", value: e.target.value })} />
              </Field>
              <Field label="Correo 2" hint="Opcional">
                <Input value={state.persona.correo_institucional} onChange={(e) => dispatch({ type: "persona/set", field: "correo_institucional", value: e.target.value })} />
              </Field>
              <Field label="Teléfono principal" required>
                <div className="space-y-2">
                  <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_160px]">
                    <Input
                      value={state.persona.telefono_principal_e164}
                      inputMode="numeric"
                      pattern="[0-9]*"
                      onChange={(e) =>
                        dispatch({ type: "persona/set", field: "telefono_principal_e164", value: sanitizePhoneInput(e.target.value) })
                      }
                    />
                    <Select
                      value={state.persona.telefono_principal_tipo_linea || "movil"}
                      onValueChange={(value) => dispatch({ type: "persona/set", field: "telefono_principal_tipo_linea", value })}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Tipo de línea" />
                      </SelectTrigger>
                      <SelectContent>
                        {PHONE_LINE_TYPE_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {state.persona.telefono_principal_tipo_linea === "fijo" ? (
                    <Input
                      placeholder="Extensión"
                      value={state.persona.telefono_principal_extension}
                      inputMode="numeric"
                      pattern="[0-9]*"
                      onChange={(e) =>
                        dispatch({ type: "persona/set", field: "telefono_principal_extension", value: sanitizePhoneInput(e.target.value) })
                      }
                    />
                  ) : null}
                </div>
              </Field>
              <Field label="Teléfono 2" hint="Opcional">
                <div className="space-y-2">
                  <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_160px]">
                    <Input
                      value={state.persona.telefono_movil_2_e164}
                      inputMode="numeric"
                      pattern="[0-9]*"
                      onChange={(e) => dispatch({ type: "persona/set", field: "telefono_movil_2_e164", value: sanitizePhoneInput(e.target.value) })}
                    />
                    <Select
                      value={state.persona.telefono_movil_2_tipo_linea || "movil"}
                      onValueChange={(value) => dispatch({ type: "persona/set", field: "telefono_movil_2_tipo_linea", value })}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Tipo de línea" />
                      </SelectTrigger>
                      <SelectContent>
                        {PHONE_LINE_TYPE_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {state.persona.telefono_movil_2_tipo_linea === "fijo" ? (
                    <Input
                      placeholder="Extensión"
                      value={state.persona.telefono_movil_2_extension}
                      inputMode="numeric"
                      pattern="[0-9]*"
                      onChange={(e) =>
                        dispatch({ type: "persona/set", field: "telefono_movil_2_extension", value: sanitizePhoneInput(e.target.value) })
                      }
                    />
                  ) : null}
                </div>
              </Field>
              <Field label="Origen" required>
                <Select
                  value={state.persona.origen || ""}
                  onValueChange={(value) => dispatch({ type: "persona/set", field: "origen", value })}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Selecciona origen" />
                  </SelectTrigger>
                  <SelectContent>
                    {PERSONA_ORIGEN_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Puesto">
                <div className="space-y-2">
                  <ContactCatalogSelect
                    value={state.persona.puesto}
                    onValueChange={(value) => dispatch({ type: "persona/set", field: "puesto", value })}
                    options={puestoOptions}
                    placeholder={tenantCatalogs.loading ? "Cargando catálogo..." : "Selecciona un puesto"}
                    disabled={puestoOptions.length === 0}
                    emptyLabel="Configura opciones en Variables"
                  />
                  {!tenantCatalogs.loading && puestoOptions.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Configura los puestos en Variables · Contactos para usar este campo como select.</p>
                  ) : null}
                </div>
              </Field>
              <Field label="Área de trabajo del contacto">
                <Input value={state.persona.area} onChange={(e) => dispatch({ type: "persona/set", field: "area", value: e.target.value })} />
              </Field>
              <Field label="Rol de decisión">
                <div className="space-y-2">
                  <ContactCatalogSelect
                    value={state.persona.rol_decision}
                    onValueChange={(value) => dispatch({ type: "persona/set", field: "rol_decision", value })}
                    options={rolDecisionOptions}
                    placeholder={tenantCatalogs.loading ? "Cargando catálogo..." : "Selecciona un rol"}
                    disabled={rolDecisionOptions.length === 0}
                    emptyLabel="Configura opciones en Variables"
                  />
                  {!tenantCatalogs.loading && rolDecisionOptions.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Configura los roles de decisión en Variables · Contactos para usar este campo como select.</p>
                  ) : null}
                </div>
              </Field>
              <Field label="Estado">
                <Select
                  value={normalizePersonaEstado(state.persona.estado)}
                  onValueChange={(value) => dispatch({ type: "persona/set", field: "estado", value: normalizePersonaEstado(value) })}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Selecciona un estado" />
                  </SelectTrigger>
                  <SelectContent>
                    {PERSONA_ESTADO_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <Field label="Notas">
              <Textarea value={state.persona.notas} onChange={(e) => dispatch({ type: "persona/set", field: "notas", value: e.target.value })} />
            </Field>
          </FormSection>

          {isContactMode ? (
            <FormSection title="Empresa vinculada" description="Busca una empresa ya creada y selecciónala.">
              <div className="space-y-3">
                <Field label="Buscar empresa" hint="Busca por nombre, correo, teléfono o alias." required>
                  <Input value={state.accountQuery} onChange={(e) => dispatch({ type: "account-query/set", value: e.target.value })} placeholder="Escribe al menos 2 caracteres" />
                </Field>
                {state.accountLoading ? <p className="text-xs text-muted-foreground">Buscando empresas...</p> : null}
                {state.accountError ? <p className="text-xs text-destructive">{state.accountError}</p> : null}
                {state.accountResults.length ? (
                  <div className="space-y-2">
                    {state.accountResults.map((account) => {
                      const selected = state.cuenta.cuenta_id === account.id;
                      return (
                        <button
                          key={account.id}
                          type="button"
                          className={`w-full rounded-xl border px-4 py-3 text-left ${selected ? "border-foreground bg-muted/40" : "border-border/60 bg-background"}`}
                          onClick={() => dispatch({ type: "account/select", account })}
                        >
                          <div className="text-sm font-medium">{account.nombre}</div>
                          <div className="text-xs text-muted-foreground">{[account.codigo_cuenta, account.correo_principal, account.telefono_principal_e164].filter(Boolean).join(" · ") || "Sin datos adicionales"}</div>
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            </FormSection>
          ) : null}

          {isCompanyMode || isPfaeMode ? (
            <FormSection
              title={isPfaeMode ? "Cuenta PFAE" : "Empresa moral"}
              description={
                isPfaeMode
                  ? "La razón social se llena con el nombre de la persona y puedes ajustar los datos comerciales del registro PFAE."
                  : "Datos de la empresa moral que se persistirán junto con el contacto."
              }
            >
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Field label="Nombre comercial" required>
                  <Input value={state.cuenta.nombre_comercial} onChange={(e) => dispatch({ type: "cuenta/set", field: "nombre_comercial", value: e.target.value })} />
                </Field>
                <Field label="Razón social" required>
                  <Input value={state.cuenta.razon_social} onChange={(e) => dispatch({ type: "cuenta/set", field: "razon_social", value: e.target.value })} />
                </Field>
                <Field label={isPfaeMode ? "ID de empresa propia" : "ID de empresa"}>
                  <Input
                    value={state.cuenta.codigo_cuenta || "Se generará automáticamente"}
                    readOnly
                    disabled
                    className="bg-muted"
                  />
                </Field>
                <Field label="Tipo de cuenta">
                  <Input value={accountTypeLabel} readOnly disabled className="bg-muted" />
                </Field>
                <div className="md:col-span-2 -mt-2 text-xs text-muted-foreground">
                  {isPfaeMode
                    ? "Al elegir PFAE, la razón social toma el nombre completo de la persona y puedes ajustarla si hace falta."
                    : "El tipo se define por la selección hecha arriba."}
                </div>
                <Field label="RFC" hint={rfcHint}>
                  <Input
                    value={state.cuenta.rfc}
                    maxLength={13}
                    autoCapitalize="characters"
                    onChange={(e) => dispatch({ type: "cuenta/set", field: "rfc", value: sanitizeRfcInput(e.target.value) })}
                  />
                </Field>
                <Field label="Teléfono principal">
                  <div className="space-y-2">
                    <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_160px]">
                      <Input
                        value={state.cuenta.telefono_principal_e164}
                        inputMode="numeric"
                        pattern="[0-9]*"
                        onChange={(e) =>
                          dispatch({ type: "cuenta/set", field: "telefono_principal_e164", value: sanitizePhoneInput(e.target.value) })
                        }
                      />
                      <Select
                        value={state.cuenta.telefono_principal_tipo_linea || "movil"}
                        onValueChange={(value) => dispatch({ type: "cuenta/set", field: "telefono_principal_tipo_linea", value })}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Tipo de línea" />
                        </SelectTrigger>
                        <SelectContent>
                          {PHONE_LINE_TYPE_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {state.cuenta.telefono_principal_tipo_linea === "fijo" ? (
                      <Input
                        placeholder="Extensión"
                        value={state.cuenta.telefono_principal_extension}
                        inputMode="numeric"
                        pattern="[0-9]*"
                        onChange={(e) =>
                          dispatch({ type: "cuenta/set", field: "telefono_principal_extension", value: sanitizePhoneInput(e.target.value) })
                        }
                      />
                    ) : null}
                  </div>
                </Field>
                <Field label="Teléfono 2" hint="Opcional">
                  <div className="space-y-2">
                    <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_160px]">
                      <Input
                        value={state.cuenta.telefono_secundario_e164}
                        inputMode="numeric"
                        pattern="[0-9]*"
                        onChange={(e) =>
                          dispatch({ type: "cuenta/set", field: "telefono_secundario_e164", value: sanitizePhoneInput(e.target.value) })
                        }
                      />
                      <Select
                        value={state.cuenta.telefono_secundario_tipo_linea || "movil"}
                        onValueChange={(value) => dispatch({ type: "cuenta/set", field: "telefono_secundario_tipo_linea", value })}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Tipo de línea" />
                        </SelectTrigger>
                        <SelectContent>
                          {PHONE_LINE_TYPE_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {state.cuenta.telefono_secundario_tipo_linea === "fijo" ? (
                      <Input
                        placeholder="Extensión"
                        value={state.cuenta.telefono_secundario_extension}
                        inputMode="numeric"
                        pattern="[0-9]*"
                        onChange={(e) =>
                          dispatch({ type: "cuenta/set", field: "telefono_secundario_extension", value: sanitizePhoneInput(e.target.value) })
                        }
                      />
                    ) : null}
                  </div>
                </Field>
                <Field label="Sitio web">
                  <Input value={state.cuenta.sitio_web} onChange={(e) => dispatch({ type: "cuenta/set", field: "sitio_web", value: e.target.value })} />
                </Field>
                <Field label="Tamaño">
                  <ContactCatalogSelect
                    value={state.cuenta.tamano}
                    onValueChange={(value) => dispatch({ type: "cuenta/set", field: "tamano", value })}
                    options={tamanoOptions}
                    placeholder={tenantCatalogs.loading ? "Cargando catálogo..." : "Selecciona un tamaño"}
                    disabled={tamanoOptions.length === 0}
                    emptyLabel="Configura tamaños en Extras"
                  />
                </Field>
                <Field label="Clasificación de negocio">
                  <div className="space-y-2">
                    <ContactCatalogSelect
                      value={state.cuenta.tipo_establecimiento}
                      onValueChange={(value) => dispatch({ type: "cuenta/set", field: "tipo_establecimiento", value })}
                      options={clasificacionNegocioOptions}
                      placeholder={tenantCatalogs.loading ? "Cargando catálogo..." : "Selecciona una clasificación"}
                      disabled={clasificacionNegocioOptions.length === 0}
                      emptyLabel="Configura opciones en Cuenta y contactos"
                    />
                    {!tenantCatalogs.loading && clasificacionNegocioOptions.length === 0 ? (
                      <p className="text-xs text-muted-foreground">Configura la clasificación de negocio en Settings · Contactos para usar este campo como select.</p>
                    ) : null}
                  </div>
                </Field>
                <Field label="Fecha de incorporación">
                  <Input type="date" value={state.cuenta.fecha_incorporacion || getTodayIsoDate()} readOnly disabled className="bg-muted" />
                </Field>
                <Field label="Notas">
                  <Textarea value={state.cuenta.notas} onChange={(e) => dispatch({ type: "cuenta/set", field: "notas", value: e.target.value })} />
                </Field>
              </div>
            </FormSection>
          ) : null}

          {isContactMode ? (
            <FormSection title={relationSectionTitle} description={relationSectionDescription}>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Field label="Fecha de inicio">
                  <Input type="date" value={state.relacion.fecha_inicio} onChange={(e) => dispatch({ type: "relacion/set", field: "fecha_inicio", value: e.target.value })} />
                </Field>
                <Field label="Fecha de fin">
                  <Input type="date" value={state.relacion.fecha_fin} onChange={(e) => dispatch({ type: "relacion/set", field: "fecha_fin", value: e.target.value })} />
                </Field>
                <Field label="Notas de relación">
                  <Textarea value={state.relacion.notas} onChange={(e) => dispatch({ type: "relacion/set", field: "notas", value: e.target.value })} />
                </Field>
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <label className="flex items-center gap-3 rounded-lg border border-border/60 px-3 py-2">
                  <Checkbox checked={state.relacion.es_contacto_principal} onCheckedChange={(value) => dispatch({ type: "relacion/set", field: "es_contacto_principal", value: Boolean(value) })} />
                  <span className="text-sm">Contacto principal</span>
                </label>
                <label className="flex items-center gap-3 rounded-lg border border-border/60 px-3 py-2">
                  <Checkbox checked={state.relacion.es_contacto_facturacion} onCheckedChange={(value) => dispatch({ type: "relacion/set", field: "es_contacto_facturacion", value: Boolean(value) })} />
                  <span className="text-sm">Contacto de facturación</span>
                </label>
                <label className="flex items-center gap-3 rounded-lg border border-border/60 px-3 py-2">
                  <Checkbox checked={state.relacion.es_representante_legal} onCheckedChange={(value) => dispatch({ type: "relacion/set", field: "es_representante_legal", value: Boolean(value) })} />
                  <span className="text-sm">Representante legal</span>
                </label>
                <label className="flex items-center gap-3 rounded-lg border border-border/60 px-3 py-2">
                  <Checkbox checked={state.relacion.activo} onCheckedChange={(value) => dispatch({ type: "relacion/set", field: "activo", value: Boolean(value) })} />
                  <span className="text-sm">Vínculo activo</span>
                </label>
              </div>
            </FormSection>
          ) : null}

          {state.mode !== "solo_persona" ? (
            <FormSection title="Direcciones" description="Captura la dirección principal, fiscal o sucursal del registro.">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Field label="Tipo de dirección">
                  <Select value={state.extras.tipo || "principal"} onValueChange={(value) => dispatch({ type: "extras/set", field: "tipo", value })}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Selecciona un tipo" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="principal">Principal</SelectItem>
                      <SelectItem value="fiscal">Fiscal</SelectItem>
                      <SelectItem value="sucursal">Sucursal</SelectItem>
                      <SelectItem value="fiscal_principal">Fiscal + principal</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              </div>
              <div className="mt-4">
              <GeoLocationSelects
                countryCode={state.extras.pais}
                stateCode={state.extras.clave_entidad}
                municipalityCode={state.extras.clave_municipio}
                onCountryChange={(countryCode) => {
                  dispatch({ type: "extras/set", field: "pais", value: countryCode || "MX" });
                  if ((countryCode || "MX") !== "MX") {
                    dispatch({ type: "extras/set", field: "clave_entidad", value: "" });
                    dispatch({ type: "extras/set", field: "entidad", value: "" });
                    dispatch({ type: "extras/set", field: "clave_municipio", value: "" });
                    dispatch({ type: "extras/set", field: "municipio", value: "" });
                  }
                }}
                onStateChange={(stateCode, stateName) => {
                  dispatch({ type: "extras/set", field: "clave_entidad", value: stateCode });
                  dispatch({ type: "extras/set", field: "entidad", value: stateName });
                  dispatch({ type: "extras/set", field: "clave_municipio", value: "" });
                  dispatch({ type: "extras/set", field: "municipio", value: "" });
                }}
                onMunicipalityChange={(municipalityCode, municipalityName) => {
                  dispatch({ type: "extras/set", field: "clave_municipio", value: municipalityCode });
                  dispatch({ type: "extras/set", field: "municipio", value: municipalityName });
                }}
              />
              <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                <Field label="Localidad">
                  <Input value={state.extras.localidad} onChange={(e) => dispatch({ type: "extras/set", field: "localidad", value: e.target.value })} />
                </Field>
                <Field label="Tipo de vialidad">
                  <Input value={state.extras.tipo_vialidad} onChange={(e) => dispatch({ type: "extras/set", field: "tipo_vialidad", value: e.target.value })} />
                </Field>
                <Field label="Nombre de vialidad">
                  <Input value={state.extras.nombre_vialidad} onChange={(e) => dispatch({ type: "extras/set", field: "nombre_vialidad", value: e.target.value })} />
                </Field>
                <Field label="Número exterior">
                  <Input value={state.extras.numero_exterior} onChange={(e) => dispatch({ type: "extras/set", field: "numero_exterior", value: e.target.value })} />
                </Field>
                <Field label="Letra exterior">
                  <Input value={state.extras.letra_exterior} onChange={(e) => dispatch({ type: "extras/set", field: "letra_exterior", value: e.target.value })} />
                </Field>
                <Field label="Edificio">
                  <Input value={state.extras.edificio} onChange={(e) => dispatch({ type: "extras/set", field: "edificio", value: e.target.value })} />
                </Field>
                <Field label="Piso">
                  <Input value={state.extras.edificio_piso} onChange={(e) => dispatch({ type: "extras/set", field: "edificio_piso", value: e.target.value })} />
                </Field>
                <Field label="Número interior">
                  <Input value={state.extras.numero_interior} onChange={(e) => dispatch({ type: "extras/set", field: "numero_interior", value: e.target.value })} />
                </Field>
                <Field label="Letra interior">
                  <Input value={state.extras.letra_interior} onChange={(e) => dispatch({ type: "extras/set", field: "letra_interior", value: e.target.value })} />
                </Field>
                <Field label="Tipo de asentamiento">
                  <Input value={state.extras.tipo_asentamiento} onChange={(e) => dispatch({ type: "extras/set", field: "tipo_asentamiento", value: e.target.value })} />
                </Field>
                <Field label="Colonia">
                  <Input
                    value={state.extras.colonia}
                    onChange={(e) => dispatch({ type: "extras/set", field: "colonia", value: e.target.value })}
                  />
                </Field>
                <Field label="Tipo de centro comercial">
                  <Input value={state.extras.tipo_centro_comercial} onChange={(e) => dispatch({ type: "extras/set", field: "tipo_centro_comercial", value: e.target.value })} />
                </Field>
                <Field label="Corredor industrial">
                  <Input value={state.extras.corredor_industrial} onChange={(e) => dispatch({ type: "extras/set", field: "corredor_industrial", value: e.target.value })} />
                </Field>
                <Field label="Número local">
                  <Input value={state.extras.numero_local} onChange={(e) => dispatch({ type: "extras/set", field: "numero_local", value: e.target.value })} />
                </Field>
                <Field label="Código postal">
                  <Input value={state.extras.codigo_postal} onChange={(e) => dispatch({ type: "extras/set", field: "codigo_postal", value: e.target.value })} />
                </Field>
                <Field label="Latitud">
                  <Input type="number" step="any" value={state.cuenta.latitud} onChange={(e) => dispatch({ type: "cuenta/set", field: "latitud", value: e.target.value })} />
                </Field>
                <Field label="Longitud">
                  <Input type="number" step="any" value={state.cuenta.longitud} onChange={(e) => dispatch({ type: "cuenta/set", field: "longitud", value: e.target.value })} />
                </Field>
              </div>
            </div>
          </FormSection>
          ) : null}

          {state.mode !== "solo_persona" ? (
          <FormSection title="Datos Fiscales" description="Puedes omitirlos por ahora y completarlos más tarde.">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">Datos fiscales, país, estado y municipio con claves reales.</p>
              <Button type="button" variant="outline" size="sm" onClick={() => dispatch({ type: "extras/toggle" })}>
                {state.extrasOpen ? "Ocultar extras" : "Completar extras"}
              </Button>
            </div>
            {state.extrasOpen ? (
              <div className="space-y-4">
                <Field label="Régimen de capital">
                  <Input
                    value={state.extras.regimen_capital}
                    onChange={(e) => dispatch({ type: "extras/set", field: "regimen_capital", value: e.target.value })}
                    placeholder="Ej. Capital variable"
                  />
                </Field>
                <Field label="Uso CFDI">
                  <ContactCatalogSelect
                    value={state.extras.uso_cfdi}
                    onValueChange={(value) => dispatch({ type: "extras/set", field: "uso_cfdi", value })}
                    options={usoCfdiOptions}
                    placeholder="Selecciona un uso CFDI"
                    emptyLabel="Configura los usos CFDI en Extras"
                  />
                </Field>
                <Field label="Forma de pago">
                  <ContactCatalogSelect
                    value={state.extras.forma_pago}
                    onValueChange={(value) => dispatch({ type: "extras/set", field: "forma_pago", value })}
                    options={formaPagoOptions}
                    placeholder="Selecciona una forma de pago"
                    emptyLabel="Configura las formas de pago en Extras"
                  />
                </Field>
                <Field label="Método de pago">
                  <ContactCatalogSelect
                    value={state.extras.metodo_pago}
                    onValueChange={(value) => dispatch({ type: "extras/set", field: "metodo_pago", value })}
                    options={metodoPagoOptions}
                    placeholder="Selecciona un método de pago"
                    emptyLabel="Configura los métodos de pago en Extras"
                  />
                </Field>
                <Field label="Email de facturación">
                  <Input value={state.extras.email_facturacion} onChange={(e) => dispatch({ type: "extras/set", field: "email_facturacion", value: e.target.value })} />
                </Field>
              </div>
            ) : null}
          </FormSection>
          ) : null}


          {state.error ? <p className="text-xs text-destructive">{state.error}</p> : null}

          <div className="flex flex-wrap gap-2">
            <Button type="button" disabled={state.saving} onClick={() => void submit()}>
              {state.saving ? "Guardando..." : submitLabel}
            </Button>
            <Button type="button" variant="outline" disabled={state.saving} onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
          </div>
          </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>

    <Dialog
      open={Boolean(pendingDedupe)}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          setPendingDedupe(null);
          setSelectedPersonaReuseId("");
          setSelectedCuentaReuseId("");
        }
      }}
    >
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader className="text-left">
          <DialogTitle>Coincidencias detectadas</DialogTitle>
          <DialogDescription>
            Revisa si el registro ya existe y en qué tipo de entidad y vendedor quedó guardado.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-medium">Texto copiable</div>
              <Button type="button" variant="outline" size="sm" onClick={() => void copyDedupeSummary()} disabled={copyingDedupe}>
                {copyingDedupe ? "Copiando..." : "Copiar aviso"}
              </Button>
            </div>
            <Textarea
              readOnly
              value={dedupeClipboardText}
              className="mt-3 min-h-48 whitespace-pre-wrap font-mono text-xs"
            />
          </div>

          {pendingDedupe?.candidatos_persona?.length ? (
            <div className="space-y-2">
              <div className="text-sm font-medium">Personas</div>
              {pendingDedupe.candidatos_persona.map((candidate) => {
                const selected = selectedPersonaReuseId === candidate.id;
                return (
                  <button
                    key={`persona-${candidate.id}`}
                    type="button"
                    className={`w-full rounded-xl border px-4 py-3 text-left ${selected ? "border-foreground bg-muted/40" : "border-border/60 bg-background"}`}
                    onClick={() => setSelectedPersonaReuseId(candidate.id)}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-sm font-medium">
                        [{formatDedupeCode(candidate)}] {candidate.nombre || "Sin nombre"}{" "}
                        <span className="text-xs text-muted-foreground">({candidate.nivel || "debil"})</span>
                      </div>
                      <div className="text-xs text-muted-foreground">{formatDedupeRecordType(candidate.tipo_registro)}</div>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {[candidate.correo, candidate.telefono, candidate.empresa].filter(Boolean).join(" · ") || "Sin datos adicionales"}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {candidate.coincidencia_en ? `Coincidencia: ${candidate.coincidencia_en}` : "Coincidencia detectada"}
                      {" · "}
                      {formatDedupeSeller(candidate)}
                    </div>
                  </button>
                );
              })}
            </div>
          ) : null}

          {pendingDedupe?.candidatos_cuenta?.length ? (
            <div className="space-y-2">
              <div className="text-sm font-medium">Cuentas</div>
              {pendingDedupe.candidatos_cuenta.map((candidate) => {
                const selected = selectedCuentaReuseId === candidate.id;
                return (
                  <button
                    key={`cuenta-${candidate.id}`}
                    type="button"
                    className={`w-full rounded-xl border px-4 py-3 text-left ${selected ? "border-foreground bg-muted/40" : "border-border/60 bg-background"}`}
                    onClick={() => setSelectedCuentaReuseId(candidate.id)}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-sm font-medium">
                        [{formatDedupeCode(candidate)}] {candidate.nombre || "Sin nombre"}{" "}
                        <span className="text-xs text-muted-foreground">({candidate.nivel || "debil"})</span>
                      </div>
                      <div className="text-xs text-muted-foreground">{formatDedupeRecordType(candidate.tipo_registro)}</div>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {[candidate.rfc, candidate.correo, candidate.telefono, candidate.alias].filter(Boolean).join(" · ") || "Sin datos adicionales"}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {candidate.coincidencia_en ? `Coincidencia: ${candidate.coincidencia_en}` : "Coincidencia detectada"}
                      {" · "}
                      {formatDedupeSeller(candidate)}
                    </div>
                  </button>
                );
              })}
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              disabled={state.saving}
              onClick={() =>
                void submit({
                  persona_reutilizar_id: selectedPersonaReuseId || undefined,
                  cuenta_reutilizar_id: selectedCuentaReuseId || undefined,
                })
              }
            >
              Reutilizar seleccionados y guardar
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={state.saving}
              onClick={() => {
                setPendingDedupe(null);
                setSelectedPersonaReuseId("");
                setSelectedCuentaReuseId("");
              }}
            >
              Cerrar revisión
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>

    <Dialog
      open={Boolean(validationNotice?.open)}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          setValidationNotice(null);
        }
      }}
    >
      <DialogContent className="sm:max-w-md" showCloseButton={false}>
        <DialogHeader className="text-left">
          <DialogTitle>{validationNotice?.title ?? "Aviso"}</DialogTitle>
          <DialogDescription>{validationNotice?.message ?? ""}</DialogDescription>
        </DialogHeader>
        <div className="mt-4 flex justify-end">
          <Button type="button" onClick={() => setValidationNotice(null)}>
            Entendido
          </Button>
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}
