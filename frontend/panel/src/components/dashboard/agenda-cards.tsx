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
  const linkedToConversation = toNumber(data?.linkedToConversation);
  const linkedToContact = toNumber(data?.linkedToContact);
  const virtuales = toNumber(data?.virtuales);
  const unassigned = toNumber(data?.unassigned);
  const coveragePct = percentage(linkedToConversation, total);
  const contactPct = percentage(linkedToContact, total);

  return (
    <div className="*:data-[slot=card]:from-sky-50/60 *:data-[slot=card]:to-card dark:*:data-[slot=card]:bg-card grid grid-cols-1 gap-4 px-4 *:data-[slot=card]:bg-gradient-to-t *:data-[slot=card]:shadow-xs lg:px-6 @xl/main:grid-cols-2 @5xl/main:grid-cols-4">
      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Citas en total</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {formatNumber(total)}
          </CardTitle>
          <CardAction>
            <Badge variant="outline" className={badgeClassName}>
              <IconCalendar />
              Activas {formatNumber(activas)}
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className={footerTitleClassName}>
            Carga inmediata <IconClock className="size-4" />
          </div>
          <div className={footerTextClassName}>{formatNumber(proximas)} citas próximas</div>
          <div className={footerTextClassName}>{formatNumber(realizadas)} realizadas en el periodo</div>
        </CardFooter>
      </Card>
      <Card className="@container/card border-sky-300/50 shadow-sm">
        <CardHeader>
          <CardDescription>Ligadas a conversación</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {formatNumber(linkedToConversation)}
          </CardTitle>
          <CardAction>
            <Badge variant="outline" className={badgeClassName}>
              <IconCalendar />
              {formatNumber(coveragePct)}%
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className={footerTitleClassName}>
            Cobertura comercial <IconCalendar className="size-4" />
          </div>
          <div className={footerTextClassName}>{formatNumber(linkedToContact)} también ligadas a contacto</div>
        </CardFooter>
      </Card>
      <Card className="@container/card border-sky-300/50 shadow-sm">
        <CardHeader>
          <CardDescription>Sin asignar</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {formatNumber(unassigned)}
          </CardTitle>
          <CardAction>
            <Badge variant="outline" className={badgeClassName}>
              <IconX />
              {formatNumber(canceladas)} canceladas
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className={footerTitleClassName}>
            Requieren responsable <IconX className="size-4" />
          </div>
          <div className={footerTextClassName}>Bookings sin responsable visible</div>
        </CardFooter>
      </Card>
      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Con contacto</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {formatNumber(linkedToContact)}
          </CardTitle>
          <CardAction>
            <Badge variant="outline" className={badgeClassName}>
              <IconClock />
              {formatNumber(contactPct)}%
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className={footerTitleClassName}>
            Base de seguimiento <IconClock className="size-4" />
          </div>
          <div className={footerTextClassName}>{formatNumber(virtuales)} reuniones virtuales</div>
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

function percentage(part: number, total: number): number {
  if (!total) return 0;
  return Math.round((part / total) * 100);
}

const badgeClassName = "h-6 px-2.5 text-[11px] font-semibold tracking-[0.01em]"
const footerTitleClassName = "line-clamp-1 flex gap-2 font-medium"
const footerTextClassName = "text-muted-foreground text-sm"
