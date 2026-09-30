"use client";

import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { IconAlertTriangle, IconChevronDown, IconCircleCheck, IconPrinter, IconSearch } from "@tabler/icons-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { printApprovedOrder, printApprovedOrdersList, printOrderForExceptionApproval, type ApprovedOrderForPrint, type OrderPrintBrand } from "@/components/ventas/approved-order-print";

type QueueItem = {
  id: string;
  cotizacion_id: string;
  folio: string | null;
  oportunidad_titulo: string | null;
  cliente: string | null;
  cuenta_crm_asociada: boolean;
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
  domicilio_entrega_completo: boolean;
  domicilio_entrega_faltantes: string[];
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
  observaciones_comerciales: string | null;
  cliente_datos: Record<string, string | null>;
  items: { id: string; catalog_item_id: string | null; tipo_catalogo: string | null; descripcion: string; cantidad: number | string; precio_unitario: number | string | null; subtotal: number | string | null; moneda: string | null; maneja_inventario: boolean; stock_disponible: number | string | null; stock_reservado_pedido: number | string | null; cotizacion_cantidad: number | string | null; cotizacion_precio_unitario: number | string | null; cotizacion_descuento_porcentaje: number | string | null; cotizacion_limite_descuento_porcentaje: number | string | null; cotizacion_moneda: string | null; cotizacion_catalog_item_id: string | null }[];
  documentos: { id: string; tipo_documento: string; nombre_original: string | null; referencia: string | null; observaciones: string | null }[];
};

type ApprovedOrder = ApprovedOrderForPrint & {
  id: string;
  cotizacion_id: string;
};

function ReviewRow({
  title,
  summary,
  checked,
  onCheckedChange,
  disabled,
  children,
}: {
  title: string;
  summary: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled: boolean;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-2 border-b px-3 py-2.5 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-sm font-medium">
          {checked ? <IconCircleCheck className="size-4 shrink-0 text-emerald-600" /> : <IconAlertTriangle className="size-4 shrink-0 text-amber-600" />}
          <span>{title}</span>
        </div>
        <p className="truncate pl-6 text-xs text-muted-foreground">{summary}</p>
        <div className="mt-1 space-y-1 pl-6 text-xs">{children}</div>
      </div>
      <label className="flex items-center gap-2 text-xs text-muted-foreground sm:justify-end">
        <input type="checkbox" checked={checked} onChange={(event) => onCheckedChange(event.target.checked)} disabled={disabled} aria-label={`Marcar ${title} como revisado`} />
        Revisado
      </label>
    </div>
  );
}

type ReviewChecklist = { cliente: boolean; evidencia: boolean; entrega: boolean; productos: boolean };
const EMPTY_REVIEW: ReviewChecklist = { cliente: false, evidencia: false, entrega: false, productos: false };

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

type InventoryProjection = {
  key: string;
  descripcion: string;
  solicitado: number;
  reservado: number;
  disponibleAhora: number;
  reservaAdicional: number;
  reservadoDespues: number;
  pendienteDespues: number;
  disponibleDespues: number;
};

function getInventoryProjection(item: QueueItem): InventoryProjection[] {
  const grouped = new Map<string, InventoryProjection>();
  for (const line of item.items.filter((entry) => entry.maneja_inventario)) {
    const key = line.catalog_item_id || line.id;
    const solicitado = Math.max(0, Number(line.cantidad) || 0);
    const reservado = Math.max(0, Number(line.stock_reservado_pedido) || 0);
    const disponibleAhora = Math.max(0, (Number(line.stock_disponible) || 0) - reservado);
    const current = grouped.get(key);
    if (current) {
      current.solicitado += solicitado;
      current.reservado += reservado;
    } else {
      grouped.set(key, {
        key,
        descripcion: line.descripcion,
        solicitado,
        reservado,
        disponibleAhora,
        reservaAdicional: 0,
        reservadoDespues: 0,
        pendienteDespues: 0,
        disponibleDespues: 0,
      });
    }
  }

  return [...grouped.values()].map((product) => {
    const porReservar = Math.max(0, product.solicitado - product.reservado);
    const reservaAdicional = item.permite_entrega_parcial
      ? Math.min(porReservar, product.disponibleAhora)
      : porReservar <= product.disponibleAhora ? porReservar : 0;
    const reservadoDespues = product.reservado + reservaAdicional;
    return {
      ...product,
      reservaAdicional,
      reservadoDespues,
      pendienteDespues: Math.max(0, product.solicitado - reservadoDespues),
      disponibleDespues: Math.max(0, product.disponibleAhora - reservaAdicional),
    };
  });
}

function formatQuantity(value: number) {
  return new Intl.NumberFormat("es-MX", { maximumFractionDigits: 3 }).format(value);
}

function FieldStatus({ label, value, warning = false }: { label: string; value: string | number | null | undefined; warning?: boolean }) {
  const present = value !== null && value !== undefined && String(value).trim() !== "";
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
      {present && !warning ? <IconCircleCheck className="size-3.5 shrink-0 text-emerald-600" /> : <IconAlertTriangle className="size-3.5 shrink-0 text-amber-600" />}
      <span className="text-muted-foreground">{label}:</span>
      <span className={present && !warning ? "text-foreground" : "font-medium text-amber-700"}>{present ? String(value) : "Faltante"}</span>
    </div>
  );
}

function hasBlockingIssues(item: QueueItem) {
  return !item.cuenta_crm_asociada
    || (item.items.some((line) => line.maneja_inventario) && !item.domicilio_entrega_completo)
    || item.items.some((line) => differsFromAcceptedQuote(line)
    || (line.cotizacion_descuento_porcentaje != null
      && line.cotizacion_limite_descuento_porcentaje != null
      && Number(line.cotizacion_descuento_porcentaje) > Number(line.cotizacion_limite_descuento_porcentaje)))
    || (!item.permite_entrega_parcial && getInventoryProjection(item).some((product) => product.pendienteDespues > 0));
}

export function OrderFormalizationQueue({ printBrand }: { printBrand: OrderPrintBrand | null }) {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [approvedItems, setApprovedItems] = useState<ApprovedOrder[]>([]);
  const [approvedLoaded, setApprovedLoaded] = useState(false);
  const [approvedHasMore, setApprovedHasMore] = useState(false);
  const [approvedOffset, setApprovedOffset] = useState(0);
  const [approvedLoading, setApprovedLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("revision");
  const [loading, setLoading] = useState(true);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [returningId, setReturningId] = useState<string | null>(null);
  const [returnReason, setReturnReason] = useState("");
  const [returnCode, setReturnCode] = useState<(typeof RETURN_REASONS)[number][0]>("otro");
  const [reviews, setReviews] = useState<Record<string, ReviewChecklist>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [queueFilter, setQueueFilter] = useState<"todas" | "faltantes" | "listas">("todas");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadApproved = useCallback(async ({ append = false, offset = 0 }: { append?: boolean; offset?: number } = {}) => {
    setApprovedLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/ventas/pedidos/autorizados?limit=100&offset=${offset}`, { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || "No se pudo cargar el listado de pedidos autorizados.");
      const nextItems = Array.isArray(body?.items) ? body.items as ApprovedOrder[] : [];
      setApprovedItems((current) => append ? [...current, ...nextItems] : nextItems);
      setApprovedOffset(offset + nextItems.length);
      setApprovedHasMore(body?.has_more === true);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "No se pudo cargar el listado de pedidos autorizados.");
    } finally {
      setApprovedLoading(false);
      setApprovedLoaded(true);
    }
  }, []);

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

  useEffect(() => {
    if (activeTab === "autorizados" && !approvedLoaded && !approvedLoading) void loadApproved();
  }, [activeTab, approvedLoaded, approvedLoading, loadApproved]);

  const printSingleApprovedOrder = (order: ApprovedOrder) => {
    if (!printBrand || !printApprovedOrder(order, printBrand)) {
      setError(printBrand ? "Permite las ventanas emergentes para imprimir el pedido." : "No se pudo cargar el formato de impresión de la empresa.");
    }
  };

  const printPendingOrder = (item: QueueItem) => {
    if (!printBrand) {
      setError("No se pudo cargar el formato de impresión de la empresa.");
      return;
    }
    const inventory = getInventoryProjection(item);
    const findings: Array<{ level: "Bloqueo" | "Alerta"; text: string }> = [];
    if (!item.cuenta_crm_asociada) findings.push({ level: "Bloqueo", text: "No hay una cuenta CRM asociada al cliente." });
    if (item.items.some((line) => differsFromAcceptedQuote(line))) findings.push({ level: "Bloqueo", text: "Una o más partidas, cantidades, productos o precios difieren de la cotización aceptada." });
    if (item.items.some((line) => line.cotizacion_descuento_porcentaje != null && line.cotizacion_limite_descuento_porcentaje != null && Number(line.cotizacion_descuento_porcentaje) > Number(line.cotizacion_limite_descuento_porcentaje))) findings.push({ level: "Bloqueo", text: "Hay un descuento que supera el límite registrado." });
    if (!item.permite_entrega_parcial && inventory.some((product) => product.pendienteDespues > 0)) findings.push({ level: "Bloqueo", text: "El inventario no cubre la cantidad solicitada y no se permiten entregas parciales." });
    if (inventory.some((product) => product.pendienteDespues > 0) && item.permite_entrega_parcial) findings.push({ level: "Alerta", text: "Hay faltantes de inventario; se reservaría parcialmente y el remanente quedaría pendiente." });
    if (item.items.some((line) => !line.catalog_item_id)) findings.push({ level: "Alerta", text: "Hay partidas sin artículo de catálogo asociado; no se puede validar ni reservar ese inventario." });
    if (item.items.some((line) => line.tipo_catalogo === "producto" && !line.maneja_inventario)) findings.push({ level: "Alerta", text: "Hay productos con Maneja inventario desactivado." });
    if (!item.condicion_pago) findings.push({ level: "Alerta", text: "No se especificó una condición de pago." });
    if (item.items.some((line) => line.maneja_inventario) && !item.domicilio_entrega) findings.push({ level: "Alerta", text: "No se registró un domicilio de entrega." });
    if (!item.cliente_datos.rfc || !item.cliente_datos.codigo_postal) findings.push({ level: "Alerta", text: "Los datos fiscales disponibles están incompletos; confirma si aplican a esta operación." });

    const sections = [
      {
        title: "1. Cliente",
        details: [
          `Cuenta CRM asociada: ${item.cuenta_crm_asociada ? "Sí" : "No"}`,
          `RFC: ${item.cliente_datos.rfc || "No registrado"}`,
          `Correo de facturación: ${item.cliente_datos.correo_facturacion || "No registrado"}`,
          `Código postal: ${item.cliente_datos.codigo_postal || "No registrado"}`,
        ],
      },
      {
        title: "2. Disponibilidad y reserva estimada",
        details: inventory.length ? inventory.map((product) => `${product.descripcion}: solicitado ${formatQuantity(product.solicitado)}, disponible ahora ${formatQuantity(product.disponibleAhora)}, ya reservado ${formatQuantity(product.reservado)}, reserva adicional ${formatQuantity(product.reservaAdicional)}, pendiente ${formatQuantity(product.pendienteDespues)}, disponible después ${formatQuantity(product.disponibleDespues)}`) : item.items.some((line) => line.maneja_inventario) ? ["No se pudo calcular la disponibilidad para las partidas controladas por inventario."] : ["No hay partidas con control de inventario."],
      },
      {
        title: "3. Condiciones comerciales y entrega",
        details: [
          `Pago: ${item.condicion_pago || "No especificado"}${item.dias_credito ? ` · ${item.dias_credito} días de crédito` : ""}${item.anticipo_porcentaje != null ? ` · Anticipo ${item.anticipo_porcentaje}%` : ""}`,
          `Entrega parcial: ${item.permite_entrega_parcial ? "Permitida" : "No permitida"}`,
          `Entrega comprometida: ${item.fecha_entrega_comprometida || "No especificada"}`,
          `Domicilio: ${item.domicilio_entrega || "No especificado"}`,
          item.observaciones_comerciales || "Sin observaciones comerciales",
        ],
      },
    ];
    const documents = item.documentos.map((document) => [
      CONFIRMATION_LABELS[document.tipo_documento] || document.tipo_documento,
      document.referencia,
      document.nombre_original,
      document.observaciones,
    ].filter(Boolean).join(" · "));
    const opened = printOrderForExceptionApproval({
      folio: item.folio,
      cliente: item.cliente,
      razon_social: item.cliente_datos.razon_social,
      contacto: item.contacto,
      total: item.total,
      moneda: item.moneda,
      confirmation: CONFIRMATION_LABELS[item.forma_confirmacion || ""] || "Forma no registrada",
      confirmationDate: item.fecha_confirmacion_cliente,
      purchaseOrder: item.referencia_pedido_cliente,
      paymentTerms: item.condicion_pago,
      deliveryDate: item.fecha_entrega_comprometida,
      deliveryAddress: item.domicilio_entrega,
      documents,
      observations: item.observaciones_confirmacion,
      lines: item.items.map((line) => ({
        description: line.descripcion,
        quantity: `${line.cantidad}`,
        price: formatMoney(line.precio_unitario, line.moneda),
        amount: formatMoney(line.subtotal, line.moneda),
        verification: differsFromAcceptedQuote(line) ? `No coincide con cotización (${line.cotizacion_cantidad ?? "—"} × ${formatMoney(line.cotizacion_precio_unitario, line.cotizacion_moneda)})` : "Coincide con cotización aceptada",
      })),
      sections,
      findings,
    }, printBrand);
    if (!opened) setError("Permite las ventanas emergentes para imprimir la orden de venta.");
  };

  const printAllApprovedOrders = async () => {
    if (!printBrand) {
      setError("No se pudo cargar el formato de impresión de la empresa.");
      return;
    }
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      setError("Permite las ventanas emergentes para imprimir el listado.");
      return;
    }
    printWindow.opener = null;
    setApprovedLoading(true);
    setError(null);
    try {
      let allOrders = [...approvedItems];
      let offset = approvedOffset;
      let hasMore = approvedHasMore;
      while (hasMore) {
        const response = await fetch(`/api/ventas/pedidos/autorizados?limit=100&offset=${offset}`, { cache: "no-store" });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body?.error || "No se pudo completar el listado de pedidos autorizados.");
        const nextItems = Array.isArray(body?.items) ? body.items as ApprovedOrder[] : [];
        allOrders = [...allOrders, ...nextItems];
        offset += nextItems.length;
        hasMore = body?.has_more === true;
        if (nextItems.length === 0) break;
      }
      setApprovedItems(allOrders);
      setApprovedOffset(offset);
      setApprovedHasMore(false);
      printApprovedOrdersList(allOrders, printBrand, printWindow);
    } catch (loadError) {
      printWindow.close();
      setError(loadError instanceof Error ? loadError.message : "No se pudo imprimir el listado autorizado.");
    } finally {
      setApprovedLoading(false);
    }
  };

  const confirmOrder = async (item: QueueItem) => {
    if (hasBlockingIssues(item)) {
      setError("El pedido tiene un bloqueo visible. Devuélvelo a Comercial para corregir la cotización o revisa el inventario.");
      return;
    }
    const review = reviews[item.id] ?? EMPTY_REVIEW;
    if (Object.values(review).some((checked) => !checked)) {
      setError("Completa las cuatro revisiones antes de aprobar y liberar el pedido.");
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
          revision_partidas_validada: review.productos,
          revision_inventario_validada: review.productos,
          revision_condiciones_validada: review.entrega,
          revision_riesgos_validada: review.cliente && review.evidencia && review.entrega && review.productos,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || "No se pudo confirmar el pedido.");
      setNotice(`Pedido ${item.folio || "del cliente"} aprobado y liberado a surtido. Venta y cuenta por cobrar formalizadas.`);
      await loadQueue();
      if (approvedItems.length > 0) await loadApproved();
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

  const reviewCount = (item: QueueItem) => Object.values(reviews[item.id] ?? EMPTY_REVIEW).filter(Boolean).length;
  const needsAttention = (item: QueueItem) => hasBlockingIssues(item) || reviewCount(item) < 4;
  const visibleItems = items
    .filter((item) => {
      const needle = search.trim().toLowerCase();
      const matchesSearch = !needle || [item.folio, item.cliente, item.contacto, item.oportunidad_titulo].some((value) => value?.toLowerCase().includes(needle));
      const matchesFilter = queueFilter === "todas" || (queueFilter === "faltantes" ? needsAttention(item) : !needsAttention(item));
      return matchesSearch && matchesFilter;
    })
    .sort((a, b) => Number(needsAttention(b)) - Number(needsAttention(a)));
  const updateReview = (itemId: string, key: keyof ReviewChecklist, checked: boolean) => {
    setReviews((current) => ({ ...current, [itemId]: { ...(current[itemId] ?? EMPTY_REVIEW), [key]: checked } }));
  };

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">Revisa los cuatro puntos esenciales antes de liberar la orden.</p>
        </div>
        {activeTab === "revision" ? <Button type="button" variant="outline" onClick={() => void loadQueue()} disabled={loading}>
          {loading ? "Actualizando…" : "Actualizar"}
        </Button> : <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={() => void loadApproved()} disabled={approvedLoading}>Actualizar</Button>
          <Button type="button" onClick={() => void printAllApprovedOrders()} disabled={approvedLoading || approvedItems.length === 0 || !printBrand}><IconPrinter className="mr-2 size-4" />Imprimir listado de órdenes</Button>
        </div>}
      </div>
      {error ? <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p> : null}
      {notice ? <p role="status" className="rounded-md bg-primary/10 px-3 py-2 text-sm">{notice}</p> : null}
      {!printBrand ? <p role="status" className="text-sm text-muted-foreground">No está disponible el formato de impresión de la empresa.</p> : null}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="revision">Por revisar ({items.length})</TabsTrigger>
          <TabsTrigger value="autorizados">Órdenes autorizadas</TabsTrigger>
        </TabsList>
        <TabsContent value="revision" className="space-y-4">
      {loading && items.length === 0 ? <p className="text-sm text-muted-foreground">Cargando pedidos…</p> : null}
      {!loading && items.length === 0 && !error ? (
        <div className="rounded-xl border border-dashed p-8 text-center">
          <h2 className="font-semibold">No hay pedidos pendientes</h2>
          <p className="mt-1 text-sm text-muted-foreground">Los pedidos que Comercial envíe aparecerán aquí para revisión.</p>
        </div>
      ) : null}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[240px] flex-1">
            <IconSearch className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por folio o cliente" className="pl-8" />
          </div>
          <select className="h-10 rounded-md border bg-background px-3 text-sm" value={queueFilter} onChange={(event) => setQueueFilter(event.target.value as typeof queueFilter)} aria-label="Filtrar pedidos">
            <option value="todas">Todas</option>
            <option value="faltantes">Con faltantes</option>
            <option value="listas">Listas para aprobar</option>
          </select>
        </div>
        <p className="text-xs text-muted-foreground">{items.length} órdenes pendientes · {items.filter(needsAttention).length} con faltantes · {items.filter((item) => !needsAttention(item)).length} listas</p>
      </div>
      <div className="overflow-hidden rounded-lg border bg-card">
        {visibleItems.length === 0 ? <p className="p-6 text-center text-sm text-muted-foreground">No hay órdenes que coincidan con el filtro.</p> : visibleItems.map((item) => {
          const review = reviews[item.id] ?? EMPTY_REVIEW;
          const progress = reviewCount(item);
          const expanded = expandedId === item.id;
          const inventoryProjection = getInventoryProjection(item);
          const productMismatch = item.items.some((line) => differsFromAcceptedQuote(line));
          const deliveryRequired = item.items.some((line) => line.maneja_inventario);
          const statusText = hasBlockingIssues(item) ? "Bloqueada" : progress === 4 ? "Lista" : "Pendiente";
          const statusClass = hasBlockingIssues(item) ? "text-destructive" : progress === 4 ? "text-emerald-600" : "text-amber-600";
          return (
            <article key={item.id} className="border-b last:border-b-0">
              <button type="button" className="flex w-full items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-muted/40" onClick={() => setExpandedId(expanded ? null : item.id)} aria-expanded={expanded}>
                <IconChevronDown className={"size-4 shrink-0 text-muted-foreground transition-transform " + (expanded ? "rotate-180" : "")} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="font-medium">{item.folio || item.oportunidad_titulo || "Pedido por formalizar"}</span>
                    <span className="truncate text-sm text-muted-foreground">{item.cliente || item.contacto || "Cliente sin nombre"}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{item.items.length} partidas · {formatMoney(item.total, item.moneda)}{item.contacto && item.cliente ? " · " + item.contacto : ""}</p>
                </div>
                <span className="hidden text-xs text-muted-foreground sm:inline">{progress}/4</span>
                <Badge variant="outline" className={statusClass}>{statusText}</Badge>
              </button>
              {expanded ? (
                <div className="border-t bg-muted/10">
                  <div className="divide-y">
                    <ReviewRow title="Cliente y facturación" summary={(item.cliente || item.contacto || "Cliente sin nombre") + " · " + (item.cliente_datos.rfc ? "RFC " + item.cliente_datos.rfc : "RFC pendiente") + " · " + (item.cliente_datos.codigo_postal ? "C.P. " + item.cliente_datos.codigo_postal : "C.P. pendiente")} checked={review.cliente} onCheckedChange={(checked) => updateReview(item.id, "cliente", checked)} disabled={pendingId === item.id}>
                      <FieldStatus label="Cuenta CRM" value={item.cuenta_crm_asociada ? "Asociada" : null} />
                      <FieldStatus label="Razón social" value={item.cliente_datos.razon_social} />
                      <FieldStatus label="RFC" value={item.cliente_datos.rfc} />
                      <FieldStatus label="Correo de facturación" value={item.cliente_datos.correo_facturacion} />
                      <FieldStatus label="Código postal" value={item.cliente_datos.codigo_postal} />
                      {!item.cuenta_crm_asociada ? <p className="font-medium text-destructive">Bloqueante: no hay una cuenta CRM asociada.</p> : null}
                    </ReviewRow>
                    <ReviewRow title="OC confirmada y evidencias" summary={(item.referencia_pedido_cliente ? "OC " + item.referencia_pedido_cliente : "Sin OC") + " · " + item.documentos.length + " evidencia" + (item.documentos.length === 1 ? "" : "s") + " · " + (CONFIRMATION_LABELS[item.forma_confirmacion || ""] || "Forma no registrada")} checked={review.evidencia} onCheckedChange={(checked) => updateReview(item.id, "evidencia", checked)} disabled={pendingId === item.id}>
                      <FieldStatus label="Forma de confirmación" value={CONFIRMATION_LABELS[item.forma_confirmacion || ""] || null} />
                      <FieldStatus label="Referencia OC" value={item.referencia_pedido_cliente} />
                      <FieldStatus label="Fecha de confirmación" value={item.fecha_confirmacion_cliente} />
                      <FieldStatus label="Evidencias" value={item.documentos.length ? `${item.documentos.length} archivo(s)` : null} />
                      {item.documentos.map((document) => <p key={document.id} className="text-muted-foreground">{CONFIRMATION_LABELS[document.tipo_documento] || "Otro"}{document.nombre_original ? <a className="ml-2 text-primary underline underline-offset-4" href={"/api/embudo/quotes/" + item.cotizacion_id + "/pedido/orden-compra?documento_id=" + encodeURIComponent(document.id)} target="_blank" rel="noreferrer">Ver archivo</a> : null}</p>)}
                    </ReviewRow>
                    <ReviewRow title="Datos de entrega" summary={deliveryRequired ? (item.domicilio_entrega_completo ? item.domicilio_entrega || "Dirección completa" : "Faltan datos de entrega") : "No aplica a estas partidas"} checked={review.entrega} onCheckedChange={(checked) => updateReview(item.id, "entrega", checked)} disabled={pendingId === item.id}>
                      <FieldStatus label="País" value={deliveryRequired ? item.domicilio_entrega_pais : "No aplica"} />
                      <FieldStatus label="Estado" value={deliveryRequired ? item.domicilio_entrega_entidad : "No aplica"} />
                      <FieldStatus label="Municipio" value={deliveryRequired ? item.domicilio_entrega_municipio : "No aplica"} />
                      <FieldStatus label="Vialidad" value={deliveryRequired ? item.domicilio_entrega_nombre_vialidad : "No aplica"} />
                      <FieldStatus label="Número exterior" value={deliveryRequired ? item.domicilio_entrega_numero_exterior : "No aplica"} />
                      <FieldStatus label="Número interior" value={deliveryRequired ? item.domicilio_entrega_numero_interior || "No especificado" : "No aplica"} />
                      <FieldStatus label="Colonia" value={deliveryRequired ? item.domicilio_entrega_colonia : "No aplica"} />
                      <FieldStatus label="Código postal" value={deliveryRequired ? item.domicilio_entrega_codigo_postal : "No aplica"} />
                      {deliveryRequired && !item.domicilio_entrega_completo ? <p className="font-medium text-destructive">Bloqueante: faltan {item.domicilio_entrega_faltantes.join(", ") || "datos de entrega"}.</p> : null}
                      {item.domicilio_entrega_referencias ? <p className="text-muted-foreground">Referencias: {item.domicilio_entrega_referencias}</p> : null}
                    </ReviewRow>
                    <ReviewRow title="Productos y cantidades" summary={item.items.length + " partida" + (item.items.length === 1 ? "" : "s") + " · " + (productMismatch ? "Hay diferencias contra la cotización" : "Coinciden con la cotización aceptada")} checked={review.productos} onCheckedChange={(checked) => updateReview(item.id, "productos", checked)} disabled={pendingId === item.id}>
                      <FieldStatus label="Productos" value={item.items.length ? `${item.items.length} partida(s)` : null} />
                      <FieldStatus label="Cantidades y precios" value={productMismatch ? "No coinciden con la cotización" : item.items.length ? "Coinciden con la cotización aceptada" : null} warning={productMismatch} />
                      <FieldStatus label="Descuentos" value={item.items.some((line) => line.cotizacion_descuento_porcentaje != null && line.cotizacion_limite_descuento_porcentaje != null && Number(line.cotizacion_descuento_porcentaje) > Number(line.cotizacion_limite_descuento_porcentaje)) ? "Superan el límite" : "Dentro del límite"} warning={item.items.some((line) => line.cotizacion_descuento_porcentaje != null && line.cotizacion_limite_descuento_porcentaje != null && Number(line.cotizacion_descuento_porcentaje) > Number(line.cotizacion_limite_descuento_porcentaje))} />
                      {productMismatch ? <p className="font-medium text-destructive">Bloqueante: las partidas, cantidades, productos o precios no coinciden.</p> : null}
                      {item.items.length === 0 ? <p className="font-medium text-destructive">Bloqueante: la orden no tiene productos.</p> : null}
                      {inventoryProjection.some((product) => product.pendienteDespues > 0) ? <p className="text-amber-700">Faltante de inventario: {inventoryProjection.filter((product) => product.pendienteDespues > 0).length} producto(s); se valida al aprobar.</p> : null}
                      {item.items.slice(0, 3).map((line) => <p key={line.id} className="text-muted-foreground">{line.descripcion} · {line.cantidad}</p>)}
                      {item.items.length > 3 ? <p className="text-muted-foreground">y {item.items.length - 3} partida(s) más</p> : null}
                    </ReviewRow>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 border-t px-3 py-3">
                    <span className="text-xs text-muted-foreground">Revisión: {progress}/4</span>
                    <div className="flex flex-wrap justify-end gap-2">
                      <Button type="button" variant="outline" size="sm" onClick={() => printPendingOrder(item)} disabled={!printBrand}><IconPrinter className="mr-2 size-4" />Imprimir</Button>
                      {returningId === item.id ? (
                        <div className="flex w-full flex-col gap-2 sm:flex-row">
                          <select className="h-9 rounded-md border bg-background px-2 text-sm" value={returnCode} onChange={(event) => setReturnCode(event.target.value as typeof returnCode)} aria-label="Causa de devolución">
                            {RETURN_REASONS.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
                          </select>
                          <Input value={returnReason} onChange={(event) => setReturnReason(event.target.value)} maxLength={2000} placeholder="Indica qué debe corregir Comercial" />
                          <Button type="button" variant="outline" size="sm" onClick={() => void returnOrder(item)} disabled={pendingId === item.id}>Devolver</Button>
                          <Button type="button" variant="ghost" size="sm" onClick={() => { setReturningId(null); setReturnReason(""); }}>Cancelar</Button>
                        </div>
                      ) : (
                        <>
                          <Button type="button" variant="outline" size="sm" onClick={() => { setReturningId(item.id); setError(null); setReturnCode(item.cuenta_crm_asociada ? "otro" : "datos_cliente_incompletos"); setReturnReason(item.cuenta_crm_asociada ? "" : "Falta vincular la cuenta CRM real del cliente a la oportunidad."); }} disabled={pendingId === item.id}>Devolver</Button>
                          <Button type="button" size="sm" onClick={() => void confirmOrder(item)} disabled={pendingId === item.id || hasBlockingIssues(item)}>{pendingId === item.id ? "Aprobando…" : "Aprobar y liberar"}</Button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
        </TabsContent>
        <TabsContent value="autorizados" className="space-y-4">
          {approvedLoading && approvedItems.length === 0 ? <p className="text-sm text-muted-foreground">Cargando órdenes autorizadas…</p> : null}
          {!approvedLoading && approvedItems.length === 0 && !error ? <div className="rounded-xl border border-dashed p-8 text-center"><h2 className="font-semibold">Aún no hay órdenes de venta autorizadas</h2><p className="mt-1 text-sm text-muted-foreground">Las órdenes aprobadas por Operaciones aparecerán aquí.</p></div> : null}
          <div className="space-y-3">
            {approvedItems.map((order) => (
              <article key={order.id} className="flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-card p-4">
                <div className="min-w-0 space-y-1">
                  <h2 className="font-semibold">Orden de venta · {order.folio || "Sin referencia de cotización"}</h2>
                  <p className="text-sm">{order.cliente || order.razon_social || "Cliente sin nombre"}{order.contacto ? ` · ${order.contacto}` : ""}</p>
                  <p className="text-sm text-muted-foreground">Autorizado {order.autorizado_en ? `el ${new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short" }).format(new Date(order.autorizado_en))}` : ""}{order.autorizado_por ? ` por ${order.autorizado_por}` : ""}</p>
                  <p className="text-xs text-muted-foreground">OC: {order.referencia_pedido_cliente || "Sin OC"} · Logística: {order.estatus_logistico || "Pendiente"}</p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right"><p className="font-semibold">{formatMoney(order.total, order.moneda)}</p></div>
                  <Badge variant={order.estatus === "cancelado" ? "outline" : "secondary"}>{order.estatus === "cancelado" ? "Autorizado · cancelado" : "Autorizado"}</Badge>
                  <Button type="button" variant="outline" size="sm" onClick={() => printSingleApprovedOrder(order)} disabled={!printBrand}><IconPrinter className="mr-2 size-4" />Imprimir orden</Button>
                </div>
              </article>
            ))}
          </div>
          {approvedHasMore ? <div className="flex justify-center"><Button type="button" variant="outline" onClick={() => void loadApproved({ append: true, offset: approvedOffset })} disabled={approvedLoading}>{approvedLoading ? "Cargando…" : "Cargar más pedidos"}</Button></div> : null}
        </TabsContent>
      </Tabs>
    </section>
  );
}
