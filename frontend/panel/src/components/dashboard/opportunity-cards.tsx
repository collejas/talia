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
  const total = toNumber(data?.activeTotal ?? data?.total);
  const monto = toNumber(data?.montoTotal);
  const weightedAmount = toNumber(data?.weightedAmount);
  const stale = toNumber(data?.stale);
  const avgAge = toNumber(data?.avgAgeDays);
  const unassigned = toNumber(data?.unassigned);
  const unassignedPct = toNumber(data?.unassignedPct);
  const upcomingCloseCount = toNumber(data?.upcomingCloseCount);
  const topStage = data?.topStage;
  const topStaleStage = data?.topStaleStage;
  const currencies = data?.monedas ?? [];

  return (
    <div className="*:data-[slot=card]:from-amber-50/60 *:data-[slot=card]:to-card dark:*:data-[slot=card]:bg-card grid grid-cols-1 gap-4 px-4 *:data-[slot=card]:bg-gradient-to-t *:data-[slot=card]:shadow-xs lg:px-6 @xl/main:grid-cols-2 @5xl/main:grid-cols-4">
      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Oportunidades activas</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {formatNumber(total)}
          </CardTitle>
          <CardAction className="max-w-[160px]">
            <Badge variant="outline" className={`${badgeClassName} min-w-0 max-w-[160px] whitespace-normal`}>
              <IconChartPie />
              {topStage ? topStage.label : "Sin etapa"}
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className={footerTitleClassName}>
            Etapa dominante <IconChartPie className="size-4" />
          </div>
          <div className={footerTextClassName}>
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
            <Badge variant="outline" className={badgeClassName}>
              <IconChartPie />
              {currencyBadge(currencies)}
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className={footerTitleClassName}>
            Valor bruto del pipeline <IconChartPie className="size-4" />
          </div>
          <div className={footerTextClassName}>
            Ponderado {formatCurrency(weightedAmount, currencies)}
          </div>
          <div className={footerTextClassName}>
            {formatNumber(upcomingCloseCount)} cierres probables en 14 días
          </div>
        </CardFooter>
      </Card>
      <Card className="@container/card border-amber-300/50 shadow-sm">
        <CardHeader>
          <CardDescription>Oportunidades sin asignar</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {formatNumber(unassigned)}
          </CardTitle>
          <CardAction>
            <Badge variant="outline" className={badgeClassName}>
              <IconAlertTriangle />
              {formatNumber(unassignedPct)}%
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className={footerTitleClassName}>
            Requieren responsable <IconAlertTriangle className="size-4" />
          </div>
          <div className={footerTextClassName}>
            {formatNumber(total - unassigned)} ya asignadas
          </div>
          <div className={footerTextClassName}>Impactan seguimiento comercial</div>
        </CardFooter>
      </Card>
      <Card className="@container/card border-amber-300/50 shadow-sm">
        <CardHeader>
          <CardDescription>Oportunidades estancadas</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {formatNumber(stale)}
          </CardTitle>
          <CardAction>
            <Badge variant="outline" className={badgeClassName}>
              <IconClock />
              +14 días
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className={footerTitleClassName}>
            Mayor atasco por etapa <IconClock className="size-4" />
          </div>
          <div className={footerTextClassName}>
            {topStaleStage ? `${topStaleStage.label} (${formatNumber(topStaleStage.count)})` : "Sin etapa dominante"}
          </div>
          <div className={footerTextClassName}>
            Edad promedio {formatNumber(avgAge)} días
          </div>
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

const badgeClassName = "h-6 px-2.5 text-[11px] font-semibold tracking-[0.01em]"
const footerTitleClassName = "line-clamp-1 flex gap-2 font-medium"
const footerTextClassName = "text-muted-foreground text-sm"
