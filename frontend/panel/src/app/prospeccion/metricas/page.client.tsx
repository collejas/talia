"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { IconLoader } from "@tabler/icons-react"

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

      <div className="flex gap-2">
        <Button variant={activeTab === "campanas" ? "default" : "outline"} onClick={() => setActiveTab("campanas")}>Campañas</Button>
        <Button variant={activeTab === "frases" ? "default" : "outline"} onClick={() => setActiveTab("frases")}>Frases WhatsApp</Button>
      </div>

      {error ? (
        <Card>
          <CardContent className="py-4 text-sm text-destructive">{error}</CardContent>
        </Card>
      ) : null}

      {activeTab === "campanas" ? (
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
      ) : (
        <div className="space-y-4">
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
