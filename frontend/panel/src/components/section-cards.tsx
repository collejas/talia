import { IconTrendingUp } from "@tabler/icons-react"

import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardAction,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import type { LeadCards } from '@/lib/leads/data'

type SectionCardsProps = {
  data?: LeadCards
}

const DEFAULT_LEAD_CARDS: LeadCards = {
  total: 0,
  abiertas: 0,
  ganadas: 0,
  perdidas: 0,
  nuevas: 0,
  montoTotal: 0,
  ticketPromedioGanado: 0,
  diasPromedioCierre: 0,
}

export function SectionCards({ data = DEFAULT_LEAD_CARDS }: SectionCardsProps) {
  const total = data.total ?? 0
  const abiertas = data.abiertas ?? 0
  const nuevas = data.nuevas ?? 0
  const ganadas = data.ganadas ?? 0
  const conversion = data.total > 0 ? Math.round((data.ganadas / data.total) * 100) : 0
  const perdidas = data.perdidas ?? 0
  const montoTotal = data.montoTotal ?? 0
  const ticketPromedio = data.ticketPromedioGanado ?? 0
  const diasPromedioCierre = data.diasPromedioCierre ?? 0
  const topVendedorLabel = data.topVendedor?.nombre
    ? `${data.topVendedor.nombre} (${data.topVendedor.total ?? 0})`
    : "—"

  return (
    <div className="*:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card dark:*:data-[slot=card]:bg-card grid grid-cols-1 gap-4 px-4 *:data-[slot=card]:bg-gradient-to-t *:data-[slot=card]:shadow-xs lg:px-6 @xl/main:grid-cols-2 @5xl/main:grid-cols-4">
      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Leads nuevos</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {formatNumber(nuevas)}
          </CardTitle>
          <CardAction>
            <Badge variant="outline">
              <IconTrendingUp />
              {formatPercent(nuevas, total)}%
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            Entrada del periodo <IconTrendingUp className="size-4" />
          </div>
          <div className="text-muted-foreground">
            {formatNumber(abiertas)} siguen abiertos
          </div>
        </CardFooter>
      </Card>
      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Leads ganados</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {formatNumber(ganadas)}
          </CardTitle>
          <CardAction>
            <Badge variant="outline">
              <IconTrendingUp />
              {conversion}%
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            Conversión del periodo <IconTrendingUp className="size-4" />
          </div>
          <div className="text-muted-foreground">
            {formatNumber(perdidas)} perdidos · {formatNumber(diasPromedioCierre)} días a cierre
          </div>
        </CardFooter>
      </Card>
      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Valor ganado</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {formatNumber(montoTotal)}
          </CardTitle>
          <CardAction className="max-w-[140px]">
            <Badge
              variant="outline"
              className="min-w-0 max-w-[140px] whitespace-normal text-xs leading-tight"
            >
              <IconTrendingUp />
              Cotizaciones aceptadas
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            Ingreso cerrado <IconTrendingUp className="size-4" />
          </div>
          <div className="text-muted-foreground">
            Ticket promedio {formatCurrency(ticketPromedio)}
          </div>
        </CardFooter>
      </Card>
      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Top vendedor</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {topVendedorLabel}
          </CardTitle>
          <CardAction>
            <Badge variant="outline">
              <IconTrendingUp />
              {formatNumber(total)} totales
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            Mayor volumen gestionado <IconTrendingUp className="size-4" />
          </div>
          <div className="text-muted-foreground">
            {formatNumber(ganadas)} ganados · {formatCurrency(montoTotal)} cerrados
          </div>
        </CardFooter>
      </Card>
    </div>
  )
}

function formatNumber(value: number | null | undefined): string {
  if (!value) return "0";
  return new Intl.NumberFormat("es-MX").format(value);
}

function formatPercent(part: number | null | undefined, total: number | null | undefined): string {
  if (!part || !total) return "0";
  return Math.round((part / total) * 100).toString();
}

function formatCurrency(value: number | null | undefined): string {
  if (!value) return "$0";
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  }).format(value);
}
