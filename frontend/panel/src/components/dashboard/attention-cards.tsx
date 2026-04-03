import {
  IconClock,
  IconMessageCircle,
  IconMessageOff,
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
import type { DashboardKpis } from "@/lib/dashboard/kpis";

type AttentionCardsProps = {
  data?: DashboardKpis | null;
};

export function AttentionCards({ data }: AttentionCardsProps) {
  const conversacionesTotal = toNumber(data?.conversaciones?.total);
  const webchatTotal = toNumber(data?.conversaciones?.webchat_total);
  const canalesActivos = toNumber(data?.conversaciones?.canales_activos);
  const sinRespuestaTotal = toNumber(data?.conversaciones?.sin_respuesta_total);
  const abiertasTotal = toNumber(data?.conversaciones?.abiertas_total);
  const activas24h = toNumber(data?.conversaciones?.activas_24h);
  const porCanal = data?.conversaciones?.por_canal ?? {};
  const sinRespuestaPorCanal = data?.conversaciones?.sin_respuesta_por_canal ?? {};
  const whatsappTotal = toNumber(porCanal.whatsapp);
  const emailTotal = toNumber(porCanal.email ?? porCanal.correo ?? porCanal.manual);
  const vozTotal = toNumber(
    porCanal.voz ??
      porCanal.voice ??
      porCanal.llamada ??
      porCanal.call,
  );
  const otrosTotal = Math.max(
    0,
    conversacionesTotal - webchatTotal - whatsappTotal - vozTotal - emailTotal,
  );
  const unansweredPct = percentage(sinRespuestaTotal, conversacionesTotal);
  const sinRespuestaWhatsapp = toNumber(sinRespuestaPorCanal.whatsapp);
  const sinRespuestaEmail = toNumber(sinRespuestaPorCanal.email ?? sinRespuestaPorCanal.correo ?? sinRespuestaPorCanal.manual);
  const sinRespuestaVoz = toNumber(
    sinRespuestaPorCanal.voz ??
      sinRespuestaPorCanal.voice ??
      sinRespuestaPorCanal.llamada ??
      sinRespuestaPorCanal.call,
  );
  const avgResponse = toNumber(data?.tiempos_respuesta?.promedio);
  const maxResponse = toNumber(data?.tiempos_respuesta?.maximo);
  const responseByChannel = data?.tiempos_respuesta?.por_canal ?? {};
  const bestResponseChannel = pickBestResponseChannel(responseByChannel);
  const slowestResponseChannel = pickSlowestResponseChannel(responseByChannel);
  const conversion = data?.contactos?.desde_conversaciones;
  const conContactoTotal = toNumber(conversion?.con_contacto_total);
  const contactoCompletoTotal = toNumber(conversion?.contacto_completo_total);
  const conversionPct = percentage(contactoCompletoTotal, conversacionesTotal);
  const conversionByChannel = conversion?.por_canal ?? {};
  const bestConversionChannel = pickBestConversionChannel(conversionByChannel);

  return (
    <div className="*:data-[slot=card]:from-secondary/30 *:data-[slot=card]:to-card dark:*:data-[slot=card]:bg-card grid grid-cols-1 gap-4 px-4 *:data-[slot=card]:bg-gradient-to-t *:data-[slot=card]:shadow-xs md:grid-cols-2 lg:px-6">
      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Conversaciones</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {formatNumber(conversacionesTotal)}
          </CardTitle>
          <CardAction>
            <Badge variant="outline" className={badgeClassName}>
              <IconMessageCircle />
              Webchat {formatNumber(webchatTotal)}
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className={footerTitleClassName}>
            Distribución por canal <IconMessageCircle className="size-4" />
          </div>
          <div className={footerTextClassName}>
            {formatNumber(canalesActivos)} canales con actividad
          </div>
          <div className={footerTextClassName}>
            WhatsApp {formatNumber(whatsappTotal)} · Email {formatNumber(emailTotal)} · Voz {formatNumber(vozTotal)} · Otros {formatNumber(otrosTotal)}
          </div>
        </CardFooter>
      </Card>
      <Card className="@container/card border-secondary/30 shadow-sm">
        <CardHeader>
          <CardDescription>Sin respuesta</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {formatNumber(sinRespuestaTotal)}
          </CardTitle>
          <CardAction>
            <Badge variant="outline" className={badgeClassName}>
              <IconMessageOff />
              {formatPercent(unansweredPct)}
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className={footerTitleClassName}>
            Pendientes de atención <IconMessageOff className="size-4" />
          </div>
          <div className={footerTextClassName}>
            WhatsApp {formatNumber(sinRespuestaWhatsapp)} · Email {formatNumber(sinRespuestaEmail)} · Voz {formatNumber(sinRespuestaVoz)}
          </div>
          <div className={footerTextClassName}>
            {formatNumber(activas24h)} activas en 24h · {formatNumber(abiertasTotal)} abiertas
          </div>
        </CardFooter>
      </Card>
      <Card className="@container/card border-secondary/30 shadow-sm">
        <CardHeader>
          <CardDescription>Primera respuesta</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {formatDuration(avgResponse)}
          </CardTitle>
          <CardAction>
            <Badge variant="outline" className={badgeClassName}>
              <IconClock />
              Max {formatDuration(maxResponse)}
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className={footerTitleClassName}>
            Canal más ágil: {bestResponseChannel.label} <IconClock className="size-4" />
          </div>
          <div className={footerTextClassName}>
            {formatDuration(bestResponseChannel.seconds)} promedio
          </div>
          <div className={footerTextClassName}>
            Más lento: {slowestResponseChannel.label} · {formatDuration(slowestResponseChannel.seconds)}
          </div>
        </CardFooter>
      </Card>
      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Conversión a contacto</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {formatNumber(contactoCompletoTotal)}
          </CardTitle>
          <CardAction>
            <Badge variant="outline" className={badgeClassName}>
              <IconUserCheck />
              {formatPercent(conversionPct)}
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className={footerTitleClassName}>
            {formatNumber(conContactoTotal)} con contacto creado <IconUserCheck className="size-4" />
          </div>
          <div className={footerTextClassName}>
            Mejor canal: {bestConversionChannel.label}
          </div>
          <div className={footerTextClassName}>
            {formatPercent(bestConversionChannel.rate)} de conversaciones completas
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

function formatPercent(value: number | null | undefined): string {
  if (!value) return "0%";
  return `${Math.round(value)}%`;
}

function toNumber(value: number | null | undefined): number {
  if (!Number.isFinite(value ?? Number.NaN)) return 0;
  return Number(value);
}

function percentage(part: number, total: number): number {
  if (!total) return 0;
  return (part / total) * 100;
}

function normalizeChannelLabel(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (normalized === "whatsapp") return "WhatsApp";
  if (normalized === "webchat") return "Webchat";
  if (normalized === "email" || normalized === "correo" || normalized === "manual") return "Email";
  if (normalized === "voz" || normalized === "voice" || normalized === "llamada" || normalized === "call") return "Voz";
  return normalized ? normalized.charAt(0).toUpperCase() + normalized.slice(1) : "Sin datos";
}

function pickBestResponseChannel(
  source: Record<string, { promedio?: number | null } | undefined>,
): { label: string; seconds: number } {
  let best = { label: "Sin datos", seconds: 0 };
  for (const [channel, payload] of Object.entries(source)) {
    const seconds = toNumber(payload?.promedio);
    if (seconds <= 0) continue;
    if (best.seconds <= 0 || seconds < best.seconds) {
      best = { label: normalizeChannelLabel(channel), seconds };
    }
  }
  return best;
}

function pickSlowestResponseChannel(
  source: Record<string, { promedio?: number | null } | undefined>,
): { label: string; seconds: number } {
  let worst = { label: "Sin datos", seconds: 0 };
  for (const [channel, payload] of Object.entries(source)) {
    const seconds = toNumber(payload?.promedio);
    if (seconds <= 0) continue;
    if (seconds > worst.seconds) {
      worst = { label: normalizeChannelLabel(channel), seconds };
    }
  }
  return worst;
}

function pickBestConversionChannel(
  source: Record<
    string,
    { conversaciones?: number; con_contacto?: number; contacto_completo?: number } | undefined
  >,
): { label: string; rate: number } {
  let best = { label: "Sin datos", rate: 0 };
  for (const [channel, payload] of Object.entries(source)) {
    const rate = percentage(
      toNumber(payload?.contacto_completo),
      toNumber(payload?.conversaciones),
    );
    if (rate > best.rate) {
      best = { label: normalizeChannelLabel(channel), rate };
    }
  }
  return best;
}

const badgeClassName = "h-6 px-2.5 text-[11px] font-semibold tracking-[0.01em]"
const footerTitleClassName = "line-clamp-1 flex gap-2 font-medium"
const footerTextClassName = "text-muted-foreground text-sm"
