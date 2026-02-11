"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type FilterOption = { id: string; label: string };

export type OportunidadesFilterOptions = {
  etapas: FilterOption[];
  estados: FilterOption[];
  asignados: FilterOption[];
  cuentas: FilterOption[];
  contactos: FilterOption[];
  canales: FilterOption[];
};

export type OportunidadesFiltersState = {
  q: string;
  etapaId: string;
  estado: string;
  asignadoId: string;
  cuentaId: string;
  contactoId: string;
  canal: string;
  montoMin: string;
  montoMax: string;
  cierreDesde: string;
  cierreHasta: string;
  creadoDesde: string;
  creadoHasta: string;
  reinicioMin: string;
};

const EMPTY_FILTERS: OportunidadesFiltersState = {
  q: "",
  etapaId: "all",
  estado: "all",
  asignadoId: "all",
  cuentaId: "all",
  contactoId: "all",
  canal: "all",
  montoMin: "",
  montoMax: "",
  cierreDesde: "",
  cierreHasta: "",
  creadoDesde: "",
  creadoHasta: "",
  reinicioMin: "",
};

export function OportunidadesFiltersClient({
  options,
  initial,
}: {
  options: OportunidadesFilterOptions;
  initial?: Partial<OportunidadesFiltersState>;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [filters, setFilters] = useState<OportunidadesFiltersState>({
    ...EMPTY_FILTERS,
    ...initial,
  });

  const isDirty = useMemo(() => {
    return JSON.stringify(filters) !== JSON.stringify({ ...EMPTY_FILTERS, ...initial });
  }, [filters, initial]);

  function updateFilter<K extends keyof OportunidadesFiltersState>(key: K, value: string) {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  function applyFilters() {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("q");
    params.delete("etapa_id");
    params.delete("estado");
    params.delete("asignado_id");
    params.delete("cuenta_id");
    params.delete("contacto_id");
    params.delete("canal");
    params.delete("monto_min");
    params.delete("monto_max");
    params.delete("cierre_desde");
    params.delete("cierre_hasta");
    params.delete("creado_desde");
    params.delete("creado_hasta");
    params.delete("reinicio_min");

    if (filters.q.trim()) params.set("q", filters.q.trim());
    if (filters.etapaId !== "all") params.set("etapa_id", filters.etapaId);
    if (filters.estado !== "all") params.set("estado", filters.estado);
    if (filters.asignadoId !== "all") params.set("asignado_id", filters.asignadoId);
    if (filters.cuentaId !== "all") params.set("cuenta_id", filters.cuentaId);
    if (filters.contactoId !== "all") params.set("contacto_id", filters.contactoId);
    if (filters.canal !== "all") params.set("canal", filters.canal);
    if (filters.montoMin) params.set("monto_min", filters.montoMin);
    if (filters.montoMax) params.set("monto_max", filters.montoMax);
    if (filters.cierreDesde) params.set("cierre_desde", filters.cierreDesde);
    if (filters.cierreHasta) params.set("cierre_hasta", filters.cierreHasta);
    if (filters.creadoDesde) params.set("creado_desde", filters.creadoDesde);
    if (filters.creadoHasta) params.set("creado_hasta", filters.creadoHasta);
    if (filters.reinicioMin) params.set("reinicio_min", filters.reinicioMin);

    router.push(`/oportunidades?${params.toString()}`);
  }

  function clearFilters() {
    setFilters({ ...EMPTY_FILTERS });
    const params = new URLSearchParams(searchParams.toString());
    Array.from(params.keys()).forEach((key) => {
      if (key !== "limit" && key !== "offset") {
        params.delete(key);
      }
    });
    router.push(`/oportunidades${params.toString() ? `?${params.toString()}` : ""}`);
  }

  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="space-y-1">
          <Label htmlFor="search">Búsqueda</Label>
          <Input
            id="search"
            placeholder="Buscar por título, contacto o cuenta"
            value={filters.q}
            onChange={(event) => updateFilter("q", event.target.value)}
          />
        </div>
        <SelectField
          label="Etapa"
          value={filters.etapaId}
          options={options.etapas}
          onChange={(value) => updateFilter("etapaId", value)}
        />
        <SelectField
          label="Estado"
          value={filters.estado}
          options={options.estados}
          onChange={(value) => updateFilter("estado", value)}
        />
        <SelectField
          label="Asignado"
          value={filters.asignadoId}
          options={options.asignados}
          onChange={(value) => updateFilter("asignadoId", value)}
        />
        <SelectField
          label="Cuenta"
          value={filters.cuentaId}
          options={options.cuentas}
          onChange={(value) => updateFilter("cuentaId", value)}
        />
        <SelectField
          label="Contacto"
          value={filters.contactoId}
          options={options.contactos}
          onChange={(value) => updateFilter("contactoId", value)}
        />
        <SelectField
          label="Canal"
          value={filters.canal}
          options={options.canales}
          onChange={(value) => updateFilter("canal", value)}
        />
        <NumberRangeField
          label="Monto"
          minValue={filters.montoMin}
          maxValue={filters.montoMax}
          onChange={(minValue, maxValue) => {
            updateFilter("montoMin", minValue);
            updateFilter("montoMax", maxValue);
          }}
        />
        <DateRangeField
          label="Cierre probable"
          fromValue={filters.cierreDesde}
          toValue={filters.cierreHasta}
          onChange={(fromValue, toValue) => {
            updateFilter("cierreDesde", fromValue);
            updateFilter("cierreHasta", toValue);
          }}
        />
        <DateRangeField
          label="Creado en"
          fromValue={filters.creadoDesde}
          toValue={filters.creadoHasta}
          onChange={(fromValue, toValue) => {
            updateFilter("creadoDesde", fromValue);
            updateFilter("creadoHasta", toValue);
          }}
        />
        <div className="space-y-1">
          <Label htmlFor="reinicioMin">Reinicio mínimo</Label>
          <Input
            id="reinicioMin"
            type="number"
            min={1}
            placeholder="1"
            value={filters.reinicioMin}
            onChange={(event) => updateFilter("reinicioMin", event.target.value)}
          />
        </div>
      </div>
      <div className="mt-4 flex items-center gap-2">
        <Button type="button" onClick={applyFilters}>
          Aplicar filtros
        </Button>
        <Button type="button" variant="outline" onClick={clearFilters} disabled={!isDirty}>
          Limpiar filtros
        </Button>
      </div>
    </div>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: FilterOption[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue placeholder="Todas" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todas</SelectItem>
          {options.map((option) => (
            <SelectItem key={option.id} value={option.id}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function NumberRangeField({
  label,
  minValue,
  maxValue,
  onChange,
}: {
  label: string;
  minValue: string;
  maxValue: string;
  onChange: (minValue: string, maxValue: string) => void;
}) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <div className="flex gap-2">
        <Input
          type="number"
          placeholder="Min"
          value={minValue}
          onChange={(event) => onChange(event.target.value, maxValue)}
        />
        <Input
          type="number"
          placeholder="Max"
          value={maxValue}
          onChange={(event) => onChange(minValue, event.target.value)}
        />
      </div>
    </div>
  );
}

function DateRangeField({
  label,
  fromValue,
  toValue,
  onChange,
}: {
  label: string;
  fromValue: string;
  toValue: string;
  onChange: (fromValue: string, toValue: string) => void;
}) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <div className="flex gap-2">
        <Input
          type="date"
          value={fromValue}
          onChange={(event) => onChange(event.target.value, toValue)}
        />
        <Input
          type="date"
          value={toValue}
          onChange={(event) => onChange(fromValue, event.target.value)}
        />
      </div>
    </div>
  );
}
