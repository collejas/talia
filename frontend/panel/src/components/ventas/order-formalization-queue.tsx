"use client";

import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type QueueItem = {
  id: string;
  cotizacion_id: string;
  folio: string | null;
  oportunidad_titulo: string | null;
  cliente: string | null;
  contacto: string | null;
  total: number | string | null;
  moneda: string | null;
  enviado_en: string | null;
  forma_confirmacion: string | null;
  fecha_confirmacion_cliente: string | null;
  referencia_pedido_cliente: string | null;
  fecha_orden_cliente: string | null;
  observaciones_confirmacion: string | null;
  condicion_pago: string | null;
  dias_credito: number | null;
  anticipo_porcentaje: number | string | null;
  permite_entrega_parcial: boolean;
  fecha_entrega_comprometida: string | null;
  domicilio_entrega: string | null;
  observaciones_comerciales: string | null;
  cliente_datos: Record<string, string | null>;
  items: { id: string; catalog_item_id: string | null; descripcion: string; cantidad: number | string; precio_unitario: number | string | null; subtotal: number | string | null; moneda: string | null; maneja_inventario: boolean; stock_disponible: number | string | null; stock_reservado_pedido: number | string | null; cotizacion_cantidad: number | string | null; cotizacion_precio_unitario: number | string | null; cotizacion_descuento_porcentaje: number | string | null; cotizacion_limite_descuento_porcentaje: number | string | null; cotizacion_moneda: string | null; cotizacion_catalog_item_id: string | null }[];
  documentos: { id: string; tipo_documento: string; nombre_original: string | null; referencia: string | null; observaciones: string | null }[];
};

function ReviewBlock({
  title,
  label,
  checked,
  onCheckedChange,
  disabled,
  children,
}: {
  title: string;
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled: boolean;
  children: ReactNode;
}) {
  return (
    <fieldset className="space-y-2 rounded-lg border bg-muted/20 p-3">
      <legend className="px-1 text-sm font-medium">{title}</legend>
      <div className="space-y-1 text-sm">{children}</div>
      <label className="flex items-start gap-2 border-t pt-2 text-sm">
        <input type="checkbox" checked={checked} onChange={(event) => onCheckedChange(event.target.checked)} disabled={disabled} />
        <span>{label}</span>
      </label>
    </fieldset>
  );
}

type ReviewChecklist = { cliente: boolean; evidencia: boolean; partidas: boolean; inventario: boolean; condiciones: boolean; riesgos: boolean };

const RETURN_REASONS = [
  ["falta_evidencia", "Falta evidencia de aceptación"],
  ["oc_no_coincide", "La orden de compra no coincide"],
  ["precio_incorrecto", "Precio incorrecto"],
  ["descuento_no_autorizado", "Descuento no autorizado"],
  ["datos_cliente_incompletos", "Datos del cliente incompletos"],
  ["partidas_incorrectas", "Partidas o cantidades incorrectas"],
  ["condiciones_incompletas", "Condiciones comerciales incompletas"],
  ["problema_inventario", "Problema de inventario"],
  ["otro", "Otro"],
] as const;

const CONFIRMATION_LABELS: Record<string, string> = {
  orden_compra: "Orden de compra",
  cotizacion_firmada_aceptada: "Cotización firmada o aceptada",
  correo_electronico: "Correo electrónico",
  whatsapp: "WhatsApp",
  contrato: "Contrato",
  confirmacion_verbal: "Confirmación verbal",
  anticipo_pago: "Anticipo o pago",
  otro: "Otro",
};

function formatMoney(amount: number | string | null, currency: string | null) {
  if (amount == null || !Number.isFinite(Number(amount))) return "—";
  try {
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: currency || "MXN",
      maximumFractionDigits: 2,
    }).format(Number(amount));
  } catch {
    return `${amount} ${currency || "MXN"}`;
  }
}

function differsFromAcceptedQuote(item: QueueItem["items"][number]) {
  const quantityDiffers = item.cotizacion_cantidad != null && Number(item.cotizacion_cantidad) !== Number(item.cantidad);
  const priceDiffers = item.cotizacion_precio_unitario != null
    && Math.abs(Number(item.cotizacion_precio_unitario) - Number(item.precio_unitario)) > 0.01;
  const currencyDiffers = item.cotizacion_moneda != null && item.cotizacion_moneda !== item.moneda;
  const productDiffers = item.cotizacion_catalog_item_id !== item.catalog_item_id;
  return quantityDiffers || priceDiffers || currencyDiffers || productDiffers;
}

function hasBlockingIssues(item: QueueItem) {
  return item.items.some((line) => differsFromAcceptedQuote(line)
    || (line.cotizacion_descuento_porcentaje != null
      && line.cotizacion_limite_descuento_porcentaje != null
      && Number(line.cotizacion_descuento_porcentaje) > Number(line.cotizacion_limite_descuento_porcentaje)))
    || (!item.permite_entrega_parcial && item.items.some((line) => line.maneja_inventario
      && Number(line.stock_disponible ?? 0) < Number(line.cantidad)));
}

export function OrderFormalizationQueue() {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [returningId, setReturningId] = useState<string | null>(null);
  const [returnReason, setReturnReason] = useState("");
  const [returnCode, setReturnCode] = useState<(typeof RETURN_REASONS)[number][0]>("otro");
  const [reviews, setReviews] = useState<Record<string, ReviewChecklist>>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadQueue = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/ventas/pedidos/formalizacion?limit=50&offset=0", { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || "No se pudo cargar la bandeja de pedidos.");
      setItems(Array.isArray(body?.items) ? body.items as QueueItem[] : []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "No se pudo cargar la bandeja.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadQueue(); }, [loadQueue]);

  const confirmOrder = async (item: QueueItem) => {
    if (hasBlockingIssues(item)) {
      setError("El pedido tiene un bloqueo visible. Devuélvelo a Comercial para corregir la cotización o revisa el inventario.");
      return;
    }
    const review = reviews[item.id] ?? { cliente: false, evidencia: false, partidas: false, inventario: false, condiciones: false, riesgos: false };
    if (Object.values(review).some((checked) => !checked)) {
      setError("Completa las seis revisiones antes de aprobar y liberar el pedido.");
      return;
    }
    setPendingId(item.id);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`/api/ventas/pedidos/${item.id}/aprobar-liberar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          revision_cliente_validada: review.cliente,
          revision_evidencia_validada: review.evidencia,
          revision_partidas_validada: review.partidas,
          revision_inventario_validada: review.inventario,
          revision_condiciones_validada: review.condiciones,
          revision_riesgos_validada: review.riesgos,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || "No se pudo confirmar el pedido.");
      setNotice(`Pedido ${item.folio || "del cliente"} aprobado y liberado a surtido. Venta y cuenta por cobrar formalizadas.`);
      await loadQueue();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "No se pudo confirmar el pedido.");
    } finally {
      setPendingId(null);
    }
  };

  const returnOrder = async (item: QueueItem) => {
    const reason = returnReason.trim();
    if (!reason) {
      setError("Escribe qué debe corregir Comercial antes de devolver el pedido.");
      return;
    }
    setPendingId(item.id);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`/api/ventas/pedidos/${item.id}/devolver`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ codigo_motivo: returnCode, motivo: reason }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || "No se pudo devolver el pedido.");
      setNotice(`Pedido ${item.folio || "del cliente"} devuelto a Comercial para corrección.`);
      setReturningId(null);
      setReturnReason("");
      setReturnCode("otro");
      await loadQueue();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "No se pudo devolver el pedido.");
    } finally {
      setPendingId(null);
    }
  };

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">Revisa cliente, aceptación, partidas, inventario, condiciones y alertas. La aprobación formaliza la venta y la cuenta por cobrar y libera lo reservado a Surtidos.</p>
        </div>
        <Button type="button" variant="outline" onClick={() => void loadQueue()} disabled={loading}>
          {loading ? "Actualizando…" : "Actualizar"}
        </Button>
      </div>
      {error ? <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p> : null}
      {notice ? <p role="status" className="rounded-md bg-primary/10 px-3 py-2 text-sm">{notice}</p> : null}
      {loading && items.length === 0 ? <p className="text-sm text-muted-foreground">Cargando pedidos…</p> : null}
      {!loading && items.length === 0 && !error ? (
        <div className="rounded-xl border border-dashed p-8 text-center">
          <h2 className="font-semibold">No hay pedidos pendientes</h2>
          <p className="mt-1 text-sm text-muted-foreground">Los pedidos que Comercial envíe aparecerán aquí para revisión.</p>
        </div>
      ) : null}
      <div className="space-y-3">
        {items.map((item) => (
          <article key={item.id} className="space-y-4 rounded-xl border bg-card p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold">{item.folio || item.oportunidad_titulo || "Pedido por formalizar"}</h2>
                <p className="text-sm text-muted-foreground">{item.cliente || item.contacto || "Cliente sin nombre"}</p>
                {item.contacto && item.cliente ? <p className="text-xs text-muted-foreground">Contacto: {item.contacto}</p> : null}
              </div>
              <div className="text-right">
                <p className="font-semibold">{formatMoney(item.total, item.moneda)}</p>
                <Badge variant="secondary">Pendiente de revisión</Badge>
              </div>
            </div>
            <div className="grid gap-3 text-sm lg:grid-cols-2">
              <ReviewBlock title="1. Cliente" label="Revisé la identidad y los datos disponibles del cliente" checked={reviews[item.id]?.cliente ?? false} onCheckedChange={(checked) => setReviews((current) => ({ ...current, [item.id]: { ...(current[item.id] ?? { cliente: false, evidencia: false, partidas: false, inventario: false, condiciones: false, riesgos: false }), cliente: checked } }))} disabled={pendingId === item.id}>
                <p>{item.cliente || item.contacto || "Sin nombre registrado"}</p>
                <p className="text-muted-foreground">Razón social: {item.cliente_datos.razon_social || "No registrada"} · RFC: {item.cliente_datos.rfc || "No registrado"}</p>
                <p className="text-muted-foreground">Correo de facturación: {item.cliente_datos.correo_facturacion || "No registrado"} · C.P.: {item.cliente_datos.codigo_postal || "No registrado"}</p>
              </ReviewBlock>
              <ReviewBlock title="2. Confirmación y evidencia" label="Revisé la forma de aceptación y su evidencia" checked={reviews[item.id]?.evidencia ?? false} onCheckedChange={(checked) => setReviews((current) => ({ ...current, [item.id]: { ...(current[item.id] ?? { cliente: false, evidencia: false, partidas: false, inventario: false, condiciones: false, riesgos: false }), evidencia: checked } }))} disabled={pendingId === item.id}>
                <p>{CONFIRMATION_LABELS[item.forma_confirmacion || ""] || "Forma no registrada"} · {item.fecha_confirmacion_cliente || "Fecha no registrada"}</p>
                {item.referencia_pedido_cliente ? <p>OC: {item.referencia_pedido_cliente} {item.fecha_orden_cliente ? `· ${item.fecha_orden_cliente}` : ""}</p> : null}
                {item.documentos.length ? item.documentos.map((document) => <p key={document.id}>Evidencia ({CONFIRMATION_LABELS[document.tipo_documento] || "Otro"}): {document.referencia || document.observaciones || "Archivo adjunto"}{document.nombre_original ? <a className="ml-2 text-primary underline underline-offset-4" href={`/api/embudo/quotes/${item.cotizacion_id}/pedido/orden-compra?documento_id=${encodeURIComponent(document.id)}`} target="_blank" rel="noreferrer">Ver {document.nombre_original}</a> : null}</p>) : <p className="text-muted-foreground">No hay archivo adjunto; puede ser una confirmación sin OC.</p>}
                {item.observaciones_confirmacion ? <p className="text-muted-foreground">Nota: {item.observaciones_confirmacion}</p> : null}
              </ReviewBlock>
              <ReviewBlock title="3. Partidas del pedido" label="Verifiqué partidas, cantidades y precios contra la cotización aceptada" checked={reviews[item.id]?.partidas ?? false} onCheckedChange={(checked) => setReviews((current) => ({ ...current, [item.id]: { ...(current[item.id] ?? { cliente: false, evidencia: false, partidas: false, inventario: false, condiciones: false, riesgos: false }), partidas: checked } }))} disabled={pendingId === item.id}>
                {item.items.map((line) => <div key={line.id} className="border-b pb-1 last:border-0"><p>{line.descripcion} · {line.cantidad} × {formatMoney(line.precio_unitario, line.moneda)} = {formatMoney(line.subtotal, line.moneda)}</p><p className="text-muted-foreground">Cotización aceptada: {line.cotizacion_cantidad ?? "—"} × {formatMoney(line.cotizacion_precio_unitario, line.cotizacion_moneda)} {line.cotizacion_descuento_porcentaje != null ? `· Descuento ${line.cotizacion_descuento_porcentaje}% (límite ${line.cotizacion_limite_descuento_porcentaje ?? "no registrado"}%)` : ""}{differsFromAcceptedQuote(line) ? <span className="ml-2 font-medium text-destructive">No coincide con el pedido</span> : null}</p></div>)}
                <p className="font-medium">Total de la cotización: {formatMoney(item.total, item.moneda)}</p>
              </ReviewBlock>
              <ReviewBlock title="4. Inventario" label="Revisé la disponibilidad y la política de entregas parciales" checked={reviews[item.id]?.inventario ?? false} onCheckedChange={(checked) => setReviews((current) => ({ ...current, [item.id]: { ...(current[item.id] ?? { cliente: false, evidencia: false, partidas: false, inventario: false, condiciones: false, riesgos: false }), inventario: checked } }))} disabled={pendingId === item.id}>
                {item.items.filter((line) => line.maneja_inventario).length ? item.items.filter((line) => line.maneja_inventario).map((line) => <p key={line.id}>{line.descripcion}: solicitado {line.cantidad}, disponible para este pedido {line.stock_disponible ?? "—"} (ya reservado {line.stock_reservado_pedido ?? 0}){Number(line.stock_disponible ?? 0) < Number(line.cantidad) ? <span className="ml-2 text-amber-700">Faltante posible</span> : null}</p>) : <p>No hay partidas con control de inventario.</p>}
                <p className="text-muted-foreground">{item.permite_entrega_parcial ? "La cotización permite entrega parcial." : "La cotización no permite entrega parcial."} La reserva se recalcula al aprobar.</p>
              </ReviewBlock>
              <ReviewBlock title="5. Condiciones comerciales y entrega" label="Revisé las condiciones registradas y la fecha/domicilio de entrega" checked={reviews[item.id]?.condiciones ?? false} onCheckedChange={(checked) => setReviews((current) => ({ ...current, [item.id]: { ...(current[item.id] ?? { cliente: false, evidencia: false, partidas: false, inventario: false, condiciones: false, riesgos: false }), condiciones: checked } }))} disabled={pendingId === item.id}>
                <p>Pago: {item.condicion_pago || "No especificado"}{item.dias_credito ? ` · ${item.dias_credito} días de crédito` : ""}{item.anticipo_porcentaje != null ? ` · Anticipo ${item.anticipo_porcentaje}%` : ""}</p>
                <p>Entrega comprometida: {item.fecha_entrega_comprometida || "No especificada"} · Domicilio: {item.domicilio_entrega || "No especificado"}</p>
                {item.observaciones_comerciales ? <p className="text-muted-foreground">Notas: {item.observaciones_comerciales}</p> : null}
              </ReviewBlock>
              <ReviewBlock title="6. Alertas y riesgos" label="Revisé las alertas y riesgos visibles antes de liberar" checked={reviews[item.id]?.riesgos ?? false} onCheckedChange={(checked) => setReviews((current) => ({ ...current, [item.id]: { ...(current[item.id] ?? { cliente: false, evidencia: false, partidas: false, inventario: false, condiciones: false, riesgos: false }), riesgos: checked } }))} disabled={pendingId === item.id}>
                {item.items.some((line) => line.maneja_inventario && Number(line.stock_disponible ?? 0) < Number(line.cantidad)) ? <p className="text-amber-700">Alerta: el stock consultado ahora no cubre todas las cantidades; la aprobación verifica de nuevo y aplicará la política de parcialidades.</p> : null}
                {item.items.some((line) => line.maneja_inventario) && !item.domicilio_entrega ? <p className="text-amber-700">Alerta: no hay domicilio de entrega registrado.</p> : null}
                {!item.condicion_pago ? <p className="text-amber-700">Alerta: no se especificó condición de pago.</p> : null}
                {item.items.some((line) => differsFromAcceptedQuote(line)) ? <p className="font-medium text-destructive">Bloqueante: las partidas o sus precios no coinciden con la cotización aceptada. Regresa el pedido a Comercial.</p> : null}
                {item.items.some((line) => line.cotizacion_descuento_porcentaje != null && line.cotizacion_limite_descuento_porcentaje != null && Number(line.cotizacion_descuento_porcentaje) > Number(line.cotizacion_limite_descuento_porcentaje)) ? <p className="font-medium text-destructive">Bloqueante: existe un descuento superior al límite registrado.</p> : null}
                {!item.permite_entrega_parcial && item.items.some((line) => line.maneja_inventario && Number(line.stock_disponible ?? 0) < Number(line.cantidad)) ? <p className="font-medium text-destructive">Bloqueante: no hay inventario suficiente y la cotización no permite entregas parciales.</p> : null}
                {!item.cliente_datos.rfc || !item.cliente_datos.codigo_postal ? <p className="text-muted-foreground">Datos fiscales incompletos; confirma si aplican a esta operación.</p> : null}
                {!item.items.some((line) => line.maneja_inventario && Number(line.stock_disponible ?? 0) < Number(line.cantidad)) && !(item.items.some((line) => line.maneja_inventario) && !item.domicilio_entrega) && item.condicion_pago && item.cliente_datos.rfc && item.cliente_datos.codigo_postal && !item.items.some((line) => differsFromAcceptedQuote(line)) ? <p>No se detectan alertas con los datos disponibles.</p> : null}
              </ReviewBlock>
            </div>
            <div className="flex flex-wrap justify-end gap-2 border-t pt-3">
              {returningId === item.id ? (
                <div className="flex w-full flex-col gap-2 sm:flex-row">
                  <select className="h-10 rounded-md border bg-background px-3 text-sm" value={returnCode} onChange={(event) => setReturnCode(event.target.value as typeof returnCode)} aria-label="Causa de devolución">
                    {RETURN_REASONS.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
                  </select>
                  <Input value={returnReason} onChange={(event) => setReturnReason(event.target.value)} maxLength={2000} placeholder="Indica qué debe corregir Comercial" />
                  <Button type="button" variant="outline" onClick={() => void returnOrder(item)} disabled={pendingId === item.id}>Devolver</Button>
                  <Button type="button" variant="ghost" onClick={() => { setReturningId(null); setReturnReason(""); }}>Cancelar</Button>
                </div>
              ) : (
                <>
                  <Button type="button" variant="outline" onClick={() => { setReturningId(item.id); setError(null); }} disabled={pendingId === item.id}>Devolver para corrección</Button>
                  <Button type="button" onClick={() => void confirmOrder(item)} disabled={pendingId === item.id || hasBlockingIssues(item)}>
                    {pendingId === item.id ? "Aprobando…" : "Aprobar y liberar a surtido"}
                  </Button>
                </>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
