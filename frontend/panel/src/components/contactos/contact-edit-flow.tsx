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
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";

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
  origen: string;
  notas: string;
  propietario_usuario_id: string;
};

type CuentaDraft = {
  cuenta_id: string;
  nombre_comercial: string;
  razon_social: string;
  tipo_persona: "" | "fisica" | "moral";
  tipo_cuenta: string;
  rfc: string;
  industria: string;
  segmento: string;
  sitio_web: string;
  correo_principal: string;
  telefono_principal: string;
  notas: string;
};

type RelacionDraft = {
  rol_en_cuenta: string;
  puesto: string;
  es_contacto_principal: boolean;
  es_contacto_facturacion: boolean;
  es_representante_legal: boolean;
  activo: boolean;
  fecha_inicio: string;
  notas: string;
};

type ExtrasDraft = {
  uso_cfdi: string;
  forma_pago: string;
  metodo_pago: string;
  email_facturacion: string;
  pais: string;
  entidad: string;
  municipio: string;
  tipo_vialidad: string;
  nombre_vialidad: string;
  numero_exterior: string;
  numero_interior: string;
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
};
type NewRelationDraft = {
  cuenta_id: string;
  rol_en_cuenta: string;
  puesto: string;
  es_contacto_principal: boolean;
  es_contacto_facturacion: boolean;
  es_representante_legal: boolean;
  activo: boolean;
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
  | { type: "hydrate"; contactoId: string; detail: ContactDetail }
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
  contactoId: string | null;
  onSaved?: () => void;
};

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
    origen: "",
    notas: "",
    propietario_usuario_id: "",
  },
  cuenta: {
    cuenta_id: "",
    nombre_comercial: "",
    razon_social: "",
    tipo_persona: "",
    tipo_cuenta: "empresa",
    rfc: "",
    industria: "",
    segmento: "",
    sitio_web: "",
    correo_principal: "",
    telefono_principal: "",
    notas: "",
  },
  relacion: {
    rol_en_cuenta: "",
    puesto: "",
    es_contacto_principal: true,
    es_contacto_facturacion: false,
    es_representante_legal: false,
    activo: true,
    fecha_inicio: "",
    notas: "",
  },
  extras: {
    uso_cfdi: "",
    forma_pago: "",
    metodo_pago: "",
    email_facturacion: "",
    pais: "MX",
    entidad: "",
    municipio: "",
    tipo_vialidad: "",
    nombre_vialidad: "",
    numero_exterior: "",
    numero_interior: "",
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
    if (value !== null && value !== undefined) acc[key] = value;
    return acc;
  }, {});
  return next as Partial<T>;
}

function buildPayload(state: ContactEditState, dedupe?: DedupeDecision) {
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
    tipo_persona:
      state.mode === "persona_fisica_actividad_empresarial"
        ? "fisica"
        : state.cuenta.tipo_persona,
    tipo_cuenta:
      state.mode === "persona_fisica_actividad_empresarial"
        ? "persona_fisica_actividad_empresarial"
        : state.cuenta.tipo_cuenta,
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
      entidad: state.extras.entidad,
      municipio: state.extras.municipio,
      tipo_vialidad: state.extras.tipo_vialidad,
      nombre_vialidad: state.extras.nombre_vialidad,
      numero_exterior: state.extras.numero_exterior,
      numero_interior: state.extras.numero_interior,
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
      return {
        ...INITIAL_STATE,
        loadedId: action.contactoId,
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
          origen: readString(detail, "origen"),
          notas: readString(detail, "notes"),
          propietario_usuario_id: readString(detail, "propietario_usuario_id"),
        },
        cuenta: {
          ...INITIAL_STATE.cuenta,
          cuenta_id: readString(detail, "cuenta_id"),
          nombre_comercial: readString(detail, "company_name"),
          razon_social: readString(detail, "razon_social"),
          tipo_persona: (readString(detail, "persona_fisica_moral") as CuentaDraft["tipo_persona"]) || "",
          tipo_cuenta: readString(detail, "cuenta_tipo") || "empresa",
          rfc: readString(detail, "rfc"),
          industria: readString(detail, "tipo_industria"),
          sitio_web: readString(detail, "website"),
          correo_principal: readString(detail, "email_facturacion"),
          telefono_principal: readString(detail, "telefono_e164"),
          notas: "",
          segmento: "",
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
          notas: "",
        },
        extras: {
          ...INITIAL_STATE.extras,
          uso_cfdi: readString(detail, "uso_cfdi"),
          forma_pago: readString(detail, "forma_pago"),
          metodo_pago: readString(detail, "metodo_pago"),
          email_facturacion: readString(detail, "email_facturacion"),
          pais: readString(detail, "pais") || "MX",
          entidad: readString(detail, "entidad"),
          municipio: readString(detail, "municipio"),
          tipo_vialidad: readString(detail, "tipo_vialidad"),
          nombre_vialidad: readString(detail, "nombre_vialidad"),
          numero_exterior: readString(detail, "numero_exterior"),
          numero_interior: readString(detail, "numero_interior"),
          codigo_postal: readString(detail, "codigo_postal"),
        },
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

export function ContactEditFlow({ open, onOpenChange, contactoId, onSaved }: ContactEditFlowProps) {
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
  });

  React.useEffect(() => {
    if (!open) return;
    if (!contactoId) return;
    if (state.loadedId === contactoId) return;

    const controller = new AbortController();
    const run = async () => {
      dispatch({ type: "loading/set", value: true });
      dispatch({ type: "error/set", value: null });
      try {
        const response = await fetch(`/api/contactos/${encodeURIComponent(contactoId)}`, {
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
        dispatch({ type: "hydrate", contactoId, detail: body });
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          dispatch({ type: "error/set", value: "No se pudo cargar el contacto." });
        }
      } finally {
        dispatch({ type: "loading/set", value: false });
      }
    };

    run();
    return () => controller.abort();
  }, [open, contactoId, state.loadedId]);

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
    if (!contactoId) return;
    setRelationsLoading(true);
    try {
      const response = await fetch(`/api/personas/${encodeURIComponent(contactoId)}/relaciones`, {
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
        .map((item) => {
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
          };
        })
        .filter((item): item is AccountRelation => item !== null);
      setRelations(mapped);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudieron cargar las relaciones.");
      setRelations([]);
    } finally {
      setRelationsLoading(false);
    }
  }, [contactoId]);

  React.useEffect(() => {
    if (!open || !contactoId) return;
    void loadRelations();
  }, [open, contactoId, loadRelations]);

  const patchRelation = async (relationId: string, payload: Record<string, unknown>) => {
    if (!contactoId) return;
    setRelationBusyId(relationId);
    try {
      const response = await fetch(
        `/api/personas/${encodeURIComponent(contactoId)}/relaciones/${encodeURIComponent(relationId)}`,
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
    if (!contactoId) return;
    setRelationBusyId(relationId);
    try {
      const response = await fetch(
        `/api/personas/${encodeURIComponent(contactoId)}/relaciones/${encodeURIComponent(relationId)}/estado`,
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
    if (!contactoId) return;
    setRelationBusyId(relationId);
    try {
      const response = await fetch(
        `/api/personas/${encodeURIComponent(contactoId)}/relaciones/${encodeURIComponent(relationId)}`,
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
    if (!contactoId) return;
    if (!newRelation.cuenta_id.trim()) {
      toast.error("Debes indicar cuenta_id para crear la relacion.");
      return;
    }
    setRelationBusyId("new");
    try {
      const response = await fetch(`/api/personas/${encodeURIComponent(contactoId)}/relaciones`, {
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
    if (!contactoId) return;
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
        const previewResponse = await fetch(`/api/personas/${encodeURIComponent(contactoId)}/validar`, {
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

      const response = await fetch(`/api/personas/${encodeURIComponent(contactoId)}`, {
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-5xl">
        <DialogHeader className="space-y-2">
          <DialogTitle>Editar persona comercial</DialogTitle>
          <DialogDescription>
            {fullName ? `Contacto: ${fullName}` : "Actualiza persona, cuenta y relación."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {state.loading ? <p className="text-xs text-muted-foreground">Cargando...</p> : null}
          {state.error ? <p className="text-xs text-destructive">{state.error}</p> : null}

          <FormSection title="Datos de la persona">
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
            </div>
            <Field label="Notas">
              <Textarea value={state.persona.notas} onChange={(e) => dispatch({ type: "persona/set", field: "notas", value: e.target.value })} />
            </Field>
          </FormSection>

          <FormSection title="Contexto comercial">
            <RadioGroup value={state.mode} onValueChange={(value) => dispatch({ type: "mode/set", mode: value as CreateMode })} className="grid gap-3 md:grid-cols-3">
              {[
                { value: "solo_persona", title: "Solo persona", description: "Sin cuenta asociada." },
                { value: "empresa_existente", title: "Cuenta existente", description: "Vincula a una cuenta ya creada." },
                { value: "empresa_nueva", title: "Nueva cuenta", description: "Crea una cuenta nueva." },
                { value: "persona_fisica_actividad_empresarial", title: "PFAE", description: "Cuenta propia vinculada." },
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

          {state.mode === "empresa_existente" ? (
            <FormSection title="Cuenta asociada" description="Busca una cuenta existente y selecciónala.">
              <div className="space-y-3">
                <Field label="Buscar cuenta" hint="Busca por nombre, correo, teléfono o alias.">
                  <Input value={state.accountQuery} onChange={(e) => dispatch({ type: "account-query/set", value: e.target.value })} placeholder="Escribe al menos 2 caracteres" />
                </Field>
                {state.accountLoading ? <p className="text-xs text-muted-foreground">Buscando cuentas...</p> : null}
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

          {state.mode === "empresa_nueva" || state.mode === "persona_fisica_actividad_empresarial" ? (
            <FormSection title="Cuenta" description="Datos mínimos de la cuenta (y fiscales opcionales abajo).">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Field label="Nombre comercial">
                  <Input value={state.cuenta.nombre_comercial} onChange={(e) => dispatch({ type: "cuenta/set", field: "nombre_comercial", value: e.target.value })} />
                </Field>
                <Field label="Razón social">
                  <Input value={state.cuenta.razon_social} onChange={(e) => dispatch({ type: "cuenta/set", field: "razon_social", value: e.target.value })} />
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
                <Field label="Sitio web">
                  <Input value={state.cuenta.sitio_web} onChange={(e) => dispatch({ type: "cuenta/set", field: "sitio_web", value: e.target.value })} />
                </Field>
              </div>
            </FormSection>
          ) : null}

          {state.mode !== "solo_persona" ? (
            <FormSection title="Relación persona-cuenta">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Field label="Rol en la cuenta">
                  <Input value={state.relacion.rol_en_cuenta} onChange={(e) => dispatch({ type: "relacion/set", field: "rol_en_cuenta", value: e.target.value })} placeholder="dueno, compras, facturacion..." />
                </Field>
                <Field label="Puesto en esa cuenta">
                  <Input value={state.relacion.puesto} onChange={(e) => dispatch({ type: "relacion/set", field: "puesto", value: e.target.value })} />
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

          {contactoId ? (
            <FormSection title="Relaciones existentes" description="Administra todas las relaciones de esta persona con cuentas.">
              {relationsLoading ? <p className="text-xs text-muted-foreground">Cargando relaciones...</p> : null}
              {!relationsLoading && !relations.length ? (
                <p className="text-xs text-muted-foreground">No hay relaciones registradas.</p>
              ) : null}
              <div className="space-y-3">
                {relations.map((relation) => (
                  <div key={relation.id} className="rounded-lg border border-border/60 p-3">
                    <div className="mb-2 text-xs text-muted-foreground">
                      cuenta_id: {relation.cuenta_id}
                    </div>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      <Field label="Rol">
                        <Input
                          value={relation.rol_en_cuenta}
                          onChange={(e) =>
                            setRelations((prev) =>
                              prev.map((item) =>
                                item.id === relation.id ? { ...item, rol_en_cuenta: e.target.value } : item,
                              ),
                            )
                          }
                        />
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
                    </div>
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
                        Facturación
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
                <div className="mb-2 text-sm font-medium">Agregar relación</div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <Field label="Buscar cuenta">
                    <Input
                      value={relationAccountQuery}
                      onChange={(e) => setRelationAccountQuery(e.target.value)}
                      placeholder="Nombre, RFC, correo o teléfono"
                    />
                  </Field>
                  <Field label="Rol en cuenta">
                    <Input
                      value={newRelation.rol_en_cuenta}
                      onChange={(e) => setNewRelation((prev) => ({ ...prev, rol_en_cuenta: e.target.value }))}
                    />
                  </Field>
                  <Field label="Puesto">
                    <Input
                      value={newRelation.puesto}
                      onChange={(e) => setNewRelation((prev) => ({ ...prev, puesto: e.target.value }))}
                    />
                  </Field>
                </div>
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
                          <div className="text-[11px] text-muted-foreground">id: {account.id}</div>
                        </button>
                      );
                    })}
                  </div>
                ) : null}
                {newRelation.cuenta_id ? (
                  <p className="mt-2 text-xs text-muted-foreground">Cuenta seleccionada: {newRelation.cuenta_id}</p>
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
                    Facturación
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
                    {relationBusyId === "new" ? "Creando..." : "Agregar relación"}
                  </Button>
                </div>
              </div>
            </FormSection>
          ) : null}

          <FormSection title="Extras" description="Completa ahora o deja para después.">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={state.extrasOpen} onCheckedChange={(v) => dispatch({ type: "extras/toggle", value: Boolean(v) })} />
              Editar fiscales y dirección
            </label>
            {state.extrasOpen ? (
              <div className="mt-3 space-y-4">
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
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <Field label="País">
                    <Input value={state.extras.pais} onChange={(e) => dispatch({ type: "extras/set", field: "pais", value: e.target.value })} />
                  </Field>
                  <Field label="Entidad">
                    <Input value={state.extras.entidad} onChange={(e) => dispatch({ type: "extras/set", field: "entidad", value: e.target.value })} />
                  </Field>
                  <Field label="Municipio">
                    <Input value={state.extras.municipio} onChange={(e) => dispatch({ type: "extras/set", field: "municipio", value: e.target.value })} />
                  </Field>
                  <Field label="Código postal">
                    <Input value={state.extras.codigo_postal} onChange={(e) => dispatch({ type: "extras/set", field: "codigo_postal", value: e.target.value })} />
                  </Field>
                </div>
              </div>
            ) : null}
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
          <Button type="button" onClick={() => void submit()} disabled={state.saving || state.loading || !contactoId}>
            {state.saving ? "Guardando..." : "Guardar cambios"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
