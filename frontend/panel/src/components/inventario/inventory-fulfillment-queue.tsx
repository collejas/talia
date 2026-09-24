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
};

type FulfillmentOrder = {
  id: string;
  cotizacion_id: string;
  folio: string | null;
  oportunidad_titulo: string | null;
  cliente: string | null;
  contacto: string | null;
  total: number | string | null;
  moneda: string | null;
  estatus_logistico: "pendiente" | "parcial" | string;
  items: FulfillmentItem[];
};

function formatQuantity(value: number | string) {
  return new Intl.NumberFormat("es-MX", { maximumFractionDigits: 3 }).format(Number(value) || 0);
}

export function InventoryFulfillmentQueue() {
  const [items, setItems] = useState<FulfillmentOrder[]>([]);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [dates, setDates] = useState<Record<string, string>>({});
  const [references, setReferences] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [pendingId, setPendingId] = useState<string | null>(null);
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
          if (next[item.id] === undefined) next[item.id] = String(item.cantidad_pendiente);
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
                <h2 className="font-semibold">{order.folio || order.oportunidad_titulo || "Pedido de venta"}</h2>
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
                    <p className="text-xs text-muted-foreground">Ordenado {formatQuantity(item.cantidad)} · Entregado {formatQuantity(item.cantidad_entregada)} · Pendiente {formatQuantity(item.cantidad_pendiente)}</p>
                  </div>
                  <Label className="text-xs text-muted-foreground" htmlFor={`delivery-${item.id}`}>Entregar ahora</Label>
                  <Input
                    id={`delivery-${item.id}`}
                    className="sm:w-32"
                    type="number"
                    min="0"
                    max={String(item.cantidad_pendiente)}
                    step="0.001"
                    value={quantities[item.id] ?? "0"}
                    onChange={(event) => setQuantities((current) => ({ ...current, [item.id]: event.target.value }))}
                  />
                </div>
              ))}
            </div>
            <div className="grid gap-3 border-t pt-3 sm:grid-cols-3">
              <div className="space-y-1"><Label htmlFor={`date-${order.id}`}>Fecha de entrega</Label><Input id={`date-${order.id}`} type="date" value={dates[order.id] ?? new Date().toISOString().slice(0, 10)} onChange={(event) => setDates((current) => ({ ...current, [order.id]: event.target.value }))} /></div>
              <div className="space-y-1"><Label htmlFor={`reference-${order.id}`}>Referencia</Label><Input id={`reference-${order.id}`} maxLength={160} value={references[order.id] ?? ""} onChange={(event) => setReferences((current) => ({ ...current, [order.id]: event.target.value }))} placeholder="Remisión o guía" /></div>
              <div className="space-y-1"><Label htmlFor={`notes-${order.id}`}>Observaciones</Label><Input id={`notes-${order.id}`} maxLength={2000} value={notes[order.id] ?? ""} onChange={(event) => setNotes((current) => ({ ...current, [order.id]: event.target.value }))} /></div>
            </div>
            <div className="flex justify-end border-t pt-3">
              <Button type="button" onClick={() => void registerDelivery(order)} disabled={pendingId === order.id}>
                {pendingId === order.id ? "Registrando…" : "Registrar entrega"}
              </Button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
