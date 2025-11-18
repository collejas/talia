"use client"

import { IconTrendingDown, IconTrendingUp } from "@tabler/icons-react"

import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardAction,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import type { VisitCards } from "@/lib/visitas/data"

type SectionCardsProps = {
  cards: VisitCards
}

export function VisitsSectionCards({ cards }: SectionCardsProps) {
  const ratioSinChat = percentage(cards.sinChat, cards.totalVisits)
  const ratioConChat = percentage(cards.conChat, cards.totalVisits)
  const ratioWhatsapp = percentage(cards.whatsapp, cards.totalVisits || cards.whatsapp)

  return (
    <div className="*:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card dark:*:data-[slot=card]:bg-card grid grid-cols-1 gap-4 px-4 *:data-[slot=card]:bg-gradient-to-t *:data-[slot=card]:shadow-xs lg:px-6 @xl/main:grid-cols-2 @5xl/main:grid-cols-5">
      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Total de visitas</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {formatNumber(cards.totalVisits)}
          </CardTitle>
          <CardAction>
            <Badge variant="outline">
              <IconTrendingUp />
              {ratioConChat}
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            Conversaciones activas <IconTrendingUp className="size-4" />
          </div>
          <div className="text-muted-foreground">Incluye sesiones con y sin chat</div>
        </CardFooter>
      </Card>
      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Visitantes sin chat</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {formatNumber(cards.sinChat)}
          </CardTitle>
          <CardAction>
            <Badge variant="outline">
              <IconTrendingDown />
              {ratioSinChat}
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            Oportunidades de contacto <IconTrendingDown className="size-4" />
          </div>
          <div className="text-muted-foreground">
            Sesiones sin interacción con agente
          </div>
        </CardFooter>
      </Card>
      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Conversaciones webchat</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {formatNumber(cards.conChat)}
          </CardTitle>
          <CardAction>
            <Badge variant="outline">
              <IconTrendingUp />
              {ratioConChat}
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            Sesiones atendidas <IconTrendingUp className="size-4" />
          </div>
          <div className="text-muted-foreground">
            Conversaciones con al menos un mensaje de salida
          </div>
        </CardFooter>
      </Card>
      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Contactos completados</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {formatNumber(cards.contactos)}
          </CardTitle>
          <CardAction>
            <Badge variant="outline">
              <IconTrendingUp />
              Calidad
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            Datos completos registrados <IconTrendingUp className="size-4" />
          </div>
          <div className="text-muted-foreground">
            Contactos con información verificada
          </div>
        </CardFooter>
      </Card>
      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Conversaciones WhatsApp</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {formatNumber(cards.whatsapp)}
          </CardTitle>
          <CardAction>
            <Badge variant="outline">
              <IconTrendingUp />
              {ratioWhatsapp}
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            Leads directos desde WA <IconTrendingUp className="size-4" />
          </div>
          <div className="text-muted-foreground">
            Conversaciones iniciadas por WhatsApp con Tal-IA
          </div>
        </CardFooter>
      </Card>
    </div>
  )
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("es-MX").format(value || 0)
}

function percentage(value: number, total: number) {
  if (!total) return "0%"
  return `${Math.round((value / total) * 100)}%`
}
