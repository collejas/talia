import { IconCalendar, IconClock, IconX } from "@tabler/icons-react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardAction,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { AgendaMetrics } from "@/lib/agenda/data";

type AgendaCardsProps = {
  data?: AgendaMetrics | null;
};

export function AgendaCards({ data }: AgendaCardsProps) {
  const total = toNumber(data?.total);
  const activas = toNumber(data?.activas);
  const proximas = toNumber(data?.proximas24h);
  const canceladas = toNumber(data?.canceladas);
  const realizadas = toNumber(data?.realizadas);

  return (
    <div className="*:data-[slot=card]:from-sky-50/60 *:data-[slot=card]:to-card dark:*:data-[slot=card]:bg-card grid grid-cols-1 gap-4 px-4 *:data-[slot=card]:bg-gradient-to-t *:data-[slot=card]:shadow-xs lg:px-6 @xl/main:grid-cols-2 @5xl/main:grid-cols-4">
      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Citas en total</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {formatNumber(total)}
          </CardTitle>
          <CardAction>
            <Badge variant="outline">
              <IconCalendar />
              Activas {formatNumber(activas)}
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            Próximas 24h <IconClock className="size-4" />
          </div>
          <div className="text-muted-foreground">{formatNumber(proximas)} citas próximas</div>
        </CardFooter>
      </Card>
      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Citas realizadas</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {formatNumber(realizadas)}
          </CardTitle>
          <CardAction>
            <Badge variant="outline">
              <IconCalendar />
              Cerradas
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            Confirmaciones <IconCalendar className="size-4" />
          </div>
          <div className="text-muted-foreground">Citas completadas en el periodo</div>
        </CardFooter>
      </Card>
      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Citas canceladas</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {formatNumber(canceladas)}
          </CardTitle>
          <CardAction>
            <Badge variant="outline">
              <IconX />
              Cancelaciones
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            Seguimiento requerido <IconX className="size-4" />
          </div>
          <div className="text-muted-foreground">Oportunidades por reactivar</div>
        </CardFooter>
      </Card>
      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Activas vs. total</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {formatNumber(activas)}
          </CardTitle>
          <CardAction>
            <Badge variant="outline">
              <IconClock />
              {formatNumber(total)} total
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            Volumen actual <IconClock className="size-4" />
          </div>
          <div className="text-muted-foreground">Estado de carga en agenda</div>
        </CardFooter>
      </Card>
    </div>
  );
}

function formatNumber(value: number | null | undefined): string {
  if (!value) return "0";
  return new Intl.NumberFormat("es-MX").format(value);
}

function toNumber(value: number | null | undefined): number {
  if (!Number.isFinite(value ?? Number.NaN)) return 0;
  return Number(value);
}
