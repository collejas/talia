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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
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
import { RELATION_ROLE_OPTIONS } from "@/components/contactos/relation-role-options";

type CreateMode =
  | "solo_persona"
  | "empresa_existente"
  | "empresa_nueva"
  | "persona_fisica_actividad_empresarial";

type PersonaDraft = {
  nombre: string;
  apellido_paterno: string;
  apellido_materno: string;
  correo_principal: string;
  telefono_principal_e164: string;
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
  telefono_principal: string;
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
  puesto: string;
  es_contacto_principal: boolean;
  es_contacto_facturacion: boolean;
  es_representante_legal: boolean;
  activo: boolean;
  fecha_inicio: string;
  fecha_fin: string;
  notas: string;
};

type ExtrasDraft = {
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
  nombre_asentamiento: string;
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
  correo?: string | null;
  telefono?: string | null;
};

type DedupeCandidate = {
  id: string;
  nombre?: string | null;
  alias?: string | null;
  empresa?: string | null;
  correo?: string | null;
  telefono?: string | null;
  rfc?: string | null;
  nivel?: "fuerte" | "medio" | "debil" | string;
  motivo?: string | null;
};

type PersonaResponseResumen = {
  deduplicado?: boolean;
  contacto_reutilizado_id?: string | null;
  cuenta_reutilizada_id?: string | null;
};

type PersonaMutationResponse = {
  resumen?: PersonaResponseResumen;
  error?: string;
};

type PersonaValidationResponse = {
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

type ContactDetail = Record<string, unknown>;
type AccountRelation = {
  id: string;
  cuenta_id: string;
  persona_id: string;
  rol_en_cuenta: string;
  puesto: string | null;
  es_contacto_principal: boolean;
  es_contacto_facturacion: boolean;
  es_representante_legal: boolean;
  activo: boolean;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  notas: string | null;
  cuenta_nombre: string;
  cuenta_alias: string | null;
};
type NewRelationDraft = {
  cuenta_id: string;
  rol_en_cuenta: string;
  puesto: string;
  es_contacto_principal: boolean;
  es_contacto_facturacion: boolean;
  es_representante_legal: boolean;
  activo: boolean;
  fecha_inicio: string;
  fecha_fin: string;
  notas: string;
};

type ContactEditState = {
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
  loading: boolean;
  saving: boolean;
  error: string | null;
  loadedId: string | null;
};

type ContactEditAction =
  | { type: "reset" }
  | { type: "hydrate"; personaId: string; detail: ContactDetail }
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
  | { type: "loading/set"; value: boolean }
  | { type: "saving/set"; value: boolean }
  | { type: "error/set"; value: string | null };

type ContactEditFlowProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  personaId: string | null;
  onSaved?: () => void;
};

const PERSONA_ESTADO_OPTIONS = [
  { value: "lead", label: "Lead" },
  { value: "activo", label: "Activo" },
  { value: "inactivo", label: "Inactivo" },
  { value: "bloqueado", label: "Bloqueado" },
  { value: "fusionado", label: "Fusionado" },
] as const;

const INITIAL_STATE: ContactEditState = {
  mode: "solo_persona",
  persona: {
    nombre: "",
    apellido_paterno: "",
    apellido_materno: "",
    correo_principal: "",
    telefono_principal_e164: "",
    puesto: "",
    area: "",
    rol_decision: "",
    estado: "lead",
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
    telefono_principal: "",
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
    puesto: "",
    es_contacto_principal: true,
    es_contacto_facturacion: false,
    es_representante_legal: false,
    activo: true,
    fecha_inicio: "",
    fecha_fin: "",
    notas: "",
  },
  extras: {
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
    nombre_asentamiento: "",
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
  loading: false,
  saving: false,
  error: null,
  loadedId: null,
};

function readString(detail: ContactDetail, key: string): string {
  const value = detail[key];
  return typeof value === "string" ? value : "";
}

function readBool(detail: ContactDetail, key: string, fallback: boolean): boolean {
  const value = detail[key];
  return typeof value === "boolean" ? value : fallback;
}

function formatSummaryLine(parts: Array<string | null | undefined>, fallback: string): string {
  const cleaned = parts
    .map((part) => (typeof part === "string" ? part.trim() : ""))
    .filter((part) => Boolean(part));
  return cleaned.length ? cleaned.join(" · ") : fallback;
}

function inferMode(detail: ContactDetail): CreateMode {
  const cuentaId = readString(detail, "cuenta_id").trim();
  if (!cuentaId) return "solo_persona";
  const tipo = readString(detail, "cuenta_tipo").trim();
  if (tipo === "persona_fisica_actividad_empresarial") return "persona_fisica_actividad_empresarial";
  return "empresa_existente";
}

function buildFullName(persona: PersonaDraft): string {
  return [persona.nombre.trim(), persona.apellido_paterno.trim(), persona.apellido_materno.trim()]
    .filter(Boolean)
    .join(" ")
    .trim();
}

function cleanObject<T extends Record<string, unknown>>(
  input: T,
  options?: { keepEmptyStringsAsNull?: boolean },
): Partial<T> {
  const next = Object.entries(input).reduce<Record<string, unknown>>((acc, [key, value]) => {
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed) {
        acc[key] = trimmed;
      } else if (options?.keepEmptyStringsAsNull) {
        acc[key] = null;
      }
      return acc;
    }
    if (typeof value === "boolean") {
      acc[key] = value;
      return acc;
    }
    if (value !== null && value !== undefined) acc[key] = value;
    else if (options?.keepEmptyStringsAsNull && value === null) acc[key] = null;
    return acc;
  }, {});
  return next as Partial<T>;
}

function buildPayload(state: ContactEditState, dedupe?: DedupeDecision) {
  const nombreCompleto = buildFullName(state.persona);
  const persona = cleanObject({
    ...state.persona,
    nombre_completo: nombreCompleto || state.persona.nombre.trim(),
  }, { keepEmptyStringsAsNull: true });

  const cuentaBase = cleanObject({
    ...state.cuenta,
    razon_social:
      state.mode === "persona_fisica_actividad_empresarial"
        ? state.cuenta.razon_social || nombreCompleto
        : state.cuenta.razon_social,
    nombre_comercial:
      state.mode === "persona_fisica_actividad_empresarial"
        ? state.cuenta.nombre_comercial || nombreCompleto
        : state.cuenta.nombre_comercial,
    tipo_persona:
      state.mode === "persona_fisica_actividad_empresarial"
        ? "fisica"
        : state.cuenta.tipo_persona,
    tipo_cuenta:
      state.mode === "persona_fisica_actividad_empresarial"
        ? "persona_fisica_actividad_empresarial"
        : state.cuenta.tipo_cuenta,
  }, { keepEmptyStringsAsNull: true });

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
        }, { keepEmptyStringsAsNull: true });

  const extras = cleanObject({
    fiscales: cleanObject({
      uso_cfdi: state.extras.uso_cfdi,
      forma_pago: state.extras.forma_pago,
      metodo_pago: state.extras.metodo_pago,
      email_facturacion: state.extras.email_facturacion,
    }, { keepEmptyStringsAsNull: true }),
    direccion: cleanObject({
      pais: state.extras.pais,
      entidad: state.extras.entidad,
      municipio: state.extras.municipio,
      tipo_vialidad: state.extras.tipo_vialidad,
      nombre_vialidad: state.extras.nombre_vialidad,
      numero_exterior: state.extras.numero_exterior,
      numero_interior: state.extras.numero_interior,
      codigo_postal: state.extras.codigo_postal,
    }, { keepEmptyStringsAsNull: true }),
  }, { keepEmptyStringsAsNull: true });

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

function validateState(state: ContactEditState): string | null {
  if (!state.persona.nombre.trim()) return "El nombre es obligatorio.";
  if (!state.persona.apellido_paterno.trim()) return "El apellido paterno es obligatorio.";
  if (!state.persona.correo_principal.trim() && !state.persona.telefono_principal_e164.trim()) {
    return "Debes capturar teléfono o correo.";
  }
  if (state.mode === "empresa_existente" && !state.cuenta.cuenta_id.trim()) {
    return "Selecciona una cuenta existente.";
  }
  if (
    (state.mode === "empresa_nueva" || state.mode === "persona_fisica_actividad_empresarial") &&
    !state.cuenta.nombre_comercial.trim() &&
    !state.cuenta.razon_social.trim()
  ) {
    return "La cuenta requiere nombre comercial o razón social.";
  }
  if (
    (state.mode === "empresa_nueva" || state.mode === "persona_fisica_actividad_empresarial") &&
    !state.cuenta.tipo_persona.trim()
  ) {
    return "Selecciona el tipo de persona de la cuenta.";
  }
  if (state.mode !== "solo_persona" && !state.relacion.rol_en_cuenta.trim()) {
    return "Define el rol de la persona dentro de la cuenta.";
  }
  return null;
}

function reducer(state: ContactEditState, action: ContactEditAction): ContactEditState {
  switch (action.type) {
    case "reset":
      return INITIAL_STATE;
    case "hydrate": {
      const detail = action.detail;
      const mode = inferMode(detail);
      const hasFiscalOrAddressData = [
        "uso_cfdi",
        "forma_pago",
        "metodo_pago",
        "email_facturacion",
        "pais",
        "clave_entidad",
        "entidad",
        "clave_municipio",
        "municipio",
        "clave_localidad",
        "localidad",
        "tipo_vialidad",
        "nombre_vialidad",
        "numero_exterior",
        "letra_exterior",
        "edificio",
        "edificio_piso",
        "numero_interior",
        "letra_interior",
        "tipo_asentamiento",
        "nombre_asentamiento",
        "tipo_centro_comercial",
        "corredor_industrial",
        "numero_local",
        "codigo_postal",
        "tipo_establecimiento",
        "latitud",
        "longitud",
      ].some((key) => readString(detail, key).trim());
      return {
        ...INITIAL_STATE,
        loadedId: action.personaId,
        mode,
        persona: {
          ...INITIAL_STATE.persona,
          nombre: readString(detail, "nombre_nombres") || readString(detail, "nombre") || "",
          apellido_paterno: readString(detail, "apellido_paterno"),
          apellido_materno: readString(detail, "apellido_materno"),
          correo_principal: readString(detail, "correo"),
          telefono_principal_e164: readString(detail, "telefono_e164"),
          puesto: readString(detail, "puesto"),
          area: readString(detail, "area"),
          rol_decision: readString(detail, "rol_decision"),
          estado: readString(detail, "estado"),
          origen: readString(detail, "origen"),
          notas: readString(detail, "notes"),
          propietario_usuario_id: readString(detail, "propietario_usuario_id"),
        },
        cuenta: {
          ...INITIAL_STATE.cuenta,
          cuenta_id: readString(detail, "cuenta_id"),
          nombre_comercial: readString(detail, "company_name"),
          razon_social: readString(detail, "razon_social"),
          alias: readString(detail, "alias"),
          tipo_persona: (readString(detail, "persona_fisica_moral") as CuentaDraft["tipo_persona"]) || "",
          tipo_cuenta: readString(detail, "cuenta_tipo") || "empresa",
          tipo: readString(detail, "tipo") || "empresa",
          codigo_cuenta: readString(detail, "codigo_cuenta"),
          rfc: readString(detail, "rfc"),
          industria: readString(detail, "tipo_industria"),
          sitio_web: readString(detail, "website"),
          correo_principal: readString(detail, "email_facturacion"),
          telefono_principal: readString(detail, "telefono_e164"),
          correo: readString(detail, "correo"),
          telefono: readString(detail, "telefono"),
          notas: "",
          segmento: "",
          tamano: readString(detail, "tamano"),
          necesidad_proposito: readString(detail, "necesidad_proposito"),
          tipo_establecimiento: readString(detail, "tipo_establecimiento"),
          fecha_incorporacion: readString(detail, "fecha_incorporacion"),
          latitud: readString(detail, "latitud"),
          longitud: readString(detail, "longitud"),
        },
        relacion: {
          ...INITIAL_STATE.relacion,
          rol_en_cuenta: readString(detail, "rol_en_cuenta"),
          puesto: readString(detail, "puesto"),
          es_contacto_principal: readBool(detail, "es_contacto_principal", true),
          es_contacto_facturacion: readBool(detail, "es_contacto_facturacion", false),
          es_representante_legal: readBool(detail, "es_representante_legal", false),
          activo: readBool(detail, "relacion_activa", true),
          fecha_inicio: "",
          fecha_fin: readString(detail, "fecha_fin"),
          notas: "",
        },
        extras: {
          ...INITIAL_STATE.extras,
          uso_cfdi: readString(detail, "uso_cfdi"),
          forma_pago: readString(detail, "forma_pago"),
          metodo_pago: readString(detail, "metodo_pago"),
          email_facturacion: readString(detail, "email_facturacion"),
          pais: readString(detail, "pais") || "MX",
          clave_entidad: readString(detail, "clave_entidad"),
          entidad: readString(detail, "entidad"),
          clave_municipio: readString(detail, "clave_municipio"),
          municipio: readString(detail, "municipio"),
          clave_localidad: readString(detail, "clave_localidad"),
          localidad: readString(detail, "localidad"),
          tipo_vialidad: readString(detail, "tipo_vialidad"),
          nombre_vialidad: readString(detail, "nombre_vialidad"),
          numero_exterior: readString(detail, "numero_exterior"),
          letra_exterior: readString(detail, "letra_exterior"),
          edificio: readString(detail, "edificio"),
          edificio_piso: readString(detail, "edificio_piso"),
          numero_interior: readString(detail, "numero_interior"),
          letra_interior: readString(detail, "letra_interior"),
          tipo_asentamiento: readString(detail, "tipo_asentamiento"),
          nombre_asentamiento: readString(detail, "nombre_asentamiento"),
          tipo_centro_comercial: readString(detail, "tipo_centro_comercial"),
          corredor_industrial: readString(detail, "corredor_industrial"),
          numero_local: readString(detail, "numero_local"),
          codigo_postal: readString(detail, "codigo_postal"),
        },
        extrasOpen: hasFiscalOrAddressData,
      };
    }
    case "mode/set":
      return { ...state, mode: action.mode, error: null, accountError: null };
    case "persona/set":
      return { ...state, persona: { ...state.persona, [action.field]: action.value } };
    case "cuenta/set":
      return { ...state, cuenta: { ...state.cuenta, [action.field]: action.value } };
    case "relacion/set":
      return { ...state, relacion: { ...state.relacion, [action.field]: action.value } };
    case "extras/set":
      return { ...state, extras: { ...state.extras, [action.field]: action.value } };
    case "extras/toggle":
      return { ...state, extrasOpen: action.value ?? !state.extrasOpen };
    case "account-query/set":
      return { ...state, accountQuery: action.value };
    case "account-search/start":
      return { ...state, accountLoading: true, accountError: null };
    case "account-search/success":
      return { ...state, accountLoading: false, accountResults: action.items, accountError: null };
    case "account-search/error":
      return { ...state, accountLoading: false, accountError: action.message };
    case "account/select":
      return {
        ...state,
        cuenta: {
          ...state.cuenta,
          cuenta_id: action.account.id,
          nombre_comercial: action.account.nombre,
          correo_principal: action.account.correo ?? state.cuenta.correo_principal,
          telefono_principal: action.account.telefono ?? state.cuenta.telefono_principal,
        },
        relacion: {
          ...state.relacion,
          rol_en_cuenta: state.relacion.rol_en_cuenta || "contacto_principal",
        },
      };
    case "loading/set":
      return { ...state, loading: action.value };
    case "saving/set":
      return { ...state, saving: action.value };
    case "error/set":
      return { ...state, error: action.value };
    default:
      return state;
  }
}

function FormSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4 rounded-xl border border-border/60 bg-muted/20 p-4 shadow-sm">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold leading-none">{title}</h3>
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
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      {children}
    </div>
  );
}

export function ContactEditFlow({ open, onOpenChange, personaId, onSaved }: ContactEditFlowProps) {
  const resolvedPersonaId = personaId;
  const [state, dispatch] = React.useReducer(reducer, INITIAL_STATE);
  const deferredAccountQuery = React.useDeferredValue(state.accountQuery);
  const [pendingDedupe, setPendingDedupe] = React.useState<PersonaValidationResponse | null>(null);
  const [selectedPersonaReuseId, setSelectedPersonaReuseId] = React.useState("");
  const [selectedCuentaReuseId, setSelectedCuentaReuseId] = React.useState("");
  const [relationAccountQuery, setRelationAccountQuery] = React.useState("");
  const deferredRelationAccountQuery = React.useDeferredValue(relationAccountQuery);
  const [relationAccountResults, setRelationAccountResults] = React.useState<AccountOption[]>([]);
  const [relationAccountLoading, setRelationAccountLoading] = React.useState(false);
  const [relationAccountError, setRelationAccountError] = React.useState<string | null>(null);
  const [relations, setRelations] = React.useState<AccountRelation[]>([]);
  const [relationsLoading, setRelationsLoading] = React.useState(false);
  const [relationBusyId, setRelationBusyId] = React.useState<string | null>(null);
  const [newRelation, setNewRelation] = React.useState<NewRelationDraft>({
    cuenta_id: "",
    rol_en_cuenta: "contacto_principal",
    puesto: "",
    es_contacto_principal: false,
    es_contacto_facturacion: false,
    es_representante_legal: false,
    activo: true,
    fecha_inicio: "",
    fecha_fin: "",
    notas: "",
  });

  React.useEffect(() => {
    if (!open) return;
    if (!resolvedPersonaId) return;
    if (state.loadedId === resolvedPersonaId) return;

    const controller = new AbortController();
    const run = async () => {
      dispatch({ type: "loading/set", value: true });
      dispatch({ type: "error/set", value: null });
      try {
        const response = await fetch(`/api/personas/${encodeURIComponent(resolvedPersonaId)}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const body = (await response.json().catch(() => ({}))) as ContactDetail;
        if (!response.ok) {
          const message = typeof body.error === "string" ? body.error : `Error ${response.status}`;
          dispatch({ type: "error/set", value: message });
          toast.error(message);
          return;
        }
        dispatch({ type: "hydrate", personaId: resolvedPersonaId, detail: body });
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          dispatch({ type: "error/set", value: "No se pudo cargar la persona." });
        }
      } finally {
        dispatch({ type: "loading/set", value: false });
      }
    };

    run();
    return () => controller.abort();
  }, [open, resolvedPersonaId, state.loadedId]);

  React.useEffect(() => {
    if (open) return;
    setPendingDedupe(null);
    setSelectedPersonaReuseId("");
    setSelectedCuentaReuseId("");
  }, [open]);

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
        const body = (await response.json().catch(() => ({}))) as { items?: AccountOption[]; error?: string };
        if (!response.ok) {
          dispatch({ type: "account-search/error", message: body.error || "No se pudieron buscar cuentas." });
          return;
        }
        dispatch({ type: "account-search/success", items: Array.isArray(body.items) ? body.items : [] });
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          dispatch({ type: "account-search/error", message: "No se pudieron buscar cuentas." });
        }
      }
    };
    run();
    return () => controller.abort();
  }, [deferredAccountQuery, state.mode]);

  React.useEffect(() => {
    const query = deferredRelationAccountQuery.trim();
    if (query.length < 2) {
      setRelationAccountLoading(false);
      setRelationAccountResults([]);
      setRelationAccountError(null);
      return;
    }
    const controller = new AbortController();
    const run = async () => {
      setRelationAccountLoading(true);
      setRelationAccountError(null);
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
          setRelationAccountError(body.error || "No se pudieron buscar cuentas.");
          return;
        }
        setRelationAccountResults(Array.isArray(body.items) ? body.items : []);
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          setRelationAccountError("No se pudieron buscar cuentas.");
        }
      } finally {
        setRelationAccountLoading(false);
      }
    };
    run();
    return () => controller.abort();
  }, [deferredRelationAccountQuery]);

  const loadRelations = React.useCallback(async () => {
    if (!resolvedPersonaId) return;
    setRelationsLoading(true);
    try {
      const response = await fetch(`/api/personas/${encodeURIComponent(resolvedPersonaId)}/relaciones`, {
        cache: "no-store",
      });
      const body = (await response.json().catch(() => ({}))) as {
        items?: Array<Record<string, unknown>>;
        error?: string;
      };
      if (!response.ok) {
        throw new Error(body.error || `Error ${response.status}`);
      }
      const items = Array.isArray(body.items) ? body.items : [];
      const mapped: AccountRelation[] = items
        .map((item): AccountRelation | null => {
          const id = typeof item.id === "string" ? item.id : "";
          const cuenta_id = typeof item.cuenta_id === "string" ? item.cuenta_id : "";
          const persona_id = typeof item.persona_id === "string" ? item.persona_id : "";
          if (!id || !cuenta_id || !persona_id) return null;
          return {
            id,
            cuenta_id,
            persona_id,
            rol_en_cuenta: typeof item.rol_en_cuenta === "string" ? item.rol_en_cuenta : "contacto_principal",
            puesto: typeof item.puesto === "string" ? item.puesto : null,
            es_contacto_principal: Boolean(item.es_contacto_principal),
            es_contacto_facturacion: Boolean(item.es_contacto_facturacion),
            es_representante_legal: Boolean(item.es_representante_legal),
            activo: item.activo === false ? false : true,
            fecha_inicio: typeof item.fecha_inicio === "string" ? item.fecha_inicio : null,
            fecha_fin: typeof item.fecha_fin === "string" ? item.fecha_fin : null,
            notas: typeof item.notas === "string" ? item.notas : null,
            cuenta_nombre: "",
            cuenta_alias: null as string | null,
          };
        })
        .filter((item): item is AccountRelation => item !== null);
      const uniqueAccountIds = Array.from(new Set(mapped.map((item) => item.cuenta_id).filter(Boolean)));
      const summaries = await Promise.all(
        uniqueAccountIds.map(async (cuentaId) => {
          try {
            const accountResponse = await fetch(`/api/personas/cuentas/${encodeURIComponent(cuentaId)}`, {
              cache: "no-store",
            });
            const accountBody = (await accountResponse.json().catch(() => ({}))) as {
              item?: { id?: string; nombre?: string; alias?: string | null };
            };
            if (!accountResponse.ok || !accountBody.item?.nombre) {
              return null;
            }
            return {
              id: cuentaId,
              nombre: accountBody.item.nombre,
              alias: accountBody.item.alias ?? null,
            };
          } catch {
            return null;
          }
        }),
      );
      const summaryMap = summaries.reduce<Record<string, { nombre: string; alias: string | null }>>((acc, item) => {
        if (!item) return acc;
        acc[item.id] = { nombre: item.nombre, alias: item.alias };
        return acc;
      }, {});
      setRelations(
        mapped.map((relation) => {
          const summary = summaryMap[relation.cuenta_id];
          return {
            ...relation,
            cuenta_nombre: summary?.nombre || "",
            cuenta_alias: summary?.alias ?? null,
          };
        }),
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudieron cargar las relaciones.");
      setRelations([]);
    } finally {
      setRelationsLoading(false);
    }
  }, [resolvedPersonaId]);

  React.useEffect(() => {
    if (!open || !resolvedPersonaId) return;
    void loadRelations();
  }, [open, resolvedPersonaId, loadRelations]);

  const patchRelation = async (relationId: string, payload: Record<string, unknown>) => {
    if (!resolvedPersonaId) return;
    setRelationBusyId(relationId);
    try {
      const response = await fetch(
        `/api/personas/${encodeURIComponent(resolvedPersonaId)}/relaciones/${encodeURIComponent(relationId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(body.error || `Error ${response.status}`);
      await loadRelations();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo actualizar la relacion.");
    } finally {
      setRelationBusyId(null);
    }
  };

  const toggleRelationStatus = async (relationId: string, activo: boolean) => {
    if (!resolvedPersonaId) return;
    setRelationBusyId(relationId);
    try {
      const response = await fetch(
        `/api/personas/${encodeURIComponent(resolvedPersonaId)}/relaciones/${encodeURIComponent(relationId)}/estado`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ activo }),
        },
      );
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(body.error || `Error ${response.status}`);
      await loadRelations();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo cambiar el estado.");
    } finally {
      setRelationBusyId(null);
    }
  };

  const deleteRelation = async (relationId: string) => {
    if (!resolvedPersonaId) return;
    setRelationBusyId(relationId);
    try {
      const response = await fetch(
        `/api/personas/${encodeURIComponent(resolvedPersonaId)}/relaciones/${encodeURIComponent(relationId)}`,
        {
          method: "DELETE",
        },
      );
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(body.error || `Error ${response.status}`);
      await loadRelations();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo eliminar la relacion.");
    } finally {
      setRelationBusyId(null);
    }
  };

  const createRelation = async () => {
    if (!resolvedPersonaId) return;
    if (!newRelation.cuenta_id.trim()) {
      toast.error("Debes indicar cuenta_id para crear la relacion.");
      return;
    }
    setRelationBusyId("new");
    try {
      const response = await fetch(`/api/personas/${encodeURIComponent(resolvedPersonaId)}/relaciones`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cuenta_id: newRelation.cuenta_id.trim(),
          rol_en_cuenta: newRelation.rol_en_cuenta.trim() || "contacto_principal",
          puesto: newRelation.puesto.trim() || null,
          es_contacto_principal: newRelation.es_contacto_principal,
          es_contacto_facturacion: newRelation.es_contacto_facturacion,
          es_representante_legal: newRelation.es_representante_legal,
          activo: newRelation.activo,
          fecha_inicio: newRelation.fecha_inicio || null,
          fecha_fin: newRelation.fecha_fin || null,
          notas: newRelation.notas.trim() || null,
        }),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(body.error || `Error ${response.status}`);
      setNewRelation({
        cuenta_id: "",
        rol_en_cuenta: "contacto_principal",
        puesto: "",
        es_contacto_principal: false,
        es_contacto_facturacion: false,
        es_representante_legal: false,
        activo: true,
        fecha_inicio: "",
        fecha_fin: "",
        notas: "",
      });
      setRelationAccountQuery("");
      setRelationAccountResults([]);
      await loadRelations();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo crear la relacion.");
    } finally {
      setRelationBusyId(null);
    }
  };

  const submit = async (dedupeDecision?: DedupeDecision) => {
    if (!resolvedPersonaId) return;
    const validationError = validateState(state);
    if (validationError) {
      dispatch({ type: "error/set", value: validationError });
      toast.error(validationError);
      return;
    }
    dispatch({ type: "saving/set", value: true });
    dispatch({ type: "error/set", value: null });
    try {
      const payload = buildPayload(state, dedupeDecision);
      if (!dedupeDecision) {
        const previewResponse = await fetch(`/api/personas/${encodeURIComponent(resolvedPersonaId)}/validar`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const previewBody = (await previewResponse.json().catch(() => ({}))) as
          | PersonaValidationResponse
          | { error?: string };
        if (!previewResponse.ok) {
          throw new Error((previewBody as { error?: string }).error || `Error ${previewResponse.status}`);
        }
        const preview = previewBody as PersonaValidationResponse;
        if (preview.requiere_confirmacion) {
          setPendingDedupe(preview);
          setSelectedPersonaReuseId(preview.sugerencia_persona_reutilizar_id ?? "");
          setSelectedCuentaReuseId(preview.sugerencia_cuenta_reutilizar_id ?? "");
          toast.warning("Se detectaron posibles duplicados. Confirma cómo continuar.");
          return;
        }
      }

      const response = await fetch(`/api/personas/${encodeURIComponent(resolvedPersonaId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await response.json().catch(() => ({}))) as PersonaMutationResponse;
      if (!response.ok) throw new Error(body.error || `Error ${response.status}`);
      setPendingDedupe(null);
      setSelectedPersonaReuseId("");
      setSelectedCuentaReuseId("");
      if (body.resumen?.deduplicado && body.resumen.contacto_reutilizado_id) {
        toast.info(`Se reutilizo contacto existente (${body.resumen.contacto_reutilizado_id}).`);
      }
      if (body.resumen?.cuenta_reutilizada_id) {
        toast.info(`Se reutilizo cuenta existente (${body.resumen.cuenta_reutilizada_id}).`);
      }
      toast.success("Cambios guardados.");
      onOpenChange(false);
      onSaved?.();
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo guardar.";
      dispatch({ type: "error/set", value: message });
      toast.error(message);
    } finally {
      dispatch({ type: "saving/set", value: false });
    }
  };

  const fullName = React.useMemo(() => buildFullName(state.persona), [state.persona]);
  const personSectionTitle =
    state.mode === "solo_persona"
      ? "Datos del contacto"
      : state.mode === "persona_fisica_actividad_empresarial"
        ? "Persona y negocio"
        : "Datos de la persona";
  const personSectionDescription =
    state.mode === "solo_persona"
      ? "Edita la persona que recibe seguimiento."
      : state.mode === "empresa_existente"
        ? "Edita la persona y su vínculo con una empresa ya registrada."
        : state.mode === "empresa_nueva"
          ? "Edita la persona y los datos de la empresa asociada."
          : "Edita la persona y la empresa en un mismo flujo.";
  const relationSectionTitle =
    state.mode === "persona_fisica_actividad_empresarial"
      ? "Vínculo principal"
      : "Vinculación con empresa";
  const relationSectionDescription =
    state.mode === "persona_fisica_actividad_empresarial"
      ? "Actualiza la relación principal de la persona con su negocio."
      : "Actualiza el rol real de la persona dentro de la empresa.";
  const businessSummary = formatSummaryLine(
    [
      state.cuenta.nombre_comercial || state.cuenta.razon_social,
      state.cuenta.alias,
      state.cuenta.tipo_persona,
      state.cuenta.tamano,
      state.cuenta.tipo_establecimiento,
    ],
    "Sin datos de empresa",
  );
  const fiscalSummary = formatSummaryLine(
    [state.cuenta.rfc, state.extras.uso_cfdi, state.extras.forma_pago, state.extras.metodo_pago, state.extras.email_facturacion],
    "Sin datos fiscales",
  );
  const locationSummary = formatSummaryLine(
    [state.extras.pais || "MX", state.extras.entidad, state.extras.municipio, state.extras.localidad, state.extras.codigo_postal],
    "Sin ubicación",
  );
  const domicileSummary = formatSummaryLine(
    [
      state.extras.tipo_vialidad,
      state.extras.nombre_vialidad,
      state.extras.numero_exterior,
      state.extras.letra_exterior,
      state.extras.numero_interior,
      state.extras.letra_interior,
      state.extras.edificio,
      state.extras.edificio_piso,
      state.extras.tipo_asentamiento,
      state.extras.nombre_asentamiento,
      state.extras.tipo_centro_comercial,
      state.extras.corredor_industrial,
      state.extras.numero_local,
    ],
    "Sin domicilio",
  );
  const georeferenceSummary = formatSummaryLine(
    [state.cuenta.fecha_incorporacion, state.cuenta.latitud, state.cuenta.longitud],
    "Sin georreferencia",
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-5xl">
        <DialogHeader className="space-y-2">
          <DialogTitle>Editar persona</DialogTitle>
          <DialogDescription>
            {fullName ? `Persona: ${fullName}` : "Actualiza los datos de la persona, su empresa y su vínculo."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {state.loading ? <p className="text-xs text-muted-foreground">Cargando...</p> : null}
          {state.error ? <p className="text-xs text-destructive">{state.error}</p> : null}

          <FormSection title="Resumen actual" description="Lo guardado y lo que quedará visible en este contacto.">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
              <div className="rounded-lg border border-border/60 bg-background p-3">
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Persona</div>
                <div className="mt-2 text-sm font-medium">{fullName || "Sin nombre"}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {formatSummaryLine([state.persona.correo_principal, state.persona.telefono_principal_e164, state.persona.estado], "Sin medio de contacto")}
                </div>
              </div>
              <div className="rounded-lg border border-border/60 bg-background p-3">
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Empresa</div>
                <div className="mt-2 text-sm font-medium">{businessSummary}</div>
                <div className="mt-1 text-xs text-muted-foreground">{georeferenceSummary}</div>
              </div>
              <div className="rounded-lg border border-border/60 bg-background p-3">
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Datos fiscales</div>
                <div className="mt-2 text-sm font-medium">{fiscalSummary}</div>
                <div className="mt-1 text-xs text-muted-foreground">{state.cuenta.rfc || "Sin RFC"}</div>
              </div>
              <div className="rounded-lg border border-border/60 bg-background p-3">
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Dirección</div>
                <div className="mt-2 text-sm font-medium">{locationSummary}</div>
                <div className="mt-1 text-xs text-muted-foreground">{domicileSummary}</div>
              </div>
            </div>
          </FormSection>

          <FormSection title="Tipo de registro">
            <RadioGroup value={state.mode} onValueChange={(value) => dispatch({ type: "mode/set", mode: value as CreateMode })} className="grid gap-3 md:grid-cols-3">
              {[
                { value: "solo_persona", title: "Contacto", description: "Sin empresa asociada." },
                { value: "empresa_existente", title: "Empresa existente", description: "Vincula a una empresa ya creada." },
                { value: "empresa_nueva", title: "Nueva empresa", description: "Crea una empresa nueva." },
                { value: "persona_fisica_actividad_empresarial", title: "Persona física con actividad empresarial", description: "Empresa propia vinculada." },
              ].map((option) => (
                <label
                  key={option.value}
                  className={`flex cursor-pointer flex-col gap-2 rounded-xl border p-4 ${state.mode === option.value ? "border-foreground bg-muted/40" : "border-border/60 bg-background"}`}
                >
                  <div className="flex items-start gap-3">
                    <RadioGroupItem value={option.value} id={`mode-edit-${option.value}`} />
                    <div className="space-y-1">
                      <div className="text-sm font-medium">{option.title}</div>
                      <p className="text-xs text-muted-foreground">{option.description}</p>
                    </div>
                  </div>
                </label>
              ))}
            </RadioGroup>
          </FormSection>

          <FormSection title={personSectionTitle} description={personSectionDescription}>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field label="Nombre">
                <Input value={state.persona.nombre} onChange={(e) => dispatch({ type: "persona/set", field: "nombre", value: e.target.value })} />
              </Field>
              <Field label="Apellido paterno">
                <Input value={state.persona.apellido_paterno} onChange={(e) => dispatch({ type: "persona/set", field: "apellido_paterno", value: e.target.value })} />
              </Field>
              <Field label="Apellido materno">
                <Input value={state.persona.apellido_materno} onChange={(e) => dispatch({ type: "persona/set", field: "apellido_materno", value: e.target.value })} />
              </Field>
              <Field label="Correo principal">
                <Input value={state.persona.correo_principal} onChange={(e) => dispatch({ type: "persona/set", field: "correo_principal", value: e.target.value })} />
              </Field>
              <Field label="Teléfono principal">
                <Input value={state.persona.telefono_principal_e164} onChange={(e) => dispatch({ type: "persona/set", field: "telefono_principal_e164", value: e.target.value })} />
              </Field>
              <Field label="Origen">
                <Input value={state.persona.origen} onChange={(e) => dispatch({ type: "persona/set", field: "origen", value: e.target.value })} />
              </Field>
              <Field label="Puesto">
                <Input value={state.persona.puesto} onChange={(e) => dispatch({ type: "persona/set", field: "puesto", value: e.target.value })} />
              </Field>
              <Field label="Área">
                <Input value={state.persona.area} onChange={(e) => dispatch({ type: "persona/set", field: "area", value: e.target.value })} />
              </Field>
              <Field label="Rol de decisión">
                <Input value={state.persona.rol_decision} onChange={(e) => dispatch({ type: "persona/set", field: "rol_decision", value: e.target.value })} />
              </Field>
              <Field label="Estado">
                <Select
                  value={state.persona.estado || "lead"}
                  onValueChange={(value) => dispatch({ type: "persona/set", field: "estado", value })}
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

          {state.mode === "empresa_existente" ? (
            <FormSection title="Empresa existente" description="Busca una empresa existente y selecciónala.">
              <div className="space-y-3">
                <Field label="Buscar empresa" hint="Busca por nombre, correo, teléfono o alias.">
                  <Input value={state.accountQuery} onChange={(e) => dispatch({ type: "account-query/set", value: e.target.value })} placeholder="Escribe al menos 2 caracteres" />
                </Field>
                {state.cuenta.cuenta_id ? (
                  <div className="rounded-lg border border-border/60 bg-background p-3 text-sm">
                    <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Empresa seleccionada</div>
                    <div className="mt-1 font-medium">{state.cuenta.nombre_comercial || state.cuenta.razon_social || "Empresa vinculada"}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {formatSummaryLine(
                        [state.cuenta.alias, state.cuenta.rfc, state.cuenta.tipo_persona, state.cuenta.sitio_web || state.cuenta.correo_principal],
                        "Sin datos adicionales",
                      )}
                    </div>
                  </div>
                ) : null}
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
                          <div className="text-xs text-muted-foreground">{[account.alias, account.correo, account.telefono].filter(Boolean).join(" · ") || "Sin datos adicionales"}</div>
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            </FormSection>
          ) : null}

          {state.mode !== "solo_persona" ? (
            <FormSection title="Datos de la empresa" description="Edita los datos fiscales, comerciales y de domicilio de la cuenta vinculada.">
              {state.mode === "empresa_existente" ? (
                <div className="mb-4 rounded-lg border border-dashed border-border/70 bg-background p-3 text-sm text-muted-foreground">
                  La empresa ya está vinculada. Si deseas cambiarla, selecciona otra en el bloque anterior.
                </div>
              ) : null}
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Field label="Nombre comercial">
                  <Input value={state.cuenta.nombre_comercial} onChange={(e) => dispatch({ type: "cuenta/set", field: "nombre_comercial", value: e.target.value })} />
                </Field>
                <Field label="Alias">
                  <Input value={state.cuenta.alias} onChange={(e) => dispatch({ type: "cuenta/set", field: "alias", value: e.target.value })} />
                </Field>
                <Field label="Razón social">
                  <Input value={state.cuenta.razon_social} onChange={(e) => dispatch({ type: "cuenta/set", field: "razon_social", value: e.target.value })} />
                </Field>
                <Field label="Código de cuenta">
                  <Input value={state.cuenta.codigo_cuenta} onChange={(e) => dispatch({ type: "cuenta/set", field: "codigo_cuenta", value: e.target.value })} />
                </Field>
                <Field label="Tipo">
                  <Input value={state.cuenta.tipo} onChange={(e) => dispatch({ type: "cuenta/set", field: "tipo", value: e.target.value })} />
                </Field>
                <Field label="Tipo persona">
                  <select
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
                    value={state.cuenta.tipo_persona}
                    onChange={(e) => dispatch({ type: "cuenta/set", field: "tipo_persona", value: e.target.value })}
                    disabled={state.mode === "persona_fisica_actividad_empresarial"}
                  >
                    <option value="">Selecciona</option>
                    <option value="fisica">Física</option>
                    <option value="moral">Moral</option>
                  </select>
                </Field>
                <Field label="RFC">
                  <Input value={state.cuenta.rfc} onChange={(e) => dispatch({ type: "cuenta/set", field: "rfc", value: e.target.value })} />
                </Field>
                <Field label="Tamaño">
                  <Input value={state.cuenta.tamano} onChange={(e) => dispatch({ type: "cuenta/set", field: "tamano", value: e.target.value })} />
                </Field>
                <Field label="Sitio web">
                  <Input value={state.cuenta.sitio_web} onChange={(e) => dispatch({ type: "cuenta/set", field: "sitio_web", value: e.target.value })} />
                </Field>
                <Field label="Correo principal">
                  <Input value={state.cuenta.correo_principal} onChange={(e) => dispatch({ type: "cuenta/set", field: "correo_principal", value: e.target.value })} />
                </Field>
                <Field label="Teléfono principal">
                  <Input value={state.cuenta.telefono_principal} onChange={(e) => dispatch({ type: "cuenta/set", field: "telefono_principal", value: e.target.value })} />
                </Field>
                <Field label="Correo">
                  <Input value={state.cuenta.correo} onChange={(e) => dispatch({ type: "cuenta/set", field: "correo", value: e.target.value })} />
                </Field>
                <Field label="Teléfono">
                  <Input value={state.cuenta.telefono} onChange={(e) => dispatch({ type: "cuenta/set", field: "telefono", value: e.target.value })} />
                </Field>
                <Field label="Necesidad / propósito">
                  <Input value={state.cuenta.necesidad_proposito} onChange={(e) => dispatch({ type: "cuenta/set", field: "necesidad_proposito", value: e.target.value })} />
                </Field>
                <Field label="Tipo de establecimiento">
                  <Input value={state.cuenta.tipo_establecimiento} onChange={(e) => dispatch({ type: "cuenta/set", field: "tipo_establecimiento", value: e.target.value })} />
                </Field>
                <Field label="Fecha de incorporación">
                  <Input type="date" value={state.cuenta.fecha_incorporacion} onChange={(e) => dispatch({ type: "cuenta/set", field: "fecha_incorporacion", value: e.target.value })} />
                </Field>
                <Field label="Latitud">
                  <Input type="number" step="any" value={state.cuenta.latitud} onChange={(e) => dispatch({ type: "cuenta/set", field: "latitud", value: e.target.value })} />
                </Field>
                <Field label="Longitud">
                  <Input type="number" step="any" value={state.cuenta.longitud} onChange={(e) => dispatch({ type: "cuenta/set", field: "longitud", value: e.target.value })} />
                </Field>
                <Field label="Notas">
                  <Textarea value={state.cuenta.notas} onChange={(e) => dispatch({ type: "cuenta/set", field: "notas", value: e.target.value })} />
                </Field>
              </div>
            </FormSection>
          ) : null}

          {state.mode !== "solo_persona" ? (
            <FormSection title={relationSectionTitle} description={relationSectionDescription}>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Field label="Función en la empresa" hint="El rol operativo es independiente de los checks de principal, facturación y representante legal.">
                  <select
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
                    value={state.relacion.rol_en_cuenta}
                    onChange={(e) => dispatch({ type: "relacion/set", field: "rol_en_cuenta", value: e.target.value })}
                  >
                    <option value="">Selecciona un rol</option>
                    {RELATION_ROLE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Puesto en la empresa">
                  <Input value={state.relacion.puesto} onChange={(e) => dispatch({ type: "relacion/set", field: "puesto", value: e.target.value })} />
                </Field>
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
              <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={state.relacion.es_contacto_principal} onCheckedChange={(v) => dispatch({ type: "relacion/set", field: "es_contacto_principal", value: Boolean(v) })} />
                  Contacto principal
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={state.relacion.es_contacto_facturacion} onCheckedChange={(v) => dispatch({ type: "relacion/set", field: "es_contacto_facturacion", value: Boolean(v) })} />
                  Contacto facturación
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={state.relacion.es_representante_legal} onCheckedChange={(v) => dispatch({ type: "relacion/set", field: "es_representante_legal", value: Boolean(v) })} />
                  Representante legal
                </label>
              </div>
            </FormSection>
          ) : null}

          {resolvedPersonaId ? (
            <FormSection title="Vinculaciones existentes" description="Administra todas las vinculaciones de esta persona con empresas.">
              {relationsLoading ? <p className="text-xs text-muted-foreground">Cargando relaciones...</p> : null}
              {!relationsLoading && !relations.length ? (
                <p className="text-xs text-muted-foreground">No hay relaciones registradas.</p>
              ) : null}
              <div className="space-y-3">
                {relations.map((relation) => (
                  <div key={relation.id} className="rounded-lg border border-border/60 p-3">
                    <div className="mb-2 text-sm font-medium">
                      {relation.cuenta_nombre || "Empresa vinculada"}
                      {relation.cuenta_alias ? (
                        <span className="ml-2 text-xs font-normal text-muted-foreground">{relation.cuenta_alias}</span>
                      ) : null}
                    </div>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      <Field label="Función">
                        <select
                          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
                          value={relation.rol_en_cuenta}
                          onChange={(e) =>
                            setRelations((prev) =>
                              prev.map((item) =>
                                item.id === relation.id ? { ...item, rol_en_cuenta: e.target.value } : item,
                              ),
                            )
                          }
                        >
                          <option value="">Selecciona un rol</option>
                          {RELATION_ROLE_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Puesto">
                        <Input
                          value={relation.puesto ?? ""}
                          onChange={(e) =>
                            setRelations((prev) =>
                              prev.map((item) =>
                                item.id === relation.id ? { ...item, puesto: e.target.value } : item,
                              ),
                            )
                          }
                        />
                      </Field>
                      <Field label="Fecha de inicio">
                        <Input
                          type="date"
                          value={relation.fecha_inicio ?? ""}
                          onChange={(e) =>
                            setRelations((prev) =>
                              prev.map((item) =>
                                item.id === relation.id ? { ...item, fecha_inicio: e.target.value } : item,
                              ),
                            )
                          }
                        />
                      </Field>
                      <Field label="Fecha de fin">
                        <Input
                          type="date"
                          value={relation.fecha_fin ?? ""}
                          onChange={(e) =>
                            setRelations((prev) =>
                              prev.map((item) =>
                                item.id === relation.id ? { ...item, fecha_fin: e.target.value } : item,
                              ),
                            )
                          }
                        />
                      </Field>
                    </div>
                    <Field label="Notas">
                      <Textarea
                        value={relation.notas ?? ""}
                        onChange={(e) =>
                          setRelations((prev) =>
                            prev.map((item) =>
                              item.id === relation.id ? { ...item, notas: e.target.value } : item,
                            ),
                          )
                        }
                      />
                    </Field>
                    <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-3">
                      <label className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={relation.es_contacto_principal}
                          onCheckedChange={(v) =>
                            setRelations((prev) =>
                              prev.map((item) =>
                                item.id === relation.id ? { ...item, es_contacto_principal: Boolean(v) } : item,
                              ),
                            )
                          }
                        />
                        Contacto principal
                      </label>
                      <label className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={relation.es_contacto_facturacion}
                          onCheckedChange={(v) =>
                            setRelations((prev) =>
                              prev.map((item) =>
                                item.id === relation.id ? { ...item, es_contacto_facturacion: Boolean(v) } : item,
                              ),
                            )
                          }
                        />
                        Contacto de facturación
                      </label>
                      <label className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={relation.es_representante_legal}
                          onCheckedChange={(v) =>
                            setRelations((prev) =>
                              prev.map((item) =>
                                item.id === relation.id ? { ...item, es_representante_legal: Boolean(v) } : item,
                              ),
                            )
                          }
                        />
                        Representante legal
                      </label>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        disabled={relationBusyId === relation.id}
                        onClick={() =>
                          void patchRelation(relation.id, {
                            rol_en_cuenta: relation.rol_en_cuenta,
                            puesto: relation.puesto,
                            es_contacto_principal: relation.es_contacto_principal,
                            es_contacto_facturacion: relation.es_contacto_facturacion,
                            es_representante_legal: relation.es_representante_legal,
                            activo: relation.activo,
                            fecha_inicio: relation.fecha_inicio,
                            fecha_fin: relation.fecha_fin,
                            notas: relation.notas,
                          })
                        }
                      >
                        Guardar relación
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={relationBusyId === relation.id}
                        onClick={() => void toggleRelationStatus(relation.id, !relation.activo)}
                      >
                        {relation.activo ? "Desactivar" : "Activar"}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="destructive"
                        disabled={relationBusyId === relation.id}
                        onClick={() => void deleteRelation(relation.id)}
                      >
                        Eliminar
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-4 rounded-lg border border-dashed border-border/70 p-3">
                <div className="mb-2 text-sm font-medium">Agregar vínculo</div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <Field label="Buscar empresa">
                    <Input
                      value={relationAccountQuery}
                      onChange={(e) => setRelationAccountQuery(e.target.value)}
                      placeholder="Nombre, RFC, correo o teléfono"
                    />
                  </Field>
                  <Field label="Función en cuenta" hint="Puedes cambiar la función sin tocar las banderas de principal/facturación/legal.">
                    <select
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
                      value={newRelation.rol_en_cuenta}
                      onChange={(e) => setNewRelation((prev) => ({ ...prev, rol_en_cuenta: e.target.value }))}
                    >
                      <option value="">Selecciona un rol</option>
                      {RELATION_ROLE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Puesto">
                    <Input
                      value={newRelation.puesto}
                      onChange={(e) => setNewRelation((prev) => ({ ...prev, puesto: e.target.value }))}
                    />
                  </Field>
                  <Field label="Fecha de inicio">
                    <Input
                      type="date"
                      value={newRelation.fecha_inicio}
                      onChange={(e) => setNewRelation((prev) => ({ ...prev, fecha_inicio: e.target.value }))}
                    />
                  </Field>
                  <Field label="Fecha de fin">
                    <Input
                      type="date"
                      value={newRelation.fecha_fin}
                      onChange={(e) => setNewRelation((prev) => ({ ...prev, fecha_fin: e.target.value }))}
                    />
                  </Field>
                </div>
                <Field label="Notas">
                  <Textarea value={newRelation.notas} onChange={(e) => setNewRelation((prev) => ({ ...prev, notas: e.target.value }))} />
                </Field>
                {relationAccountLoading ? (
                  <p className="mt-2 text-xs text-muted-foreground">Buscando cuentas...</p>
                ) : null}
                {relationAccountError ? (
                  <p className="mt-2 text-xs text-destructive">{relationAccountError}</p>
                ) : null}
                {relationAccountResults.length ? (
                  <div className="mt-2 space-y-2">
                    {relationAccountResults.map((account) => {
                      const selected = newRelation.cuenta_id === account.id;
                      return (
                        <button
                          key={account.id}
                          type="button"
                          className={`w-full rounded-xl border px-4 py-3 text-left ${selected ? "border-foreground bg-muted/40" : "border-border/60 bg-background"}`}
                          onClick={() =>
                            setNewRelation((prev) => ({ ...prev, cuenta_id: account.id }))
                          }
                        >
                          <div className="text-sm font-medium">{account.nombre}</div>
                          <div className="text-xs text-muted-foreground">
                            {[account.alias, account.correo, account.telefono].filter(Boolean).join(" · ") || "Sin datos adicionales"}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ) : null}
                {newRelation.cuenta_id ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Empresa seleccionada: {relationAccountResults.find((item) => item.id === newRelation.cuenta_id)?.nombre || "Empresa seleccionada"}
                  </p>
                ) : null}
                <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-3">
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={newRelation.es_contacto_principal}
                      onCheckedChange={(v) =>
                        setNewRelation((prev) => ({ ...prev, es_contacto_principal: Boolean(v) }))
                      }
                    />
                    Contacto principal
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={newRelation.es_contacto_facturacion}
                      onCheckedChange={(v) =>
                        setNewRelation((prev) => ({ ...prev, es_contacto_facturacion: Boolean(v) }))
                      }
                    />
                    Contacto de facturación
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={newRelation.es_representante_legal}
                      onCheckedChange={(v) =>
                        setNewRelation((prev) => ({ ...prev, es_representante_legal: Boolean(v) }))
                      }
                    />
                    Representante legal
                  </label>
                </div>
                <div className="mt-3">
                  <Button type="button" size="sm" disabled={relationBusyId === "new"} onClick={() => void createRelation()}>
                    {relationBusyId === "new" ? "Creando..." : "Agregar vínculo"}
                  </Button>
                </div>
              </div>
            </FormSection>
          ) : null}

          <FormSection title="Datos fiscales y dirección" description="Completa ahora o revisa los valores persistidos.">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field label="Uso CFDI">
                <Input value={state.extras.uso_cfdi} onChange={(e) => dispatch({ type: "extras/set", field: "uso_cfdi", value: e.target.value })} />
              </Field>
              <Field label="Forma de pago">
                <Input value={state.extras.forma_pago} onChange={(e) => dispatch({ type: "extras/set", field: "forma_pago", value: e.target.value })} />
              </Field>
              <Field label="Método de pago">
                <Input value={state.extras.metodo_pago} onChange={(e) => dispatch({ type: "extras/set", field: "metodo_pago", value: e.target.value })} />
              </Field>
              <Field label="Email facturación">
                <Input value={state.extras.email_facturacion} onChange={(e) => dispatch({ type: "extras/set", field: "email_facturacion", value: e.target.value })} />
              </Field>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
              <div className="rounded-lg border border-border/60 bg-background p-3">
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Fiscal</div>
                <div className="mt-2 text-sm font-medium">{state.extras.uso_cfdi || "Sin uso CFDI"}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {[state.extras.forma_pago, state.extras.metodo_pago, state.extras.email_facturacion].filter(Boolean).join(" · ") || "Sin datos de facturación"}
                </div>
              </div>
              <div className="rounded-lg border border-border/60 bg-background p-3">
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Ubicación</div>
                <div className="mt-2 text-sm font-medium">{state.extras.pais || "MX"}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {[state.extras.entidad, state.extras.municipio, state.extras.codigo_postal].filter(Boolean).join(" · ") || "Sin ubicación"}
                </div>
              </div>
              <div className="rounded-lg border border-border/60 bg-background p-3">
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Domicilio</div>
                <div className="mt-2 text-sm font-medium">{state.extras.nombre_vialidad || "Sin vialidad"}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {[state.extras.numero_exterior, state.extras.numero_interior, state.extras.localidad].filter(Boolean).join(" · ") || "Sin detalle de domicilio"}
                </div>
              </div>
            </div>
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
              <Field label="Clave de localidad">
                <Input value={state.extras.clave_localidad} onChange={(e) => dispatch({ type: "extras/set", field: "clave_localidad", value: e.target.value })} />
              </Field>
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
              <Field label="Nombre de asentamiento">
                <Input value={state.extras.nombre_asentamiento} onChange={(e) => dispatch({ type: "extras/set", field: "nombre_asentamiento", value: e.target.value })} />
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
            </div>
          </FormSection>

          {pendingDedupe ? (
            <FormSection
              title="Posibles duplicados detectados"
              description="Selecciona registros existentes para reutilizar o crea nuevos."
            >
              {pendingDedupe.candidatos_persona.length ? (
                <div className="space-y-2">
                  <div className="text-sm font-medium">Personas candidatas</div>
                  {pendingDedupe.candidatos_persona.map((candidate) => {
                    const selected = selectedPersonaReuseId === candidate.id;
                    return (
                      <button
                        key={`edit-persona-${candidate.id}`}
                        type="button"
                        className={`w-full rounded-xl border px-4 py-3 text-left ${selected ? "border-foreground bg-muted/40" : "border-border/60 bg-background"}`}
                        onClick={() => setSelectedPersonaReuseId(candidate.id)}
                      >
                        <div className="text-sm font-medium">
                          {candidate.nombre || "Sin nombre"}{" "}
                          <span className="text-xs text-muted-foreground">({candidate.nivel || "debil"})</span>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {[candidate.correo, candidate.telefono, candidate.empresa].filter(Boolean).join(" · ") || "Sin datos adicionales"}
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : null}

              {pendingDedupe.candidatos_cuenta.length ? (
                <div className="mt-3 space-y-2">
                  <div className="text-sm font-medium">Cuentas candidatas</div>
                  {pendingDedupe.candidatos_cuenta.map((candidate) => {
                    const selected = selectedCuentaReuseId === candidate.id;
                    return (
                      <button
                        key={`edit-cuenta-${candidate.id}`}
                        type="button"
                        className={`w-full rounded-xl border px-4 py-3 text-left ${selected ? "border-foreground bg-muted/40" : "border-border/60 bg-background"}`}
                        onClick={() => setSelectedCuentaReuseId(candidate.id)}
                      >
                        <div className="text-sm font-medium">
                          {candidate.nombre || "Sin nombre"}{" "}
                          <span className="text-xs text-muted-foreground">({candidate.nivel || "debil"})</span>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {[candidate.rfc, candidate.correo, candidate.telefono, candidate.alias].filter(Boolean).join(" · ") || "Sin datos adicionales"}
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : null}

              <div className="mt-3 flex flex-wrap gap-2">
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
                  variant="secondary"
                  disabled={state.saving}
                  onClick={() => void submit({ confirmar_creacion: true })}
                >
                  Crear nuevos de todos modos
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
                  Cerrar revision
                </Button>
              </div>
            </FormSection>
          ) : null}
        </div>

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="button" onClick={() => void submit()} disabled={state.saving || state.loading || !resolvedPersonaId}>
            {state.saving ? "Guardando..." : "Guardar cambios"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
