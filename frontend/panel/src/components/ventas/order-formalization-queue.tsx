"use client";

import { useCallback, useEffect, useState } from "react";
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
  items: { id: string; descripcion: string; cantidad: number | string; precio_unitario: number | string | null; subtotal: number | string | null; moneda: string | null; maneja_inventario: boolean }[];
  documentos: { id: string; tipo_documento: string; nombre_original: string | null }[];
};

type ReviewChecklist = { cliente: boolean; evidencia: boolean; partidas: boolean };

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

export function OrderFormalizationQueue() {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [returningId, setReturningId] = useState<string | null>(null);
  const [returnReason, setReturnReason] = useState("");
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
    const review = reviews[item.id] ?? { cliente: false, evidencia: false, partidas: false };
    if (!review.cliente || !review.evidencia || !review.partidas) {
      setError("Completa las tres verificaciones antes de aprobar y liberar el pedido.");
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
        body: JSON.stringify({ motivo: reason }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || "No se pudo devolver el pedido.");
      setNotice(`Pedido ${item.folio || "del cliente"} devuelto a Comercial para corrección.`);
      setReturningId(null);
      setReturnReason("");
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
          <p className="text-sm text-muted-foreground">Verifica cliente, evidencia y partidas. Al aprobar se formalizan la venta y la cuenta por cobrar, y el pedido pasa a Surtidos.</p>
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
            <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
              <p><span className="text-muted-foreground">Confirmación: </span>{CONFIRMATION_LABELS[item.forma_confirmacion || ""] || "Otro"}</p>
              <p><span className="text-muted-foreground">Fecha: </span>{item.fecha_confirmacion_cliente || "—"}</p>
              {item.referencia_pedido_cliente ? <p><span className="text-muted-foreground">OC: </span>{item.referencia_pedido_cliente}</p> : null}
              {item.forma_confirmacion === "orden_compra" ? <p className="font-medium text-emerald-700">OC validada: el inventario físico puede estar reservado desde Comercial.</p> : null}
              {item.items.map((line) => (
                <p key={line.id} className="sm:col-span-2 lg:col-span-3">
                  <span className="text-muted-foreground">{line.maneja_inventario ? "Producto" : "Partida"}: </span>
                  {line.descripcion} · {line.cantidad} × {formatMoney(line.precio_unitario, line.moneda)} = {formatMoney(line.subtotal, line.moneda)}
                </p>
              ))}
              {item.observaciones_confirmacion ? <p className="sm:col-span-2 lg:col-span-3"><span className="text-muted-foreground">Observaciones: </span>{item.observaciones_confirmacion}</p> : null}
              {item.documentos.map((document) => (
                <a
                  key={document.id}
                  className="text-primary underline underline-offset-4"
                  href={`/api/embudo/quotes/${item.cotizacion_id}/pedido/orden-compra?documento_id=${encodeURIComponent(document.id)}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Ver {document.nombre_original || "documento"}
                </a>
              ))}
            </div>
            <fieldset className="grid gap-2 rounded-lg border bg-muted/20 p-3 text-sm">
              <legend className="px-1 font-medium">Revisión de Operaciones</legend>
              {([
                ["cliente", "Verifiqué los datos del cliente"],
                ["evidencia", "Revisé la evidencia de confirmación del cliente"],
                ["partidas", "Verifiqué productos, cantidades y precios"],
              ] as const).map(([key, label]) => (
                <label key={key} className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={(reviews[item.id] ?? { cliente: false, evidencia: false, partidas: false })[key]}
                    onChange={(event) => setReviews((current) => ({
                      ...current,
                      [item.id]: { ...(current[item.id] ?? { cliente: false, evidencia: false, partidas: false }), [key]: event.target.checked },
                    }))}
                    disabled={pendingId === item.id}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </fieldset>
            <div className="flex flex-wrap justify-end gap-2 border-t pt-3">
              {returningId === item.id ? (
                <div className="flex w-full flex-col gap-2 sm:flex-row">
                  <Input value={returnReason} onChange={(event) => setReturnReason(event.target.value)} maxLength={2000} placeholder="Indica qué debe corregir Comercial" />
                  <Button type="button" variant="outline" onClick={() => void returnOrder(item)} disabled={pendingId === item.id}>Devolver</Button>
                  <Button type="button" variant="ghost" onClick={() => { setReturningId(null); setReturnReason(""); }}>Cancelar</Button>
                </div>
              ) : (
                <>
                  <Button type="button" variant="outline" onClick={() => { setReturningId(item.id); setError(null); }} disabled={pendingId === item.id}>Devolver para corrección</Button>
                  <Button type="button" onClick={() => void confirmOrder(item)} disabled={pendingId === item.id}>
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
