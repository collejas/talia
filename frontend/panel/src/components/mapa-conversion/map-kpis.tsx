import { IconRocket, IconRoute, IconActivity, IconChartBar } from "@tabler/icons-react"

import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
type MapKpisProps = {
  nivelLabel: string
  leadsTotal: number
  visitasTotales: number
  topLocationName: string
  topLocationLeads: number
  topLocationVisits: number
  channelLeader: string
  channelLeaderValue: number
  stageLeader: string
  stageLeaderValue: number
}

function formatDisplayNumber(value: number | undefined | null): string {
  if (value == null) {
    return "0"
  }
  return new Intl.NumberFormat("es-MX").format(value)
}

export function MapKpis({
  nivelLabel,
  leadsTotal,
  visitasTotales,
  topLocationName,
  topLocationLeads,
  topLocationVisits,
  channelLeader,
  channelLeaderValue,
  stageLeader,
  stageLeaderValue,
}: MapKpisProps) {
  const cards = [
    {
      title: "Top ubicación",
      value: topLocationName || "Sin datos",
      helper: `Leads ${formatDisplayNumber(topLocationLeads)} · Visitas ${formatDisplayNumber(
        topLocationVisits,
      )}`,
      icon: IconRocket,
    },
    {
      title: "Leads totales",
      value: formatDisplayNumber(leadsTotal),
      helper: `Nivel ${nivelLabel} · Visitas totales ${formatDisplayNumber(visitasTotales)}`,
      icon: IconChartBar,
    },
    {
      title: "Canal dominante",
      value: channelLeader
        ? `${channelLeader} (${formatDisplayNumber(channelLeaderValue)})`
        : "Sin datos",
      helper: `Nivel ${nivelLabel} · Canal principal en ${topLocationName || "esta zona"}`,
      icon: IconActivity,
    },
    {
      title: "Etapa dominante",
      value: stageLeader
        ? `${stageLeader} (${formatDisplayNumber(stageLeaderValue)})`
        : "Sin datos",
      helper: `Nivel ${nivelLabel} · Etapa líder en ${topLocationName || "esta zona"}`,
      icon: IconRoute,
    },
  ]

  return (
    <div className="grid grid-cols-1 gap-4 px-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((config) => (
        <Card key={config.title} className="@container/card">
          <CardHeader>
            <CardDescription className="flex items-center gap-2">
              <config.icon className="size-4" />
              {config.title}
            </CardDescription>
            <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
              {config.value}
            </CardTitle>
          </CardHeader>
          <CardFooter className="text-xs text-muted-foreground">{config.helper}</CardFooter>
        </Card>
      ))}
    </div>
  )
}
