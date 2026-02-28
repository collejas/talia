"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { IconDownload, IconLoader } from "@tabler/icons-react"
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
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  getProspeccionMetricas,
  listCrmCampaigns,
  listWhatsAppAtribucionReglas,
  type CrmCampaign,
  type ProspeccionMetricasResponse,
  type WhatsAppAtribucionRule,
} from "@/lib/prospeccion/prospectos-client"

const money = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 })
const number = new Intl.NumberFormat("es-MX")
const shortDate = new Intl.DateTimeFormat("es-MX", { month: "short", day: "2-digit" })

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
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<ProspeccionMetricasResponse | null>(null)

  const [campaigns, setCampaigns] = useState<CrmCampaign[]>([])
  const [rules, setRules] = useState<WhatsAppAtribucionRule[]>([])

  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [canal, setCanal] = useState<"todos" | "correo" | "whatsapp" | "llamada">("todos")
  const [campanaId, setCampanaId] = useState("todos")
  const [campanaPublicitaria, setCampanaPublicitaria] = useState("")
  const [reglaId, setReglaId] = useState("todos")

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
        limit: 2000,
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

  const summaryCampaign = data?.campanas.summary
  const summaryPhrases = data?.frases_whatsapp.summary
  const campaignChartData = useMemo(
    () =>
      (data?.campanas.timeseries ?? []).map((item) => ({
        ...item,
        fecha_label: shortDate.format(new Date(`${item.fecha}T00:00:00`)),
      })),
    [data?.campanas.timeseries],
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
    cards.push({
      title: "Envíos totales",
      value: number.format(summaryCampaign?.envios_totales ?? 0),
      hint: "Bloque campañas",
    })
    cards.push({
      title: "Entregados",
      value: number.format(summaryCampaign?.envios_entregados ?? 0),
      hint: `${summaryCampaign?.tasa_entrega_pct ?? 0}% entrega`,
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
    return cards
  }, [summaryCampaign, summaryPhrases])

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
            <Button onClick={() => void loadMetrics()} disabled={loading}>
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

      <div className="flex flex-wrap items-center gap-2">
        <Button variant={activeTab === "campanas" ? "default" : "outline"} onClick={() => setActiveTab("campanas")}>Campañas</Button>
        <Button variant={activeTab === "frases" ? "default" : "outline"} onClick={() => setActiveTab("frases")}>Frases WhatsApp</Button>
        <Button
          variant="outline"
          onClick={exportActiveCsv}
          disabled={loading || !data}
          className="ml-auto"
        >
          <IconDownload className="mr-2 h-4 w-4" />
          Exportar CSV ({activeTab === "campanas" ? "campañas" : "frases"})
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
              <CardTitle>Tendencia diaria de campañas</CardTitle>
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
                <table className="w-full min-w-[960px] text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="px-2 py-2">Campaña</th>
                      <th className="px-2 py-2">Canal</th>
                      <th className="px-2 py-2">Plantilla</th>
                      <th className="px-2 py-2">Totales</th>
                      <th className="px-2 py-2">Entregados</th>
                      <th className="px-2 py-2">Respondidos</th>
                      <th className="px-2 py-2">Aperturas</th>
                      <th className="px-2 py-2">Clics</th>
                      <th className="px-2 py-2">Sesiones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data?.campanas.items ?? []).map((item, idx) => (
                      <tr key={`${item.template_id ?? item.template_slug ?? idx}`} className="border-b">
                        <td className="px-2 py-2">{item.campana_nombre ?? "-"}</td>
                        <td className="px-2 py-2"><Badge variant="secondary">{item.canal ?? "-"}</Badge></td>
                        <td className="px-2 py-2">{item.template_nombre ?? item.template_slug ?? "-"}</td>
                        <td className="px-2 py-2">{number.format(item.envios_totales)}</td>
                        <td className="px-2 py-2">{number.format(item.envios_entregados)}</td>
                        <td className="px-2 py-2">{number.format(item.envios_respondidos)}</td>
                        <td className="px-2 py-2">{number.format(item.brevo_aperturas)}</td>
                        <td className="px-2 py-2">{number.format(item.brevo_clicks)}</td>
                        <td className="px-2 py-2">{number.format(item.sesiones_utm)}</td>
                      </tr>
                    ))}
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
