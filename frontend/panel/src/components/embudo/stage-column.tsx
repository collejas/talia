"use client"

import { useMemo } from "react"
import { IconPlus, IconUsers } from "@tabler/icons-react"
import { useDroppable } from "@dnd-kit/core"

import type { EmbudoStage, EmbudoCard } from "@/lib/embudo/data"
import { EmbudoCardItem } from "@/components/embudo/card-item"
import { cn } from "@/lib/utils"

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
          className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition hover:bg-primary/10 hover:text-primary"
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
                  key={card.tarjetaId}
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
