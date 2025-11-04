import { IconPlus, IconUsers } from "@tabler/icons-react"

import type { EmbudoStage } from "@/lib/embudo/data"
import { EmbudoCardItem } from "@/components/embudo/card-item"

export function EmbudoStageColumn({ stage }: { stage: EmbudoStage }) {
  return (
    <div className="flex h-full min-h-[420px] flex-col rounded-xl border bg-muted/10">
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
        >
          <IconPlus className="size-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        <div className="flex flex-col gap-3">
          {stage.tarjetas.length ? (
            stage.tarjetas.map((card) => <EmbudoCardItem key={card.tarjetaId} card={card} />)
          ) : (
            <p className="text-xs text-muted-foreground">No hay leads en esta etapa.</p>
          )}
        </div>
      </div>
    </div>
  )
}
