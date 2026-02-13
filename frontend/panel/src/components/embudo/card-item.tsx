"use client";

import { type HTMLAttributes, useMemo } from "react"
import { IconBrandWhatsapp, IconMessageCircle, IconRobot, IconUser } from "@tabler/icons-react"
import type { DraggableSyntheticListeners } from "@dnd-kit/core"

import type { EmbudoCard } from "@/lib/embudo/data"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { useRouter } from "next/navigation"

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
        timeZone: "America/Mexico_City",
        dateStyle: "short",
        timeStyle: "short",
      })
      return formatter.format(new Date(card.actualizadoEn))
    } catch {
      return "Sin fecha"
    }
  }, [card.actualizadoEn])

  const contactName =
    card.nombre && card.nombre.trim().length ? card.nombre.trim() : "Sin contacto";
  const opportunityName =
    card.titulo && card.titulo.trim().length
      ? card.titulo.trim()
      : card.proyectoNombre && card.proyectoNombre.trim().length
        ? card.proyectoNombre.trim()
        : "Oportunidad sin nombre";
  const contactInfo = card.correo || card.telefono || card.empresa || null;
  const scoreValue = card.leadScoring?.scoreTotal;
  const gradeValue = card.leadScoring?.grade;
  const confidenceValue = card.leadScoring?.confidence;
  const missingFieldsCount = card.leadScoring?.missingFields ?? 0;
  const inboxHref = card.contactoId ? `/inbox?contactId=${encodeURIComponent(card.contactoId)}` : "/inbox";

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
            <p className="truncate text-xs text-muted-foreground">Contacto: {contactName}</p>
            <p className="truncate text-xs text-muted-foreground">{contactInfo || "Sin datos de contacto"}</p>
          </div>
          {scoreValue != null ? (
            <div className={cn("shrink-0 rounded-md border px-2 py-1 text-right", scoreTone(scoreValue))}>
              <p className="text-[10px] uppercase tracking-wide">Score</p>
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
          {card.autoStage ? (
            <span
              className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary"
              title={buildAutoStageTooltip(card)}
            >
              <IconRobot className="size-3" />
              Tal-IA
            </span>
          ) : null}
        </div>

        <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="truncate inline-flex items-center gap-1">
            Canal:
            {isWhatsappChannel(card.canal) ? <IconBrandWhatsapp className="size-3" /> : null}
            <span>{card.canal || "Sin canal"}</span>
          </span>
          <span className="truncate">
            {card.asignadoNombre ? (
              <span className="inline-flex items-center gap-1">
                <IconUser className="size-3" />
                {card.asignadoNombre}
              </span>
            ) : "Sin asignar"}
          </span>
          <span className="truncate">Actualizado: {formattedUpdatedAt}</span>
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

function normalizeLabel(value: string): string {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed.length) return value;
  return `${trimmed.charAt(0).toUpperCase()}${trimmed.slice(1)}`;
}

function gradeTone(grade: string): string {
  const normalized = grade.trim().toLowerCase();
  if (normalized === "listo") return "bg-emerald-100 text-emerald-800";
  if (normalized === "interesado") return "bg-amber-100 text-amber-800";
  if (normalized === "explorando") return "bg-rose-100 text-rose-800";
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

function isWhatsappChannel(channel: string | null): boolean {
  return (channel || "").trim().toLowerCase() === "whatsapp";
}
