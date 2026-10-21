"use client";

import { Badge } from "@/components/ui/badge";

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
}: PropertyProposalBuilderProps) {
  const operation = context?.operation;
  const unit = context?.unit;
  const price = operation?.precio_final
    ?? operation?.precio_acordado
    ?? operation?.precio_ofrecido
    ?? unit?.precio
    ?? 0;

  return (
    <div className="space-y-2 rounded-md border border-emerald-200 bg-emerald-50/60 p-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h4 className="text-sm font-semibold text-foreground">Propuesta inmobiliaria</h4>
          <p className="text-[11px] text-muted-foreground">
            La unidad y sus condiciones se toman de la operación inmobiliaria.
          </p>
        </div>
        <Badge variant="outline">Propiedades</Badge>
      </div>
      {loading ? <p className="text-xs text-muted-foreground">Cargando unidad...</p> : null}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
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
    </div>
  );
}
