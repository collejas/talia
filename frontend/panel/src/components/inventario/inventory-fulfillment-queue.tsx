"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { printDeliveryDocument } from "@/components/inventario/inventory-delivery-print";
import type { OrderPrintBrand } from "@/components/ventas/approved-order-print";
import { AlertTriangle, Building2, CalendarDays, FileText, MapPin, Package, Phone, RefreshCw, Search, Truck } from "lucide-react";

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
  vendedor_nombre: string | null;
  cliente: string | null;
  contacto: string | null;
  contacto_telefono: string | null;
  referencia_pedido_cliente: string | null;
  domicilio_entrega: string | null;
  domicilio_entrega_pais: string | null;
  domicilio_entrega_entidad: string | null;
  domicilio_entrega_municipio: string | null;
  domicilio_entrega_localidad: string | null;
  domicilio_entrega_tipo_vialidad: string | null;
  domicilio_entrega_nombre_vialidad: string | null;
  domicilio_entrega_numero_exterior: string | null;
  domicilio_entrega_numero_interior: string | null;
  domicilio_entrega_colonia: string | null;
  domicilio_entrega_codigo_postal: string | null;
  domicilio_entrega_referencias: string | null;
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

type DeliveryRecord = {
  id: string;
  pedido_venta_id: string;
  estado: "preparada" | "en_ruta" | "entregada" | "no_entregada" | string;
  fecha_entrega: string | null;
  referencia: string | null;
  observaciones: string | null;
  salida_en: string | null;
  en_ruta_en: string | null;
  entregada_en: string | null;
  no_entregada_en: string | null;
  motivo_no_entrega: string | null;
  codigo_oportunidad: string | null;
  oportunidad_titulo: string | null;
  vendedor_nombre: string | null;
  folio: string | null;
  cliente: string | null;
  contacto: string | null;
  contacto_telefono: string | null;
  referencia_pedido_cliente: string | null;
  domicilio_entrega: Record<string, string | null>;
  items: Array<{ id: string; descripcion: string; cantidad: number | string }>;
};

function formatQuantity(value: number | string) {
  return new Intl.NumberFormat("es-MX", { maximumFractionDigits: 3 }).format(Number(value) || 0);
}

export function InventoryFulfillmentQueue({ canManageFulfillment, printBrand }: { canManageFulfillment: boolean; printBrand: OrderPrintBrand | null }) {
  const [items, setItems] = useState<FulfillmentOrder[]>([]);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [dates, setDates] = useState<Record<string, string>>({});
  const [references, setReferences] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"todos" | "pendiente" | "parcial">("todos");
  const [activeView, setActiveView] = useState<"pendientes" | "en_ruta" | "historial">("pendientes");
  const [deliveryRows, setDeliveryRows] = useState<DeliveryRecord[]>([]);
  const [deliveryLoading, setDeliveryLoading] = useState(false);
  const [failureDeliveryId, setFailureDeliveryId] = useState<string | null>(null);
  const [failureReason, setFailureReason] = useState("domicilio_cerrado");
  const [failureNotes, setFailureNotes] = useState("");
  const [deliveryActionId, setDeliveryActionId] = useState<string | null>(null);
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

  const prepareDelivery = async (order: FulfillmentOrder) => {
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
      const response = await fetch(`/api/inventario/surtidos/${order.id}/preparar-en-ruta`, {
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
      setNotice(`Salida preparada y marcada en ruta para ${order.folio || order.cliente || "el pedido"}.`);
      setActiveView("en_ruta");
      await loadQueue();
      await loadDeliveries("en_ruta");
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "No se pudo registrar la entrega.");
    } finally {
      setPendingId(null);
    }
  };

  const loadDeliveries = useCallback(async (view: "por_surtir" | "en_ruta" | "historial") => {
    setDeliveryLoading(true);
    try {
      const response = await fetch(`/api/inventario/surtidos/entregas?vista=${view}&limit=50&offset=0`, { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || "No se pudieron cargar las entregas.");
      setDeliveryRows(Array.isArray(body?.items) ? body.items as DeliveryRecord[] : []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "No se pudieron cargar las entregas.");
    } finally {
      setDeliveryLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDeliveries("por_surtir");
  }, [loadDeliveries]);

  const updateDelivery = async (delivery: DeliveryRecord, action: "en-ruta" | "confirmar" | "no-realizada", body: Record<string, string> = {}) => {
    setDeliveryActionId(delivery.id);
    setError(null);
    try {
      const response = await fetch(`/api/inventario/surtidos/entregas/${delivery.id}/${action}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const responseBody = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(responseBody?.error || "No se pudo actualizar la entrega.");
      setNotice(action === "en-ruta" ? "La entrega fue marcada en ruta." : action === "confirmar" ? "La entrega fue confirmada." : "La entrega quedó registrada como no realizada.");
      setFailureDeliveryId(null);
      await loadDeliveries(activeView === "historial" ? "historial" : activeView === "en_ruta" ? "en_ruta" : "por_surtir");
      await loadQueue();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "No se pudo actualizar la entrega.");
    } finally {
      setDeliveryActionId(null);
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

  const visibleItems = items.filter((order) => {
    const needle = search.trim().toLocaleLowerCase("es-MX");
    const matchesSearch = !needle || [order.codigo_oportunidad, order.oportunidad_titulo, order.cliente, order.contacto, order.folio, order.referencia_pedido_cliente]
      .some((value) => value?.toLocaleLowerCase("es-MX").includes(needle));
    const matchesStatus = statusFilter === "todos" || order.estatus_logistico === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const pendingOrders = items.filter((order) => order.estatus_logistico === "pendiente").length;
  const partialOrders = items.filter((order) => order.estatus_logistico === "parcial").length;

  const deliveryAddress = (order: FulfillmentOrder) => {
    const street = [order.domicilio_entrega_tipo_vialidad, order.domicilio_entrega_nombre_vialidad].filter(Boolean).join(" ");
    const number = [
      order.domicilio_entrega_numero_exterior ? `No. ext. ${order.domicilio_entrega_numero_exterior}` : "",
      order.domicilio_entrega_numero_interior ? `No. int. ${order.domicilio_entrega_numero_interior}` : "",
    ].filter(Boolean).join(", ");
    const locality = [order.domicilio_entrega_colonia, order.domicilio_entrega_municipio, order.domicilio_entrega_localidad].filter(Boolean).join(", ");
    const region = [order.domicilio_entrega_entidad, order.domicilio_entrega_codigo_postal, order.domicilio_entrega_pais].filter(Boolean).join(", ");
    const structured = [[street, number].filter(Boolean).join(" "), locality, region].filter(Boolean);
    return structured.length ? structured : [order.domicilio_entrega || "Sin domicilio de entrega registrado"];
  };

  const phoneHref = (phone: string | null) => phone ? `tel:${phone.replace(/[^\d+]/g, "")}` : null;

  return (
    <section className="space-y-5">
      <div className="flex flex-col gap-4 rounded-2xl border bg-gradient-to-br from-card to-muted/30 p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-primary"><Truck className="size-5" /><span className="text-xs font-semibold uppercase tracking-[0.16em]">Operación logística</span></div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Pedidos por surtir</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Identifica rápidamente qué entregar, a qué empresa y dónde realizar la entrega.</p>
        </div>
        <Button type="button" variant="outline" onClick={() => void loadQueue()} disabled={loading} className="shrink-0"><RefreshCw className={loading ? "mr-2 size-4 animate-spin" : "mr-2 size-4"} />{loading ? "Actualizando…" : "Actualizar"}</Button>
      </div>
      <div className="flex flex-wrap gap-1 rounded-xl border bg-muted/30 p-1">
        {([['pendientes', 'Por surtir'], ['en_ruta', 'En ruta'], ['historial', 'Historial']] as const).map(([view, label]) => <button key={view} type="button" onClick={() => { setActiveView(view); void loadDeliveries(view === "pendientes" ? "por_surtir" : view); }} className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${activeView === view ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>{label}{deliveryRows.length && activeView === view ? ` (${deliveryRows.length})` : ""}</button>)}
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <button type="button" onClick={() => setStatusFilter("todos")} className={`rounded-xl border p-4 text-left transition-colors ${statusFilter === "todos" ? "border-primary bg-primary/5" : "bg-card hover:bg-muted/40"}`}><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Total de pedidos</p><p className="mt-1 text-2xl font-semibold">{items.length}</p></button>
        <button type="button" onClick={() => setStatusFilter("pendiente")} className={`rounded-xl border p-4 text-left transition-colors ${statusFilter === "pendiente" ? "border-primary bg-primary/5" : "bg-card hover:bg-muted/40"}`}><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Pendientes de surtir</p><p className="mt-1 text-2xl font-semibold text-amber-700">{pendingOrders}</p></button>
        <button type="button" onClick={() => setStatusFilter("parcial")} className={`rounded-xl border p-4 text-left transition-colors ${statusFilter === "parcial" ? "border-primary bg-primary/5" : "bg-card hover:bg-muted/40"}`}><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Entregas parciales</p><p className="mt-1 text-2xl font-semibold text-blue-700">{partialOrders}</p></button>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por oportunidad, empresa, contacto, cotización u OC" className="h-10 pl-9" /></div>
        <select aria-label="Filtrar por estado" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)} className="h-10 rounded-md border bg-background px-3 text-sm"><option value="todos">Todos los estados</option><option value="pendiente">Pendientes de surtir</option><option value="parcial">Entregas parciales</option></select>
      </div>
      {error ? <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p> : null}
      {notice ? <p role="status" className="rounded-md bg-primary/10 px-3 py-2 text-sm">{notice}</p> : null}
      {loading && items.length === 0 ? <p className="text-sm text-muted-foreground">Cargando surtidos…</p> : null}
      {!loading && items.length === 0 && deliveryRows.length === 0 && !error ? (
        <div className="rounded-xl border border-dashed p-8 text-center">
          <h2 className="font-semibold">No hay pedidos por surtir</h2>
          <p className="mt-1 text-sm text-muted-foreground">Los pedidos confirmados con productos de inventario aparecerán aquí.</p>
        </div>
      ) : null}
      {activeView === "pendientes" && !loading && items.length > 0 && visibleItems.length === 0 && !error ? <div className="rounded-xl border border-dashed p-8 text-center"><h2 className="font-semibold">No hay coincidencias</h2><p className="mt-1 text-sm text-muted-foreground">Prueba con otra empresa, oportunidad, cotización u OC.</p></div> : null}
      <div className={activeView === "pendientes" ? "space-y-5" : "hidden"}>
        {visibleItems.map((order) => {
          const hasShortage = order.items.some((item) => Number(item.cantidad_pendiente_inventario) > 0);
          const canDeliver = order.items.some((item) => Number(item.cantidad_reservada) > 0);
          return (
            <article key={order.id} className="overflow-hidden rounded-2xl border bg-card shadow-sm">
              <header className="flex flex-col gap-3 border-b bg-muted/20 p-5 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2"><span className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">{order.codigo_oportunidad || "Pedido de venta"}</span><Badge variant={order.estatus_logistico === "parcial" ? "outline" : "secondary"}>{order.estatus_logistico === "parcial" ? "Entrega parcial" : "Pendiente de surtir"}</Badge></div>
                  <h2 className="mt-2 truncate text-xl font-semibold">{order.cliente || "Cliente sin nombre"}</h2>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground"><span>{order.oportunidad_titulo || "Sin título de oportunidad"}</span>{order.vendedor_nombre ? <span>Vendedor: <strong className="font-medium text-foreground">{order.vendedor_nombre}</strong></span> : null}{order.folio ? <span>Cotización: <strong className="font-medium text-foreground">{order.folio}</strong></span> : null}{order.referencia_pedido_cliente ? <span>OC: <strong className="font-medium text-foreground">{order.referencia_pedido_cliente}</strong></span> : null}</div>
                </div>
                <div className="flex shrink-0 items-center gap-2 text-sm text-muted-foreground"><Package className="size-4" />{order.items.length} {order.items.length === 1 ? "producto" : "productos"}</div>
              </header>
              <div className="grid gap-4 p-5 lg:grid-cols-[minmax(260px,0.8fr)_minmax(0,1.8fr)]">
                <section className="rounded-xl border border-primary/20 bg-primary/[0.04] p-4" aria-labelledby={`delivery-destination-${order.id}`}>
                  <div className="flex items-center gap-2 text-primary"><MapPin className="size-5" /><h3 id={`delivery-destination-${order.id}`} className="font-semibold">Entregar a</h3></div>
                  <div className="mt-4 space-y-3 text-sm">
                    <div className="flex gap-2"><Building2 className="mt-0.5 size-4 shrink-0 text-muted-foreground" /><div><p className="font-medium">{order.cliente || "Empresa sin nombre"}</p>{order.contacto ? <p className="text-muted-foreground">{order.contacto}</p> : null}</div></div>
                    <div className="flex gap-2"><MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" /><div className="leading-6">{deliveryAddress(order).map((line) => <p key={line}>{line}</p>)}</div></div>
                    {order.contacto_telefono ? <a href={phoneHref(order.contacto_telefono) ?? undefined} className="flex w-fit items-center gap-2 font-medium text-primary hover:underline"><Phone className="size-4" />{order.contacto_telefono}</a> : <p className="text-xs text-muted-foreground">Sin teléfono de contacto registrado</p>}
                  </div>
                </section>
                <section aria-labelledby={`products-${order.id}`}>
                  <div className="mb-3 flex items-center justify-between gap-3"><div className="flex items-center gap-2"><Package className="size-5 text-primary" /><h3 id={`products-${order.id}`} className="font-semibold">Qué entregar</h3></div>{hasShortage ? <span className="flex items-center gap-1 text-xs font-medium text-amber-700"><AlertTriangle className="size-4" />Inventario incompleto</span> : null}</div>
                  <div className="overflow-hidden rounded-xl border">
                    <div className="hidden grid-cols-[minmax(0,1.6fr)_repeat(3,minmax(72px,0.5fr))_minmax(100px,0.7fr)] gap-3 bg-muted/50 px-4 py-2 text-right text-xs font-medium text-muted-foreground sm:grid"><span className="text-left">Producto</span><span>Pedido</span><span>Reservado</span><span>Entregado</span><span>Entregar ahora</span></div>
                    <div className="divide-y">{order.items.map((item) => { const itemShortage = Number(item.cantidad_pendiente_inventario) > 0; return <div key={item.id} className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1.6fr)_repeat(3,minmax(72px,0.5fr))_minmax(100px,0.7fr)] sm:items-center sm:text-right">
                      <div className="text-left"><p className="font-medium">{item.descripcion}</p><div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground sm:block"><span className="sm:hidden">Pedido: {formatQuantity(item.cantidad)} · </span><span className={itemShortage ? "font-medium text-amber-700" : ""}>{itemShortage ? `Faltan ${formatQuantity(item.cantidad_pendiente_inventario)}` : "Disponible para surtir"}</span></div></div>
                      <div className="hidden text-sm sm:block">{formatQuantity(item.cantidad)}</div><div className="hidden text-sm sm:block">{formatQuantity(item.cantidad_reservada)}</div><div className="hidden text-sm sm:block">{formatQuantity(item.cantidad_entregada)}</div>
                      <div className="flex items-center gap-2 sm:block"><Label className="text-xs text-muted-foreground sm:hidden" htmlFor={`delivery-${item.id}`}>Entregar</Label><Input id={`delivery-${item.id}`} className="h-10 text-right text-base font-semibold sm:w-full" type="number" min="0" max={String(Math.min(Number(item.cantidad_reservada) || 0, Number(item.cantidad_pendiente) || 0))} step="0.001" value={quantities[item.id] ?? "0"} onChange={(event) => setQuantities((current) => ({ ...current, [item.id]: event.target.value }))} disabled={!canManageFulfillment || Number(item.cantidad_reservada) <= 0} /></div>
                    </div>; })}</div>
                  </div>
                </section>
              </div>
              <div className="grid gap-3 border-t bg-muted/10 p-5 sm:grid-cols-3">
                <div className="space-y-1"><Label htmlFor={`date-${order.id}`} className="flex items-center gap-1.5"><CalendarDays className="size-3.5" />Fecha de entrega</Label><Input id={`date-${order.id}`} type="date" value={dates[order.id] ?? new Date().toISOString().slice(0, 10)} onChange={(event) => setDates((current) => ({ ...current, [order.id]: event.target.value }))} /></div>
                <div className="space-y-1"><Label htmlFor={`reference-${order.id}`}>Remisión o guía</Label><Input id={`reference-${order.id}`} maxLength={160} value={references[order.id] ?? ""} onChange={(event) => setReferences((current) => ({ ...current, [order.id]: event.target.value }))} placeholder="Opcional" /></div>
                <div className="space-y-1"><Label htmlFor={`notes-${order.id}`}>Observaciones</Label><Input id={`notes-${order.id}`} maxLength={2000} value={notes[order.id] ?? ""} onChange={(event) => setNotes((current) => ({ ...current, [order.id]: event.target.value }))} placeholder="Opcional" /></div>
              </div>
              {(order.documentos_pedido.length || order.documentos_oportunidad.length) ? <div className="border-t px-5 py-3"><div className="flex flex-wrap items-center gap-2"><span className="mr-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><FileText className="size-3.5" />Documentos</span>{order.documentos_pedido.map((document) => document.url ? <a key={`pedido-${document.id}`} href={document.url} target="_blank" rel="noreferrer" className="rounded-md border px-2.5 py-1.5 text-xs hover:bg-muted">{document.tipo_documento === "orden_compra" ? "Orden de compra" : document.nombre_original || "Documento del pedido"}</a> : null)}{order.documentos_oportunidad.map((document) => document.url ? <a key={`oportunidad-${document.id}`} href={document.url} target="_blank" rel="noreferrer" className="rounded-md border px-2.5 py-1.5 text-xs hover:bg-muted">{document.nombre_original || "Documento de la oportunidad"}</a> : null)}</div></div> : null}
              <footer className="flex flex-col-reverse gap-2 border-t p-5 sm:flex-row sm:items-center sm:justify-between"><div className="text-xs text-muted-foreground">{canDeliver ? "Hay inventario reservado listo para salir." : "En espera de inventario reservado."}</div><div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="outline" onClick={() => { if (printBrand) printDeliveryDocument(order, quantities, printBrand); }} disabled={!printBrand}><Truck className="mr-2 size-4" />Imprimir entrega</Button><Button type="button" variant="outline" onClick={() => openQuote(order)}>Imprimir cotización</Button>{canManageFulfillment && hasShortage ? <Button type="button" variant="outline" onClick={() => void reserveRestockedItems(order)} disabled={reservingId === order.id || pendingId === order.id}>{reservingId === order.id ? "Reservando…" : "Reservar inventario"}</Button> : null}{canManageFulfillment ? <Button type="button" onClick={() => void prepareDelivery(order)} disabled={pendingId === order.id || reservingId === order.id || !canDeliver}>{pendingId === order.id ? "Preparando y marcando…" : canDeliver ? "Preparar y marcar en ruta" : "En espera de inventario"}</Button> : null}</div></footer>
            </article>
          );
        })}
      </div>
      <div className="space-y-4">
        {deliveryLoading ? <p className="text-sm text-muted-foreground">Cargando {activeView === "pendientes" ? "salidas pendientes" : activeView === "en_ruta" ? "entregas en ruta" : "historial"}…</p> : null}
        {!deliveryLoading && deliveryRows.length === 0 ? <div className="rounded-xl border border-dashed p-8 text-center"><h2 className="font-semibold">{activeView === "pendientes" ? "No hay salidas pendientes de despacho" : activeView === "en_ruta" ? "No hay entregas en ruta" : "No hay entregas registradas"}</h2><p className="mt-1 text-sm text-muted-foreground">{activeView === "pendientes" ? "Las salidas preparadas aparecerán aquí para marcar su recorrido y confirmar la entrega." : "Las salidas preparadas y las entregas confirmadas aparecerán aquí."}</p></div> : null}
        {deliveryRows.map((delivery) => {
          const address = Object.entries(delivery.domicilio_entrega || {}).filter(([, value]) => value).map(([, value]) => value).join(", ");
          return <article key={delivery.id} className="overflow-hidden rounded-2xl border bg-card shadow-sm">
            <div className="flex flex-col gap-3 border-b bg-muted/20 p-5 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex flex-wrap items-center gap-2"><span className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">{delivery.codigo_oportunidad || "Pedido de venta"}</span><Badge variant={delivery.estado === "no_entregada" ? "destructive" : delivery.estado === "entregada" ? "secondary" : "outline"}>{delivery.estado === "en_ruta" ? "En ruta" : delivery.estado === "preparada" ? "Preparada" : delivery.estado === "no_entregada" ? "No realizada" : "Entregada"}</Badge></div><h2 className="mt-2 text-xl font-semibold">{delivery.cliente || "Cliente sin nombre"}</h2><p className="mt-1 text-sm text-muted-foreground">{delivery.oportunidad_titulo || "Sin título de oportunidad"}{delivery.vendedor_nombre ? ` · Vendedor: ${delivery.vendedor_nombre}` : ""}{delivery.folio ? ` · Cotización ${delivery.folio}` : ""}{delivery.referencia_pedido_cliente ? ` · OC ${delivery.referencia_pedido_cliente}` : ""}</p></div><div className="text-sm text-muted-foreground">{delivery.fecha_entrega || "Sin fecha"}</div></div>
            <div className="grid gap-4 p-5 lg:grid-cols-[0.8fr_1.2fr]"><div className="rounded-xl border border-primary/20 bg-primary/[0.04] p-4"><p className="flex items-center gap-2 font-semibold text-primary"><MapPin className="size-4" />Destino</p><p className="mt-3 text-sm leading-6">{address || "Sin domicilio registrado"}</p>{delivery.contacto ? <p className="mt-3 text-sm"><strong>Contacto:</strong> {delivery.contacto}</p> : null}{delivery.contacto_telefono ? <a href={phoneHref(delivery.contacto_telefono) ?? undefined} className="mt-1 flex w-fit items-center gap-2 text-sm font-medium text-primary hover:underline"><Phone className="size-4" />{delivery.contacto_telefono}</a> : null}</div><div><p className="mb-3 flex items-center gap-2 font-semibold"><Package className="size-4 text-primary" />Productos de esta salida</p><div className="divide-y rounded-xl border">{delivery.items.map((item) => <div key={item.id} className="flex items-center justify-between gap-4 px-4 py-3 text-sm"><span>{item.descripcion}</span><strong>{formatQuantity(item.cantidad)}</strong></div>)}</div>{delivery.estado === "no_entregada" ? <p className="mt-3 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"><strong>Motivo:</strong> {delivery.motivo_no_entrega}</p> : null}</div></div>
            {activeView === "en_ruta" && delivery.estado === "en_ruta" && canManageFulfillment ? <div className="flex flex-col gap-3 border-t p-5 sm:flex-row sm:items-center sm:justify-end"><Button type="button" variant="outline" onClick={() => setFailureDeliveryId(failureDeliveryId === delivery.id ? null : delivery.id)} disabled={deliveryActionId === delivery.id}>No se pudo entregar</Button><Button type="button" onClick={() => void updateDelivery(delivery, "confirmar")} disabled={deliveryActionId === delivery.id}>{deliveryActionId === delivery.id ? "Confirmando…" : "Marcar como entregada"}</Button></div> : null}
            {activeView === "pendientes" && delivery.estado === "preparada" && canManageFulfillment ? <div className="flex justify-end border-t p-5"><Button type="button" onClick={() => void updateDelivery(delivery, "en-ruta")} disabled={deliveryActionId === delivery.id}>{deliveryActionId === delivery.id ? "Actualizando…" : "Marcar en ruta"}</Button></div> : null}
            {activeView === "en_ruta" && delivery.estado === "en_ruta" && failureDeliveryId === delivery.id ? <div className="grid gap-3 border-t bg-destructive/[0.03] p-5 sm:grid-cols-[1fr_1fr_auto]"><div><Label htmlFor={`failure-reason-${delivery.id}`}>Motivo de no entrega</Label><select id={`failure-reason-${delivery.id}`} value={failureReason} onChange={(event) => setFailureReason(event.target.value)} className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm"><option value="domicilio_cerrado">Domicilio cerrado</option><option value="contacto_no_localizado">Contacto no localizado</option><option value="rechazo_cliente">Rechazo del cliente</option><option value="direccion_incorrecta">Dirección incorrecta</option><option value="documentacion_faltante">Documentación faltante</option><option value="problema_transporte">Problema con el transporte</option><option value="otro">Otro</option></select></div><div><Label htmlFor={`failure-notes-${delivery.id}`}>Observaciones</Label><Input id={`failure-notes-${delivery.id}`} value={failureNotes} onChange={(event) => setFailureNotes(event.target.value)} placeholder="Describe lo ocurrido" /></div><Button type="button" variant="destructive" className="self-end" onClick={() => void updateDelivery(delivery, "no-realizada", { motivo: failureReason, observaciones: failureNotes })} disabled={deliveryActionId === delivery.id}>Registrar no entrega</Button></div> : null}
          </article>;
        })}
      </div>
    </section>
  );
}
