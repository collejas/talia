type AnyRecord = Record<string, unknown>

export type PurchaseOrderPrintBrand = {
  organization_name: string
  logo_url: string
  primary_color: string
  accent_color: string
}

function text(value: unknown, fallback = "—") {
  if (value === null || value === undefined || value === "") return fallback
  if (typeof value === "object") return fallback
  return String(value)
}

function escapeHtml(value: unknown) {
  const replacements: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }
  return String(value ?? "—").replace(/[&<>"']/g, (character) => replacements[character] ?? character)
}

function money(value: unknown, currency: string) {
  const amount = Number(value)
  if (!Number.isFinite(amount)) return "—"
  try {
    return new Intl.NumberFormat("es-MX", { style: "currency", currency, maximumFractionDigits: 2 }).format(amount)
  } catch {
    return `${amount.toFixed(2)} ${currency}`
  }
}

function date(value: unknown) {
  if (!value) return "—"
  const parsed = new Date(String(value))
  return Number.isNaN(parsed.getTime())
    ? text(value)
    : new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: String(value).includes("T") ? "short" : undefined }).format(parsed)
}

function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—"
  if (Array.isArray(value)) return value.map((entry) => displayValue(entry)).filter((entry) => entry !== "—").join(", ") || "—"
  if (typeof value === "object") {
    const record = value as AnyRecord
    return text(record.nombre ?? record.descripcion ?? record.codigo ?? record.valor)
  }
  if (typeof value === "boolean") return value ? "Sí" : "No"
  return text(value)
}

function detailRows(record: AnyRecord, currency: string, labels: Array<[string, string]>) {
  return labels
    .map(([label, key]) => {
      const raw = record[key]
      const value = typeof raw === "number" && key.startsWith("monto_") ? money(raw, currency) : displayValue(raw)
      return value === "—" ? "" : `<p><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}</p>`
    })
    .filter(Boolean)
    .join("")
}

export function printPurchaseOrder(order: AnyRecord, brand: PurchaseOrderPrintBrand, targetWindow?: Window) {
  const printWindow = targetWindow ?? window.open("", "_blank")
  if (!printWindow) return false
  printWindow.opener = null

  const primary = /^#[\da-f]{6}$/i.test(brand.primary_color) ? brand.primary_color : "#0f172a"
  const accent = /^#[\da-f]{6}$/i.test(brand.accent_color) ? brand.accent_color : "#14b8a6"
  const logoUrl = brand.logo_url
  const safeLogo = (logoUrl.startsWith("/") && !logoUrl.startsWith("//")) || /^https?:\/\//i.test(logoUrl) ? logoUrl : ""
  const logo = safeLogo ? `<img class="logo" src="${escapeHtml(safeLogo)}" alt="">` : ""
  const currency = text(order.moneda, "MXN")
  const supplier = (order.proveedor && typeof order.proveedor === "object" ? order.proveedor : {}) as AnyRecord
  const warehouse = (order.almacen && typeof order.almacen === "object" ? order.almacen : {}) as AnyRecord
  const conditions = (order.condiciones_pago && typeof order.condiciones_pago === "object" ? order.condiciones_pago : {}) as AnyRecord
  const commercial = (order.condiciones_comerciales && typeof order.condiciones_comerciales === "object" ? order.condiciones_comerciales : {}) as AnyRecord
  const logistics = (order.logistica && typeof order.logistica === "object" ? order.logistica : {}) as AnyRecord
  const items = Array.isArray(order.items) ? order.items.filter((item): item is AnyRecord => Boolean(item) && typeof item === "object") : []
  const rows = items.map((item) => {
    const catalogItem = (item.catalog_item && typeof item.catalog_item === "object" ? item.catalog_item : {}) as AnyRecord
    const description = text(item.descripcion || catalogItem.nombre, "Producto")
    const metadata = [item.marca, item.modelo, item.fabricante].filter(Boolean).map((value) => escapeHtml(value)).join(" · ")
    return `<tr><td>${escapeHtml(item.numero_partida ?? "—")}</td><td><strong>${escapeHtml(description)}</strong>${metadata ? `<br><span class="muted">${metadata}</span>` : ""}</td><td class="num">${escapeHtml(item.cantidad_solicitada)}</td><td>${escapeHtml(item.unidad)}</td><td class="num">${escapeHtml(money(item.costo_unitario, currency))}</td><td class="num">${escapeHtml(item.descuento_porcentaje ?? 0)}%</td><td class="num">${escapeHtml(money(item.subtotal, currency))}</td><td class="num">${escapeHtml(money(item.impuestos, currency))}</td><td class="num">${escapeHtml(money(item.total, currency))}</td></tr>`
  }).join("")
  const title = `Orden de compra ${text(order.folio, "")}`.trim()
  const supplierName = text(supplier.nombre_comercial ?? supplier.razon_social, "Proveedor")
  const paymentDetails = detailRows(conditions, currency, [
    ["Forma de pago", "forma_pago"], ["Moneda de pago", "moneda_pago"], ["Anticipo", "monto_anticipo"],
    ["Porcentaje de anticipo", "porcentaje_anticipo"], ["Saldo", "monto_saldo"], ["Días de crédito", "dias_credito"],
    ["Momento de pago", "momento_pago_saldo"], ["Observaciones", "observaciones"],
  ])
  const commercialDetails = detailRows(commercial, currency, [
    ["Incoterm", "incoterm_codigo"], ["Versión Incoterm", "incoterm_version"], ["Lugar Incoterm", "lugar_incoterm"],
    ["Responsable de flete", "responsable_flete"], ["Responsable de seguro", "responsable_seguro"],
    ["Embarques parciales", "permite_embarques_parciales"], ["Transbordos", "permite_transbordos"], ["Observaciones", "observaciones"],
  ])
  const logisticsDetails = detailRows(logistics, currency, [
    ["Modo de transporte", "modo_transporte_codigo"], ["Embarque requerido", "fecha_requerida_embarque"],
    ["Arribo estimado", "fecha_estimada_arribo"], ["Origen", "puerto_origen"], ["Destino", "puerto_destino"],
    ["Lugar de entrega", "lugar_entrega_final"], ["Dirección", "direccion_entrega"], ["Tracking", "tracking"],
  ])
  const body = `<header>${logo}<div><h1>${escapeHtml(brand.organization_name)}</h1><h2>Orden de compra</h2><div class="folio">${escapeHtml(order.folio)}</div></div><div class="status">${escapeHtml(order.estado)}</div></header>
<section class="meta"><div><h3>Proveedor</h3><p class="supplier">${escapeHtml(supplierName)}</p><p><strong>Clave:</strong> ${escapeHtml(supplier.codigo_proveedor)}</p><p><strong>Referencia externa:</strong> ${escapeHtml(order.referencia_externa)}</p></div><div><h3>Datos de la orden</h3><p><strong>Emisión:</strong> ${escapeHtml(date(order.fecha_emision))}</p><p><strong>Entrega estimada:</strong> ${escapeHtml(date(order.fecha_entrega_estimada))}</p><p><strong>Vigencia:</strong> ${escapeHtml(date(order.vigencia_hasta))}</p><p><strong>Operación:</strong> ${escapeHtml(text(order.tipo_operacion, "nacional"))}</p><p><strong>Almacén destino:</strong> ${escapeHtml(warehouse.nombre)}</p></div></section>
<section class="section"><h3>Partidas</h3><table><thead><tr><th>#</th><th>Producto / descripción</th><th class="num">Cantidad</th><th>Unidad</th><th class="num">Costo unitario</th><th class="num">Descuento</th><th class="num">Subtotal</th><th class="num">Impuestos</th><th class="num">Total</th></tr></thead><tbody>${rows || "<tr><td colspan=\"9\">Sin partidas</td></tr>"}</tbody></table><div class="totals"><p><span>Subtotal</span><strong>${escapeHtml(money(order.subtotal, currency))}</strong></p><p><span>Descuento</span><strong>${escapeHtml(money(order.descuento_total, currency))}</strong></p><p><span>Impuestos</span><strong>${escapeHtml(money(order.impuestos_total, currency))}</strong></p><p class="grand-total"><span>Total ${escapeHtml(currency)}</span><strong>${escapeHtml(money(order.total, currency))}</strong></p></div></section>
${paymentDetails ? `<section class="section"><h3>Condiciones de pago</h3><div class="details">${paymentDetails}</div></section>` : ""}${commercialDetails ? `<section class="section"><h3>Condiciones comerciales</h3><div class="details">${commercialDetails}</div></section>` : ""}${logisticsDetails ? `<section class="section"><h3>Logística</h3><div class="details">${logisticsDetails}</div></section>` : ""}
<section class="section"><h3>Entrega y observaciones</h3><p><strong>Instrucciones de entrega:</strong> ${escapeHtml(order.instrucciones_entrega)}</p><p class="notes">${escapeHtml(order.observaciones)}</p></section><footer>Documento generado desde Tal-IA · ${escapeHtml(new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short" }).format(new Date()))}</footer>`

  printWindow.document.open()
  printWindow.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)}</title><style>
@page{size:A4 landscape;margin:12mm}*{box-sizing:border-box}body{color:#172033;font:10px/1.45 Arial,sans-serif;margin:0}header{align-items:center;border-bottom:3px solid ${accent};display:flex;gap:16px;margin-bottom:18px;padding-bottom:12px}.logo{max-height:58px;max-width:150px;object-fit:contain}h1{font-size:19px;margin:0 0 3px;color:${primary}}h2{color:${accent};font-size:14px;margin:0}.folio{font-family:monospace;font-size:11px;margin-top:4px}.status{border:1px solid #cbd5e1;border-radius:999px;margin-left:auto;padding:5px 12px;text-transform:capitalize}.meta{display:grid;gap:18px;grid-template-columns:1fr 1fr;margin-bottom:18px}.meta>div,.section{border:1px solid #d8dee8;border-radius:6px;padding:10px 12px}.meta h3,.section h3{color:${primary};font-size:11px;margin:0 0 8px}.meta p,.details p,.section>p{margin:3px 0}.supplier{font-size:13px;font-weight:700}table{border-collapse:collapse;width:100%}th{background:${primary};color:#fff;text-align:left}th,td{border:1px solid #d8dee8;padding:6px;vertical-align:top}td.num,th.num{text-align:right;white-space:nowrap}.muted{color:#64748b;font-size:9px}.totals{margin:10px 0 0 auto;max-width:300px}.totals p{display:flex;justify-content:space-between;margin:3px 0}.grand-total{border-top:2px solid ${accent};font-size:13px;padding-top:6px}.section{margin:12px 0}.details{display:grid;gap:3px 20px;grid-template-columns:1fr 1fr}.notes{min-height:20px;white-space:pre-wrap}footer{border-top:1px solid #d8dee8;color:#64748b;font-size:8px;margin-top:18px;padding-top:7px}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}tr{break-inside:avoid;page-break-inside:avoid}}
</style></head><body>${body}</body></html>`)
  printWindow.document.close()
  const images = Promise.all(Array.from(printWindow.document.images).map((image) => image.complete ? Promise.resolve() : new Promise<void>((resolve) => {
    image.onload = () => resolve()
    image.onerror = () => resolve()
    window.setTimeout(resolve, 2500)
  })))
  void images.then(() => { printWindow.focus(); printWindow.print() })
  return true
}

export function printImportPedimento(pedimento: AnyRecord, brand: PurchaseOrderPrintBrand, targetWindow?: Window) {
  const printWindow = targetWindow ?? window.open("", "_blank")
  if (!printWindow) return false
  printWindow.opener = null
  const primary = /^#[\da-f]{6}$/i.test(brand.primary_color) ? brand.primary_color : "#0f172a"
  const accent = /^#[\da-f]{6}$/i.test(brand.accent_color) ? brand.accent_color : "#14b8a6"
  const currency = text(pedimento.moneda, "MXN")
  const agent = (pedimento.agente_aduanal && typeof pedimento.agente_aduanal === "object" ? pedimento.agente_aduanal : {}) as AnyRecord
  const orders = Array.isArray(pedimento.ordenes_compra) ? pedimento.ordenes_compra.filter((row): row is AnyRecord => Boolean(row) && typeof row === "object") : []
  const expenses = Array.isArray(pedimento.gastos) ? pedimento.gastos.filter((row): row is AnyRecord => Boolean(row) && typeof row === "object") : []
  const prorrateos = Array.isArray(pedimento.prorrateos) ? pedimento.prorrateos.filter((row): row is AnyRecord => Boolean(row) && typeof row === "object") : []
  const logoUrl = brand.logo_url
  const safeLogo = (logoUrl.startsWith("/") && !logoUrl.startsWith("//")) || /^https?:\/\//i.test(logoUrl) ? logoUrl : ""
  const logo = safeLogo ? `<img class="logo" src="${escapeHtml(safeLogo)}" alt="">` : ""
  const orderRows = orders.map((row) => {
    const order = (row.orden_compra && typeof row.orden_compra === "object" ? row.orden_compra : row) as AnyRecord
    return `<tr><td>${escapeHtml(order.folio)}</td><td>${escapeHtml(row.rol)}</td><td>${escapeHtml(order.estado)}</td><td class="num">${escapeHtml(money(order.total, text(order.moneda, currency)))}</td></tr>`
  }).join("")
  const expenseRows = expenses.map((row) => `<tr><td>${escapeHtml(row.tipo_gasto)}</td><td>${escapeHtml(row.descripcion)}</td><td>${escapeHtml(date(row.fecha_gasto))}</td><td>${escapeHtml(row.estado)}</td><td class="num">${escapeHtml(money(row.monto_mxn ?? row.monto, text(row.moneda, currency)))}</td></tr>`).join("")
  const prorrateoRows = prorrateos.map((row, index) => {
    const item = (row.orden_compra_item && typeof row.orden_compra_item === "object" ? row.orden_compra_item : {}) as AnyRecord
    const order = (row.orden_compra && typeof row.orden_compra === "object" ? row.orden_compra : {}) as AnyRecord
    const quantity = Number(item.cantidad_solicitada ?? item.cantidad_recibida ?? 0)
    const baseUnit = Number(item.costo_unitario ?? 0) * (Number(order.tipo_cambio_referencia) || 1)
    const extraUnit = Number(row.costo_unitario_adicional ?? 0)
    return `<tr><td>${index + 1}</td><td>${escapeHtml(order.folio)}</td><td>${escapeHtml(item.numero_partida)}</td><td>${escapeHtml(item.descripcion)}</td><td class="num">${escapeHtml(Number.isFinite(quantity) ? quantity.toFixed(3) : "0")}</td><td class="num">${escapeHtml(money(baseUnit, "MXN"))}</td><td class="num">${escapeHtml(money(extraUnit, "MXN"))}</td><td class="num">${escapeHtml(money(baseUnit + extraUnit, "MXN"))}</td></tr>`
  }).join("")
  const title = `Pedimento ${text(pedimento.numero_pedimento, "")}`.trim()
  const content = `<header>${logo}<div><h1>${escapeHtml(brand.organization_name)}</h1><h2>Pedimento de importación</h2><div class="folio">${escapeHtml(pedimento.numero_pedimento)}</div></div><div class="status">${escapeHtml(pedimento.estado)}</div></header>
<section class="meta"><div><h3>Datos del pedimento</h3><p><strong>Embarque:</strong> ${escapeHtml(pedimento.embarque)}</p><p><strong>Fecha:</strong> ${escapeHtml(date(pedimento.fecha_pedimento))}</p><p><strong>Presentación:</strong> ${escapeHtml(date(pedimento.fecha_presentacion))}</p><p><strong>Liberación:</strong> ${escapeHtml(date(pedimento.fecha_liberacion))}</p><p><strong>Moneda:</strong> ${escapeHtml(currency)} · <strong>Tipo de cambio:</strong> ${escapeHtml(pedimento.tipo_cambio)}</p></div><div><h3>Agente aduanal</h3><p class="agent">${escapeHtml(agent.nombre ?? agent.razon_social)}</p><p><strong>Patente:</strong> ${escapeHtml(agent.patente)}</p><p><strong>RFC:</strong> ${escapeHtml(agent.rfc)}</p><p><strong>Contacto:</strong> ${escapeHtml(agent.contacto)}</p><p><strong>Teléfono:</strong> ${escapeHtml(agent.telefono)} · <strong>Correo:</strong> ${escapeHtml(agent.email)}</p></div></section>
<section class="section"><h3>Órdenes de compra ligadas</h3><table><thead><tr><th>Folio</th><th>Relación</th><th>Estado</th><th class="num">Total</th></tr></thead><tbody>${orderRows || "<tr><td colspan=\"4\">No hay órdenes ligadas.</td></tr>"}</tbody></table></section>
<section class="section"><h3>Gastos registrados</h3><table><thead><tr><th>Tipo</th><th>Descripción</th><th>Fecha</th><th>Estado</th><th class="num">Monto</th></tr></thead><tbody>${expenseRows || "<tr><td colspan=\"5\">No hay gastos registrados.</td></tr>"}</tbody></table></section>
<section class="summary"><div><span>Subtotal aduanal</span><strong>${escapeHtml(money(pedimento.subtotal_aduanal, currency))}</strong></div><div><span>Gastos del pedimento</span><strong>${escapeHtml(money(pedimento.gastos_pedimento_total, currency))}</strong></div><div><span>Gastos de órdenes</span><strong>${escapeHtml(money(pedimento.gastos_ordenes_total, currency))}</strong></div><div class="grand"><span>Costo total prorrateable</span><strong>${escapeHtml(money(pedimento.costo_total_prorrateable, currency))}</strong></div></section>
<section class="section"><h3>Prorrateo por partida</h3><table><thead><tr><th>#</th><th>Orden</th><th>Partida</th><th>Producto</th><th class="num">Cantidad</th><th class="num">Base unit. MXN</th><th class="num">Costo aduanal unit. MXN</th><th class="num">Costo unit. total MXN</th></tr></thead><tbody>${prorrateoRows || "<tr><td colspan=\"8\">No hay prorrateo calculado.</td></tr>"}</tbody></table></section>
<section class="section"><h3>Observaciones</h3><p class="notes">${escapeHtml(pedimento.observaciones)}</p></section><footer>Generado desde Tal-IA · ${escapeHtml(new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short" }).format(new Date()))}</footer>`
  printWindow.document.open()
  printWindow.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>@page{size:A4 landscape;margin:12mm}*{box-sizing:border-box}body{color:#172033;font:10px/1.45 Arial,sans-serif;margin:0}header{align-items:center;border-bottom:3px solid ${accent};display:flex;gap:16px;margin-bottom:16px;padding-bottom:10px}.logo{max-height:55px;max-width:140px;object-fit:contain}h1{color:${primary};font-size:18px;margin:0 0 3px}h2{color:${accent};font-size:13px;margin:0}.folio{font-family:monospace;margin-top:4px}.status{border:1px solid #cbd5e1;border-radius:999px;margin-left:auto;padding:5px 12px;text-transform:capitalize}.meta{display:grid;gap:16px;grid-template-columns:1fr 1fr}.meta>div,.section{border:1px solid #d8dee8;border-radius:6px;padding:9px 11px}.meta h3,.section h3{color:${primary};font-size:11px;margin:0 0 7px}.meta p,.section p{margin:3px 0}.agent{font-size:12px;font-weight:700}table{border-collapse:collapse;width:100%}th{background:${primary};color:#fff;text-align:left}th,td{border:1px solid #d8dee8;padding:5px;vertical-align:top}td.num,th.num{text-align:right;white-space:nowrap}.section{margin:10px 0}.summary{display:flex;gap:10px;margin:10px 0}.summary div{border:1px solid #d8dee8;border-radius:6px;display:flex;flex:1;flex-direction:column;padding:8px}.summary span{color:#64748b;font-size:9px}.summary strong{font-size:12px}.summary .grand{border-color:${accent}}.notes{min-height:16px;white-space:pre-wrap}footer{border-top:1px solid #d8dee8;color:#64748b;font-size:8px;margin-top:14px;padding-top:6px}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}tr{break-inside:avoid;page-break-inside:avoid}}</style></head><body>${content}</body></html>`)
  printWindow.document.close()
  const images = Promise.all(Array.from(printWindow.document.images).map((image) => image.complete ? Promise.resolve() : new Promise<void>((resolve) => {
    image.onload = () => resolve()
    image.onerror = () => resolve()
    window.setTimeout(resolve, 2500)
  })))
  void images.then(() => { printWindow.focus(); printWindow.print() })
  return true
}

export function printInventoryExistences(
  existences: AnyRecord[],
  warehouseLabel: string,
  brand: PurchaseOrderPrintBrand,
  targetWindow?: Window,
) {
  const printWindow = targetWindow ?? window.open("", "_blank")
  if (!printWindow) return false
  printWindow.opener = null
  const primary = /^#[\da-f]{6}$/i.test(brand.primary_color) ? brand.primary_color : "#0f172a"
  const accent = /^#[\da-f]{6}$/i.test(brand.accent_color) ? brand.accent_color : "#14b8a6"
  const logoUrl = brand.logo_url
  const safeLogo = (logoUrl.startsWith("/") && !logoUrl.startsWith("//")) || /^https?:\/\//i.test(logoUrl) ? logoUrl : ""
  const logo = safeLogo ? `<img class="logo" src="${escapeHtml(safeLogo)}" alt="">` : ""
  const totalActual = existences.reduce((sum, row) => sum + (Number(row.stock_actual) || 0), 0)
  const totalReserved = existences.reduce((sum, row) => sum + (Number(row.stock_reservado) || 0), 0)
  const totalAvailable = existences.reduce((sum, row) => sum + (Number(row.stock_disponible) || 0), 0)
  const alertCount = existences.filter((row) => Number(row.stock_minimo) > 0 && Number(row.stock_disponible) <= Number(row.stock_minimo)).length
  const rows = existences.map((row) => {
    const product = (row.catalog_item && typeof row.catalog_item === "object" ? row.catalog_item : {}) as AnyRecord
    const warehouse = (row.almacen && typeof row.almacen === "object" ? row.almacen : {}) as AnyRecord
    const minimum = Number(row.stock_minimo)
    const available = Number(row.stock_disponible) || 0
    const alert = Number.isFinite(minimum) && minimum > 0 && available <= minimum
    return `<tr><td>${escapeHtml(product.codigo ?? product.slug)}</td><td><strong>${escapeHtml(product.nombre ?? "Producto")}</strong></td><td>${escapeHtml(warehouse.nombre ?? warehouseLabel)}</td><td class="num">${escapeHtml((Number(row.stock_actual) || 0).toFixed(3))}</td><td class="num">${escapeHtml((Number(row.stock_reservado) || 0).toFixed(3))}</td><td class="num ${alert ? "alert" : ""}">${escapeHtml(available.toFixed(3))}</td><td class="num">${escapeHtml(minimum > 0 ? minimum.toFixed(3) : "—")}</td><td class="num">${escapeHtml(Number(row.stock_objetivo) > 0 ? Number(row.stock_objetivo).toFixed(3) : "—")}</td><td class="num">${escapeHtml(money(row.costo_ultimo, "MXN"))}</td></tr>`
  }).join("")
  const title = `Existencias · ${warehouseLabel}`
  const content = `<header>${logo}<div><h1>${escapeHtml(brand.organization_name)}</h1><h2>Existencias por almacén</h2><p>${escapeHtml(warehouseLabel)}</p></div></header><section class="summary"><div><span>Líneas de inventario</span><strong>${existences.length}</strong></div><div><span>Stock actual</span><strong>${totalActual.toFixed(3)}</strong></div><div><span>Reservado</span><strong>${totalReserved.toFixed(3)}</strong></div><div><span>Disponible</span><strong>${totalAvailable.toFixed(3)}</strong></div><div><span>Alertas de mínimo</span><strong>${alertCount}</strong></div></section><table><thead><tr><th>Código</th><th>Producto</th><th>Almacén</th><th class="num">Actual</th><th class="num">Reservado</th><th class="num">Disponible</th><th class="num">Mínimo</th><th class="num">Objetivo</th><th class="num">Costo último</th></tr></thead><tbody>${rows || "<tr><td colspan=\"9\">No hay existencias para el filtro seleccionado.</td></tr>"}</tbody></table><footer>Generado desde Tal-IA · ${escapeHtml(new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short" }).format(new Date()))}</footer>`
  printWindow.document.open()
  printWindow.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>@page{size:A4 landscape;margin:12mm}*{box-sizing:border-box}body{color:#172033;font:10px/1.45 Arial,sans-serif;margin:0}header{align-items:center;border-bottom:3px solid ${accent};display:flex;gap:14px;margin-bottom:16px;padding-bottom:10px}.logo{max-height:50px;max-width:135px;object-fit:contain}h1{color:${primary};font-size:18px;margin:0 0 3px}h2{color:${accent};font-size:13px;margin:0}header p{color:#64748b;margin:4px 0 0}.summary{display:flex;gap:8px;margin:12px 0}.summary div{border:1px solid #d8dee8;border-radius:6px;display:flex;flex:1;flex-direction:column;padding:8px}.summary span{color:#64748b;font-size:9px}.summary strong{font-size:12px}table{border-collapse:collapse;width:100%}th{background:${primary};color:#fff;text-align:left}th,td{border:1px solid #d8dee8;padding:6px;vertical-align:top}td.num,th.num{text-align:right;white-space:nowrap}.alert{color:#be123c;font-weight:700}footer{border-top:1px solid #d8dee8;color:#64748b;font-size:8px;margin-top:14px;padding-top:6px}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}tr{break-inside:avoid;page-break-inside:avoid}}</style></head><body>${content}</body></html>`)
  printWindow.document.close()
  const images = Promise.all(Array.from(printWindow.document.images).map((image) => image.complete ? Promise.resolve() : new Promise<void>((resolve) => {
    image.onload = () => resolve()
    image.onerror = () => resolve()
    window.setTimeout(resolve, 2500)
  })))
  void images.then(() => { printWindow.focus(); printWindow.print() })
  return true
}
