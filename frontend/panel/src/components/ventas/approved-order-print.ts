export type ApprovedOrderForPrint = {
  folio: string | null;
  cliente: string | null;
  razon_social: string | null;
  contacto: string | null;
  total: number | string | null;
  moneda: string | null;
  autorizado_en: string | null;
  autorizado_por: string | null;
  estatus: string | null;
  estatus_logistico: string | null;
  forma_confirmacion: string | null;
  referencia_pedido_cliente: string | null;
  fecha_orden_cliente: string | null;
  condicion_pago: string | null;
  dias_credito: number | null;
  fecha_entrega_comprometida: string | null;
  domicilio_entrega: string | null;
  documentos: Array<{ tipo_documento: string; referencia: string | null; observaciones: string | null; nombre_original: string | null }>;
  observaciones_confirmacion: string | null;
  observaciones_comerciales: string | null;
  items: Array<{
    descripcion: string;
    unidad: string | null;
    cantidad: number | string;
    cantidad_entregada: number | string;
    precio_unitario: number | string | null;
    subtotal: number | string | null;
    moneda: string | null;
  }>;
};

export type OrderPrintBrand = {
  organization_name: string;
  logo_url: string;
  primary_color: string;
  accent_color: string;
};

export type ReviewOrderPrintData = {
  folio: string | null;
  cliente: string | null;
  razon_social: string | null;
  contacto: string | null;
  total: number | string | null;
  moneda: string | null;
  confirmation: string;
  confirmationDate: string | null;
  purchaseOrder: string | null;
  paymentTerms: string | null;
  deliveryDate: string | null;
  deliveryAddress: string | null;
  documents: string[];
  observations: string | null;
  lines: Array<{ description: string; quantity: string; price: string; amount: string; verification: string }>;
  sections: Array<{ title: string; details: string[] }>;
  findings: Array<{ level: "Bloqueo" | "Alerta"; text: string }>;
};

function escapeHtml(value: unknown) {
  const escaped: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" };
  return String(value ?? "—").replace(/[&<>"']/g, (character) => escaped[character] ?? character);
}

function displayDate(value: string | null) {
  if (!value) return "No registrada";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: value.includes("T") ? "short" : undefined }).format(date);
}

function money(value: number | string | null, currency: string | null) {
  if (value === null || !Number.isFinite(Number(value))) return "—";
  try {
    return new Intl.NumberFormat("es-MX", { style: "currency", currency: currency || "MXN", maximumFractionDigits: 2 }).format(Number(value));
  } catch {
    return `${value} ${currency || "MXN"}`;
  }
}

function openPrintWindow(brand: OrderPrintBrand, title: string, body: string, targetWindow?: Window) {
  const printWindow = targetWindow ?? window.open("", "_blank");
  if (!printWindow) return false;
  printWindow.opener = null;
  const primary = /^#[\da-f]{6}$/i.test(brand.primary_color) ? brand.primary_color : "#0f172a";
  const accent = /^#[\da-f]{6}$/i.test(brand.accent_color) ? brand.accent_color : "#14b8a6";
  const logoUrl = brand.logo_url;
  const safeLogo = (logoUrl.startsWith("/") && !logoUrl.startsWith("//")) || /^https?:\/\//i.test(logoUrl) ? logoUrl : "";
  const logo = safeLogo ? `<img class="logo" src="${escapeHtml(safeLogo)}" alt="">` : "";
  printWindow.document.open();
  printWindow.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)} · ${escapeHtml(brand.organization_name)}</title><style>
@page{size:A4;margin:14mm}*{box-sizing:border-box}body{color:${primary};font:11px/1.45 Arial,sans-serif;margin:0}header{align-items:center;border-bottom:3px solid ${accent};display:flex;gap:16px;margin-bottom:18px;padding-bottom:12px}.logo{max-height:56px;max-width:140px;object-fit:contain}h1{font-size:19px;margin:0 0 3px}h2{color:${accent};font-size:15px;margin:0}.meta{color:#475569;display:grid;gap:5px 18px;grid-template-columns:repeat(2,minmax(0,1fr));margin:0 0 16px}.meta p{margin:0}.section{margin:15px 0}.section h3{border-bottom:1px solid #cbd5e1;font-size:12px;margin:0 0 7px;padding-bottom:4px}table{border-collapse:collapse;width:100%}th{background:${primary};color:white;text-align:left}th,td{border:1px solid #d8dee8;padding:6px 7px;vertical-align:top}td.num,th.num{text-align:right;white-space:nowrap}tbody tr:nth-child(even){background:#f5f7fa}.totals{margin-left:auto;margin-top:10px;max-width:290px}.totals p{display:flex;justify-content:space-between;margin:4px 0}.notes{white-space:pre-wrap}.footer{color:#64748b;font-size:9px;margin-top:22px}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}tr{break-inside:avoid;page-break-inside:avoid}}
</style></head><body><header>${logo}<div><h1>${escapeHtml(brand.organization_name)}</h1><h2>${escapeHtml(title)}</h2></div></header>${body}<p class="footer">Generado desde Tal-IA · ${escapeHtml(new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short" }).format(new Date()))}</p></body></html>`);
  printWindow.document.close();
  const images = Promise.all(Array.from(printWindow.document.images).map((image) => image.complete ? Promise.resolve() : new Promise<void>((resolve) => {
    image.onload = () => resolve(); image.onerror = () => resolve(); window.setTimeout(resolve, 2500);
  })));
  void images.then(() => { printWindow.focus(); printWindow.print(); });
  return true;
}

export function printApprovedOrder(order: ApprovedOrderForPrint, brand: OrderPrintBrand) {
  const currency = order.moneda || "MXN";
  const itemRows = order.items.map((item) => `<tr><td>${escapeHtml(item.descripcion)}</td><td>${escapeHtml(item.cantidad)} ${escapeHtml(item.unidad || "")}</td><td class="num">${escapeHtml(money(item.precio_unitario, item.moneda || currency))}</td><td>${escapeHtml(item.cantidad_entregada)} ${escapeHtml(item.unidad || "")}</td><td class="num">${escapeHtml(money(item.subtotal, item.moneda || currency))}</td></tr>`).join("");
  const evidence = order.documentos.map((document) => [document.tipo_documento, document.referencia, document.nombre_original, document.observaciones].filter(Boolean).join(" · ")).join("\n") || "Sin documento adjunto";
  const confirmationReferenceLabel = order.forma_confirmacion === "orden_compra" ? "Orden de compra" : "Referencia o respaldo";
  const confirmationReference = order.forma_confirmacion === "orden_compra" ? order.referencia_pedido_cliente : (order.documentos.map((document) => document.referencia || document.nombre_original || document.observaciones).find(Boolean) || "Registrado en evidencia");
  const body = `<div class="meta"><p><strong>Cliente:</strong> ${escapeHtml(order.cliente)}</p><p><strong>Razón social:</strong> ${escapeHtml(order.razon_social)}</p><p><strong>Contacto:</strong> ${escapeHtml(order.contacto)}</p><p><strong>Cotización:</strong> ${escapeHtml(order.folio)}</p><p><strong>Autorizado el:</strong> ${escapeHtml(displayDate(order.autorizado_en))}</p><p><strong>Autorizado por:</strong> ${escapeHtml(order.autorizado_por)}</p><p><strong>Estado logístico:</strong> ${escapeHtml(order.estatus_logistico || "Pendiente")}</p><p><strong>Confirmación:</strong> ${escapeHtml(order.forma_confirmacion)}</p><p><strong>${confirmationReferenceLabel}:</strong> ${escapeHtml(confirmationReference)}</p><p><strong>Condición de pago:</strong> ${escapeHtml(order.condicion_pago)}${order.dias_credito ? ` · ${escapeHtml(order.dias_credito)} días` : ""}</p><p><strong>Entrega comprometida:</strong> ${escapeHtml(displayDate(order.fecha_entrega_comprometida))}</p><p><strong>Domicilio de entrega:</strong> ${escapeHtml(order.domicilio_entrega)}</p></div><section class="section"><h3>Partidas y entregas</h3><table><thead><tr><th>Descripción</th><th>Cantidad</th><th class="num">Precio unitario</th><th>Entregado</th><th class="num">Importe</th></tr></thead><tbody>${itemRows || "<tr><td colspan=\"5\">Sin partidas</td></tr>"}</tbody></table><div class="totals"><p><strong>Total:</strong><strong>${escapeHtml(money(order.total, currency))}</strong></p></div></section><section class="section"><h3>Evidencia registrada</h3><p class="notes">${escapeHtml(evidence)}</p></section><section class="section"><h3>Observaciones</h3><p class="notes">${escapeHtml([order.observaciones_confirmacion, order.observaciones_comerciales].filter(Boolean).join("\n") || "Sin observaciones")}</p></section>`;
  const signature = `<section class="section"><h3>Autorización de la orden de venta</h3><div style="display:grid;grid-template-columns:1fr 1fr;gap:16px 28px;margin-top:18px"><p style="margin:22px 0 0">Nombre de quien autoriza<span style="border-bottom:1px solid #334155;display:block;height:24px"></span></p><p style="margin:22px 0 0">Fecha<span style="border-bottom:1px solid #334155;display:block;height:24px"></span></p><p style="grid-column:1/-1;margin:22px 0 0">Firma de autorización<span style="border-bottom:1px solid #334155;display:block;height:54px"></span></p></div></section>`;
  return openPrintWindow(brand, `Orden de venta · ${order.folio || "Sin referencia"}`, `${body}${signature}`);
}

export function printOrderForExceptionApproval(order: ReviewOrderPrintData, brand: OrderPrintBrand) {
  const lineRows = order.lines.map((line) => `<tr><td>${escapeHtml(line.description)}</td><td>${escapeHtml(line.quantity)}</td><td class="num">${escapeHtml(line.price)}</td><td class="num">${escapeHtml(line.amount)}</td><td>${escapeHtml(line.verification)}</td></tr>`).join("");
  const details = [
    ["Cliente", order.cliente], ["Razón social", order.razon_social], ["Contacto", order.contacto],
    ["Referencia de cotización", order.folio], ["Total", money(order.total, order.moneda)],
    ["Forma de confirmación", order.confirmation], ["Fecha de confirmación", displayDate(order.confirmationDate)],
    ["Orden de compra", order.purchaseOrder],
    ["Condiciones de pago", order.paymentTerms], ["Entrega comprometida", displayDate(order.deliveryDate)],
    ["Domicilio de entrega", order.deliveryAddress],
  ].map(([label, value]) => `<p><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}</p>`).join("");
  const sections = order.sections.map((section) => `<section class="section"><h3>${escapeHtml(section.title)}</h3><ul>${section.details.map((detail) => `<li>${escapeHtml(detail)}</li>`).join("") || "<li>Sin observaciones registradas</li>"}</ul></section>`).join("");
  const findings = order.findings.map((finding) => `<li><strong>${escapeHtml(finding.level)}:</strong> ${escapeHtml(finding.text)}</li>`).join("");
  const documents = order.documents.length ? order.documents.map(escapeHtml).join("<br>") : "Sin archivo adjunto";
  const signature = `<section class="section"><h3>Autorización excepcional de la orden de venta</h3><p>Motivo y condiciones de la excepción:</p><div style="border-bottom:1px solid #64748b;height:52px"></div><div style="display:grid;grid-template-columns:1fr 1fr;gap:16px 28px;margin-top:20px"><p style="margin:20px 0 0">Nombre de quien autoriza<span style="border-bottom:1px solid #334155;display:block;height:24px"></span></p><p style="margin:20px 0 0">Fecha<span style="border-bottom:1px solid #334155;display:block;height:24px"></span></p><p style="grid-column:1/-1;margin:20px 0 0">Firma de autorización<span style="border-bottom:1px solid #334155;display:block;height:54px"></span></p></div><p class="footer">La firma documenta una autorización manual; no modifica por sí sola el estado ni las validaciones registradas en Tal-IA.</p></section>`;
  const body = `<div class="meta">${details}</div><section class="section"><h3>Partidas</h3><table><thead><tr><th>Descripción</th><th>Cantidad</th><th class="num">Precio unitario</th><th class="num">Importe</th><th>Revisión</th></tr></thead><tbody>${lineRows || "<tr><td colspan=\"5\">Sin partidas</td></tr>"}</tbody></table><div class="totals"><p><strong>Total:</strong><strong>${escapeHtml(money(order.total, order.moneda))}</strong></p></div></section><section class="section"><h3>Evidencia del cliente</h3><p class="notes">${documents}</p>${order.observations ? `<p class="notes"><strong>Observaciones:</strong> ${escapeHtml(order.observations)}</p>` : ""}</section>${sections}<section class="section"><h3>Bloqueos y alertas detectados</h3><ul>${findings || "<li>No se detectan bloqueos ni alertas.</li>"}</ul></section>${signature}`;
  return openPrintWindow(brand, `Revisión y autorización · Orden de venta ${order.folio || "sin referencia"}`, body);
}

export function printApprovedOrdersList(orders: ApprovedOrderForPrint[], brand: OrderPrintBrand, targetWindow?: Window) {
  const rows = orders.map((order) => `<tr><td>${escapeHtml(order.folio)}</td><td>${escapeHtml(displayDate(order.autorizado_en))}</td><td>${escapeHtml(order.cliente || order.razon_social)}</td><td>${escapeHtml(order.referencia_pedido_cliente)}</td><td>${escapeHtml(order.autorizado_por)}</td><td>${escapeHtml(order.estatus_logistico || "Pendiente")}</td><td class="num">${escapeHtml(money(order.total, order.moneda))}</td></tr>`).join("");
  const body = `<section class="section"><p>Órdenes de venta autorizadas: <strong>${orders.length}</strong></p><table><thead><tr><th>Referencia de cotización</th><th>Autorizado</th><th>Cliente</th><th>OC cliente</th><th>Autorizó</th><th>Logística</th><th class="num">Total</th></tr></thead><tbody>${rows || "<tr><td colspan=\"7\">No hay órdenes autorizadas</td></tr>"}</tbody></table></section>`;
  return openPrintWindow(brand, "Listado de órdenes de venta autorizadas", body, targetWindow);
}
