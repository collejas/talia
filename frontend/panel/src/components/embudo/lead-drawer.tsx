"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import type { CheckedState } from "@radix-ui/react-checkbox";
import Image from "next/image";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

import type { EmbudoCard, EmbudoStage } from "@/lib/embudo/data";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { DateTimeCalendarPicker } from "@/components/ui/datetime-calendar-picker";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  type ContactSearchResult,
  type LeadActionResult,
  type LeadDeleteResult,
} from "@/lib/embudo/actions";
import { cn } from "@/lib/utils";
import { fromDateTimeLocalInput, toDateTimeLocalInput } from "@/lib/datetime";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LeadOnboardingPanel } from "@/components/embudo/lead-onboarding";
import {
  DEFAULT_QUOTE_VENDOR_SETTINGS,
  buildQuoteVendorSettingsPayload,
  extractQuoteVendorSettings,
  type QuoteVendorSettings,
} from "@/lib/settings/quote-vendors";
import { usePermissions } from "@/hooks/use-permissions";
import {
  IconAlertTriangle,
  IconBrandWhatsapp,
  IconCalendarEvent,
  IconChecklist,
  IconEye,
  IconDownload,
  IconHandStop,
  IconLoader2,
  IconMail,
  IconMessageCircle,
  IconPaperclip,
  IconPlus,
  IconRobot,
  IconSearch,
  IconTargetArrow,
  IconTrash,
  IconTrophy,
  IconUser,
} from "@tabler/icons-react";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
const EMPTY_SELECT_VALUE = "__talia_empty__";
const QUOTE_TAX_RATE = 0.16;

type QuoteAttachmentDraft = {
  id: string;
  file: File;
  name: string;
  size: number;
  type: string;
};

const formSchema = z.object({
  nombre: z.string().trim().max(120).optional().or(z.literal("")),
  correo: z
    .string()
    .trim()
    .optional()
    .refine((value) => !value || EMAIL_REGEX.test(value), { message: "Ingresa un correo válido." }),
  telefono: z.string().trim().optional(),
  empresa: z.string().trim().max(160).optional().or(z.literal("")),
  monto: z
    .string()
    .trim()
    .optional()
    .refine((value) => !value || parseNumberInput(value) != null, {
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
      const parsed = parseNumberInput(value);
      return parsed != null && parsed >= 0 && parsed <= 100;
    }, { message: "La probabilidad debe estar entre 0 y 100." }),
  notas: z.string().trim().optional().or(z.literal("")),
  necesidadProposito: z.string().trim().max(2000).optional().or(z.literal("")),
  proyectoNombre: z.string().trim().max(160).optional().or(z.literal("")),
  proyectoNecesidades: z.string().trim().max(2000).optional().or(z.literal("")),
});

type FormValues = z.infer<typeof formSchema>;

export type LeadDrawerSubmitPayload = {
  contacto: Record<string, unknown>;
  oportunidad: Record<string, unknown>;
  mergeMetadata?: boolean;
};

export type LeadDrawerCreatePayload = {
  stageId: string;
  tableroId: string;
  contacto: Record<string, unknown>;
  oportunidad: Record<string, unknown>;
  contactId?: string | null;
  originStageId?: string | null;
  requestId?: string | null;
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
  onDelete?: () => Promise<LeadDeleteResult>;
  onAdvanceStage?: (
    stage: EmbudoStage,
    context: LeadAdvanceStagePayload,
  ) => Promise<{ ok: boolean; error?: string }>;
  onRevertStage?: () => Promise<LeadActionResult>;
  onQuotesChanged?: (oportunidadId: string) => void | Promise<void>;
  onScheduleDemo?: (context: {
    card: EmbudoCard;
    originStage: EmbudoStage | null;
    targetStage: EmbudoStage;
  }) => void;
};

type QuoteChannel = "email" | "whatsapp";

type LeadQuoteEntry = {
  id: string;
  version: number;
  status: string;
  channel: string | null;
  sentAt: string | null;
  total: number | null;
  currency: string | null;
  createdAt: string | null;
  title: string | null;
  description: string | null;
  concepts: Record<string, unknown>[] | null;
  subtotal: number | null;
  taxes: number | null;
  validUntil: string | null;
  metadata: Record<string, unknown> | null;
  items: LeadQuoteItemEntry[] | null;
};

type QuotesState =
  | { status: "idle"; data: LeadQuoteEntry[] }
  | { status: "loading"; data: LeadQuoteEntry[] }
  | { status: "loaded"; data: LeadQuoteEntry[] }
  | { status: "error"; data: LeadQuoteEntry[]; error: string };

type LeadQuoteItemEntry = {
  id: string;
  catalogItemId: string | null;
  fotoUrl: string | null;
  title: string | null;
  description: string | null;
  unit: string | null;
  quantity: number | null;
  unitPrice: number | null;
  discount: number | null;
  subtotal: number | null;
  taxes: number | null;
  total: number | null;
  currency: string | null;
};

type QuoteItemForm = {
  key: string;
  catalogItemId: string | null;
  fotoUrl: string | null;
  nombre: string;
  descripcion: string;
  unidad: string;
  cantidad: string;
  precioUnitario: string;
  descuento: string;
  moneda: string;
};

type QuoteTotalsSummary = {
  subtotal: number;
  taxes: number;
  total: number;
};

type CatalogItemOption = {
  id: string;
  nombre: string;
  descripcion: string;
  unidad: string;
  precioBase: number | null;
  moneda: string;
  activo: boolean;
  fotoUrl: string | null;
  metadatos: Record<string, unknown> | null;
};

type CatalogItemsState =
  | { status: "idle"; items: CatalogItemOption[] }
  | { status: "loading"; items: CatalogItemOption[] }
  | { status: "loaded"; items: CatalogItemOption[] }
  | { status: "error"; items: CatalogItemOption[]; error: string };

type DrawerPrepOption = {
  value: string;
  label: string;
};

type SalesRepOption = {
  id: string;
  nombre_completo: string | null;
  correo: string | null;
  telefono_e164: string | null;
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

export type StagePrepState = Record<string, Record<string, string | boolean>>;
type StagePrepPayload = Record<string, Record<string, unknown>>;
export type LeadAdvanceStagePayload = {
  stagePrep: StagePrepState;
};

type DrawerStageGroup = {
  stage: EmbudoStage;
  sections: DrawerPrepSectionDefinition[];
};

type StageLockInfo = {
  canEdit: boolean;
  complete: boolean;
  lockedReason: string | null;
};

type StageVisualTokens = {
  gradientClass: string;
  borderClass: string;
  badgeClass: string;
  iconBgClass: string;
  dotClass: string;
  dotRingClass: string;
  accentColor: string;
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

const DEFAULT_DRAWER_DEFINITIONS: Record<string, DrawerPrepDefinition> = {
  precalificado: {
    sections: [
      {
        key: "qualification_check",
        title: "Checklist de precalificación",
        description: "Valida que el lead cumple los requisitos antes de avanzar.",
        order: 10,
        fields: [
          {
            key: "qualification_status",
            type: "select",
            label: "Estatus de precalificación",
            required: true,
            options: [
              { value: "calificado", label: "Calificado" },
              { value: "pendiente", label: "Pendiente" },
              { value: "descartado", label: "Descartado" },
            ],
          },
          {
            key: "qualification_deadline",
            type: "date",
            label: "Fecha límite de evaluación",
          },
          {
            key: "qualification_notes",
            type: "textarea",
            label: "Notas de precalificación",
            placeholder: "Puntos clave que justifican el avance.",
          },
        ],
      },
    ],
  },
  demo: {
    sections: [
      {
        key: "demo_planning",
        title: "Preparación de la cita",
        description: "Agenda y contexto necesarios para la cita.",
        order: 10,
        fields: [
          {
            key: "demo_scheduled_at",
            type: "datetime",
            label: "Fecha y hora programada",
          },
          {
            key: "demo_format",
            type: "select",
            label: "Modalidad",
            options: [
              { value: "virtual", label: "Virtual" },
              { value: "presencial", label: "Presencial" },
              { value: "hibrida", label: "Híbrida" },
            ],
          },
          {
            key: "demo_link",
            type: "url",
            label: "Enlace o ubicación",
            placeholder: "https://...",
          },
          {
            key: "demo_host",
            type: "text",
            label: "Anfitrión interno",
          },
          {
            key: "demo_objectives",
            type: "textarea",
            label: "Objetivos de la cita",
          },
        ],
      },
    ],
  },
  negociacion: {
    sections: [
      {
        key: "negotiation_plan",
        title: "Resumen de negociación",
        description: "Acordar responsables, presupuesto y próximos pasos.",
        order: 10,
        fields: [
          {
            key: "proposal_sent_at",
            type: "date",
            label: "Fecha de envío de propuesta",
          },
          {
            key: "decision_maker",
            type: "text",
            label: "Decisor principal",
          },
          {
            key: "budget_status",
            type: "select",
            label: "Estatus de presupuesto",
            options: [
              { value: "aprobado", label: "Aprobado" },
              { value: "pendiente", label: "Pendiente" },
              { value: "sin_presupuesto", label: "Sin presupuesto" },
            ],
          },
          {
            key: "negotiation_notes",
            type: "textarea",
            label: "Notas de negociación",
          },
        ],
      },
    ],
  },
  cerrado_ganado: {
    sections: [
      {
        key: "closing_plan",
        title: "Plan de implementación",
        description: "Datos para transferir el lead a operaciones / customer success.",
        order: 10,
        fields: [
          {
            key: "close_date",
            type: "date",
            label: "Fecha de cierre",
            required: true,
          },
          {
            key: "contract_value",
            type: "number",
            label: "Valor de contrato",
            suffix: "MXN",
          },
          {
            key: "kickoff_date",
            type: "date",
            label: "Fecha de kickoff",
          },
          {
            key: "implementation_owner",
            type: "text",
            label: "Responsable de implementación",
          },
        ],
      },
    ],
  },
  cerrado_perdido: {
    sections: [
      {
        key: "loss_review",
        title: "Análisis de pérdida",
        description: "Aprendizajes y próximos pasos tras perder la oportunidad.",
        order: 10,
        fields: [
          {
            key: "loss_reason",
            type: "select",
            label: "Motivo principal",
            options: [
              { value: "precio", label: "Precio" },
              { value: "tiempo", label: "Tiempo / urgencia" },
              { value: "competencia", label: "Competencia" },
              { value: "no_fit", label: "Sin encaje" },
              { value: "indefinido", label: "No especificado" },
            ],
          },
          {
            key: "loss_competitor",
            type: "text",
            label: "Competidor",
          },
          {
            key: "loss_reopen_date",
            type: "date",
            label: "Revisar de nuevo el",
            description: "Fecha tentativa para retomar la conversación.",
          },
          {
            key: "loss_notes",
            type: "textarea",
            label: "Notas de cierre perdido",
          },
        ],
      },
    ],
  },
};

const FIELD_OPTION_FALLBACKS: Record<string, DrawerPrepOption[]> = {
  qualification_status: [
    { value: "calificado", label: "Calificado" },
    { value: "pendiente", label: "Pendiente" },
    { value: "descartado", label: "Descartado" },
  ],
  demo_format: [
    { value: "virtual", label: "Virtual" },
    { value: "presencial", label: "Presencial" },
    { value: "hibrida", label: "Híbrida" },
  ],
  budget_status: [
    { value: "aprobado", label: "Aprobado" },
    { value: "pendiente", label: "Pendiente" },
    { value: "sin_presupuesto", label: "Sin presupuesto" },
  ],
  loss_reason: [
    { value: "precio", label: "Precio" },
    { value: "tiempo", label: "Tiempo / urgencia" },
    { value: "competencia", label: "Competencia" },
    { value: "no_fit", label: "Sin encaje" },
    { value: "indefinido", label: "No especificado" },
  ],
};

type LeadHistoryEntry = {
  movimiento_id: string;
  oportunidad_id: string;
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

type LeadNoteEntry = {
  id: string;
  organizacion_id: string;
  relacion_tipo: string;
  relacion_id: string;
  actividad_id: string | null;
  texto: string;
  visible_para_cliente: boolean;
  tipo: string;
  creado_por_usuario_id: string | null;
  creado_por_usuario?: LeadUserSummary | null;
  creado_en: string;
  actualizado_en: string;
};

type LeadActivityEntry = {
  id: string;
  organizacion_id: string;
  tipo: string;
  canal: string | null;
  asunto: string | null;
  descripcion: string | null;
  estado: string;
  prioridad: string;
  fecha_vencimiento: string | null;
  inicio_en: string | null;
  fin_en: string | null;
  sla_horas: number | null;
  recordatorio_en: string | null;
  cuenta_id: string | null;
  contacto_id: string | null;
  oportunidad_id: string | null;
  creado_por_usuario_id: string | null;
  asignado_a_usuario_id: string | null;
  creado_por_usuario?: LeadUserSummary | null;
  asignado_a_usuario?: LeadUserSummary | null;
  completado_en: string | null;
  cancelado_en: string | null;
  cerrado_por_usuario_id: string | null;
  metadata: Record<string, unknown> | null;
  creado_en: string;
  actualizado_en: string;
};

type LeadUserSummary = {
  id: string;
  nombre_completo: string | null;
  correo: string | null;
  telefono_e164: string | null;
  rol_principal?: string | null;
  roles?: string[];
};

type HistoryState = {
  status: "idle" | "loading" | "loaded" | "error";
  data: LeadHistoryEntry[];
  error?: string;
};

type NotesState =
  | { status: "idle" | "loading"; data: LeadNoteEntry[] }
  | { status: "loaded"; data: LeadNoteEntry[] }
  | { status: "error"; data: LeadNoteEntry[]; error: string };

type ActivitiesState =
  | { status: "idle" | "loading"; data: LeadActivityEntry[] }
  | { status: "loaded"; data: LeadActivityEntry[] }
  | { status: "error"; data: LeadActivityEntry[]; error: string };

const HISTORY_FETCH_LIMIT = 100;

const STAGE_COLOR_TOKEN_MAP: Record<string, StageVisualTokens> = {
  amber: {
    gradientClass: "bg-gradient-to-br from-amber-50 via-white to-white",
    borderClass: "border-amber-200/70",
    badgeClass: "bg-amber-100 text-amber-900",
    iconBgClass: "bg-amber-100 text-amber-700",
    dotClass: "bg-amber-400",
    dotRingClass: "ring-amber-200",
    accentColor: "#f59e0b",
  },
  sky: {
    gradientClass: "bg-gradient-to-br from-sky-50 via-white to-white",
    borderClass: "border-sky-200/70",
    badgeClass: "bg-sky-100 text-sky-900",
    iconBgClass: "bg-sky-100 text-sky-700",
    dotClass: "bg-sky-400",
    dotRingClass: "ring-sky-200",
    accentColor: "#0ea5e9",
  },
  emerald: {
    gradientClass: "bg-gradient-to-br from-emerald-50 via-white to-white",
    borderClass: "border-emerald-200/70",
    badgeClass: "bg-emerald-100 text-emerald-900",
    iconBgClass: "bg-emerald-100 text-emerald-700",
    dotClass: "bg-emerald-400",
    dotRingClass: "ring-emerald-200",
    accentColor: "#059669",
  },
  violet: {
    gradientClass: "bg-gradient-to-br from-violet-50 via-white to-white",
    borderClass: "border-violet-200/70",
    badgeClass: "bg-violet-100 text-violet-900",
    iconBgClass: "bg-violet-100 text-violet-700",
    dotClass: "bg-violet-400",
    dotRingClass: "ring-violet-200",
    accentColor: "#8b5cf6",
  },
  rose: {
    gradientClass: "bg-gradient-to-br from-rose-50 via-white to-white",
    borderClass: "border-rose-200/70",
    badgeClass: "bg-rose-100 text-rose-900",
    iconBgClass: "bg-rose-100 text-rose-700",
    dotClass: "bg-rose-400",
    dotRingClass: "ring-rose-200",
    accentColor: "#f43f5e",
  },
  slate: {
    gradientClass: "bg-gradient-to-br from-slate-50 via-white to-white",
    borderClass: "border-slate-200/70",
    badgeClass: "bg-slate-100 text-slate-900",
    iconBgClass: "bg-slate-100 text-slate-700",
    dotClass: "bg-slate-500",
    dotRingClass: "ring-slate-200",
    accentColor: "#0f172a",
  },
};

const DEFAULT_STAGE_TOKENS: StageVisualTokens = {
  gradientClass: "bg-gradient-to-br from-slate-50 via-white to-white",
  borderClass: "border-slate-200/70",
  badgeClass: "bg-slate-100 text-slate-900",
  iconBgClass: "bg-slate-100 text-slate-700",
  dotClass: "bg-slate-500",
  dotRingClass: "ring-slate-200",
  accentColor: "#0f172a",
};

const STAGE_ICON_MAP: Record<string, React.ComponentType<{ className?: string; stroke?: number }>> = {
  captado: IconTargetArrow,
  precalificado: IconChecklist,
  demo: IconCalendarEvent,
  negociacion: IconHandStop,
  cerrado_ganado: IconTrophy,
  cerrado_perdido: IconAlertTriangle,
};

export function LeadDrawer({
  open,
  onOpenChange,
  currentStage,
  allStages,
  card,
  mode = "edit",
  onSubmit,
  onCreate,
  onDelete,
  onAdvanceStage,
  onRevertStage,
  onQuotesChanged,
  onScheduleDemo,
}: LeadDrawerProps) {
  const isCreateMode = mode === "create";
  const stageName = currentStage?.nombre ?? "Sin etapa";
  const resolvedTableroId = useMemo(
    () => currentStage?.tableroId || allStages.find((stage) => stage.tableroId)?.tableroId || "",
    [allStages, currentStage?.tableroId],
  );
  const [activeTab, setActiveTab] =
    useState<"resumen" | "notas" | "actividades" | "historial" | "onboarding">("resumen");

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
      empresa: card?.empresa ?? "",
      monto: formatCurrencyInputValue(parseNumberInput(monto), card?.moneda ?? "MXN"),
      moneda: card?.moneda ?? "",
      probabilidad: formatPercentInputValue(parseNumberInput(probabilidad)),
      notas: card?.notas ?? "",
      necesidadProposito: card?.necesidadProposito ?? "",
      proyectoNombre: card?.proyectoNombre ?? "",
      proyectoNecesidades: card?.proyectoNecesidades ?? "",
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
  const stageLocks = useMemo(
    () => computeStageLocks(upcomingStageGroups, stagePrep),
    [upcomingStageGroups, stagePrep],
  );
  const autoStageSummary = useMemo(() => {
    if (!card?.autoStage) {
      return null;
    }
    const formattedAt = card.autoStage.at
      ? (() => {
          try {
            return new Intl.DateTimeFormat("es-MX", {
              dateStyle: "medium",
              timeStyle: "short",
            }).format(new Date(card.autoStage.at));
          } catch {
            return card.autoStage.at;
          }
        })()
      : null;
    return {
      stageLabel: currentStage?.nombre ?? card.etapaNombre ?? card.autoStage.stageCode,
      channel: card.autoStage.channel ?? "asistente",
      at: formattedAt,
    };
  }, [card?.autoStage, card?.etapaNombre, currentStage?.nombre]);

  const originBadge = useMemo(() => {
    if (!card) return null;
    const createdVia = (card.createdVia || card.metadata?.created_via) as string | undefined;
    const normalizedCreatedVia = typeof createdVia === "string" ? createdVia.trim().toLowerCase() : "";
    if (normalizedCreatedVia === "embudo_manual") {
      return {
        label: "Manual",
        title: "Oportunidad creada manualmente",
        className: "border-slate-200 bg-slate-100 text-slate-800",
      };
    }
    if (card.autoStage || normalizedCreatedVia.includes("assistant") || normalizedCreatedVia.startsWith("inbox_")) {
      return {
        label: "Tal-IA",
        title: "Oportunidad generada por TAL-IA",
        className: "border-primary/30 bg-primary/5 text-primary",
      };
    }
    return null;
  }, [card]);

  const contactOriginBadge = useMemo(() => {
    if (!card) return null;
    const origin = typeof card.contactOrigin === "string" ? card.contactOrigin.trim() : "";
    if (!origin) return null;
    const normalized = origin.toLowerCase();
    const className = CONTACT_ORIGIN_BADGE_TONES[normalized] ?? "border-slate-300 bg-slate-50 text-slate-700";
    return {
      label: `Origen: ${origin}`,
      title: `Origen del contacto: ${origin}`,
      className,
    };
  }, [card]);

  const channelBadge = useMemo(() => {
    if (!card) return null;
    const channel = typeof card.canal === "string" ? card.canal.trim().toLowerCase() : "";
    if (!channel) return null;
    const config = CHANNEL_BADGE_TONES[channel] ?? {
      label: formatChannelLabel(channel),
      title: `Canal: ${formatChannelLabel(channel)}`,
      className: "border-slate-300 bg-slate-50 text-slate-700",
      icon: null,
    };
    return config;
  }, [card]);

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
    getValues,
    formState: { errors },
  } = form;
  const montoField = register("monto");
  const probabilidadField = register("probabilidad");

  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [historyState, setHistoryState] = useState<HistoryState>({ status: "idle", data: [] });
  const [quotesState, setQuotesState] = useState<QuotesState>({ status: "idle", data: [] });
  const [quotePdfLoadingId, setQuotePdfLoadingId] = useState<string | null>(null);
  const [quotePreviewPdfLoading, setQuotePreviewPdfLoading] = useState(false);
  const [quotePreviewPdfUrl, setQuotePreviewPdfUrl] = useState<string | null>(null);
  const [quotePreviewPdfFilename, setQuotePreviewPdfFilename] = useState("cotizacion.pdf");
  const [quoteDialogOpen, setQuoteDialogOpen] = useState(false);
  const [quoteChannel, setQuoteChannel] = useState<"email" | "whatsapp">("email");
  const [quoteTitle, setQuoteTitle] = useState("");
  const [quoteDescription, setQuoteDescription] = useState("");
  const [quoteSubject, setQuoteSubject] = useState("");
  const [quoteEmailTo, setQuoteEmailTo] = useState("");
  const [quoteWhatsappTo, setQuoteWhatsappTo] = useState("");
  const [quoteAttachments, setQuoteAttachments] = useState<QuoteAttachmentDraft[]>([]);
  const [quoteSubtotal, setQuoteSubtotal] = useState("");
  const [quoteImpuestos, setQuoteImpuestos] = useState("");
  const [quoteTotal, setQuoteTotal] = useState("");
  const [quoteMoneda, setQuoteMoneda] = useState(card?.moneda ?? "MXN");
  const [quoteValidoHasta, setQuoteValidoHasta] = useState<string>(() =>
    formatDateInput(addDays(new Date(), DEFAULT_QUOTE_VENDOR_SETTINGS.validityDays)),
  );
  const [quoteItems, setQuoteItems] = useState<QuoteItemForm[]>(() => []);
  const computedQuoteTotals = useMemo(() => computeQuoteTotals(quoteItems), [quoteItems]);
  const [catalogState, setCatalogState] = useState<CatalogItemsState>({ status: "idle", items: [] });
  const [catalogSearch, setCatalogSearch] = useState("");
  const [quoteCatalogPickerOpen, setQuoteCatalogPickerOpen] = useState(false);
  const [quoteCatalogPickerSearch, setQuoteCatalogPickerSearch] = useState("");
  const [quoteCatalogSelection, setQuoteCatalogSelection] = useState<string[]>([]);
  const [quotePreviewOpen, setQuotePreviewOpen] = useState(false);
  const [quotePreviewError, setQuotePreviewError] = useState<string | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [quoteSuccess, setQuoteSuccess] = useState<string | null>(null);
  const [quoteVendorSettings, setQuoteVendorSettings] = useState<QuoteVendorSettings>(
    DEFAULT_QUOTE_VENDOR_SETTINGS,
  );
  const [quoteVendorSettingsLoading, setQuoteVendorSettingsLoading] = useState(false);
  const quoteAttachmentInputRef = useRef<HTMLInputElement | null>(null);
  const [noteText, setNoteText] = useState("");
  const [notePending, setNotePending] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);
  const [noteReminderEnabled, setNoteReminderEnabled] = useState(false);
  const [noteReminderAt, setNoteReminderAt] = useState("");
  const [noteActivityType, setNoteActivityType] = useState("seguimiento");
  const [notesState, setNotesState] = useState<NotesState>({ status: "idle", data: [] });
  const [activitiesState, setActivitiesState] = useState<ActivitiesState>({ status: "idle", data: [] });
  const [activityError, setActivityError] = useState<string | null>(null);

  const { context: permissionContext, loading: permissionsLoading } = usePermissions();
  const normalizedPerms = useMemo(
    () => (permissionContext.permisos ?? []).map((perm) => perm.toLowerCase()),
    [permissionContext.permisos],
  );
  const normalizedRoles = useMemo(
    () => (permissionContext.roles ?? []).map((role) => role.toLowerCase()),
    [permissionContext.roles],
  );
  const canReassignAny =
    permissionContext.es_admin ||
    permissionContext.es_owner ||
    normalizedPerms.includes("pipeline.reassign.any");
  const canReassignTeam =
    permissionContext.es_admin ||
    permissionContext.es_owner ||
    normalizedPerms.includes("pipeline.reassign.team");
  const canReassign = canReassignAny || canReassignTeam;
  const canCreateSupervisorNotes =
    permissionContext.es_admin ||
    permissionContext.es_owner ||
    normalizedRoles.some((role) =>
      role === "0002" ||
      role.includes("supervisor") ||
      role.includes("gerente") ||
      role.includes("manager") ||
      role.includes("admin"),
    ) ||
    normalizedPerms.some((perm) =>
      perm === "notes.create.supervised" ||
      perm === "notes.write" ||
      perm === "notes.manage",
    );

  const [vendorOptions, setVendorOptions] = useState<SalesRepOption[]>([]);
  const [vendorLoading, setVendorLoading] = useState(false);
  const [vendorError, setVendorError] = useState<string | null>(null);
  const [selectedVendorId, setSelectedVendorId] = useState("");
  const [reassignPending, setReassignPending] = useState(false);
  const [reassignError, setReassignError] = useState<string | null>(null);
  const [reassignSuccess, setReassignSuccess] = useState<string | null>(null);
  const [deletePending, setDeletePending] = useState(false);
  const [revertPending, setRevertPending] = useState(false);
  const [selectedContact, setSelectedContact] = useState<ContactSearchResult | null>(null);
  const [contactSearchQuery, setContactSearchQuery] = useState("");
  const [contactSearchResults, setContactSearchResults] = useState<ContactSearchResult[]>([]);
  const [contactSearchError, setContactSearchError] = useState<string | null>(null);
  const [contactSearchLoading, setContactSearchLoading] = useState(false);
  const contactSearchRequestRef = useRef(0);
  const contactSearchAbortRef = useRef<AbortController | null>(null);
  const deferredContactSearchQuery = useDeferredValue(contactSearchQuery);
  const [quotePending, startQuoteAction] = useTransition();
  const isBusy = pending || deletePending || revertPending;
  const wasOpenRef = useRef(false);
  const createRequestIdRef = useRef<string>(crypto.randomUUID());
  const lastDrawerRecordKeyRef = useRef<string | null>(null);
  const latestStageMove = useMemo(
    () =>
      historyState.data.find(
        (entry) =>
          (entry.tipo ?? "movimiento") !== "nota" &&
          !!entry.etapa_origen_id &&
          !!entry.etapa_destino_id &&
          entry.etapa_origen_id !== entry.etapa_destino_id,
      ) ?? null,
    [historyState.data],
  );

  const runContactSearch = useCallback(async (term: string, requestId: number) => {
    const trimmed = term.trim();
    if (trimmed.length < 3) {
      setContactSearchError("Escribe al menos 3 caracteres para buscar.");
      setContactSearchResults([]);
      setContactSearchLoading(false);
      return;
    }

    contactSearchAbortRef.current?.abort();
    const controller = new AbortController();
    contactSearchAbortRef.current = controller;
    contactSearchRequestRef.current = requestId;
    setContactSearchError(null);
    setContactSearchLoading(true);

    try {
      const response = await fetch(`/api/agenda/contacts/search?q=${encodeURIComponent(trimmed)}&limit=8`, {
        cache: "no-store",
        signal: controller.signal,
      });
      const body = (await response.json().catch(() => ({}))) as {
        items?: ContactSearchResult[];
        error?: string;
      };
      if (contactSearchRequestRef.current !== requestId || controller.signal.aborted) {
        return;
      }
      if (!response.ok) {
        setContactSearchResults([]);
        setContactSearchError(body.error || "No se pudieron buscar contactos.");
        return;
      }
      const results = Array.isArray(body.items) ? body.items : [];
      setContactSearchResults(results);
      setContactSearchError(results.length ? null : "No encontramos coincidencias.");
    } catch {
      if (contactSearchRequestRef.current !== requestId || controller.signal.aborted) {
        return;
      }
      setContactSearchResults([]);
      setContactSearchError("No se pudieron buscar contactos.");
    } finally {
      if (contactSearchRequestRef.current === requestId && !controller.signal.aborted) {
        setContactSearchLoading(false);
      }
    }
  }, []);

  const handleContactSearch = useCallback(() => {
    const term = contactSearchQuery.trim();
    const requestId = contactSearchRequestRef.current + 1;
    void runContactSearch(term, requestId);
  }, [contactSearchQuery, runContactSearch]);

  useEffect(() => {
    if (isCreateMode && open) {
      createRequestIdRef.current = crypto.randomUUID();
    }
  }, [isCreateMode, open]);

  const drawerRecordKey = isCreateMode
    ? `create:${currentStage?.id ?? "sin-etapa"}`
    : `edit:${card?.oportunidadId ?? "sin-oportunidad"}`;

  useEffect(() => {
    if (!open) {
      wasOpenRef.current = false;
      return;
    }

    const shouldReset = !wasOpenRef.current || lastDrawerRecordKeyRef.current !== drawerRecordKey;
    if (!shouldReset) {
      return;
    }

    wasOpenRef.current = true;
    lastDrawerRecordKeyRef.current = drawerRecordKey;
    reset(defaultFormValues);
    setStagePrep(initialStagePrepState);
    setError(null);
    setPending(false);
    setDeletePending(false);
  }, [defaultFormValues, initialStagePrepState, reset, open, drawerRecordKey]);

  useEffect(() => {
    setHistoryState({ status: "idle", data: [] });
    setNotesState({ status: "idle", data: [] });
    setActivitiesState({ status: "idle", data: [] });
    setNoteText("");
    setNoteError(null);
    setNoteReminderEnabled(false);
    setNoteReminderAt("");
    setNoteActivityType("seguimiento");
    setActivityError(null);
  }, [card?.asignadoId, card?.oportunidadId]);

  useEffect(() => {
    setQuotesState({ status: "idle", data: [] });
    setQuoteDialogOpen(false);
    setQuoteSuccess(null);
  }, [card?.oportunidadId]);

  useEffect(() => {
    setQuoteItems([createQuoteItemForm({ moneda: card?.moneda ?? "MXN" })]);
    setCatalogSearch("");
  }, [card?.oportunidadId, card?.moneda]);

  useEffect(() => {
    setSelectedVendorId(card?.asignadoId ?? "");
    setReassignError(null);
    setReassignSuccess(null);
  }, [card?.asignadoId, card?.oportunidadId]);

  useEffect(() => {
    if (!open || isCreateMode || !card || !canReassign || permissionsLoading) {
      return;
    }
    const controller = new AbortController();
    const fetchVendors = async () => {
      setVendorLoading(true);
      setVendorError(null);
      try {
        const scope = canReassignAny ? "all" : "team";
        const response = await fetch(`/api/embudo/vendedores?limit=200&scope=${scope}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          setVendorError(body.error || `Error ${response.status}`);
          setVendorOptions([]);
          return;
        }
        const body = (await response.json()) as { vendedores?: Array<Record<string, unknown>> };
        const vendors = Array.isArray(body?.vendedores) ? body.vendedores : [];
        const options: SalesRepOption[] = vendors
          .map((vendor) => {
            if (!vendor || typeof vendor !== "object") return null;
            const id = String((vendor as Record<string, unknown>).id || "").trim();
            if (!id) return null;
            const nombre = (vendor as Record<string, unknown>).nombre_completo as string | null;
            const correo = (vendor as Record<string, unknown>).correo as string | null;
            const telefono = (vendor as Record<string, unknown>).telefono_e164 as string | null;
            const label = nombre?.trim() || correo?.trim() || telefono?.trim() || "Sin nombre";
            return { id, nombre_completo: nombre ?? null, correo: correo ?? null, telefono_e164: telefono ?? null, label };
          })
          .filter((entry): entry is SalesRepOption => entry !== null);
        setVendorOptions(options);
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setVendorError("No se pudo cargar la lista de vendedores.");
        setVendorOptions([]);
      } finally {
        setVendorLoading(false);
      }
    };
    fetchVendors();
    return () => controller.abort();
  }, [open, isCreateMode, card, canReassign, canReassignAny, permissionsLoading]);

  useEffect(() => {
    if (!computedQuoteTotals) return;
    const subtotalString = formatNumberInputValue(computedQuoteTotals.subtotal);
    const taxesString = formatNumberInputValue(computedQuoteTotals.taxes);
    const totalString = formatNumberInputValue(computedQuoteTotals.total);
    setQuoteSubtotal((prev) => (prev === subtotalString ? prev : subtotalString));
    setQuoteImpuestos((prev) => (prev === taxesString ? prev : taxesString));
    setQuoteTotal((prev) => (prev === totalString ? prev : totalString));
  }, [computedQuoteTotals]);

  useEffect(() => {
    if (noteError && noteText.trim()) {
      setNoteError(null);
    }
  }, [noteText, noteError]);

  useEffect(() => {
    if (!open) {
      setActiveTab("resumen");
      setQuoteDialogOpen(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open || isCreateMode || !card) {
      return;
    }
    reset(defaultFormValues);
  }, [open, isCreateMode, card, defaultFormValues, reset]);

  useEffect(() => {
    if (isCreateMode || !card) {
      setActiveTab("resumen");
    }
  }, [isCreateMode, card]);

  useEffect(() => {
    if (!open || !isCreateMode) {
      contactSearchAbortRef.current?.abort();
      contactSearchAbortRef.current = null;
      setSelectedContact(null);
      setContactSearchQuery("");
      setContactSearchResults([]);
      setContactSearchError(null);
      setContactSearchLoading(false);
      return;
    }
  }, [open, isCreateMode]);

  useEffect(() => {
    if (!open || !isCreateMode) {
      return;
    }

    const term = deferredContactSearchQuery.trim();
    if (term.length < 3) {
      contactSearchAbortRef.current?.abort();
      contactSearchAbortRef.current = null;
      contactSearchRequestRef.current += 1;
      setContactSearchResults([]);
      setContactSearchError(null);
      setContactSearchLoading(false);
      return;
    }

    const requestId = contactSearchRequestRef.current + 1;
    const timeout = window.setTimeout(() => {
      void runContactSearch(term, requestId);
    }, 300);

    return () => window.clearTimeout(timeout);
  }, [deferredContactSearchQuery, isCreateMode, open, runContactSearch]);

  useEffect(() => {
    if (selectedContact) {
      setValue("nombre", selectedContact.nombre ?? "", { shouldDirty: true });
      setValue("correo", selectedContact.correo ?? "", { shouldDirty: true });
      setValue("telefono", selectedContact.telefono ?? "", { shouldDirty: true });
      setValue("empresa", selectedContact.empresa ?? "", { shouldDirty: true });
    }
  }, [selectedContact, setValue]);

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
        `/api/embudo/leads/${card.oportunidadId}/history?limit=${HISTORY_FETCH_LIMIT}`,
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

  const fetchNotes = useCallback(async () => {
    if (!card) return;

    setNotesState((prev) => {
      if (prev.status === "loading") return prev;
      return { status: "loading", data: prev.data };
    });

    try {
      const response = await fetch(`/api/embudo/leads/${card.oportunidadId}/notes`);
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message =
          typeof body.error === "string" && body.error ? body.error : `Error ${response.status}`;
        setNotesState((prev) => ({
          status: "error",
          data: prev.data,
          error: message,
        }));
        return;
      }
      const rows = Array.isArray(body.data) ? (body.data as LeadNoteEntry[]) : [];
      setNotesState({ status: "loaded", data: rows });
    } catch (fetchError) {
      setNotesState((prev) => ({
        status: "error",
        data: prev.data,
        error: fetchError instanceof Error ? fetchError.message : "No se pudieron cargar las notas.",
      }));
    }
  }, [card]);

  const fetchActivities = useCallback(async () => {
    if (!card) return;

    setActivitiesState((prev) => {
      if (prev.status === "loading") return prev;
      return { status: "loading", data: prev.data };
    });

    try {
      const response = await fetch(`/api/embudo/leads/${card.oportunidadId}/activities`);
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message =
          typeof body.error === "string" && body.error ? body.error : `Error ${response.status}`;
        setActivitiesState((prev) => ({
          status: "error",
          data: prev.data,
          error: message,
        }));
        return;
      }
      const rows = Array.isArray(body.data) ? (body.data as LeadActivityEntry[]) : [];
      setActivitiesState({ status: "loaded", data: rows });
    } catch (fetchError) {
      setActivitiesState((prev) => ({
        status: "error",
        data: prev.data,
        error:
          fetchError instanceof Error
            ? fetchError.message
            : "No se pudieron cargar las actividades.",
      }));
    }
  }, [card]);

  const fetchQuotes = useCallback(async () => {
    if (!card) return;
    setQuotesState((prev) => {
      if (prev.status === "loading") return prev;
      return { status: "loading", data: prev.data };
    });
    try {
      const response = await fetch(`/api/embudo/leads/${card.oportunidadId}/quotes`);
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message =
          typeof body?.error === "string" && body.error ? body.error : `Error ${response.status}`;
        setQuotesState((prev) => ({
          status: "error",
          data: prev.data,
          error: message,
        }));
        return;
      }
      const rows = Array.isArray(body?.quotes) ? (body.quotes as unknown[]) : [];
      const mapped = rows.map((row) => mapQuoteEntry(row));
      setQuotesState({ status: "loaded", data: mapped });
    } catch (fetchError) {
      setQuotesState((prev) => ({
        status: "error",
        data: prev.data,
        error:
          fetchError instanceof Error
            ? fetchError.message
            : "No se pudieron cargar las cotizaciones.",
      }));
    }
  }, [card]);

  const loadCatalogItems = useCallback(async () => {
    setCatalogState((prev) => {
      if (prev.status === "loading") {
        return prev;
      }
      return { status: "loading", items: prev.items };
    });
    try {
      const response = await fetch(`/api/catalog/items?limit=500`);
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message = typeof body?.error === "string" ? body.error : `Error ${response.status}`;
        throw new Error(message);
      }
      const rows = Array.isArray(body?.items) ? (body.items as unknown[]) : [];
      const mapped = rows
        .map((row: unknown) => mapCatalogApiRow(row))
        .filter((item): item is CatalogItemOption => !!item);
      setCatalogState({ status: "loaded", items: mapped });
    } catch (catalogError) {
      setCatalogState({
        status: "error",
        items: [],
        error:
          catalogError instanceof Error
            ? catalogError.message
            : "No se pudo cargar el catálogo.",
      });
    }
  }, []);

  useEffect(() => {
    if (!open || !card?.oportunidadId) return;
    if (activeTab === "notas") {
      if (notesState.status === "idle") {
        void fetchNotes();
      }
    }
    if (activeTab === "actividades") {
      if (activitiesState.status === "idle") {
        void fetchActivities();
      }
    }
    if (activeTab === "historial") {
      if (historyState.status === "idle") {
        void fetchHistory();
      }
    }
  }, [
    open,
    card?.oportunidadId,
    activeTab,
    notesState.status,
    activitiesState.status,
    historyState.status,
    fetchNotes,
    fetchActivities,
    fetchHistory,
  ]);

  useEffect(() => {
    if (!open || !card?.oportunidadId) return;
    if (quotesState.status === "idle") {
      void fetchQuotes();
    }
  }, [open, card?.oportunidadId, quotesState.status, fetchQuotes]);

  useEffect(() => {
    if ((quoteDialogOpen || quoteCatalogPickerOpen) && catalogState.status === "idle") {
      void loadCatalogItems();
    }
  }, [quoteDialogOpen, quoteCatalogPickerOpen, catalogState.status, loadCatalogItems]);

  useEffect(() => {
    if (card?.moneda) {
      setQuoteMoneda(card.moneda);
    }
  }, [card?.moneda]);

  const noteEntries = useMemo(
    () => notesState.data,
    [notesState.data],
  );

  const filteredCatalogItems = useMemo(() => {
    const baseList = catalogState.items.filter((item) => item.activo);
    const query = catalogSearch.trim().toLowerCase();
    if (!query) return baseList;
    const terms = query.split(/\s+/).filter(Boolean);
    return baseList.filter((item) => {
      const haystack = `${item.nombre} ${item.descripcion ?? ""} ${item.unidad}`.toLowerCase();
      return terms.every((term) => haystack.includes(term));
    });
  }, [catalogState.items, catalogSearch]);

  const quoteCatalogPickerItems = useMemo(() => {
    const baseList = catalogState.items.filter((item) => item.activo);
    const query = quoteCatalogPickerSearch.trim().toLowerCase();
    if (!query) return baseList;
    const terms = query.split(/\s+/).filter(Boolean);
    return baseList.filter((item) => {
      const haystack = `${item.nombre} ${item.descripcion ?? ""} ${item.unidad}`.toLowerCase();
      return terms.every((term) => haystack.includes(term));
    });
  }, [catalogState.items, quoteCatalogPickerSearch]);

  const catalogSearchSuggestions = useMemo(() => filteredCatalogItems.slice(0, 5), [filteredCatalogItems]);
  const catalogItemsById = useMemo(
    () => new Map(catalogState.items.map((item) => [item.id, item])),
    [catalogState.items],
  );

  const handleAddNote = useCallback(async () => {
    if (!card) return;

    const trimmed = noteText.trim();
    if (!trimmed) {
      setNoteError("Escribe una nota antes de guardar.");
      return;
    }
    if (noteReminderEnabled && !noteReminderAt.trim()) {
      setNoteError("Selecciona la fecha y hora del recordatorio.");
      return;
    }

    setNotePending(true);
    setNoteError(null);

    try {
      let activityId: string | null = null;
      if (noteReminderEnabled) {
        const activityResponse = await fetch(`/api/embudo/leads/${card.oportunidadId}/activities`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tipo: noteActivityType,
            asunto: `Seguimiento de ${card.nombre ?? "oportunidad"}`,
            descripcion: trimmed,
            prioridad: "media",
            estado: "pendiente",
            fecha_vencimiento: noteReminderAt,
            recordatorio_en: noteReminderAt,
          }),
        });
        const activityBody = await activityResponse.json().catch(() => ({}));
        if (!activityResponse.ok) {
          const message =
            typeof activityBody.error === "string" && activityBody.error
              ? activityBody.error
              : `Error ${activityResponse.status}`;
          throw new Error(message);
        }
        activityId = typeof activityBody?.data?.id === "string" ? activityBody.data.id : null;
      }

      const noteResponse = await fetch(`/api/embudo/leads/${card.oportunidadId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          texto: trimmed,
          actividad_id: activityId || undefined,
          tipo: "interna",
          visible_para_cliente: false,
        }),
      });
      const noteBody = await noteResponse.json().catch(() => ({}));
      if (!noteResponse.ok) {
        const message =
          typeof noteBody.error === "string" && noteBody.error ? noteBody.error : `Error ${noteResponse.status}`;
        throw new Error(message);
      }

      setNoteText("");
      setNoteReminderEnabled(false);
      setNoteReminderAt("");
      setNoteActivityType("seguimiento");
      setNotesState((prev) => {
        const existing =
          prev.status === "loaded" || prev.status === "loading" ? prev.data : [];
        const created = noteBody?.data && typeof noteBody.data === "object" ? [noteBody.data as LeadNoteEntry] : [];
        const merged = [...created, ...existing].filter((entry, index, array) =>
          array.findIndex((item) => item.id === entry.id) === index,
        );
        return { status: "loaded", data: merged };
      });
      await fetchNotes();
      if (noteReminderEnabled) {
        await fetchActivities();
      }
    } catch (postError) {
      setNoteError(
        postError instanceof Error ? postError.message : "No se pudo guardar la nota.",
      );
    } finally {
      setNotePending(false);
    }
  }, [
    card,
    fetchActivities,
    fetchNotes,
    noteActivityType,
    noteReminderAt,
    noteReminderEnabled,
    noteText,
  ]);

  const handleCompleteActivity = useCallback(
    async (activityId: string) => {
      if (!card) return;
      try {
        const response = await fetch(
          `/api/embudo/leads/${card.oportunidadId}/activities/${activityId}/complete`,
          {
            method: "POST",
          },
        );
        const body = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(
            typeof body.error === "string" && body.error ? body.error : `Error ${response.status}`,
          );
        }
        await fetchActivities();
      } catch (activityError) {
        setActivityError(
          activityError instanceof Error ? activityError.message : "No se pudo completar la actividad.",
        );
      }
    },
    [card, fetchActivities],
  );

  const handleCancelActivity = useCallback(
    async (activityId: string) => {
      if (!card) return;
      try {
        const response = await fetch(
          `/api/embudo/leads/${card.oportunidadId}/activities/${activityId}/cancel`,
          {
            method: "POST",
          },
        );
        const body = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(
            typeof body.error === "string" && body.error ? body.error : `Error ${response.status}`,
          );
        }
        await fetchActivities();
      } catch (activityError) {
        setActivityError(
          activityError instanceof Error ? activityError.message : "No se pudo cancelar la actividad.",
        );
      }
    },
    [card, fetchActivities],
  );

  const onSubmitForm = async (values: FormValues) => {
    const nombreRaw = (values.nombre ?? "").trim();
    const correoRaw = (values.correo ?? "").trim();
    const telefonoRaw = (values.telefono ?? "").trim();
    const montoRaw = (values.monto ?? "").trim();
    const monedaRaw = (values.moneda ?? "").trim().toUpperCase();
    const probRaw = (values.probabilidad ?? "").trim();
    const empresaRaw = (values.empresa ?? "").trim();
    const notasRaw = (values.notas ?? "").trim();
    const necesidadPropositoRaw = (values.necesidadProposito ?? "").trim();
    const proyectoNombreRaw = (values.proyectoNombre ?? "").trim();
    const proyectoNecesidadesRaw = (values.proyectoNecesidades ?? "").trim();
    const selectedContactId = selectedContact?.id ?? null;

    const missingRequired =
      isCreateMode ? null : findMissingRequiredField(upcomingStageGroups, stagePrep, initialStagePrepState);
    if (missingRequired) {
      setError(
        `Completa el campo “${missingRequired.field.label}” en la etapa “${missingRequired.stage.nombre}”.`,
      );
      return;
    }

    const normalizedStagePrep = buildStagePrepPayload(stagePrep, drawerDefinitions);
    const advanceStage = onAdvanceStage ?? null;

    if (isCreateMode) {
      if (!currentStage) {
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
        correo_principal: correoRaw.length ? correoRaw : null,
        telefono_e164: telefonoRaw.length ? telefonoRaw : null,
      };
      if (empresaRaw.length) {
        contactoPayload.company_name = empresaRaw;
      }
      if (notasRaw.length) {
        contactoPayload.notes = notasRaw;
      }
      if (necesidadPropositoRaw.length) {
        contactoPayload.necesidad_proposito = necesidadPropositoRaw;
      }

      const oportunidadPayload: Record<string, unknown> = {};
      if (montoRaw.length) {
        const montoParsed = parseNumberInput(montoRaw);
        if (montoParsed != null) {
          oportunidadPayload.monto_estimado = montoParsed;
        }
      }
      if (monedaRaw.length) {
        oportunidadPayload.moneda = monedaRaw;
      }
      if (probRaw.length) {
        const probabilidadParsed = parseNumberInput(probRaw);
        if (probabilidadParsed != null) {
          oportunidadPayload.probabilidad = probabilidadParsed;
        }
      }
      if (proyectoNombreRaw.length) {
        oportunidadPayload.titulo = proyectoNombreRaw;
      }
      if (proyectoNecesidadesRaw.length) {
        oportunidadPayload.descripcion = proyectoNecesidadesRaw;
      }

      const metadata: Record<string, unknown> = {
        created_via: "embudo_manual",
        created_stage_id: currentStage.id,
        created_stage_code: currentStage.codigo,
      };
      if (Object.keys(normalizedStagePrep).length) {
        metadata.stage_prep = normalizedStagePrep;
      }
      if (proyectoNecesidadesRaw.length) {
        metadata.proyecto_necesidades = proyectoNecesidadesRaw;
      }
      if (nombreRaw.length) {
        metadata.contacto_nombre = nombreRaw;
      }
      if (empresaRaw.length) {
        metadata.contacto_empresa = empresaRaw;
      }
      if (necesidadPropositoRaw.length) {
        metadata.contacto_necesidad = necesidadPropositoRaw;
      }
      const autoTargetStage =
        findAutoAdvanceStage(currentStage, upcomingStageGroups, stagePrep) ?? currentStage;
      oportunidadPayload.metadata = metadata;

      setPending(true);
      const result = await onCreate({
        stageId: autoTargetStage?.id ?? currentStage.id,
        tableroId: currentStage.tableroId || resolvedTableroId,
        contacto: contactoPayload,
        oportunidad: oportunidadPayload,
        contactId: selectedContactId,
        originStageId: currentStage.id,
        requestId: createRequestIdRef.current,
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
      setError("No se encontró la oportunidad seleccionada.");
      return;
    }

    if (!onSubmit) {
      setError("No es posible actualizar este lead en este momento.");
      return;
    }

    const contactoUpdates: Record<string, unknown> = {
      nombre_completo: nombreRaw.length ? nombreRaw : null,
      correo: correoRaw.length ? correoRaw : null,
      correo_principal: correoRaw.length ? correoRaw : null,
      telefono_e164: telefonoRaw.length ? telefonoRaw : null,
      company_name: empresaRaw.length ? empresaRaw : null,
      notes: notasRaw.length ? notasRaw : null,
      necesidad_proposito: necesidadPropositoRaw.length ? necesidadPropositoRaw : null,
    };

    const montoParsed = montoRaw.length ? parseNumberInput(montoRaw) : null;
    const probabilidadParsed = probRaw.length ? parseNumberInput(probRaw) : null;
    const oportunidadUpdates: Record<string, unknown> = {
      monto_estimado: montoParsed ?? null,
      moneda: monedaRaw.length ? monedaRaw : null,
      probabilidad: probabilidadParsed ?? null,
      titulo: proyectoNombreRaw.length ? proyectoNombreRaw : null,
      descripcion: proyectoNecesidadesRaw.length ? proyectoNecesidadesRaw : null,
    };

    const stagePrepChanged = !areStagePrepsEqual(normalizedStagePrep, initialStagePrepPayload);
    const metadataUpdates: Record<string, unknown> = {};
    if (stagePrepChanged) {
      metadataUpdates.stage_prep = normalizedStagePrep;
    }
    metadataUpdates.proyecto_necesidades = proyectoNecesidadesRaw.length ? proyectoNecesidadesRaw : null;
    metadataUpdates.project_name = proyectoNombreRaw.length ? proyectoNombreRaw : null;
    if (Object.keys(metadataUpdates).length) {
      oportunidadUpdates.metadata = {
        ...(isRecord(card.metadata) ? card.metadata : {}),
        ...metadataUpdates,
      };
    }
    if (nombreRaw.length || empresaRaw.length || necesidadPropositoRaw.length) {
      oportunidadUpdates.metadata = {
        ...(isRecord(oportunidadUpdates.metadata) ? oportunidadUpdates.metadata : {}),
        ...(nombreRaw.length ? { contacto_nombre: nombreRaw } : {}),
        ...(empresaRaw.length ? { contacto_empresa: empresaRaw } : {}),
        ...(necesidadPropositoRaw.length ? { contacto_necesidad: necesidadPropositoRaw } : {}),
      };
    }

    const demoScheduledAt =
      hasStagePrepFieldValue(stagePrep, "demo_scheduled_at") ||
      hasStagePrepFieldValue(initialStagePrepRaw, "demo_scheduled_at");
    const demoTargetStage =
      !isCreateMode && card && demoScheduledAt
        ? upcomingStageGroups.find((group) => isDrawerStageCode(group.stage.codigo, "demo"))?.stage ?? null
        : null;
    const targetStage =
      !isCreateMode && card && advanceStage
        ? demoTargetStage ?? findAutoAdvanceStage(currentStage, upcomingStageGroups, stagePrep)
        : null;
    const shouldPersistTargetStageOnSave =
      Boolean(targetStage && card && targetStage.id !== card.etapaId);
    if (shouldPersistTargetStageOnSave && targetStage) {
      oportunidadUpdates.etapa_id = targetStage.id;
    }
    console.info("[LeadDrawer] submit-auto-advance", {
      opportunityId: card?.oportunidadId,
      currentStageCode: currentStage?.codigo ?? null,
      demoScheduledAt,
      targetStageCode: targetStage?.codigo ?? null,
      targetStageId: targetStage?.id ?? null,
      hasAdvanceStage: Boolean(advanceStage),
      shouldPersistTargetStageOnSave,
      stagePrepKeys: Object.keys(stagePrep ?? {}),
    });

    setPending(true);
    const result = await onSubmit({
      contacto: contactoUpdates,
      oportunidad: oportunidadUpdates,
      mergeMetadata: true,
    });
    setPending(false);

    if (!result.ok) {
      setError(result.error || "Ocurrió un error al guardar los cambios.");
      return;
    }

    const savedStageId =
      result.ok && result.card && typeof result.card.etapaId === "string" ? result.card.etapaId : null;
    const stageAlreadyMoved = Boolean(targetStage && savedStageId && savedStageId === targetStage.id);

    if (targetStage && advanceStage && !stageAlreadyMoved) {
      console.info("[LeadDrawer] submit-auto-advance-after-save", {
        opportunityId: card?.oportunidadId,
        targetStageCode: targetStage.codigo,
        targetStageId: targetStage.id,
        savedStageId,
      });
      setPending(true);
      const advanceResult = await advanceStage(targetStage, { stagePrep });
      setPending(false);
      if (!advanceResult.ok) {
        setError(advanceResult.error || "No se pudo avanzar el lead automáticamente.");
        return;
      }
    }

    setError(null);
    onOpenChange(false);
  };

  const handleDeleteLead = async () => {
    if (!onDelete || !card) {
      return;
    }

    const confirmed =
      typeof window === "undefined"
        ? true
        : window.confirm("¿Seguro que deseas eliminar este lead? El contacto permanecerá disponible.");
    if (!confirmed) {
      return;
    }

    setError(null);
    setDeletePending(true);
    const result = await onDelete();
    setDeletePending(false);
    if (!result.ok) {
      setError(result.error || "No se pudo eliminar el lead.");
    }
  };


  const handleSelectExistingContact = (contact: ContactSearchResult) => {
    setSelectedContact(contact);
    setContactSearchResults([]);
    setContactSearchError(null);
  };

  const clearSelectedContact = () => {
    setSelectedContact(null);
    setContactSearchResults([]);
    setContactSearchQuery("");
    setContactSearchError(null);
  };

  const handleReassign = useCallback(async () => {
    if (!card || !selectedVendorId || selectedVendorId === card.asignadoId) {
      return;
    }
    setReassignPending(true);
    setReassignError(null);
    setReassignSuccess(null);
    try {
      const response = await fetch(`/api/embudo/leads/${card.oportunidadId}/reassign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          asignado_usuario_id: selectedVendorId,
          persona_id: card.personaId || null,
          conversacion_id: card.conversacionId || null,
          alinear_persona: true,
          alinear_conversacion: true,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setReassignError(body?.error || `Error ${response.status}`);
        return;
      }
      setReassignSuccess("Vendedor reasignado.");
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setReassignError("No se pudo reasignar el vendedor.");
    } finally {
      setReassignPending(false);
    }
  }, [card, selectedVendorId]);

  const handleRevertStage = useCallback(async () => {
    if (!onRevertStage) return;
    setError(null);
    setRevertPending(true);
    try {
      const result = await onRevertStage();
      if (!result.ok) {
        setError(result.error || "No se pudo restaurar la etapa anterior.");
      }
    } finally {
      setRevertPending(false);
    }
  }, [onRevertStage]);

  const handleAddCatalogItem = useCallback(
    (option: CatalogItemOption) => {
      const nextItem = catalogOptionToQuoteItem(option, quoteMoneda || option.moneda || "MXN");
      setQuoteItems((prev) => {
        const cleaned = prev.filter((item) => !isBlankQuoteItem(item));
        return [...cleaned, nextItem];
      });
      setQuoteError(null);
      setCatalogSearch("");
    },
    [quoteMoneda],
  );

  const handleAddCatalogItems = useCallback(
    (options: CatalogItemOption[]) => {
      if (!options.length) return;
      const nextItems = options.map((option) => catalogOptionToQuoteItem(option, quoteMoneda || option.moneda || "MXN"));
      setQuoteItems((prev) => {
        const cleaned = prev.filter((item) => !isBlankQuoteItem(item));
        return cleaned.length ? [...cleaned, ...nextItems] : nextItems;
      });
      setQuoteError(null);
      setQuoteCatalogSelection([]);
      setQuoteCatalogPickerOpen(false);
      setQuoteCatalogPickerSearch("");
      setCatalogSearch("");
    },
    [quoteMoneda],
  );

  const handleAddEmptyItem = useCallback(() => {
    setQuoteItems((prev) => [...prev, createQuoteItemForm({ moneda: quoteMoneda || "MXN" })]);
  }, [quoteMoneda]);

  const handleItemFieldChange = useCallback(
    (index: number, field: keyof QuoteItemForm, value: string) => {
      setQuoteItems((prev) => prev.map((item, idx) => (idx === index ? { ...item, [field]: value } : item)));
    },
    [],
  );

  const handleItemPriceBlur = useCallback((index: number) => {
    setQuoteItems((prev) =>
      prev.map((item, idx) => {
        if (idx !== index) return item;
        const formatted = formatPresetNumberString(item.precioUnitario);
        if (formatted === item.precioUnitario) {
          return item;
        }
        return { ...item, precioUnitario: formatted };
      }),
    );
  }, []);

  const handleRemoveItem = useCallback(
    (index: number) => {
      setQuoteItems((prev) => {
        const next = prev.filter((_, idx) => idx !== index);
        return next.length ? next : [];
      });
    },
    [],
  );

  const handleUnlinkCatalogItem = useCallback((index: number) => {
    setQuoteItems((prev) => prev.map((item, idx) => (idx === index ? { ...item, catalogItemId: null } : item)));
  }, []);

  const handleOpenCatalogPicker = useCallback(() => {
    setQuoteCatalogPickerOpen(true);
    setQuoteCatalogPickerSearch("");
    setQuoteCatalogSelection([]);
  }, []);

  const handleCatalogSelectionToggle = useCallback((optionId: string) => {
    setQuoteCatalogSelection((prev) =>
      prev.includes(optionId) ? prev.filter((id) => id !== optionId) : [...prev, optionId],
    );
  }, []);

  const handleCatalogSearchKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key !== "Enter") return;
      if (!catalogSearchSuggestions.length) return;
      event.preventDefault();
      handleAddCatalogItem(catalogSearchSuggestions[0]);
    },
    [catalogSearchSuggestions, handleAddCatalogItem],
  );

  const handleQuoteChannelChange = (nextChannel: QuoteChannel) => {
    setQuoteChannel(nextChannel);
    if (nextChannel === "email" && !quoteEmailTo && card?.correo) {
      setQuoteEmailTo(card.correo);
    }
    if (nextChannel === "whatsapp" && !quoteWhatsappTo && card?.telefono) {
      setQuoteWhatsappTo(card.telefono);
    }
  };

  const handleQuoteAttachmentTrigger = () => {
    quoteAttachmentInputRef.current?.click();
  };

  const handleQuoteAttachmentsChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (!files.length) return;
    setQuoteAttachments((prev) => [
      ...prev,
      ...files.map((file) => ({
        id: `${file.name}-${file.size}-${file.lastModified}-${crypto.randomUUID()}`,
        file,
        name: file.name,
        size: file.size,
        type: file.type,
      })),
    ]);
    event.target.value = "";
  };

  const handleRemoveQuoteAttachment = (attachmentId: string) => {
    setQuoteAttachments((prev) => prev.filter((attachment) => attachment.id !== attachmentId));
  };

  const updateWonStagePrep = useCallback(
    (totalValue: number | null) => {
      const today = new Date().toISOString().split("T")[0] ?? "";
      setStagePrep((prev) => {
        const next = { ...prev };
        const wonPrep = { ...(next.cerrado_ganado ?? {}) };
        let changed = false;
        if (!wonPrep.close_date) {
          wonPrep["close_date"] = today;
          changed = true;
        }
        if (totalValue != null) {
          const formatted = String(totalValue);
          if (wonPrep["contract_value"] !== formatted) {
            wonPrep["contract_value"] = formatted;
            changed = true;
          }
        } else if (
          card?.monto != null &&
          typeof card.monto === "number" &&
          wonPrep["contract_value"] == null
        ) {
          wonPrep["contract_value"] = String(card.monto);
          changed = true;
        }
        if (!changed) {
          return prev;
        }
        next.cerrado_ganado = wonPrep;
        return next;
      });
    },
    [card],
  );

  useEffect(() => {
    if (!card?.oportunidadId) return;
    if (quotesState.status !== "loaded") return;
    const acceptedQuote = quotesState.data.find((quote) => quote.status === "aceptada");
    if (!acceptedQuote) return;
    updateWonStagePrep(acceptedQuote.total ?? null);
  }, [card?.oportunidadId, quotesState.status, quotesState.data, updateWonStagePrep]);

  const quoteValidityDays = useMemo(
    () => Math.max(1, Math.floor(quoteVendorSettings.validityDays || DEFAULT_QUOTE_VENDOR_SETTINGS.validityDays)),
    [quoteVendorSettings.validityDays],
  );

  const openQuoteDialog = useCallback(
    (channel: QuoteChannel) => {
      if (!card) return;
      const latestQuote = quotesState.data[0];
      const fallbackTitle =
        card.proyectoNombre?.trim() || (card.titulo ? `Propuesta ${card.titulo}` : "Cotización Tal-IA");
      const defaultTitle = fallbackTitle;
      const defaultDescription =
        card.proyectoNecesidades?.trim() || latestQuote?.description?.trim() || "";
      const defaultSubject =
        `Cotización Tal-IA · ${card.empresa ?? card.titulo ?? ""}`.trim() || "Cotización Tal-IA";
      const defaultMoneda = (
        latestQuote?.currency ||
        card.moneda ||
        quoteMoneda ||
        "MXN"
      ).toUpperCase();
      const defaultSubtotal =
        latestQuote?.subtotal != null && Number.isFinite(latestQuote.subtotal)
          ? String(latestQuote.subtotal)
          : typeof card.monto === "number" && Number.isFinite(card.monto)
          ? String(card.monto)
          : "";
      const defaultTotal =
        latestQuote?.total != null && Number.isFinite(latestQuote.total)
          ? String(latestQuote.total)
          : defaultSubtotal;
      const defaultTaxes =
        latestQuote?.taxes != null && Number.isFinite(latestQuote.taxes) ? String(latestQuote.taxes) : "";
      const validUntil =
        formatIsoDateForInput(latestQuote?.validUntil) ??
        formatDateInput(addDays(new Date(), quoteValidityDays));
      const initialItems = quoteEntryToItemForms(latestQuote, defaultDescription, defaultMoneda);
      const latestQuoteVendorSettings = isRecord(latestQuote?.metadata)
        ? latestQuote.metadata.quote_vendedores ?? null
        : null;
      setQuoteChannel(channel);
      setQuoteTitle(defaultTitle);
      setQuoteDescription(defaultDescription);
      setQuoteSubject(defaultSubject);
      setQuoteEmailTo(card.correo ?? "");
      setQuoteWhatsappTo(card.telefono ?? "");
      setQuoteAttachments([]);
      setQuoteSubtotal(formatPresetNumberString(defaultSubtotal));
      setQuoteImpuestos(formatPresetNumberString(defaultTaxes));
      setQuoteTotal(formatPresetNumberString(defaultTotal));
      setQuoteMoneda(defaultMoneda);
      setQuoteValidoHasta(validUntil);
      if (isRecord(latestQuoteVendorSettings)) {
        setQuoteVendorSettings(extractQuoteVendorSettings(latestQuoteVendorSettings));
      }
      setQuoteItems(initialItems);
      setCatalogSearch("");
      setQuoteCatalogPickerOpen(false);
      setQuoteCatalogPickerSearch("");
      setQuoteCatalogSelection([]);
      if (typeof window !== "undefined" && card?.oportunidadId) {
        const draftRaw = window.localStorage.getItem(`talia.embudo.quoteDraft.${card.oportunidadId}`);
        if (draftRaw) {
          try {
            const draft = JSON.parse(draftRaw) as Record<string, unknown>;
            if (draft && typeof draft === "object") {
              if (typeof draft.quoteChannel === "string" && (draft.quoteChannel === "email" || draft.quoteChannel === "whatsapp")) {
                setQuoteChannel(draft.quoteChannel);
              }
              if (typeof draft.quoteTitle === "string") setQuoteTitle(draft.quoteTitle);
              if (typeof draft.quoteDescription === "string") setQuoteDescription(draft.quoteDescription);
              if (typeof draft.quoteSubject === "string") setQuoteSubject(draft.quoteSubject);
              if (typeof draft.quoteEmailTo === "string") setQuoteEmailTo(draft.quoteEmailTo);
              if (typeof draft.quoteWhatsappTo === "string") setQuoteWhatsappTo(draft.quoteWhatsappTo);
              if (typeof draft.quoteSubtotal === "string") setQuoteSubtotal(draft.quoteSubtotal);
              if (typeof draft.quoteImpuestos === "string") setQuoteImpuestos(draft.quoteImpuestos);
              if (typeof draft.quoteTotal === "string") setQuoteTotal(draft.quoteTotal);
              if (typeof draft.quoteMoneda === "string") setQuoteMoneda(draft.quoteMoneda);
              if (typeof draft.quoteValidoHasta === "string") setQuoteValidoHasta(draft.quoteValidoHasta);
              if (isRecord(draft.quoteVendorSettings)) {
                setQuoteVendorSettings(extractQuoteVendorSettings(draft.quoteVendorSettings));
              }
              if (Array.isArray(draft.quoteItems)) {
                const restoredItems = draft.quoteItems
                  .filter(isRecord)
                      .map((item) =>
                        createQuoteItemForm({
                          catalogItemId: typeof item.catalogItemId === "string" ? item.catalogItemId : null,
                          fotoUrl: typeof item.fotoUrl === "string" ? item.fotoUrl : null,
                          nombre: typeof item.nombre === "string" ? item.nombre : "",
                          descripcion: typeof item.descripcion === "string" ? item.descripcion : "",
                          unidad: typeof item.unidad === "string" ? item.unidad : "unidad",
                      cantidad: typeof item.cantidad === "string" ? item.cantidad : "1",
                      precioUnitario: typeof item.precioUnitario === "string" ? item.precioUnitario : "",
                      descuento: typeof item.descuento === "string" ? item.descuento : "",
                      moneda: typeof item.moneda === "string" ? item.moneda : defaultMoneda,
                    }),
                  );
                if (restoredItems.length) {
                  setQuoteItems(restoredItems);
                }
              }
            }
          } catch {
            // Ignore invalid drafts.
          }
        }
      }
      setQuoteError(null);
      setQuoteSuccess(null);
      setQuoteDialogOpen(true);
    },
    [card, quoteMoneda, quoteValidityDays, quotesState.data],
  );

  const handleQuoteDialogOpenChange = (openState: boolean) => {
    if (!openState) {
      setQuoteDialogOpen(false);
      setQuoteCatalogPickerOpen(false);
      setQuoteCatalogPickerSearch("");
      setQuoteCatalogSelection([]);
      setQuotePreviewOpen(false);
      setQuotePreviewError(null);
      if (quotePreviewPdfUrl) {
        window.URL.revokeObjectURL(quotePreviewPdfUrl);
        setQuotePreviewPdfUrl(null);
      }
      setQuoteError(null);
      setQuoteAttachments([]);
    }
  };

  useEffect(() => {
    if (!quoteDialogOpen) return;
    let cancelled = false;

    const loadTemplate = async () => {
      setQuoteVendorSettingsLoading(true);
      try {
        const response = await fetch("/api/settings/variables", { cache: "no-store" });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || cancelled) return;
        const rawConfig = payload && typeof payload === "object" ? (payload as Record<string, unknown>).config : null;
        if (!rawConfig || typeof rawConfig !== "object") return;
        const vendorSettings = extractQuoteVendorSettings(rawConfig);
        setQuoteVendorSettings(vendorSettings);
        const currentDefaultDate = formatDateInput(addDays(new Date(), DEFAULT_QUOTE_VENDOR_SETTINGS.validityDays));
        const nextDefaultDate = formatDateInput(addDays(new Date(), vendorSettings.validityDays));
        setQuoteValidoHasta((current) => (current === currentDefaultDate ? nextDefaultDate : current));
      } finally {
        if (!cancelled) setQuoteVendorSettingsLoading(false);
      }
    };

    void loadTemplate();
    return () => {
      cancelled = true;
    };
  }, [quoteDialogOpen]);

  const handleSaveQuoteDraft = () => {
    if (!card || !quoteDraftStorageKey || typeof window === "undefined") return;
    const draft = {
      quoteChannel,
      quoteTitle,
      quoteDescription,
      quoteSubject,
      quoteEmailTo,
      quoteWhatsappTo,
      quoteSubtotal,
      quoteImpuestos,
      quoteTotal,
      quoteMoneda,
      quoteValidoHasta,
      quoteItems,
      quoteVendorSettings,
    };
    window.localStorage.setItem(quoteDraftStorageKey, JSON.stringify(draft));
    setQuoteSuccess("Borrador guardado localmente.");
  };

  const quoteSummaryCurrency = (quoteMoneda || card?.moneda || "MXN").trim().toUpperCase();
  const quoteSummarySubtotal = computedQuoteTotals?.subtotal ?? parseNumberInput(quoteSubtotal);
  const quoteSummaryTaxes = computedQuoteTotals?.taxes ?? parseNumberInput(quoteImpuestos);
  const quoteSummaryTotal = computedQuoteTotals?.total ?? parseNumberInput(quoteTotal);
  const quoteLatestEntry = quotesState.data[0] ?? null;
  const quotePreviewItems = quoteItems.filter((item) => !isBlankQuoteItem(item));
  const quotePreviewPdfReady = Boolean(quotePreviewPdfUrl);
  const opportunityAssigneeId = card?.asignadoId ?? selectedVendorId ?? "";
  const quoteAssignedVendor =
    vendorOptions.find((vendor) => vendor.id === selectedVendorId || vendor.id === card?.asignadoId) ?? null;
  const quoteDraftStorageKey = card ? `talia.embudo.quoteDraft.${card.oportunidadId}` : null;
  const quoteCurrentStatus = quoteLatestEntry?.status ?? "Borrador";
  const quoteCurrentFolio = quoteLatestEntry ? `COT-${String(quoteLatestEntry.version).padStart(5, "0")}` : "COT-00000";
  const quoteClientName = card?.empresa?.trim() || card?.contactoProfileName?.trim() || card?.nombre?.trim() || "Sin cliente";
  const quoteClientContact = card?.nombre?.trim() || card?.contactoProfileName?.trim() || "Sin contacto";
  const quoteClientPhone = card?.telefono?.trim() || "Sin teléfono";
  const quoteClientEmail = card?.correo?.trim() || "Sin email";
  const quoteProjectNeeds = card?.proyectoNecesidades?.trim() || card?.necesidadProposito?.trim() || "Sin necesidades";
  const quoteAssignedVendorName =
    quoteAssignedVendor?.nombre_completo?.trim() || card?.asignadoNombre?.trim() || "Sin vendedor";
  const quoteAssignedVendorEmail = quoteAssignedVendor?.correo?.trim() || "Sin correo";
  const quoteAssignedVendorPhone = quoteAssignedVendor?.telefono_e164?.trim() || "Sin teléfono";
  const quoteAlerts = useMemo(() => {
    const alerts: string[] = [];
    if (!quoteItems.length) alerts.push("No hay partidas agregadas.");
    if (quoteChannel === "email" && !quoteEmailTo.trim()) alerts.push("Falta destinatario de correo.");
    if (quoteChannel === "whatsapp" && !quoteWhatsappTo.trim()) alerts.push("Falta número de WhatsApp.");
    if (!quoteValidoHasta.trim()) alerts.push("La cotización no tiene vigencia.");
    if (quoteItems.some((item) => !item.nombre.trim() || !item.precioUnitario.trim())) {
      alerts.push("Hay partidas incompletas.");
    }
    return alerts;
  }, [quoteChannel, quoteEmailTo, quoteItems, quoteValidoHasta, quoteWhatsappTo]);
  const quoteRecentHistory = quotesState.data.slice(0, 4);
  const quoteCompactInputClass =
    "h-8 border-0 bg-muted/35 px-2 shadow-none ring-0 focus-visible:ring-0 focus-visible:border-0";
  const quoteCompactTextareaClass =
    "min-h-[88px] border-0 bg-muted/35 px-2 py-1.5 shadow-none ring-0 focus-visible:ring-0 focus-visible:border-0";
  const quoteVendorSettingsSnapshot = useMemo(
    () => buildQuoteVendorSettingsPayload(quoteVendorSettings),
    [quoteVendorSettings],
  );
  const quoteActionsDisabled = quotePending || quoteVendorSettingsLoading;

  const handleQuoteVendorConditionChange = (
    index: number,
    field: "subtitle" | "description",
    value: string,
  ) => {
    setQuoteVendorSettings((current) => ({
      ...current,
      conditions: current.conditions.map((item, position) =>
        position === index ? { ...item, [field]: value } : item,
      ),
    }));
  };

  const handleAddQuoteVendorCondition = () => {
    setQuoteVendorSettings((current) => ({
      ...current,
      conditions: [
        ...current.conditions,
        { subtitle: "", description: "" },
      ],
    }));
  };

  const handleRemoveQuoteVendorCondition = (index: number) => {
    setQuoteVendorSettings((current) => {
      if (current.conditions.length <= 1) {
        return {
          ...current,
          conditions: [{ subtitle: "", description: "" }],
        };
      }
      return {
        ...current,
        conditions: current.conditions.filter((_, position) => position !== index),
      };
    });
  };

  const buildQuoteBasePayload = useCallback(() => {
    const subtotalValue = computedQuoteTotals?.subtotal ?? parseNumberInput(quoteSubtotal);
    const taxValue = computedQuoteTotals?.taxes ?? parseNumberInput(quoteImpuestos);
    const totalValue = computedQuoteTotals?.total ?? parseNumberInput(quoteTotal);
    const itemsPayload = buildQuoteItemsPayload(quoteItems);
    const conceptsPayload = itemsPayload
      .map((item) => {
        const title = typeof item.titulo === "string" ? item.titulo : null;
        const description = typeof item.descripcion === "string" ? item.descripcion : null;
        const total = typeof item.total === "number" ? item.total : null;
        const unit = typeof item.unidad === "string" ? item.unidad : null;
        const quantity = typeof item.cantidad === "number" ? item.cantidad : null;
        if (!title && !description && total == null) {
          return null;
        }
        return {
          titulo: title,
          descripcion: description,
          total,
          unidad: unit,
          cantidad: quantity,
        };
      })
      .filter(
        (
          concept,
        ): concept is {
          titulo: string | null;
          descripcion: string | null;
          total: number | null;
          unidad: string | null;
          cantidad: number | null;
        } => !!concept,
      );

    return {
      titulo: quoteTitle.trim() || null,
      descripcion: quoteDescription.trim() || null,
      conceptos: conceptsPayload.length ? conceptsPayload : undefined,
      items: itemsPayload,
      subtotal: subtotalValue ?? null,
      impuestos: taxValue ?? null,
      total: totalValue ?? null,
      moneda: (quoteMoneda || "MXN").trim().toUpperCase(),
      valido_hasta: quoteValidoHasta?.trim() || null,
      metadatos: {
        quote_vendedores: quoteVendorSettingsSnapshot,
      },
    };
  }, [
    computedQuoteTotals?.subtotal,
    computedQuoteTotals?.taxes,
    computedQuoteTotals?.total,
    quoteDescription,
    quoteImpuestos,
    quoteItems,
    quoteMoneda,
    quoteSubtotal,
    quoteTitle,
    quoteTotal,
    quoteValidoHasta,
    quoteVendorSettingsSnapshot,
  ]);

  const buildQuotePayload = () => {
    const emails = parseEmailList(quoteEmailTo);
    return {
      channel: quoteChannel,
      ...buildQuoteBasePayload(),
      email_to: quoteChannel === "email" ? emails : undefined,
      whatsapp_to: quoteChannel === "whatsapp" ? quoteWhatsappTo.trim() || null : undefined,
      subject: quoteChannel === "email" ? quoteSubject.trim() || null : undefined,
    };
  };

  const fetchRenderedQuotePdf = useCallback(async (body: Record<string, unknown>) => {
    if (!card) {
      throw new Error("No hay oportunidad activa.");
    }
    const response = await fetch(`/api/embudo/leads/${card.oportunidadId}/quotes/pdf`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/pdf",
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const bodyError = await response.json().catch(() => ({}));
      const message =
        typeof bodyError?.error === "string" && bodyError.error ? bodyError.error : `Error ${response.status}`;
      throw new Error(message);
    }
    const blob = await response.blob();
    const disposition = response.headers.get("Content-Disposition") ?? "";
    const fileNameMatch = disposition.match(/filename\*?=(?:UTF-8''|")?([^\";]+)"?/i);
    const filename = fileNameMatch?.[1] ? decodeURIComponent(fileNameMatch[1].replace(/"/g, "")) : "cotizacion.pdf";
    return { blob, filename };
  }, [card]);

  const openGeneratedQuotePdfPreview = useCallback(async (body: Record<string, unknown>) => {
    setQuotePreviewError(null);
    setQuotePreviewPdfLoading(true);
    setQuotePreviewOpen(true);
    if (quotePreviewPdfUrl) {
      window.URL.revokeObjectURL(quotePreviewPdfUrl);
      setQuotePreviewPdfUrl(null);
    }
    setQuotePreviewPdfFilename("cotizacion.pdf");
    try {
      const { blob, filename } = await fetchRenderedQuotePdf(body);
      const objectUrl = window.URL.createObjectURL(blob);
      setQuotePreviewPdfUrl(objectUrl);
      setQuotePreviewPdfFilename(filename);
    } catch (error) {
      setQuotePreviewPdfUrl(null);
      setQuotePreviewPdfFilename("cotizacion.pdf");
      setQuotePreviewError(
        error instanceof Error ? error.message : "No se pudo generar la vista previa PDF.",
      );
    } finally {
      setQuotePreviewPdfLoading(false);
    }
  }, [fetchRenderedQuotePdf, quotePreviewPdfUrl]);

  const buildQuotePdfPayloadFromEntry = useCallback((quote: LeadQuoteEntry) => {
    const items = (quote.items ?? []).map((item, index) => ({
      catalog_item_id: item.catalogItemId,
      titulo: item.title ?? null,
      descripcion: item.description ?? quote.description ?? null,
      unidad: item.unit ?? "unidad",
      cantidad: item.quantity ?? null,
      precio_unitario: item.unitPrice ?? null,
      descuento: item.discount ?? null,
      total: item.total ?? null,
      moneda: item.currency ?? quote.currency ?? quoteMoneda,
      orden: index + 1,
      metadatos: item.fotoUrl ? { fotoUrl: item.fotoUrl } : undefined,
    }));
    return {
      titulo: quote.title ?? null,
      descripcion: quote.description ?? quoteProjectNeeds,
      conceptos: quote.concepts ?? undefined,
      items,
      subtotal: quote.subtotal ?? null,
      impuestos: quote.taxes ?? null,
      total: quote.total ?? null,
      moneda: (quote.currency || quoteMoneda || "MXN").trim().toUpperCase(),
      valido_hasta: quote.validUntil ?? null,
      metadatos: quote.metadata ?? undefined,
    };
  }, [quoteMoneda, quoteProjectNeeds]);

  const handleOpenQuotePreview = useCallback(() => {
    if (quoteVendorSettingsLoading) {
      setQuoteError("Espera a que cargue la configuración de cotización.");
      return;
    }
    void openGeneratedQuotePdfPreview(buildQuoteBasePayload());
  }, [buildQuoteBasePayload, openGeneratedQuotePdfPreview, quoteVendorSettingsLoading]);

  const handleCreateQuote = () => {
    if (!card) return;
    if (quoteVendorSettingsLoading) {
      setQuoteError("Espera a que cargue la configuración de cotización.");
      return;
    }
    setQuoteError(null);
    startQuoteAction(async () => {
      try {
        const payload = buildQuoteBasePayload();
        const itemsPayload = payload.items ?? [];
        const subtotalValue = payload.subtotal;
        const totalValue = payload.total;
        const hasItems = itemsPayload.length > 0;
        const hasTotals = subtotalValue != null || totalValue != null;
        if (!hasItems && !hasTotals) {
          setQuoteError("Agrega al menos un concepto con cantidad o define un monto estimado.");
          return;
        }
        const currencyValue = payload.moneda ?? "MXN";
        if (currencyValue.length !== 3) {
          setQuoteError("La moneda debe tener exactamente 3 caracteres (ej. MXN).");
          return;
        }

        const response = await fetch(`/api/embudo/leads/${card.oportunidadId}/quotes`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const responseBody = await response.json().catch(() => ({}));
        if (!response.ok) {
          const message =
            typeof responseBody?.error === "string" && responseBody.error ? responseBody.error : `Error ${response.status}`;
          setQuoteError(message);
          return;
        }
        setQuoteDialogOpen(false);
        setQuoteError(null);
        setQuoteSuccess("Cotización creada sin envío.");
        await fetchQuotes();
        await onQuotesChanged?.(card.oportunidadId);
      } catch (createError) {
        setQuoteError(
          createError instanceof Error
            ? createError.message
            : "No se pudo crear la cotización.",
        );
      }
    });
  };

  const handleSendQuote = () => {
    if (!card) return;
    if (quoteVendorSettingsLoading) {
      setQuoteError("Espera a que cargue la configuración de cotización.");
      return;
    }
    if (quoteChannel === "email") {
      const emails = parseEmailList(quoteEmailTo);
      if (!emails.length) {
        setQuoteError("Agrega al menos un correo para enviar la cotización.");
        return;
      }
      const invalidEmail = emails.some((email) => !EMAIL_REGEX.test(email));
      if (invalidEmail) {
        setQuoteError("Revisa los correos: uno o más tienen un formato inválido.");
        return;
      }
    } else {
      if (!quoteWhatsappTo.trim()) {
        setQuoteError("Ingresa el número de WhatsApp del contacto.");
        return;
      }
    }
    if (quoteAttachments.length > 0 && quoteChannel !== "email") {
      setQuoteError("Los archivos adjuntos solo se envían por correo.");
      return;
    }
    setQuoteError(null);
    startQuoteAction(async () => {
      try {
        const payload = buildQuotePayload();
        const subtotalValue = payload.subtotal;
        const totalValue = payload.total;
        const itemsPayload = payload.items;

        const hasItems = itemsPayload.length > 0;
        const hasTotals = subtotalValue != null || totalValue != null;
        if (!hasItems && !hasTotals) {
          setQuoteError("Agrega al menos un concepto con cantidad o define un monto estimado.");
          return;
        }
        const currencyValue = payload.moneda;
        if (currencyValue.length !== 3) {
          setQuoteError("La moneda debe tener exactamente 3 caracteres (ej. MXN).");
          return;
        }

        const formData = new FormData();
        formData.set("payload", JSON.stringify(payload));
        for (const attachment of quoteAttachments) {
          formData.append("attachments", attachment.file, attachment.name);
        }
        const response = await fetch(`/api/embudo/leads/${card.oportunidadId}/quotes/send`, {
          method: "POST",
          body: formData,
        });
        const responseBody = await response.json().catch(() => ({}));
        if (!response.ok) {
          const message =
            typeof responseBody?.error === "string" && responseBody.error ? responseBody.error : `Error ${response.status}`;
          setQuoteError(message);
          return;
        }
        setQuoteDialogOpen(false);
        setQuoteError(null);
        setQuoteSuccess("Cotización enviada correctamente.");
        await fetchQuotes();
        await onQuotesChanged?.(card.oportunidadId);
      } catch (sendError) {
        setQuoteError(
          sendError instanceof Error
            ? sendError.message
            : "No se pudo enviar la cotización.",
        );
      }
    });
  };

  const handleDownloadQuotePdf = async () => {
    if (!card) return;
    setQuotePreviewError(null);
    try {
      setQuotePreviewPdfLoading(true);
      const { blob, filename } = await fetchRenderedQuotePdf(buildQuoteBasePayload());
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      anchor.rel = "noopener";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => window.URL.revokeObjectURL(url), 30_000);
      setQuoteSuccess("PDF descargado correctamente.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo descargar el PDF.";
      setQuotePreviewError(message);
      window.alert(message);
    } finally {
      setQuotePreviewPdfLoading(false);
    }
  };

  const handleQuotePdfPreview = useCallback(async (quote: LeadQuoteEntry) => {
    try {
      setQuotePdfLoadingId(quote.id);
      const { blob } = await fetchRenderedQuotePdf(buildQuotePdfPayloadFromEntry(quote));
      const objectUrl = window.URL.createObjectURL(blob);
      window.open(objectUrl, "_blank", "noopener,noreferrer");
      window.setTimeout(() => window.URL.revokeObjectURL(objectUrl), 30_000);
    } catch (error) {
      console.error("[LeadDrawer] quote pdf preview failed", error);
      window.alert(error instanceof Error ? error.message : "No pudimos generar el enlace de descarga. Inténtalo de nuevo.");
    } finally {
      setQuotePdfLoadingId(null);
    }
  }, [buildQuotePdfPayloadFromEntry, fetchRenderedQuotePdf]);

  const handleQuoteStatusChange = useCallback(
    (quote: LeadQuoteEntry, nextStatus: "aceptada" | "rechazada" | "cancelada") => {
      if (!card) return;
      setQuoteError(null);
      startQuoteAction(async () => {
        try {
          const response = await fetch(`/api/embudo/quotes/${quote.id}/mark`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              estado: nextStatus,
              canal: quote.channel,
              metadata: { quote_version: quote.version },
            }),
          });
          const body = await response.json().catch(() => ({}));
          if (!response.ok) {
            const message =
              typeof body?.error === "string" && body.error
                ? body.error
                : `Error ${response.status}`;
            setQuoteError(message);
            return;
          }
          await fetchQuotes();
          if (nextStatus === "aceptada") {
            updateWonStagePrep(quote.total);
          }
        } catch (actionError) {
          setQuoteError(
            actionError instanceof Error
              ? actionError.message
              : "No se pudo actualizar la cotización.",
          );
        }
      });
    },
    [card, fetchQuotes, updateWonStagePrep],
  );

  const renderStageField = (stageCode: string, field: DrawerPrepFieldDefinition, forceDisabled = false) => {
    const stageValues = stagePrep[stageCode] ?? {};
    const rawValue = stageValues[field.key];
    const baseId = `${stageCode}-${field.key}`;
    const disabled = isBusy || forceDisabled;

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
              disabled={disabled}
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
              disabled={disabled}
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
        const fallbackOptions = FIELD_OPTION_FALLBACKS[field.key] ?? [];
        const options = (field.options && field.options.length ? field.options : fallbackOptions) ?? [];
        const selectValue = hasValue ? stringValue : "";
        return (
          <div className="grid gap-2">
            <label className="text-xs font-medium text-muted-foreground" htmlFor={`${baseId}-select`}>
              {field.label}
              {field.required ? " *" : ""}
            </label>
            <select
              id={`${baseId}-select`}
              className={cn(
                "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm text-foreground shadow-xs transition focus:outline-none focus:ring-2 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-50",
              )}
              value={selectValue}
              onChange={(event) => {
                const next = event.target.value;
                if (!field.required && next === EMPTY_SELECT_VALUE) {
                  handleStageFieldChange(stageCode, field, "");
                } else {
                  handleStageFieldChange(stageCode, field, next);
                }
              }}
              disabled={disabled || !options.length}
            >
              {field.required ? (
                <option value="" disabled>
                  {field.placeholder ?? "Selecciona una opción"}
                </option>
              ) : (
                <option value={EMPTY_SELECT_VALUE}>Sin seleccionar</option>
              )}
              {options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
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
              disabled={disabled}
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
    <>
      <Drawer open={open} onOpenChange={onOpenChange} direction="right">
      <DrawerContent className="data-[vaul-drawer-direction=right]:w-full data-[vaul-drawer-direction=right]:max-w-lg data-[vaul-drawer-direction=right]:h-screen data-[vaul-drawer-direction=right]:max-h-screen data-[vaul-drawer-direction=right]:overflow-hidden">
        <DrawerHeader className="items-start">
          <DrawerTitle>
            {isCreateMode ? "Nueva Oportunidad" : card?.nombre ?? "Lead sin nombre"}
          </DrawerTitle>
          <DrawerDescription className="flex flex-col gap-1 text-left">
            <span>{isCreateMode ? `Creando en etapa: ${stageName}` : `Etapa: ${stageName}`}</span>
            {!isCreateMode ? (
              <span className="flex flex-wrap items-center gap-2">
                {originBadge ? (
                  <Badge
                    variant="outline"
                    className={cn("w-fit text-[10px] font-semibold uppercase tracking-wide", originBadge.className)}
                    title={originBadge.title}
                  >
                    {originBadge.label}
                  </Badge>
                ) : null}
                {contactOriginBadge ? (
                  <Badge
                    variant="outline"
                    className={cn("w-fit text-[10px] font-semibold uppercase tracking-wide", contactOriginBadge.className)}
                    title={contactOriginBadge.title}
                  >
                    {contactOriginBadge.label}
                  </Badge>
                ) : null}
                {channelBadge ? (
                  <Badge
                    variant="outline"
                    className={cn("w-fit text-[10px] font-semibold uppercase tracking-wide", channelBadge.className)}
                    title={channelBadge.title}
                  >
                    {channelBadge.icon}
                    {channelBadge.label}
                  </Badge>
                ) : null}
              </span>
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
              isCreateMode || !card ? "grid-cols-1" : "grid-cols-5",
            )}
          >
            <TabsTrigger value="resumen">Resumen</TabsTrigger>
            {!isCreateMode && card ? (
              <>
                <TabsTrigger value="notas">Notas</TabsTrigger>
                <TabsTrigger value="actividades">Actividades</TabsTrigger>
                <TabsTrigger value="historial">Historial</TabsTrigger>
                <TabsTrigger value="onboarding">Onboarding</TabsTrigger>
              </>
            ) : null}
          </TabsList>

          <TabsContent value="resumen" className="flex flex-1 min-h-0 flex-col overflow-hidden parent-scroll">
            {autoStageSummary && !isCreateMode ? (
              <div className="mx-4 mb-3 flex items-start gap-3 rounded-xl border border-primary/40 bg-primary/5 p-3">
                <div className="rounded-full bg-primary/20 p-2 text-primary">
                  <IconRobot className="size-4" />
                </div>
                <div className="text-xs text-primary-900/80 dark:text-primary-100/80">
                  <p className="font-semibold text-primary-800 dark:text-primary-100">
                    Tal-IA movió este lead automáticamente.
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <span className="text-[11px] leading-snug">
                      Etapa actual: {autoStageSummary.stageLabel}.
                    </span>
                    <Badge
                      variant="outline"
                      className={cn(
                        "w-fit text-[10px] font-semibold uppercase tracking-wide",
                        CHANNEL_BADGE_TONES[autoStageSummary.channel?.trim().toLowerCase() || ""]?.className ??
                          "border-primary/30 bg-primary/5 text-primary",
                      )}
                      title={`Canal: ${autoStageSummary.channel}`}
                    >
                      {CHANNEL_BADGE_TONES[autoStageSummary.channel?.trim().toLowerCase() || ""]?.icon ?? (
                        <IconRobot className="size-3" />
                      )}
                      {CHANNEL_BADGE_TONES[autoStageSummary.channel?.trim().toLowerCase() || ""]?.label ??
                        autoStageSummary.channel}
                    </Badge>
                    {autoStageSummary.at ? <span className="text-[11px] leading-snug">{autoStageSummary.at}</span> : null}
                  </div>
                </div>
              </div>
            ) : null}
            <form
              onSubmit={handleSubmit(onSubmitForm)}
              className="flex flex-1 min-h-0 flex-col gap-4 overflow-y-auto px-4 pb-4"
            >
              {!isCreateMode && card && canReassign ? (
                <section className="space-y-3 rounded-2xl border border-border/60 bg-card/60 p-4 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h4 className="text-sm font-semibold text-foreground">Asignación</h4>
                    <Badge variant="outline">
                      Actual: {card.asignadoNombre?.trim() || "Sin asignar"}
                    </Badge>
                  </div>
                  <div className="grid gap-2">
                    <label className="text-xs font-medium text-muted-foreground" htmlFor="lead-vendedor">
                      Reasignar vendedor
                    </label>
                    <Select
                      value={selectedVendorId || undefined}
                      onValueChange={setSelectedVendorId}
                      disabled={vendorLoading || reassignPending}
                    >
                      <SelectTrigger id="lead-vendedor">
                        <SelectValue placeholder={vendorLoading ? "Cargando..." : "Selecciona vendedor"} />
                      </SelectTrigger>
                      <SelectContent>
                        {vendorOptions.map((option) => (
                          <SelectItem key={option.id} value={option.id}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {vendorError ? (
                      <p className="text-xs text-destructive">{vendorError}</p>
                    ) : null}
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={handleReassign}
                        disabled={
                          reassignPending ||
                          vendorLoading ||
                          !selectedVendorId ||
                          selectedVendorId === card.asignadoId
                        }
                      >
                        {reassignPending ? "Reasignando..." : "Reasignar"}
                      </Button>
                      {reassignSuccess ? (
                        <span className="text-xs text-emerald-600">{reassignSuccess}</span>
                      ) : null}
                      {reassignError ? (
                        <span className="text-xs text-destructive">{reassignError}</span>
                      ) : null}
                    </div>
                  </div>
                </section>
              ) : null}
              <section className="space-y-3 rounded-2xl border border-border/60 bg-card/60 p-4 shadow-sm">
                <h4 className="text-sm font-semibold text-foreground">Contacto</h4>
                {isCreateMode ? (
                  <div className="space-y-3 rounded-xl border border-dashed border-primary/30 bg-primary/5 p-3">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <p className="font-medium text-foreground">Vincular contacto existente</p>
                      {selectedContact ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={clearSelectedContact}
                          disabled={isBusy}
                        >
                          Limpiar
                        </Button>
                      ) : null}
                    </div>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Input
                        value={contactSearchQuery}
                        onChange={(event) => setContactSearchQuery(event.target.value)}
                        placeholder="Busca por nombre, correo o teléfono"
                        disabled={isBusy}
                      />
                      <Button
                        type="button"
                        onClick={handleContactSearch}
                        disabled={isBusy || contactSearchLoading}
                        variant="secondary"
                      >
                        {contactSearchLoading ? "Buscando..." : "Buscar"}
                      </Button>
                    </div>
                    {contactSearchError ? (
                      <p className="text-xs text-muted-foreground">{contactSearchError}</p>
                    ) : null}
                    {contactSearchResults.length ? (
                      <ul className="space-y-1 rounded-lg border border-border/60 bg-background/60 p-2 text-sm">
                        {contactSearchResults.map((contact) => (
                          <li key={contact.id}>
                            <button
                              type="button"
                              onClick={() => handleSelectExistingContact(contact)}
                              className="w-full rounded-md px-3 py-2 text-left hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                              disabled={isBusy}
                            >
                              <p className="font-medium text-foreground">{contact.nombre}</p>
                              <p className="text-xs text-muted-foreground">
                                {[contact.correo, contact.telefono, contact.empresa]
                                  .filter(Boolean)
                                  .join(" · ") || "Sin datos adicionales"}
                              </p>
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {selectedContact ? (
                      <div className="rounded-lg border border-green-400/50 bg-green-50 px-3 py-2 text-xs text-green-900">
                        <p>
                          Usando contacto: <span className="font-medium">{selectedContact.nombre}</span>
                        </p>
                        <p className="text-[11px] text-green-800">
                          Puedes editar los campos si necesitas actualizar sus datos.
                        </p>
                      </div>
                    ) : null}
                  </div>
                ) : null}
                <div className="grid gap-2">
                  <label className="text-xs font-medium text-muted-foreground" htmlFor="lead-nombre">
                    Nombre
                  </label>
                  <Input
                    id="lead-nombre"
                    placeholder="Nombre del contacto"
                    disabled={isBusy}
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
                    disabled={isBusy}
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
                    disabled={isBusy}
                    aria-invalid={errors.telefono ? "true" : "false"}
                    {...register("telefono")}
                  />
                  {errors.telefono ? (
                    <p className="text-xs text-destructive">{errors.telefono.message}</p>
                  ) : null}
              </div>
              <div className="grid gap-2">
                <label className="text-xs font-medium text-muted-foreground" htmlFor="lead-empresa">
                  Empresa
                </label>
                <Input
                  id="lead-empresa"
                  placeholder="Nombre de la empresa"
                  disabled={isBusy}
                  {...register("empresa")}
                />
              </div>
              <div className="rounded-xl border border-indigo-200/70 bg-indigo-50/70 p-4 shadow-sm">
                <div className="flex items-center gap-2 text-indigo-900">
                  <IconMessageCircle className="size-4" />
                  <span className="text-xs font-semibold uppercase tracking-wide">Insights generados por Tal-IA</span>
                </div>
                <p className="mt-1 text-xs text-indigo-900/80">
                  Información capturada automáticamente por Tal-IA durante la conversación.
                </p>
                <div className="mt-3 grid gap-3">
                  <div className="grid gap-2">
                    <label className="text-xs font-medium text-indigo-900/80" htmlFor="lead-notas">
                      Resumen del contexto
                    </label>
                    <Textarea
                      id="lead-notas"
                      placeholder="Resumen generado por Tal-IA"
                      disabled={isBusy}
                      rows={3}
                      {...register("notas")}
                    />
                  </div>
                  <div className="grid gap-2">
                    <label className="text-xs font-medium text-indigo-900/80" htmlFor="lead-necesidad">
                      Necesidad o propósito
                    </label>
                    <Textarea
                      id="lead-necesidad"
                      placeholder="Necesidad capturada por Tal-IA"
                      disabled={isBusy}
                      rows={3}
                      {...register("necesidadProposito")}
                    />
                  </div>
                </div>
              </div>
            </section>

            <section className="space-y-3 rounded-2xl border border-border/60 bg-card/60 p-4 shadow-sm">
              <div className="space-y-1">
                <h4 className="text-sm font-semibold text-foreground">Proyecto</h4>
                <p className="text-xs text-muted-foreground">
                  Describe el nombre y las necesidades principales asociadas al lead.
                </p>
              </div>
              <div className="grid gap-2">
                <label className="text-xs font-medium text-muted-foreground" htmlFor="lead-proyecto-nombre">
                  Nombre del proyecto
                </label>
                <Input
                  id="lead-proyecto-nombre"
                  placeholder="Implementación IA · Región Norte"
                  disabled={isBusy}
                  aria-invalid={errors.proyectoNombre ? "true" : "false"}
                  {...register("proyectoNombre")}
                />
                {errors.proyectoNombre ? (
                  <p className="text-xs text-destructive">{errors.proyectoNombre.message}</p>
                ) : null}
              </div>
              <div className="grid gap-2">
                <label
                  className="text-xs font-medium text-muted-foreground"
                  htmlFor="lead-proyecto-necesidades"
                >
                  Necesidades / objetivos
                </label>
                <Textarea
                  id="lead-proyecto-necesidades"
                  placeholder="Resumen de los objetivos, plazos o problemas a resolver."
                  disabled={isBusy}
                  rows={4}
                  {...register("proyectoNecesidades")}
                />
              </div>
            </section>

              <section className="space-y-3 rounded-2xl border border-border/60 bg-card/60 p-4 shadow-sm">
                <h4 className="text-sm font-semibold text-foreground">Estimación</h4>
                <div className="grid gap-2">
                  <label className="text-xs font-medium text-muted-foreground" htmlFor="lead-monto">
                    Monto estimado
                  </label>
                  <Input
                    id="lead-monto"
                    placeholder="$0.00"
                    inputMode="decimal"
                    disabled={isBusy}
                    aria-invalid={errors.monto ? "true" : "false"}
                    {...montoField}
                    onBlur={(event) => {
                      montoField.onBlur(event);
                      const formatted = formatCurrencyInputValue(
                        parseNumberInput(event.target.value),
                        getValues("moneda") || card?.moneda || "MXN",
                      );
                      if (formatted !== event.target.value) {
                        setValue("monto", formatted, { shouldDirty: true, shouldValidate: true });
                      }
                    }}
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
                    disabled={isBusy}
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
                    placeholder="0%"
                    inputMode="numeric"
                    disabled={isBusy}
                    aria-invalid={errors.probabilidad ? "true" : "false"}
                    {...probabilidadField}
                    onBlur={(event) => {
                      probabilidadField.onBlur(event);
                      const formatted = formatPercentInputValue(parseNumberInput(event.target.value));
                      if (formatted !== event.target.value) {
                        setValue("probabilidad", formatted, { shouldDirty: true, shouldValidate: true });
                      }
                    }}
                  />
                  {errors.probabilidad ? (
                    <p className="text-xs text-destructive">{errors.probabilidad.message}</p>
                  ) : null}
                </div>
              </section>

              {isCreateMode ? (
                <section className="space-y-3 rounded-2xl border border-border/60 bg-card/60 p-4 shadow-sm">
                  <div className="space-y-1">
                    <h4 className="text-sm font-semibold text-foreground">Cotizaciones</h4>
                    <p className="text-xs text-muted-foreground">
                      La cotización se habilita después de guardar el lead, porque necesita una oportunidad
                      persistida para generar el PDF y su historial.
                    </p>
                  </div>
                  <div className="rounded-xl border border-dashed border-border/70 bg-muted/30 p-3 text-xs text-muted-foreground">
                    Guarda primero la oportunidad para abrir el flujo de cotización desde esta misma ficha.
                  </div>
                </section>
              ) : null}

              {!isCreateMode && card ? (
                <section className="space-y-3 rounded-2xl border border-border/60 bg-card/60 p-4 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h4 className="text-sm font-semibold text-foreground">Cotizaciones</h4>
                      <p className="text-xs text-muted-foreground">
                        Envía propuestas en PDF y registra su estado desde aquí.
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        className="gap-1"
                        onClick={() => openQuoteDialog(quoteChannel)}
                        disabled={isBusy}
                      >
                        <IconChecklist className="size-4" />
                        Cotizar
                      </Button>
                    </div>
                  </div>

                  {quoteSuccess ? (
                    <p className="rounded-md border border-green-300 bg-green-50 px-3 py-2 text-xs text-green-800">
                      {quoteSuccess}
                    </p>
                  ) : null}

                  {quotesState.status === "loading" && quotesState.data.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-muted-foreground/40 p-3 text-xs text-muted-foreground">
                      Cargando cotizaciones...
                    </p>
                  ) : null}

                  {quotesState.status === "error" ? (
                    <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
                      {quotesState.error}
                    </p>
                  ) : null}

                  {quotesState.data.length ? (
                    <div className="space-y-3">
                      {quotesState.data.map((quote) => (
                        <div key={quote.id} className="space-y-2 rounded-lg border border-border/60 p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="space-y-1">
                              <div className="flex flex-wrap items-center gap-2 text-xs">
                                <Badge variant="outline">Versión {quote.version}</Badge>
                                <Badge variant={quoteStatusVariant(quote.status)}>
                                  {formatQuoteStatus(quote.status)}
                                </Badge>
                                {quote.channel ? (
                                  <Badge variant="secondary">{formatQuoteChannel(quote.channel)}</Badge>
                                ) : null}
                              </div>
                              <p className="text-xs text-muted-foreground">
                                {quote.sentAt
                                  ? `Enviada ${formatQuoteDate(quote.sentAt)}`
                                  : quote.createdAt
                                    ? `Creada ${formatQuoteDate(quote.createdAt)}`
                                    : "Sin enviar"}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                Total: {formatQuoteCurrency(quote.total, quote.currency)}
                              </p>
                              <p className="text-[11px] text-muted-foreground">
                                PDF disponible para vista previa y descarga.
                              </p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="gap-1"
                                onClick={() => handleQuotePdfPreview(quote)}
                                disabled={quotePdfLoadingId === quote.id}
                              >
                                {quotePdfLoadingId === quote.id ? (
                                  <IconLoader2 className="size-4 animate-spin" />
                                ) : (
                                  <IconEye className="size-4" />
                                )}
                                Ver PDF
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className="gap-1"
                                onClick={() => handleQuoteStatusChange(quote, "aceptada")}
                                disabled={quotePending}
                              >
                                <IconTrophy className="size-4" />
                                Marcar como aceptada
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className="gap-1"
                                onClick={() => handleQuoteStatusChange(quote, "rechazada")}
                                disabled={quotePending}
                              >
                                <IconHandStop className="size-4" />
                                Rechazada
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : quotesState.status === "loaded" ? (
                    <p className="text-xs text-muted-foreground">Aún no has enviado cotizaciones.</p>
                  ) : null}
                </section>
              ) : null}

              {hasUpcomingSections ? (
                <section className="space-y-4">
                  <div className="space-y-1">
                    <h4 className="text-sm font-semibold text-foreground">Próximas etapas</h4>
                    <p className="text-xs text-muted-foreground">
                      Completa la información para preparar el avance del lead en cada etapa.
                    </p>
                  </div>
                  <div className="relative space-y-6 pl-8">
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute left-3 top-1 bottom-3 w-px bg-border/60"
                    />
                    {upcomingStageGroups.map(({ stage, sections }, index) => {
                      const stageLockInfo = stageLocks.get(stage.codigo);
                      const stageLocked = stageLockInfo ? !stageLockInfo.canEdit : false;
                      const lockingStageName = stageLockInfo?.lockedReason;
                      const stageDescription = readStageMetaString(stage.metadatos, "descripcion");
                      const tokens = resolveStageTokens(stage);
                      const IconComponent = resolveStageIcon(stage.codigo);
                      const { completed, total } = countStageFields(stage.codigo, sections, stagePrep);
                      const progress = total ? Math.round((completed / total) * 100) : 0;
                      const stageCode = typeof stage.codigo === "string" ? stage.codigo.toLowerCase() : "";
                      const showScheduleDemoButton =
                        !!(
                          onScheduleDemo &&
                          card &&
                          card.conversacionId &&
                          !isCreateMode &&
                          isDemoStageCode(stageCode)
                        );
                      return (
                        <div key={stage.id} className="relative">
                          <span
                            aria-hidden="true"
                            className={cn(
                              "absolute -left-8 top-6 flex h-10 w-10 items-center justify-center rounded-full border-4 border-background text-[11px] font-semibold text-foreground shadow ring-2 ring-offset-2 ring-offset-background",
                              tokens.dotClass,
                              tokens.dotRingClass,
                            )}
                          >
                            {index + 1}
                          </span>
                          <div
                            className={cn(
                              "rounded-2xl border p-5 shadow-sm transition-shadow hover:shadow-md",
                              tokens.gradientClass,
                              tokens.borderClass,
                            )}
                          >
                            <div className="flex flex-wrap items-start justify-between gap-4">
                              <div className="flex items-center gap-3">
                                <div className={cn("flex h-11 w-11 items-center justify-center rounded-full", tokens.iconBgClass)}>
                                  <IconComponent className="size-5" stroke={1.5} />
                                </div>
                                <div className="space-y-1">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <Badge className={cn("text-[10px] font-semibold uppercase tracking-wide", tokens.badgeClass)}>
                                      Paso {index + 1}
                                    </Badge>
                                    {total ? (
                                      <span className="text-xs font-medium text-muted-foreground">
                                        {completed}/{total} campos
                                      </span>
                                    ) : null}
                                  </div>
                                  <h5 className="text-base font-semibold text-foreground">{stage.nombre}</h5>
                              {stageDescription ? (
                                <p className="text-xs text-muted-foreground">{stageDescription}</p>
                              ) : null}
                              {stageLocked && lockingStageName ? (
                                <p className="text-xs text-amber-700">
                                  Completa la etapa “{lockingStageName}” antes de llenar esta sección.
                                </p>
                              ) : null}
                            </div>
                          </div>
                              <div className="flex min-w-[160px] flex-1 flex-col items-stretch gap-2">
                                {showScheduleDemoButton ? (
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="secondary"
                                    className="justify-center gap-1"
                                    disabled={isBusy || stageLocked}
                                    onClick={() =>
                                      card &&
                                      onScheduleDemo?.({
                                        card,
                                        originStage: currentStage,
                                        targetStage: stage,
                                      })
                                    }
                                  >
                                    <IconCalendarEvent className="size-4" />
                                    Agendar cita
                                  </Button>
                                ) : null}
                                {total ? (
                                  <div className="min-w-[140px]">
                                    <div className="flex items-center justify-between text-[11px] font-medium text-muted-foreground">
                                      <span>Progreso</span>
                                      <span>{progress}%</span>
                                    </div>
                                    <div className="mt-1 h-1.5 rounded-full bg-white/60">
                                      <div
                                        className="h-full rounded-full transition-all"
                                        style={{ width: `${progress}%`, backgroundColor: tokens.accentColor }}
                                      />
                                    </div>
                                  </div>
                                ) : null}
                              </div>
                            </div>

                            <div className="mt-4 space-y-4">
                              {sections.map((section) => {
                                const sectionProgress = countSectionFields(stage.codigo, section, stagePrep);
                                return (
                                  <div
                                    key={`${stage.codigo}-${section.key}`}
                                    className="space-y-3 rounded-xl border border-white/70 bg-white/80 p-3 shadow-[0_1px_3px_rgba(15,23,42,0.08)]"
                                  >
                                    <div className="flex items-start justify-between gap-2">
                                      <div>
                                        <h6 className="text-xs font-semibold uppercase text-muted-foreground">
                                          {section.title}
                                        </h6>
                                        {section.description ? (
                                          <p className="text-xs text-muted-foreground">{section.description}</p>
                                        ) : null}
                                      </div>
                                      {section.fields.length ? (
                                        <span className="text-[10px] font-medium text-muted-foreground">
                                          {sectionProgress.completed}/{section.fields.length}
                                        </span>
                                      ) : null}
                                    </div>
                                    <div className="space-y-3">
                                      {section.fields.map((field) => (
                                        <div
                                          key={`${stage.codigo}-${field.key}`}
                                          className="rounded-lg border border-border/40 bg-background/70 p-3"
                                        >
                                          {renderStageField(stage.codigo, field, stageLocked)}
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
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
                  disabled={isBusy || (!card && !isCreateMode)}
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
                  disabled={isBusy}
                >
                  Cancelar
                </Button>
                {!isCreateMode && card && onDelete ? (
                  <Button
                    type="button"
                    variant="destructive"
                    className="w-full"
                    onClick={handleDeleteLead}
                    disabled={isBusy}
                  >
                    {deletePending ? "Eliminando..." : "Eliminar lead"}
                  </Button>
                ) : null}
              </DrawerFooter>
            </form>
          </TabsContent>

          {!isCreateMode && card ? (
            <TabsContent value="notas" className="flex flex-1 min-h-0 flex-col overflow-hidden parent-scroll">
            <div className="flex flex-1 min-h-0 flex-col gap-4 overflow-y-auto px-4 pb-6">
              <div className="space-y-3 rounded-lg border border-border/60 bg-muted/10 p-4">
              <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="text-sm font-semibold text-foreground">
                      {canCreateSupervisorNotes ? "Agregar nota como supervisor" : "Agregar nota"}
                    </h4>
                    {canCreateSupervisorNotes ? (
                      <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">
                        Supervisión
                      </Badge>
                    ) : null}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Las notas quedan registradas en CRM y pueden ligarse a un recordatorio.
                    {canCreateSupervisorNotes
                      ? " Esta nota se registra con tu usuario y rol de supervisión."
                      : ""}
                  </p>
                </div>
                <Textarea
                  value={noteText}
                  onChange={(event) => setNoteText(event.target.value)}
                  placeholder="Escribe una nota interna..."
                  disabled={notePending || isBusy}
                  minLength={1}
                />
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="note-reminder-enabled"
                    checked={noteReminderEnabled}
                    onCheckedChange={(value) => setNoteReminderEnabled(value === true)}
                  />
                  <label htmlFor="note-reminder-enabled" className="text-sm">
                    Crear recordatorio
                  </label>
                </div>
                {noteReminderEnabled ? (
                  <div className="grid gap-3 rounded-lg border border-border/50 bg-background/60 p-3 md:grid-cols-2">
                    <DateTimeCalendarPicker
                      id="note-reminder-at"
                      label="Fecha y hora"
                      value={noteReminderAt}
                      onChange={setNoteReminderAt}
                      disabled={notePending || isBusy}
                    />
                    <div className="space-y-1">
                      <label htmlFor="note-activity-type" className="text-xs font-medium text-muted-foreground">
                        Tipo de actividad
                      </label>
                      <Select value={noteActivityType} onValueChange={setNoteActivityType}>
                        <SelectTrigger id="note-activity-type">
                          <SelectValue placeholder="Selecciona tipo" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="seguimiento">Seguimiento</SelectItem>
                          <SelectItem value="llamada">Llamada</SelectItem>
                          <SelectItem value="correo">Correo</SelectItem>
                          <SelectItem value="reunion">Reunión</SelectItem>
                          <SelectItem value="interno">Interno</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                ) : null}
                {noteError ? (
                  <p className="text-xs text-destructive">{noteError}</p>
                ) : null}
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    onClick={handleAddNote}
                    disabled={notePending || isBusy}
                  >
                    {notePending ? "Guardando..." : "Guardar nota"}
                  </Button>
                </div>
              </div>

              <div className="space-y-3">
                {notesState.status === "loading" && noteEntries.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-muted-foreground/40 p-4 text-xs text-muted-foreground">
                    Cargando notas...
                  </p>
                ) : null}

                {notesState.status === "error" ? (
                  <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
                    {notesState.error ?? "No se pudieron cargar las notas."}
                  </p>
                ) : null}

                {noteEntries.length ? (
                  noteEntries.map((entry) => (
                    <div key={entry.id} className="space-y-2 rounded-lg border border-border/60 p-3">
                      <p className="text-sm text-foreground whitespace-pre-wrap">
                        {entry.texto ?? ""}
                      </p>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
                          {entry.tipo === "interna" ? "Nota interna" : entry.tipo}
                        </Badge>
                        {renderUserAuthorBadge(entry.creado_por_usuario, opportunityAssigneeId)}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {renderUserLine(entry.creado_por_usuario, "Nota", entry.creado_en)}
                        {entry.actividad_id ? " · Vinculada a actividad" : ""}
                      </p>
                    </div>
                  ))
                ) : notesState.status === "loaded" ? (
                  <p className="rounded-lg border border-dashed border-muted-foreground/40 p-4 text-xs text-muted-foreground">
                    Aún no hay notas registradas para esta oportunidad.
                  </p>
                ) : null}
              </div>
            </div>
          </TabsContent>
          ) : null}

          {!isCreateMode && card ? (
            <TabsContent value="actividades" className="flex flex-1 min-h-0 flex-col overflow-hidden parent-scroll">
              <div className="flex flex-1 min-h-0 flex-col gap-4 overflow-y-auto px-4 pb-6">
                <div className="space-y-3 rounded-lg border border-border/60 bg-muted/10 p-4">
                  <div>
                    <h4 className="text-sm font-semibold text-foreground">Crear actividad</h4>
                    <p className="text-xs text-muted-foreground">
                      Las actividades se generan desde notas con recordatorio. Aquí puedes verlas y cerrarlas.
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Cuando se crea una nota con recordatorio, la actividad queda asociada a esta oportunidad.
                  </p>
                </div>

                <div className="space-y-3">
                  {activitiesState.status === "loading" && activitiesState.data.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-muted-foreground/40 p-4 text-xs text-muted-foreground">
                      Cargando actividades...
                    </p>
                  ) : null}

                {activitiesState.status === "error" ? (
                  <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
                    {activitiesState.error ?? "No se pudieron cargar las actividades."}
                  </p>
                ) : null}
                {activityError ? (
                  <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
                    {activityError}
                  </p>
                ) : null}

                {activitiesState.data.length ? (
                    activitiesState.data.map((activity) => (
                      <div key={activity.id} className="space-y-2 rounded-lg border border-border/60 p-3">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="space-y-1">
                            <p className="text-sm font-medium text-foreground">
                              {activity.asunto ?? activity.tipo}
                            </p>
                            <p className="text-xs text-muted-foreground whitespace-pre-wrap">
                              {activity.descripcion ?? "Sin descripción."}
                            </p>
                          </div>
                          <Badge variant={activity.estado === "completada" ? "default" : activity.estado === "cancelada" ? "outline" : "secondary"}>
                            {activity.estado}
                          </Badge>
                        </div>
                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                          <span className="flex flex-wrap items-center gap-2">
                            <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
                              {activity.tipo}
                            </Badge>
                            {renderUserAuthorBadge(activity.creado_por_usuario, opportunityAssigneeId)}
                          </span>
                          <span>
                            {activity.recordatorio_en ? `Recordatorio: ${formatDateTime(activity.recordatorio_en)}` : "Sin recordatorio"}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {renderUserLine(activity.creado_por_usuario, "Actividad", activity.creado_en)}
                        </p>
                        {activity.estado === "pendiente" ? (
                          <div className="flex flex-wrap gap-2">
                            <Button
                              type="button"
                              size="sm"
                              onClick={() => handleCompleteActivity(activity.id)}
                              disabled={notePending || isBusy}
                            >
                              Completar
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => handleCancelActivity(activity.id)}
                              disabled={notePending || isBusy}
                            >
                              Cancelar
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    ))
                  ) : activitiesState.status === "loaded" ? (
                    <p className="rounded-lg border border-dashed border-muted-foreground/40 p-4 text-xs text-muted-foreground">
                      Aún no hay actividades registradas para esta oportunidad.
                    </p>
                  ) : null}
                </div>
              </div>
            </TabsContent>
          ) : null}

          {!isCreateMode && card ? (
          <TabsContent value="historial" className="flex flex-1 min-h-0 flex-col overflow-hidden parent-scroll">
            <div className="flex flex-1 min-h-0 flex-col space-y-3 overflow-y-auto px-4 pb-6">
              {latestStageMove && onRevertStage ? (
                <div className="flex items-start justify-between gap-3 rounded-xl border border-border/60 bg-muted/30 p-3">
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-foreground">Revertir última etapa</p>
                    <p className="text-xs text-muted-foreground">
                      Regresa esta oportunidad de “
                      {latestStageMove.etapa_destino_nombre ?? latestStageMove.etapa_destino_id ?? "etapa anterior"}
                      ” a “
                      {latestStageMove.etapa_origen_nombre ?? latestStageMove.etapa_origen_id ?? "etapa previa"}
                      ”.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={handleRevertStage}
                    disabled={isBusy}
                  >
                    {revertPending ? "Restaurando..." : "Volver a etapa anterior"}
                  </Button>
                </div>
              ) : null}
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

          {!isCreateMode && card ? (
          <TabsContent value="onboarding" className="flex flex-1 min-h-0 flex-col overflow-hidden parent-scroll">
            <LeadOnboardingPanel
              card={card}
              currentStage={currentStage}
              isOpen={open}
              isCreateMode={isCreateMode}
              active={activeTab === "onboarding"}
            />
          </TabsContent>
          ) : null}
    </Tabs>
  </DrawerContent>
    </Drawer>
    {!isCreateMode && card ? (
      <>
      <Dialog open={quoteDialogOpen} onOpenChange={handleQuoteDialogOpenChange}>
        <DialogContent className="flex h-[90vh] w-[96vw] max-w-[96vw] flex-col overflow-hidden p-0">
          <div className="flex h-full min-h-0 flex-col bg-background">
            <div className="border-b border-border/50 px-3 py-2.5 sm:px-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <DialogTitle className="text-base font-semibold">Nueva cotización</DialogTitle>
                    <Badge variant="outline" className="h-5 rounded-full px-2 text-[10px] uppercase tracking-wide">
                      {quoteCurrentFolio}
                    </Badge>
                    <Badge variant="secondary" className="h-5 rounded-full px-2 text-[10px] uppercase tracking-wide">
                      {quoteCurrentStatus}
                    </Badge>
                  </div>
                  <DialogDescription className="max-w-2xl text-xs">
                    Cotización para {card.titulo ?? "la oportunidad seleccionada"}.
                  </DialogDescription>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button type="button" size="sm" variant="outline" disabled>
                    ...
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={handleSaveQuoteDraft} disabled={quotePending}>
                    Guardar borrador
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className="gap-1"
                    variant={quoteChannel === "email" ? "default" : "outline"}
                    onClick={() => handleQuoteChannelChange("email")}
                    disabled={quotePending}
                  >
                    <IconMail className="size-4" />
                    Correo
                  </Button>
                  <Button type="button" size="sm" onClick={handleSendQuote} disabled={quotePending}>
                    {quotePending ? "Enviando..." : "Enviar cotización"}
                  </Button>
                </div>
              </div>
            </div>

            <div className="grid min-h-0 flex-1 gap-0 overflow-hidden grid-rows-[minmax(0,1fr)] lg:grid-cols-[minmax(0,1fr)_300px]">
              <ScrollArea className="h-full min-h-0">
                <div className="space-y-3 px-3 py-3 pb-28 sm:px-4">
                  <div className="space-y-2 pb-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <h4 className="text-sm font-semibold text-foreground">Datos principales</h4>
                        <p className="text-[11px] text-muted-foreground">Campos base de la propuesta.</p>
                      </div>
                    </div>
                    <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                      <div className="grid gap-1">
                        <label className="text-[11px] font-medium text-muted-foreground">Título interno</label>
                        <Input
                          value={quoteTitle}
                          onChange={(event) => setQuoteTitle(event.target.value)}
                          disabled={quotePending}
                          placeholder="Implementación Tal-IA"
                          className={quoteCompactInputClass}
                        />
                      </div>
                      <div className="grid gap-1 md:col-span-2">
                        <label className="text-[11px] font-medium text-muted-foreground">Descripción / resumen</label>
                        <Input
                          value={quoteDescription}
                          onChange={(event) => setQuoteDescription(event.target.value)}
                          disabled={quotePending}
                          placeholder="Resumen del proyecto que aparecerá en el PDF."
                          className={quoteCompactInputClass}
                        />
                      </div>
                      <div className="grid gap-1">
                        <label className="text-[11px] font-medium text-muted-foreground">Destinatarios</label>
                        <Input
                          value={quoteEmailTo}
                          onChange={(event) => setQuoteEmailTo(event.target.value)}
                          disabled={quotePending}
                          placeholder="correo@empresa.com"
                          className={quoteCompactInputClass}
                        />
                      </div>
                    </div>
                    <div className="mt-2 grid gap-2 md:grid-cols-3">
                      <div className="grid gap-1 md:col-span-2">
                        <label className="text-[11px] font-medium text-muted-foreground">Asunto</label>
                        <Input
                          value={quoteSubject}
                          onChange={(event) => setQuoteSubject(event.target.value)}
                          disabled={quotePending}
                          placeholder="Cotización Tal-IA"
                          className={quoteCompactInputClass}
                        />
                      </div>
                      <div className="grid gap-1">
                        <label className="text-[11px] font-medium text-muted-foreground">Vigente hasta</label>
                        <Input
                          type="date"
                          value={quoteValidoHasta}
                          onChange={(event) => setQuoteValidoHasta(event.target.value)}
                          disabled={quotePending}
                          className={quoteCompactInputClass}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-3 lg:grid-cols-2">
                    <div className="rounded-md bg-muted/20 p-3">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <div>
                          <h4 className="text-sm font-semibold text-foreground">Tarjeta de cliente</h4>
                          <p className="text-[11px] text-muted-foreground">Confirma el cliente de la cotización.</p>
                        </div>
                        <Button type="button" size="sm" variant="outline" disabled>
                          Ver perfil del cliente
                        </Button>
                      </div>
                      <div className="grid gap-1 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-muted-foreground">Razón social</span>
                          <span className="font-medium text-foreground">{quoteClientName}</span>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-muted-foreground">RFC</span>
                          <span className="font-medium text-foreground">Sin RFC</span>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-muted-foreground">Email</span>
                          <span className="font-medium text-foreground">{quoteClientEmail}</span>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-muted-foreground">Teléfono</span>
                          <span className="font-medium text-foreground">{quoteClientPhone}</span>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-muted-foreground">Contacto</span>
                          <span className="font-medium text-foreground">{quoteClientContact}</span>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-md bg-muted/20 p-3">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <div>
                          <h4 className="text-sm font-semibold text-foreground">Tarjeta de proyecto</h4>
                          <p className="text-[11px] text-muted-foreground">Cotización ligada al proyecto seleccionado.</p>
                        </div>
                        <Button type="button" size="sm" variant="outline" disabled>
                          Seleccionar proyecto
                        </Button>
                      </div>
                      <div className="grid gap-1 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-muted-foreground">Necesidades</span>
                          <span className="font-medium text-foreground">{quoteProjectNeeds}</span>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-muted-foreground">Referencia</span>
                          <span className="font-medium text-foreground">{formatOpportunityReference(card.codigoOportunidad)}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2 pb-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h4 className="text-sm font-semibold text-foreground">Productos y conceptos</h4>
                        <p className="text-[11px] text-muted-foreground">
                          Usa el buscador semántico o abre el listado para multiselección.
                        </p>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={handleOpenCatalogPicker}
                        disabled={quotePending || catalogState.status === "loading"}
                      >
                        Productos y servicios
                      </Button>
                    </div>

                    <div className="relative">
                      <div className="flex items-center gap-2 rounded-md bg-muted/35 px-2">
                        <IconSearch className="size-4 shrink-0 text-muted-foreground" />
                        <Input
                          value={catalogSearch}
                          onChange={(event) => setCatalogSearch(event.target.value)}
                          onKeyDown={handleCatalogSearchKeyDown}
                          placeholder="Buscar por producto, servicio, SKU o descripción"
                          disabled={catalogState.status === "loading"}
                          className="h-8 border-0 bg-transparent px-0 shadow-none ring-0 focus-visible:border-0 focus-visible:ring-0"
                        />
                      </div>
                      {catalogSearch.trim().length > 0 && catalogSearchSuggestions.length ? (
                        <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-md border border-border/40 bg-background shadow-sm">
                          {catalogSearchSuggestions.map((item) => {
                            const imageUrl = resolveCatalogItemImageUrl(item);
                            return (
                              <button
                                key={item.id}
                                type="button"
                                className="flex w-full items-start gap-3 px-3 py-2 text-left text-xs hover:bg-muted/40"
                                onClick={() => handleAddCatalogItem(item)}
                                disabled={quotePending}
                              >
                                <span className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border/40 bg-muted/30">
                                  {imageUrl ? (
                                    <>
                                      <Image
                                        src={imageUrl}
                                        alt=""
                                        width={40}
                                        height={40}
                                        unoptimized
                                        className="h-full w-full object-cover"
                                        onError={(event) => {
                                          const fallback = event.currentTarget.parentElement?.querySelector<HTMLElement>(
                                            "[data-fallback='true']",
                                          );
                                          if (fallback) fallback.classList.remove("hidden");
                                          event.currentTarget.style.display = "none";
                                        }}
                                      />
                                      <span
                                        data-fallback="true"
                                        className="hidden absolute inset-0 items-center justify-center text-[9px] uppercase text-muted-foreground"
                                      >
                                        Sin img
                                      </span>
                                    </>
                                  ) : (
                                    <span className="text-[9px] uppercase text-muted-foreground">Sin img</span>
                                  )}
                                </span>
                                <span className="min-w-0 flex-1 pt-1">
                                  <span className="block truncate text-sm font-medium text-foreground">
                                    {item.nombre}
                                  </span>
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      ) : null}
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Escribe para buscar y selecciona una sugerencia. El listado completo se abre desde el botón.
                    </p>
                  </div>

                  <div className="space-y-2 pb-3">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <h4 className="text-sm font-semibold text-foreground">Partidas cotizadas</h4>
                        <p className="text-[11px] text-muted-foreground">
                          Edita aquí los conceptos ya agregados a la cotización.
                        </p>
                      </div>
                      <Button type="button" size="sm" variant="outline" className="gap-1" onClick={handleAddEmptyItem} disabled={quotePending}>
                        <IconPlus className="size-4" />
                        Línea en blanco
                      </Button>
                    </div>

                    <div className="flex min-h-0 flex-col overflow-hidden rounded-md border border-border/40 bg-muted/20">
                      <div className="grid grid-cols-[40px_minmax(0,1.45fr)_72px_82px_96px_72px_84px_40px] gap-2 border-b border-border/40 px-2 py-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                        <span>Img.</span>
                        <span>Concepto</span>
                        <span>Cant.</span>
                        <span>Unidad</span>
                        <span>Precio</span>
                        <span>Desc.</span>
                        <span>Total</span>
                        <span className="text-right"> </span>
                      </div>
                      <ScrollArea className="h-72 min-h-0">
                        <div className="space-y-1.5 px-2 py-2">
                          {quoteItems.map((item, index) => {
                            const catalogImageUrl = item.catalogItemId
                              ? catalogItemsById.get(item.catalogItemId)?.fotoUrl ?? null
                              : null;
                            const imageUrl = item.fotoUrl || catalogImageUrl;
                            return (
                            <div
                              key={item.key}
                              className="grid grid-cols-[40px_minmax(0,1.45fr)_72px_82px_96px_72px_84px_40px] items-start gap-2 rounded-md bg-background px-2 py-2"
                            >
                              <div
                                className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-md border border-border/40 bg-muted/30 bg-center bg-cover"
                                style={imageUrl ? { backgroundImage: `url(${imageUrl})` } : undefined}
                              >
                                {!imageUrl ? (
                                  <span className="text-[9px] uppercase text-muted-foreground">Sin img</span>
                                ) : null}
                              </div>
                              <div className="min-w-0 space-y-1">
                                <Input
                                  value={item.nombre}
                                  onChange={(event) => handleItemFieldChange(index, "nombre", event.target.value)}
                                  disabled={quotePending}
                                  placeholder="Nombre del concepto"
                                  className={quoteCompactInputClass}
                                />
                                <Input
                                  value={item.descripcion}
                                  onChange={(event) => handleItemFieldChange(index, "descripcion", event.target.value)}
                                  disabled={quotePending}
                                  placeholder="Descripción breve"
                                  className={quoteCompactInputClass}
                                />
                                {item.catalogItemId ? (
                                  <button
                                    type="button"
                                    className="text-[10px] font-medium text-emerald-600 hover:underline"
                                    onClick={() => handleUnlinkCatalogItem(index)}
                                    disabled={quotePending}
                                  >
                                    Vinculado al catálogo
                                  </button>
                                ) : null}
                              </div>
                              <Input
                                value={item.cantidad}
                                onChange={(event) => handleItemFieldChange(index, "cantidad", event.target.value)}
                                disabled={quotePending}
                                placeholder="1"
                                className={quoteCompactInputClass}
                              />
                              <Input
                                value={item.unidad}
                                onChange={(event) => handleItemFieldChange(index, "unidad", event.target.value)}
                                disabled={quotePending}
                                placeholder="und"
                                className={quoteCompactInputClass}
                              />
                              <Input
                                value={item.precioUnitario}
                                onChange={(event) => handleItemFieldChange(index, "precioUnitario", event.target.value)}
                                onBlur={() => handleItemPriceBlur(index)}
                                disabled={quotePending}
                                placeholder="0.00"
                                className={quoteCompactInputClass}
                              />
                              <Input
                                value={item.descuento}
                                onChange={(event) => handleItemFieldChange(index, "descuento", event.target.value)}
                                disabled={quotePending}
                                placeholder="0.00"
                                className={quoteCompactInputClass}
                              />
                              <div className="flex items-center justify-end px-1 pt-1 text-xs font-medium text-foreground">
                                {formatQuoteCurrency(computeQuoteItemTotal(item), item.moneda || quoteSummaryCurrency)}
                              </div>
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                className="size-8"
                                onClick={() => handleRemoveItem(index)}
                                disabled={quotePending}
                              >
                                <IconTrash className="size-4" />
                              </Button>
                            </div>
                            );
                          })}
                        </div>
                      </ScrollArea>
                    </div>
                  </div>

                  <div className="space-y-3 pb-2">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <h4 className="text-sm font-semibold text-foreground">Condiciones comerciales</h4>
                          <p className="text-[11px] text-muted-foreground">
                            Define la base estructurada que se guardará en la cotización.
                          </p>
                        </div>
                        {quoteVendorSettingsLoading ? (
                          <span className="text-[11px] text-muted-foreground">Cargando base...</span>
                        ) : null}
                      </div>
                      <div className="space-y-3 rounded-md border border-border/40 bg-muted/20 p-3">
                        <div className="space-y-2">
                          <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
                            Título del bloque
                          </Label>
                          <Input
                            value={quoteVendorSettings.conditionsTitle}
                            onChange={(event) =>
                              setQuoteVendorSettings((current) => ({
                                ...current,
                                conditionsTitle: event.target.value,
                              }))
                            }
                            disabled={quotePending || quoteVendorSettingsLoading}
                            className={quoteCompactInputClass}
                            placeholder="Condiciones comerciales"
                          />
                        </div>
                        <div className="space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
                              Subtítulos y descripciones
                            </Label>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-7 gap-1 px-2 text-[11px]"
                              onClick={handleAddQuoteVendorCondition}
                              disabled={quotePending || quoteVendorSettingsLoading}
                            >
                              <IconPlus className="size-3.5" />
                              Agregar
                            </Button>
                          </div>
                          <div className="space-y-2">
                            {quoteVendorSettings.conditions.map((item, index) => (
                              <div
                                key={`quote-vendor-condition-${index}`}
                                className="grid gap-2 rounded-md border border-border/30 bg-background p-2 md:grid-cols-[180px_minmax(0,1fr)_auto]"
                              >
                                <div className="space-y-1.5">
                                  <Label className="text-[11px] text-muted-foreground">Subtítulo</Label>
                                  <Input
                                    value={item.subtitle}
                                    onChange={(event) =>
                                      handleQuoteVendorConditionChange(index, "subtitle", event.target.value)
                                    }
                                    disabled={quotePending || quoteVendorSettingsLoading}
                                    placeholder="Vigencia"
                                    className={quoteCompactInputClass}
                                  />
                                </div>
                                <div className="space-y-1.5">
                                  <Label className="text-[11px] text-muted-foreground">Descripción</Label>
                                  <Textarea
                                    value={item.description}
                                    onChange={(event) =>
                                      handleQuoteVendorConditionChange(index, "description", event.target.value)
                                    }
                                    disabled={quotePending || quoteVendorSettingsLoading}
                                    rows={2}
                                    placeholder="Detalle de la condición."
                                    className={quoteCompactTextareaClass}
                                  />
                                </div>
                                <div className="flex items-end md:justify-end">
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="size-8"
                                    onClick={() => handleRemoveQuoteVendorCondition(index)}
                                    disabled={quotePending || quoteVendorSettingsLoading}
                                  >
                                    <IconTrash className="size-4" />
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <h4 className="text-sm font-semibold text-foreground">Notas y anexos</h4>
                          <p className="text-[11px] text-muted-foreground">
                            La nota se guarda junto con la cotización y los anexos siguen disponibles.
                          </p>
                        </div>
                      </div>
                      <div className="space-y-2 rounded-md border border-border/40 bg-muted/20 p-3">
                        <div className="space-y-2">
                          <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
                            Título de notas
                          </Label>
                          <Input
                            value={quoteVendorSettings.notesTitle}
                            onChange={(event) =>
                              setQuoteVendorSettings((current) => ({
                                ...current,
                                notesTitle: event.target.value,
                              }))
                            }
                            disabled={quotePending || quoteVendorSettingsLoading}
                            className={quoteCompactInputClass}
                            placeholder="Notas"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
                            Descripción de notas
                          </Label>
                          <Textarea
                            value={quoteVendorSettings.notesBody}
                            onChange={(event) =>
                              setQuoteVendorSettings((current) => ({
                                ...current,
                                notesBody: event.target.value,
                              }))
                            }
                            disabled={quotePending || quoteVendorSettingsLoading}
                            rows={3}
                            placeholder="Captura aquí las notas de apoyo."
                            className={quoteCompactTextareaClass}
                          />
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={handleQuoteAttachmentTrigger}
                          disabled={quotePending}
                        >
                          <IconPaperclip className="size-4" />
                          Agregar archivo
                        </Button>
                        <input
                          ref={quoteAttachmentInputRef}
                          type="file"
                          className="hidden"
                          multiple
                          onChange={handleQuoteAttachmentsChange}
                        />
                        {quoteAttachments.length ? (
                          <span className="text-[11px] text-muted-foreground">
                            {quoteAttachments.length} archivo{quoteAttachments.length === 1 ? "" : "s"} listo
                            {quoteAttachments.length === 1 ? "" : "s"} para enviar.
                          </span>
                        ) : (
                          <span className="text-[11px] text-muted-foreground">Sin archivos adjuntos.</span>
                        )}
                      </div>
                      {quoteAttachments.length ? (
                        <div className="space-y-1.5 rounded-md border border-dashed border-border/40 bg-background/70 p-2">
                          {quoteAttachments.map((attachment) => (
                            <div
                              key={attachment.id}
                              className="flex items-center justify-between gap-2 rounded-md bg-muted/30 px-2 py-1.5 text-xs"
                            >
                              <div className="min-w-0">
                                <p className="truncate font-medium text-foreground">{attachment.name}</p>
                                <p className="text-muted-foreground">
                                  {(attachment.size / 1024).toFixed(1)} KB
                                  {attachment.type ? ` · ${attachment.type}` : ""}
                                </p>
                              </div>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="size-8 shrink-0"
                                onClick={() => handleRemoveQuoteAttachment(attachment.id)}
                                disabled={quotePending}
                              >
                                <IconTrash className="size-4" />
                                <span className="sr-only">Eliminar archivo</span>
                              </Button>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              </ScrollArea>

              <aside className="border-t border-border/40 bg-muted/15 lg:border-l lg:border-t-0">
                <ScrollArea className="h-full min-h-0">
                  <div className="space-y-3 p-3">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <h4 className="text-sm font-semibold text-foreground">Resumen</h4>
                          <p className="text-[11px] text-muted-foreground">Totales calculados en tiempo real.</p>
                        </div>
                        <Badge variant="outline" className="h-6 rounded-full px-2 text-[10px] uppercase tracking-wide">
                          {quoteSummaryCurrency}
                        </Badge>
                      </div>
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between gap-2 text-sm">
                          <span className="text-muted-foreground">Subtotal</span>
                          <Input
                            value={quoteSubtotal}
                            onChange={(event) => setQuoteSubtotal(event.target.value)}
                            disabled={quotePending}
                            placeholder="0.00"
                            className={`${quoteCompactInputClass} w-[108px] text-right`}
                          />
                        </div>
                        <div className="flex items-center justify-between gap-2 text-sm">
                          <span className="text-muted-foreground">IVA 16%</span>
                          <Input
                            value={quoteImpuestos}
                            onChange={(event) => setQuoteImpuestos(event.target.value)}
                            disabled={quotePending}
                            placeholder="0.00"
                            className={`${quoteCompactInputClass} w-[108px] text-right`}
                          />
                        </div>
                        <div className="flex items-center justify-between gap-2 border-t border-border/40 pt-2 text-base font-semibold">
                          <span className="text-foreground">Total</span>
                          <Input
                            value={quoteTotal}
                            onChange={(event) => setQuoteTotal(event.target.value)}
                            disabled={quotePending}
                            placeholder="0.00"
                            className={`${quoteCompactInputClass} w-[108px] text-right`}
                          />
                        </div>
                      </div>
                      <div className="space-y-1.5 rounded-md bg-background/70 p-2 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-muted-foreground">Subtotal calculado</span>
                          <span className="font-medium text-foreground">
                            {formatQuoteCurrency(quoteSummarySubtotal, quoteSummaryCurrency)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-muted-foreground">IVA calculado</span>
                          <span className="font-medium text-foreground">
                            {formatQuoteCurrency(quoteSummaryTaxes, quoteSummaryCurrency)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-muted-foreground">Total calculado</span>
                          <span className="font-semibold text-foreground">
                            {formatQuoteCurrency(quoteSummaryTotal, quoteSummaryCurrency)}
                          </span>
                        </div>
                      </div>
                      <div className="grid gap-1.5 text-xs">
                        <div className="flex items-center justify-between gap-2 rounded-md bg-background/70 px-2 py-1.5">
                          <span className="text-muted-foreground">Vigencia</span>
                          <span className="font-medium text-foreground">{quoteValidoHasta || "Sin fecha"}</span>
                        </div>
                        <div className="flex items-center justify-between gap-2 rounded-md bg-background/70 px-2 py-1.5">
                          <span className="text-muted-foreground">Canal</span>
                          <span className="font-medium text-foreground">
                            {quoteChannel === "email" ? "Correo" : "WhatsApp"}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2 border-t border-border/40 pt-3">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <h4 className="text-sm font-semibold text-foreground">Alertas</h4>
                          <p className="text-[11px] text-muted-foreground">Revisa estos puntos antes de enviar.</p>
                        </div>
                      </div>
                      {quoteAlerts.length ? (
                        <div className="space-y-1.5">
                          {quoteAlerts.map((alert) => (
                            <div key={alert} className="flex items-start gap-2 rounded-md bg-amber-50 px-2 py-1.5 text-[11px] text-amber-900">
                              <IconAlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                              <span>{alert}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="rounded-md bg-emerald-50 px-2 py-1.5 text-[11px] text-emerald-800">
                          No hay alertas críticas.
                        </div>
                      )}
                    </div>

                    {quoteError ? (
                      <p className="rounded-md bg-destructive/10 px-2.5 py-2 text-xs text-destructive">
                        {quoteError}
                      </p>
                    ) : null}
                    {quoteSuccess ? (
                      <p className="rounded-md bg-green-50 px-2.5 py-2 text-xs text-green-800">
                        {quoteSuccess}
                      </p>
                    ) : null}

                    <div className="space-y-2 border-t border-border/40 pt-3">
                      <div>
                        <h4 className="text-sm font-semibold text-foreground">Acciones</h4>
                        <p className="text-[11px] text-muted-foreground">
                          Previsualiza, crea la cotización o envíala por canal.
                        </p>
                      </div>
                      <div className="grid gap-2">
                        <Button type="button" variant="outline" onClick={handleOpenQuotePreview} disabled={quoteActionsDisabled}>
                          Vista previa PDF
                        </Button>
                        <Button type="button" variant="secondary" onClick={handleCreateQuote} disabled={quoteActionsDisabled}>
                          {quotePending ? "Creando..." : quoteVendorSettingsLoading ? "Cargando..." : "Crear cotización"}
                        </Button>
                        <Button type="button" onClick={handleSendQuote} disabled={quoteActionsDisabled}>
                          {quotePending ? "Enviando..." : quoteVendorSettingsLoading ? "Cargando..." : "Enviar cotización"}
                        </Button>
                        <Button type="button" variant="ghost" onClick={handleSaveQuoteDraft} disabled={quoteVendorSettingsLoading}>
                          Guardar borrador local
                        </Button>
                        <Button type="button" variant="ghost" onClick={() => setQuoteDialogOpen(false)}>
                          Cerrar
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-2 border-t border-border/40 pt-3">
                      <div>
                        <h4 className="text-sm font-semibold text-foreground">Historial</h4>
                        <p className="text-[11px] text-muted-foreground">Movimientos recientes de la cotización.</p>
                      </div>
                      <div className="space-y-1.5">
                        {quoteRecentHistory.length ? (
                          quoteRecentHistory.map((entry) => (
                            <div key={entry.id} className="rounded-md bg-background/70 px-2 py-1.5 text-[11px]">
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-medium text-foreground">{entry.status}</span>
                                <span className="text-muted-foreground">{formatDateTime(entry.createdAt ?? entry.sentAt ?? "")}</span>
                              </div>
                              <p className="mt-0.5 text-muted-foreground">
                                {entry.title ?? entry.description ?? "Cotización creada"}
                              </p>
                            </div>
                          ))
                        ) : (
                          <div className="rounded-md bg-background/70 px-2 py-1.5 text-[11px] text-muted-foreground">
                            Todavía no hay historial de cotizaciones.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </ScrollArea>
              </aside>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog
        open={quoteCatalogPickerOpen}
        onOpenChange={(openState) => {
          if (openState) {
            setQuoteCatalogPickerOpen(true);
            return;
          }
          setQuoteCatalogPickerOpen(false);
          setQuoteCatalogPickerSearch("");
          setQuoteCatalogSelection([]);
        }}
      >
        <DialogContent className="flex h-[84vh] w-[92vw] max-w-[92vw] flex-col overflow-hidden p-0">
          <div className="border-b border-border/50 px-3 py-2.5">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-0.5">
                <DialogTitle className="text-base font-semibold">Productos y servicios</DialogTitle>
                <DialogDescription className="text-xs">
                  Selecciona uno o varios conceptos para agregarlos a la cotización.
                </DialogDescription>
              </div>
              <Badge variant="outline" className="h-6 rounded-full px-2 text-[10px] uppercase tracking-wide">
                {quoteCatalogSelection.length} seleccionados
              </Badge>
            </div>
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-3 px-3 py-3">
            <div className="flex items-center gap-2 rounded-md bg-muted/35 px-2">
              <IconSearch className="size-4 shrink-0 text-muted-foreground" />
              <Input
                value={quoteCatalogPickerSearch}
                onChange={(event) => setQuoteCatalogPickerSearch(event.target.value)}
                placeholder="Buscar producto, servicio, SKU o descripción"
                disabled={catalogState.status === "loading"}
                className="h-8 border-0 bg-transparent px-0 shadow-none ring-0 focus-visible:border-0 focus-visible:ring-0"
              />
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setQuoteCatalogPickerSearch("")}
                disabled={!quoteCatalogPickerSearch.length}
              >
                Limpiar
              </Button>
            </div>

            <div className="min-h-0 flex-1 rounded-md bg-muted/20">
              <ScrollArea className="h-full">
                {catalogState.status === "loading" || catalogState.status === "idle" ? (
                  <p className="px-3 py-2 text-xs text-muted-foreground">Cargando catálogo…</p>
                ) : catalogState.status === "error" ? (
                  <p className="px-3 py-2 text-xs text-destructive">
                    {catalogState.error || "No se pudo cargar el catálogo."}
                  </p>
                ) : quoteCatalogPickerItems.length === 0 ? (
                  <p className="px-3 py-2 text-xs text-muted-foreground">
                    {quoteCatalogPickerSearch ? "Sin resultados para tu búsqueda." : "No hay productos activos."}
                  </p>
                ) : (
                  quoteCatalogPickerItems.map((item) => {
                    const checked = quoteCatalogSelection.includes(item.id);
                    const imageUrl = resolveCatalogItemImageUrl(item);
                    return (
                      <div
                        key={item.id}
                        role="button"
                        tabIndex={0}
                        className="flex w-full cursor-pointer items-start gap-3 border-b border-border/40 px-3 py-2 text-left text-xs last:border-b-0 hover:bg-muted/40"
                        onClick={() => handleCatalogSelectionToggle(item.id)}
                        onKeyDown={(event) => {
                          if (event.key !== "Enter" && event.key !== " ") return;
                          event.preventDefault();
                          handleCatalogSelectionToggle(item.id);
                        }}
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={() => handleCatalogSelectionToggle(item.id)}
                          className="mt-0.5"
                        />
                        <div className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border/40 bg-muted/30">
                          {imageUrl ? (
                            <>
                              <Image
                                src={imageUrl}
                                alt=""
                                width={40}
                                height={40}
                                unoptimized
                                className="h-full w-full object-cover"
                                onError={(event) => {
                                  const fallback = event.currentTarget.parentElement?.querySelector<HTMLElement>(
                                    "[data-fallback='true']",
                                  );
                                  if (fallback) fallback.classList.remove("hidden");
                                  event.currentTarget.style.display = "none";
                                }}
                              />
                              <span
                                data-fallback="true"
                                className="hidden absolute inset-0 items-center justify-center text-[9px] uppercase text-muted-foreground"
                              >
                                Sin img
                              </span>
                            </>
                          ) : (
                            <span className="text-[9px] uppercase text-muted-foreground">Sin img</span>
                          )}
                        </div>
                        <span className="min-w-0 flex-1 pt-1">
                          <span className="block truncate text-sm font-medium text-foreground">{item.nombre}</span>
                          <span className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">
                            {item.descripcion || "Sin descripción"}
                          </span>
                        </span>
                      </div>
                    );
                  })
                )}
              </ScrollArea>
            </div>
          </div>
          <div className="flex items-center justify-between gap-2 border-t border-border/50 px-3 py-2.5">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setQuoteCatalogPickerOpen(false);
                setQuoteCatalogPickerSearch("");
                setQuoteCatalogSelection([]);
              }}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={() =>
                handleAddCatalogItems(
                  quoteCatalogPickerItems.filter((item) => quoteCatalogSelection.includes(item.id)),
                )
              }
              disabled={!quoteCatalogSelection.length || quotePending}
            >
              Agregar seleccionados
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog
        open={quotePreviewOpen}
        onOpenChange={(openState) => {
          setQuotePreviewOpen(openState);
          if (!openState && quotePreviewPdfUrl) {
            window.URL.revokeObjectURL(quotePreviewPdfUrl);
            setQuotePreviewPdfUrl(null);
          }
        }}
      >
        <DialogContent className="flex h-[88vh] w-[94vw] max-w-[94vw] flex-col overflow-hidden p-0">
          <div className="border-b border-border/50 px-4 py-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-0.5">
                <DialogTitle className="text-base font-semibold">Vista previa PDF</DialogTitle>
                <DialogDescription className="text-xs">
                  Revisa cómo se verá la cotización antes de enviarla.
                </DialogDescription>
              </div>
              <Badge variant="outline" className="h-6 rounded-full px-2 text-[10px] uppercase tracking-wide">
                {quotePreviewItems.length ? `${quotePreviewItems.length} partidas` : "Sin partidas"}
              </Badge>
            </div>
          </div>
          {quotePreviewError ? (
            <div className="border-b border-destructive/20 bg-destructive/5 px-4 py-2 text-xs text-destructive">
              {quotePreviewError}
            </div>
          ) : null}
          <div className="grid min-h-0 flex-1 gap-3 grid-rows-[minmax(0,1fr)] p-3 lg:grid-cols-[minmax(0,1fr)_280px]">
            <div className="h-full min-h-0 rounded-lg bg-muted/20 p-3">
              <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-border/40 bg-background shadow-sm">
                <div className="flex items-center justify-between gap-3 border-b border-border/30 px-3 py-2">
                  <div className="space-y-0.5">
                    <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">PDF real</p>
                    <p className="text-sm font-medium text-foreground">{quotePreviewPdfFilename}</p>
                  </div>
                  <Badge variant="outline" className="h-6 rounded-full px-2 text-[10px] uppercase tracking-wide">
                    {quotePreviewPdfLoading ? "Generando..." : quotePreviewPdfReady ? "Listo" : "Sin vista previa"}
                  </Badge>
                </div>
                <div className="relative min-h-0 flex-1 bg-muted/10">
                  {quotePreviewPdfLoading && !quotePreviewPdfReady ? (
                    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                      Generando PDF...
                    </div>
                  ) : quotePreviewPdfUrl ? (
                    <iframe
                      title="Vista previa PDF"
                      src={quotePreviewPdfUrl}
                      className="h-full w-full"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
                      No se pudo generar la vista previa. Usa descargar para validar el archivo.
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="h-full min-h-0 space-y-3 overflow-y-auto pb-28 pr-1">
              <div className="rounded-lg bg-background p-3 shadow-sm ring-1 ring-border/40">
                <h4 className="text-sm font-semibold text-foreground">Vendedor</h4>
                <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                  <p className="font-medium text-foreground">{quoteAssignedVendorName}</p>
                  <p>{quoteAssignedVendorEmail}</p>
                  <p>{quoteAssignedVendorPhone}</p>
                </div>
              </div>
              <div className="rounded-lg bg-background p-3 shadow-sm ring-1 ring-border/40">
                <h4 className="text-sm font-semibold text-foreground">Plantilla</h4>
                <p className="mt-1 text-xs text-muted-foreground">La vista previa ya usa el PDF renderizado real.</p>
                <div className="mt-3 rounded-md bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                  El mismo render alimenta la vista previa y la descarga.
                </div>
              </div>
              <div className="rounded-lg bg-background p-3 shadow-sm ring-1 ring-border/40">
                <h4 className="text-sm font-semibold text-foreground">Acciones</h4>
                <div className="mt-3 grid gap-2">
                  <Button type="button" variant="outline" onClick={handleDownloadQuotePdf} disabled={quotePreviewPdfLoading}>
                    {quotePreviewPdfLoading ? (
                      <>
                        <IconLoader2 className="size-4 animate-spin" />
                        Descargando...
                      </>
                    ) : (
                      <>
                        <IconDownload className="size-4" />
                        Descargar PDF
                      </>
                    )}
                  </Button>
                  <Button type="button" variant="outline" disabled>
                    Enviar por email
                  </Button>
                  <Button type="button" onClick={() => setQuotePreviewOpen(false)}>
                    Cerrar
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      </>
    ) : null}
    </>
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function parseDrawerPrepDefinition(meta: Record<string, unknown>): DrawerPrepDefinition | null {
  const candidate = findDrawerPrepCandidate(meta);
  if (!candidate) return null;

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

function findDrawerPrepCandidate(
  meta: Record<string, unknown>,
  visited: Set<Record<string, unknown>> = new Set(),
): Record<string, unknown> | null {
  if (visited.has(meta)) {
    return null;
  }
  visited.add(meta);

  const direct = meta["drawer_prep"];
  if (isRecord(direct)) {
    return direct;
  }

  for (const key of ["metadatos", "metadata"]) {
    const nested = meta[key];
    if (isRecord(nested)) {
      const nestedCandidate = findDrawerPrepCandidate(nested, visited);
      if (nestedCandidate) {
        return nestedCandidate;
      }
    }
  }

  return null;
}

function buildDrawerDefinitions(stages: EmbudoStage[]): Map<string, DrawerDefinition> {
  const map = new Map<string, DrawerDefinition>();

  for (const stage of stages) {
    const meta = stage.metadatos;
    let definition: DrawerPrepDefinition | null = null;
    if (isRecord(meta)) {
      definition = parseDrawerPrepDefinition(meta);
    }
    if (!definition) {
      definition = resolveDrawerDefinitionFallback(stage);
    }
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

function resolveDrawerDefinitionFallback(stage: EmbudoStage): DrawerPrepDefinition | null {
  const candidateCodes = collectStageDrawerCodes(stage);

  for (const code of candidateCodes) {
    const normalized = code.toLowerCase();
    const direct = DEFAULT_DRAWER_DEFINITIONS[normalized];
    if (direct) {
      return direct;
    }
  }

  for (const code of candidateCodes) {
    const fallback = findDefaultDrawerDefinitionBySuffix(code);
    if (fallback) {
      return fallback;
    }
  }

  return null;
}

function collectStageDrawerCodes(stage: EmbudoStage): string[] {
  const codes = new Set<string>();
  if (stage.codigo) {
    codes.add(stage.codigo.toLowerCase());
  }
  const meta = stage.metadatos ?? {};
  const legacyCode = readStageMetaString(meta, "legacy_codigo");
  if (legacyCode) {
    codes.add(legacyCode.toLowerCase());
  }

  for (const nested of extractNestedStageMetas(meta)) {
    const nestedLegacy = readStageMetaString(nested, "legacy_codigo");
    if (nestedLegacy) {
      codes.add(nestedLegacy.toLowerCase());
    }
    const nestedCode = readStageMetaString(nested, "codigo");
    if (nestedCode) {
      codes.add(nestedCode.toLowerCase());
    }
  }

  return Array.from(codes);
}

function extractNestedStageMetas(meta: Record<string, unknown>): Record<string, unknown>[] {
  const nested: Record<string, unknown>[] = [];
  for (const key of ["metadatos", "metadata"]) {
    const value = meta[key];
    if (isRecord(value)) {
      nested.push(value);
    }
  }
  return nested;
}

function findDefaultDrawerDefinitionBySuffix(code: string): DrawerPrepDefinition | null {
  const normalized = code.toLowerCase();
  for (const [defaultCode, definition] of Object.entries(DEFAULT_DRAWER_DEFINITIONS)) {
    if (normalized.endsWith(defaultCode)) {
      return definition;
    }
  }
  return null;
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

function computeStageLocks(groups: DrawerStageGroup[], state: StagePrepState): Map<string, StageLockInfo> {
  const map = new Map<string, StageLockInfo>();
  let blockingStage: string | null = null;
  for (const group of groups) {
    const complete = areStageSectionsComplete(group.stage.codigo, group.sections, state);
    const canEdit = blockingStage === null;
    map.set(group.stage.codigo, {
      canEdit,
      complete,
      lockedReason: canEdit ? null : blockingStage,
    });
    if (!complete && blockingStage === null) {
      blockingStage = group.stage.nombre;
    } else if (complete && blockingStage === group.stage.nombre) {
      blockingStage = null;
    }
  }
  return map;
}

function areStageSectionsComplete(
  stageCode: string,
  sections: DrawerPrepSectionDefinition[],
  state: StagePrepState,
): boolean {
  const values = state[stageCode] ?? {};
  for (const section of sections) {
    for (const field of section.fields) {
      if (!field.required) continue;
      const rawValue = values[field.key];
      const hasValue =
        field.type === "checkbox" ? rawValue === true : typeof rawValue === "string" && rawValue.trim().length > 0;
      if (!hasValue) {
        return false;
      }
    }
  }
  return true;
}

function findMissingRequiredField(
  groups: DrawerStageGroup[],
  state: StagePrepState,
  initialState: StagePrepState,
): { stage: EmbudoStage; field: DrawerPrepFieldDefinition } | null {
  for (const group of groups) {
    const stageValues = state[group.stage.codigo] ?? {};
    const initialValues = initialState[group.stage.codigo] ?? {};
    const shouldValidateStage =
      stageHasAnyValue(stageValues) || stageHasAnyValue(initialValues);
    if (!shouldValidateStage) {
      continue;
    }
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

function resolveStageTokens(stage: EmbudoStage): StageVisualTokens {
  const colorKey = readStageMetaString(stage.metadatos, "color")?.toLowerCase() ?? "";
  return STAGE_COLOR_TOKEN_MAP[colorKey] ?? DEFAULT_STAGE_TOKENS;
}

function resolveStageIcon(stageCode: string) {
  return STAGE_ICON_MAP[stageCode] ?? IconMessageCircle;
}

function isDemoStageCode(stageCode: string): boolean {
  if (!stageCode) return false;
  const normalized = stageCode.toLowerCase();
  return normalized === "demo" || normalized.endsWith("_demo");
}

function countStageFields(
  stageCode: string,
  sections: DrawerPrepSectionDefinition[],
  state: StagePrepState,
): { completed: number; total: number } {
  let total = 0;
  let completed = 0;
  for (const section of sections) {
    const sectionCount = countSectionFields(stageCode, section, state);
    total += sectionCount.total;
    completed += sectionCount.completed;
  }
  return { completed, total };
}

function countSectionFields(
  stageCode: string,
  section: DrawerPrepSectionDefinition,
  state: StagePrepState,
): { completed: number; total: number } {
  const values = state[stageCode] ?? {};
  let completed = 0;
  let total = 0;
  for (const field of section.fields) {
    total += 1;
    if (isStageFieldComplete(field, values[field.key])) {
      completed += 1;
    }
  }
  return { completed, total };
}

function isStageFieldComplete(field: DrawerPrepFieldDefinition, rawValue: string | boolean | undefined): boolean {
  if (field.type === "checkbox") {
    return rawValue === true;
  }
  return typeof rawValue === "string" && rawValue.trim().length > 0;
}

function stageHasAnyValue(state: Record<string, string | boolean>): boolean {
  return Object.values(state).some((value) => {
    if (typeof value === "boolean") {
      return value === true;
    }
    if (typeof value === "string") {
      return value.trim().length > 0;
    }
    return false;
  });
}

function areStagePrepsEqual(a: StagePrepPayload, b: StagePrepPayload): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function findAutoAdvanceStage(
  currentStage: EmbudoStage | null,
  groups: DrawerStageGroup[],
  state: StagePrepState,
): EmbudoStage | null {
  if (!currentStage) return null;
  let furthest: EmbudoStage | null = null;
  for (const group of groups) {
    const stageValues = state[group.stage.codigo] ?? {};
    if (!stageHasAnyValue(stageValues)) {
      continue;
    }
    if (!areStageSectionsComplete(group.stage.codigo, group.sections, state)) {
      break;
    }
    furthest = group.stage;
  }
  return furthest;
}

function isDrawerStageCode(value: string, expected: string): boolean {
  if (!value || !expected) return false;
  const normalized = value.toLowerCase();
  const target = expected.toLowerCase();
  return normalized === target || normalized.endsWith(`_${target}`);
}

function hasStagePrepFieldValue(state: StagePrepState | StagePrepPayload | undefined, fieldKey: string): string {
  return readStagePrepFieldValue(state, fieldKey);
}

function readStagePrepFieldValue(
  state: StagePrepState | StagePrepPayload | undefined,
  fieldKey: string,
): string {
  if (!state) return "";
  const normalizedKey = fieldKey.trim().toLowerCase();
  if (!normalizedKey) return "";
  for (const stageValues of Object.values(state)) {
    const rawValue = stageValues?.[fieldKey] ?? stageValues?.[normalizedKey];
    if (typeof rawValue === "string") {
      const trimmed = rawValue.trim();
      if (trimmed.length) {
        return trimmed;
      }
    } else if (typeof rawValue === "number" && Number.isFinite(rawValue)) {
      return String(rawValue);
    } else if (typeof rawValue === "boolean") {
      if (rawValue) {
        return "true";
      }
    }
  }
  return "";
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

function readStageMetaString(meta: Record<string, unknown> | undefined, key: string): string | undefined {
  if (!meta) return undefined;
  const value = meta[key];
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : undefined;
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

function formatUserDisplay(user: LeadUserSummary | null | undefined): string {
  if (!user) return "Usuario no identificado";
  const name = user.nombre_completo?.trim();
  const role = user.rol_principal?.trim();
  if (name && role) return `${role} ${name}`;
  if (name) return name;
  if (role) return role;
  return user.correo?.trim() || "Usuario no identificado";
}

function renderUserAuthorBadge(
  user: LeadUserSummary | null | undefined,
  assigneeId: string,
) {
  if (!user) return null;
  const isAssignee = user.id === assigneeId;
  return (
    <Badge
      variant={isAssignee ? "default" : "secondary"}
      className="text-[10px] uppercase tracking-wide"
    >
      {isAssignee ? `Creada por ${formatUserDisplay(user)}` : `Enviada por ${formatUserDisplay(user)}`}
    </Badge>
  );
}

function renderUserLine(
  user: LeadUserSummary | null | undefined,
  entityLabel: string,
  createdAt: string,
) {
  const author = formatUserDisplay(user);
  return `${entityLabel} · ${author} · ${formatDateTime(createdAt)}`;
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

function mapQuoteEntry(input: unknown): LeadQuoteEntry {
  const row = isRecord(input) ? input : {};
  const metadataRecord: Record<string, unknown> = isRecord(row.metadatos)
    ? row.metadatos
    : isRecord(row.metadata)
      ? row.metadata
      : {};
  const totalValue = toNumber(row.total);
  return {
    id: String(row.id ?? `${row.version ?? "quote"}-${Math.random().toString(36).slice(2, 8)}`),
    version: Number.isFinite(Number(row.version)) ? Number(row.version) : 1,
    status: typeof row.estado === "string" ? row.estado : "borrador",
    channel: typeof row.canal_envio === "string" ? row.canal_envio : null,
    sentAt: typeof row.enviada_en === "string" ? row.enviada_en : null,
    total: totalValue,
    currency: typeof row.moneda === "string" ? row.moneda : null,
    createdAt: typeof row.creado_en === "string" ? row.creado_en : null,
    title: typeof row.titulo === "string" ? row.titulo : null,
    description: typeof row.descripcion === "string" ? row.descripcion : null,
    concepts: Array.isArray(row.conceptos) ? (row.conceptos as Record<string, unknown>[]) : null,
    subtotal: toNumber(row.subtotal),
    taxes: toNumber(row.impuestos),
    validUntil: typeof row.valido_hasta === "string" ? row.valido_hasta : null,
    metadata: metadataRecord,
    items: Array.isArray(row.items)
      ? (row.items as unknown[])
          .map((item) => mapQuoteItemEntry(item))
          .filter((entry) => !!entry)
      : null,
  };
}

function mapQuoteItemEntry(input: unknown): LeadQuoteItemEntry {
  const row = isRecord(input) ? input : {};
  return {
    id: String(row.id ?? generateLocalId()),
    catalogItemId: typeof row.catalog_item_id === "string" ? row.catalog_item_id : null,
    fotoUrl:
      typeof row.fotoUrl === "string"
        ? row.fotoUrl
        : typeof row.foto_url === "string"
          ? row.foto_url
          : null,
    title:
      typeof row.titulo === "string"
        ? row.titulo
        : typeof row.title === "string"
          ? row.title
          : null,
    description:
      typeof row.descripcion === "string"
        ? row.descripcion
        : typeof row.description === "string"
          ? row.description
          : null,
    unit: typeof row.unidad === "string" ? row.unidad : null,
    quantity: toNumber(row.cantidad),
    unitPrice: toNumber(row.precio_unitario ?? row.precioUnitario),
    discount: toNumber(row.descuento),
    subtotal: toNumber(row.subtotal),
    taxes: toNumber(row.impuestos),
    total: toNumber(row.total),
    currency: typeof row.moneda === "string" ? row.moneda : null,
  };
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function formatQuoteStatus(status: string): string {
  const normalized = status?.toLowerCase() ?? "";
  switch (normalized) {
    case "enviada":
      return "Enviada";
    case "aceptada":
      return "Aceptada";
    case "rechazada":
      return "Rechazada";
    case "cancelada":
      return "Cancelada";
    default:
      return "Borrador";
  }
}

function quoteStatusVariant(
  status: string,
): "default" | "secondary" | "outline" | "destructive" {
  const normalized = status?.toLowerCase() ?? "";
  if (normalized === "aceptada") return "default";
  if (normalized === "rechazada" || normalized === "cancelada") return "destructive";
  if (normalized === "enviada") return "secondary";
  return "outline";
}

function formatQuoteChannel(channel: string | null): string {
  if (!channel) return "Sin canal";
  if (channel.toLowerCase() === "email") return "Correo";
  if (channel.toLowerCase() === "whatsapp") return "WhatsApp";
  return channel;
}

function formatChannelLabel(value: string): string {
  if (value === "whatsapp") return "WhatsApp";
  if (value === "webchat") return "Webchat";
  if (value === "email") return "Email";
  if (value === "voz") return "Voz";
  if (value === "manual") return "Manual";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

const CHANNEL_BADGE_TONES: Record<string, { label: string; title: string; className: string; icon: ReactNode | null }> = {
  whatsapp: {
    label: "WhatsApp",
    title: "Canal: WhatsApp",
    className: "border-emerald-300 bg-emerald-50 text-emerald-800",
    icon: <IconBrandWhatsapp className="size-3" />,
  },
  webchat: {
    label: "Webchat",
    title: "Canal: Webchat",
    className: "border-cyan-300 bg-cyan-50 text-cyan-800",
    icon: <IconMessageCircle className="size-3" />,
  },
  email: {
    label: "Email",
    title: "Canal: Email",
    className: "border-amber-300 bg-amber-50 text-amber-800",
    icon: <IconMail className="size-3" />,
  },
  voz: {
    label: "Voz",
    title: "Canal: Voz",
    className: "border-slate-300 bg-slate-50 text-slate-700",
    icon: <IconTargetArrow className="size-3" />,
  },
  manual: {
    label: "Manual",
    title: "Canal: Manual",
    className: "border-slate-300 bg-slate-50 text-slate-700",
    icon: <IconUser className="size-3" />,
  },
};

const CONTACT_ORIGIN_BADGE_TONES: Record<string, string> = {
  whatsapp: "border-emerald-300 bg-emerald-50 text-emerald-800",
  webchat: "border-cyan-300 bg-cyan-50 text-cyan-800",
  email: "border-amber-300 bg-amber-50 text-amber-800",
  correo: "border-amber-300 bg-amber-50 text-amber-800",
  denue: "border-indigo-300 bg-indigo-50 text-indigo-800",
  google: "border-rose-300 bg-rose-50 text-rose-800",
  manual: "border-slate-300 bg-slate-50 text-slate-700",
  usuario: "border-slate-300 bg-slate-50 text-slate-700",
  importado: "border-slate-300 bg-slate-50 text-slate-700",
};

function formatQuoteDate(value: string | null): string {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat("es-MX", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function formatQuoteCurrency(value: number | null, currency: string | null): string {
  if (value == null) return "—";
  try {
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: (currency || "MXN").toUpperCase(),
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${currency || "MXN"} ${value.toFixed(2)}`;
  }
}

function parseNumberInput(value: string): number | null {
  if (!value) return null;
  const sanitized = value.replace(/[^0-9.-]/g, "").trim();
  if (!sanitized) return null;
  const parsed = Number(sanitized);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatCurrencyInputValue(value: number | null, currency: string | null): string {
  if (value == null) return "";
  try {
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: (currency || "MXN").toUpperCase(),
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${currency || "MXN"} ${value.toFixed(2)}`;
  }
}

function formatPercentInputValue(value: number | null): string {
  if (value == null) return "";
  try {
    return new Intl.NumberFormat("es-MX", {
      maximumFractionDigits: 0,
    }).format(value) + "%";
  } catch {
    return `${Math.round(value)}%`;
  }
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function formatDateInput(date: Date): string {
  return date.toISOString().split("T")[0] ?? "";
}

function parseEmailList(value: string): string[] {
  if (!value) return [];
  return value
    .split(/[,;\s]+/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function createQuoteItemForm(initial?: Partial<QuoteItemForm>): QuoteItemForm {
  return {
    key: generateLocalId(),
    catalogItemId: initial?.catalogItemId ?? null,
    fotoUrl: initial?.fotoUrl ?? null,
    nombre: initial?.nombre ?? "",
    descripcion: initial?.descripcion ?? "",
    unidad: initial?.unidad ?? "unidad",
    cantidad: initial?.cantidad ?? "1",
    precioUnitario: formatPresetNumberString(initial?.precioUnitario),
    descuento: initial?.descuento ?? "",
    moneda: (initial?.moneda ?? "MXN").toUpperCase(),
  };
}

function isBlankQuoteItem(item: QuoteItemForm): boolean {
  return (
    !item.catalogItemId &&
    !item.fotoUrl &&
    !item.nombre.trim() &&
    !item.descripcion.trim() &&
    !item.precioUnitario.trim() &&
    !item.descuento.trim()
  );
}

function catalogOptionToQuoteItem(option: CatalogItemOption, fallbackCurrency: string): QuoteItemForm {
  return createQuoteItemForm({
    catalogItemId: option.id,
    fotoUrl: option.fotoUrl,
    nombre: option.nombre,
    descripcion: option.descripcion,
    unidad: option.unidad,
    cantidad: "1",
    precioUnitario: option.precioBase != null ? String(option.precioBase) : "",
    moneda: option.moneda || fallbackCurrency,
  });
}

function computeQuoteItemTotal(form: QuoteItemForm): number | null {
  const quantity = parseNumberInput(form.cantidad) ?? 1;
  const unitPrice = parseNumberInput(form.precioUnitario) ?? 0;
  const discount = parseNumberInput(form.descuento) ?? 0;
  const total = quantity * unitPrice - discount;
  if (!Number.isFinite(total) || total < 0) {
    return null;
  }
  return Number(total.toFixed(2));
}

function computeQuoteTotals(forms: QuoteItemForm[]): QuoteTotalsSummary | null {
  const parsedTotals = forms
    .map((form) => computeQuoteItemTotal(form))
    .filter((value): value is number => value != null);
  if (!parsedTotals.length) {
    return null;
  }
  const subtotal = parsedTotals.reduce((acc, value) => acc + value, 0);
  const roundedSubtotal = Number(subtotal.toFixed(2));
  const taxes = Number((roundedSubtotal * QUOTE_TAX_RATE).toFixed(2));
  const total = Number((roundedSubtotal + taxes).toFixed(2));
  return {
    subtotal: roundedSubtotal,
    taxes,
    total,
  };
}

function formatNumberInputValue(value: number | null): string {
  if (value == null) return "";
  try {
    return new Intl.NumberFormat("es-MX", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return value.toFixed(2);
  }
}

function formatPresetNumberString(value: string | number | null | undefined): string {
  if (value == null) return "";
  if (typeof value === "number" && Number.isFinite(value)) {
    return formatNumberInputValue(value);
  }
  if (typeof value === "string" && value.trim().length) {
    const parsed = parseNumberInput(value);
    if (parsed != null) {
      return formatNumberInputValue(parsed);
    }
  }
  return "";
}

function buildQuoteItemsPayload(forms: QuoteItemForm[]): Array<Record<string, unknown>> {
  return forms
    .map((form, index) => {
      const quantity = parseNumberInput(form.cantidad);
      const unitPrice = parseNumberInput(form.precioUnitario);
      const discount = parseNumberInput(form.descuento);
      const total = computeQuoteItemTotal(form);
      const hasContent =
        (form.nombre && form.nombre.trim()) ||
        (form.descripcion && form.descripcion.trim()) ||
        quantity != null ||
        unitPrice != null ||
        discount != null;
      if (!hasContent) {
        return null;
      }
      const payload: Record<string, unknown> = {
        catalog_item_id: form.catalogItemId,
        titulo: form.nombre.trim() || null,
        descripcion: form.descripcion.trim() || null,
        unidad: form.unidad.trim() || "unidad",
        cantidad: quantity ?? null,
        precio_unitario: unitPrice ?? null,
        descuento: discount ?? null,
        total,
        moneda: form.moneda.trim().slice(0, 3).toUpperCase(),
        orden: index + 1,
        metadatos: form.fotoUrl ? { fotoUrl: form.fotoUrl } : undefined,
      };
      return payload;
    })
    .filter((item): item is Record<string, unknown> => !!item);
}

function quoteEntryToItemForms(
  entry: LeadQuoteEntry | undefined,
  fallbackDescription: string,
  fallbackCurrency: string,
): QuoteItemForm[] {
  if (!entry) return [];
  if (entry.items && entry.items.length) {
    return entry.items.map((item) =>
      createQuoteItemForm({
        catalogItemId: item.catalogItemId,
        fotoUrl: item.fotoUrl,
        nombre: item.title ?? "",
        descripcion: item.description ?? fallbackDescription,
        unidad: item.unit ?? "unidad",
        cantidad: item.quantity != null ? String(item.quantity) : "1",
        precioUnitario: item.unitPrice != null ? String(item.unitPrice) : "",
        descuento: item.discount != null ? String(item.discount) : "",
        moneda: item.currency ?? fallbackCurrency,
      }),
    );
  }
  if (entry.concepts && entry.concepts.length) {
    return convertConceptsToItemForms(entry.concepts, fallbackDescription, fallbackCurrency);
  }
  return [];
}

function convertConceptsToItemForms(
  records: Record<string, unknown>[],
  fallbackDescription: string,
  fallbackCurrency: string,
): QuoteItemForm[] {
  if (!records.length) {
    return [];
  }
  return records
    .map((record) => {
      if (!isRecord(record)) return null;
      const title =
        typeof record.titulo === "string"
          ? record.titulo
          : typeof record.title === "string"
            ? record.title
            : "";
      const description =
        typeof record.descripcion === "string"
          ? record.descripcion
          : typeof record.description === "string"
            ? record.description
            : fallbackDescription;
      const total = toNumber(record.total);
      return createQuoteItemForm({
        nombre: title,
        descripcion: description,
        cantidad: "1",
        precioUnitario: total != null ? String(total) : "",
        moneda: fallbackCurrency,
        fotoUrl:
          typeof record.fotoUrl === "string"
            ? record.fotoUrl
            : typeof record.foto_url === "string"
              ? record.foto_url
              : null,
      });
    })
    .filter((item): item is QuoteItemForm => !!item);
}

function mapCatalogApiRow(input: unknown): CatalogItemOption | null {
  const row = isRecord(input) ? input : null;
  if (!row) return null;
  const id = typeof row.id === "string" ? row.id : null;
  if (!id) return null;
  const metadataCandidate = isRecord(row.metadatos)
    ? row.metadatos
    : isRecord(row.metadata)
      ? row.metadata
      : null;
  return {
    id,
    nombre: typeof row.nombre === "string" ? row.nombre : "Producto sin nombre",
    descripcion:
      typeof row.descripcion_corta === "string"
        ? row.descripcion_corta
        : typeof row.descripcion === "string"
          ? row.descripcion
          : "",
    unidad: typeof row.unidad === "string" && row.unidad.trim() ? row.unidad : "unidad",
    precioBase: toNumber(row.precio_base ?? row.precioBase),
    moneda: (typeof row.moneda === "string" && row.moneda.trim()) ? row.moneda.toUpperCase() : "MXN",
    activo: typeof row.activo === "boolean" ? row.activo : true,
    fotoUrl:
      typeof row.fotoUrl === "string"
        ? row.fotoUrl
        : typeof row.foto_url === "string"
          ? row.foto_url
          : extractCatalogMediaUrl(metadataCandidate),
    metadatos: metadataCandidate,
  };
}

function extractCatalogMediaUrl(metadatos: Record<string, unknown> | null): string | null {
  if (!metadatos) return null;
  const directKeys = ["fotoUrl", "foto_url", "image_url", "image", "url"];
  for (const key of directKeys) {
    const value = metadatos[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  const media = metadatos.media;
  if (!Array.isArray(media)) return null;
  const sorted = [...media].sort((a, b) => {
    const pa = isRecord(a) && "predeterminada" in a ? Boolean(a.predeterminada) : false;
    const pb = isRecord(b) && "predeterminada" in b ? Boolean(b.predeterminada) : false;
    return (pb === pa ? 0 : pb ? 1 : -1);
  });
  for (const entry of sorted) {
    if (!isRecord(entry)) continue;
    const url = entry.url;
    if (typeof url === "string" && url.trim()) {
      return url.trim();
    }
  }
  return null;
}

function resolveCatalogItemImageUrl(item: CatalogItemOption): string | null {
  const directUrl = item.fotoUrl?.trim();
  if (directUrl) return directUrl;
  const metadataUrl = extractCatalogMediaUrl(item.metadatos);
  return metadataUrl?.trim() || null;
}

function generateLocalId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2, 10);
}

function formatIsoDateForInput(value: string | null): string | null {
  if (!value) return null;
  try {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    return formatDateInput(parsed);
  } catch {
    return null;
  }
}

function formatOpportunityReference(code: string | null | undefined): string {
  const raw = typeof code === "string" ? code.trim() : "";
  if (!raw) {
    return "Sin referencia";
  }
  return raw.replace(/\s*-\s*/g, " - ");
}
