"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  IconCurrencyDollar,
  IconFilter,
  IconMapPin,
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

const CHANNEL_OPTIONS = [
  { value: "webchat", label: "Webchat" },
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
  utmSourceOptions: string[];
  utmMediumOptions: string[];
  utmCampaignOptions: Array<{ value: string; label: string }>;
  campanaOptions: Array<{ value: string; label: string; canal?: string | null }>;
  campanaTipoOptions: string[];
  templateOptions: Array<{ value: string; label: string }>;
  rango: string | null;
  desde: string | null;
  hasta: string | null;
};

export function DemografiaControls({
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
  utmSourceOptions,
  utmMediumOptions,
  utmCampaignOptions,
  campanaOptions,
  campanaTipoOptions,
  templateOptions,
  rango,
  desde,
  hasta,
}: DemografiaControlsProps) {
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

  const formatCampanaTipoLabel = React.useCallback((value: string) => {
    const normalized = value.trim().toLowerCase();
    if (normalized === "whatsapp") return "WhatsApp";
    if (normalized === "correo") return "Correo";
    if (normalized === "llamada" || normalized === "voz") return "Llamada";
    return value;
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
    <div className="px-4 lg:px-6">
      <div className="kpi-surface flex flex-wrap items-center gap-3 px-4 py-3 backdrop-blur">
        <div className="flex items-center gap-2 text-sm font-medium text-card-foreground/80">
          <IconFilter className="size-4" />
          Filtros de demografía
        </div>

        <Select value={nivel} onValueChange={handleNivelChange}>
          <SelectTrigger className="w-[170px]">
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

        <DropdownMenu open={isChannelMenuOpen} onOpenChange={setChannelMenuOpen}>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="outline" size="sm" className="inline-flex items-center gap-2">
              <IconCurrencyDollar className="size-4" />
              Canales
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
                ? "Sin selección (se mostrarán todos los canales)"
                : channelDraft.size === CHANNEL_OPTIONS.length
                  ? "Mostrando todos los canales"
                  : `${channelDraft.size} canal${channelDraft.size === 1 ? "" : "es"} seleccionados`}
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

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              size="sm"
              variant={etapas.length ? "default" : "outline"}
              className="inline-flex items-center gap-2"
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

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Modo de color
          </span>
          <div className="inline-flex items-center gap-1">
            <Button
              type="button"
              size="sm"
              variant={color === "sequential" ? "default" : "outline"}
              onClick={() => updateParams({ color: null })}
            >
              Escala por volumen
            </Button>
            <Button
              type="button"
              size="sm"
              variant={color === "channel" ? "default" : "outline"}
              onClick={() => updateParams({ color: "channel" })}
            >
              Canal predominante
            </Button>
          </div>
        </div>

        <div className="space-y-1">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Origen de visita
          </p>
          <Select
            value={sourceClass ?? "all"}
            onValueChange={(value) => {
              updateParams({ source_class: value === "all" ? null : value });
            }}
          >
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder="Origen de visita" />
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

        <div className="space-y-1">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Origen de campana (utm_source)
          </p>
          <Select
            value={utmSource ?? "all"}
            onValueChange={(value) => {
              updateParams({ utm_source: value === "all" ? null : value });
            }}
          >
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder="Origen de campaña" />
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
            Tipo de medio (utm_medium)
          </p>
          <Select
            value={utmMedium ?? "all"}
            onValueChange={(value) => {
              updateParams({ utm_medium: value === "all" ? null : value });
            }}
          >
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder="Tipo de medio" />
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

        <div className="space-y-1">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Nombre de campana (utm_campaign)
          </p>
          <Select
            value={utmCampaign ?? "all"}
            onValueChange={(value) => {
              updateParams({ utm_campaign: value === "all" ? null : value });
            }}
          >
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder="Nombre de campaña" />
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

        <div className="space-y-1">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Tipo de campaña
          </p>
          <Select
            value={campanaTipo ?? "all"}
            onValueChange={(value) => {
              updateParams({ campana_tipo: value === "all" ? null : value, campana_id: null });
            }}
          >
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder="Tipo de campaña" />
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

        <div className="space-y-1">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Campaña
          </p>
          <Select
            value={campanaId ?? "all"}
            onValueChange={(value) => {
              updateParams({ campana_id: value === "all" ? null : value });
            }}
          >
            <SelectTrigger className="w-[240px]">
              <SelectValue placeholder="Campaña" />
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
            Plantilla captada
          </p>
          <Select
            value={templateId ?? "all"}
            onValueChange={(value) => {
              updateParams({ template_id: value === "all" ? null : value });
            }}
          >
            <SelectTrigger className="w-[240px]">
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

        <Button type="button" size="sm" variant="ghost" onClick={clearAttributionFilters}>
          Limpiar atribución
        </Button>

        <Select
          value={rango ?? "mes"}
          onValueChange={(value) => {
            const isCustom = value === "fechas";
            updateParams({
              rango: value,
              desde: isCustom ? (desdeDraft.trim() || null) : null,
              hasta: isCustom ? (hastaDraft.trim() || null) : null,
            });
          }}
        >
          <SelectTrigger className="w-[170px]">
            <SelectValue placeholder="Rango" />
          </SelectTrigger>
          <SelectContent className="z-50">
            <SelectItem value="hoy">Hoy</SelectItem>
            <SelectItem value="7d">Últimos 7 días</SelectItem>
            <SelectItem value="30d">Últimos 30 días</SelectItem>
            <SelectItem value="mes">Último mes</SelectItem>
            <SelectItem value="fechas">Rango personalizado</SelectItem>
          </SelectContent>
        </Select>
        <Input
          type="date"
          value={desdeDraft}
          onChange={(event) => setDesdeDraft(event.target.value)}
          className="h-8 w-[150px]"
        />
        <Input
          type="date"
          value={hastaDraft}
          onChange={(event) => setHastaDraft(event.target.value)}
          className="h-8 w-[150px]"
        />
        <Button type="button" size="sm" variant="outline" onClick={applyDateFilters}>
          Aplicar fechas
        </Button>
      </div>
    </div>
  );
}
