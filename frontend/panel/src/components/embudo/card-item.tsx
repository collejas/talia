import { type HTMLAttributes } from "react"
import { IconMessageCircle, IconUser } from "@tabler/icons-react"
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
          <div>
            <h4 className="font-semibold leading-tight">{card.nombre}</h4>
            <p className="text-xs text-muted-foreground">{card.correo || card.telefono || "Sin contacto"}</p>
          </div>
          {card.asignadoNombre ? (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <IconUser className="size-3" />
              <span>{card.asignadoNombre}</span>
            </div>
          ) : null}
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
            Actualizado: {card.actualizadoEn ? new Date(card.actualizadoEn).toLocaleString("es-MX") : "Sin fecha"}
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
