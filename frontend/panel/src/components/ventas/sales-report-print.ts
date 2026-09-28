export type SalesReportPrintBrand = {
  organization_name: string
  logo_url: string
  primary_color: string
  accent_color: string
}

export type SalesReportPrintSummary = {
  numero_ventas: number
  total_vendido: number | string
  total_cobrado_periodo: number | string
  saldo_pendiente: number | string
  numero_pagos_parciales: number
  numero_pendientes_pago: number
  numero_pagadas: number
}

export type SalesReportPrintPoint = { mes: string; total_vendido: number | string; total_cobrado: number | string }
export type SalesReportPrintItem = {
  id: string
  cliente_nombre: string
  codigo_oportunidad: string | null
  oportunidad_titulo: string | null
  vendedor_nombre: string
  fecha_venta: string
  total: number | string
  total_cobrado: number | string
  saldo_pendiente: number | string
  estatus: string
  moneda: string
}
export type SalesReportPrintFilters = { desde: string; hasta: string; estatus: string; vendedor: string; moneda: string }

function escapeHtml(value: unknown) {
  const replacements: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }
  return String(value ?? "—").replace(/[&<>"']/g, (character) => replacements[character] ?? character)
}

function amount(value: number | string, currency: string) {
  const number = Number(value)
  if (!Number.isFinite(number)) return "—"
  try {
    return new Intl.NumberFormat("es-MX", { style: "currency", currency, maximumFractionDigits: 2 }).format(number)
  } catch {
    return `${number.toLocaleString("es-MX", { maximumFractionDigits: 2 })} ${currency}`
  }
}

function monthLabel(value: string) {
  const [year, month] = value.split("-").map(Number)
  return new Intl.DateTimeFormat("es-MX", { month: "short", year: "2-digit" }).format(new Date(year, (month || 1) - 1, 1))
}

function dateLabel(value: string) {
  const parsed = new Date(`${value}T12:00:00`)
  return Number.isNaN(parsed.getTime()) ? value : new Intl.DateTimeFormat("es-MX", { dateStyle: "medium" }).format(parsed)
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    pendiente_pago: "Pendiente de pago",
    pago_parcial: "Pago parcial",
    pagada: "Pagada",
    cancelada: "Cancelada",
    reembolsada: "Reembolsada",
  }
  return labels[status] ?? status
}

function createChartSvg(points: SalesReportPrintPoint[], currency: string) {
  const width = 1000
  const height = 280
  const left = 66
  const right = 16
  const top = 28
  const bottom = 42
  const plotWidth = width - left - right
  const plotHeight = height - top - bottom
  const max = Math.max(1, ...points.flatMap((point) => [Number(point.total_vendido) || 0, Number(point.total_cobrado) || 0]))
  const grid = Array.from({ length: 5 }, (_, index) => {
    const value = max * (index / 4)
    const y = top + plotHeight - (index / 4) * plotHeight
    return `<line x1="${left}" y1="${y}" x2="${width - right}" y2="${y}" stroke="#dbe2ea" stroke-dasharray="4 4"/><text x="${left - 9}" y="${y + 4}" text-anchor="end" class="axis">${escapeHtml(new Intl.NumberFormat("es-MX", { notation: "compact", maximumFractionDigits: 1 }).format(value))}</text>`
  }).join("")
  const groupWidth = points.length ? plotWidth / points.length : plotWidth
  const barWidth = Math.max(24, Math.min(144, groupWidth * 0.36))
  const bars = points.map((point, index) => {
    const xCenter = left + groupWidth * (index + 0.5)
    const sold = Number(point.total_vendido) || 0
    const collected = Number(point.total_cobrado) || 0
    const soldHeight = sold / max * plotHeight
    const collectedHeight = collected / max * plotHeight
    const soldX = xCenter - barWidth - 1
    const collectedX = xCenter + 1
    const showLabel = points.length <= 12 || index % Math.ceil(points.length / 12) === 0 || index === points.length - 1
    return `<rect x="${soldX}" y="${top + plotHeight - soldHeight}" width="${barWidth}" height="${soldHeight}" rx="2" fill="#2563eb"><title>${escapeHtml(monthLabel(point.mes))} · Vendido: ${escapeHtml(amount(point.total_vendido, currency))}</title></rect><rect x="${collectedX}" y="${top + plotHeight - collectedHeight}" width="${barWidth}" height="${collectedHeight}" rx="2" fill="#14b8a6"><title>${escapeHtml(monthLabel(point.mes))} · Cobrado: ${escapeHtml(amount(point.total_cobrado, currency))}</title></rect>${showLabel ? `<text x="${xCenter}" y="${height - 17}" text-anchor="middle" class="axis">${escapeHtml(monthLabel(point.mes))}</text>` : ""}`
  }).join("")
  const empty = points.length ? "" : `<text x="${width / 2}" y="${height / 2}" text-anchor="middle" class="empty">No hay datos para graficar con estos filtros.</text>`
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Ventas y cobranza agrupadas por mes"><style>.axis{fill:#475569;font:12px Arial,sans-serif}.empty{fill:#64748b;font:16px Arial,sans-serif}</style>${grid}${bars}${empty}<g transform="translate(${width / 2 - 100},8)"><rect width="12" height="12" fill="#2563eb"/><text x="18" y="11" class="axis">Vendido</text><rect x="105" width="12" height="12" fill="#14b8a6"/><text x="123" y="11" class="axis">Cobrado</text></g></svg>`
}

export function printSalesReport(
  summary: SalesReportPrintSummary,
  series: SalesReportPrintPoint[],
  items: SalesReportPrintItem[],
  total: number,
  filters: SalesReportPrintFilters,
  sellerLabel: string,
  brand: SalesReportPrintBrand,
  targetWindow: Window,
) {
  const primary = /^#[\da-f]{6}$/i.test(brand.primary_color) ? brand.primary_color : "#0f172a"
  const accent = /^#[\da-f]{6}$/i.test(brand.accent_color) ? brand.accent_color : "#14b8a6"
  const logoUrl = brand.logo_url
  const safeLogo = (logoUrl.startsWith("/") && !logoUrl.startsWith("//")) || /^https?:\/\//i.test(logoUrl) ? logoUrl : ""
  const logo = safeLogo ? `<img src="${escapeHtml(safeLogo)}" alt="" class="logo">` : ""
  const currency = filters.moneda || "MXN"
  const filterStatus = filters.estatus === "todos" ? "Todos los estados" : statusLabel(filters.estatus)
  const filterSummary = `Periodo: ${dateLabel(filters.desde)} – ${dateLabel(filters.hasta)} · Vendedor: ${sellerLabel} · Estado: ${filterStatus} · Moneda: ${currency}`
  const rows = items.map((item) => `<tr><td>${escapeHtml(dateLabel(item.fecha_venta.slice(0, 10)))}</td><td>${escapeHtml(item.cliente_nombre)}</td><td>${escapeHtml([item.codigo_oportunidad, item.oportunidad_titulo].filter(Boolean).join(" · ") || "—")}</td><td>${escapeHtml(item.vendedor_nombre || "Sin vendedor")}</td><td>${escapeHtml(statusLabel(item.estatus))}</td><td class="num">${escapeHtml(amount(item.total, item.moneda))}</td><td class="num">${escapeHtml(amount(item.total_cobrado, item.moneda))}</td><td class="num">${escapeHtml(amount(item.saldo_pendiente, item.moneda))}</td></tr>`).join("")
  const title = `Reporte de ventas ${filters.desde} a ${filters.hasta}`
  const firstSheet = `<section class="cover"><header>${logo}<div><h1>${escapeHtml(brand.organization_name)}</h1><h2>Reporte de ventas</h2><p>${escapeHtml(filterSummary)}</p></div></header><section class="kpis"><article><span>Ventas formalizadas</span><strong>${summary.numero_ventas.toLocaleString("es-MX")}</strong><small>${summary.numero_pagos_parciales.toLocaleString("es-MX")} con pago parcial</small></article><article><span>Total vendido</span><strong>${escapeHtml(amount(summary.total_vendido, currency))}</strong><small>Ventas del periodo seleccionado</small></article><article><span>Cobrado en el periodo</span><strong>${escapeHtml(amount(summary.total_cobrado_periodo, currency))}</strong><small>Pagos confirmados en el periodo</small></article><article><span>Saldo pendiente</span><strong>${escapeHtml(amount(summary.saldo_pendiente, currency))}</strong><small>${summary.numero_pendientes_pago.toLocaleString("es-MX")} pendientes · ${summary.numero_pagadas.toLocaleString("es-MX")} liquidadas</small></article></section><section class="chart"><h3>Ventas y cobranza por mes</h3><p>Ventas agrupadas por fecha de venta; cobros por fecha de confirmación del pago.</p>${createChartSvg(series, currency)}</section><footer>Reporte filtrado · ${total.toLocaleString("es-MX")} ventas</footer></section>`
  const listing = `<section class="listing"><div class="list-heading"><div><h2>Detalle de ventas</h2><p>${escapeHtml(filterSummary)}</p></div><strong>${total.toLocaleString("es-MX")} resultados</strong></div><table><thead><tr><th>Fecha</th><th>Cliente</th><th>Oportunidad</th><th>Vendedor</th><th>Estado</th><th class="num">Venta</th><th class="num">Cobrado</th><th class="num">Saldo</th></tr></thead><tbody>${rows || "<tr><td colspan=\"8\" class=\"empty-row\">No hay ventas que coincidan con los filtros.</td></tr>"}</tbody></table><footer>Generado desde Tal-IA · ${escapeHtml(new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short" }).format(new Date()))}</footer></section>`
  targetWindow.opener = null
  targetWindow.document.open()
  targetWindow.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)}</title><style>
@page{size:A4 landscape;margin:10mm}*{box-sizing:border-box}body{color:#172033;font:9px/1.4 Arial,sans-serif;margin:0}.cover{break-after:page;page-break-after:always}header{align-items:center;border-bottom:3px solid ${accent};display:flex;gap:14px;margin-bottom:9px;padding-bottom:8px;min-height:22mm}.logo{max-height:42px;max-width:115px;object-fit:contain}h1{color:${primary};font-size:17px;margin:0 0 2px}h2{color:${accent};font-size:13px;margin:0}header p,.list-heading p{color:#475569;font-size:8px;margin:4px 0 0}.kpis{display:grid;gap:7px;grid-template-columns:repeat(4,minmax(0,1fr));margin:0 0 8px}.kpis article{border:1px solid #d8dee8;border-top:3px solid ${accent};border-radius:5px;display:flex;flex-direction:column;gap:2px;min-height:27mm;padding:7px}.kpis span,.kpis small{color:#64748b;font-size:8px}.kpis strong{color:${primary};font-size:14px;line-height:1.2}.chart{border:1px solid #d8dee8;border-radius:5px;padding:7px 9px}.chart h3{font-size:10px;margin:0}.chart p{color:#64748b;font-size:8px;margin:2px 0}.chart svg{display:block;height:74mm;width:100%}footer{border-top:1px solid #d8dee8;color:#64748b;font-size:7px;margin-top:5px;padding-top:4px}.listing{break-inside:avoid}.list-heading{align-items:end;display:flex;justify-content:space-between;margin:0 0 10px}.list-heading h2{color:${primary};font-size:16px}.list-heading strong{color:#475569;font-size:9px}table{border-collapse:collapse;table-layout:fixed;width:100%}thead{display:table-header-group}tr{break-inside:avoid;page-break-inside:avoid}th{background:${primary};color:white;text-align:left;font-size:7px;text-transform:uppercase}th,td{border:1px solid #d8dee8;overflow-wrap:anywhere;padding:5px;vertical-align:top}td{font-size:7.5px}tbody tr:nth-child(even){background:#f6f8fb}th:nth-child(1){width:9%}th:nth-child(2){width:15%}th:nth-child(3){width:22%}th:nth-child(4){width:13%}th:nth-child(5){width:11%}th:nth-child(6),th:nth-child(7),th:nth-child(8){width:10%}.num{text-align:right;white-space:nowrap}.empty-row{text-align:center;padding:16px}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
</style></head><body>${firstSheet}${listing}</body></html>`)
  targetWindow.document.close()
  const images = Promise.all(Array.from(targetWindow.document.images).map((image) => image.complete ? Promise.resolve() : new Promise<void>((resolve) => {
    image.onload = () => resolve()
    image.onerror = () => resolve()
    window.setTimeout(resolve, 2500)
  })))
  void images.then(() => { targetWindow.focus(); targetWindow.print() })
}
