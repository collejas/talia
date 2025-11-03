import { IconTrendingDown, IconTrendingUp } from "@tabler/icons-react"

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
}

export function SectionCards({ data = DEFAULT_LEAD_CARDS }: SectionCardsProps) {
  const conversion = data.total > 0 ? Math.round((data.ganadas / data.total) * 100) : 0
  const perdidas = data.perdidas ?? 0
  const topVendedorLabel = data.topVendedor?.nombre
    ? `${data.topVendedor.nombre} (${data.topVendedor.total ?? 0})`
    : "—"

  return (
    <div className="*:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card dark:*:data-[slot=card]:bg-card grid grid-cols-1 gap-4 px-4 *:data-[slot=card]:bg-gradient-to-t *:data-[slot=card]:shadow-xs lg:px-6 @xl/main:grid-cols-2 @5xl/main:grid-cols-4">
      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Total de leads</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {formatNumber(data.total)}
          </CardTitle>
          <CardAction>
            <Badge variant="outline">
              <IconTrendingUp />
              +{formatNumber(data.nuevas)} hoy
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            Leads creados en el periodo <IconTrendingUp className="size-4" />
          </div>
          <div className="text-muted-foreground">
            Incluye todos los tableros visibles para ti
          </div>
        </CardFooter>
      </Card>
      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Leads abiertos</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {formatNumber(data.abiertas)}
          </CardTitle>
          <CardAction>
            <Badge variant="outline">
              <IconTrendingDown />
              {formatPercent(data.abiertas, data.total)}%
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            En seguimiento ahora <IconTrendingDown className="size-4" />
          </div>
          <div className="text-muted-foreground">
            Leads en etapas activas sin cerrar
          </div>
        </CardFooter>
      </Card>
      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Leads ganados</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {formatNumber(data.ganadas)}
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
            Tasa de conversión <IconTrendingUp className="size-4" />
          </div>
          <div className="text-muted-foreground">{formatNumber(perdidas)} leads perdidos</div>
        </CardFooter>
      </Card>
      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Monto estimado</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {formatCurrency(data.montoTotal)}
          </CardTitle>
          <CardAction>
            <Badge variant="outline">
              <IconTrendingUp />
              Top vendedor
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            {topVendedorLabel} <IconTrendingUp className="size-4" />
          </div>
          <div className="text-muted-foreground">Vendedores con leads activos</div>
        </CardFooter>
      </Card>
    </div>
  )
}

function formatNumber(value: number | null | undefined): string {
  if (!value) return "0";
  return new Intl.NumberFormat("es-MX").format(value);
}

function formatCurrency(value: number | null | undefined): string {
  if (!value) return "—";
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatPercent(part: number | null | undefined, total: number | null | undefined): string {
  if (!part || !total) return "0";
  return Math.round((part / total) * 100).toString();
}
