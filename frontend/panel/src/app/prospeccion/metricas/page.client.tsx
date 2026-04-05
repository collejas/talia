"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  IconBrandWhatsapp,
  IconDownload,
  IconFileSpreadsheet,
  IconLoader,
  IconMail,
  IconPhoneCall,
} from "@tabler/icons-react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  getProspeccionMetricas,
  getBrevoQuota,
  listCrmCampaigns,
  listWhatsAppAtribucionReglas,
  downloadProspeccionMetricasXlsx,
  type BrevoQuotaSnapshot,
  type CrmCampaign,
  type ProspeccionMetricasResponse,
  type WhatsAppAtribucionRule,
} from "@/lib/prospeccion/prospectos-client"

const money = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 })
const number = new Intl.NumberFormat("es-MX")
const shortDate = new Intl.DateTimeFormat("es-MX", { month: "short", day: "2-digit" })
const CHANNEL_TOTAL_STYLE: Record<string, { fill: string; stroke: string; label: string }> = {
  whatsapp: { fill: "#25D366", stroke: "#1FAF57", label: "WhatsApp" },
  correo: { fill: "#2563EB", stroke: "#1D4ED8", label: "Correo" },
  llamada: { fill: "#F59E0B", stroke: "#D97706", label: "Voz" },
}

function getChannelTotalStyle(canal?: string | null) {
  return CHANNEL_TOTAL_STYLE[(canal || "").toLowerCase()] ?? { fill: "#0f172a", stroke: "#0f172a", label: "Canal" }
}

function getChannelIcon(canal?: string | null) {
  const normalized = (canal || "").toLowerCase()
  if (normalized === "whatsapp") return IconBrandWhatsapp
  if (normalized === "correo") return IconMail
  if (normalized === "llamada") return IconPhoneCall
  return IconPhoneCall
}

function escapeCsvValue(value: string | number | null | undefined) {
  if (value === null || value === undefined) return ""
  const normalized = String(value).replace(/"/g, '""')
  return /[",\n]/.test(normalized) ? `"${normalized}"` : normalized
}

function buildCsv(headers: string[], rows: Array<Array<string | number | null | undefined>>) {
  const lines = [headers.map((header) => escapeCsvValue(header)).join(",")]
  for (const row of rows) {
    lines.push(row.map((value) => escapeCsvValue(value)).join(","))
  }
  return lines.join("\n")
}

function downloadCsv(filename: string, csvContent: string) {
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
  downloadBlob(filename, blob)
}

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.setAttribute("download", filename)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export default function ProspeccionMetricasPageClient() {
  const [activeTab, setActiveTab] = useState<"campanas" | "frases">("campanas")
  const [hydrated, setHydrated] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<ProspeccionMetricasResponse | null>(null)
  const [campaignTimeseries, setCampaignTimeseries] = useState<ProspeccionMetricasResponse["campanas"]["timeseries"]>([])
  const [campaignTimeseriesLoading, setCampaignTimeseriesLoading] = useState(false)
  const [brevoQuota, setBrevoQuota] = useState<BrevoQuotaSnapshot | null>(null)
  const [brevoQuotaLoading, setBrevoQuotaLoading] = useState(false)

  const [campaigns, setCampaigns] = useState<CrmCampaign[]>([])
  const [rules, setRules] = useState<WhatsAppAtribucionRule[]>([])

  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [canal, setCanal] = useState<"todos" | "correo" | "whatsapp" | "llamada">("todos")
  const [campanaId, setCampanaId] = useState("todos")
  const [campanaPublicitaria, setCampanaPublicitaria] = useState("")
  const [reglaId, setReglaId] = useState("todos")
  const [tableSort, setTableSort] = useState<{ key: string; dir: "asc" | "desc" }>({
    key: "envios_totales",
    dir: "desc",
  })
  const legendItems = [
    { label: "Enviados", color: "#fbbf24", order: 0 },
    { label: "Fallidos", color: "#ef4444", order: 1 },
    { label: "Omitidos", color: "#9ca3af", order: 2 },
    { label: "Otros estados", color: "#a78bfa", order: 3 },
  ]

  useEffect(() => {
    setHydrated(true)
  }, [])

  useEffect(() => {
    let cancelled = false
    const loadFilters = async () => {
      try {
        const [crmCampaigns, reglasResponse] = await Promise.all([
          listCrmCampaigns(),
          listWhatsAppAtribucionReglas({ limit: 500, offset: 0 }),
        ])
        if (cancelled) return
        setCampaigns(crmCampaigns ?? [])
        setRules(Array.isArray(reglasResponse.items) ? reglasResponse.items : [])
      } catch {
        if (!cancelled) {
          setCampaigns([])
          setRules([])
        }
      }
    }
    void loadFilters()
    return () => {
      cancelled = true
    }
  }, [])

  const loadMetrics = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await getProspeccionMetricas({
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        canal,
        campana_id: campanaId !== "todos" ? campanaId : undefined,
        campana_publicitaria: campanaPublicitaria.trim() || undefined,
        regla_id: reglaId !== "todos" ? reglaId : undefined,
        limit: 500,
        include_campaign_timeseries: false,
        include_whatsapp_timeseries: false,
        include_whatsapp_channels: true,
        lite: false,
      })
      setData(response)
    } catch (err) {
      const message = err instanceof Error ? err.message : "No se pudieron cargar las métricas."
      setError(message)
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [dateFrom, dateTo, canal, campanaId, campanaPublicitaria, reglaId])

  useEffect(() => {
    void loadMetrics()
  }, [loadMetrics])

  const loadCampaignTimeseries = useCallback(async () => {
    setCampaignTimeseriesLoading(true)
    try {
      const response = await getProspeccionMetricas({
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        canal,
        campana_id: campanaId !== "todos" ? campanaId : undefined,
        campana_publicitaria: campanaPublicitaria.trim() || undefined,
        regla_id: reglaId !== "todos" ? reglaId : undefined,
        limit: 500,
        include_campaign_timeseries: true,
        include_whatsapp_timeseries: false,
        include_whatsapp_channels: false,
        lite: false,
      })
      setCampaignTimeseries(response.campanas.timeseries ?? [])
    } catch {
      setCampaignTimeseries([])
    } finally {
      setCampaignTimeseriesLoading(false)
    }
  }, [dateFrom, dateTo, canal, campanaId, campanaPublicitaria, reglaId])

  useEffect(() => {
    setCampaignTimeseries([])
    void loadCampaignTimeseries()
  }, [loadCampaignTimeseries])

  const loadBrevoQuota = useCallback(async () => {
    setBrevoQuotaLoading(true)
    try {
      const response = await getBrevoQuota()
      setBrevoQuota(response)
    } catch {
      setBrevoQuota(null)
    } finally {
      setBrevoQuotaLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadBrevoQuota()
  }, [loadBrevoQuota])

  const summaryCampaign = data?.campanas.summary
  const summaryPhrases = data?.frases_whatsapp.summary
  const campaignChartData = useMemo(
    () =>
      (campaignTimeseries ?? []).map((item) => ({
        ...item,
        fecha_label: shortDate.format(new Date(`${item.fecha}T00:00:00`)),
      })),
    [campaignTimeseries],
  )
  const phrasesChartData = useMemo(
    () =>
      (data?.frases_whatsapp.timeseries ?? []).map((item) => ({
        ...item,
        fecha_label: shortDate.format(new Date(`${item.fecha}T00:00:00`)),
      })),
    [data?.frases_whatsapp.timeseries],
  )

  const topCards = useMemo(() => {
    const cards: Array<{ title: string; value: string; hint: string }> = []
    const entregaPct = summaryCampaign?.tasa_entrega_pct ?? 0
    const respuestaPct = summaryCampaign?.tasa_respuesta_pct ?? 0
    const convOppPct = summaryPhrases?.tasa_conversacion_oportunidad_pct ?? 0
    const items = data?.campanas.items ?? []
    const byChannel = items.reduce(
      (acc, item) => {
        const channel = (item.canal || "").trim().toLowerCase()
        if (channel === "whatsapp") acc.whatsapp += item.envios_totales || 0
        else if (channel === "correo") acc.correo += item.envios_totales || 0
        else if (channel === "llamada") acc.llamada += item.envios_totales || 0
        return acc
      },
      { whatsapp: 0, correo: 0, llamada: 0 },
    )
    const totalHint =
      canal === "todos"
        ? `WA ${number.format(byChannel.whatsapp)} · Correo ${number.format(byChannel.correo)} · Voz ${number.format(byChannel.llamada)}`
        : "Bloque campañas"
    const deliveredByChannel = items.reduce(
      (acc, item) => {
        const channel = (item.canal || "").trim().toLowerCase()
        if (channel === "whatsapp") acc.whatsapp += item.envios_entregados || 0
        else if (channel === "correo") acc.correo += item.envios_entregados || 0
        else if (channel === "llamada") acc.llamada += item.envios_entregados || 0
        return acc
      },
      { whatsapp: 0, correo: 0, llamada: 0 },
    )
    const responsesByChannel = items.reduce(
      (acc, item) => {
        const channel = (item.canal || "").trim().toLowerCase()
        if (channel === "whatsapp") acc.whatsapp += item.envios_respondidos || 0
        else if (channel === "correo") acc.correo += item.envios_respondidos || 0
        else if (channel === "llamada") acc.llamada += item.envios_respondidos || 0
        return acc
      },
      { whatsapp: 0, correo: 0, llamada: 0 },
    )
    const deliveredHint =
      canal === "todos"
        ? `WA ${number.format(deliveredByChannel.whatsapp)} · Correo ${number.format(deliveredByChannel.correo)} · Voz ${number.format(deliveredByChannel.llamada)}`
        : `${entregaPct}% entrega`
    const responsesHint =
      canal === "todos"
        ? `WA ${number.format(responsesByChannel.whatsapp)} · Correo ${number.format(responsesByChannel.correo)} · Voz ${number.format(responsesByChannel.llamada)}`
        : `${respuestaPct}% respuesta`

    cards.push({
      title: "Envíos totales",
      value: number.format(summaryCampaign?.envios_totales ?? 0),
      hint: totalHint,
    })
    cards.push({
      title: "Entregados",
      value: number.format(summaryCampaign?.envios_entregados ?? 0),
      hint: deliveredHint,
    })
    cards.push({
      title: "Respuestas de campaña",
      value: number.format(summaryCampaign?.envios_respondidos ?? 0),
      hint: responsesHint,
    })
    cards.push({
      title: "Conversaciones atribuidas",
      value: number.format(summaryPhrases?.conversaciones_atribuidas ?? 0),
      hint: "Bloque frases WhatsApp",
    })
    cards.push({
      title: "Oportunidades atribuidas",
      value: number.format(summaryPhrases?.oportunidades_creadas ?? 0),
      hint: `${convOppPct}% conv→opp`,
    })
    return cards
  }, [summaryCampaign, summaryPhrases, data?.campanas.items, canal])

  const topCampaigns = useMemo(() => {
    const items = data?.campanas.items ?? []
    const campaignNameMap = new Map<string, string>()
    campaigns.forEach((c) => {
      if (c.id) campaignNameMap.set(c.id, c.nombre)
    })
    const normalize = (value: string | null | undefined) => (value || "").trim().toLowerCase()
    // Agrupar por campaña para que el Top 5 muestre campañas únicas (no plantillas del mismo envío)
    const byCampaignMap = new Map<
      string,
      { nombre: string; canal: string | null | undefined; envios_totales: number }
    >()
    items.forEach((item, idx) => {
      const key =
        item.campana_id ||
        item.campana_nombre ||
        item.template_id ||
        item.template_slug ||
        item.twilio_content_sid ||
        `${item.canal ?? "canal"}-${idx}`
      const prev = byCampaignMap.get(key)
      const envios = item.envios_totales || 0
      const bestName =
        (item.campana_id ? campaignNameMap.get(item.campana_id) : undefined) ||
        item.campana_nombre ||
        item.template_nombre ||
        item.template_slug ||
        item.twilio_content_sid ||
        key ||
        `Campaña ${item.canal ?? "general"}`
      if (prev) {
        prev.envios_totales += envios
        if (prev.nombre === "Sin nombre" && bestName !== "Sin nombre") {
          prev.nombre = bestName
        }
      } else {
        byCampaignMap.set(key, {
          nombre: bestName,
          canal: item.canal,
          envios_totales: envios,
        })
      }
    })
    const byEnvios = [...byCampaignMap.values()]
      .sort((a, b) => (b.envios_totales || 0) - (a.envios_totales || 0))
      .slice(0, 5)
    const byOpenRate = [...items]
      .filter((item) => normalize(item.canal) === "correo" && (item.envios_entregados || 0) > 0)
      .map((item) => ({
        ...item,
        open_rate: (item.brevo_aperturas || 0) / (item.envios_entregados || 1),
      }))
      .sort((a, b) => (b.open_rate || 0) - (a.open_rate || 0))
      .slice(0, 5)
    const byResponseRate = [...items]
      .filter((item) => (item.envios_entregados || 0) > 0)
      .map((item) => ({
        ...item,
        response_rate: (item.envios_respondidos || 0) / (item.envios_entregados || 1),
      }))
    const byBounce = [...items]
      .filter((item) => (item.envios_totales || 0) > 0 && (item.envios_fallidos || 0) > 0)
      .map((item) => ({
        ...item,
        bounce_rate: (item.envios_fallidos || 0) / (item.envios_totales || 1),
      }))
      .sort((a, b) => (b.bounce_rate || 0) - (a.bounce_rate || 0))
      .slice(0, 5)
    const byChannelTop = (rows: typeof byResponseRate, canal: "correo" | "whatsapp") =>
      rows
        .filter((item) => normalize(item.canal) === canal)
        .sort((a, b) => (b.response_rate || 0) - (a.response_rate || 0))
        .slice(0, 5)
    const byChannelBounce = (rows: typeof byBounce, canal: "correo" | "whatsapp") =>
      rows
        .filter((item) => normalize(item.canal) === canal)
        .sort((a, b) => (b.bounce_rate || 0) - (a.bounce_rate || 0))
        .slice(0, 5)
    return {
      byEnvios,
      byOpenRate,
      byResponseRateCorreo: byChannelTop(byResponseRate, "correo"),
      byResponseRateWhatsapp: byChannelTop(byResponseRate, "whatsapp"),
      byBounceCorreo: byChannelBounce(byBounce, "correo"),
      byBounceWhatsapp: byChannelBounce(byBounce, "whatsapp"),
      byBounce,
    }
  }, [data?.campanas.items, campaigns])

  const channelSummary = useMemo(() => {
    const items = data?.campanas.items ?? []
    const normalize = (value: string | null | undefined) => (value || "").trim().toLowerCase()
    const channels: Array<"correo" | "whatsapp" | "llamada"> = ["correo", "whatsapp", "llamada"]
    const labelMap: Record<typeof channels[number], string> = {
      correo: "Correo",
      whatsapp: "WhatsApp",
      llamada: "Voz",
    }
    return channels.map((ch) => {
      const rows = items.filter((item) => normalize(item.canal) === ch)
      const envios_totales = rows.reduce((sum, r) => sum + (r.envios_totales || 0), 0)
      const envios_entregados = rows.reduce((sum, r) => sum + (r.envios_entregados || 0), 0)
      const envios_respondidos = rows.reduce((sum, r) => sum + (r.envios_respondidos || 0), 0)
      const envios_fallidos = rows.reduce((sum, r) => sum + (r.envios_fallidos || 0), 0)
      const envios_omitidos = rows.reduce((sum, r) => sum + (r.envios_omitidos || 0), 0)
      const envios_sin_respuesta = Math.max(0, envios_entregados - envios_respondidos)
      // En esta vista "Enviados" debe corresponder a entregados
      // (Sin respuesta + Respondidos) para concordar con la tabla de detalle.
      const envios_enviados = envios_entregados
      const envios_otros_estados = Math.max(
        0,
        envios_totales - (envios_enviados + envios_fallidos + envios_omitidos),
      )
      const envios_totales_stack = envios_totales
      const brevo_aperturas = rows.reduce((sum, r) => sum + (r.brevo_aperturas || 0), 0)
      const brevo_clicks = rows.reduce((sum, r) => sum + (r.brevo_clicks || 0), 0)
      const entrega_pct = envios_totales_stack > 0 ? Math.round((envios_entregados / envios_totales_stack) * 100) : 0
      const respuesta_pct = envios_totales_stack > 0 ? Math.round((envios_respondidos / envios_totales_stack) * 100) : 0
      const click_rate = envios_entregados > 0 ? Math.round((brevo_clicks / envios_entregados) * 100) : 0
      const open_rate = envios_entregados > 0 ? Math.round((brevo_aperturas / envios_entregados) * 100) : 0
      return {
        canal: ch,
        canal_label: labelMap[ch],
        envios_totales,
        envios_totales_stack,
        envios_enviados,
        envios_entregados,
        envios_respondidos,
        envios_fallidos,
        envios_omitidos,
        envios_sin_respuesta,
        envios_otros_estados,
        entrega_pct,
        respuesta_pct,
        open_rate,
        click_rate,
      }
    })
  }, [data?.campanas.items])


  const topWhatsappRules = useMemo(() => {
    const rules = data?.frases_whatsapp.by_rule ?? []
    const byConversations = [...rules].sort((a, b) => (b.conversaciones_atribuidas || 0) - (a.conversaciones_atribuidas || 0)).slice(0, 5)
    const byOpportunities = [...rules].sort((a, b) => (b.oportunidades_creadas || 0) - (a.oportunidades_creadas || 0)).slice(0, 5)
    const byAmount = [...rules].sort((a, b) => (b.monto_estimado_total || 0) - (a.monto_estimado_total || 0)).slice(0, 5)
    return { byConversations, byOpportunities, byAmount }
  }, [data?.frases_whatsapp.by_rule])

  const sortedCampaignItems = useMemo(() => {
    const items = [...(data?.campanas.items ?? [])]
    const dir = tableSort.dir === "asc" ? 1 : -1
    const key = tableSort.key
    const getVal = (item: typeof items[number]) => {
      switch (key) {
        case "campana_nombre":
          return item.campana_nombre ?? ""
        case "canal":
          return item.canal ?? ""
        case "template_nombre":
          return item.template_nombre ?? item.template_slug ?? ""
        case "envios_totales":
          return item.envios_totales || 0
        case "envios_omitidos":
          return item.envios_omitidos || 0
        case "envios_entregados":
          return item.envios_entregados || 0
        case "envios_respondidos":
          return item.envios_respondidos || 0
        case "entregados_sin_resp":
          return Math.max(0, (item.envios_entregados || 0) - (item.envios_respondidos || 0))
        case "tasa_entrega_pct":
          return item.tasa_entrega_pct || 0
        case "tasa_respuesta_pct": {
          if (item.envios_entregados > 0) {
            return (item.envios_respondidos / item.envios_entregados) * 100
          }
          return 0
        }
        case "tasa_respuesta_total_pct": {
          if (item.envios_totales > 0) {
            return (item.envios_respondidos / item.envios_totales) * 100
          }
          return 0
        }
        case "tasa_sin_respuesta_pct": {
          if (item.envios_entregados > 0) {
            return ((item.envios_entregados - item.envios_respondidos) / item.envios_entregados) * 100
          }
          return 0
        }
        case "brevo_aperturas":
          return item.brevo_aperturas || 0
        case "open_rate":
          return item.envios_entregados > 0 ? (item.brevo_aperturas / item.envios_entregados) * 100 : 0
        case "brevo_clicks":
          return item.brevo_clicks || 0
        case "click_rate":
          return item.envios_entregados > 0 ? (item.brevo_clicks / item.envios_entregados) * 100 : 0
        case "sesiones_utm":
          return item.sesiones_utm || 0
        default:
          return item.envios_totales || 0
      }
    }
    return items.sort((a, b) => {
      const av = getVal(a)
      const bv = getVal(b)
      if (typeof av === "string" || typeof bv === "string") {
        return String(av).localeCompare(String(bv)) * dir
      }
      return (Number(av) - Number(bv)) * dir
    })
  }, [data?.campanas.items, tableSort])

  const campaignTotals = useMemo(() => {
    const items = data?.campanas.items ?? []
    const totals = items.reduce(
      (acc, item) => {
        acc.envios_totales += item.envios_totales || 0
        acc.envios_omitidos += item.envios_omitidos || 0
        acc.envios_entregados += item.envios_entregados || 0
        acc.envios_respondidos += item.envios_respondidos || 0
        acc.brevo_aperturas += item.brevo_aperturas || 0
        acc.brevo_clicks += item.brevo_clicks || 0
        acc.sesiones_utm += item.sesiones_utm || 0
        return acc
      },
      {
        envios_totales: 0,
        envios_omitidos: 0,
        envios_entregados: 0,
        envios_respondidos: 0,
        brevo_aperturas: 0,
        brevo_clicks: 0,
        sesiones_utm: 0,
      },
    )
    return totals
  }, [data?.campanas.items])

  const toggleSort = useCallback((key: string) => {
    setTableSort((prev) => {
      if (prev.key === key) {
        return { key, dir: prev.dir === "asc" ? "desc" : "asc" }
      }
      return { key, dir: "desc" }
    })
  }, [])

  const exportActiveCsv = useCallback(() => {
    if (!data) return
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-")
    if (activeTab === "campanas") {
      const csv = buildCsv(
        [
          "campana_id",
          "campana_nombre",
          "canal",
          "template_id",
          "template_slug",
          "template_nombre",
          "twilio_content_sid",
          "envios_totales",
          "envios_enviados",
          "envios_entregados",
          "envios_fallidos",
          "envios_omitidos",
          "envios_respondidos",
          "brevo_aperturas",
          "brevo_clicks",
          "sesiones_utm",
          "tasa_entrega_pct",
          "tasa_respuesta_pct",
          "click_to_session_pct",
        ],
        (data.campanas.items ?? []).map((item) => [
          item.campana_id,
          item.campana_nombre,
          item.canal,
          item.template_id,
          item.template_slug,
          item.template_nombre,
          item.twilio_content_sid,
          item.envios_totales,
          item.envios_enviados,
          item.envios_entregados,
          item.envios_fallidos,
          item.envios_omitidos,
          item.envios_respondidos,
          item.brevo_aperturas,
          item.brevo_clicks,
          item.sesiones_utm,
          item.tasa_entrega_pct,
          item.tasa_respuesta_pct,
          item.click_to_session_pct,
        ]),
      )
      downloadCsv(`prospeccion_metricas_campanas_${timestamp}.csv`, csv)
      return
    }
    const byChannelRows = (data.frases_whatsapp.by_channel ?? []).map((item) => [
      "por_canal",
      "",
      item.canal_publicitario,
      "",
      item.conversaciones_atribuidas,
      item.contactos_unicos,
      item.oportunidades_creadas,
      item.tasa_conversacion_oportunidad_pct,
      item.monto_estimado_total,
    ])
    const byRuleRows = (data.frases_whatsapp.by_rule ?? []).map((item) => [
      "por_regla",
      item.regla_id ?? "",
      item.canal_publicitario,
      item.campana_publicitaria ?? "",
      item.conversaciones_atribuidas,
      item.contactos_unicos,
      item.oportunidades_creadas,
      item.tasa_conversacion_oportunidad_pct,
      item.monto_estimado_total,
    ])
    const csv = buildCsv(
      [
        "seccion",
        "regla_id",
        "canal_publicitario",
        "campana_publicitaria",
        "conversaciones_atribuidas",
        "contactos_unicos",
        "oportunidades_creadas",
        "tasa_conversacion_oportunidad_pct",
        "monto_estimado_total",
      ],
      [...byChannelRows, ...byRuleRows],
    )
    downloadCsv(`prospeccion_metricas_frases_${timestamp}.csv`, csv)
  }, [activeTab, data])

  const exportXlsx = useCallback(async () => {
    try {
      const result = await downloadProspeccionMetricasXlsx({
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        canal,
        campana_id: campanaId !== "todos" ? campanaId : undefined,
        campana_publicitaria: campanaPublicitaria.trim() || undefined,
        regla_id: reglaId !== "todos" ? reglaId : undefined,
        limit: 2000,
      })
      downloadBlob(result.filename, result.blob)
    } catch (err) {
      const message = err instanceof Error ? err.message : "No se pudo exportar el XLSX."
      setError(message)
    }
  }, [dateFrom, dateTo, canal, campanaId, campanaPublicitaria, reglaId])

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Filtros globales</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3 lg:grid-cols-6">
          <div className="space-y-1">
            <Label>Desde</Label>
            <Input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Hasta</Label>
            <Input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Canal</Label>
            <Select value={canal} onValueChange={(value) => setCanal(value as typeof canal)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="correo">Correo</SelectItem>
                <SelectItem value="whatsapp">WhatsApp</SelectItem>
                <SelectItem value="llamada">Llamada</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Campaña CRM</Label>
            <Select value={campanaId} onValueChange={setCampanaId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todas</SelectItem>
                {campaigns.map((campaign) => (
                  <SelectItem key={campaign.id} value={campaign.id}>{campaign.nombre}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Campaña publicitaria</Label>
            <Input
              placeholder="Meta Ads Febrero"
              value={campanaPublicitaria}
              onChange={(event) => setCampanaPublicitaria(event.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label>Regla</Label>
            <Select value={reglaId} onValueChange={setReglaId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todas</SelectItem>
                {rules.map((rule) => (
                  <SelectItem key={rule.id} value={rule.id}>{rule.nombre_regla}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-3 lg:col-span-6">
            <Button
              onClick={() => {
                void loadMetrics()
                void loadBrevoQuota()
              }}
              disabled={loading}
            >
              {loading ? <IconLoader className="mr-2 h-4 w-4 animate-spin" /> : null}
              Actualizar métricas
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {topCards.map((card) => (
          <Card key={card.title}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">{card.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold">{card.value}</p>
              <p className="text-xs text-muted-foreground">{card.hint}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-3 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Campañas destacadas (Top 5)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="grid gap-2 lg:grid-cols-2">
              <div>
                <p className="text-xs font-semibold text-muted-foreground">Por volumen</p>
                <ul className="space-y-1">
                  {topCampaigns.byEnvios.map((item, idx) => (
                    <li key={`${item.nombre}-${idx}`} className="flex items-center justify-between gap-2">
                      <span className="truncate">{item.nombre}</span>
                      <Badge variant="outline">{number.format(item.envios_totales)} envíos</Badge>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="text-xs font-semibold text-muted-foreground" suppressHydrationWarning>
                  Open rate (correo)
                </p>
                <ul className="space-y-1">
                  {topCampaigns.byOpenRate.map((item, idx) => (
                    <li key={`${item.template_id ?? item.template_slug ?? idx}`} className="flex items-center justify-between gap-2">
                      <span className="truncate">{item.template_nombre ?? item.template_slug ?? "Sin plantilla"}</span>
                      <Badge variant="outline">
                        {Math.round(((item.brevo_aperturas || 0) / (item.envios_entregados || 1)) * 100)}% open
                      </Badge>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <div className="grid gap-2 lg:grid-cols-2">
              <div>
                <p className="text-xs font-semibold text-muted-foreground">Por respuesta</p>
                <div className="grid gap-2 md:grid-cols-2">
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">Correo</p>
                    <ul className="space-y-1">
                      {topCampaigns.byResponseRateCorreo.map((item, idx) => (
                        <li key={`correo-${item.template_id ?? item.template_slug ?? idx}`} className="flex items-center justify-between gap-2">
                          <span className="truncate">{item.template_nombre ?? item.template_slug ?? "Sin plantilla"}</span>
                          <Badge variant="outline">
                            {Math.round(((item.envios_respondidos || 0) / (item.envios_entregados || 1)) * 100)}% resp
                          </Badge>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">WhatsApp</p>
                    <ul className="space-y-1">
                      {topCampaigns.byResponseRateWhatsapp.map((item, idx) => (
                        <li key={`wa-${item.template_id ?? item.template_slug ?? idx}`} className="flex items-center justify-between gap-2">
                          <span className="truncate">{item.template_nombre ?? item.template_slug ?? "Sin plantilla"}</span>
                          <Badge variant="outline">
                            {Math.round(((item.envios_respondidos || 0) / (item.envios_entregados || 1)) * 100)}% resp
                          </Badge>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold text-muted-foreground">Mayor rebote (global)</p>
                <ul className="space-y-1">
                  {topCampaigns.byBounce.map((item, idx) => (
                    <li
                      key={`bounce-${idx}-${item.template_id ?? item.template_slug ?? item.twilio_content_sid ?? "row"}`}
                      className="flex items-center justify-between gap-2"
                    >
                      <span className="truncate">{item.template_nombre ?? item.template_slug ?? "Sin plantilla"}</span>
                      <Badge variant="destructive">
                        {Math.round(((item.envios_fallidos || 0) / (item.envios_totales || 1)) * 100)}% rebote
                      </Badge>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="xl:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Resumen por canal</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={channelSummary} barGap={-26} barCategoryGap="30%">
                  <XAxis
                    dataKey="canal_label"
                    tickLine={false}
                    tick={({ x, y, payload }) => {
                      const row = channelSummary.find((item) => item.canal_label === payload.value)
                      const style = getChannelTotalStyle(row?.canal)
                      const ChannelIcon = getChannelIcon(row?.canal)
                      return (
                        <g transform={`translate(${x},${y})`}>
                          <foreignObject x={-54} y={8} width={120} height={24}>
                            <div className="flex items-center gap-1 text-[11px] text-foreground">
                              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: style.fill }} />
                              <ChannelIcon size={12} />
                              <span>{payload.value}</span>
                            </div>
                          </foreignObject>
                        </g>
                      )
                    }}
                  />
                  <YAxis allowDecimals={false} />
                  <Tooltip
                    shared={false}
                    cursor={false}
                    content={({ active, payload, label }) => {
                      if (!active || !payload || payload.length === 0) return null
                      const row = payload[0]?.payload as typeof channelSummary[number]
                      if (!row) return null
                      const total = row.envios_totales_stack || 0
                      const entregados = row.envios_entregados || 0
                      const pctTotal = (count: number) => (total > 0 ? ((count / total) * 100).toFixed(2) : "0.00")
                      const pctEnt = (count: number) => (entregados > 0 ? ((count / entregados) * 100).toFixed(2) : "0.00")
                      const swatch = (color: string) => (
                        <span className="mr-2 inline-block h-2 w-2 rounded-sm" style={{ backgroundColor: color }} />
                      )
                      return (
                        <div className="rounded-md border bg-background px-3 py-2 text-xs shadow-sm">
                          <div className="mb-1 font-semibold">{label}</div>
                          <div className="space-y-1">
                            <div className="flex justify-between gap-3">
                              <span className="flex items-center">
                                {swatch(getChannelTotalStyle(row.canal).fill)}
                                Envíos totales
                              </span>
                              <span>{number.format(total)} (100.00%)</span>
                            </div>
                            <div className="flex justify-between gap-3">
                              <span className="flex items-center">{swatch("#f59e0b")}Enviados</span>
                              <span>{number.format(row.envios_enviados || 0)} ({pctTotal(row.envios_enviados || 0)}%)</span>
                            </div>
                            <div className="flex justify-between gap-3">
                              <span className="flex items-center pl-3">{swatch("#60a5fa")}Sin respuesta</span>
                              <span>{number.format(row.envios_sin_respuesta || 0)} ({pctEnt(row.envios_sin_respuesta || 0)}%)</span>
                            </div>
                            <div className="flex justify-between gap-3">
                              <span className="flex items-center pl-3">{swatch("#22c55e")}Respondidos</span>
                              <span>{number.format(row.envios_respondidos || 0)} ({pctEnt(row.envios_respondidos || 0)}%)</span>
                            </div>
                            <div className="flex justify-between gap-3">
                              <span className="flex items-center">{swatch("#ef4444")}Fallidos</span>
                              <span>{number.format(row.envios_fallidos || 0)} ({pctTotal(row.envios_fallidos || 0)}%)</span>
                            </div>
                            <div className="flex justify-between gap-3">
                              <span className="flex items-center">{swatch("#9ca3af")}Omitidos</span>
                              <span>{number.format(row.envios_omitidos || 0)} ({pctTotal(row.envios_omitidos || 0)}%)</span>
                            </div>
                            <div className="flex justify-between gap-3">
                              <span className="flex items-center">{swatch("#a78bfa")}Otros estados</span>
                              <span>{number.format(row.envios_otros_estados || 0)} ({pctTotal(row.envios_otros_estados || 0)}%)</span>
                            </div>
                          </div>
                        </div>
                      )
                    }}
                  />
                  <Legend
                    content={() => (
                      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                        {legendItems.map((item) => (
                          <span
                            key={item.label}
                            className="inline-flex items-center gap-2"
                            style={{ order: item.order }}
                          >
                            <span className="h-2 w-4 rounded-sm" style={{ backgroundColor: item.color }} />
                            {item.label}
                          </span>
                        ))}
                      </div>
                    )}
                  />
                  <Bar
                    dataKey="envios_totales_stack"
                    fill="#0f172a"
                    fillOpacity={0.18}
                    stroke="#0f172a"
                    strokeWidth={4}
                    barSize={30}
                    name="Envíos totales"
                    legendType="none"
                  >
                    {channelSummary.map((row, idx) => {
                      const style = getChannelTotalStyle(row.canal)
                      return (
                        <Cell
                          key={`totales-${row.canal}-${idx}`}
                          fill={style.fill}
                          stroke={style.stroke}
                          fillOpacity={0.18}
                        />
                      )
                    })}
                  </Bar>
                  <Bar dataKey="envios_enviados" stackId="breakdown" fill="#fbbf24" name="Enviados" barSize={22} />
                  <Bar dataKey="envios_fallidos" stackId="breakdown" fill="#ef4444" name="Fallidos" barSize={22} />
                  <Bar dataKey="envios_omitidos" stackId="breakdown" fill="#9ca3af" name="Omitidos" barSize={22} />
                  <Bar dataKey="envios_otros_estados" stackId="breakdown" fill="#a78bfa" name="Otros estados" barSize={22} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-2">
                <span className="h-2 w-4 rounded-sm border-[3px] border-slate-900 bg-slate-900/20" />
                Envíos totales = Enviados + Fallidos + Omitidos + Otros estados
              </span>
              <span className="inline-flex items-center gap-2">
                <span className="h-2 w-4 rounded-sm" style={{ backgroundColor: "#fbbf24" }} />
                Enviados = 
                <span className="h-2 w-4 rounded-sm" style={{ backgroundColor: "#60a5fa" }} />
                Sin respuesta + 
                <span className="h-2 w-4 rounded-sm" style={{ backgroundColor: "#22c55e" }} />
                Respondidos
              </span>
            </div>
            <div className="text-xs text-muted-foreground">
              {channelSummary.find((row) => row.canal === "correo") ? (
                <span>
                  Correo: Open {channelSummary.find((row) => row.canal === "correo")?.open_rate ?? 0}% ·
                  Click {channelSummary.find((row) => row.canal === "correo")?.click_rate ?? 0}%
                </span>
              ) : null}
            </div>
          </CardContent>
        </Card>

        <Card className="xl:col-span-3">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Enlaces / reglas WA (Top 5)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="grid gap-2 lg:grid-cols-2">
              <div>
                <p className="text-xs font-semibold text-muted-foreground">Por conversaciones</p>
                <ul className="space-y-1">
                  {topWhatsappRules.byConversations.map((item, idx) => (
                    <li key={`${item.regla_id ?? idx}`} className="flex items-center justify-between gap-2">
                      <span className="truncate">{item.regla_nombre}</span>
                      <Badge variant="outline">{number.format(item.conversaciones_atribuidas)} conv</Badge>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="text-xs font-semibold text-muted-foreground">Por oportunidades</p>
                <ul className="space-y-1">
                  {topWhatsappRules.byOpportunities.map((item, idx) => (
                    <li key={`${item.regla_id ?? idx}`} className="flex items-center justify-between gap-2">
                      <span className="truncate">{item.regla_nombre}</span>
                      <Badge variant="outline">{number.format(item.oportunidades_creadas)} opps</Badge>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground">Por monto estimado</p>
              <ul className="space-y-1">
                {topWhatsappRules.byAmount.map((item, idx) => (
                  <li key={`${item.regla_id ?? idx}`} className="flex items-center justify-between gap-2">
                    <span className="truncate">{item.regla_nombre}</span>
                    <Badge variant="outline">{money.format(item.monto_estimado_total || 0)}</Badge>
                  </li>
                ))}
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Brevo hoy</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          {brevoQuotaLoading ? (
            <p className="text-muted-foreground">Consultando cuota diaria...</p>
          ) : brevoQuota?.configured === false ? (
            <p className="text-muted-foreground">Brevo no configurado para esta organización.</p>
          ) : brevoQuota?.available ? (
            <div className="flex flex-wrap items-center gap-3">
              <Badge variant="outline">
                Enviados: {number.format(brevoQuota.sent_today ?? 0)}
                {brevoQuota.daily_limit !== null ? ` / ${number.format(brevoQuota.daily_limit)}` : ""}
              </Badge>
              <Badge variant={brevoQuota.remaining !== null && brevoQuota.remaining <= 0 ? "destructive" : "secondary"}>
                Restantes: {brevoQuota.remaining ?? "N/D"}
              </Badge>
              {brevoQuota.usage_pct !== null ? (
                <span className="text-muted-foreground">Uso: {brevoQuota.usage_pct}%</span>
              ) : null}
              {brevoQuota.date_local ? (
                <span className="text-muted-foreground">Fecha: {brevoQuota.date_local}</span>
              ) : null}
            </div>
          ) : (
            <p className="text-muted-foreground">No se pudo consultar la cuota de Brevo.</p>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        <Button variant={activeTab === "campanas" ? "default" : "outline"} onClick={() => setActiveTab("campanas")}>Campañas</Button>
        <Button variant={activeTab === "frases" ? "default" : "outline"} onClick={() => setActiveTab("frases")}>Frases WhatsApp</Button>
        <Button
          variant="outline"
          onClick={exportActiveCsv}
          disabled={Boolean(!hydrated || loading || !data)}
          className="ml-auto"
        >
          <IconDownload className="mr-2 h-4 w-4" />
          Exportar CSV ({activeTab === "campanas" ? "campañas" : "frases"})
        </Button>
        <Button variant="outline" onClick={() => void exportXlsx()} disabled={Boolean(!hydrated || loading || !data)}>
          <IconFileSpreadsheet className="mr-2 h-4 w-4" />
          Exportar XLSX
        </Button>
      </div>

      {error ? (
        <Card>
          <CardContent className="py-4 text-sm text-destructive">{error}</CardContent>
        </Card>
      ) : null}

      {activeTab === "campanas" ? (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>
                Tendencia diaria de campañas
                {campaignTimeseriesLoading ? (
                  <span className="ml-2 text-xs font-normal text-muted-foreground">cargando...</span>
                ) : null}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={campaignChartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="fecha_label" tickMargin={8} />
                    <YAxis allowDecimals={false} />
                    <Tooltip formatter={(value) => number.format(Number(value) || 0)} />
                    <Legend />
                    <Line type="monotone" dataKey="envios_totales" stroke="#0f766e" strokeWidth={2} dot={false} name="Envíos totales" />
                    <Line type="monotone" dataKey="envios_entregados" stroke="#2563eb" strokeWidth={2} dot={false} name="Entregados" />
                    <Line type="monotone" dataKey="envios_respondidos" stroke="#ea580c" strokeWidth={2} dot={false} name="Respondidos" />
                    <Line type="monotone" dataKey="envios_fallidos" stroke="#dc2626" strokeWidth={2} dot={false} name="Fallidos" />
                    <Line type="monotone" dataKey="envios_omitidos" stroke="#6b7280" strokeWidth={2} dot={false} name="Omitidos" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Detalle de campañas</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[960px] text-sm" suppressHydrationWarning>
                  <thead>
                    <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="px-2 py-2">
                        <button type="button" title="Nombre de la campaña de prospección." onClick={() => toggleSort("campana_nombre")}>Campaña</button>
                      </th>
                      <th className="px-2 py-2">
                        <button type="button" title="Canal del envío: correo, WhatsApp o voz." onClick={() => toggleSort("canal")}>Canal</button>
                      </th>
                      <th className="px-2 py-2">
                        <button type="button" title="Plantilla o contenido usado en el envío." onClick={() => toggleSort("template_nombre")}>Plantilla</button>
                      </th>
                      <th className="px-2 py-2">
                        <button type="button" title="Total de envíos generados para esa fila." onClick={() => toggleSort("envios_totales")}>Totales</button>
                      </th>
                      <th className="px-2 py-2">
                        <button type="button" title="Envíos omitidos/suprimidos antes de salir." onClick={() => toggleSort("envios_omitidos")}>Omitidos</button>
                      </th>
                      <th className="px-2 py-2">
                        <button type="button" title="Envíos con confirmación de entrega." onClick={() => toggleSort("envios_entregados")}>Entregados</button>
                      </th>
                      <th className="px-2 py-2">
                        <button type="button" title="Envíos que recibieron respuesta del prospecto." onClick={() => toggleSort("envios_respondidos")}>Respondidos</button>
                      </th>
                      <th className="px-2 py-2">
                        <button type="button" title="Entregados sin respuesta (Entregados - Respondidos)." onClick={() => toggleSort("entregados_sin_resp")}>Sin respuesta</button>
                      </th>
                      <th className="px-2 py-2">
                        <button type="button" title="Porcentaje de entrega sobre envíos totales." onClick={() => toggleSort("tasa_entrega_pct")}>% Entrega</button>
                      </th>
                      <th className="px-2 py-2">
                        <button type="button" title="% Respuesta = Respondidos / Entregados." onClick={() => toggleSort("tasa_respuesta_pct")}>% Respuesta</button>
                      </th>
                      <th className="px-2 py-2">
                        <button type="button" title="Tasa resp. total = Respondidos / Totales." onClick={() => toggleSort("tasa_respuesta_total_pct")}>Tasa resp. total</button>
                      </th>
                      <th className="px-2 py-2">
                        <button type="button" title="% Sin respuesta = (Entregados - Respondidos) / Entregados." onClick={() => toggleSort("tasa_sin_respuesta_pct")}>% Sin resp</button>
                      </th>
                      <th className="px-2 py-2">
                        <button type="button" title="Aperturas registradas (solo correo)." onClick={() => toggleSort("brevo_aperturas")}>Aperturas</button>
                      </th>
                      <th className="px-2 py-2">
                        <button type="button" title="% Open = Aperturas / Entregados (solo correo)." onClick={() => toggleSort("open_rate")}>% Open</button>
                      </th>
                      <th className="px-2 py-2">
                        <button type="button" title="Clics registrados (solo correo)." onClick={() => toggleSort("brevo_clicks")}>Clics</button>
                      </th>
                      <th className="px-2 py-2">
                        <button type="button" title="% Click = Clics / Entregados (solo correo)." onClick={() => toggleSort("click_rate")}>% Click</button>
                      </th>
                      <th className="px-2 py-2">
                        <button type="button" title="Sesiones web atribuidas por UTM." onClick={() => toggleSort("sesiones_utm")}>Sesiones</button>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedCampaignItems.map((item, idx) => (
                      <tr
                        key={`${item.campana_id ?? "camp"}-${item.template_id ?? item.template_slug ?? item.twilio_content_sid ?? "tpl"}-${idx}`}
                        className="border-b"
                      >
                        <td className="px-2 py-2">{item.campana_nombre ?? "-"}</td>
                        <td className="px-2 py-2"><Badge variant="secondary">{item.canal ?? "-"}</Badge></td>
                        <td className="px-2 py-2">{item.template_nombre ?? item.template_slug ?? "-"}</td>
                        {(() => {
                          const effectiveTotal = item.envios_totales || 0
                          return (
                            <>
                              <td className="px-2 py-2">{number.format(effectiveTotal)}</td>
                              <td className="px-2 py-2">{number.format(item.envios_omitidos || 0)}</td>
                            </>
                          )
                        })()}
                        <td className="px-2 py-2">{number.format(item.envios_entregados)}</td>
                        <td className="px-2 py-2">{number.format(item.envios_respondidos)}</td>
                        <td className="px-2 py-2">{number.format(Math.max(0, item.envios_entregados - item.envios_respondidos))}</td>
                        <td className="px-2 py-2">
                          {(() => {
                            const total = item.envios_totales || 0
                            return total > 0
                              ? `${Math.round((item.envios_entregados / total) * 100)}%`
                              : "—"
                          })()}
                        </td>
                        <td className="px-2 py-2">
                          {item.envios_entregados > 0
                            ? `${Math.round((item.envios_respondidos / item.envios_entregados) * 100)}%`
                            : "—"}
                        </td>
                        <td className="px-2 py-2">
                          {item.envios_totales > 0
                            ? `${Math.round((item.envios_respondidos / item.envios_totales) * 100)}%`
                            : "—"}
                        </td>
                        <td className="px-2 py-2">
                          {item.envios_entregados > 0
                            ? `${Math.round(((item.envios_entregados - item.envios_respondidos) / item.envios_entregados) * 100)}%`
                            : "—"}
                        </td>
                        <td className="px-2 py-2">{number.format(item.brevo_aperturas)}</td>
                        <td className="px-2 py-2">
                          {item.canal === "correo" && item.envios_entregados > 0
                            ? `${Math.round((item.brevo_aperturas / item.envios_entregados) * 100)}%`
                            : "—"}
                        </td>
                        <td className="px-2 py-2">{number.format(item.brevo_clicks)}</td>
                        <td className="px-2 py-2">
                          {item.canal === "correo" && item.envios_entregados > 0
                            ? `${Math.round((item.brevo_clicks / item.envios_entregados) * 100)}%`
                            : "—"}
                        </td>
                        <td className="px-2 py-2">{number.format(item.sesiones_utm)}</td>
                      </tr>
                    ))}
                    <tr className="border-t bg-muted/30 font-semibold">
                      <td className="px-2 py-2" colSpan={3}>Totales</td>
                      <td className="px-2 py-2">{number.format(campaignTotals.envios_totales)}</td>
                      <td className="px-2 py-2">{number.format(campaignTotals.envios_omitidos)}</td>
                      <td className="px-2 py-2">{number.format(campaignTotals.envios_entregados)}</td>
                      <td className="px-2 py-2">{number.format(campaignTotals.envios_respondidos)}</td>
                      <td className="px-2 py-2">
                        {number.format(Math.max(0, campaignTotals.envios_entregados - campaignTotals.envios_respondidos))}
                      </td>
                      <td className="px-2 py-2">
                        {campaignTotals.envios_totales > 0
                          ? `${Math.round((campaignTotals.envios_entregados / campaignTotals.envios_totales) * 100)}%`
                          : "—"}
                      </td>
                      <td className="px-2 py-2">
                        {campaignTotals.envios_entregados > 0
                          ? `${Math.round((campaignTotals.envios_respondidos / campaignTotals.envios_entregados) * 100)}%`
                          : "—"}
                      </td>
                      <td className="px-2 py-2">
                        {campaignTotals.envios_totales > 0
                          ? `${Math.round((campaignTotals.envios_respondidos / campaignTotals.envios_totales) * 100)}%`
                          : "—"}
                      </td>
                      <td className="px-2 py-2">
                        {campaignTotals.envios_entregados > 0
                          ? `${Math.round(((campaignTotals.envios_entregados - campaignTotals.envios_respondidos) / campaignTotals.envios_entregados) * 100)}%`
                          : "—"}
                      </td>
                      <td className="px-2 py-2">{number.format(campaignTotals.brevo_aperturas)}</td>
                      <td className="px-2 py-2">
                        {campaignTotals.envios_entregados > 0
                          ? `${Math.round((campaignTotals.brevo_aperturas / campaignTotals.envios_entregados) * 100)}%`
                          : "—"}
                      </td>
                      <td className="px-2 py-2">{number.format(campaignTotals.brevo_clicks)}</td>
                      <td className="px-2 py-2">
                        {campaignTotals.envios_entregados > 0
                          ? `${Math.round((campaignTotals.brevo_clicks / campaignTotals.envios_entregados) * 100)}%`
                          : "—"}
                      </td>
                      <td className="px-2 py-2">{number.format(campaignTotals.sesiones_utm)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Tendencia diaria de frases WhatsApp</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={phrasesChartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="fecha_label" tickMargin={8} />
                    <YAxis yAxisId="left" allowDecimals={false} />
                    <YAxis yAxisId="right" orientation="right" tickFormatter={(value) => money.format(Number(value) || 0)} />
                    <Tooltip
                      formatter={(value, name) =>
                        name === "Monto estimado"
                          ? money.format(Number(value) || 0)
                          : number.format(Number(value) || 0)
                      }
                    />
                    <Legend />
                    <Line type="monotone" yAxisId="left" dataKey="conversaciones_atribuidas" stroke="#0f766e" strokeWidth={2} dot={false} name="Conversaciones" />
                    <Line type="monotone" yAxisId="left" dataKey="oportunidades_creadas" stroke="#2563eb" strokeWidth={2} dot={false} name="Oportunidades" />
                    <Line type="monotone" yAxisId="right" dataKey="monto_estimado_total" stroke="#ea580c" strokeWidth={2} dot={false} name="Monto estimado" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Frases por canal publicitario</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="px-2 py-2">Canal</th>
                      <th className="px-2 py-2">Conversaciones</th>
                      <th className="px-2 py-2">Contactos</th>
                      <th className="px-2 py-2">Oportunidades</th>
                      <th className="px-2 py-2">Tasa conv→opp</th>
                      <th className="px-2 py-2">Monto estimado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data?.frases_whatsapp.by_channel ?? []).map((item) => (
                      <tr key={item.canal_publicitario} className="border-b">
                        <td className="px-2 py-2">{item.canal_publicitario}</td>
                        <td className="px-2 py-2">{number.format(item.conversaciones_atribuidas)}</td>
                        <td className="px-2 py-2">{number.format(item.contactos_unicos)}</td>
                        <td className="px-2 py-2">{number.format(item.oportunidades_creadas)}</td>
                        <td className="px-2 py-2">{item.tasa_conversacion_oportunidad_pct}%</td>
                        <td className="px-2 py-2">{money.format(item.monto_estimado_total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Frases por regla</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="px-2 py-2">Regla</th>
                      <th className="px-2 py-2">Canal</th>
                      <th className="px-2 py-2">Campaña publicitaria</th>
                      <th className="px-2 py-2">Conversaciones</th>
                      <th className="px-2 py-2">Contactos</th>
                      <th className="px-2 py-2">Oportunidades</th>
                      <th className="px-2 py-2">Tasa conv→opp</th>
                      <th className="px-2 py-2">Monto estimado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data?.frases_whatsapp.by_rule ?? []).map((item, idx) => (
                      <tr key={`${item.regla_id ?? item.regla_nombre}-${idx}`} className="border-b">
                        <td className="px-2 py-2">{item.regla_nombre}</td>
                        <td className="px-2 py-2">{item.canal_publicitario}</td>
                        <td className="px-2 py-2">{item.campana_publicitaria ?? "-"}</td>
                        <td className="px-2 py-2">{number.format(item.conversaciones_atribuidas)}</td>
                        <td className="px-2 py-2">{number.format(item.contactos_unicos)}</td>
                        <td className="px-2 py-2">{number.format(item.oportunidades_creadas)}</td>
                        <td className="px-2 py-2">{item.tasa_conversacion_oportunidad_pct}%</td>
                        <td className="px-2 py-2">{money.format(item.monto_estimado_total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
