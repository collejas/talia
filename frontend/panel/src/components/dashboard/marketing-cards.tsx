import {
  IconAlertTriangle,
  IconChartBar,
  IconMail,
  IconMessageCircle,
  IconPhoneCall,
  IconTargetArrow,
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
import type {
  ProspeccionCampanaItem,
  ProspeccionFraseByRule,
  ProspeccionMetricasSummary,
} from "@/lib/dashboard/prospeccion-kpis";

type MarketingCardsProps = {
  summary?: ProspeccionMetricasSummary | null;
  items?: ProspeccionCampanaItem[] | null;
  byRule?: ProspeccionFraseByRule[] | null;
};

export function MarketingCards({ summary, items, byRule }: MarketingCardsProps) {
  const allItems = items ?? [];
  const allRules = byRule ?? [];

  const bestEmailByClicks = topBy(
    allItems.filter((item) => normalizeChannel(item.canal) === "correo"),
    (item) => item.brevo_clicks,
  );
  const bestEmailByOpenRate = topBy(
    allItems.filter((item) => normalizeChannel(item.canal) === "correo" && item.envios_entregados > 0),
    (item) => percentage(item.brevo_aperturas, item.envios_entregados),
  );
  const emailBounceRisk = topBy(
    allItems.filter((item) => normalizeChannel(item.canal) === "correo"),
    (item) => item.envios_fallidos,
  );
  const bestWhatsappByResponses = topBy(
    allItems.filter((item) => normalizeChannel(item.canal) === "whatsapp"),
    (item) => item.envios_respondidos,
  );
  const bestWhatsappLink = topBy(allRules, (item) => item.conversaciones_atribuidas);
  const bestWhatsappOpportunityRule = topBy(
    allRules,
    (item) => item.oportunidades_creadas || item.monto_estimado_total,
  );

  const clickToSessionPct = Math.round(
    summary?.campanas?.brevo_clicks
      ? percentage(summary?.campanas?.sesiones_utm ?? 0, summary?.campanas?.brevo_clicks ?? 0)
      : 0,
  );

  return (
    <div className="*:data-[slot=card]:from-emerald-50/60 *:data-[slot=card]:to-card dark:*:data-[slot=card]:bg-card grid grid-cols-1 gap-4 px-4 *:data-[slot=card]:bg-gradient-to-t *:data-[slot=card]:shadow-xs lg:px-6 @xl/main:grid-cols-2 @5xl/main:grid-cols-3">
      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Mejor plantilla email por clicks</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {formatNumber(bestEmailByClicks?.brevo_clicks ?? 0)}
          </CardTitle>
          <CardAction>
            <Badge variant="outline" className="min-w-0 max-w-[160px] whitespace-normal text-xs leading-tight">
              <IconMail />
              {templateLabel(bestEmailByClicks)}
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            Aperturas {formatNumber(bestEmailByClicks?.brevo_aperturas ?? 0)} · Entregados {formatNumber(bestEmailByClicks?.envios_entregados ?? 0)}
          </div>
          <div className="text-muted-foreground">{campaignLabel(bestEmailByClicks)}</div>
        </CardFooter>
      </Card>
      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Mejor email por open rate</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {formatPercent(percentage(bestEmailByOpenRate?.brevo_aperturas ?? 0, bestEmailByOpenRate?.envios_entregados ?? 0))}
          </CardTitle>
          <CardAction>
            <Badge variant="outline" className="min-w-0 max-w-[160px] whitespace-normal text-xs leading-tight">
              <IconChartBar />
              {templateLabel(bestEmailByOpenRate)}
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            Aperturas {formatNumber(bestEmailByOpenRate?.brevo_aperturas ?? 0)} de {formatNumber(bestEmailByOpenRate?.envios_entregados ?? 0)}
          </div>
          <div className="text-muted-foreground">{campaignLabel(bestEmailByOpenRate)}</div>
        </CardFooter>
      </Card>
      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Riesgo de rebote email</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {formatNumber(emailBounceRisk?.envios_fallidos ?? 0)}
          </CardTitle>
          <CardAction>
            <Badge variant="outline">
              <IconAlertTriangle />
              Fallidos
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            {templateLabel(emailBounceRisk)}
          </div>
          <div className="text-muted-foreground">{campaignLabel(emailBounceRisk)}</div>
        </CardFooter>
      </Card>
      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Mejor plantilla WhatsApp</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {formatNumber(bestWhatsappByResponses?.envios_respondidos ?? 0)}
          </CardTitle>
          <CardAction>
            <Badge variant="outline" className="min-w-0 max-w-[160px] whitespace-normal text-xs leading-tight">
              <IconPhoneCall />
              {formatPercent(percentage(bestWhatsappByResponses?.envios_respondidos ?? 0, bestWhatsappByResponses?.envios_entregados ?? 0))}
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            {templateLabel(bestWhatsappByResponses)}
          </div>
          <div className="text-muted-foreground">{campaignLabel(bestWhatsappByResponses)}</div>
        </CardFooter>
      </Card>
      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Enlace WA con mayor alcance</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {formatNumber(bestWhatsappLink?.conversaciones_atribuidas ?? 0)}
          </CardTitle>
          <CardAction>
            <Badge variant="outline" className="min-w-0 max-w-[160px] whitespace-normal text-xs leading-tight">
              <IconMessageCircle />
              {bestWhatsappLink?.canal_publicitario ?? "Sin canal"}
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            {bestWhatsappLink?.regla_nombre || "Sin regla"}
          </div>
          <div className="text-muted-foreground">
            Oportunidades {formatNumber(bestWhatsappLink?.oportunidades_creadas ?? 0)}
          </div>
        </CardFooter>
      </Card>
      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Enlace WA con mejor conversión</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {formatNumber(bestWhatsappOpportunityRule?.oportunidades_creadas ?? 0)}
          </CardTitle>
          <CardAction>
            <Badge variant="outline">
              <IconTargetArrow />
              {clickToSessionPct}% click→session
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            {bestWhatsappOpportunityRule?.regla_nombre || "Sin regla"}
          </div>
          <div className="text-muted-foreground">
            Monto estimado {formatCurrency(bestWhatsappOpportunityRule?.monto_estimado_total ?? 0)}
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

function formatPercent(value: number | null | undefined): string {
  if (!value) return "0%";
  return `${Math.round(value)}%`;
}

function toNumber(value: number | null | undefined): number {
  if (!Number.isFinite(value ?? Number.NaN)) return 0;
  return Number(value);
}

function percentage(numerator: number, denominator: number): number {
  if (!denominator) return 0;
  return (numerator / denominator) * 100;
}

function topBy<T>(items: T[], getValue: (item: T) => number): T | null {
  if (!items.length) return null;
  let best: T | null = null;
  let bestValue = Number.NEGATIVE_INFINITY;
  for (const item of items) {
    const value = getValue(item);
    if (value > bestValue) {
      best = item;
      bestValue = value;
    }
  }
  return best;
}

function templateLabel(item: ProspeccionCampanaItem | null | undefined): string {
  if (!item) return "Sin datos";
  return item.template_nombre || item.template_slug || item.twilio_content_sid || "Sin plantilla";
}

function campaignLabel(item: ProspeccionCampanaItem | null | undefined): string {
  if (!item) return "Sin campaña";
  return item.campana_nombre || "Campaña sin nombre";
}

function normalizeChannel(value: string | null | undefined): string {
  return (value || "").trim().toLowerCase();
}
