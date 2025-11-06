import type { CSSProperties } from "react";

import { AppSidebar } from "@/components/AppSidebar";
import { SessionRecovery } from "@/components/session-recovery";
import { SiteHeader } from "@/components/site-header";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ThemeToggle } from "@/components/ThemeToggle";
import { loadAgendaData } from "@/lib/agenda/data";

export const dynamic = "force-dynamic";

export default async function Page() {
  const agendaData = await loadAgendaData();
  const formattedMetrics = formatMetrics(agendaData.metrics);

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": "calc(var(--spacing) * 72)",
          "--header-height": "calc(var(--spacing) * 12)",
        } as CSSProperties
      }
    >
      <AppSidebar variant="inset" />
      <SidebarInset>
        <SiteHeader title="Agenda" />
        <div className="flex flex-1 flex-col">
          <div className="@container/main flex flex-1 flex-col gap-2">
            <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
              <SessionRecovery errors={agendaData.errors} />
              {agendaData.errors.length > 0 ? (
                <div className="px-4 lg:px-6">
                  <ErrorNotice errors={agendaData.errors} />
                </div>
              ) : null}
              <div className="px-4 lg:px-6">
                <MetricsOverview metrics={formattedMetrics} />
              </div>
              <div className="px-4 lg:px-6">
                <AgendaTable items={agendaData.items} />
              </div>
            </div>
          </div>
        </div>
      </SidebarInset>
      <ThemeToggle />
    </SidebarProvider>
  );
}

type ErrorNoticeProps = {
  errors: string[];
};

function ErrorNotice({ errors }: ErrorNoticeProps) {
  return (
    <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
      <p className="font-medium">No se pudieron cargar todos los datos:</p>
      <ul className="list-disc pl-5">
        {errors.map((message, index) => (
          <li key={index}>{sanitizeError(message)}</li>
        ))}
      </ul>
    </div>
  );
}

type MetricsOverviewProps = {
  metrics: ReturnType<typeof formatMetrics>;
};

function MetricsOverview({ metrics }: MetricsOverviewProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <Card>
        <CardHeader>
          <CardTitle>Total de citas</CardTitle>
          <CardDescription>Incluye todas las demos registradas en agenda.</CardDescription>
        </CardHeader>
        <CardContent className="text-3xl font-semibold">{metrics.total}</CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Activas</CardTitle>
          <CardDescription>Estado pendiente, confirmada o reprogramada.</CardDescription>
        </CardHeader>
        <CardContent className="text-3xl font-semibold">{metrics.activas}</CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Próximas 24h</CardTitle>
          <CardDescription>Eventos programados en las siguientes 24 horas.</CardDescription>
        </CardHeader>
        <CardContent className="text-3xl font-semibold">{metrics.proximas24h}</CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Canceladas / Realizadas</CardTitle>
          <CardDescription>Citas cerradas recientemente.</CardDescription>
        </CardHeader>
        <CardContent className="text-3xl font-semibold">
          <span>{metrics.canceladas}</span>
          <span className="text-muted-foreground text-base font-normal"> canceladas</span>
          <div className="text-muted-foreground text-base font-normal">
            {metrics.realizadas} realizadas
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

type AgendaTableProps = {
  items: Awaited<ReturnType<typeof loadAgendaData>>["items"];
};

function AgendaTable({ items }: AgendaTableProps) {
  if (!items.length) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No hay demos programadas</CardTitle>
          <CardDescription>
            Cuando Tal-IA o el equipo agenden una demo, aparecerá aquí con la información
            principal.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Demos programadas</CardTitle>
        <CardDescription>
          Consulta la fecha, estado y responsables de cada demo. Usa la vista Agenda para
          confirmar o reprogramar según la necesidad del prospecto.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-0 pb-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-[200px]">Contacto</TableHead>
              <TableHead className="min-w-[180px]">Fecha y hora</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Canal</TableHead>
              <TableHead>Asignado</TableHead>
              <TableHead>Notas</TableHead>
              <TableHead>Reunión</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => {
              const schedule = formatDateTime(item.startAt, item.timezone);
              const estado = formatEstado(item.estado);
              const estadoVariant = getEstadoVariant(item.estado);
              const providerLabel = formatProvider(item.provider);
              const canal = formatCanal(item.canal);
              const meetingHref = item.meetingUrl || item.externalJoinUrl || null;

              return (
                <TableRow key={item.id} className="align-top">
                  <TableCell className="space-y-1">
                    <div className="font-semibold">
                      {item.contactoNombre?.trim() || "Contacto sin nombre"}
                    </div>
                    <div className="text-muted-foreground text-xs">
                      {item.contactoCorreo?.trim() ||
                        item.contactoTelefono?.trim() ||
                        item.contactoEmpresa?.trim() ||
                        "—"}
                    </div>
                  </TableCell>
                  <TableCell className="space-y-1">
                    <div className="font-medium">{schedule.dateLabel}</div>
                    <div className="text-muted-foreground text-xs">
                      {schedule.timeLabel}
                      {item.timezone ? ` · ${item.timezone}` : null}
                    </div>
                  </TableCell>
                  <TableCell className="space-y-1">
                    <Badge variant={estadoVariant}>{estado}</Badge>
                    <div className="text-muted-foreground text-xs">
                      {item.reminderStatus ? `Recordatorio: ${item.reminderStatus}` : ""}
                    </div>
                  </TableCell>
                  <TableCell className="space-y-1">
                    <div className="font-medium">{providerLabel}</div>
                    {canal ? <div className="text-muted-foreground text-xs">{canal}</div> : null}
                    {item.scheduledVia ? (
                      <div className="text-muted-foreground text-xs">
                        Programada por {item.scheduledVia.toLowerCase()}
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell className="space-y-1">
                    <div className="font-medium">
                      {item.asignadoNombre || "Sin asignar"}
                    </div>
                    {item.propietarioNombre ? (
                      <div className="text-muted-foreground text-xs">
                        Propietario: {item.propietarioNombre}
                      </div>
                    ) : null}
                    {item.etapaNombre ? (
                      <div className="text-muted-foreground text-xs">{item.etapaNombre}</div>
                    ) : null}
                  </TableCell>
                  <TableCell className="max-w-[240px] space-y-1">
                    {item.notes ? (
                      <p className="text-sm leading-snug text-muted-foreground">
                        {item.notes}
                      </p>
                    ) : (
                      <span className="text-muted-foreground text-xs">Sin notas</span>
                    )}
                    {item.cancelReason ? (
                      <p className="text-xs text-destructive">
                        Motivo cancelación: {item.cancelReason}
                      </p>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    {meetingHref ? (
                      <a
                        href={meetingHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary text-sm font-medium hover:underline"
                      >
                        Abrir enlace
                      </a>
                    ) : (
                      <span className="text-muted-foreground text-xs">Pendiente</span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function sanitizeError(message: string): string {
  const trimmed = message.trim();
  if (trimmed.startsWith("<!DOCTYPE") || trimmed.startsWith("<html")) {
    return "El endpoint devolvió HTML en lugar de JSON (verifica la ruta o el proxy).";
  }
  if (/jwt\s+expired/i.test(trimmed)) {
    return "La sesión caducó; estamos intentando renovarla automáticamente.";
  }
  return trimmed;
}

function formatDateTime(value: string, timezone?: string | null): {
  dateLabel: string;
  timeLabel: string;
} {
  if (!value) {
    return { dateLabel: "Sin fecha", timeLabel: "" };
  }

  const tz = timezone && timezone.trim().length ? timezone : "UTC";
  try {
    const date = new Date(value);
    const dateLabel = new Intl.DateTimeFormat("es-MX", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: tz,
    }).format(date);

    const timeLabel = new Intl.DateTimeFormat("es-MX", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: tz,
    }).format(date);

    return {
      dateLabel: capitalize(dateLabel),
      timeLabel,
    };
  } catch {
    return { dateLabel: value, timeLabel: "" };
  }
}

function capitalize(value: string): string {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatEstado(value: string): string {
  const estado = value?.toLowerCase() ?? "pendiente";
  switch (estado) {
    case "pendiente":
      return "Pendiente";
    case "confirmada":
      return "Confirmada";
    case "reprogramada":
      return "Reprogramada";
    case "cancelada":
      return "Cancelada";
    case "realizada":
      return "Realizada";
    default:
      return capitalize(estado);
  }
}

function getEstadoVariant(
  estado: string,
): "default" | "secondary" | "destructive" | "outline" {
  const normalized = estado?.toLowerCase() ?? "pendiente";
  if (normalized === "cancelada") return "destructive";
  if (normalized === "realizada") return "default";
  if (normalized === "reprogramada" || normalized === "pendiente") return "secondary";
  return "default";
}

function formatProvider(provider: string): string {
  const normalized = provider?.toLowerCase() ?? "hosting";
  if (normalized === "google") return "Google Calendar";
  return "Agenda interna";
}

function formatCanal(canal: string | null | undefined): string | null {
  if (!canal) return null;
  const normalized = canal.toLowerCase();
  switch (normalized) {
    case "whatsapp":
      return "WhatsApp";
    case "webchat":
      return "Webchat";
    case "voz":
      return "Teléfono";
    case "instagram":
      return "Instagram";
    default:
      return capitalize(normalized);
  }
}

function formatMetrics(metrics: import("@/lib/agenda/data").AgendaMetrics) {
  const nf = new Intl.NumberFormat("es-MX");
  return {
    total: nf.format(metrics.total),
    activas: nf.format(metrics.activas),
    proximas24h: nf.format(metrics.proximas24h),
    canceladas: nf.format(metrics.canceladas),
    realizadas: nf.format(metrics.realizadas),
  };
}
