"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type FulfillmentItem = {
  id: string;
  descripcion: string;
  cantidad: number | string;
  cantidad_entregada: number | string;
  cantidad_pendiente: number | string;
  cantidad_reservada: number | string;
  cantidad_pendiente_inventario: number | string;
};

type FulfillmentOrder = {
  id: string;
  cotizacion_id: string;
  oportunidad_id: string | null;
  codigo_oportunidad: string | null;
  folio: string | null;
  oportunidad_titulo: string | null;
  cliente: string | null;
  contacto: string | null;
  total: number | string | null;
  moneda: string | null;
  estatus_logistico: "pendiente" | "parcial" | string;
  items: FulfillmentItem[];
  documentos_oportunidad: FulfillmentDocument[];
  documentos_pedido: FulfillmentDocument[];
};

type FulfillmentDocument = {
  id: string;
  nombre_original: string | null;
  tipo_documento?: string | null;
  content_type?: string | null;
  url: string | null;
};

function formatQuantity(value: number | string) {
  return new Intl.NumberFormat("es-MX", { maximumFractionDigits: 3 }).format(Number(value) || 0);
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[character] ?? character);
}

function printDeliveryDocument(order: FulfillmentOrder, quantities: Record<string, string>) {
  const printWindow = window.open("", "_blank", "noopener,noreferrer,width=900,height=700");
  if (!printWindow) return;
  const lines = order.items.map((item) => {
    const entered = Number((quantities[item.id] ?? "").replace(",", "."));
    const quantity = Number.isFinite(entered) && entered > 0 ? entered : Number(item.cantidad_pendiente) || 0;
    return `<tr><td>${escapeHtml(item.descripcion)}</td><td>${escapeHtml(formatQuantity(quantity))}</td></tr>`;
  }).join("");
  const reference = order.codigo_oportunidad || order.folio || order.id;
  printWindow.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Entrega de mercancía</title><style>body{font-family:Arial,sans-serif;color:#111;margin:40px}h1{font-size:22px;margin:0 0 8px}p{margin:4px 0;color:#444}.meta{margin:22px 0}.meta strong{color:#111}table{border-collapse:collapse;width:100%;margin-top:24px}th,td{border:1px solid #bbb;padding:10px;text-align:left}th:last-child,td:last-child{text-align:right;width:160px}.signatures{display:flex;gap:50px;margin-top:80px}.signature{border-top:1px solid #333;flex:1;padding-top:8px;color:#444}@media print{body{margin:20px}}</style></head><body><h1>Documento de entrega de mercancía</h1><div class="meta"><p><strong>Oportunidad:</strong> ${escapeHtml(reference)}</p><p><strong>Cliente:</strong> ${escapeHtml(order.cliente || "Sin nombre")}</p><p><strong>Fecha:</strong> ${escapeHtml(new Date().toLocaleDateString("es-MX"))}</p></div><table><thead><tr><th>Descripción</th><th>Cantidad</th></tr></thead><tbody>${lines}</tbody></table><div class="signatures"><div class="signature">Entrega</div><div class="signature">Recibe</div></div><script>window.onload=()=>{window.print();}</script></body></html>`);
  printWindow.document.close();
}

export function InventoryFulfillmentQueue({ canManageFulfillment }: { canManageFulfillment: boolean }) {
  const [items, setItems] = useState<FulfillmentOrder[]>([]);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [dates, setDates] = useState<Record<string, string>>({});
  const [references, setReferences] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [reservingId, setReservingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadQueue = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/inventario/surtidos?limit=50&offset=0", { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || "No se pudo cargar la cola de surtidos.");
      const rows = Array.isArray(body?.items) ? body.items as FulfillmentOrder[] : [];
      setItems(rows);
      setQuantities((current) => {
        const next = { ...current };
        for (const order of rows) for (const item of order.items) {
          const available = Number(item.cantidad_reservada) || 0;
          const pending = Number(item.cantidad_pendiente) || 0;
          const previous = Number((next[item.id] ?? "").replace(",", "."));
          next[item.id] = String(Number.isFinite(previous) && previous > 0
            ? Math.min(previous, available, pending)
            : Math.min(available, pending));
        }
        return next;
      });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "No se pudo cargar la cola de surtidos.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadQueue(); }, [loadQueue]);

  const registerDelivery = async (order: FulfillmentOrder) => {
    const lines = order.items
      .map((item) => ({ item_id: item.id, cantidad: Number((quantities[item.id] ?? "0").replace(",", ".")) }))
      .filter((item) => Number.isFinite(item.cantidad) && item.cantidad > 0);
    if (!lines.length) {
      setError("Ingresa una cantidad mayor a cero para al menos un producto.");
      return;
    }
    setPendingId(order.id);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`/api/inventario/surtidos/${order.id}/entregas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: lines,
          fecha_entrega: dates[order.id] || new Date().toISOString().slice(0, 10),
          referencia: references[order.id]?.trim() || null,
          observaciones: notes[order.id]?.trim() || null,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || "No se pudo registrar la entrega.");
      setNotice(`Surtido registrado para ${order.folio || order.cliente || "el pedido"}.`);
      await loadQueue();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "No se pudo registrar la entrega.");
    } finally {
      setPendingId(null);
    }
  };

  const reserveRestockedItems = async (order: FulfillmentOrder) => {
    setReservingId(order.id);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`/api/inventario/surtidos/${order.id}/reservar-faltante`, { method: "POST" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || "No se pudo reservar el inventario disponible.");
      setNotice(`Se actualizaron las reservas para ${order.folio || order.cliente || "el pedido"}.`);
      await loadQueue();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "No se pudo reservar el inventario disponible.");
    } finally {
      setReservingId(null);
    }
  };

  const openQuote = (order: FulfillmentOrder) => {
    window.open(`/api/inventario/surtidos/${encodeURIComponent(order.id)}/cotizacion`, "_blank", "noopener,noreferrer");
  };

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Entrega productos reservados. Puedes registrar surtidos parciales; cada entrega actualiza existencias y reserva.</p>
        <Button type="button" variant="outline" onClick={() => void loadQueue()} disabled={loading}>{loading ? "Actualizando…" : "Actualizar"}</Button>
      </div>
      {error ? <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p> : null}
      {notice ? <p role="status" className="rounded-md bg-primary/10 px-3 py-2 text-sm">{notice}</p> : null}
      {loading && items.length === 0 ? <p className="text-sm text-muted-foreground">Cargando surtidos…</p> : null}
      {!loading && items.length === 0 && !error ? (
        <div className="rounded-xl border border-dashed p-8 text-center">
          <h2 className="font-semibold">No hay pedidos por surtir</h2>
          <p className="mt-1 text-sm text-muted-foreground">Los pedidos confirmados con productos de inventario aparecerán aquí.</p>
        </div>
      ) : null}
      <div className="space-y-3">
        {items.map((order) => (
          <article key={order.id} className="space-y-4 rounded-xl border bg-card p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold">{order.codigo_oportunidad || order.oportunidad_titulo || "Pedido de venta"}</h2>
                {order.folio ? <p className="text-xs text-muted-foreground">Cotización: {order.folio}</p> : null}
                <p className="text-sm text-muted-foreground">{order.cliente || order.contacto || "Cliente sin nombre"}</p>
                {order.contacto && order.cliente ? <p className="text-xs text-muted-foreground">Contacto: {order.contacto}</p> : null}
              </div>
              <Badge variant={order.estatus_logistico === "parcial" ? "outline" : "secondary"}>
                {order.estatus_logistico === "parcial" ? "Entrega parcial" : "Pendiente de surtir"}
              </Badge>
            </div>
            <div className="divide-y">
              {order.items.map((item) => (
                <div key={item.id} className="grid gap-2 py-3 sm:grid-cols-[1fr_auto_auto] sm:items-center">
                  <div>
                    <p className="text-sm font-medium">{item.descripcion}</p>
                    <p className="text-xs text-muted-foreground">Requerido {formatQuantity(item.cantidad)} · Reservado para surtir {formatQuantity(item.cantidad_reservada)} · Entregado {formatQuantity(item.cantidad_entregada)} · Pendiente de inventario {formatQuantity(item.cantidad_pendiente_inventario)}</p>
                  </div>
                  <Label className="text-xs text-muted-foreground" htmlFor={`delivery-${item.id}`}>Entregar ahora</Label>
                  <Input
                    id={`delivery-${item.id}`}
                    className="sm:w-32"
                    type="number"
                    min="0"
                    max={String(Math.min(Number(item.cantidad_reservada) || 0, Number(item.cantidad_pendiente) || 0))}
                    step="0.001"
                    value={quantities[item.id] ?? "0"}
                    onChange={(event) => setQuantities((current) => ({ ...current, [item.id]: event.target.value }))}
                    disabled={!canManageFulfillment || Number(item.cantidad_reservada) <= 0}
                  />
                </div>
              ))}
            </div>
            <div className="grid gap-3 border-t pt-3 sm:grid-cols-3">
              <div className="space-y-1"><Label htmlFor={`date-${order.id}`}>Fecha de entrega</Label><Input id={`date-${order.id}`} type="date" value={dates[order.id] ?? new Date().toISOString().slice(0, 10)} onChange={(event) => setDates((current) => ({ ...current, [order.id]: event.target.value }))} /></div>
              <div className="space-y-1"><Label htmlFor={`reference-${order.id}`}>Referencia</Label><Input id={`reference-${order.id}`} maxLength={160} value={references[order.id] ?? ""} onChange={(event) => setReferences((current) => ({ ...current, [order.id]: event.target.value }))} placeholder="Remisión o guía" /></div>
              <div className="space-y-1"><Label htmlFor={`notes-${order.id}`}>Observaciones</Label><Input id={`notes-${order.id}`} maxLength={2000} value={notes[order.id] ?? ""} onChange={(event) => setNotes((current) => ({ ...current, [order.id]: event.target.value }))} /></div>
            </div>
            {(order.documentos_pedido.length || order.documentos_oportunidad.length) ? (
              <div className="space-y-2 border-t pt-3">
                <p className="text-xs font-medium text-muted-foreground">Documentos asociados</p>
                <div className="flex flex-wrap gap-2">
                  {order.documentos_pedido.map((document) => document.url ? (
                    <a key={`pedido-${document.id}`} href={document.url} target="_blank" rel="noreferrer" className="rounded-md border px-2.5 py-1.5 text-xs hover:bg-muted">
                      {document.tipo_documento === "orden_compra" ? "Orden de compra" : document.nombre_original || "Documento del pedido"}
                    </a>
                  ) : null)}
                  {order.documentos_oportunidad.map((document) => document.url ? (
                    <a key={`oportunidad-${document.id}`} href={document.url} target="_blank" rel="noreferrer" className="rounded-md border px-2.5 py-1.5 text-xs hover:bg-muted">
                      {document.nombre_original || "Documento de la oportunidad"}
                    </a>
                  ) : null)}
                </div>
              </div>
            ) : null}
            <div className="flex justify-end border-t pt-3">
              <div className="flex flex-wrap justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => printDeliveryDocument(order, quantities)}>
                  Imprimir entrega
                </Button>
                <Button type="button" variant="outline" onClick={() => openQuote(order)}>
                  Imprimir cotización
                </Button>
                {canManageFulfillment && order.items.some((item) => Number(item.cantidad_pendiente_inventario) > 0) ? (
                  <Button type="button" variant="outline" onClick={() => void reserveRestockedItems(order)} disabled={reservingId === order.id || pendingId === order.id}>
                    {reservingId === order.id ? "Reservando…" : "Reservar inventario disponible"}
                  </Button>
                ) : null}
                {canManageFulfillment ? (
                  <Button type="button" onClick={() => void registerDelivery(order)} disabled={pendingId === order.id || reservingId === order.id || !order.items.some((item) => Number(item.cantidad_reservada) > 0)}>
                    {pendingId === order.id ? "Registrando…" : order.items.some((item) => Number(item.cantidad_reservada) > 0) ? "Registrar entrega" : "En espera de inventario"}
                  </Button>
                ) : null}
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
