import { IconRocket, IconRoute, IconMessageCircle, IconWorld } from "@tabler/icons-react"

import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { formatSourceClassLabel } from "@/lib/mapa-conversion/source-class"
type MapKpisProps = {
  nivelLabel: string
  visitasTotales: number
  sesionesWebTotales: number
  sesionesWebchatTotales: number
  conversacionesWhatsapp: number
  conversacionesVoz: number
  conversacionesCorreo: number
  whatsappCampaignsTotal: number
  topLocationName: string
  topLocationLeads: number
  topLocationVisits: number
  topSource: string
  topSourceValue: number
  stageLeader: string
  stageLeaderValue: number
  stacked?: boolean
  className?: string
}

function formatDisplayNumber(value: number | undefined | null): string {
  if (value == null) {
    return "0"
  }
  return new Intl.NumberFormat("es-MX").format(value)
}

export function MapKpis({
  nivelLabel,
  visitasTotales,
  sesionesWebTotales,
  sesionesWebchatTotales,
  conversacionesWhatsapp,
  conversacionesVoz,
  conversacionesCorreo,
  whatsappCampaignsTotal,
  topLocationName,
  topLocationLeads,
  topLocationVisits,
  topSource,
  topSourceValue,
  stageLeader,
  stageLeaderValue,
  stacked = false,
  className,
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
      title: "Tráfico web",
      value: formatDisplayNumber(sesionesWebTotales),
      helper: `Nivel ${nivelLabel} · Visitas totales ${formatDisplayNumber(visitasTotales)}`,
      icon: IconWorld,
    },
    {
      title: "WhatsApp campañas",
      value: formatDisplayNumber(whatsappCampaignsTotal),
      helper: `Conversaciones atribuidas por campaña`,
      icon: IconRoute,
    },
    {
      title: "Origen principal",
      value: topSource
        ? `${formatSourceClassLabel(topSource)} (${formatDisplayNumber(topSourceValue)})`
        : "Sin datos",
      helper: `Nivel ${nivelLabel} · Origen principal de sesiones web`,
      icon: IconRoute,
    },
    {
      title: "Conversaciones",
      value: formatDisplayNumber(
        sesionesWebchatTotales + conversacionesWhatsapp + conversacionesVoz + conversacionesCorreo,
      ),
      helper: `Webchat ${formatDisplayNumber(sesionesWebchatTotales)} · WA ${formatDisplayNumber(
        conversacionesWhatsapp,
      )} · Voz ${formatDisplayNumber(conversacionesVoz)} · Correo ${formatDisplayNumber(
        conversacionesCorreo,
      )} · Etapa líder ${stageLeader || "N/A"} (${formatDisplayNumber(stageLeaderValue)})`,
      icon: IconMessageCircle,
    },
  ]

  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-3",
        stacked ? "" : "sm:grid-cols-2 lg:grid-cols-5",
        className,
      )}
    >
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
