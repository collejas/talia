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
      <Card className="@container/card border-emerald-300/50 shadow-sm">
        <CardHeader>
          <CardDescription>Email con más clicks</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {formatNumber(bestEmailByClicks?.brevo_clicks ?? 0)}
          </CardTitle>
          <CardAction>
            <Badge variant="outline" className={`${badgeClassName} min-w-0 max-w-[160px] whitespace-normal`}>
              <IconMail />
              {templateLabel(bestEmailByClicks)}
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className={footerTitleClassName}>
            Aperturas {formatNumber(bestEmailByClicks?.brevo_aperturas ?? 0)} · Entregados {formatNumber(bestEmailByClicks?.envios_entregados ?? 0)}
          </div>
          <div className={footerTextClassName}>{campaignLabel(bestEmailByClicks)}</div>
        </CardFooter>
      </Card>
      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Email con mejor apertura</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {formatPercent(percentage(bestEmailByOpenRate?.brevo_aperturas ?? 0, bestEmailByOpenRate?.envios_entregados ?? 0))}
          </CardTitle>
          <CardAction>
            <Badge variant="outline" className={`${badgeClassName} min-w-0 max-w-[160px] whitespace-normal`}>
              <IconChartBar />
              {templateLabel(bestEmailByOpenRate)}
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className={footerTitleClassName}>
            Aperturas {formatNumber(bestEmailByOpenRate?.brevo_aperturas ?? 0)} de {formatNumber(bestEmailByOpenRate?.envios_entregados ?? 0)}
          </div>
          <div className={footerTextClassName}>{campaignLabel(bestEmailByOpenRate)}</div>
        </CardFooter>
      </Card>
      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Email con más rebotes</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {formatNumber(emailBounceRisk?.envios_fallidos ?? 0)}
          </CardTitle>
          <CardAction>
            <Badge variant="outline" className={badgeClassName}>
              <IconAlertTriangle />
              Fallidos
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className={footerTitleClassName}>
            {templateLabel(emailBounceRisk)}
          </div>
          <div className={footerTextClassName}>{campaignLabel(emailBounceRisk)}</div>
        </CardFooter>
      </Card>
      <Card className="@container/card border-emerald-300/50 shadow-sm">
        <CardHeader>
          <CardDescription>Mejor plantilla WhatsApp</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {formatNumber(bestWhatsappByResponses?.envios_respondidos ?? 0)}
          </CardTitle>
          <CardAction>
            <Badge variant="outline" className={`${badgeClassName} min-w-0 max-w-[160px] whitespace-normal`}>
              <IconPhoneCall />
              {formatPercent(percentage(bestWhatsappByResponses?.envios_respondidos ?? 0, bestWhatsappByResponses?.envios_entregados ?? 0))}
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className={footerTitleClassName}>
            {templateLabel(bestWhatsappByResponses)}
          </div>
          <div className={footerTextClassName}>{campaignLabel(bestWhatsappByResponses)}</div>
        </CardFooter>
      </Card>
      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Enlace WA con más conversaciones</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {formatNumber(bestWhatsappLink?.conversaciones_atribuidas ?? 0)}
          </CardTitle>
          <CardAction>
            <Badge variant="outline" className={`${badgeClassName} min-w-0 max-w-[160px] whitespace-normal`}>
              <IconMessageCircle />
              {bestWhatsappLink?.canal_publicitario ?? "Sin canal"}
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className={footerTitleClassName}>
            {bestWhatsappLink?.regla_nombre || "Sin regla"}
          </div>
          <div className={footerTextClassName}>
            Oportunidades {formatNumber(bestWhatsappLink?.oportunidades_creadas ?? 0)}
          </div>
        </CardFooter>
      </Card>
      <Card className="@container/card border-emerald-300/50 shadow-sm">
        <CardHeader>
          <CardDescription>Enlace WA con más oportunidades</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {formatNumber(bestWhatsappOpportunityRule?.oportunidades_creadas ?? 0)}
          </CardTitle>
          <CardAction>
            <Badge variant="outline" className={badgeClassName}>
              <IconTargetArrow />
              {clickToSessionPct}% click→session
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className={footerTitleClassName}>
            {bestWhatsappOpportunityRule?.regla_nombre || "Sin regla"}
          </div>
          <div className={footerTextClassName}>
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

const badgeClassName = "h-6 px-2.5 text-[11px] font-semibold tracking-[0.01em]"
const footerTitleClassName = "line-clamp-1 flex gap-2 font-medium"
const footerTextClassName = "text-muted-foreground text-sm"
