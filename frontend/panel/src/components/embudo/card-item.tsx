"use client";

import { type HTMLAttributes, useMemo } from "react"
import { IconMessageCircle, IconRobot, IconUser } from "@tabler/icons-react"
import type { DraggableSyntheticListeners } from "@dnd-kit/core"

import type { EmbudoCard } from "@/lib/embudo/data"
import { cn } from "@/lib/utils"

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
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1">
            <h4 className="font-semibold leading-tight">{opportunityName}</h4>
            <p className="text-xs text-muted-foreground">
              Contacto: {contactName}
            </p>
            <p className="text-xs text-muted-foreground">
              {contactInfo || "Sin datos de contacto"}
            </p>
          </div>
          <div className="flex items-center gap-1">
            {card.autoStage ? (
              <span
                className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary"
                title={buildAutoStageTooltip(card)}
              >
                <IconRobot className="size-3" />
                Tal-IA
              </span>
            ) : null}
            {card.asignadoNombre ? (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <IconUser className="size-3" />
                <span>{card.asignadoNombre}</span>
              </div>
            ) : null}
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="rounded bg-muted px-2 py-0.5 uppercase">{card.canal || "Sin canal"}</span>
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
        </div>
        <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
          <span>
            Actualizado: {formattedUpdatedAt}
          </span>
          <span className="flex items-center gap-1">
            <IconMessageCircle className="size-3" />
            {formatMessageCount(card.metadata?.mensajes)}
          </span>
        </div>
      </article>
    </button>
  )
}


function formatMessageCount(value: unknown): string {
  if (typeof value === "number" || typeof value === "string") {
    return value.toString()
  }
  if (Array.isArray(value)) {
    return `${value.length}`
  }
  if (value && typeof value === "object" && 'count' in (value as Record<string, unknown>)) {
    const count = (value as Record<string, unknown>).count
    if (typeof count === "number") return count.toString()
  }
  return "—"
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
