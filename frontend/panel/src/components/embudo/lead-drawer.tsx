"use client";

import { useEffect, useMemo, useState } from "react";
import type { CheckedState } from "@radix-ui/react-checkbox";

import type { EmbudoCard, EmbudoStage } from "@/lib/embudo/data";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { LeadActionResult } from "@/lib/embudo/actions";

export type LeadDrawerSubmitPayload = {
  contacto: Record<string, unknown>;
  tarjeta: Record<string, unknown>;
  mergeMetadata?: boolean;
};

type LeadDrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentStage: EmbudoStage | null;
  allStages: EmbudoStage[];
  card: EmbudoCard | null;
  onSubmit: (payload: LeadDrawerSubmitPayload) => Promise<LeadActionResult>;
};

type FormState = {
  nombre: string;
  correo: string;
  telefono: string;
  monto: string;
  moneda: string;
  probabilidad: string;
};

type DrawerPrepOption = {
  value: string;
  label: string;
};

type DrawerPrepFieldType =
  | "text"
  | "textarea"
  | "number"
  | "date"
  | "datetime"
  | "select"
  | "checkbox"
  | "url";

type DrawerPrepFieldDefinition = {
  key: string;
  type: DrawerPrepFieldType;
  label: string;
  description?: string;
  placeholder?: string;
  required?: boolean;
  options?: DrawerPrepOption[];
  suffix?: string;
};

type DrawerPrepSectionDefinition = {
  key: string;
  title: string;
  description?: string;
  order?: number;
  fields: DrawerPrepFieldDefinition[];
};

type DrawerPrepDefinition = {
  version?: number;
  sections: DrawerPrepSectionDefinition[];
};

type DrawerDefinition = {
  sections: DrawerPrepSectionDefinition[];
  fieldMap: Map<string, DrawerPrepFieldDefinition>;
};

type StagePrepState = Record<string, Record<string, string | boolean>>;
type StagePrepPayload = Record<string, Record<string, unknown>>;

type DrawerStageGroup = {
  stage: EmbudoStage;
  sections: DrawerPrepSectionDefinition[];
};

const EMPTY_STATE: FormState = {
  nombre: "",
  correo: "",
  telefono: "",
  monto: "",
  moneda: "MXN",
  probabilidad: "",
};

const ALLOWED_TYPES: Set<DrawerPrepFieldType> = new Set([
  "text",
  "textarea",
  "number",
  "date",
  "datetime",
  "select",
  "checkbox",
  "url",
]);

export function LeadDrawer({ open, onOpenChange, currentStage, allStages, card, onSubmit }: LeadDrawerProps) {
  const stageName = currentStage?.nombre ?? "Sin etapa";

  const drawerDefinitions = useMemo(() => buildDrawerDefinitions(allStages), [allStages]);

  const initialStagePrepRaw = useMemo(() => extractStagePrepFromCard(card), [card]);
  const initialStagePrepState = useMemo(
    () => convertStagePrepToState(initialStagePrepRaw, drawerDefinitions),
    [initialStagePrepRaw, drawerDefinitions],
  );
  const [stagePrep, setStagePrep] = useState<StagePrepState>(initialStagePrepState);

  const initialStagePrepPayload = useMemo(
    () => buildStagePrepPayload(initialStagePrepState, drawerDefinitions),
    [initialStagePrepState, drawerDefinitions],
  );

  const upcomingStageGroups = useMemo(
    () => buildUpcomingStageGroups(allStages, currentStage, drawerDefinitions),
    [allStages, currentStage, drawerDefinitions],
  );

  const initialFormState = useMemo<FormState>(() => {
    if (!card) return EMPTY_STATE;
    return {
      nombre: card.nombre ?? "",
      correo: card.correo ?? "",
      telefono: card.telefono ?? "",
      monto: typeof card.monto === "number" ? String(card.monto) : "",
      moneda: card.moneda || "MXN",
      probabilidad:
        typeof card.probabilidad === "number" && !Number.isNaN(card.probabilidad)
          ? String(Math.round(card.probabilidad))
          : "",
    };
  }, [card]);

  const [form, setForm] = useState<FormState>(initialFormState);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setForm(initialFormState);
    setStagePrep(initialStagePrepState);
    setError(null);
    setPending(false);
  }, [initialFormState, initialStagePrepState, open]);

  const handleInputChange = (field: keyof FormState) => (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleStageFieldChange = (stageCode: string, field: DrawerPrepFieldDefinition, value: string | boolean) => {
    setStagePrep((prev) => {
      const currentValues = prev[stageCode] ?? {};
      const nextValues = { ...currentValues };

      if (field.type === "checkbox") {
        nextValues[field.key] = value === true;
      } else {
        const stringValue = typeof value === "string" ? value : "";
        if (stringValue.trim() === "") {
          delete nextValues[field.key];
        } else {
          nextValues[field.key] = stringValue;
        }
      }

      if (Object.keys(nextValues).length === 0) {
        const remaining = { ...prev };
        delete remaining[stageCode];
        return remaining;
      }

      return {
        ...prev,
        [stageCode]: nextValues,
      };
    });
  };

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!card) {
      setError("No se encontró la tarjeta seleccionada.");
      return;
    }

    const contactoUpdates: Record<string, unknown> = {};
    const tarjetaUpdates: Record<string, unknown> = {};

    if (form.nombre !== initialFormState.nombre) {
      contactoUpdates.nombre_completo = form.nombre.trim() === "" ? null : form.nombre.trim();
    }
    if (form.correo !== initialFormState.correo) {
      contactoUpdates.correo = form.correo.trim() === "" ? null : form.correo.trim();
    }
    if (form.telefono !== initialFormState.telefono) {
      contactoUpdates.telefono_e164 = form.telefono.trim() === "" ? null : form.telefono.trim();
    }

    const montoValue = form.monto.trim();
    if (montoValue !== initialFormState.monto) {
      if (montoValue === "") {
        tarjetaUpdates.monto_estimado = null;
      } else {
        const parsed = Number(montoValue);
        if (Number.isNaN(parsed)) {
          setError("El monto debe ser un número válido.");
          return;
        }
        tarjetaUpdates.monto_estimado = parsed;
      }
    }

    if (form.moneda !== initialFormState.moneda) {
      tarjetaUpdates.moneda = form.moneda.trim() === "" ? "MXN" : form.moneda.trim().toUpperCase();
    }

    const probValue = form.probabilidad.trim();
    if (probValue !== initialFormState.probabilidad) {
      if (probValue === "") {
        tarjetaUpdates.probabilidad_override = null;
      } else {
        const parsed = Number(probValue);
        if (Number.isNaN(parsed) || parsed < 0 || parsed > 100) {
          setError("La probabilidad debe ser un número entre 0 y 100.");
          return;
        }
        tarjetaUpdates.probabilidad_override = parsed;
      }
    }

    const missingRequired = findMissingRequiredField(upcomingStageGroups, stagePrep);
    if (missingRequired) {
      setError(
        `Completa el campo “${missingRequired.field.label}” en la etapa “${missingRequired.stage.nombre}”.`,
      );
      return;
    }

    const normalizedStagePrep = buildStagePrepPayload(stagePrep, drawerDefinitions);
    const stagePrepChanged = !areStagePrepsEqual(normalizedStagePrep, initialStagePrepPayload);

    if (stagePrepChanged) {
      tarjetaUpdates.metadata = {
        stage_prep: normalizedStagePrep,
      };
    }

    if (!Object.keys(contactoUpdates).length && !Object.keys(tarjetaUpdates).length) {
      setError("No hay cambios por guardar.");
      return;
    }

    setPending(true);
    const result = await onSubmit({
      contacto: contactoUpdates,
      tarjeta: tarjetaUpdates,
      mergeMetadata: true,
    });
    setPending(false);

    if (!result.ok) {
      setError(result.error || "Ocurrió un error al guardar los cambios.");
      return;
    }

    setError(null);
    onOpenChange(false);
  }

  const renderField = (stageCode: string, field: DrawerPrepFieldDefinition) => {
    const stageValues = stagePrep[stageCode] ?? {};
    const rawValue = stageValues[field.key];
    const baseId = `${stageCode}-${field.key}`;

    switch (field.type) {
      case "checkbox": {
        const checked = rawValue === true;
        const handleCheckedChange = (state: CheckedState) => {
          handleStageFieldChange(stageCode, field, state === true);
        };
        return (
          <div className="flex items-start gap-3">
            <Checkbox
              id={baseId}
              checked={checked}
              onCheckedChange={handleCheckedChange}
              disabled={pending}
            />
            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground" htmlFor={baseId}>
                {field.label}
                {field.required ? " *" : ""}
              </label>
              {field.description ? (
                <p className="text-xs text-muted-foreground">{field.description}</p>
              ) : null}
            </div>
          </div>
        );
      }
      case "textarea": {
        const value = typeof rawValue === "string" ? rawValue : "";
        return (
          <div className="grid gap-2">
            <label className="text-xs font-medium text-muted-foreground" htmlFor={baseId}>
              {field.label}
              {field.required ? " *" : ""}
            </label>
            <Textarea
              id={baseId}
              value={value}
              onChange={(event) => handleStageFieldChange(stageCode, field, event.target.value)}
              placeholder={field.placeholder}
              disabled={pending}
            />
            {field.description ? (
              <p className="text-xs text-muted-foreground">{field.description}</p>
            ) : null}
          </div>
        );
      }
      case "select": {
        const value = typeof rawValue === "string" ? rawValue : "";
        const options = field.options ?? [];
        return (
          <div className="grid gap-2">
            <label className="text-xs font-medium text-muted-foreground" htmlFor={`${baseId}-select`}>
              {field.label}
              {field.required ? " *" : ""}
            </label>
            <Select
              value={value}
              onValueChange={(next) => handleStageFieldChange(stageCode, field, next)}
              disabled={pending || !options.length}
            >
              <SelectTrigger id={`${baseId}-select`} size="default">
                <SelectValue placeholder={field.placeholder ?? "Selecciona una opción"} />
              </SelectTrigger>
              <SelectContent>
                {!field.required ? (
                  <SelectItem value="">Sin seleccionar</SelectItem>
                ) : null}
                {options.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {field.description ? (
              <p className="text-xs text-muted-foreground">{field.description}</p>
            ) : null}
          </div>
        );
      }
      default: {
        const value = typeof rawValue === "string" ? rawValue : "";
        const inputType = resolveInputType(field.type);
        const placeholder = field.placeholder;
        const displayValue =
          field.type === "datetime" ? toDateTimeLocalInput(value) : value;
        return (
          <div className="grid gap-2">
            <label className="text-xs font-medium text-muted-foreground" htmlFor={baseId}>
              {field.label}
              {field.required ? " *" : ""}
              {field.suffix ? <span className="ml-1 text-[11px] text-muted-foreground">({field.suffix})</span> : null}
            </label>
            <Input
              id={baseId}
              type={inputType}
              value={displayValue}
              placeholder={placeholder}
              disabled={pending}
              onChange={(event) => {
                const nextValue =
                  field.type === "datetime" ? event.target.value : event.target.value;
                handleStageFieldChange(stageCode, field, nextValue);
              }}
            />
            {field.description ? (
              <p className="text-xs text-muted-foreground">{field.description}</p>
            ) : null}
          </div>
        );
      }
    }
  };

  const hasUpcomingSections = upcomingStageGroups.length > 0;

  return (
    <Drawer open={open} onOpenChange={onOpenChange} direction="right">
      <DrawerContent className="data-[vaul-drawer-direction=right]:w-full data-[vaul-drawer-direction=right]:max-w-md">
        <DrawerHeader className="items-start">
          <DrawerTitle>{card?.nombre ?? "Lead sin nombre"}</DrawerTitle>
          <DrawerDescription className="flex flex-col gap-1 text-left">
            <span>Etapa: {stageName}</span>
            <span className="text-xs text-muted-foreground">ID: {card?.tarjetaId ?? "—"}</span>
          </DrawerDescription>
        </DrawerHeader>

        <form onSubmit={handleSubmit} className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4">
          <section className="space-y-3">
            <h4 className="text-sm font-semibold text-foreground">Contacto</h4>
            <div className="grid gap-2">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="lead-nombre">
                Nombre
              </label>
              <Input
                id="lead-nombre"
                value={form.nombre}
                onChange={handleInputChange("nombre")}
                placeholder="Nombre del contacto"
                disabled={pending}
              />
            </div>
            <div className="grid gap-2">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="lead-correo">
                Correo
              </label>
              <Input
                id="lead-correo"
                value={form.correo}
                onChange={handleInputChange("correo")}
                placeholder="correo@ejemplo.com"
                type="email"
                disabled={pending}
              />
            </div>
            <div className="grid gap-2">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="lead-telefono">
                Teléfono (E.164)
              </label>
              <Input
                id="lead-telefono"
                value={form.telefono}
                onChange={handleInputChange("telefono")}
                placeholder="+52..."
                disabled={pending}
              />
            </div>
          </section>

          <section className="space-y-3">
            <h4 className="text-sm font-semibold text-foreground">Lead</h4>
            <div className="grid gap-2">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="lead-monto">
                Monto estimado
              </label>
              <Input
                id="lead-monto"
                value={form.monto}
                onChange={handleInputChange("monto")}
                placeholder="0"
                disabled={pending}
              />
            </div>
            <div className="grid gap-2">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="lead-moneda">
                Moneda
              </label>
              <Input
                id="lead-moneda"
                value={form.moneda}
                onChange={handleInputChange("moneda")}
                placeholder="MXN"
                maxLength={3}
                disabled={pending}
              />
            </div>
            <div className="grid gap-2">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="lead-probabilidad">
                Probabilidad (%)
              </label>
              <Input
                id="lead-probabilidad"
                value={form.probabilidad}
                onChange={handleInputChange("probabilidad")}
                placeholder="0-100"
                disabled={pending}
              />
            </div>
          </section>

          {hasUpcomingSections ? (
            <section className="space-y-4">
              <div className="space-y-1">
                <h4 className="text-sm font-semibold text-foreground">Próximas etapas</h4>
                <p className="text-xs text-muted-foreground">
                  Completa la información para preparar el avance del lead en cada etapa.
                </p>
              </div>
              <div className="space-y-4">
                {upcomingStageGroups.map(({ stage, sections }) => {
                  const stageDescription = readStageMetaString(stage.metadatos, "descripcion");
                  return (
                    <div key={stage.id} className="space-y-4 rounded-lg border border-border/60 p-4">
                      <div>
                        <h5 className="text-sm font-semibold text-foreground">{stage.nombre}</h5>
                        {stageDescription ? (
                          <p className="text-xs text-muted-foreground">{stageDescription}</p>
                        ) : null}
                      </div>
                      {sections.map((section) => (
                      <div key={`${stage.codigo}-${section.key}`} className="space-y-3">
                        <div>
                          <h6 className="text-xs font-semibold uppercase text-muted-foreground">
                            {section.title}
                          </h6>
                          {section.description ? (
                            <p className="text-xs text-muted-foreground">{section.description}</p>
                          ) : null}
                        </div>
                        <div className="space-y-3">
                          {section.fields.map((field) => (
                            <div key={`${stage.codigo}-${field.key}`} className="space-y-2">
                              {renderField(stage.codigo, field)}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                    </div>
                  );
                })}
              </div>
            </section>
          ) : null}

          {error ? (
            <p className="rounded border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error}
            </p>
          ) : null}

          <DrawerFooter className="mt-4 space-y-2">
            <Button type="submit" disabled={pending || !card} className="w-full">
              {pending ? "Guardando..." : "Guardar cambios"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              Cancelar
            </Button>
          </DrawerFooter>
        </form>
      </DrawerContent>
    </Drawer>
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function parseDrawerPrepDefinition(meta: Record<string, unknown>): DrawerPrepDefinition | null {
  const candidate = meta["drawer_prep"];
  if (!isRecord(candidate)) return null;

  const sectionsCandidate = candidate.sections;
  if (!Array.isArray(sectionsCandidate)) return null;

  const sections: DrawerPrepSectionDefinition[] = [];

  for (const rawSection of sectionsCandidate) {
    if (!isRecord(rawSection)) continue;
    const sectionKey = typeof rawSection.key === "string" ? rawSection.key : null;
    if (!sectionKey) continue;

    const rawFields = Array.isArray(rawSection.fields) ? rawSection.fields : [];
    const fields: DrawerPrepFieldDefinition[] = [];

    for (const rawField of rawFields) {
      if (!isRecord(rawField)) continue;
      const key = typeof rawField.key === "string" ? rawField.key : null;
      const type = typeof rawField.type === "string" ? (rawField.type as DrawerPrepFieldType) : null;
      const label = typeof rawField.label === "string" ? rawField.label : null;

      if (!key || !label || !type || !ALLOWED_TYPES.has(type)) continue;

      const options =
        Array.isArray(rawField.options) && type === "select"
          ? rawField.options
              .filter(isRecord)
              .map((option) => {
                const value = typeof option.value === "string" ? option.value : null;
                const optionLabel = typeof option.label === "string" ? option.label : null;
                if (!value || !optionLabel) return null;
                return { value, label: optionLabel } satisfies DrawerPrepOption;
              })
              .filter((item): item is DrawerPrepOption => !!item)
          : undefined;

      fields.push({
        key,
        type,
        label,
        description: typeof rawField.description === "string" ? rawField.description : undefined,
        placeholder: typeof rawField.placeholder === "string" ? rawField.placeholder : undefined,
        required: typeof rawField.required === "boolean" ? rawField.required : undefined,
        options,
        suffix: typeof rawField.suffix === "string" ? rawField.suffix : undefined,
      });
    }

    if (!fields.length) continue;

    sections.push({
      key: sectionKey,
      title: typeof rawSection.title === "string" ? rawSection.title : sectionKey,
      description: typeof rawSection.description === "string" ? rawSection.description : undefined,
      order: typeof rawSection.order === "number" ? rawSection.order : undefined,
      fields,
    });
  }

  if (!sections.length) return null;

  sections.sort((a, b) => (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER));

  return {
    version: typeof candidate.version === "number" ? candidate.version : undefined,
    sections,
  };
}

function buildDrawerDefinitions(stages: EmbudoStage[]): Map<string, DrawerDefinition> {
  const map = new Map<string, DrawerDefinition>();

  for (const stage of stages) {
    const meta = stage.metadatos;
    if (!isRecord(meta)) continue;

    const definition = parseDrawerPrepDefinition(meta);
    if (!definition) continue;

    const fieldMap = new Map<string, DrawerPrepFieldDefinition>();
    definition.sections.forEach((section) => {
      section.fields.forEach((field) => {
        fieldMap.set(field.key, field);
      });
    });

    map.set(stage.codigo, {
      sections: definition.sections,
      fieldMap,
    });
  }

  return map;
}

function extractStagePrepFromCard(card: EmbudoCard | null): StagePrepPayload {
  if (!card) return {};
  const metadata = card.metadata;
  if (!isRecord(metadata)) return {};
  const stagePrepCandidate = metadata.stage_prep;
  if (!isRecord(stagePrepCandidate)) return {};

  const result: StagePrepPayload = {};
  for (const [stageCode, rawValue] of Object.entries(stagePrepCandidate)) {
    if (!isRecord(rawValue)) continue;
    result[stageCode] = rawValue;
  }
  return result;
}

function convertStagePrepToState(
  payload: StagePrepPayload,
  definitions: Map<string, DrawerDefinition>,
): StagePrepState {
  const state: StagePrepState = {};

  for (const [stageCode, values] of Object.entries(payload)) {
    const fieldMap = definitions.get(stageCode)?.fieldMap;
    const stageState: Record<string, string | boolean> = {};

    for (const [fieldKey, value] of Object.entries(values)) {
      const field = fieldMap?.get(fieldKey);
      if (field?.type === "checkbox") {
        stageState[fieldKey] = value === true;
        continue;
      }
      if (value === null || value === undefined) continue;
      let stringValue = "";
      if (typeof value === "string") {
        stringValue = value;
      } else if (typeof value === "number") {
        stringValue = Number.isFinite(value) ? String(value) : "";
      } else if (typeof value === "boolean") {
        stringValue = value ? "true" : "";
      } else {
        stringValue = String(value);
      }

      if (field?.type === "datetime") {
        stringValue = toDateTimeLocalInput(stringValue);
      }

      if (stringValue !== "") {
        stageState[fieldKey] = stringValue;
      }
    }

    if (Object.keys(stageState).length) {
      state[stageCode] = stageState;
    }
  }

  return state;
}

function buildStagePrepPayload(
  state: StagePrepState,
  definitions: Map<string, DrawerDefinition>,
): StagePrepPayload {
  const stageCodes = Object.keys(state).sort((a, b) => a.localeCompare(b, "es"));
  const payload: StagePrepPayload = {};

  for (const stageCode of stageCodes) {
    const fieldMap = definitions.get(stageCode)?.fieldMap;
    const entries = state[stageCode];
    const fieldKeys = Object.keys(entries).sort((a, b) => a.localeCompare(b, "es"));
    const stagePayload: Record<string, unknown> = {};

    for (const fieldKey of fieldKeys) {
      const rawValue = entries[fieldKey];
      const fieldDefinition = fieldMap?.get(fieldKey);
      const converted = convertValueForPersistence(rawValue, fieldDefinition);
      if (converted !== undefined) {
        stagePayload[fieldKey] = converted;
      }
    }

    if (Object.keys(stagePayload).length) {
      payload[stageCode] = stagePayload;
    }
  }

  return payload;
}

function convertValueForPersistence(
  rawValue: string | boolean,
  field?: DrawerPrepFieldDefinition,
): unknown {
  if (field?.type === "checkbox") {
    return rawValue === true;
  }

  if (typeof rawValue !== "string") return rawValue;

  if (rawValue.trim() === "") return undefined;

  switch (field?.type) {
    case "number": {
      const parsed = Number(rawValue);
      return Number.isNaN(parsed) ? rawValue.trim() : parsed;
    }
    case "datetime": {
      const iso = fromDateTimeLocalInput(rawValue);
      return iso ?? rawValue;
    }
    case "textarea":
      return rawValue;
    case "text":
    case "select":
    case "url":
    case "date":
    default:
      return rawValue.trim();
  }
}

function buildUpcomingStageGroups(
  stages: EmbudoStage[],
  currentStage: EmbudoStage | null,
  definitions: Map<string, DrawerDefinition>,
): DrawerStageGroup[] {
  const currentOrder = currentStage?.orden ?? null;

  return stages
    .filter((stage) => stage.id !== currentStage?.id)
    .filter((stage) => definitions.has(stage.codigo))
    .filter((stage) => {
      if (currentOrder == null) return true;
      const stageOrder = stage.orden ?? Number.MAX_SAFE_INTEGER;
      return stageOrder > currentOrder;
    })
    .map((stage) => {
      const definition = definitions.get(stage.codigo);
      if (!definition || !definition.sections.length) return null;
      return {
        stage,
        sections: definition.sections,
      } satisfies DrawerStageGroup;
    })
    .filter((item): item is DrawerStageGroup => !!item)
    .sort((a, b) => {
      const orderDiff = (a.stage.orden ?? Number.MAX_SAFE_INTEGER) - (b.stage.orden ?? Number.MAX_SAFE_INTEGER);
      if (orderDiff !== 0) return orderDiff;
      return a.stage.nombre.localeCompare(b.stage.nombre, "es");
    });
}

function findMissingRequiredField(
  groups: DrawerStageGroup[],
  state: StagePrepState,
): { stage: EmbudoStage; field: DrawerPrepFieldDefinition } | null {
  for (const group of groups) {
    const stageValues = state[group.stage.codigo] ?? {};
    for (const section of group.sections) {
      for (const field of section.fields) {
        if (!field.required) continue;
        const value = stageValues[field.key];
        const hasValue =
          field.type === "checkbox"
            ? value === true
            : typeof value === "string" && value.trim() !== "";

        if (!hasValue) {
          return { stage: group.stage, field };
        }
      }
    }
  }
  return null;
}

function areStagePrepsEqual(a: StagePrepPayload, b: StagePrepPayload): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function resolveInputType(
  fieldType: DrawerPrepFieldType,
): "text" | "number" | "date" | "datetime-local" | "url" {
  switch (fieldType) {
    case "date":
      return "date";
    case "datetime":
      return "datetime-local";
    case "number":
      return "number";
    case "url":
      return "url";
    default:
      return "text";
  }
}

function toDateTimeLocalInput(value: string): string {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return value;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  const offsetDate = new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60000);
  return offsetDate.toISOString().slice(0, 16);
}

function fromDateTimeLocalInput(value: string): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function readStageMetaString(meta: Record<string, unknown> | undefined, key: string): string | undefined {
  if (!meta) return undefined;
  const value = meta[key];
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : undefined;
}
