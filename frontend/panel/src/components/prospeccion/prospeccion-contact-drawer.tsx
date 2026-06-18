"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { IconExternalLink, IconLoader, IconUserPlus } from "@tabler/icons-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { canalLabel, contactHistoryDetail, contactStatusLabel, contactStatusVariant } from "@/lib/prospeccion/contact-utils";
import { getActiveTimeZone } from "@/lib/timezone";
import {
  listContactoEnviosPorProspecto,
  type ContactoEnvio,
  type ProspeccionOmitido,
  type ProspectoContactoResumen,
} from "@/lib/prospeccion/prospectos-client";
import { cn } from "@/lib/utils";

type TimelineMap = Record<string, ContactoEnvio[]>;
type TimelineLoadingState = Record<string, boolean>;
type TimelineErrorState = Record<string, string | null>;

export type ProspeccionContactResult = ProspectoContactoResumen & {
  display_name?: string | null;
};

export type ProspeccionContactDrawerData = {
  batchId?: string | null;
  results: ProspeccionContactResult[];
  omitidos?: ProspeccionOmitido[];
};

type ProspeccionContactDrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: ProspeccionContactDrawerData | null;
  onPromote?: (result: ProspeccionContactResult) => void;
};

export function ProspeccionContactDrawer({ open, onOpenChange, data, onPromote }: ProspeccionContactDrawerProps) {
  const results = useMemo(() => data?.results ?? [], [data]);
  const [selectedProspectId, setSelectedProspectId] = useState<string | null>(null);
  const [timelines, setTimelines] = useState<TimelineMap>({});
  const [timelineLoading, setTimelineLoading] = useState<TimelineLoadingState>({});
  const [timelineError, setTimelineError] = useState<TimelineErrorState>({});

  useEffect(() => {
    if (!open || !results.length) {
      setSelectedProspectId(null);
      return;
    }
    setSelectedProspectId(results[0].prospecto_id);
  }, [open, results]);

  const selectedResult = useMemo(
    () => results.find((item) => item.prospecto_id === selectedProspectId) ?? null,
    [results, selectedProspectId],
  );

  const loadTimeline = useCallback(async (prospectoId: string) => {
    setTimelineLoading((prev) => ({ ...prev, [prospectoId]: true }));
    setTimelineError((prev) => ({ ...prev, [prospectoId]: null }));
    try {
      const response = await listContactoEnviosPorProspecto(prospectoId, { limit: 50 });
      setTimelines((prev) => ({ ...prev, [prospectoId]: response.items ?? [] }));
    } catch (err) {
      const message = err instanceof Error ? err.message : "No se pudo cargar el historial del prospecto.";
      setTimelineError((prev) => ({ ...prev, [prospectoId]: message }));
    } finally {
      setTimelineLoading((prev) => ({ ...prev, [prospectoId]: false }));
    }
  }, []);

  useEffect(() => {
    if (!open || !selectedProspectId) return;
    if (timelines[selectedProspectId]) return;
    void loadTimeline(selectedProspectId);
  }, [loadTimeline, open, selectedProspectId, timelines]);

  if (!data) {
    return null;
  }

  const omitidosTotal =
    data.omitidos?.reduce((acc, item) => acc + (item.total ?? item.prospecto_ids.length ?? 0), 0) ?? 0;

  return (
    <Drawer open={open} onOpenChange={onOpenChange} direction="right">
      <DrawerContent className="data-[vaul-drawer-direction=right]:max-w-4xl">
        <DrawerHeader className="items-start space-y-2">
          <DrawerTitle>Campaña programada</DrawerTitle>
          <DrawerDescription>
            {data.batchId ? `Lote ${data.batchId}` : "Se creó un lote de contacto reciente."}
          </DrawerDescription>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span>{results.length} prospectos incluidos.</span>
            {omitidosTotal ? (
              <span className="text-amber-600 dark:text-amber-400">
                {omitidosTotal} prospectos convertidos se omitieron automáticamente.
              </span>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href="/prospeccion/contactos" className="inline-flex items-center gap-1">
                <IconExternalLink className="size-3.5" />
                Ver panel de lotes
              </Link>
            </Button>
            {data.batchId ? (
              <Button variant="ghost" size="sm" asChild>
                <Link href={`/prospeccion/contactos?batch=${data.batchId}`} className="inline-flex items-center gap-1">
                  <IconExternalLink className="size-3.5" />
                  Abrir lote {data.batchId.slice(0, 8)}
                </Link>
              </Button>
            ) : null}
          </div>
        </DrawerHeader>
        <Separator />
        <div className="grid gap-4 p-4 lg:grid-cols-[280px_1fr]">
          <div>
            <p className="text-xs font-semibold uppercase text-muted-foreground">Prospectos</p>
            <ScrollArea className="mt-2 h-[420px] pr-2">
              <div className="space-y-2">
                {results.map((result) => {
                  const isActive = result.prospecto_id === selectedProspectId;
                  return (
                    <button
                      type="button"
                      key={result.prospecto_id}
                      className={cn(
                        "w-full rounded-lg border px-3 py-2 text-left text-sm transition",
                        isActive ? "border-primary bg-primary/5" : "border-border hover:border-primary/60",
                      )}
                      onClick={() => setSelectedProspectId(result.prospecto_id)}
                    >
                      <div className="font-medium">{result.display_name || "Prospecto"}</div>
                      <p className="truncate text-xs text-muted-foreground">{result.prospecto_id}</p>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {(["correo", "whatsapp", "llamada"] as const).map((canal) => {
                          const estado = result[canal];
                          if (!estado) return null;
                          return (
                            <Badge key={canal} variant={contactStatusVariant(estado)}>
                              {canalLabel(canal)}: {contactStatusLabel(estado)}
                            </Badge>
                          );
                        })}
                      </div>
                    </button>
                  );
                })}
              </div>
            </ScrollArea>
          </div>

          <div className="min-h-[420px] rounded-lg border bg-muted/20 p-4">
            {!selectedResult ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
                Selecciona un prospecto para ver el detalle.
              </div>
            ) : (
              <ProspectTimelinePanel
                result={selectedResult}
                timeline={timelines[selectedResult.prospecto_id]}
                loading={timelineLoading[selectedResult.prospecto_id]}
                error={timelineError[selectedResult.prospecto_id]}
                onReload={() => loadTimeline(selectedResult.prospecto_id)}
                onPromote={onPromote ? () => onPromote(selectedResult) : undefined}
              />
            )}
          </div>
        </div>
        <DrawerFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}

type ProspectTimelinePanelProps = {
  result: ProspeccionContactResult;
  timeline?: ContactoEnvio[];
  loading?: boolean;
  error?: string | null;
  onReload: () => void;
  onPromote?: () => void;
};

function ProspectTimelinePanel({ result, timeline, loading, error, onReload, onPromote }: ProspectTimelinePanelProps) {
  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-base font-semibold">{result.display_name || "Prospecto"}</p>
          <p className="text-xs text-muted-foreground">{result.email || result.telefono || "Sin datos de contacto"}</p>
        </div>
        {onPromote ? (
          <Button size="sm" onClick={onPromote}>
            <IconUserPlus className="mr-2 size-4" />
            Promover a CRM
          </Button>
        ) : null}
      </div>
      <div className="space-y-1 text-xs text-muted-foreground">
        {result.segmento ? <p>Segmento: {result.segmento}</p> : null}
        {result.stage ? <p>Stage actual: {result.stage}</p> : null}
      </div>
      <Separator />
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
            <IconLoader className="size-4 animate-spin" />
            Cargando historial...
          </div>
        ) : error ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-sm text-destructive">
            <p>{error}</p>
            <Button variant="outline" size="sm" onClick={onReload}>
              Reintentar
            </Button>
          </div>
        ) : !timeline?.length ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Sin registros de contacto para este prospecto.
          </div>
        ) : (
          <ul className="space-y-3 text-sm">
            {timeline.map((envio) => (
              <li key={envio.id} className="rounded-md border bg-background p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Badge variant={contactStatusVariant(envio.estado)}>{contactStatusLabel(envio.estado)}</Badge>
                  <span className="text-xs text-muted-foreground">
                    {formatDate(envio.procesado_en || envio.programado_en)}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {canalLabel(envio.canal)} · {contactHistoryDetail(envio)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function formatDate(value?: string | null) {
  if (!value) return "Sin fecha";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sin fecha";
  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: getActiveTimeZone(),
  }).format(date);
}
