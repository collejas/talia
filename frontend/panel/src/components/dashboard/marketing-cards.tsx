import {
  IconChartBar,
  IconMail,
  IconMessageCircle,
  IconMouse,
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
import type { ProspeccionMetricasSummary, ProspeccionCampanaItem } from "@/lib/dashboard/prospeccion-kpis";

type MarketingCardsProps = {
  summary?: ProspeccionMetricasSummary | null;
  items?: ProspeccionCampanaItem[] | null;
};

export function MarketingCards({ summary, items }: MarketingCardsProps) {
  const campanas = summary?.campanas;
  const frases = summary?.frases_whatsapp;

  const canalTotals = aggregateByCanal(items ?? []);
  const correoEntregados = canalTotals.correo.entregados;
  const whatsappEntregados = canalTotals.whatsapp.entregados;
  const vozEntregados = canalTotals.llamada.entregados;

  const enviosTotales = toNumber(campanas?.envios_totales);
  const enviosEntregados = toNumber(campanas?.envios_entregados);
  const tasaEntrega = toPercent(campanas?.tasa_entrega_pct);
  const tasaRespuesta = toPercent(campanas?.tasa_respuesta_pct);
  const aperturas = toNumber(campanas?.brevo_aperturas);
  const clicks = toNumber(campanas?.brevo_clicks);
  const sesiones = toNumber(campanas?.sesiones_utm);
  const clickToSession = clicks > 0 ? Math.round((sesiones / clicks) * 100) : 0;

  const conversaciones = toNumber(frases?.conversaciones_atribuidas);
  const oportunidades = toNumber(frases?.oportunidades_creadas);
  const tasaConv = toPercent(frases?.tasa_conversacion_oportunidad_pct);
  const montoEstimado = toNumber(frases?.monto_estimado_total);

  return (
    <div className="*:data-[slot=card]:from-emerald-50/60 *:data-[slot=card]:to-card dark:*:data-[slot=card]:bg-card grid grid-cols-1 gap-4 px-4 *:data-[slot=card]:bg-gradient-to-t *:data-[slot=card]:shadow-xs lg:px-6 @xl/main:grid-cols-2 @5xl/main:grid-cols-4">
      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Envíos entregados</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {formatNumber(enviosEntregados)}
          </CardTitle>
          <CardAction>
            <Badge variant="outline">
              <IconMail />
              {tasaEntrega}% entrega
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            Envíos totales <IconMail className="size-4" />
          </div>
          <div className="text-muted-foreground">{formatNumber(enviosTotales)} en el periodo</div>
        </CardFooter>
      </Card>
      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Respuestas de campaña</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {tasaRespuesta}%
          </CardTitle>
          <CardAction>
            <Badge variant="outline">
              <IconChartBar />
              {formatNumber(campanas?.envios_respondidos ?? 0)} respuestas
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            Tasa de respuesta <IconChartBar className="size-4" />
          </div>
          <div className="text-muted-foreground">
            Aperturas {formatNumber(aperturas)} · Clicks {formatNumber(clicks)}
          </div>
        </CardFooter>
      </Card>
      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Entregados por canal</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {formatNumber(correoEntregados)}
          </CardTitle>
          <CardAction>
            <Badge variant="outline">
              <IconMail />
              Correo
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            WhatsApp {formatNumber(whatsappEntregados)} · Voz {formatNumber(vozEntregados)}
          </div>
          <div className="text-muted-foreground">Entregados por canal</div>
        </CardFooter>
      </Card>
      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Sesiones UTM</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {formatNumber(sesiones)}
          </CardTitle>
          <CardAction>
            <Badge variant="outline">
              <IconMouse />
              {clickToSession}% click→session
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            Atribución campañas <IconMouse className="size-4" />
          </div>
          <div className="text-muted-foreground">
            Clicks {formatNumber(clicks)} · Sesiones {formatNumber(sesiones)}
          </div>
        </CardFooter>
      </Card>
      <Card className="@container/card">
        <CardHeader>
          <CardDescription>WhatsApp atribuido</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {formatNumber(conversaciones)}
          </CardTitle>
          <CardAction>
            <Badge variant="outline">
              <IconMessageCircle />
              {tasaConv}% conv.
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            Oportunidades {formatNumber(oportunidades)} <IconMessageCircle className="size-4" />
          </div>
          <div className="text-muted-foreground">
            Monto estimado {formatCurrency(montoEstimado)}
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

function formatCurrency(value: number | null | undefined): string {
  if (!value) return "$0";
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  }).format(value);
}

function toNumber(value: number | null | undefined): number {
  if (!Number.isFinite(value ?? Number.NaN)) return 0;
  return Number(value);
}

function toPercent(value: number | null | undefined): number {
  if (!Number.isFinite(value ?? Number.NaN)) return 0;
  return Math.round(Number(value));
}

function aggregateByCanal(items: ProspeccionCampanaItem[]) {
  const totals = {
    correo: { entregados: 0 },
    whatsapp: { entregados: 0 },
    llamada: { entregados: 0 },
  };
  for (const item of items) {
    const canal = (item.canal || "").toLowerCase().trim();
    const delivered = Number(item.envios_entregados ?? 0);
    if (!Number.isFinite(delivered)) continue;
    if (canal === "correo") {
      totals.correo.entregados += delivered;
    } else if (canal === "whatsapp") {
      totals.whatsapp.entregados += delivered;
    } else if (canal === "llamada" || canal === "voz") {
      totals.llamada.entregados += delivered;
    }
  }
  return totals;
}
