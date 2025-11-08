"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CheckedState } from "@radix-ui/react-checkbox";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import type { LeadActionResult } from "@/lib/embudo/actions";
import { cn } from "@/lib/utils";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
const EMPTY_SELECT_VALUE = "__talia_empty__";

const formSchema = z.object({
  nombre: z.string().trim().max(120).optional().or(z.literal("")),
  correo: z
    .string()
    .trim()
    .optional()
    .refine((value) => !value || EMAIL_REGEX.test(value), { message: "Ingresa un correo válido." }),
  telefono: z.string().trim().optional(),
  monto: z
    .string()
    .trim()
    .optional()
    .refine((value) => !value || !Number.isNaN(Number(value)), {
      message: "El monto debe ser un número válido.",
    }),
  moneda: z
    .string()
    .trim()
    .optional()
    .refine((value) => !value || value.length === 3, {
      message: "La moneda debe tener exactamente 3 caracteres.",
    }),
  probabilidad: z
    .string()
    .trim()
    .optional()
    .refine((value) => {
      if (!value) return true;
      const parsed = Number(value);
      return !Number.isNaN(parsed) && parsed >= 0 && parsed <= 100;
    }, { message: "La probabilidad debe estar entre 0 y 100." }),
});

type FormValues = z.infer<typeof formSchema>;

export type LeadDrawerSubmitPayload = {
  contacto: Record<string, unknown>;
  tarjeta: Record<string, unknown>;
  mergeMetadata?: boolean;
};

export type LeadDrawerCreatePayload = {
  stageId: string;
  tableroId: string;
  contacto: Record<string, unknown>;
  tarjeta: Record<string, unknown>;
};

type LeadDrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentStage: EmbudoStage | null;
  allStages: EmbudoStage[];
  card: EmbudoCard | null;
  mode?: "create" | "edit";
  onSubmit?: (payload: LeadDrawerSubmitPayload) => Promise<LeadActionResult>;
  onCreate?: (payload: LeadDrawerCreatePayload) => Promise<LeadActionResult>;
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

type LeadHistoryEntry = {
  movimiento_id: string;
  tarjeta_id: string;
  tipo: string | null;
  cambiado_por: string | null;
  cambiado_nombre: string | null;
  cambiado_en: string;
  fuente: string | null;
  etapa_origen_id: string | null;
  etapa_origen_nombre: string | null;
  etapa_destino_id: string | null;
  etapa_destino_nombre: string | null;
  motivo: string | null;
  nota: string | null;
  metadata: Record<string, unknown> | null;
};

type HistoryState = {
  status: "idle" | "loading" | "loaded" | "error";
  data: LeadHistoryEntry[];
  error?: string;
};

const HISTORY_FETCH_LIMIT = 100;

export function LeadDrawer({
  open,
  onOpenChange,
  currentStage,
  allStages,
  card,
  mode = "edit",
  onSubmit,
  onCreate,
}: LeadDrawerProps) {
  const isCreateMode = mode === "create";
  const stageName = currentStage?.nombre ?? "Sin etapa";
  const [activeTab, setActiveTab] = useState<"resumen" | "notas" | "historial">("resumen");

  const defaultFormValues = useMemo<FormValues>(() => {
    const monto = typeof card?.monto === "number" && !Number.isNaN(card.monto) ? String(card.monto) : "";
    const probabilidad =
      typeof card?.probabilidad === "number" && !Number.isNaN(card.probabilidad)
        ? String(Math.round(card.probabilidad))
        : "";
    return {
      nombre: card?.nombre ?? "",
      correo: card?.correo ?? "",
      telefono: card?.telefono ?? "",
      monto,
      moneda: card?.moneda ?? "",
      probabilidad,
    };
  }, [card]);

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

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: defaultFormValues,
    mode: "onBlur",
  });

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors },
  } = form;

  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [historyState, setHistoryState] = useState<HistoryState>({ status: "idle", data: [] });
  const [noteText, setNoteText] = useState("");
  const [notePending, setNotePending] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);

  useEffect(() => {
    reset(defaultFormValues);
    setStagePrep(initialStagePrepState);
    setError(null);
    setPending(false);
  }, [defaultFormValues, initialStagePrepState, reset, open]);

  useEffect(() => {
    setHistoryState({ status: "idle", data: [] });
    setNoteText("");
    setNoteError(null);
  }, [card?.tarjetaId]);

  useEffect(() => {
    if (noteError && noteText.trim()) {
      setNoteError(null);
    }
  }, [noteText, noteError]);

  useEffect(() => {
    if (!open) {
      setActiveTab("resumen");
    }
  }, [open]);

  useEffect(() => {
    if (isCreateMode || !card) {
      setActiveTab("resumen");
    }
  }, [isCreateMode, card]);

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

  const fetchHistory = useCallback(async () => {
    if (!card) return;

    setHistoryState((prev) => {
      if (prev.status === "loading") return prev;
      return { status: "loading", data: prev.data, error: undefined };
    });

    try {
      const response = await fetch(
        `/api/embudo/leads/${card.tarjetaId}/history?limit=${HISTORY_FETCH_LIMIT}`,
      );
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message =
          typeof body.error === "string" && body.error ? body.error : `Error ${response.status}`;
        setHistoryState((prev) => ({
          status: "error",
          data: prev.data,
          error: message,
        }));
        return;
      }
      const rows = Array.isArray(body.data) ? (body.data as LeadHistoryEntry[]) : [];
      setHistoryState({ status: "loaded", data: rows, error: undefined });
    } catch (fetchError) {
      setHistoryState((prev) => ({
        status: "error",
        data: prev.data,
        error:
          fetchError instanceof Error
            ? fetchError.message
            : "No se pudo cargar el historial.",
      }));
    }
  }, [card]);

  useEffect(() => {
    if (!open || !card?.tarjetaId) return;
    if (activeTab === "notas" || activeTab === "historial") {
      if (historyState.status === "idle") {
        void fetchHistory();
      }
    }
  }, [open, card?.tarjetaId, activeTab, historyState.status, fetchHistory]);

  const noteEntries = useMemo(
    () =>
      historyState.data.filter(
        (entry) => (entry.tipo ?? "") === "nota" || (entry.nota || "").trim() !== "",
      ),
    [historyState.data],
  );

  const handleAddNote = useCallback(async () => {
    if (!card) return;

    const trimmed = noteText.trim();
    if (!trimmed) {
      setNoteError("Escribe una nota antes de guardar.");
      return;
    }

    setNotePending(true);
    setNoteError(null);

    try {
      const response = await fetch(`/api/embudo/leads/${card.tarjetaId}/history`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto: trimmed }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message =
          typeof body.error === "string" && body.error ? body.error : `Error ${response.status}`;
        setNoteError(message);
      } else {
        const rows = Array.isArray(body.data) ? (body.data as LeadHistoryEntry[]) : [];
        setNoteText("");
        setHistoryState((prev) => {
          const existing =
            prev.status === "loaded" || prev.status === "loading" ? prev.data : [];
          const merged = dedupeHistoryEntries(rows, existing);
          return { status: "loaded", data: merged, error: undefined };
        });
      }
    } catch (postError) {
      setNoteError(
        postError instanceof Error ? postError.message : "No se pudo guardar la nota.",
      );
    } finally {
      setNotePending(false);
    }
  }, [card, noteText]);

  const onSubmitForm = async (values: FormValues) => {
    const nombreRaw = (values.nombre ?? "").trim();
    const correoRaw = (values.correo ?? "").trim();
    const telefonoRaw = (values.telefono ?? "").trim();
    const montoRaw = (values.monto ?? "").trim();
    const monedaRaw = (values.moneda ?? "").trim().toUpperCase();
    const probRaw = (values.probabilidad ?? "").trim();

    const missingRequired =
      isCreateMode ? null : findMissingRequiredField(upcomingStageGroups, stagePrep);
    if (missingRequired) {
      setError(
        `Completa el campo “${missingRequired.field.label}” en la etapa “${missingRequired.stage.nombre}”.`,
      );
      return;
    }

    const normalizedStagePrep = buildStagePrepPayload(stagePrep, drawerDefinitions);

    if (isCreateMode) {
      if (!currentStage || !currentStage.tableroId) {
        setError("Selecciona una etapa válida para crear el lead.");
        return;
      }
      if (!onCreate) {
        setError("No es posible crear leads en este momento.");
        return;
      }

      const contactoPayload: Record<string, unknown> = {
        nombre_completo: nombreRaw.length ? nombreRaw : null,
        correo: correoRaw.length ? correoRaw : null,
        telefono_e164: telefonoRaw.length ? telefonoRaw : null,
      };

      const tarjetaPayload: Record<string, unknown> = {};
      if (montoRaw.length) {
        tarjetaPayload.monto_estimado = Number(montoRaw);
      }
      if (monedaRaw.length) {
        tarjetaPayload.moneda = monedaRaw;
      }
      if (probRaw.length) {
        tarjetaPayload.probabilidad_override = Number(probRaw);
      }

      const metadata: Record<string, unknown> = {
        created_via: "embudo_manual",
        created_stage_id: currentStage.id,
        created_stage_code: currentStage.codigo,
      };
      if (Object.keys(normalizedStagePrep).length) {
        metadata.stage_prep = normalizedStagePrep;
      }
      tarjetaPayload.metadata = metadata;

      setPending(true);
      const result = await onCreate({
        stageId: currentStage.id,
        tableroId: currentStage.tableroId,
        contacto: contactoPayload,
        tarjeta: tarjetaPayload,
      });
      setPending(false);

      if (!result.ok) {
        setError(result.error || "Ocurrió un error al crear el lead.");
        return;
      }

      setError(null);
      onOpenChange(false);
      return;
    }

    if (!card) {
      setError("No se encontró la tarjeta seleccionada.");
      return;
    }

    if (!onSubmit) {
      setError("No es posible actualizar este lead en este momento.");
      return;
    }

    const contactoUpdates: Record<string, unknown> = {};
    if (nombreRaw !== (defaultFormValues.nombre ?? "").trim()) {
      contactoUpdates.nombre_completo = nombreRaw.length ? nombreRaw : null;
    }

    if (correoRaw !== (defaultFormValues.correo ?? "").trim()) {
      contactoUpdates.correo = correoRaw.length ? correoRaw : null;
    }

    if (telefonoRaw !== (defaultFormValues.telefono ?? "").trim()) {
      contactoUpdates.telefono_e164 = telefonoRaw.length ? telefonoRaw : null;
    }

    const tarjetaUpdates: Record<string, unknown> = {};
    if (montoRaw !== (defaultFormValues.monto ?? "").trim()) {
      tarjetaUpdates.monto_estimado = montoRaw.length ? Number(montoRaw) : null;
    }

    const defaultMoneda = (defaultFormValues.moneda ?? "").trim().toUpperCase();
    if (monedaRaw !== defaultMoneda) {
      tarjetaUpdates.moneda = monedaRaw.length ? monedaRaw : null;
    }

    if (probRaw !== (defaultFormValues.probabilidad ?? "").trim()) {
      tarjetaUpdates.probabilidad_override = probRaw.length ? Number(probRaw) : null;
    }

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
  };

  const renderStageField = (stageCode: string, field: DrawerPrepFieldDefinition) => {
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
        const stringValue = typeof rawValue === "string" ? rawValue : "";
        const hasValue = stringValue.length > 0;
        const selectValue = (hasValue ? stringValue : field.required ? undefined : EMPTY_SELECT_VALUE) as
          | string
          | undefined;
        const options = field.options ?? [];
        return (
          <div className="grid gap-2">
            <label className="text-xs font-medium text-muted-foreground" htmlFor={`${baseId}-select`}>
              {field.label}
              {field.required ? " *" : ""}
            </label>
            <Select
              value={selectValue}
              onValueChange={(next) =>
                handleStageFieldChange(stageCode, field, next === EMPTY_SELECT_VALUE ? "" : next)
              }
              disabled={pending || !options.length}
            >
              <SelectTrigger id={`${baseId}-select`} size="default">
                <SelectValue placeholder={field.placeholder ?? "Selecciona una opción"} />
              </SelectTrigger>
              <SelectContent>
                {!field.required ? (
                  <SelectItem value={EMPTY_SELECT_VALUE}>Sin seleccionar</SelectItem>
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
        const displayValue = field.type === "datetime" ? toDateTimeLocalInput(value) : value;
        return (
          <div className="grid gap-2">
            <label className="text-xs font-medium text-muted-foreground" htmlFor={baseId}>
              {field.label}
              {field.required ? " *" : ""}
              {field.suffix ? (
                <span className="ml-1 text-[11px] text-muted-foreground">({field.suffix})</span>
              ) : null}
            </label>
            <Input
              id={baseId}
              type={inputType}
              value={displayValue}
              placeholder={field.placeholder}
              disabled={pending}
              onChange={(event) => {
                const nextValue = field.type === "datetime" ? event.target.value : event.target.value;
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
      <DrawerContent className="data-[vaul-drawer-direction=right]:w-full data-[vaul-drawer-direction=right]:max-w-lg data-[vaul-drawer-direction=right]:h-screen data-[vaul-drawer-direction=right]:max-h-screen data-[vaul-drawer-direction=right]:overflow-hidden">
        <DrawerHeader className="items-start">
          <DrawerTitle>{isCreateMode ? "Nuevo lead" : card?.nombre ?? "Lead sin nombre"}</DrawerTitle>
          <DrawerDescription className="flex flex-col gap-1 text-left">
            <span>{isCreateMode ? `Creando en etapa: ${stageName}` : `Etapa: ${stageName}`}</span>
            {!isCreateMode ? (
              <span className="text-xs text-muted-foreground">ID: {card?.tarjetaId ?? "—"}</span>
            ) : null}
          </DrawerDescription>
        </DrawerHeader>

        <Tabs
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as typeof activeTab)}
          className="flex h-full min-h-0 flex-col"
        >
          <TabsList
            className={cn(
              "mx-4 grid h-auto gap-1 rounded-lg border bg-muted/60 p-1",
              isCreateMode || !card ? "grid-cols-1" : "grid-cols-3",
            )}
          >
            <TabsTrigger value="resumen">Resumen</TabsTrigger>
            {!isCreateMode && card ? (
              <>
                <TabsTrigger value="notas">Notas</TabsTrigger>
                <TabsTrigger value="historial">Historial</TabsTrigger>
              </>
            ) : null}
          </TabsList>

          <TabsContent value="resumen" className="flex flex-1 min-h-0 flex-col overflow-hidden parent-scroll">
            <form
              onSubmit={handleSubmit(onSubmitForm)}
              className="flex flex-1 min-h-0 flex-col gap-4 overflow-y-auto px-4 pb-4"
            >
              <section className="space-y-3">
                <h4 className="text-sm font-semibold text-foreground">Contacto</h4>
                <div className="grid gap-2">
                  <label className="text-xs font-medium text-muted-foreground" htmlFor="lead-nombre">
                    Nombre
                  </label>
                  <Input
                    id="lead-nombre"
                    placeholder="Nombre del contacto"
                    disabled={pending}
                    aria-invalid={errors.nombre ? "true" : "false"}
                    {...register("nombre")}
                  />
                  {errors.nombre ? (
                    <p className="text-xs text-destructive">{errors.nombre.message}</p>
                  ) : null}
                </div>
                <div className="grid gap-2">
                  <label className="text-xs font-medium text-muted-foreground" htmlFor="lead-correo">
                    Correo
                  </label>
                  <Input
                    id="lead-correo"
                    type="email"
                    placeholder="correo@ejemplo.com"
                    disabled={pending}
                    aria-invalid={errors.correo ? "true" : "false"}
                    {...register("correo")}
                  />
                  {errors.correo ? (
                    <p className="text-xs text-destructive">{errors.correo.message}</p>
                  ) : null}
                </div>
                <div className="grid gap-2">
                  <label className="text-xs font-medium text-muted-foreground" htmlFor="lead-telefono">
                    Teléfono (E.164)
                  </label>
                  <Input
                    id="lead-telefono"
                    placeholder="+52..."
                    disabled={pending}
                    aria-invalid={errors.telefono ? "true" : "false"}
                    {...register("telefono")}
                  />
                  {errors.telefono ? (
                    <p className="text-xs text-destructive">{errors.telefono.message}</p>
                  ) : null}
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
                    placeholder="0"
                    disabled={pending}
                    aria-invalid={errors.monto ? "true" : "false"}
                    {...register("monto")}
                  />
                  {errors.monto ? (
                    <p className="text-xs text-destructive">{errors.monto.message}</p>
                  ) : null}
                </div>
                <div className="grid gap-2">
                  <label className="text-xs font-medium text-muted-foreground" htmlFor="lead-moneda">
                    Moneda
                  </label>
                  <Input
                    id="lead-moneda"
                    placeholder="MXN"
                    maxLength={3}
                    disabled={pending}
                    aria-invalid={errors.moneda ? "true" : "false"}
                    {...register("moneda")}
                    onBlur={(event) => setValue("moneda", event.target.value.toUpperCase())}
                  />
                  {errors.moneda ? (
                    <p className="text-xs text-destructive">{errors.moneda.message}</p>
                  ) : null}
                </div>
                <div className="grid gap-2">
                  <label className="text-xs font-medium text-muted-foreground" htmlFor="lead-probabilidad">
                    Probabilidad (%)
                  </label>
                  <Input
                    id="lead-probabilidad"
                    placeholder="0-100"
                    disabled={pending}
                    aria-invalid={errors.probabilidad ? "true" : "false"}
                    {...register("probabilidad")}
                  />
                  {errors.probabilidad ? (
                    <p className="text-xs text-destructive">{errors.probabilidad.message}</p>
                  ) : null}
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
                                  {renderStageField(stage.codigo, field)}
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
                <Button
                  type="submit"
                  disabled={pending || (!card && !isCreateMode)}
                  className="w-full"
                >
                  {pending
                    ? isCreateMode
                      ? "Creando..."
                      : "Guardando..."
                    : isCreateMode
                      ? "Crear lead"
                      : "Guardar cambios"}
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
          </TabsContent>

          {!isCreateMode && card ? (
          <TabsContent value="notas" className="flex flex-1 min-h-0 flex-col overflow-hidden parent-scroll">
            <div className="flex flex-1 min-h-0 flex-col gap-4 overflow-y-auto px-4 pb-6">
              <div className="space-y-3 rounded-lg border border-border/60 bg-muted/10 p-4">
                <div>
                  <h4 className="text-sm font-semibold text-foreground">Agregar nota</h4>
                  <p className="text-xs text-muted-foreground">
                    Las notas quedan registradas en el historial y visibles para el equipo.
                  </p>
                </div>
                <Textarea
                  value={noteText}
                  onChange={(event) => setNoteText(event.target.value)}
                  placeholder="Escribe una nota interna..."
                  disabled={notePending || pending}
                  minLength={1}
                />
                {noteError ? (
                  <p className="text-xs text-destructive">{noteError}</p>
                ) : null}
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    onClick={handleAddNote}
                    disabled={notePending || pending}
                  >
                    {notePending ? "Guardando..." : "Guardar nota"}
                  </Button>
                </div>
              </div>

              <div className="space-y-3">
                {historyState.status === "loading" && noteEntries.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-muted-foreground/40 p-4 text-xs text-muted-foreground">
                    Cargando notas...
                  </p>
                ) : null}

                {historyState.status === "error" ? (
                  <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
                    {historyState.error ?? "No se pudieron cargar las notas."}
                  </p>
                ) : null}

                {noteEntries.length ? (
                  noteEntries.map((entry) => (
                    <div key={entry.movimiento_id} className="space-y-2 rounded-lg border border-border/60 p-3">
                      <p className="text-sm text-foreground whitespace-pre-wrap">
                        {entry.nota ?? ""}
                      </p>
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                        <span>{entry.cambiado_nombre ?? "Usuario desconocido"}</span>
                        <span>{formatDateTime(entry.cambiado_en)}</span>
                      </div>
                    </div>
                  ))
                ) : historyState.status === "loaded" ? (
                  <p className="rounded-lg border border-dashed border-muted-foreground/40 p-4 text-xs text-muted-foreground">
                    Aún no hay notas registradas para este lead.
                  </p>
                ) : null}
              </div>
            </div>
          </TabsContent>
          ) : null}

          {!isCreateMode && card ? (
          <TabsContent value="historial" className="flex flex-1 min-h-0 flex-col overflow-hidden parent-scroll">
            <div className="flex flex-1 min-h-0 flex-col space-y-3 overflow-y-auto px-4 pb-6">
              {historyState.status === "loading" && historyState.data.length === 0 ? (
                <p className="rounded-lg border border-dashed border-muted-foreground/40 p-4 text-xs text-muted-foreground">
                  Cargando historial...
                </p>
              ) : null}

              {historyState.status === "error" ? (
                <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
                  {historyState.error ?? "No se pudo cargar el historial del lead."}
                </p>
              ) : null}

              {historyState.data.length ? (
                historyState.data.map((entry) => (
                  <div key={entry.movimiento_id} className="space-y-2 rounded-lg border border-border/60 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-1">
                        <p className="text-sm font-medium text-foreground">
                          {describeHistoryEntry(entry)}
                        </p>
                        {entry.motivo ? (
                          <p className="text-xs text-muted-foreground">
                            Motivo: {entry.motivo}
                          </p>
                        ) : null}
                        {entry.tipo === "nota" && entry.nota ? (
                          <p className="text-xs text-muted-foreground whitespace-pre-wrap">
                            {entry.nota}
                          </p>
                        ) : null}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {formatDateTime(entry.cambiado_en)}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                      <span>{entry.cambiado_nombre ?? "Usuario desconocido"}</span>
                      {entry.fuente ? <span>Fuente: {entry.fuente}</span> : null}
                    </div>
                  </div>
                ))
              ) : historyState.status === "loaded" ? (
                <p className="rounded-lg border border-dashed border-muted-foreground/40 p-4 text-xs text-muted-foreground">
                  No hay movimientos registrados todavía.
                </p>
              ) : null}
            </div>
          </TabsContent>
          ) : null}
        </Tabs>
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

function resolveInputType(fieldType: DrawerPrepFieldType): "text" | "number" | "date" | "datetime-local" | "url" {
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

function dedupeHistoryEntries(
  incoming: LeadHistoryEntry[],
  existing: LeadHistoryEntry[],
): LeadHistoryEntry[] {
  const result: LeadHistoryEntry[] = [];
  const seen = new Set<string>();

  for (const entry of [...incoming, ...existing]) {
    const key = entry.movimiento_id;
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    result.push(entry);
  }

  return result;
}

function formatDateTime(value: string): string {
  try {
    return new Date(value).toLocaleString("es-MX", {
      dateStyle: "short",
      timeStyle: "short",
    });
  } catch {
    return value;
  }
}

function describeHistoryEntry(entry: LeadHistoryEntry): string {
  if ((entry.tipo ?? "") === "nota") {
    return "Nota interna";
  }

  const destino = entry.etapa_destino_nombre ?? entry.etapa_destino_id ?? "Etapa desconocida";
  const origen = entry.etapa_origen_nombre ?? entry.etapa_origen_id;

  if (destino && origen) {
    if (destino === origen) {
      return `Actualización en ${destino}`;
    }
    return `Movimiento a ${destino} (desde ${origen})`;
  }

  if (destino) {
    return `Movimiento a ${destino}`;
  }

  return "Movimiento del lead";
}
