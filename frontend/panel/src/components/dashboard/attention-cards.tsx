import {
  IconClock,
  IconMessageCircle,
  IconUserCheck,
  IconWorld,
} from "@tabler/icons-react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardAction,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { DashboardKpis } from "@/lib/dashboard/kpis";

type AttentionCardsProps = {
  data?: DashboardKpis | null;
};

export function AttentionCards({ data }: AttentionCardsProps) {
  const conversacionesTotal = toNumber(data?.conversaciones?.total);
  const webchatTotal = toNumber(data?.conversaciones?.webchat_total);
  const canalesActivos = toNumber(data?.conversaciones?.canales_activos);
  const avgResponse = toNumber(data?.tiempos_respuesta?.promedio);
  const maxResponse = toNumber(data?.tiempos_respuesta?.maximo);
  const webchatVisitas = toNumber(data?.webchat?.visitas_totales);
  const webchatSinChat = toNumber(data?.webchat?.visitas_sin_chat);
  const webchatContactos = toNumber(data?.webchat?.contactos_completos);
  const contactosCompletos = toNumber(data?.contactos?.total);

  return (
    <div className="*:data-[slot=card]:from-secondary/30 *:data-[slot=card]:to-card dark:*:data-[slot=card]:bg-card grid grid-cols-1 gap-4 px-4 *:data-[slot=card]:bg-gradient-to-t *:data-[slot=card]:shadow-xs lg:px-6 @xl/main:grid-cols-2 @5xl/main:grid-cols-4">
      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Conversaciones</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {formatNumber(conversacionesTotal)}
          </CardTitle>
          <CardAction>
            <Badge variant="outline">
              <IconMessageCircle />
              Webchat {formatNumber(webchatTotal)}
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            Canales activos <IconMessageCircle className="size-4" />
          </div>
          <div className="text-muted-foreground">
            {formatNumber(canalesActivos)} canales con actividad
          </div>
        </CardFooter>
      </Card>
      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Tiempo de respuesta</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {formatDuration(avgResponse)}
          </CardTitle>
          <CardAction>
            <Badge variant="outline">
              <IconClock />
              Max {formatDuration(maxResponse)}
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            Primera respuesta promedio <IconClock className="size-4" />
          </div>
          <div className="text-muted-foreground">
            Basado en conversaciones con respuesta
          </div>
        </CardFooter>
      </Card>
      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Visitas webchat</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {formatNumber(webchatVisitas)}
          </CardTitle>
          <CardAction>
            <Badge variant="outline">
              <IconWorld />
              Sin chat {formatNumber(webchatSinChat)}
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            Contactos completos <IconUserCheck className="size-4" />
          </div>
          <div className="text-muted-foreground">
            {formatNumber(webchatContactos)} generados desde webchat
          </div>
        </CardFooter>
      </Card>
      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Contactos completos</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {formatNumber(contactosCompletos)}
          </CardTitle>
          <CardAction>
            <Badge variant="outline">
              <IconUserCheck />
              Captura completa
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            Leads listos <IconUserCheck className="size-4" />
          </div>
          <div className="text-muted-foreground">
            Contactos con datos mínimos
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

function formatDuration(seconds: number | null | undefined): string {
  if (!seconds || seconds <= 0) return "0s";
  const rounded = Math.round(seconds);
  const mins = Math.floor(rounded / 60);
  const secs = rounded % 60;
  if (mins <= 0) return `${secs}s`;
  return `${mins}m ${secs}s`;
}

function toNumber(value: number | null | undefined): number {
  if (!Number.isFinite(value ?? Number.NaN)) return 0;
  return Number(value);
}
