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
};

export function DemografiaControls({ nivel, canales, etapas }: DemografiaControlsProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const normalizedCanales = React.useMemo(() => {
    if (!canales.length) return new Set(DEFAULT_CHANNELS);
    return new Set(canales);
  }, [canales]);

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
    router.replace(`/mapa-de-conversion?${params.toString()}`);
  }

  function handleNivelChange(value: string) {
    updateParams({
      nivel: value,
      estado: value === "municipio" ? searchParams.get("estado") : null,
    });
  }

  function toggleChannel(value: string) {
    const next = new Set(normalizedCanales);
    if (next.has(value)) {
      next.delete(value);
    } else {
      next.add(value);
    }

    const cleaned = Array.from(next);
    const final = cleaned.length ? cleaned.join(",") : DEFAULT_CHANNELS.join(",");

    updateParams({
      canales: final,
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

  return (
    <div className="px-4 lg:px-6">
      <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-card px-4 py-3 shadow-sm">
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

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="outline" size="sm" className="inline-flex items-center gap-2">
              <IconCurrencyDollar className="size-4" />
              Canales
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="z-50 w-[180px]">
            {CHANNEL_OPTIONS.map((item) => (
              <DropdownMenuCheckboxItem
                key={item.value}
                checked={normalizedCanales.has(item.value)}
                onCheckedChange={() => toggleChannel(item.value)}
              >
                {item.label}
              </DropdownMenuCheckboxItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuCheckboxItem
              checked={normalizedCanales.size === CHANNEL_OPTIONS.length}
              onCheckedChange={() => updateParams({ canales: DEFAULT_CHANNELS.join(",") })}
            >
              Seleccionar todos
            </DropdownMenuCheckboxItem>
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
      </div>
    </div>
  );
}
