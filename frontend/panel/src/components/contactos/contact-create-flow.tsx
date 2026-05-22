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
  nombre?: string | null;
  alias?: string | null;
  empresa?: string | null;
  correo?: string | null;
  telefono?: string | null;
  rfc?: string | null;
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

type ValidationNoticeState = {
  open: boolean;
  title: string;
  message: string;
};

const PERSONA_ESTADO_OPTIONS = [
  { value: "lead", label: "Lead" },
  { value: "activo", label: "Activo" },
  { value: "inactivo", label: "Inactivo" },
  { value: "bloqueado", label: "Bloqueado" },
  { value: "fusionado", label: "Fusionado" },
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

const INITIAL_STATE: ContactCreateState = {
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
  saving: false,
  error: null,
};

function createReducer(state: ContactCreateState, action: ContactCreateAction): ContactCreateState {
  switch (action.type) {
    case "reset":
      return INITIAL_STATE;
    case "mode/set": {
      const nextState: ContactCreateState = {
        ...state,
        mode: action.mode,
        error: null,
        accountError: null,
      };
      if (action.mode === "solo_persona") {
        nextState.cuenta = { ...INITIAL_STATE.cuenta };
        nextState.relacion = { ...INITIAL_STATE.relacion };
        nextState.accountQuery = "";
        nextState.accountResults = [];
      }
      if (action.mode === "persona_fisica_actividad_empresarial") {
        const nombreCompleto = buildFullName(state.persona);
        nextState.cuenta = {
          ...state.cuenta,
          cuenta_id: "",
          alias: state.cuenta.alias || nombreCompleto,
          razon_social: nombreCompleto || state.cuenta.razon_social,
          nombre_comercial: state.cuenta.nombre_comercial || nombreCompleto,
          tipo_persona: "fisica",
          tipo_cuenta: "persona_fisica_actividad_empresarial",
          tipo: "persona_fisica_actividad_empresarial",
        };
        nextState.relacion = {
          ...state.relacion,
          rol_en_cuenta: state.relacion.rol_en_cuenta || "dueno",
          es_contacto_principal: true,
          es_representante_legal: true,
          activo: true,
        };
      }
      if (action.mode === "empresa_nueva") {
        nextState.cuenta = {
          ...state.cuenta,
          cuenta_id: "",
          tipo: "empresa",
          tipo_cuenta: "empresa",
        };
        nextState.relacion = {
          ...state.relacion,
          rol_en_cuenta: state.relacion.rol_en_cuenta || "contacto_principal",
        };
      }
      if (action.mode === "empresa_existente") {
        nextState.cuenta = {
          ...state.cuenta,
          tipo: "empresa",
          tipo_cuenta: "empresa",
        };
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

function buildPayload(state: ContactCreateState, dedupe?: DedupeDecision) {
  const nombreCompleto = buildFullName(state.persona);
  const persona = cleanObject({
    ...state.persona,
    nombre_completo: nombreCompleto || state.persona.nombre.trim(),
  });

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
    alias: state.cuenta.alias,
    tipo_persona:
      state.mode === "persona_fisica_actividad_empresarial"
        ? "fisica"
        : state.cuenta.tipo_persona,
    tipo_cuenta:
      state.mode === "persona_fisica_actividad_empresarial"
        ? "persona_fisica_actividad_empresarial"
        : state.cuenta.tipo_cuenta,
    tipo:
      state.mode === "persona_fisica_actividad_empresarial"
        ? "persona_fisica_actividad_empresarial"
        : state.cuenta.tipo,
    codigo_cuenta: state.cuenta.codigo_cuenta,
    tamano: state.cuenta.tamano,
    correo: state.cuenta.correo || state.cuenta.correo_principal,
    telefono: state.cuenta.telefono || state.cuenta.telefono_principal,
    necesidad_proposito: state.cuenta.necesidad_proposito,
    tipo_establecimiento: state.cuenta.tipo_establecimiento,
    fecha_incorporacion: state.cuenta.fecha_incorporacion || undefined,
    latitud: state.cuenta.latitud || undefined,
    longitud: state.cuenta.longitud || undefined,
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
      uso_cfdi: state.extras.uso_cfdi,
      forma_pago: state.extras.forma_pago,
      metodo_pago: state.extras.metodo_pago,
      email_facturacion: state.extras.email_facturacion,
    }),
    direccion: cleanObject({
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
      nombre_asentamiento: state.extras.nombre_asentamiento,
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
  if (!state.persona.correo_principal.trim() && !state.persona.telefono_principal_e164.trim()) {
    return "Debes capturar teléfono o correo.";
  }
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
  if (
    (state.mode === "empresa_nueva" || state.mode === "persona_fisica_actividad_empresarial") &&
    !state.cuenta.tipo_persona.trim()
  ) {
    return "Selecciona el tipo de persona de la empresa.";
  }
  if (
    (state.mode === "empresa_existente" || state.mode === "empresa_nueva") &&
    !state.relacion.rol_en_cuenta.trim()
  ) {
    return "Define el rol de la persona dentro de la empresa.";
  }
  return null;
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

export function ContactCreateFlow({ open, onOpenChange, onCreated, initialMode = "empresa_existente" }: ContactCreateFlowProps) {
  const [state, dispatch] = React.useReducer(createReducer, INITIAL_STATE);
  const deferredAccountQuery = React.useDeferredValue(state.accountQuery);
  const [pendingDedupe, setPendingDedupe] = React.useState<PersonaAltaValidationResponse | null>(null);
  const [selectedPersonaReuseId, setSelectedPersonaReuseId] = React.useState("");
  const [selectedCuentaReuseId, setSelectedCuentaReuseId] = React.useState("");
  const [validationNotice, setValidationNotice] = React.useState<ValidationNoticeState | null>(null);

  React.useEffect(() => {
    if (!open) {
      dispatch({ type: "reset" });
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

  const review = React.useMemo(() => {
    const nombreCompleto = buildFullName(state.persona);
    const cuentaNombre =
      state.mode === "empresa_existente"
        ? state.cuenta.nombre_comercial
        : state.cuenta.nombre_comercial || state.cuenta.razon_social;
    return {
      persona: nombreCompleto,
      cuenta: cuentaNombre,
      relacion:
        state.mode === "persona_fisica_actividad_empresarial"
          ? "Automática"
          : state.mode === "solo_persona"
            ? ""
            : state.relacion.rol_en_cuenta,
    };
  }, [state]);

  const isContactMode = state.mode === "empresa_existente";
  const isCompanyMode = state.mode === "empresa_nueva";
  const isPfaeMode = state.mode === "persona_fisica_actividad_empresarial";
  const personSectionTitle =
    isContactMode
      ? "Datos del contacto"
      : isPfaeMode
        ? "Persona y negocio"
        : "Datos de la persona";
  const personSectionDescription =
    isContactMode
      ? "Captura la persona y su vínculo con una empresa ya existente."
      : isCompanyMode
        ? "Captura la persona responsable y los datos de la empresa."
        : "Captura la persona y la empresa en un solo flujo.";
  const relationSectionTitle =
    isPfaeMode
      ? "Vínculo principal"
      : "Vinculación con empresa";
  const relationSectionDescription =
    isPfaeMode
      ? "La relación principal se creará automáticamente al guardar."
      : "Define el rol real de la persona dentro de la empresa.";

  const submitLabel =
    isContactMode ? "Guardar contacto" : isCompanyMode ? "Guardar empresa" : "Guardar registro";

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
      const payload = buildPayload(state, dedupeDecision);
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

      const response = await fetch("/api/personas/alta", {
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
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-6xl">
        <DialogHeader className="space-y-2">
          <DialogTitle>Nuevo contacto</DialogTitle>
          <DialogDescription>
            Primero eliges qué quieres crear. Después completas solo el formulario que corresponda.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-5">
          <FormSection title="Tipo de alta" description="Elige el camino que mejor describe lo que vas a registrar.">
            <RadioGroup value={state.mode} onValueChange={(value) => dispatch({ type: "mode/set", mode: value as CreateMode })} className="grid gap-3 md:grid-cols-3">
              {[
                {
                  value: "empresa_nueva",
                  title: "Empresa",
                  description: "Datos de una empresa nueva con su contacto.",
                },
                {
                  value: "persona_fisica_actividad_empresarial",
                  title: "Persona física",
                  description: "Persona, negocio y relación principal automática.",
                },
                {
                  value: "empresa_existente",
                  title: "Contacto",
                  description: "Persona ligada a una empresa ya registrada.",
                },
              ].map((option) => (
                <label
                  key={option.value}
                  className={`flex cursor-pointer flex-col gap-2 rounded-xl border p-4 ${state.mode === option.value ? "border-foreground bg-muted/40" : "border-border/60 bg-background"}`}
                >
                  <div className="flex items-start gap-3">
                    <RadioGroupItem value={option.value} id={`mode-${option.value}`} />
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
                <Select
                  value={state.persona.origen || undefined}
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

          {isContactMode ? (
            <FormSection title="Empresa vinculada" description="Busca una empresa ya creada y selecciónala.">
              <div className="space-y-3">
                <Field label="Buscar empresa" hint="Busca por nombre, correo, teléfono o alias.">
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
                          <div className="text-xs text-muted-foreground">{[account.alias, account.correo, account.telefono].filter(Boolean).join(" · ") || "Sin datos adicionales"}</div>
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
              title={isPfaeMode ? "Empresa propia" : "Empresa"}
              description={isPfaeMode ? "Se prellena desde la persona y puedes ajustar los datos comerciales." : "Datos de la empresa que se persistirán."}
            >
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
                    disabled={isPfaeMode}
                  >
                    <option value="">Selecciona</option>
                    <option value="fisica">Física</option>
                    <option value="moral">Moral</option>
                  </select>
                </Field>
                <Field label="RFC">
                  <Input value={state.cuenta.rfc} onChange={(e) => dispatch({ type: "cuenta/set", field: "rfc", value: e.target.value })} />
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
                <Field label="Industria">
                  <Input value={state.cuenta.industria} onChange={(e) => dispatch({ type: "cuenta/set", field: "industria", value: e.target.value })} />
                </Field>
                <Field label="Segmento">
                  <Input value={state.cuenta.segmento} onChange={(e) => dispatch({ type: "cuenta/set", field: "segmento", value: e.target.value })} />
                </Field>
                <Field label="Tamaño">
                  <Input value={state.cuenta.tamano} onChange={(e) => dispatch({ type: "cuenta/set", field: "tamano", value: e.target.value })} />
                </Field>
                <Field label="Sitio web">
                  <Input value={state.cuenta.sitio_web} onChange={(e) => dispatch({ type: "cuenta/set", field: "sitio_web", value: e.target.value })} />
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

          {isContactMode || isCompanyMode ? (
            <FormSection title={relationSectionTitle} description={relationSectionDescription}>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Field label="Función en la empresa" hint="Este es el rol operativo; los checks marcan si además es principal, de facturación o representante legal.">
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
          ) : isPfaeMode ? (
            <FormSection title={relationSectionTitle} description={relationSectionDescription}>
              <div className="rounded-lg border border-dashed border-border/70 bg-background p-4 text-sm text-muted-foreground">
                Al guardar se creará automáticamente la relación principal para esta persona y su negocio.
              </div>
            </FormSection>
          ) : null}

          <FormSection title="Datos opcionales" description="Puedes omitirlos por ahora y completarlos más tarde.">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">Datos fiscales, país, estado y municipio con claves reales.</p>
              <Button type="button" variant="outline" size="sm" onClick={() => dispatch({ type: "extras/toggle" })}>
                {state.extrasOpen ? "Ocultar extras" : "Completar extras"}
              </Button>
            </div>
            {state.extrasOpen ? (
              <div className="space-y-4">
                <Field label="Uso CFDI">
                  <Input value={state.extras.uso_cfdi} onChange={(e) => dispatch({ type: "extras/set", field: "uso_cfdi", value: e.target.value })} />
                </Field>
                <Field label="Forma de pago">
                  <Input value={state.extras.forma_pago} onChange={(e) => dispatch({ type: "extras/set", field: "forma_pago", value: e.target.value })} />
                </Field>
                <Field label="Método de pago">
                  <Input value={state.extras.metodo_pago} onChange={(e) => dispatch({ type: "extras/set", field: "metodo_pago", value: e.target.value })} />
                </Field>
                <Field label="Email de facturación">
                  <Input value={state.extras.email_facturacion} onChange={(e) => dispatch({ type: "extras/set", field: "email_facturacion", value: e.target.value })} />
                </Field>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
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
            ) : null}
          </FormSection>

          <FormSection title="Resumen" description="Resumen de lo que se va a crear o vincular.">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div className="rounded-lg border border-border/60 bg-background p-3">
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Persona</div>
                <div className="mt-2 text-sm font-medium">{review.persona || "Sin nombre completo todavía"}</div>
                <div className="mt-1 text-xs text-muted-foreground">{state.persona.correo_principal || state.persona.telefono_principal_e164 || "Sin medio de contacto"}</div>
              </div>
              <div className="rounded-lg border border-border/60 bg-background p-3">
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Empresa</div>
                <div className="mt-2 text-sm font-medium">{review.cuenta || "No se creará empresa"}</div>
                <div className="mt-1 text-xs text-muted-foreground">{state.mode.replaceAll("_", " ")}</div>
              </div>
              <div className="rounded-lg border border-border/60 bg-background p-3">
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Vinculación</div>
                <div className="mt-2 text-sm font-medium">{review.relacion || "Sin relación"}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {state.mode === "solo_persona" ? "No aplica" : state.relacion.es_contacto_principal ? "Contacto principal" : "Relación secundaria"}
                </div>
              </div>
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
                        key={`persona-${candidate.id}`}
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
                  <div className="text-sm font-medium">Empresas candidatas</div>
                  {pendingDedupe.candidatos_cuenta.map((candidate) => {
                    const selected = selectedCuentaReuseId === candidate.id;
                    return (
                      <button
                        key={`cuenta-${candidate.id}`}
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
                  Cerrar revisión
                </Button>
              </div>
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

          <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
            <div className="rounded-2xl border border-border/60 bg-gradient-to-b from-muted/40 to-background p-4 shadow-sm">
              <div className="text-sm font-semibold">Resumen</div>
              <div className="mt-4 space-y-3">
                <div className="rounded-xl border border-border/60 bg-background p-3">
                  <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Contacto</div>
                  <div className="mt-1 text-sm font-semibold">{review.persona || "Pendiente"}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {state.persona.correo_principal || state.persona.telefono_principal_e164 || "Sin medio de contacto"}
                  </div>
                </div>
                <div className="rounded-xl border border-border/60 bg-background p-3">
                  <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Empresa</div>
                  <div className="mt-1 text-sm font-semibold">{review.cuenta || "No asociada"}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {state.mode === "solo_persona" ? "Contacto independiente" : state.mode.replaceAll("_", " ")}
                  </div>
                </div>
                <div className="rounded-xl border border-border/60 bg-background p-3">
                  <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Vinculación</div>
                  <div className="mt-1 text-sm font-semibold">{review.relacion || "Sin vínculo"}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {state.mode === "solo_persona"
                      ? "No aplica"
                      : state.relacion.es_contacto_principal
                        ? "Contacto principal"
                        : "Vínculo secundario"}
                  </div>
                </div>
              </div>
            </div>
          </aside>
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
