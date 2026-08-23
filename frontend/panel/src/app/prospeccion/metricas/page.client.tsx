"use client"

import { Fragment, useCallback, useEffect, useMemo, useState } from "react"
import {
  IconDownload,
  IconFileSpreadsheet,
  IconLoader,
} from "@tabler/icons-react"
import {
  CartesianGrid,
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  getProspeccionMetricas,
  listContactoTemplates,
  downloadProspeccionMetricasXlsx,
  type ContactoTemplate,
  type ProspeccionMetricasResponse,
  type ProspeccionCampanaAtribucionItem,
} from "@/lib/prospeccion/prospectos-client"

const money = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 })
const moneyPrecise = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 4, maximumFractionDigits: 4 })
const number = new Intl.NumberFormat("es-MX")
const shortDate = new Intl.DateTimeFormat("es-MX", { month: "short", day: "2-digit" })

function stripHtmlToText(value: string) {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
}

function getTemplateText(template: ContactoTemplate) {
  const raw = template.cuerpo_texto?.trim() || template.cuerpo_html?.trim() || ""
  if (!raw) return ""
  const normalized = stripHtmlToText(raw)
  return normalized.length > 600 ? `${normalized.slice(0, 600)}...` : normalized
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

type PeriodPreset = "actual" | "7" | "30" | "90" | "mes" | "personalizado"

function formatDateInput(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function getPeriodDates(preset: Exclude<PeriodPreset, "personalizado">) {
  if (preset === "actual") return { from: "", to: "" }
  const today = new Date()
  const to = formatDateInput(today)
  const fromDate = new Date(today)
  if (preset === "mes") {
    fromDate.setDate(1)
  } else {
    fromDate.setDate(today.getDate() - (Number(preset) - 1))
  }
  return { from: formatDateInput(fromDate), to }
}

export default function ProspeccionMetricasPageClient() {
  const [activeTab, setActiveTab] = useState<"campanas" | "campanas_whatsapp" | "frases">("campanas")
  const [isSummaryView, setIsSummaryView] = useState(true)
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>("actual")
  const [hydrated, setHydrated] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<ProspeccionMetricasResponse | null>(null)
  const [campaignTimeseries, setCampaignTimeseries] = useState<ProspeccionMetricasResponse["campanas_correo"]["timeseries"]>([])
  const [campaignTimeseriesLoading, setCampaignTimeseriesLoading] = useState(false)

  const [templates, setTemplates] = useState<ContactoTemplate[]>([])

  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [canal, setCanal] = useState<"todos" | "correo" | "whatsapp" | "llamada">("todos")
  const [tableSort, setTableSort] = useState<{ key: string; dir: "asc" | "desc" }>({
    key: "envios_totales",
    dir: "desc",
  })
  useEffect(() => {
    setHydrated(true)
  }, [])

  useEffect(() => {
    let cancelled = false
    const loadFilters = async () => {
      try {
        const templatesResponse = await listContactoTemplates()
        if (cancelled) return
        setTemplates(Array.isArray(templatesResponse.items) ? templatesResponse.items : [])
      } catch {
        if (!cancelled) {
          setTemplates([])
        }
      }
    }
    void loadFilters()
    return () => {
      cancelled = true
    }
  }, [])

  const templateTextByKey = useMemo(() => {
    const map = new Map<string, string>()
    for (const template of templates) {
      const text = getTemplateText(template)
      if (!text) continue
      if (template.id) map.set(`id:${template.id}`, text)
      if (template.slug) map.set(`slug:${template.slug.toLowerCase()}`, text)
      if (template.nombre) map.set(`name:${template.nombre.toLowerCase()}`, text)
    }
    return map
  }, [templates])

  const resolveTemplateTooltip = useCallback(
    (item: ProspeccionCampanaAtribucionItem) => {
      const byId = item.template_id ? templateTextByKey.get(`id:${item.template_id}`) : null
      const bySlug = item.template_slug ? templateTextByKey.get(`slug:${item.template_slug.toLowerCase()}`) : null
      const byName = item.template_nombre ? templateTextByKey.get(`name:${item.template_nombre.toLowerCase()}`) : null
      return byId || bySlug || byName || "Sin texto de plantilla disponible."
    },
    [templateTextByKey],
  )

  const loadMetrics = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await getProspeccionMetricas({
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        canal,
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
  }, [dateFrom, dateTo, canal])

  useEffect(() => {
    void loadMetrics()
  }, [loadMetrics])

  const loadCampaignTimeseries = useCallback(async () => {
    setCampaignTimeseriesLoading(true)
    try {
      const response = await getProspeccionMetricas({
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        canal: "correo",
        limit: 500,
        include_campaign_timeseries: true,
        include_whatsapp_timeseries: false,
        include_whatsapp_channels: false,
        lite: false,
      })
      setCampaignTimeseries(response.campanas_correo?.timeseries ?? response.campanas.timeseries ?? [])
    } catch {
      setCampaignTimeseries([])
    } finally {
      setCampaignTimeseriesLoading(false)
    }
  }, [dateFrom, dateTo])

  useEffect(() => {
    setCampaignTimeseries([])
    void loadCampaignTimeseries()
  }, [loadCampaignTimeseries])

  const campaignItems = useMemo(
    () => data?.campanas_correo?.items ?? data?.campanas.items ?? [],
    [data?.campanas_correo?.items, data?.campanas.items],
  )
  const summaryCampaign = data?.campanas_correo?.summary ?? data?.campanas.summary
  const commercialSummary = data?.resultado_comercial_whatsapp?.summary
  const commercialOpportunityRate = commercialSummary?.conversaciones
    ? (commercialSummary.oportunidades / commercialSummary.conversaciones) * 100
    : 0
  const commercialItems = useMemo(
    () => data?.resultado_comercial_whatsapp?.items ?? [],
    [data?.resultado_comercial_whatsapp?.items],
  )
  const summaryPhrases = data?.frases_whatsapp.summary
  const phraseCampaignGroups = useMemo(() => {
    const groups = new Map<
      string,
      {
        campana: string
        canal: string
        conversaciones: number
        oportunidades: number
        frases: NonNullable<ProspeccionMetricasResponse["frases_whatsapp"]["by_rule"]>
      }
    >()

    for (const item of data?.frases_whatsapp.by_rule ?? []) {
      const campana = item.campana_publicitaria?.trim() || "Sin campaña publicitaria"
      const current = groups.get(campana) ?? {
        campana,
        canal: item.canal_publicitario || "Sin canal",
        conversaciones: 0,
        oportunidades: 0,
        frases: [],
      }
      current.conversaciones += item.conversaciones_atribuidas
      current.oportunidades += item.oportunidades_creadas
      current.frases.push(item)
      groups.set(campana, current)
    }

    return Array.from(groups.values()).sort((left, right) => right.oportunidades - left.oportunidades)
  }, [data?.frases_whatsapp.by_rule])
  const activeViewMeta: Record<
    "campanas" | "campanas_whatsapp" | "frases",
    { title: string; description: string; badge: string }
  > = {
    campanas: {
      title: "Campañas correo",
      description: "Rendimiento de envíos de correo: entrega, aperturas, clics y sesiones atribuidas.",
      badge: number.format(summaryCampaign?.envios_totales ?? 0),
    },
    campanas_whatsapp: {
      title: "Campañas WhatsApp",
      description: "Enviados, entregados, respuestas y resultados comerciales atribuidos a campañas WhatsApp.",
      badge: number.format(commercialSummary?.envios ?? 0),
    },
    frases: {
      title: "Frases WhatsApp",
      description: "Atribución por regla, canal publicitario y oportunidades generadas.",
      badge: number.format(summaryPhrases?.conversaciones_atribuidas ?? 0),
    },
  }
  const campaignChartData = useMemo(
    () =>
      (campaignTimeseries ?? []).map((item) => ({
        ...item,
        fecha_label: shortDate.format(new Date(`${item.fecha}T00:00:00`)),
      })),
    [campaignTimeseries],
  )
  const topCards = useMemo(() => {
    const cards: Array<{ title: string; value: string; hint: string }> = []
    const isWhatsappFilter = canal === "whatsapp"
    if (isWhatsappFilter) {
      return cards
    } else if (canal === "todos") {
      const totalEnvios = (summaryCampaign?.envios_totales ?? 0) + (commercialSummary?.envios ?? 0)
      const totalRespondidos = (summaryCampaign?.envios_respondidos ?? 0) + (commercialSummary?.respondieron ?? 0)
      cards.push(
        {
          title: "Envíos totales",
          value: number.format(totalEnvios),
          hint: `Correo ${number.format(summaryCampaign?.envios_totales ?? 0)} · WhatsApp ${number.format(commercialSummary?.envios ?? 0)}`,
        },
        {
          title: "Entregados",
          value: number.format((summaryCampaign?.envios_entregados ?? 0) + (commercialSummary?.entregados ?? 0)),
          hint: `Correo ${number.format(summaryCampaign?.envios_entregados ?? 0)} · WhatsApp ${number.format(commercialSummary?.entregados ?? 0)}`,
        },
        {
          title: "Respuestas de campaña",
          value: number.format(totalRespondidos),
          hint: `Correo ${number.format(summaryCampaign?.envios_respondidos ?? 0)} · WhatsApp ${number.format(commercialSummary?.respondieron ?? 0)}`,
        },
        {
          title: "Conversaciones atribuidas",
          value: number.format(commercialSummary?.conversaciones ?? 0),
          hint: "Conversaciones atribuidas a campañas WhatsApp",
        },
        {
          title: "Oportunidades atribuidas",
          value: number.format(commercialSummary?.oportunidades ?? 0),
          hint: "Oportunidades atribuidas a campañas",
        },
      )
    } else {
      const items = campaignItems
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
      const totalHint = `WA ${number.format(byChannel.whatsapp)} · Correo ${number.format(byChannel.correo)} · Voz ${number.format(byChannel.llamada)}`
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
      const deliveredHint = `WA ${number.format(deliveredByChannel.whatsapp)} · Correo ${number.format(deliveredByChannel.correo)} · Voz ${number.format(deliveredByChannel.llamada)}`
      const responsesHint = `WA ${number.format(responsesByChannel.whatsapp)} · Correo ${number.format(responsesByChannel.correo)} · Voz ${number.format(responsesByChannel.llamada)}`

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
        hint: `${summaryPhrases?.tasa_conversacion_oportunidad_pct ?? 0}% conv→opp`,
      })
    }
    return cards
  }, [summaryCampaign, commercialSummary, summaryPhrases, campaignItems, canal])

  const channelSummary = useMemo(() => {
    const items = campaignItems
    const normalize = (value: string | null | undefined) => (value || "").trim().toLowerCase()
    const channels: Array<"correo" | "whatsapp" | "llamada"> = ["correo", "whatsapp", "llamada"]
    const labelMap: Record<typeof channels[number], string> = {
      correo: "Correo",
      whatsapp: "WhatsApp",
      llamada: "Voz",
    }
    type ChannelSummaryRow = {
      canal: "correo" | "whatsapp" | "llamada"
      canal_label: string
      envios_totales: number
      envios_totales_stack: number
      envios_enviados: number
      envios_entregados: number
      envios_respondidos: number
      envios_fallidos: number
      envios_omitidos: number
      envios_sin_respuesta: number
      envios_otros_estados: number
      entrega_pct: number
      respuesta_pct: number
      open_rate: number
      click_rate: number
    }
    const rows: ChannelSummaryRow[] = channels.map((ch) => {
      const channelRows = items.filter((item) => normalize(item.canal) === ch)
      const envios_totales = channelRows.reduce((sum, r) => sum + (r.envios_totales || 0), 0)
      const envios_entregados = channelRows.reduce((sum, r) => sum + (r.envios_entregados || 0), 0)
      const envios_respondidos = channelRows.reduce((sum, r) => sum + (r.envios_respondidos || 0), 0)
      const envios_fallidos = channelRows.reduce((sum, r) => sum + (r.envios_fallidos || 0), 0)
      const envios_omitidos = channelRows.reduce((sum, r) => sum + (r.envios_omitidos || 0), 0)
      const envios_sin_respuesta = Math.max(0, envios_entregados - envios_respondidos)
      const envios_enviados = envios_entregados
      const envios_otros_estados = Math.max(
        0,
        envios_totales - (envios_enviados + envios_fallidos + envios_omitidos),
      )
      const envios_totales_stack = envios_totales
      const brevo_aperturas = channelRows.reduce((sum, r) => sum + (r.brevo_aperturas || 0), 0)
      const brevo_clicks = channelRows.reduce((sum, r) => sum + (r.brevo_clicks || 0), 0)
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

    if (commercialSummary) {
      const whatsappTotal = commercialSummary.envios ?? 0
      const whatsappRespondidos = commercialSummary.respondieron ?? 0
      const whatsappEntregados = commercialSummary.entregados ?? 0
      const existingIndex = rows.findIndex((row) => row.canal === "whatsapp")
      const whatsappRow: ChannelSummaryRow = {
        canal: "whatsapp",
        canal_label: "WhatsApp",
        envios_totales: whatsappTotal,
        envios_totales_stack: whatsappTotal,
        envios_enviados: whatsappTotal,
        envios_entregados: whatsappEntregados,
        envios_respondidos: whatsappRespondidos,
        envios_fallidos: 0,
        envios_omitidos: 0,
        envios_sin_respuesta: Math.max(0, whatsappEntregados - whatsappRespondidos),
        envios_otros_estados: 0,
        entrega_pct: whatsappTotal > 0 ? Math.round((whatsappEntregados / whatsappTotal) * 100) : 0,
        respuesta_pct: whatsappTotal > 0 ? Math.round((whatsappRespondidos / whatsappTotal) * 100) : 0,
        open_rate: 0,
        click_rate: 0,
      }
      if (existingIndex >= 0) {
        rows[existingIndex] = whatsappRow
      } else {
        rows.push(whatsappRow)
      }
    }

    const channelOrder: Record<string, number> = { correo: 0, whatsapp: 1, llamada: 2 }
    return rows
      .filter((row) => row.envios_totales_stack > 0 || row.canal !== "whatsapp")
      .sort((a, b) => (channelOrder[a.canal] ?? 99) - (channelOrder[b.canal] ?? 99))
  }, [campaignItems, commercialSummary])

  const sortedCampaignItems = useMemo(() => {
    const items = [...campaignItems]
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
  }, [campaignItems, tableSort])

  const campaignTotals = useMemo(() => {
    const items = campaignItems
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
  }, [campaignItems])

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
        campaignItems.map((item) => [
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
    if (activeTab === "campanas_whatsapp") {
      const rows = commercialItems.map((item) => [
        item.campana_id,
        item.campana_nombre,
        item.canal,
        item.envios,
        item.entregados,
        item.respondieron,
        item.oportunidades,
        item.clientes,
        item.costo_total,
        item.costo_por_oportunidad,
        item.costo_adquisicion,
        item.pendientes_cobro,
      ])
      const csv = buildCsv(
        ["campana_id", "campana_nombre", "canal", "envios", "entregados", "respondieron", "oportunidades", "clientes", "costo_total", "costo_por_oportunidad", "costo_adquisicion", "pendientes_cobro"],
        rows,
      )
      downloadCsv(`prospeccion_metricas_resultado_whatsapp_${timestamp}.csv`, csv)
      return
    }
    const phraseRows = phraseCampaignGroups.flatMap((group) => [
      ["campana", group.campana, "", group.canal, group.oportunidades, "", "", "", ""],
      ...group.frases.map((item) => [
        "frase",
        group.campana,
        item.regla_nombre,
        item.canal_publicitario,
        item.oportunidades_creadas,
        "",
        "",
        "",
        "",
      ]),
    ])
    const csv = buildCsv(
      [
        "nivel",
        "campana_publicitaria",
        "frase_cta",
        "canal_publicitario",
        "oportunidades_creadas",
        "clientes",
        "gasto_publicitario",
        "cpo",
        "cac",
      ],
      phraseRows,
    )
    downloadCsv(`prospeccion_metricas_frases_${timestamp}.csv`, csv)
  }, [activeTab, data, campaignItems, commercialItems, phraseCampaignGroups])

  const exportXlsx = useCallback(async () => {
    try {
      const result = await downloadProspeccionMetricasXlsx({
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        canal,
        limit: 2000,
      })
      downloadBlob(result.filename, result.blob)
    } catch (err) {
      const message = err instanceof Error ? err.message : "No se pudo exportar el XLSX."
      setError(message)
    }
  }, [dateFrom, dateTo, canal])

  const summaryChannelRows = useMemo(
    () =>
      channelSummary.map((row) => ({
        ...row,
        resultLabel: row.canal === "llamada" ? "Contestadas" : "Entregados",
        resultValue: row.envios_entregados,
        responseLabel: row.canal === "correo" ? "Aperturas" : "Respuestas",
        responseValue: row.canal === "correo" ? Math.round((row.open_rate / 100) * row.envios_entregados) : row.envios_respondidos,
      })),
    [channelSummary],
  )

  const openChannel = (channel: "correo" | "whatsapp" | "llamada") => {
    setIsSummaryView(false)
    setCanal(channel)
    setActiveTab(channel === "whatsapp" ? "campanas_whatsapp" : "campanas")
  }

  const handlePeriodChange = (value: PeriodPreset) => {
    setPeriodPreset(value)
    if (value === "personalizado") return
    const dates = getPeriodDates(value)
    setDateFrom(dates.from)
    setDateTo(dates.to)
  }

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-border bg-card px-5 py-6 text-foreground shadow-sm md:px-7">
        <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)_180px] lg:items-center">
          <div className="text-right">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Prospección</p>
            <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Métricas</h1>
          </div>
          <div className="grid w-full min-w-0 max-w-[520px] grid-cols-4 justify-self-center gap-2">
            <button
              type="button"
              onClick={() => { setIsSummaryView(true); setCanal("todos") }}
              className={`flex h-11 w-full items-center justify-center rounded-lg px-4 text-sm font-medium transition ${isSummaryView ? "bg-primary text-primary-foreground shadow-sm" : "border border-border bg-muted/30 text-muted-foreground hover:bg-muted hover:text-foreground"}`}
            >
              Resumen general
            </button>
            {([
              ["correo", "Correo"],
              ["whatsapp", "WhatsApp"],
              ["llamada", "Voz"],
            ] as const).map(([value, label]) => {
              const active = !isSummaryView && canal === value
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => openChannel(value)}
                  className={`flex h-11 w-full items-center justify-center rounded-lg px-4 text-sm font-medium transition ${active ? "bg-primary text-primary-foreground shadow-sm" : "border border-border bg-muted/30 text-muted-foreground hover:bg-muted hover:text-foreground"}`}
                >
                  {label}
                </button>
              )
            })}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={periodPreset} onValueChange={(value) => handlePeriodChange(value as PeriodPreset)}>
            <SelectTrigger className="h-10 w-[172px] border-border bg-background text-xs text-foreground hover:bg-muted">
                <SelectValue placeholder="Periodo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="actual">Periodo actual</SelectItem>
                <SelectItem value="7">Últimos 7 días</SelectItem>
                <SelectItem value="30">Últimos 30 días</SelectItem>
                <SelectItem value="90">Últimos 90 días</SelectItem>
                <SelectItem value="mes">Este mes</SelectItem>
                <SelectItem value="personalizado">Personalizado</SelectItem>
              </SelectContent>
            </Select>
            {periodPreset === "personalizado" ? (
              <div className="flex items-center gap-1">
                <Input
                  aria-label="Fecha inicial"
                  className="h-10 w-[132px] border-border bg-background text-xs text-foreground [color-scheme:dark]"
                  type="date"
                  value={dateFrom}
                  onChange={(event) => setDateFrom(event.target.value)}
                />
                <span className="text-xs text-muted-foreground">→</span>
                <Input
                  aria-label="Fecha final"
                  className="h-10 w-[132px] border-border bg-background text-xs text-foreground [color-scheme:dark]"
                  type="date"
                  min={dateFrom || undefined}
                  value={dateTo}
                  onChange={(event) => setDateTo(event.target.value)}
                />
              </div>
            ) : null}
            {loading ? <IconLoader className="h-4 w-4 animate-spin text-muted-foreground" aria-label="Actualizando" /> : null}
          </div>

        </div>
      </section>

      {isSummaryView ? (
        <section className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: "Actividad registrada", value: summaryChannelRows.reduce((sum, row) => sum + row.envios_totales, 0), hint: "Mensajes y envíos del periodo" },
              { label: "Resultados efectivos", value: summaryChannelRows.reduce((sum, row) => sum + row.resultValue, 0), hint: "Entregas o conversaciones" },
              { label: "Respuestas", value: summaryChannelRows.reduce((sum, row) => sum + row.envios_respondidos, 0), hint: "Interacciones atribuidas" },
              { label: "Oportunidades", value: commercialSummary?.oportunidades ?? summaryPhrases?.oportunidades_creadas ?? 0, hint: "Atribuidas a campañas" },
            ].map((item) => (
              <Card key={item.label} className="border-border shadow-none">
                <CardContent className="p-5">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{item.label}</p>
                  <p className="mt-2 text-3xl font-semibold tracking-tight text-foreground">{number.format(item.value)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{item.hint}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card className="border-border shadow-none">
            <CardHeader className="border-b border-border/60 pb-4">
              <CardTitle className="text-base">Rendimiento por canal</CardTitle>
              <p className="text-sm text-muted-foreground">Selecciona un canal para consultar su detalle.</p>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-border/60">
                {summaryChannelRows.map((row) => (
                  <button
                    key={row.canal}
                    type="button"
                    onClick={() => openChannel(row.canal)}
                    className="grid w-full gap-3 px-5 py-4 text-left transition hover:bg-muted/50 md:grid-cols-[1.2fr_repeat(4,1fr)_auto] md:items-center md:px-6"
                  >
                    <span>
                      <span className="block font-medium text-foreground">{row.canal_label}</span>
                      <span className="text-xs text-muted-foreground">{number.format(row.envios_totales)} de actividad</span>
                    </span>
                    <span><span className="block text-xs text-muted-foreground">{row.resultLabel}</span><span className="font-semibold">{number.format(row.resultValue)}</span></span>
                    <span><span className="block text-xs text-muted-foreground">{row.responseLabel}</span><span className="font-semibold">{number.format(row.responseValue)}</span></span>
                    <span><span className="block text-xs text-muted-foreground">Entrega</span><span className="font-semibold">{row.envios_totales ? `${row.entrega_pct}%` : "—"}</span></span>
                    <span><span className="block text-xs text-muted-foreground">Respuesta</span><span className="font-semibold">{row.envios_totales ? `${row.respuesta_pct}%` : "—"}</span></span>
                    <span className="text-sm font-medium text-muted-foreground">Ver detalle →</span>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        </section>
      ) : null}

      {!isSummaryView ? (
        <>
      <Card className="border-border shadow-none">
        <CardHeader className="gap-1 py-1">
          <div className="flex flex-col gap-1 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-1">
              {activeTab === "campanas_whatsapp" ? (
                <CardTitle className="text-base font-semibold">Detalle del canal</CardTitle>
              ) : (
                <>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Detalle del canal</p>
                  <CardTitle className="text-lg">{activeViewMeta[activeTab].title}</CardTitle>
                  <p className="max-w-2xl text-sm text-muted-foreground">{activeViewMeta[activeTab].description}</p>
                </>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2 lg:justify-end">
              {activeTab === "campanas_whatsapp" ? (
                <div className="flex rounded-lg border border-border bg-muted/30 p-0.5">
                  <button
                    type="button"
                    onClick={() => setActiveTab("campanas_whatsapp")}
                    className="rounded-md bg-background px-2.5 py-1 text-[11px] font-medium text-foreground shadow-sm"
                  >
                    Campañas
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab("frases")}
                    className="rounded-md px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
                  >
                    Atribución
                  </button>
                </div>
              ) : activeTab === "frases" ? (
                <div className="flex rounded-lg border border-border bg-muted/30 p-0.5">
                  <button
                    type="button"
                    onClick={() => setActiveTab("campanas_whatsapp")}
                    className="rounded-md px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
                  >
                    Campañas
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab("frases")}
                    className="rounded-md bg-background px-2.5 py-1 text-[11px] font-medium text-foreground shadow-sm"
                  >
                    Atribución
                  </button>
                </div>
              ) : null}
              <Button
                variant="outline"
                className="h-8 px-2 text-xs"
                onClick={exportActiveCsv}
                disabled={Boolean(!hydrated || loading || !data)}
              >
                <IconDownload className="mr-1.5 h-3.5 w-3.5" />
                Exportar CSV
              </Button>
              <Button className="h-8 px-2 text-xs" variant="outline" onClick={() => void exportXlsx()} disabled={Boolean(!hydrated || loading || !data)}>
                <IconFileSpreadsheet className="mr-1.5 h-3.5 w-3.5" />
                Exportar XLSX
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {topCards.length > 0 ? (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
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
      ) : null}

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
                    <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                    <XAxis dataKey="fecha_label" tickMargin={8} tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} axisLine={{ stroke: "var(--border)" }} tickLine={{ stroke: "var(--border)" }} />
                    <YAxis allowDecimals={false} tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} axisLine={{ stroke: "var(--border)" }} tickLine={{ stroke: "var(--border)" }} />
                    <Tooltip
                      formatter={(value) => number.format(Number(value) || 0)}
                      contentStyle={{ backgroundColor: "var(--card)", border: "1px solid var(--border)", borderRadius: "0.5rem", color: "var(--foreground)" }}
                      labelStyle={{ color: "var(--foreground)" }}
                      itemStyle={{ color: "var(--foreground)" }}
                      cursor={{ fill: "var(--muted)" }}
                    />
                    <Legend wrapperStyle={{ color: "var(--muted-foreground)" }} />
                    <Line type="monotone" dataKey="envios_totales" stroke="var(--chart-1)" strokeWidth={2} dot={false} name="Envíos totales" />
                    <Line type="monotone" dataKey="envios_entregados" stroke="var(--chart-2)" strokeWidth={2} dot={false} name="Entregados" />
                    <Line type="monotone" dataKey="envios_respondidos" stroke="var(--chart-3)" strokeWidth={2} dot={false} name="Respondidos" />
                    <Line type="monotone" dataKey="envios_fallidos" stroke="var(--chart-4)" strokeWidth={2} dot={false} name="Fallidos" />
                    <Line type="monotone" dataKey="envios_omitidos" stroke="var(--chart-5)" strokeWidth={2} dot={false} name="Omitidos" />
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
                        <td className="max-w-[320px] truncate px-2 py-2" title={resolveTemplateTooltip(item)}>
                          {item.template_nombre ?? item.template_slug ?? "-"}
                        </td>
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
      ) : activeTab === "campanas_whatsapp" ? (
        <div className="space-y-4">
          <Card className="border-primary/20 bg-primary/5 shadow-none">
            <CardHeader className="pb-3">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <CardTitle className="text-base">Resultado comercial</CardTitle>
                  <p className="text-xs text-muted-foreground">
                    Oportunidades, clientes y costo atribuidos a campañas WhatsApp.
                  </p>
                </div>
                {commercialSummary?.costo_estado === "pendiente_conciliacion" ? (
                  <Badge variant="outline" className="w-fit border-border bg-muted text-muted-foreground">
                    {number.format(commercialSummary.pendientes_cobro)} pendientes de conciliación
                  </Badge>
                ) : null}
              </div>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-7">
              {[
                { title: "Enviados", value: number.format(commercialSummary?.envios ?? 0), hint: "Mensajes de campaña" },
                {
                  title: "Entregados",
                  value: number.format(commercialSummary?.entregados ?? 0),
                  hint: `${(commercialSummary?.tasa_entrega_pct ?? 0).toFixed(2)}% de los enviados`,
                },
                {
                  title: "Oportunidades",
                  value: number.format(commercialSummary?.oportunidades ?? 0),
                  hint: `${commercialOpportunityRate.toFixed(2)}% de las conversaciones`,
                },
                { title: "Clientes ganados", value: number.format(commercialSummary?.clientes ?? 0), hint: "Oportunidades ganadas" },
                {
                  title: "Costo total",
                  value: commercialSummary?.costo_estado === "conciliado"
                    ? moneyPrecise.format(commercialSummary.costo_total)
                    : commercialSummary?.costo_estado === "sin_datos" ? "—" : "Pendiente",
                  hint: commercialSummary?.costo_estado === "conciliado" ? "Costo conciliado" : commercialSummary?.costo_estado === "sin_datos" ? "Sin datos" : "Requiere conciliación",
                },
                {
                  title: "CPO",
                  value: commercialSummary?.costo_estado === "sin_datos"
                    ? "—"
                    : commercialSummary?.costo_por_oportunidad !== null && commercialSummary?.costo_por_oportunidad !== undefined
                    ? moneyPrecise.format(commercialSummary.costo_por_oportunidad)
                    : "Pendiente",
                  hint: "Costo por oportunidad",
                },
                {
                  title: "CAC",
                  value: commercialSummary?.costo_estado === "sin_datos"
                    ? "—"
                    : commercialSummary?.costo_adquisicion !== null && commercialSummary?.costo_adquisicion !== undefined
                    ? moneyPrecise.format(commercialSummary.costo_adquisicion)
                    : "Pendiente",
                  hint: "Costo por cliente ganado",
                },
              ].map((card) => (
                <div key={card.title} className="rounded-xl border border-border bg-background/80 p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{card.title}</p>
                  <p className="mt-2 text-xl font-semibold text-foreground">{card.value}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{card.hint}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="border-border shadow-none">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Resultado por campaña</CardTitle>
              <p className="text-xs text-muted-foreground">El mismo embudo comercial que muestra el mapa de conversión.</p>
            </CardHeader>
            <CardContent>
              {commercialItems.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[780px] text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="px-2 py-2">Campaña</th>
                        <th className="px-2 py-2">Enviados</th>
                        <th className="px-2 py-2">Entregados</th>
                        <th className="px-2 py-2">Oportunidades</th>
                        <th className="px-2 py-2">Clientes</th>
                        <th className="px-2 py-2">Costo</th>
                        <th className="px-2 py-2">CPO</th>
                        <th className="px-2 py-2">CAC</th>
                      </tr>
                    </thead>
                    <tbody>
                      {commercialItems.map((item) => {
                        const costsPending = (item.pendientes_cobro ?? 0) > 0
                        return (
                          <tr key={item.campana_id ?? item.campana_nombre ?? "sin-campana"} className="border-b last:border-0">
                            <td className="px-2 py-2 font-medium">{item.campana_nombre ?? "Sin campaña"}</td>
                            <td className="px-2 py-2">{number.format(item.envios)}</td>
                            <td className="px-2 py-2">{number.format(item.entregados)}</td>
                            <td className="px-2 py-2">{number.format(item.oportunidades)}</td>
                            <td className="px-2 py-2">{number.format(item.clientes)}</td>
                            <td className="px-2 py-2">{costsPending ? "Pendiente" : moneyPrecise.format(item.costo_total)}</td>
                            <td className="px-2 py-2">{costsPending ? "Pendiente" : moneyPrecise.format(item.costo_por_oportunidad ?? 0)}</td>
                            <td className="px-2 py-2">{costsPending ? "Pendiente" : moneyPrecise.format(item.costo_adquisicion ?? 0)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="py-6 text-center text-sm text-muted-foreground">No hay resultado comercial para este periodo.</p>
              )}
            </CardContent>
          </Card>

        </div>
      ) : (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Resultado comercial</CardTitle>
              <p className="text-sm text-muted-foreground">
                Oportunidades atribuidas a frases y CTA de campañas publicitarias.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Conversaciones</p>
                  <p className="mt-1 text-xl font-semibold">{number.format(summaryPhrases?.conversaciones_atribuidas ?? 0)}</p>
                  <p className="text-xs text-muted-foreground">Atribuidas por frase</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Oportunidades</p>
                  <p className="mt-1 text-xl font-semibold">{number.format(summaryPhrases?.oportunidades_creadas ?? 0)}</p>
                  <p className="text-xs text-muted-foreground">Resultado atribuido</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Clientes</p>
                  <p className="mt-1 text-xl font-semibold">—</p>
                  <p className="text-xs text-muted-foreground">No disponible en atribución</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Gasto publicitario</p>
                  <p className="mt-1 text-xl font-semibold">—</p>
                  <p className="text-xs text-muted-foreground">Pendiente de registro</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">CPO / CAC</p>
                  <p className="mt-1 text-xl font-semibold">—</p>
                  <p className="text-xs text-muted-foreground">Requiere gasto publicitario</p>
                </div>
              </div>
              <div className="rounded-md border border-dashed bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                Esta sección solo mide la atribución de conversaciones y oportunidades. No mezcla el costo de mensajes enviados por la empresa.
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Resultado por campaña/frase</CardTitle>
              <p className="text-sm text-muted-foreground">
                Desglose de la campaña publicitaria y la regla o frase que originó la atribución.
              </p>
            </CardHeader>
            <CardContent>
              {phraseCampaignGroups.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[900px] text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="px-2 py-2">Campaña / frase CTA</th>
                        <th className="px-2 py-2">Canal</th>
                        <th className="px-2 py-2">Oportunidades</th>
                        <th className="px-2 py-2">Clientes</th>
                        <th className="px-2 py-2">Gasto</th>
                        <th className="px-2 py-2">CPO</th>
                        <th className="px-2 py-2">CAC</th>
                      </tr>
                    </thead>
                    <tbody>
                      {phraseCampaignGroups.map((group) => (
                        <Fragment key={group.campana}>
                          <tr className="border-b bg-muted/30 font-medium">
                            <td className="px-2 py-2">{group.campana}</td>
                            <td className="px-2 py-2">{group.canal}</td>
                            <td className="px-2 py-2">{number.format(group.oportunidades)}</td>
                            <td className="px-2 py-2">—</td>
                            <td className="px-2 py-2">—</td>
                            <td className="px-2 py-2">—</td>
                            <td className="px-2 py-2">—</td>
                          </tr>
                          {group.frases.map((item, index) => (
                            <tr key={`${item.regla_id ?? item.regla_nombre}-${index}`} className="border-b last:border-0">
                              <td className="px-2 py-2 pl-6 text-muted-foreground">↳ {item.regla_nombre}</td>
                              <td className="px-2 py-2">{item.canal_publicitario}</td>
                              <td className="px-2 py-2">{number.format(item.oportunidades_creadas)}</td>
                              <td className="px-2 py-2">—</td>
                              <td className="px-2 py-2">—</td>
                              <td className="px-2 py-2">—</td>
                              <td className="px-2 py-2">—</td>
                            </tr>
                          ))}
                        </Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="py-6 text-center text-sm text-muted-foreground">No hay frases atribuidas en este periodo.</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}
      </>
      ) : null}
    </div>
  )
}
