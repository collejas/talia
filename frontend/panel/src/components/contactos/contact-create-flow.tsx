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
  onCreated?: () => void;
};

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
    origen: "manual_panel_contactos",
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
          razon_social: nombreCompleto || state.cuenta.razon_social,
          nombre_comercial: state.cuenta.nombre_comercial || nombreCompleto,
          tipo_persona: "fisica",
          tipo_cuenta: "persona_fisica_actividad_empresarial",
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

function buildPayload(state: ContactCreateState) {
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
  };
}

function validateState(state: ContactCreateState): string | null {
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

export function ContactCreateFlow({ open, onOpenChange, onCreated }: ContactCreateFlowProps) {
  const [state, dispatch] = React.useReducer(createReducer, INITIAL_STATE);
  const deferredAccountQuery = React.useDeferredValue(state.accountQuery);

  React.useEffect(() => {
    if (!open) {
      dispatch({ type: "reset" });
      return;
    }
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
      relacion: state.mode === "solo_persona" ? "" : state.relacion.rol_en_cuenta,
    };
  }, [state]);

  const submit = async () => {
    const validationError = validateState(state);
    if (validationError) {
      dispatch({ type: "error/set", value: validationError });
      toast.error(validationError);
      return;
    }

    dispatch({ type: "saving/set", value: true });
    dispatch({ type: "error/set", value: null });
    try {
      const response = await fetch("/api/personas/alta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload(state)),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(body.error || `Error ${response.status}`);
      }
      toast.success("Alta creada.");
      onOpenChange(false);
      onCreated?.();
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo guardar.";
      dispatch({ type: "error/set", value: message });
      toast.error(message);
    } finally {
      dispatch({ type: "saving/set", value: false });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-5xl">
        <DialogHeader className="space-y-2">
          <DialogTitle>Nueva persona comercial</DialogTitle>
          <DialogDescription>
            Primero se captura la persona. Después defines si se queda sola, si pertenece a una cuenta o si opera como persona física con actividad empresarial.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <FormSection title="Datos de la persona" description="Identidad humana y medio de contacto principal.">
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

          <FormSection title="Contexto comercial" description="Define si la persona se queda sola, se liga a una empresa o es PFAE.">
            <RadioGroup value={state.mode} onValueChange={(value) => dispatch({ type: "mode/set", mode: value as CreateMode })} className="grid gap-3 md:grid-cols-3">
              {[
                {
                  value: "solo_persona",
                  title: "Solo persona por ahora",
                  description: "No se asociará a una cuenta en este momento.",
                },
                {
                  value: "empresa_existente",
                  title: "Trabaja para una empresa",
                  description: "Selecciona una cuenta existente para relacionar a la persona.",
                },
                {
                  value: "empresa_nueva",
                  title: "Nueva empresa",
                  description: "Crea una cuenta nueva y vincúlala con esta persona.",
                },
                {
                  value: "persona_fisica_actividad_empresarial",
                  title: "Persona física con actividad empresarial",
                  description: "Se crea una cuenta propia vinculada a esta persona.",
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
            <FormSection
              title={state.mode === "persona_fisica_actividad_empresarial" ? "Cuenta propia" : "Nueva cuenta"}
              description={state.mode === "persona_fisica_actividad_empresarial" ? "Se prellena desde la persona y puedes ajustar los datos comerciales." : "Datos mínimos para crear la cuenta."}
            >
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
                <Field label="Correo principal">
                  <Input value={state.cuenta.correo_principal} onChange={(e) => dispatch({ type: "cuenta/set", field: "correo_principal", value: e.target.value })} />
                </Field>
                <Field label="Teléfono principal">
                  <Input value={state.cuenta.telefono_principal} onChange={(e) => dispatch({ type: "cuenta/set", field: "telefono_principal", value: e.target.value })} />
                </Field>
                <Field label="Industria">
                  <Input value={state.cuenta.industria} onChange={(e) => dispatch({ type: "cuenta/set", field: "industria", value: e.target.value })} />
                </Field>
                <Field label="Segmento">
                  <Input value={state.cuenta.segmento} onChange={(e) => dispatch({ type: "cuenta/set", field: "segmento", value: e.target.value })} />
                </Field>
                <Field label="Sitio web">
                  <Input value={state.cuenta.sitio_web} onChange={(e) => dispatch({ type: "cuenta/set", field: "sitio_web", value: e.target.value })} />
                </Field>
              </div>
            </FormSection>
          ) : null}

          {state.mode !== "solo_persona" ? (
            <FormSection title="Relación persona-cuenta" description="Define el rol real de la persona dentro de la cuenta.">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Field label="Rol en la cuenta">
                  <Input value={state.relacion.rol_en_cuenta} onChange={(e) => dispatch({ type: "relacion/set", field: "rol_en_cuenta", value: e.target.value })} placeholder="dueno, compras, facturacion..." />
                </Field>
                <Field label="Puesto en esa cuenta">
                  <Input value={state.relacion.puesto} onChange={(e) => dispatch({ type: "relacion/set", field: "puesto", value: e.target.value })} />
                </Field>
                <Field label="Fecha de inicio">
                  <Input type="date" value={state.relacion.fecha_inicio} onChange={(e) => dispatch({ type: "relacion/set", field: "fecha_inicio", value: e.target.value })} />
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
                  <span className="text-sm">Relación activa</span>
                </label>
              </div>
            </FormSection>
          ) : null}

          <FormSection title="Información adicional" description="Puedes omitirla por ahora y completarla más tarde.">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">Datos fiscales y dirección básicos.</p>
              <Button type="button" variant="outline" size="sm" onClick={() => dispatch({ type: "extras/toggle" })}>
                {state.extrasOpen ? "Ocultar extras" : "Completar extras"}
              </Button>
            </div>
            {state.extrasOpen ? (
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
                <Field label="Email de facturación">
                  <Input value={state.extras.email_facturacion} onChange={(e) => dispatch({ type: "extras/set", field: "email_facturacion", value: e.target.value })} />
                </Field>
                <Field label="País">
                  <Input value={state.extras.pais} onChange={(e) => dispatch({ type: "extras/set", field: "pais", value: e.target.value })} />
                </Field>
                <Field label="Entidad">
                  <Input value={state.extras.entidad} onChange={(e) => dispatch({ type: "extras/set", field: "entidad", value: e.target.value })} />
                </Field>
                <Field label="Municipio">
                  <Input value={state.extras.municipio} onChange={(e) => dispatch({ type: "extras/set", field: "municipio", value: e.target.value })} />
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
                <Field label="Número interior">
                  <Input value={state.extras.numero_interior} onChange={(e) => dispatch({ type: "extras/set", field: "numero_interior", value: e.target.value })} />
                </Field>
                <Field label="Código postal">
                  <Input value={state.extras.codigo_postal} onChange={(e) => dispatch({ type: "extras/set", field: "codigo_postal", value: e.target.value })} />
                </Field>
              </div>
            ) : null}
          </FormSection>

          <FormSection title="Confirmación" description="Resumen de lo que se va a crear o vincular.">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div className="rounded-lg border border-border/60 bg-background p-3">
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Persona</div>
                <div className="mt-2 text-sm font-medium">{review.persona || "Sin nombre completo todavía"}</div>
                <div className="mt-1 text-xs text-muted-foreground">{state.persona.correo_principal || state.persona.telefono_principal_e164 || "Sin medio de contacto"}</div>
              </div>
              <div className="rounded-lg border border-border/60 bg-background p-3">
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Cuenta</div>
                <div className="mt-2 text-sm font-medium">{review.cuenta || "No se creará cuenta"}</div>
                <div className="mt-1 text-xs text-muted-foreground">{state.mode.replaceAll("_", " ")}</div>
              </div>
              <div className="rounded-lg border border-border/60 bg-background p-3">
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Relación</div>
                <div className="mt-2 text-sm font-medium">{review.relacion || "Sin relación"}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {state.mode === "solo_persona" ? "No aplica" : state.relacion.es_contacto_principal ? "Contacto principal" : "Relación secundaria"}
                </div>
              </div>
            </div>
          </FormSection>

          {state.error ? <p className="text-xs text-destructive">{state.error}</p> : null}

          <div className="flex flex-wrap gap-2">
            <Button type="button" disabled={state.saving} onClick={submit}>
              {state.saving ? "Guardando..." : state.mode === "solo_persona" ? "Guardar solo persona" : "Guardar alta"}
            </Button>
            <Button type="button" variant="outline" disabled={state.saving} onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
