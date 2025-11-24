"use client"

import { useMemo } from "react"
import { IconPlus, IconUsers } from "@tabler/icons-react"
import { useDroppable } from "@dnd-kit/core"

import type { EmbudoStage, EmbudoCard } from "@/lib/embudo/data"
import { EmbudoCardItem } from "@/components/embudo/card-item"
import { cn } from "@/lib/utils"

const STAGE_BUTTON_ACCENTS: Record<string, string> = {
  default: "text-muted-foreground hover:bg-primary/10 hover:text-primary focus-visible:ring-primary",
  stone: "text-stone-600 hover:bg-stone-200/60 hover:text-stone-800 focus-visible:ring-stone-500",
  slate: "text-slate-600 hover:bg-slate-200/60 hover:text-slate-800 focus-visible:ring-slate-500",
  sky: "text-sky-600 hover:bg-sky-200/60 hover:text-sky-700 focus-visible:ring-sky-500",
  amber: "text-amber-600 hover:bg-amber-200/60 hover:text-amber-700 focus-visible:ring-amber-500",
  violet: "text-violet-600 hover:bg-violet-200/60 hover:text-violet-700 focus-visible:ring-violet-500",
  emerald: "text-emerald-600 hover:bg-emerald-200/60 hover:text-emerald-700 focus-visible:ring-emerald-500",
  rose: "text-rose-600 hover:bg-rose-200/60 hover:text-rose-700 focus-visible:ring-rose-500",
}

function resolveStageColor(meta: Record<string, unknown> | undefined): string | undefined {
  if (!meta) return undefined
  const value = meta["color"]
  if (typeof value !== "string") return undefined
  const normalized = value.trim().toLowerCase()
  return normalized.length ? normalized : undefined
}

type StageColumnProps = {
  stage: EmbudoStage
  onCardClick?: (card: EmbudoCard) => void
  renderCard?: (card: EmbudoCard, index: number) => React.ReactNode
  onAddLead?: () => void
  droppableId?: string
  canDrop?: boolean
  dropDisabled?: boolean
}

export function EmbudoStageColumn({
  stage,
  onCardClick,
  renderCard,
  onAddLead,
  droppableId,
  canDrop = true,
  dropDisabled = false,
}: StageColumnProps) {
  const {
    setNodeRef,
    isOver,
  } = useDroppable({
    id: droppableId ?? `${stage.id}-droppable`,
    disabled: dropDisabled,
  })

  const cards = useMemo(() => stage.tarjetas ?? [], [stage.tarjetas])
  const addButtonTone = useMemo(() => {
    const colorKey = resolveStageColor(stage.metadatos)
    return STAGE_BUTTON_ACCENTS[colorKey ?? "default"] ?? STAGE_BUTTON_ACCENTS.default
  }, [stage.metadatos])

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex h-full min-h-[420px] flex-col rounded-xl border bg-muted/10 transition",
        isOver && canDrop && "border-primary/60 bg-primary/10",
        isOver && !canDrop && "border-destructive/60 bg-destructive/10",
      )}
    >
      <div className="flex items-center justify-between gap-2 px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">{stage.nombre}</h3>
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <IconUsers className="size-3" /> {stage.tarjetas.length} leads
          </p>
        </div>
        <button
          type="button"
          className={cn(
            "flex size-7 items-center justify-center rounded-md transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            addButtonTone,
          )}
          aria-label={`Agregar lead en ${stage.nombre}`}
          onClick={onAddLead}
        >
          <IconPlus className="size-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        <div className="flex flex-col gap-3">
          {cards.length ? (
            cards.map((card, index) =>
              renderCard ? (
                renderCard(card, index)
              ) : (
                <EmbudoCardItem
                  key={card.oportunidadId}
                  card={card}
                  onClick={onCardClick ? () => onCardClick(card) : undefined}
                />
              ),
            )
          ) : (
            <p className="text-xs text-muted-foreground">No hay leads en esta etapa.</p>
          )}
        </div>
      </div>
    </div>
  )
}
