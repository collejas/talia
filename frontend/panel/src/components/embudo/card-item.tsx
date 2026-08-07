"use client";

import { type HTMLAttributes, type ReactNode, useMemo } from "react"
import { IconBrandWhatsapp, IconMessageCircle, IconRobot, IconUser } from "@tabler/icons-react"
import type { DraggableSyntheticListeners } from "@dnd-kit/core"

import type { EmbudoCard } from "@/lib/embudo/data"
import { buildWhatsappCtaTooltip, resolveWhatsappCtaAttribution } from "@/lib/embudo/helpers"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { useRouter } from "next/navigation"
import { getActiveTimeZone } from "@/lib/timezone"

type EmbudoCardItemProps = {
  card: EmbudoCard
  isDragging?: boolean
  onClick?: () => void
  disabled?: boolean
  dragAttributes?: HTMLAttributes<HTMLButtonElement>
  dragListeners?: DraggableSyntheticListeners
}

export function EmbudoCardItem({
  card,
  isDragging = false,
  onClick,
  disabled = false,
  dragAttributes,
  dragListeners,
}: EmbudoCardItemProps) {
  const router = useRouter()
  const formattedUpdatedAt = useMemo(() => {
    if (!card.actualizadoEn) return "Sin fecha"
    try {
      const formatter = new Intl.DateTimeFormat("es-MX", {
        timeZone: getActiveTimeZone(),
        dateStyle: "short",
        timeStyle: "short",
      })
      return formatter.format(new Date(card.actualizadoEn))
    } catch {
      return "Sin fecha"
    }
  }, [card.actualizadoEn])

  const rawContactName =
    card.nombre && card.nombre.trim().length ? card.nombre.trim() : "Sin contacto";
  const rawOpportunityName =
    card.titulo && card.titulo.trim().length
      ? card.titulo.trim()
      : card.proyectoNombre && card.proyectoNombre.trim().length
        ? card.proyectoNombre.trim()
        : "Oportunidad sin nombre";
  const contactName = isGenericConversationLabel(rawContactName) ? "<->" : rawContactName;
  const opportunityName = isGenericConversationLabel(rawOpportunityName) ? "<->" : rawOpportunityName;
  const opportunityCode = formatOpportunityReference(card.codigoOportunidad);
  const contactInfo = card.correo || card.telefono || card.empresa || null;
  const scoreValue = card.leadScoring?.scoreTotal;
  const gradeValue = card.leadScoring?.grade;
  const confidenceValue = card.leadScoring?.confidence;
  const missingFieldsCount = card.leadScoring?.missingFields ?? 0;
  const evasiveAnswersCount = card.leadScoring?.evasiveAnswersCount;
  const originBadge = useMemo(() => resolveOriginBadge(card), [card]);
  const contactOriginBadge = useMemo(() => resolveContactOriginBadge(card), [card]);
  const whatsappCtaAttribution = useMemo(
    () => resolveWhatsappCtaAttribution(card.metadata),
    [card.metadata],
  );
  const channelBadge = useMemo(() => resolveChannelBadge(card.canal), [card.canal]);
  const inboxContactId = card.personaId || card.contactoId;
  const inboxHref = inboxContactId ? `/inbox?persona_id=${encodeURIComponent(inboxContactId)}` : "/inbox";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "w-full text-left transition",
        disabled && "cursor-not-allowed opacity-80",
      )}
      {...dragAttributes}
      {...dragListeners}
    >
      <article
        className={cn(
          "rounded-lg border bg-card p-3 shadow-xs transition hover:border-primary focus:border-primary focus:outline-none",
          isDragging && "opacity-80 shadow-md",
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <h4 className="truncate font-semibold leading-tight" title={opportunityName}>
              {opportunityName}
            </h4>
            {opportunityCode ? (
              <Badge variant="outline" className="h-5 rounded-full px-2 text-[10px] font-semibold uppercase tracking-wide">
                {opportunityCode}
              </Badge>
            ) : null}
            <p className="truncate text-xs text-muted-foreground">Contacto: {contactName}</p>
            <p className="truncate text-xs text-muted-foreground">{contactInfo || "Sin datos de contacto"}</p>
          </div>
          {scoreValue != null ? (
            <div className={cn("shrink-0 rounded-md border px-2 py-1 text-right", scoreTone(scoreValue))}>
              <p className="text-[10px] uppercase tracking-wide">Puntaje</p>
              <p className="text-base font-semibold leading-none">{Math.round(scoreValue)}</p>
            </div>
          ) : null}
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {card.restartSequence > 1 ? (
            <Badge variant="secondary" className="text-[10px] uppercase tracking-tight">
              {`Reinicio #${card.restartSequence}`}
            </Badge>
          ) : null}
          {gradeValue ? (
            <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide", gradeTone(gradeValue))}>
              {normalizeLabel(gradeValue)}
            </span>
          ) : null}
          {confidenceValue ? (
            <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide", confidenceTone(confidenceValue))}>
              {normalizeLabel(confidenceValue)}
            </span>
          ) : null}
          {missingFieldsCount > 0 ? (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">
              Faltan {missingFieldsCount}
            </span>
          ) : null}
          {typeof evasiveAnswersCount === "number" && evasiveAnswersCount > 0 ? (
            <span
              className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-700"
              title="Respuestas evasivas detectadas durante la calificación"
            >
              {`Evasivas: ${evasiveAnswersCount}`}
            </span>
          ) : null}
          {originBadge ? (
            <Badge
              variant={originBadge.variant}
              className={cn("text-[10px] font-semibold uppercase tracking-wide", originBadge.className)}
              title={originBadge.title}
            >
              {originBadge.icon}
              {originBadge.label}
            </Badge>
          ) : null}
          {contactOriginBadge ? (
            <Badge
              variant="outline"
              className={cn("text-[10px] font-semibold uppercase tracking-wide", contactOriginBadge.className)}
              title={contactOriginBadge.title}
            >
              {contactOriginBadge.label}
            </Badge>
          ) : null}
          {whatsappCtaAttribution ? (
            <Badge
              variant="outline"
              className="border-emerald-300 bg-emerald-50 text-[10px] font-semibold uppercase tracking-wide text-emerald-800"
              title={buildWhatsappCtaTooltip(whatsappCtaAttribution)}
            >
              <IconBrandWhatsapp className="size-3" />
              CTA de WhatsApp
            </Badge>
          ) : null}
        </div>

        <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="truncate inline-flex items-center gap-2">
            {channelBadge ? (
              <Badge
                variant="outline"
                className={cn("text-[10px] font-semibold uppercase tracking-wide", channelBadge.className)}
                title={channelBadge.title}
              >
                {channelBadge.icon}
                {channelBadge.label}
              </Badge>
            ) : (
              <>
                Canal:
                <span>Sin canal</span>
              </>
            )}
          </span>
          <span className="truncate">
            {card.asignadoNombre ? (
              <span className="inline-flex items-center gap-1">
                <IconUser className="size-3" />
                {card.asignadoNombre}
              </span>
            ) : "Sin asignar"}
          </span>
          <span className="col-span-2 whitespace-nowrap" title={`Actualizado: ${formattedUpdatedAt}`}>
            Actualizado: {formattedUpdatedAt}
          </span>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {typeof card.monto === "number" ? (
            <span className="font-medium text-foreground">
              {new Intl.NumberFormat("es-MX", {
                style: "currency",
                currency: card.moneda || "MXN",
                maximumFractionDigits: 0,
              }).format(card.monto)}
            </span>
          ) : null}
          {card.probabilidad != null ? <span>Prob: {Math.round(card.probabilidad ?? 0)}%</span> : null}
          <span
            className="flex cursor-pointer items-center gap-1 rounded px-1 py-0.5 hover:bg-muted/70"
            role="link"
            tabIndex={0}
            title="Abrir historial en Inbox"
            onClick={(event) => {
              event.stopPropagation()
              router.push(inboxHref)
            }}
            onKeyDown={(event) => {
              if (event.key !== "Enter" && event.key !== " ") return
              event.preventDefault()
              event.stopPropagation()
              router.push(inboxHref)
            }}
          >
            <IconMessageCircle className="size-3" />
            {`Conversaciones ${formatConversationCount(card)}`}
          </span>
        </div>
      </article>
    </button>
  )
}


function formatConversationCount(card: EmbudoCard): string {
  const history = card.metadata?.conversation_history
  if (Array.isArray(history)) {
    const valid = history.filter((value) => typeof value === "string" && value.trim().length > 0)
    const deduped = Array.from(new Set(valid))
    if (deduped.length > 0) {
      return `${deduped.length}`
    }
  }
  if (card.conversacionId) {
    return "1"
  }
  return "0"
}

function buildAutoStageTooltip(card: EmbudoCard): string {
  if (!card.autoStage) return "Movido automáticamente";
  const parts: string[] = ["Movido automáticamente por Tal-IA"];
  if (card.autoStage.channel) {
    parts.push(`Canal: ${card.autoStage.channel}`);
  }
  if (card.autoStage.at) {
    try {
      const formatted = new Date(card.autoStage.at).toLocaleString("es-MX");
      parts.push(`Fecha: ${formatted}`);
    } catch {
      parts.push(`Fecha: ${card.autoStage.at}`);
    }
  }
  return parts.join(" · ");
}


function resolveOriginBadge(
  card: EmbudoCard,
): { label: string; title: string; variant: "outline" | "secondary"; className?: string; icon: ReactNode } | null {
  const createdVia = (card.createdVia || card.metadata?.created_via) as string | undefined;
  const normalizedCreatedVia = typeof createdVia === "string" ? createdVia.trim().toLowerCase() : "";
  const isManual = normalizedCreatedVia === "embudo_manual";
  const isAssistantOrigin =
    Boolean(card.autoStage) ||
    normalizedCreatedVia.startsWith("inbox_") ||
    normalizedCreatedVia.startsWith("assistant_") ||
    normalizedCreatedVia.startsWith("webchat_") ||
    normalizedCreatedVia.startsWith("whatsapp_") ||
    normalizedCreatedVia.includes("assistant");

  if (isManual) {
    return {
      label: "Manual",
      title: "Oportunidad creada manualmente",
      variant: "secondary",
      className: "border-slate-200 bg-slate-100 text-slate-800",
      icon: <IconUser className="size-3" />,
    };
  }

  if (isAssistantOrigin) {
    return {
      label: "Tal-IA",
      title: buildAutoStageTooltip(card),
      variant: "outline",
      className: "border-primary/30 bg-primary/5 text-primary",
      icon: <IconRobot className="size-3" />,
    };
  }

  return null;
}

function resolveContactOriginBadge(
  card: EmbudoCard,
): { label: string; title: string; className?: string } | null {
  const origin = typeof card.contactOrigin === "string" ? card.contactOrigin.trim() : "";
  if (!origin) return null;
  const normalized = origin.toLowerCase();
  const tone = CONTACT_ORIGIN_BADGE_TONES[normalized] ?? "border-slate-300 bg-slate-50 text-slate-700";
  return {
    label: `Origen: ${origin}`,
    title: `Origen del contacto: ${origin}`,
    className: tone,
  };
}

function resolveChannelBadge(
  channel: string | null,
): { label: string; title: string; className: string; icon: ReactNode } | null {
  const normalized = (channel || "").trim().toLowerCase();
  if (!normalized) return null;
  const config = CHANNEL_BADGE_TONES[normalized] ?? {
    label: formatChannelLabel(normalized),
    title: `Canal: ${formatChannelLabel(normalized)}`,
    className: "border-slate-300 bg-slate-50 text-slate-700",
    icon: null,
  };
  return config;
}

function formatChannelLabel(value: string): string {
  if (value === "whatsapp") return "WhatsApp";
  if (value === "webchat") return "Webchat";
  if (value === "email") return "Email";
  if (value === "voz") return "Voz";
  if (value === "manual") return "Manual";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

const CHANNEL_BADGE_TONES: Record<string, { label: string; title: string; className: string; icon: ReactNode }> = {
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
    icon: <IconMessageCircle className="size-3" />,
  },
  voz: {
    label: "Voz",
    title: "Canal: Voz",
    className: "border-slate-300 bg-slate-50 text-slate-700",
    icon: <IconMessageCircle className="size-3" />,
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

function normalizeLabel(value: string): string {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed.length) return value;
  if (trimmed === "low") return "Baja";
  if (trimmed === "medium") return "Media";
  if (trimmed === "high") return "Alta";
  if (trimmed === "exploring") return "Explorando";
  if (trimmed === "interested") return "Interesado";
  if (trimmed === "ready") return "Listo";
  return `${trimmed.charAt(0).toUpperCase()}${trimmed.slice(1)}`;
}

function gradeTone(grade: string): string {
  const normalized = grade.trim().toLowerCase();
  if (normalized === "listo" || normalized === "ready") return "bg-emerald-100 text-emerald-800";
  if (normalized === "interesado" || normalized === "interested") return "bg-amber-100 text-amber-800";
  if (normalized === "explorando" || normalized === "exploring") return "bg-rose-100 text-rose-800";
  return "bg-muted text-muted-foreground";
}

function confidenceTone(confidence: string): string {
  const normalized = confidence.trim().toLowerCase();
  if (normalized === "high") return "bg-emerald-100 text-emerald-800";
  if (normalized === "medium") return "bg-amber-100 text-amber-800";
  if (normalized === "low") return "bg-slate-200 text-slate-700";
  return "bg-muted text-muted-foreground";
}

function scoreTone(score: number): string {
  if (score >= 76) return "border-emerald-300 bg-emerald-50 text-emerald-800";
  if (score >= 51) return "border-amber-300 bg-amber-50 text-amber-800";
  return "border-rose-300 bg-rose-50 text-rose-800";
}


function isGenericConversationLabel(value: string | null | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  if (!normalized.length) return false;
  return normalized.startsWith("conversación ") || normalized.startsWith("conversacion ");
}

function formatOpportunityReference(code: string | null | undefined): string {
  const raw = typeof code === "string" ? code.trim() : "";
  if (!raw) return "";
  return raw.replace(/\s*-\s*/g, " - ");
}
