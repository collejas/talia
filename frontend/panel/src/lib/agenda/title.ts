import type { AgendaItem } from "@/lib/agenda/data"

export function getAgendaItemTitle(item: AgendaItem): string {
  return item.asunto?.trim() || item.contactoNombre?.trim() || "Cita sin nombre"
}
