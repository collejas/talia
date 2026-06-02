"use client";

import {
  IconBuilding,
  IconCheck,
  IconUserCheck,
  IconUsersGroup,
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
import type { AccountCards } from "@/lib/cuentas/types";

type AccountSectionCardsProps = {
  data: AccountCards;
};

export function AccountSectionCards({ data }: AccountSectionCardsProps) {
  return (
    <div className="*:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card dark:*:data-[slot=card]:bg-card grid grid-cols-1 gap-4 px-4 *:data-[slot=card]:bg-gradient-to-t *:data-[slot=card]:shadow-xs lg:px-6 @xl/main:grid-cols-2 @5xl/main:grid-cols-4">
      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Total de empresas</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {formatNumber(data.total)}
          </CardTitle>
          <CardAction>
            <Badge variant="outline">
              <IconBuilding />
              {formatNumber(Math.max(data.propietarios, 0))} propietarios
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">Registro acumulado de empresas</div>
          <div className="text-muted-foreground">Última alta: {formatDateRelative(data.ultimo)}</div>
        </CardFooter>
      </Card>
      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Ficha completa</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {formatNumber(data.completas)}
          </CardTitle>
          <CardAction>
            <Badge variant="outline">
              <IconCheck />
              {formatPercent(data.completas, data.total)}% completas
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">Empresas con datos fiscales listos</div>
          <div className="text-muted-foreground">{formatNumber(data.incompletas)} pendientes de completar</div>
        </CardFooter>
      </Card>
      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Empresas activas</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {formatNumber(data.activas)}
          </CardTitle>
          <CardAction>
            <Badge variant="outline">
              <IconUserCheck />
              {formatPercent(data.activas, data.total)}%
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">Empresas en operación</div>
          <div className="text-muted-foreground">Estado operativo normalizado</div>
        </CardFooter>
      </Card>
      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Propietario con más empresas</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {formatNumber(data.topPropietarioTotal)}
          </CardTitle>
          <CardAction>
            <Badge variant="outline">
              <IconUsersGroup />
              {data.topPropietarioNombre || "Sin asignar"}
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">Concentración por propietario</div>
          <div className="text-muted-foreground">
            {data.topPropietarioTotal > 0
              ? `${formatNumber(data.topPropietarioTotal)} empresas asignadas`
              : "Sin empresas asignadas"}
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

function formatPercent(part: number | null | undefined, total: number | null | undefined): string {
  if (!part || !total) return "0";
  if (total === 0) return "0";
  return Math.round((part / total) * 100).toString();
}

function formatDateRelative(value: string | null | undefined): string {
  if (!value) return "Sin registro";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sin registro";
  const formatter = new Intl.DateTimeFormat("es-MX", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  });
  return formatter.format(date);
}
