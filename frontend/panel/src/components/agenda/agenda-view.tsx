'use client'

import * as React from "react"

import { AgendaItem } from "@/lib/agenda/data"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { AgendaCalendar } from "@/components/agenda/agenda-calendar"
import { AgendaTable } from "@/components/agenda/agenda-table"

type AgendaViewProps = {
  items: AgendaItem[]
}

export function AgendaView({ items }: AgendaViewProps) {
  const [mode, setMode] = React.useState<"calendar" | "table">("calendar")

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">Visualización</p>
          <p className="text-muted-foreground text-xs">
            Cambia entre el calendario semanal y la lista detallada.
          </p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background p-1">
          <ToggleButton active={mode === "calendar"} onClick={() => setMode("calendar")}>
            Calendario
          </ToggleButton>
          <ToggleButton active={mode === "table"} onClick={() => setMode("table")}>
            Lista
          </ToggleButton>
        </div>
      </div>
      {mode === "calendar" ? <AgendaCalendar items={items} /> : <AgendaTable items={items} />}
    </div>
  )
}

function ToggleButton({
  active,
  children,
  onClick,
}: {
  active: boolean
  children: React.ReactNode
  onClick: () => void
}) {
  return (
    <Button
      type="button"
      variant={active ? "default" : "ghost"}
      onClick={onClick}
      className={cn(
        "rounded-full px-4 text-sm",
        active ? "shadow-sm" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </Button>
  )
}
