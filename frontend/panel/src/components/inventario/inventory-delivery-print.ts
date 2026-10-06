import { openPrintWindow, type OrderPrintBrand } from "@/components/ventas/approved-order-print";

export type DeliveryPrintOrder = {
  codigo_oportunidad: string | null;
  folio: string | null;
  referencia_pedido_cliente: string | null;
  cliente: string | null;
  items: Array<{ id: string; descripcion: string; cantidad_pendiente: number | string }>;
};

function escapeHtml(value: unknown) {
  const replacements: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" };
  return String(value ?? "—").replace(/[&<>"']/g, (character) => replacements[character] ?? character);
}

function quantity(value: number | string) {
  return new Intl.NumberFormat("es-MX", { maximumFractionDigits: 3 }).format(Number(value) || 0);
}

export function printDeliveryDocument(
  order: DeliveryPrintOrder,
  enteredQuantities: Record<string, string>,
  brand: OrderPrintBrand,
) {
  const rows = order.items.map((item) => {
    const entered = Number((enteredQuantities[item.id] ?? "").replace(",", "."));
    const amount = Number.isFinite(entered) && entered > 0 ? entered : Number(item.cantidad_pendiente) || 0;
    return `<tr><td>${escapeHtml(item.descripcion)}</td><td class="num">${escapeHtml(quantity(amount))}</td></tr>`;
  }).join("");
  const reference = order.codigo_oportunidad || order.folio || "Sin referencia";
  const purchaseOrder = order.referencia_pedido_cliente?.trim();
  const body = `<div class="meta"><p><strong>Oportunidad:</strong> ${escapeHtml(reference)}</p><p><strong>Cotización:</strong> ${escapeHtml(order.folio)}</p>${purchaseOrder ? `<p><strong>OC del cliente:</strong> ${escapeHtml(purchaseOrder)}</p>` : ""}<p><strong>Cliente:</strong> ${escapeHtml(order.cliente || "Sin nombre")}</p><p><strong>Fecha de entrega:</strong> ${escapeHtml(new Intl.DateTimeFormat("es-MX", { dateStyle: "medium" }).format(new Date()))}</p></div><section class="section"><h3>Mercancía entregada</h3><table><thead><tr><th>Descripción</th><th class="num">Cantidad</th></tr></thead><tbody>${rows || "<tr><td colspan=\"2\">Sin partidas</td></tr>"}</tbody></table></section><section class="section"><h3>Recepción de mercancía</h3><p>La mercancía descrita fue entregada y recibida en las cantidades indicadas, en perfectas condiciones y de conformidad por quien recibe.</p><div style="display:grid;grid-template-columns:1fr 1fr;gap:22px 30px;margin-top:34px"><p style="margin:18px 0 0">Entrega<span style="border-bottom:1px solid #334155;display:block;height:38px"></span></p><p style="margin:18px 0 0">Recibe<span style="border-bottom:1px solid #334155;display:block;height:38px"></span></p><p style="margin:18px 0 0">Nombre y firma<span style="border-bottom:1px solid #334155;display:block;height:38px"></span></p><p style="margin:18px 0 0">Fecha y hora<span style="border-bottom:1px solid #334155;display:block;height:38px"></span></p></div></section>`;
  return openPrintWindow(brand, `Entrega de mercancía · ${reference}`, body);
}
