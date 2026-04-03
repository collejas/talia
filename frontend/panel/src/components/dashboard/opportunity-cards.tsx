import { IconAlertTriangle, IconChartPie, IconClock } from "@tabler/icons-react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardAction,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { OpportunityKpis } from "@/lib/dashboard/opportunities-kpis";

type OpportunityCardsProps = {
  data?: OpportunityKpis | null;
};

export function OpportunityCards({ data }: OpportunityCardsProps) {
  const total = toNumber(data?.total);
  const monto = toNumber(data?.montoTotal);
  const stale = toNumber(data?.stale);
  const avgAge = toNumber(data?.avgAgeDays);
  const topStage = data?.topStage;
  const currencies = data?.monedas ?? [];

  return (
    <div className="*:data-[slot=card]:from-amber-50/60 *:data-[slot=card]:to-card dark:*:data-[slot=card]:bg-card grid grid-cols-1 gap-4 px-4 *:data-[slot=card]:bg-gradient-to-t *:data-[slot=card]:shadow-xs lg:px-6 @xl/main:grid-cols-2 @5xl/main:grid-cols-4">
      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Oportunidades activas</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {formatNumber(total)}
          </CardTitle>
          <CardAction>
            <Badge variant="outline">
              <IconChartPie />
              {topStage ? topStage.label : "Sin etapa"}
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            Etapa principal <IconChartPie className="size-4" />
          </div>
          <div className="text-muted-foreground">
            {topStage ? `${formatNumber(topStage.count)} oportunidades` : "Sin datos de etapa"}
          </div>
        </CardFooter>
      </Card>
      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Monto estimado pipeline</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {formatCurrency(monto, currencies)}
          </CardTitle>
          <CardAction>
            <Badge variant="outline">
              <IconChartPie />
              {currencyBadge(currencies)}
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            Valor proyectado <IconChartPie className="size-4" />
          </div>
          <div className="text-muted-foreground">Suma de monto estimado</div>
        </CardFooter>
      </Card>
      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Oportunidades estancadas</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {formatNumber(stale)}
          </CardTitle>
          <CardAction>
            <Badge variant="outline">
              <IconAlertTriangle />
              +14 días
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            Sin movimiento reciente <IconAlertTriangle className="size-4" />
          </div>
          <div className="text-muted-foreground">Requieren seguimiento</div>
        </CardFooter>
      </Card>
      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Antigüedad promedio</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {formatNumber(avgAge)} días
          </CardTitle>
          <CardAction>
            <Badge variant="outline">
              <IconClock />
              Edad promedio
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            Desde creación <IconClock className="size-4" />
          </div>
          <div className="text-muted-foreground">Promedio de tiempo abierto</div>
        </CardFooter>
      </Card>
    </div>
  );
}

function formatNumber(value: number | null | undefined): string {
  if (!value) return "0";
  return new Intl.NumberFormat("es-MX").format(value);
}

function formatCurrency(value: number | null | undefined, currencies: string[]): string {
  if (!value) return "$0";
  const currency = currencies.length === 1 ? currencies[0] : "MXN";
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

function currencyBadge(currencies: string[]): string {
  if (currencies.length === 1) return currencies[0];
  if (currencies.length === 0) return "MXN";
  return "Multimoneda";
}

function toNumber(value: number | null | undefined): number {
  if (!Number.isFinite(value ?? Number.NaN)) return 0;
  return Number(value);
}
