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

const CHANNEL_OPTIONS = [
  { value: "webchat", label: "Webchat" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "voz", label: "Voz" },
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
};

export function DemografiaControls({ nivel, canales, etapas, color }: DemografiaControlsProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

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

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border/60 bg-card/80 px-4 py-3 shadow-sm backdrop-blur">
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
    </div>
  );
}
