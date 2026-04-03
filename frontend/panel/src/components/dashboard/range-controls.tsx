"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type DashboardRangeControlsProps = {
  rango: string | null;
  desde: string | null;
  hasta: string | null;
};

const RANGE_OPTIONS = [
  { value: "hoy", label: "Hoy" },
  { value: "ayer", label: "Ayer" },
  { value: "semana", label: "Semana (7 días)" },
  { value: "quincena", label: "15 días" },
  { value: "30d", label: "Últimos 30 días" },
  { value: "bimestre", label: "Bimestre (60 días)" },
  { value: "trimestre", label: "Trimestre (90 días)" },
  { value: "semestre", label: "Semestre (180 días)" },
  { value: "ano", label: "Año (365 días)" },
  { value: "fechas", label: "Fechas manuales" },
];

export function DashboardRangeControls({
  rango,
  desde,
  hasta,
}: DashboardRangeControlsProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [desdeDraft, setDesdeDraft] = React.useState(desde ?? "");
  const [hastaDraft, setHastaDraft] = React.useState(hasta ?? "");

  React.useEffect(() => {
    setDesdeDraft(desde ?? "");
  }, [desde]);

  React.useEffect(() => {
    setHastaDraft(hasta ?? "");
  }, [hasta]);

  const currentRange = rango || "30d";

  const updateParams = (updates: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams?.toString());
    Object.entries(updates).forEach(([key, value]) => {
      if (!value) {
        next.delete(key);
      } else {
        next.set(key, value);
      }
    });
    const query = next.toString();
    router.replace(query ? `?${query}` : "?", { scroll: false });
  };

  const applyDates = () => {
    updateParams({
      rango: "fechas",
      desde: desdeDraft.trim() || null,
      hasta: hastaDraft.trim() || null,
    });
  };

  return (
    <div className="flex flex-wrap items-end gap-2 px-4 lg:px-6">
      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium uppercase text-muted-foreground">Rango</span>
        <Select
          value={currentRange}
          onValueChange={(value) => {
            const isCustom = value === "fechas";
            updateParams({
              rango: value,
              desde: isCustom ? (desdeDraft.trim() || null) : null,
              hasta: isCustom ? (hastaDraft.trim() || null) : null,
            });
          }}
        >
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Rango" />
          </SelectTrigger>
          <SelectContent className="z-50">
            {RANGE_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium uppercase text-muted-foreground">Desde</span>
        <Input
          type="date"
          value={desdeDraft}
          onChange={(event) => setDesdeDraft(event.target.value)}
          className="h-9 w-[160px]"
        />
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium uppercase text-muted-foreground">Hasta</span>
        <Input
          type="date"
          value={hastaDraft}
          onChange={(event) => setHastaDraft(event.target.value)}
          className="h-9 w-[160px]"
        />
      </div>
      <Button type="button" size="sm" variant="outline" onClick={applyDates}>
        Aplicar fechas
      </Button>
    </div>
  );
}
