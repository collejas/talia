import {
  IconAddressBook,
  IconCheck,
  IconMessageCircle,
  IconUserCheck,
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
import type { ContactCards } from "@/lib/contactos/data";

type ContactSectionCardsProps = {
  data: ContactCards;
};

export function ContactSectionCards({ data }: ContactSectionCardsProps) {
  return (
    <div className="*:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card dark:*:data-[slot=card]:bg-card grid grid-cols-1 gap-4 px-4 *:data-[slot=card]:bg-gradient-to-t *:data-[slot=card]:shadow-xs lg:px-6 @xl/main:grid-cols-2 @5xl/main:grid-cols-4">
      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Total de contactos</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {formatNumber(data.total)}
          </CardTitle>
          <CardAction>
            <Badge variant="outline">
              <IconAddressBook />
              {formatNumber(Math.max(data.propietarios, 0))} propietarios
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            Registro acumulado de contactos
          </div>
          <div className="text-muted-foreground">
            Último alta: {formatDateRelative(data.ultimo)}
          </div>
        </CardFooter>
      </Card>
      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Captura completa</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {formatNumber(data.completos)}
          </CardTitle>
          <CardAction>
            <Badge variant="outline">
              <IconCheck />
              {formatPercent(data.completos, data.total)}% completos
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            Contactos listos para seguimiento
          </div>
          <div className="text-muted-foreground">
            {formatNumber(data.incompletos)} pendientes de completar
          </div>
        </CardFooter>
      </Card>
      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Contactos activos</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {formatNumber(data.activos)}
          </CardTitle>
          <CardAction>
            <Badge variant="outline">
              <IconUserCheck />
              {formatPercent(data.activos, data.total)}%
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            En gestión continua
          </div>
          <div className="text-muted-foreground">{formatNumber(data.leads)} siguen en etapa de lead</div>
        </CardFooter>
      </Card>
      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Origen webchat</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {formatNumber(data.webchat)}
          </CardTitle>
          <CardAction>
            <Badge variant="outline">
              <IconMessageCircle />
              {formatPercent(data.webchat, data.total)}%
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            Contactos creados desde el chat
          </div>
          <div className="text-muted-foreground">
            Incluye leads convertidos desde visitas
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
  });
  return formatter.format(date);
}
