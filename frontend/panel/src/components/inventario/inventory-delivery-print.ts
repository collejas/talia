import { openPrintWindow, type OrderPrintBrand } from "@/components/ventas/approved-order-print";

export type DeliveryPrintOrder = {
  codigo_oportunidad: string | null;
  vendedor_nombre: string | null;
  folio: string | null;
  referencia_pedido_cliente: string | null;
  cliente: string | null;
  contacto: string | null;
  contacto_telefono: string | null;
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
  items: Array<{ id: string; descripcion: string; cantidad_pendiente: number | string }>;
};

function escapeHtml(value: unknown) {
  const replacements: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" };
  return String(value ?? "—").replace(/[&<>"']/g, (character) => replacements[character] ?? character);
}

function quantity(value: number | string) {
  return new Intl.NumberFormat("es-MX", { maximumFractionDigits: 3 }).format(Number(value) || 0);
}

function deliveryAddress(order: DeliveryPrintOrder) {
  const street = [order.domicilio_entrega_tipo_vialidad, order.domicilio_entrega_nombre_vialidad]
    .filter(Boolean)
    .join(" ");
  const number = [
    order.domicilio_entrega_numero_exterior ? `No. ext. ${order.domicilio_entrega_numero_exterior}` : "",
    order.domicilio_entrega_numero_interior ? `No. int. ${order.domicilio_entrega_numero_interior}` : "",
  ].filter(Boolean).join(", ");
  const locality = [order.domicilio_entrega_colonia, order.domicilio_entrega_municipio, order.domicilio_entrega_localidad]
    .filter(Boolean)
    .join(", ");
  const region = [order.domicilio_entrega_entidad, order.domicilio_entrega_pais, order.domicilio_entrega_codigo_postal]
    .filter(Boolean)
    .join(", ");
  const structured = [street && [street, number].filter(Boolean).join(" "), locality, region, order.domicilio_entrega_referencias ? `Referencias: ${order.domicilio_entrega_referencias}` : ""]
    .filter(Boolean);
  return structured.length ? structured : order.domicilio_entrega ? [order.domicilio_entrega] : [];
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
  const address = deliveryAddress(order).map((line) => `<div>${escapeHtml(line)}</div>`).join("") || "<div>Sin domicilio de entrega registrado</div>";
  const body = `<div class="meta"><p><strong>Oportunidad:</strong> ${escapeHtml(reference)}</p>${order.vendedor_nombre ? `<p><strong>Vendedor:</strong> ${escapeHtml(order.vendedor_nombre)}</p>` : ""}<p><strong>Cotización:</strong> ${escapeHtml(order.folio)}</p>${purchaseOrder ? `<p><strong>OC del cliente:</strong> ${escapeHtml(purchaseOrder)}</p>` : ""}<p><strong>Empresa:</strong> ${escapeHtml(order.cliente || "Sin nombre")}</p><p><strong>Fecha de entrega:</strong> ${escapeHtml(new Intl.DateTimeFormat("es-MX", { dateStyle: "medium" }).format(new Date()))}</p></div><section class="section"><h3>Destino y contacto de entrega</h3><div class="meta"><p><strong>Dirección:</strong></p><div class="address">${address}</div><p><strong>Contacto:</strong> ${escapeHtml(order.contacto || "Sin contacto registrado")}</p><p><strong>Teléfono:</strong> ${escapeHtml(order.contacto_telefono || "Sin teléfono registrado")}</p></div></section><section class="section"><h3>Mercancía entregada</h3><table><thead><tr><th>Descripción</th><th class="num">Cantidad</th></tr></thead><tbody>${rows || "<tr><td colspan=\"2\">Sin partidas</td></tr>"}</tbody></table></section><section class="section"><h3>Recepción de mercancía</h3><p>La mercancía descrita fue entregada y recibida en las cantidades indicadas, en perfectas condiciones y de conformidad por quien recibe.</p><div style="display:grid;grid-template-columns:1fr 1fr;gap:22px 30px;margin-top:34px"><p style="margin:18px 0 0">Entrega<span style="border-bottom:1px solid #334155;display:block;height:38px"></span></p><p style="margin:18px 0 0">Recibe<span style="border-bottom:1px solid #334155;display:block;height:38px"></span></p><p style="margin:18px 0 0">Nombre y firma<span style="border-bottom:1px solid #334155;display:block;height:38px"></span></p><p style="margin:18px 0 0">Fecha y hora<span style="border-bottom:1px solid #334155;display:block;height:38px"></span></p></div></section>`;
  return openPrintWindow(brand, `Entrega de mercancía · ${reference}`, body);
}
