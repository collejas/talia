"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { IconLoader2, IconSearch } from "@tabler/icons-react";
import { useEffect, useState } from "react";

export type PropertyProposalContext = {
  dominio_comercial: "productos_servicios" | "propiedades" | "mixto" | null;
  oportunidad?: {
    id: string;
    titulo: string | null;
    moneda: string;
    contacto_nombre: string | null;
    contacto_email: string | null;
    contacto_telefono: string | null;
  };
  operation: {
    id: string;
    unidad_id: string;
    estado: string;
    precio_ofrecido: number | null;
    precio_acordado: number | null;
    precio_final: number | null;
    moneda: string | null;
    apartado_vencimiento_en: string | null;
    apartado_iniciado_en: string | null;
    apartado_horas: number | null;
    fecha_limite_reserva: string | null;
    reserva_importe: number | null;
    condiciones_reserva: string | null;
    estado_validacion: string | null;
    forma_adquisicion: string | null;
    enviado_a_validacion_en: string | null;
  } | null;
  unit: {
    id: string;
    desarrollo_id: string | null;
    catalog_item_id: string | null;
    unidad: string | null;
    nombre: string | null;
    descripcion: string | null;
    status: string | null;
    precio: number | null;
    area_m2: number | null;
  } | null;
  development: {
    id: string;
    nombre: string;
    descripcion: string | null;
    tipo: string | null;
    status: string | null;
  } | null;
};

type PropertyProposalBuilderProps = {
  context: PropertyProposalContext | null;
  loading: boolean;
  error: string | null;
  currency: string;
  onSelectUnit: (unit: PropertyUnitOption) => void;
};

export type PropertyUnitOption = NonNullable<PropertyProposalContext["unit"]> & {
  desarrollo?: NonNullable<PropertyProposalContext["development"]> | null;
};

function formatCurrency(value: number, currency: string): string {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: currency || "MXN",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDate(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? value
    : new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short" }).format(parsed);
}

export function PropertyProposalBuilder({
  context,
  loading,
  error,
  currency,
  onSelectUnit,
}: PropertyProposalBuilderProps) {
  const [search, setSearch] = useState("");
  const [units, setUnits] = useState<PropertyUnitOption[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");
  const [pickerUnits, setPickerUnits] = useState<PropertyUnitOption[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [pickerError, setPickerError] = useState<string | null>(null);
  const operation = context?.operation;
  const unit = context?.unit;
  const price = operation?.precio_final
    ?? operation?.precio_acordado
    ?? operation?.precio_ofrecido
    ?? unit?.precio
    ?? 0;

  useEffect(() => {
    if (!search.trim()) {
      setUnits([]);
      setSearchLoading(false);
      setSearchError(null);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setSearchLoading(true);
      setSearchError(null);
      try {
        const params = new URLSearchParams({ limit: "5", query: search.trim() });
        const response = await fetch(`/api/crm/propiedad-unidades?${params.toString()}`, { cache: "no-store" });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(typeof payload?.error === "string" ? payload.error : "No se pudieron buscar unidades.");
        if (!cancelled) setUnits(Array.isArray(payload?.units) ? payload.units : []);
      } catch (requestError) {
        if (!cancelled) {
          setUnits([]);
          setSearchError(requestError instanceof Error ? requestError.message : "No se pudieron buscar unidades.");
        }
      } finally {
        if (!cancelled) setSearchLoading(false);
      }
    }, search.trim() ? 250 : 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [search]);

  useEffect(() => {
    if (!pickerOpen) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setPickerLoading(true);
      setPickerError(null);
      try {
        const params = new URLSearchParams({ limit: "50" });
        if (pickerSearch.trim()) params.set("query", pickerSearch.trim());
        const response = await fetch(`/api/crm/propiedad-unidades?${params.toString()}`, { cache: "no-store" });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(typeof payload?.error === "string" ? payload.error : "No se pudieron cargar las unidades.");
        if (!cancelled) setPickerUnits(Array.isArray(payload?.units) ? payload.units : []);
      } catch (requestError) {
        if (!cancelled) {
          setPickerUnits([]);
          setPickerError(requestError instanceof Error ? requestError.message : "No se pudieron cargar las unidades.");
        }
      } finally {
        if (!cancelled) setPickerLoading(false);
      }
    }, pickerSearch.trim() ? 250 : 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [pickerOpen, pickerSearch]);

  const isUnavailable = (status: string | null | undefined) =>
    new Set(["vendido", "cancelado", "inhabilitado", "no_disponible"]).has((status || "").toLowerCase());

  return (
    <div className="space-y-2 rounded-md border border-emerald-200 bg-emerald-50/60 p-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h4 className="text-sm font-semibold text-foreground">Propuesta inmobiliaria</h4>
          <p className="text-[11px] text-muted-foreground">
            Selecciona una unidad disponible o revisa la unidad ya vinculada.
          </p>
        </div>
        <Badge variant="outline">Propiedades</Badge>
      </div>
      {loading ? <p className="text-xs text-muted-foreground">Cargando unidad...</p> : null}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
      <div className="space-y-2 rounded-md border border-border/50 bg-background/70 p-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h5 className="text-xs font-semibold text-foreground">Unidades inmobiliarias</h5>
            <p className="text-[11px] text-muted-foreground">Busca una unidad o abre el listado completo.</p>
          </div>
          <Button type="button" size="sm" variant="outline" onClick={() => setPickerOpen(true)}>
            Seleccionar unidad
          </Button>
        </div>
        <div className="relative">
          <div className="flex items-center gap-2 rounded-md bg-muted/35 px-2">
            <IconSearch className="size-4 shrink-0 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar desarrollo, lote o unidad"
              className="h-8 border-0 bg-transparent px-0 shadow-none ring-0 focus-visible:ring-0"
            />
            {searchLoading ? <IconLoader2 className="size-4 animate-spin text-muted-foreground" /> : null}
          </div>
          {search.trim() && units.length ? (
            <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-md border border-border/40 bg-background shadow-sm">
              {units.map((option) => {
                const unavailable = isUnavailable(option.status);
                return (
                  <button
                    key={option.id}
                    type="button"
                    className="flex w-full items-start justify-between gap-3 px-3 py-2 text-left text-xs hover:bg-muted/40"
                    disabled={unavailable}
                    onClick={() => {
                      onSelectUnit(option);
                      setSearch("");
                    }}
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium">
                        {option.desarrollo?.nombre || "Sin desarrollo"} · {option.nombre || option.unidad || "Unidad"}
                      </span>
                      <span className="block truncate text-[10px] text-muted-foreground">
                        {option.descripcion || "Sin descripción"}
                      </span>
                    </span>
                    <span className="shrink-0 text-right text-[10px] text-muted-foreground">
                      <span className="block">{option.status || "sin estado"}</span>
                      <span className="block font-medium text-foreground">
                        {option.precio != null ? formatCurrency(option.precio, currency) : "Sin precio"}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
        {searchError ? <p className="text-[11px] text-destructive">{searchError}</p> : null}
        {!searchLoading && !searchError && search.trim() && units.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">No encontramos unidades con esa búsqueda.</p>
        ) : null}
      </div>
      {context?.development || unit ? (
        <div className="grid gap-1 text-xs sm:grid-cols-2">
          <span><strong>Desarrollo:</strong> {context?.development?.nombre || "Sin desarrollo"}</span>
          <span><strong>Unidad:</strong> {unit?.nombre || unit?.unidad || "Sin unidad"}</span>
          <span><strong>Estado:</strong> {unit?.status || operation?.estado || "Sin estado"}</span>
          <span><strong>Área:</strong> {unit?.area_m2 != null ? `${unit.area_m2} m²` : "Sin área"}</span>
          <span><strong>Precio vigente:</strong> {formatCurrency(price, operation?.moneda || currency)}</span>
          <span><strong>Operación:</strong> {operation?.estado || "Sin operación"}</span>
          {operation?.reserva_importe != null ? (
            <span><strong>Importe de apartado:</strong> {formatCurrency(operation.reserva_importe, operation.moneda || currency)}</span>
          ) : null}
          {operation?.forma_adquisicion ? <span><strong>Adquisición:</strong> {operation.forma_adquisicion}</span> : null}
          {(operation?.fecha_limite_reserva || operation?.apartado_vencimiento_en) ? (
            <span><strong>Apartado vence:</strong> {formatDate(operation.fecha_limite_reserva || operation.apartado_vencimiento_en || "")}</span>
          ) : null}
        </div>
      ) : null}
      {operation?.estado === "apartado" ? (
        <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-900">
          La unidad está apartada. El precio y las condiciones se toman de la operación inmobiliaria.
        </p>
      ) : null}
      <Dialog
        open={pickerOpen}
        onOpenChange={(openState) => {
          setPickerOpen(openState);
          if (!openState) {
            setPickerSearch("");
            setPickerError(null);
          }
        }}
      >
        <DialogContent className="flex h-[84vh] w-[92vw] max-w-[92vw] flex-col overflow-hidden p-0">
          <div className="border-b border-border/50 px-3 py-2.5">
            <DialogTitle className="text-base font-semibold">Unidades inmobiliarias</DialogTitle>
            <DialogDescription className="text-xs">
              Selecciona una unidad disponible para agregarla a la propuesta inmobiliaria.
            </DialogDescription>
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-3 px-3 py-3">
            <div className="flex items-center gap-2 rounded-md bg-muted/35 px-2">
              <IconSearch className="size-4 shrink-0 text-muted-foreground" />
              <Input
                value={pickerSearch}
                onChange={(event) => setPickerSearch(event.target.value)}
                placeholder="Buscar desarrollo, lote o unidad"
                className="h-8 border-0 bg-transparent px-0 shadow-none ring-0 focus-visible:ring-0"
              />
              {pickerLoading ? <IconLoader2 className="size-4 animate-spin text-muted-foreground" /> : null}
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setPickerSearch("")}
                disabled={!pickerSearch.length}
              >
                Limpiar
              </Button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto rounded-md bg-muted/20">
              {pickerError ? (
                <p className="px-3 py-2 text-xs text-destructive">{pickerError}</p>
              ) : pickerLoading ? (
                <p className="px-3 py-2 text-xs text-muted-foreground">Cargando unidades…</p>
              ) : pickerUnits.length === 0 ? (
                <p className="px-3 py-2 text-xs text-muted-foreground">
                  {pickerSearch ? "Sin resultados para tu búsqueda." : "No hay unidades disponibles."}
                </p>
              ) : (
                pickerUnits.map((option) => {
                  const unavailable = isUnavailable(option.status);
                  return (
                    <button
                      key={option.id}
                      type="button"
                      className="flex w-full items-start justify-between gap-3 border-b border-border/40 px-3 py-2 text-left text-xs last:border-b-0 hover:bg-muted/40 disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={unavailable}
                      onClick={() => {
                        onSelectUnit(option);
                        setPickerOpen(false);
                      }}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">
                          {option.desarrollo?.nombre || "Sin desarrollo"} · {option.nombre || option.unidad || "Unidad"}
                        </span>
                        <span className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">
                          {option.descripcion || "Sin descripción"}
                        </span>
                      </span>
                      <span className="shrink-0 text-right text-[10px] text-muted-foreground">
                        <span className="block">{option.status || "sin estado"}</span>
                        <span className="block font-medium text-foreground">
                          {option.precio != null ? formatCurrency(option.precio, currency) : "Sin precio"}
                        </span>
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>
          <div className="flex justify-end border-t border-border/50 px-3 py-2.5">
            <Button type="button" variant="ghost" onClick={() => setPickerOpen(false)}>Cancelar</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
