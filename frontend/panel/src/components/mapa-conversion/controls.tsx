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

  const hasCaptadoPlus = React.useMemo(() => {
    if (!etapas.length) return false;
    return etapas.some((value) => value.trim().toLowerCase() === "captado_plus");
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

  function toggleEtapasCaptadoPlus() {
    updateParams({
      etapas: hasCaptadoPlus ? null : "captado_plus",
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

        <Button
          type="button"
          size="sm"
          variant={hasCaptadoPlus ? "default" : "outline"}
          className="inline-flex items-center gap-2"
          onClick={toggleEtapasCaptadoPlus}
        >
          <IconTimeline className="size-4" />
          Desde captado
        </Button>
      </div>
    </div>
  );
}
