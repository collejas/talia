"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  IconCurrencyDollar,
  IconFilter,
  IconMapPin,
  IconMessageCircle,
  IconTimeline,
  IconWorld,
  IconBuildingCommunity,
} from "@tabler/icons-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { SOURCE_CLASS_OPTIONS } from "@/lib/mapa-conversion/source-class";
import { formatWaLabel } from "@/lib/visitas/formatting";
import { cn } from "@/lib/utils";

const CHANNEL_OPTIONS = [
  { value: "webchat", label: "Chat del sitio" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "voz", label: "Voz" },
  { value: "correo", label: "Correo" },
];

const DEFAULT_CHANNELS = CHANNEL_OPTIONS.map((item) => item.value);

const STAGE_OPTIONS = [
  { value: "captado", label: "Captado" },
  { value: "precalificado", label: "Precalificado" },
  { value: "negociacion", label: "Negociación" },
  { value: "ganado", label: "Ganado" },
  { value: "perdido", label: "Perdido" },
];

const DEFAULT_STAGES = STAGE_OPTIONS.map((item) => item.value);
type DemografiaControlsProps = {
  mode?: "overview" | "traffic" | "conversations" | "campaigns";
  nivel: "pais" | "estado" | "municipio";
  canales: string[];
  etapas: string[];
  color: "sequential" | "channel";
  sourceClass: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  campanaId: string | null;
  campanaTipo: string | null;
  templateId: string | null;
  waCanalPublicitario: string | null;
  waCampanaPublicitaria: string | null;
  waReglaId: string | null;
  utmSourceOptions: string[];
  utmMediumOptions: string[];
  utmCampaignOptions: Array<{ value: string; label: string }>;
  campanaOptions: Array<{ value: string; label: string; canal?: string | null }>;
  campanaTipoOptions: string[];
  templateOptions: Array<{ value: string; label: string }>;
  waCanalOptions: string[];
  waCampanaOptions: string[];
  waReglaOptions: Array<{
    value: string;
    label: string;
    canal_publicitario?: string | null;
    campana_publicitaria?: string | null;
  }>;
  rango: string | null;
  desde: string | null;
  hasta: string | null;
  className?: string;
};

export function DemografiaControls({
  mode = "overview",
  nivel,
  canales,
  etapas,
  color,
  sourceClass,
  utmSource,
  utmMedium,
  utmCampaign,
  campanaId,
  campanaTipo,
  templateId,
  waCanalPublicitario,
  waCampanaPublicitaria,
  waReglaId,
  utmSourceOptions,
  utmMediumOptions,
  utmCampaignOptions,
  campanaOptions,
  campanaTipoOptions,
  templateOptions,
  waCanalOptions,
  waCampanaOptions,
  waReglaOptions,
  rango,
  desde,
  hasta,
  className,
}: DemografiaControlsProps) {
  const showTrafficFilters = mode === "traffic";
  const showConversationFilters = mode === "conversations";
  const showCampaignFilters = mode === "campaigns";
  const router = useRouter();
  const searchParams = useSearchParams();
  const [desdeDraft, setDesdeDraft] = React.useState(desde ?? "");
  const [hastaDraft, setHastaDraft] = React.useState(hasta ?? "");

  const normalizedChannelsArray = React.useMemo(() => {
    const source = canales.length ? canales : DEFAULT_CHANNELS;
    return Array.from(
      new Set(
        source
          .map((value) => value.trim().toLowerCase())
          .filter((value) => value && DEFAULT_CHANNELS.includes(value)),
      ),
    );
  }, [canales]);
  const [channelDraft, setChannelDraft] = React.useState<Set<string>>(
    () => new Set(normalizedChannelsArray),
  );
  const [isChannelMenuOpen, setChannelMenuOpen] = React.useState(false);

  React.useEffect(() => {
    setChannelDraft(new Set(normalizedChannelsArray));
  }, [normalizedChannelsArray]);
  React.useEffect(() => {
    setDesdeDraft(desde ?? "");
  }, [desde]);
  React.useEffect(() => {
    setHastaDraft(hasta ?? "");
  }, [hasta]);

  const filteredCampanaOptions = React.useMemo(() => {
    if (!campanaTipo) return campanaOptions;
    const target = campanaTipo.trim().toLowerCase();
    return campanaOptions.filter((option) => {
      const canal = (option.canal || "").trim().toLowerCase();
      return canal === target || !canal;
    });
  }, [campanaOptions, campanaTipo]);

  const filteredWaReglaOptions = React.useMemo(() => {
    if (!waCanalPublicitario && !waCampanaPublicitaria) return waReglaOptions;
    const canalTarget = (waCanalPublicitario || "").trim().toLowerCase();
    const campanaTarget = (waCampanaPublicitaria || "").trim().toLowerCase();
    return waReglaOptions.filter((option) => {
      const canal = (option.canal_publicitario || "").trim().toLowerCase();
      const campana = (option.campana_publicitaria || "").trim().toLowerCase();
      if (canalTarget && canal && canal !== canalTarget) return false;
      if (campanaTarget && campana && campana !== campanaTarget) return false;
      return true;
    });
  }, [waCanalPublicitario, waCampanaPublicitaria, waReglaOptions]);

  const formatCampanaTipoLabel = React.useCallback((value: string) => {
    const normalized = value.trim().toLowerCase();
    if (normalized === "whatsapp") return "WhatsApp";
    if (normalized === "correo") return "Correo";
    if (normalized === "llamada" || normalized === "voz") return "Llamada";
    return value;
  }, []);
  const formatWaOptionLabel = React.useCallback((value: string) => {
    return formatWaLabel(value) ?? value;
  }, []);

  const normalizedStages = React.useMemo(() => {
    if (!etapas.length) return new Set(DEFAULT_STAGES);
    return new Set(
      etapas
        .map((value) => value.trim().toLowerCase())
        .filter((value) => value && DEFAULT_STAGES.includes(value)),
    );
  }, [etapas]);

  function updateParams(next: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value === null || value === undefined || value === "") {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    }
    router.replace(`/mapa-de-conversion?${params.toString()}`, { scroll: false });
  }

  function handleNivelChange(value: string) {
    updateParams({
      nivel: value,
      estado: value === "municipio" ? searchParams.get("estado") : null,
    });
  }

  function toggleChannel(value: string) {
    setChannelDraft((prev) => {
      const next = new Set(prev);
      if (next.has(value)) {
        next.delete(value);
      } else {
        next.add(value);
      }
      return next;
    });
  }

  function toggleStage(value: string) {
    const current = etapas.length
      ? new Set(
          etapas
            .map((item) => item.trim().toLowerCase())
            .filter((item) => item && DEFAULT_STAGES.includes(item)),
        )
      : new Set(DEFAULT_STAGES);

    if (current.has(value)) {
      current.delete(value);
    } else {
      current.add(value);
    }

    if (!current.size || current.size === DEFAULT_STAGES.length) {
      updateParams({ etapas: null });
      return;
    }

    const ordered = DEFAULT_STAGES.filter((stage) => current.has(stage));
    updateParams({
      etapas: ordered.join(","),
    });
  }

  function applyChannelFilter() {
    const values = Array.from(channelDraft)
      .filter((value) => DEFAULT_CHANNELS.includes(value))
      .sort();
    if (!values.length || values.length === DEFAULT_CHANNELS.length) {
      updateParams({ canales: null });
    } else {
      updateParams({ canales: values.join(",") });
    }
    setChannelMenuOpen(false);
  }

  function resetChannelFilter() {
    setChannelDraft(new Set(DEFAULT_CHANNELS));
    updateParams({ canales: null });
    setChannelMenuOpen(false);
  }

  function clearAttributionFilters() {
    updateParams({
      source_class: null,
      utm_source: null,
      utm_medium: null,
      utm_campaign: null,
      campana_id: null,
      campana_tipo: null,
      template_id: null,
      wa_canal_publicitario: null,
      wa_campana_publicitaria: null,
      wa_regla_id: null,
    });
  }

  function applyDateFilters() {
    const customRange = Boolean(desdeDraft.trim() || hastaDraft.trim());
    updateParams({
      rango: customRange ? "fechas" : rango || null,
      desde: desdeDraft.trim() || null,
      hasta: hastaDraft.trim() || null,
    });
  }

  return (
    <div className={cn("flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border bg-card/95 shadow-sm", className)}>
      <div className="border-b px-3 py-3 lg:px-4">
        <div className="flex items-center gap-2 text-sm font-medium text-card-foreground/80">
          <IconFilter className="size-4" />
          Filtros de esta vista
        </div>
      </div>
      <div className="flex flex-1 min-h-0 flex-col gap-3 overflow-y-auto px-3 py-3 lg:px-4">
        <div className={cn(
          "grid h-full gap-3 xl:items-stretch",
          mode === "overview" ? "xl:grid-cols-2" : "xl:grid-cols-3",
        )}>
          <section className="h-full rounded-2xl border bg-background/70 p-3 shadow-sm">
            <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <IconWorld className="size-4" />
              Vista general
            </div>
            <div className="grid gap-3">
              <div className="space-y-1">
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Alcance geográfico
                </p>
                <Select value={nivel} onValueChange={handleNivelChange}>
                  <SelectTrigger className="h-8 w-full">
                    <SelectValue placeholder="Nivel" />
                  </SelectTrigger>
                  <SelectContent className="z-50">
                    <SelectItem value="pais">
                      <div className="flex items-center gap-2">
                        <IconWorld className="size-4" />
                        País
                      </div>
                    </SelectItem>
                    <SelectItem value="estado">
                      <div className="flex items-center gap-2">
                        <IconMapPin className="size-4" />
                        Estado
                      </div>
                    </SelectItem>
                    <SelectItem value="municipio" disabled>
                      <div className="flex items-center gap-2">
                        <IconBuildingCommunity className="size-4" />
                        Municipio (clic en mapa)
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {mode !== "campaigns" ? <div className="space-y-1">
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Formas de contacto visibles
                </p>
                <DropdownMenu open={isChannelMenuOpen} onOpenChange={setChannelMenuOpen}>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 w-full justify-between"
                    >
                      <span className="inline-flex items-center gap-2">
                        <IconCurrencyDollar className="size-4" />
                        Formas
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        {channelDraft.size === 0
                          ? "Todos"
                          : `${channelDraft.size}/${CHANNEL_OPTIONS.length}`}
                      </span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="z-50 w-[220px]">
                    {CHANNEL_OPTIONS.map((item) => (
                      <DropdownMenuCheckboxItem
                        key={item.value}
                        checked={channelDraft.has(item.value)}
                        onSelect={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                        }}
                        onCheckedChange={() => toggleChannel(item.value)}
                      >
                        {item.label}
                      </DropdownMenuCheckboxItem>
                    ))}
                    <DropdownMenuSeparator />
                    <div className="px-2 pb-2 text-xs text-muted-foreground">
                      {channelDraft.size === 0
                        ? "Sin selección (se mostrarán todas las formas)"
                        : channelDraft.size === CHANNEL_OPTIONS.length
                          ? "Mostrando todas las formas"
                          : `${channelDraft.size} forma${channelDraft.size === 1 ? "" : "s"} seleccionada${channelDraft.size === 1 ? "" : "s"}`}
                    </div>
                    <div className="flex gap-2 px-2 pb-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="flex-1 text-xs"
                        onClick={resetChannelFilter}
                      >
                        Restablecer
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        className="flex-1 text-xs"
                        onClick={applyChannelFilter}
                      >
                        Aplicar
                      </Button>
                    </div>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div> : null}

              {mode === "conversations" || mode === "campaigns" ? <div className="space-y-1">
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Etapas de avance
                </p>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      size="sm"
                      variant={etapas.length ? "default" : "outline"}
                      className="h-8 w-full justify-start gap-2"
                    >
                      <IconTimeline className="size-4" />
                      Etapas
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="z-50 w-[200px]">
                    {STAGE_OPTIONS.map((item) => (
                      <DropdownMenuCheckboxItem
                        key={item.value}
                        checked={normalizedStages.has(item.value)}
                        onCheckedChange={() => toggleStage(item.value)}
                      >
                        {item.label}
                      </DropdownMenuCheckboxItem>
                    ))}
                    <DropdownMenuSeparator />
                    <DropdownMenuCheckboxItem
                      checked={normalizedStages.size === DEFAULT_STAGES.length}
                      onCheckedChange={() => updateParams({ etapas: null })}
                    >
                      Seleccionar todas
                    </DropdownMenuCheckboxItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div> : null}

              {mode !== "overview" ? <div className="space-y-1">
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Color del mapa
                </p>
                <div className="grid gap-2">
                  <Button
                    type="button"
                    size="sm"
                    className="h-8 w-full justify-start"
                    variant={color === "sequential" ? "default" : "outline"}
                    onClick={() => updateParams({ color: null })}
                  >
                    Escala por volumen
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className="h-8 w-full justify-start"
                    variant={color === "channel" ? "default" : "outline"}
                    onClick={() => updateParams({ color: "channel" })}
                  >
                    Canal predominante
                  </Button>
                </div>
              </div> : null}
            </div>
          </section>

          <section className="h-full rounded-2xl border bg-background/70 p-3 shadow-sm">
            <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <IconWorld className="size-4" />
              {mode === "traffic" ? "Tráfico web" : "Periodo"}
            </div>
            <div className="grid gap-3">
              {showTrafficFilters ? <>
              <div className="space-y-1">
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Tipo de visita
                </p>
                <Select
                  value={sourceClass ?? "all"}
                  onValueChange={(value) => {
                    updateParams({ source_class: value === "all" ? null : value });
                  }}
                >
                  <SelectTrigger className="h-8 w-full">
                    <SelectValue placeholder="Tipo de visita" />
                  </SelectTrigger>
                  <SelectContent className="z-50">
                    {SOURCE_CLASS_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-3 lg:grid-cols-2">
                <div className="space-y-1">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Origen de la visita
                  </p>
                  <Select
                    value={utmSource ?? "all"}
                    onValueChange={(value) => {
                      updateParams({ utm_source: value === "all" ? null : value });
                    }}
                  >
                    <SelectTrigger className="h-8 w-full">
                      <SelectValue placeholder="Origen de la visita" />
                    </SelectTrigger>
                    <SelectContent className="z-50">
                      <SelectItem value="all">Todos</SelectItem>
                      {utmSource && !utmSourceOptions.includes(utmSource) ? (
                        <SelectItem value={utmSource}>{utmSource}</SelectItem>
                      ) : null}
                      {utmSourceOptions.map((option) => (
                        <SelectItem key={`utm-source-${option}`} value={option}>
                          {option}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Cómo llegó
                  </p>
                  <Select
                    value={utmMedium ?? "all"}
                    onValueChange={(value) => {
                      updateParams({ utm_medium: value === "all" ? null : value });
                    }}
                  >
                    <SelectTrigger className="h-8 w-full">
                      <SelectValue placeholder="Cómo llegó" />
                    </SelectTrigger>
                    <SelectContent className="z-50">
                      <SelectItem value="all">Todos</SelectItem>
                      {utmMedium && !utmMediumOptions.includes(utmMedium) ? (
                        <SelectItem value={utmMedium}>{utmMedium}</SelectItem>
                      ) : null}
                      {utmMediumOptions.map((option) => (
                        <SelectItem key={`utm-medium-${option}`} value={option}>
                          {option}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1">
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Nombre de la promoción
                </p>
                <Select
                  value={utmCampaign ?? "all"}
                  onValueChange={(value) => {
                    updateParams({ utm_campaign: value === "all" ? null : value });
                  }}
                  >
                    <SelectTrigger className="h-8 w-full">
                      <SelectValue placeholder="Nombre de la promoción" />
                    </SelectTrigger>
                  <SelectContent className="z-50">
                    <SelectItem value="all">Todos</SelectItem>
                    {utmCampaign && !utmCampaignOptions.some((option) => option.value === utmCampaign) ? (
                      <SelectItem value={utmCampaign}>{utmCampaign}</SelectItem>
                    ) : null}
                    {utmCampaignOptions.map((option) => (
                      <SelectItem key={`utm-campaign-${option.value}`} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              </> : null}

              <div className="grid gap-3">
                <div className="space-y-1">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Periodo
                  </p>
                  <Select
                    value={rango ?? "ano_actual"}
                    onValueChange={(value) => {
                      const isCustom = value === "fechas";
                      updateParams({
                        rango: value,
                        desde: isCustom ? (desdeDraft.trim() || null) : null,
                        hasta: isCustom ? (hastaDraft.trim() || null) : null,
                      });
                    }}
                  >
                    <SelectTrigger className="h-8 w-full">
                      <SelectValue placeholder="Periodo" />
                    </SelectTrigger>
                    <SelectContent className="z-50" position="item-aligned" side="bottom" align="start" sideOffset={8}>
                      <SelectItem value="ano_actual">Año actual</SelectItem>
                      <SelectItem value="ano_anterior">Año anterior</SelectItem>
                      <SelectItem value="ultimos_365_dias">Últimos 365 días</SelectItem>
                      <SelectItem value="bimestre_actual">Bimestre actual</SelectItem>
                      <SelectItem value="trimestre_actual">Trimestre actual</SelectItem>
                      <SelectItem value="semestre_actual">Semestre actual</SelectItem>
                      <SelectItem value="7d">Últimos 7 días</SelectItem>
                      <SelectItem value="30d">Últimos 30 días</SelectItem>
                      <SelectItem value="hoy">Hoy</SelectItem>
                      <SelectItem value="ayer">Ayer</SelectItem>
                      <SelectItem value="mes">Último mes</SelectItem>
                      <SelectItem value="fechas">Rango personalizado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Fechas
                  </p>
                  <div className="grid gap-2">
                    <Input
                      type="date"
                      value={desdeDraft}
                      onChange={(event) => setDesdeDraft(event.target.value)}
                      className="h-8"
                    />
                    <Input
                      type="date"
                      value={hastaDraft}
                      onChange={(event) => setHastaDraft(event.target.value)}
                      className="h-8"
                    />
                  </div>
                </div>
              </div>

              <Button type="button" size="sm" variant="outline" onClick={applyDateFilters} className="h-8 w-full">
                Aplicar fechas
              </Button>
            </div>
          </section>

          {showConversationFilters || showCampaignFilters ? <section className="h-full rounded-2xl border bg-background/70 p-3 shadow-sm">
            <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <IconMessageCircle className="size-4" />
              {showCampaignFilters ? "Campañas" : "Conversaciones"}
            </div>
            <div className="grid gap-3">
              <div className="space-y-1">
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Tipo de promoción
                </p>
                <Select
                  value={campanaTipo ?? "all"}
                  onValueChange={(value) => {
                    updateParams({ campana_tipo: value === "all" ? null : value, campana_id: null });
                  }}
                >
                  <SelectTrigger className="h-8 w-full">
                    <SelectValue placeholder="Tipo de promoción" />
                  </SelectTrigger>
                  <SelectContent className="z-50">
                    <SelectItem value="all">Todos</SelectItem>
                    {campanaTipo && !campanaTipoOptions.includes(campanaTipo) ? (
                      <SelectItem value={campanaTipo}>{formatCampanaTipoLabel(campanaTipo)}</SelectItem>
                    ) : null}
                    {campanaTipoOptions.map((option) => (
                      <SelectItem key={`campana-tipo-${option}`} value={option}>
                        {formatCampanaTipoLabel(option)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-3 lg:grid-cols-2">
                <div className="space-y-1">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Promoción de prospección
                  </p>
                  <Select
                    value={campanaId ?? "all"}
                    onValueChange={(value) => {
                      updateParams({ campana_id: value === "all" ? null : value });
                    }}
                  >
                    <SelectTrigger className="h-8 w-full">
                      <SelectValue placeholder="Promoción de prospección" />
                    </SelectTrigger>
                    <SelectContent className="z-50">
                      <SelectItem value="all">Todas</SelectItem>
                      {campanaId && !campanaOptions.some((option) => option.value === campanaId) ? (
                        <SelectItem value={campanaId}>{campanaId}</SelectItem>
                      ) : null}
                      {filteredCampanaOptions.map((option) => (
                        <SelectItem key={`campana-${option.value}`} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Plantilla detectada
                  </p>
                  <Select
                    value={templateId ?? "all"}
                    onValueChange={(value) => {
                      updateParams({ template_id: value === "all" ? null : value });
                    }}
                  >
                    <SelectTrigger className="h-8 w-full">
                      <SelectValue placeholder="Plantilla" />
                    </SelectTrigger>
                    <SelectContent className="z-50">
                      <SelectItem value="all">Todas</SelectItem>
                      {templateId && !templateOptions.some((option) => option.value === templateId) ? (
                        <SelectItem value={templateId}>{templateId}</SelectItem>
                      ) : null}
                      {templateOptions.map((option) => (
                        <SelectItem key={`template-${option.value}`} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {showConversationFilters ? <>
              <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Canal de WhatsApp
                </p>
                  <Select
                    value={waCanalPublicitario ?? "all"}
                    onValueChange={(value) => {
                      updateParams({ wa_canal_publicitario: value === "all" ? null : value });
                    }}
                  >
                  <SelectTrigger className="h-8 w-full">
                      <SelectValue placeholder="Canal de WhatsApp" />
                    </SelectTrigger>
                    <SelectContent className="z-50">
                      <SelectItem value="all">Todos</SelectItem>
                      {waCanalPublicitario && !waCanalOptions.includes(waCanalPublicitario) ? (
                        <SelectItem value={waCanalPublicitario}>
                          {formatWaOptionLabel(waCanalPublicitario)}
                        </SelectItem>
                      ) : null}
                      {waCanalOptions.map((option) => (
                        <SelectItem key={`wa-canal-${option}`} value={option}>
                          {formatWaOptionLabel(option)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Promoción de WhatsApp
                  </p>
                  <Select
                    value={waCampanaPublicitaria ?? "all"}
                    onValueChange={(value) => {
                      updateParams({ wa_campana_publicitaria: value === "all" ? null : value });
                    }}
                  >
                  <SelectTrigger className="h-8 w-full">
                      <SelectValue placeholder="Promoción de WhatsApp" />
                    </SelectTrigger>
                    <SelectContent className="z-50">
                      <SelectItem value="all">Todas</SelectItem>
                      {waCampanaPublicitaria && !waCampanaOptions.includes(waCampanaPublicitaria) ? (
                        <SelectItem value={waCampanaPublicitaria}>
                          {formatWaOptionLabel(waCampanaPublicitaria)}
                        </SelectItem>
                      ) : null}
                      {waCampanaOptions.map((option) => (
                        <SelectItem key={`wa-campana-${option}`} value={option}>
                          {formatWaOptionLabel(option)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1">
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Regla de origen
                </p>
                <Select
                  value={waReglaId ?? "all"}
                  onValueChange={(value) => {
                    updateParams({ wa_regla_id: value === "all" ? null : value });
                  }}
                >
                  <SelectTrigger className="h-8 w-full">
                    <SelectValue placeholder="Regla de origen" />
                  </SelectTrigger>
                  <SelectContent className="z-50">
                    <SelectItem value="all">Todas</SelectItem>
                    {waReglaId && !waReglaOptions.some((option) => option.value === waReglaId) ? (
                      <SelectItem value={waReglaId}>{waReglaId}</SelectItem>
                    ) : null}
                    {filteredWaReglaOptions.map((option) => (
                      <SelectItem key={`wa-regla-${option.value}`} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              </> : null}

              <Button type="button" size="sm" variant="ghost" onClick={clearAttributionFilters} className="h-8">
                Limpiar filtros
              </Button>
            </div>
          </section> : null}
        </div>
      </div>
    </div>
  );
}
