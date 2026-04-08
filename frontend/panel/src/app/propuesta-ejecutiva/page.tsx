"use client"

import { useCallback, useMemo, useState } from "react"

import { AppViewLayout } from "@/components/layouts/app-view-layout"

type CityInvestment = {
  id: string
  name: string
  amount: number
}

const defaultCities: CityInvestment[] = [
  { id: "city-1", name: "Ciudad 1", amount: 100_000 },
  { id: "city-2", name: "Ciudad 2", amount: 80_000 },
  { id: "city-3", name: "Ciudad 3", amount: 80_000 },
  { id: "city-4", name: "Ciudad 4", amount: 60_000 },
  { id: "city-5", name: "Ciudad 5", amount: 60_000 },
  { id: "city-6", name: "Ciudad 6", amount: 60_000 },
]

const defaultCorporateItems = [
  "CRM centralizado multi-ciudad",
  "Dashboard ejecutivo consolidado",
  "Control de usuarios, roles y permisos",
  "Métricas y analítica global",
  "Base de inteligencia del asistente IA",
]

const defaultCityItems = [
  "Configuración de desarrollos activos",
  "Parametrización de flujos comerciales",
  "Entrenamiento del asistente IA con inventario local",
  "Asignación de asesores y reglas de operación",
  "Integración con canales (WhatsApp / Web)",
]

const defaultSpecialConditions = [
  "Implementación de hasta 6 ciudades",
  "Ejecución dentro de un periodo máximo de 90 días",
  "Requiere disponibilidad de información, accesos y validaciones por parte del cliente",
]

const currencyMx = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  maximumFractionDigits: 0,
})

function formatCurrency(amount: number): string {
  return currencyMx.format(Number.isFinite(amount) ? amount : 0)
}

export default function PropuestaEjecutivaPage() {
  const [proposalTitle, setProposalTitle] = useState(
    "🧾 PROPUESTA EJECUTIVA · Implementación Tal-IA · Operación Multi-Ciudad",
  )
  const [strategicIntroOne, setStrategicIntroOne] = useState(
    "La operación actual contempla múltiples ciudades con dinámicas comerciales independientes.",
  )
  const [strategicIntroTwo, setStrategicIntroTwo] = useState(
    "La implementación de Tal-IA se estructura para centralizar el control corporativo, automatizar la atención por ciudad y estandarizar procesos sin perder flexibilidad local.",
  )
  const [strategicIntroThree, setStrategicIntroThree] = useState(
    "Cada ciudad se configura como una unidad de ventas autónoma, operando bajo un mismo sistema central.",
  )

  const [corporateItems, setCorporateItems] = useState<string[]>([...defaultCorporateItems])
  const [corporateInvestment, setCorporateInvestment] = useState(50_000)
  const [cityItems, setCityItems] = useState<string[]>([...defaultCityItems])
  const [cities, setCities] = useState<CityInvestment[]>(() => [...defaultCities])
  const [specialTotal, setSpecialTotal] = useState(380_000)
  const [specialConditions, setSpecialConditions] = useState<string[]>([
    ...defaultSpecialConditions,
  ])
  const [monthlyBase, setMonthlyBase] = useState(4_500)
  const [monthlyAdditional, setMonthlyAdditional] = useState(2_250)
  const [recipientEmail, setRecipientEmail] = useState("")
  const [messageBody, setMessageBody] = useState(
    "Adjunto encontrarás la propuesta ejecutiva Tal-IA.",
  )
  const [sendingEmail, setSendingEmail] = useState(false)
  const [emailFeedback, setEmailFeedback] = useState<string | null>(null)

  const implementationTotal = useMemo(
    () => cities.reduce((sum, city) => sum + (Number.isFinite(city.amount) ? city.amount : 0), 0),
    [cities],
  )

  const monthlyForCurrentCities = useMemo(() => {
    if (cities.length <= 0) {
      return 0
    }
    if (cities.length === 1) {
      return monthlyBase
    }
    return monthlyBase + monthlyAdditional * (cities.length - 1)
  }, [cities.length, monthlyAdditional, monthlyBase])

  const proposalPayload = useMemo(
    () => ({
      proposalTitle,
      strategicIntroOne,
      strategicIntroTwo,
      strategicIntroThree,
      corporateItems,
      corporateInvestment,
      cityItems,
      cities: cities.map((city) => ({
        name: city.name,
        amount: city.amount,
      })),
      specialTotal,
      specialConditions,
      monthlyBase,
      monthlyAdditional,
    }),
    [
      proposalTitle,
      strategicIntroOne,
      strategicIntroTwo,
      strategicIntroThree,
      corporateItems,
      corporateInvestment,
      cityItems,
      cities,
      specialTotal,
      specialConditions,
      monthlyBase,
      monthlyAdditional,
    ],
  )

  const addCity = () => {
    setCities((prev) => [
      ...prev,
      {
        id: `city-${Date.now()}`,
        name: `Ciudad ${prev.length + 1}`,
        amount: 0,
      },
    ])
  }

  const removeCity = (cityId: string) => {
    setCities((prev) => prev.filter((city) => city.id !== cityId))
  }

  const handleExport = useCallback(async () => {
    if (typeof window === "undefined") {
      return
    }
    try {
      const response = await fetch("/api/propuesta/ejecutiva/pdf", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/pdf",
        },
        body: JSON.stringify(proposalPayload),
      })
      if (!response.ok) {
        const errorText = await response.text().catch(() => null)
        throw new Error(errorText || "No se pudo generar el PDF.")
      }
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      window.open(url, "_blank")
      setTimeout(() => URL.revokeObjectURL(url), 30_000)
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "No se pudo exportar la propuesta."
      window.alert(message)
    }
  }, [proposalPayload])

  const handleSendEmail = useCallback(async () => {
    if (!recipientEmail.trim()) {
      setEmailFeedback("Ingresa un correo válido para enviar la propuesta.")
      return
    }
    setSendingEmail(true)
    setEmailFeedback(null)
    try {
      const response = await fetch("/api/propuesta/ejecutiva/email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          recipients: [recipientEmail.trim()],
          subject: "Propuesta Ejecutiva Tal-IA · Multi-Ciudad",
          message: messageBody.trim(),
          proposal: proposalPayload,
        }),
      })
      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        const error = payload?.detail || payload?.error || "No se pudo enviar el correo."
        throw new Error(error)
      }
      setEmailFeedback("Propuesta enviada correctamente.")
    } catch (error) {
      setEmailFeedback(
        error instanceof Error ? error.message : "Hubo un error enviando el correo.",
      )
    } finally {
      setSendingEmail(false)
    }
  }, [recipientEmail, messageBody, proposalPayload])

  return (
    <AppViewLayout title="Propuesta Ejecutiva" contentClassName="max-w-full">
      <div className="space-y-6 px-4 pb-8 lg:px-6">
        <section className="rounded-2xl border border-border/60 bg-surface-alt p-6 shadow-sm">
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.35em] text-muted-foreground">
            Encabezado estratégico
          </p>
          <label className="mt-3 block space-y-1 text-[0.65rem] uppercase tracking-[0.3em] text-muted-foreground">
            <span className="text-xs font-semibold text-foreground">Título</span>
            <input
              type="text"
              value={proposalTitle}
              onChange={(event) => setProposalTitle(event.target.value)}
              className="w-full rounded-md border border-border/50 bg-white px-3 py-2 text-sm text-foreground focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-200"
            />
          </label>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <label className="space-y-1 text-[0.65rem] uppercase tracking-[0.3em] text-muted-foreground">
              <span className="text-xs font-semibold text-foreground">Párrafo 1</span>
              <textarea
                rows={4}
                value={strategicIntroOne}
                onChange={(event) => setStrategicIntroOne(event.target.value)}
                className="w-full rounded-md border border-border/50 bg-white px-3 py-2 text-sm text-foreground focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-200"
              />
            </label>
            <label className="space-y-1 text-[0.65rem] uppercase tracking-[0.3em] text-muted-foreground">
              <span className="text-xs font-semibold text-foreground">Párrafo 2</span>
              <textarea
                rows={4}
                value={strategicIntroTwo}
                onChange={(event) => setStrategicIntroTwo(event.target.value)}
                className="w-full rounded-md border border-border/50 bg-white px-3 py-2 text-sm text-foreground focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-200"
              />
            </label>
            <label className="space-y-1 text-[0.65rem] uppercase tracking-[0.3em] text-muted-foreground">
              <span className="text-xs font-semibold text-foreground">Párrafo 3</span>
              <textarea
                rows={4}
                value={strategicIntroThree}
                onChange={(event) => setStrategicIntroThree(event.target.value)}
                className="w-full rounded-md border border-border/50 bg-white px-3 py-2 text-sm text-foreground focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-200"
              />
            </label>
          </div>
        </section>

        <section className="rounded-2xl border border-border/60 bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-semibold text-foreground">{proposalTitle}</h1>

          <div className="mt-6 space-y-3">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-foreground">
              🧠 Enfoque estratégico
            </p>
            <p className="text-sm text-muted-foreground">{strategicIntroOne}</p>
            <p className="text-sm text-muted-foreground">{strategicIntroTwo}</p>
            <p className="text-sm font-medium text-foreground">👉 {strategicIntroThree}</p>
          </div>

          <div className="mt-8 space-y-4">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-foreground">
              💼 Estructura de implementación
            </p>
            <div className="rounded-xl border border-border/50 bg-muted/10 p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm font-semibold text-foreground">🏢 Plataforma corporativa (única)</p>
                <div className="flex items-center gap-2">
                  <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                    Inversión única
                  </span>
                  <input
                    type="number"
                    min={0}
                    value={corporateInvestment}
                    onChange={(event) => setCorporateInvestment(Number(event.target.value) || 0)}
                    className="w-32 rounded-md border border-border/50 bg-white px-2 py-1 text-right text-sm text-foreground focus:border-emerald-400 focus:outline-none"
                  />
                </div>
              </div>
              <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                {corporateItems.map((item, index) => (
                  <li key={`corp-item-${index}`}>
                    <input
                      type="text"
                      value={item}
                      onChange={(event) =>
                        setCorporateItems((prev) =>
                          prev.map((current, itemIndex) =>
                            itemIndex === index ? event.target.value : current,
                          ),
                        )
                      }
                      className="w-full rounded-md border border-border/40 bg-white px-2 py-1 text-sm text-foreground focus:border-emerald-400 focus:outline-none"
                    />
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-sm font-semibold text-foreground">
                {formatCurrency(corporateInvestment)} + IVA
              </p>
            </div>

            <div className="rounded-xl border border-border/50 bg-muted/10 p-4">
              <p className="text-sm font-semibold text-foreground">🌎 Implementación por ciudad</p>
              <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                {cityItems.map((item, index) => (
                  <li key={`city-item-${index}`}>
                    <input
                      type="text"
                      value={item}
                      onChange={(event) =>
                        setCityItems((prev) =>
                          prev.map((current, itemIndex) =>
                            itemIndex === index ? event.target.value : current,
                          ),
                        )
                      }
                      className="w-full rounded-md border border-border/40 bg-white px-2 py-1 text-sm text-foreground focus:border-emerald-400 focus:outline-none"
                    />
                  </li>
                ))}
              </ul>

              <div className="mt-4 overflow-hidden rounded-xl border border-border/50">
                <table className="w-full min-w-[420px] border-collapse text-sm">
                  <thead className="bg-muted/20 text-xs uppercase tracking-[0.2em] text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3 text-left">Ciudad</th>
                      <th className="px-4 py-3 text-left">Inversión</th>
                      <th className="px-4 py-3 text-left">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {cities.map((city, index) => (
                      <tr key={city.id} className="even:bg-muted/5">
                        <td className="px-4 py-3">
                          <input
                            type="text"
                            value={city.name}
                            onChange={(event) =>
                              setCities((prev) =>
                                prev.map((current) =>
                                  current.id === city.id
                                    ? { ...current, name: event.target.value }
                                    : current,
                                ),
                              )
                            }
                            className="w-full rounded-md border border-border/40 bg-white px-2 py-1 text-sm text-foreground focus:border-emerald-400 focus:outline-none"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <input
                            type="number"
                            min={0}
                            value={city.amount}
                            onChange={(event) =>
                              setCities((prev) =>
                                prev.map((current) =>
                                  current.id === city.id
                                    ? { ...current, amount: Number(event.target.value) || 0 }
                                    : current,
                                ),
                              )
                            }
                            className="w-full rounded-md border border-border/40 bg-white px-2 py-1 text-right text-sm text-foreground focus:border-emerald-400 focus:outline-none"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            onClick={() => removeCity(city.id)}
                            disabled={cities.length <= 1}
                            className="rounded-full border border-rose-200 px-3 py-1 text-xs font-semibold text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Quitar
                          </button>
                          {index === cities.length - 1 ? (
                            <button
                              type="button"
                              onClick={addCity}
                              className="ml-2 rounded-full border border-emerald-200 px-3 py-1 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-50"
                            >
                              Agregar
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p className="mt-3 text-sm text-muted-foreground">
                💵 Total implementación sin ajuste:{" "}
                <strong className="text-foreground">{formatCurrency(implementationTotal)} + IVA</strong>
              </p>
            </div>
          </div>

          <div className="mt-8 rounded-xl border border-border/50 bg-amber-50/50 p-4">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-foreground">
              🔥 Propuesta especial
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                Inversión total cerrada
              </span>
              <input
                type="number"
                min={0}
                value={specialTotal}
                onChange={(event) => setSpecialTotal(Number(event.target.value) || 0)}
                className="w-36 rounded-md border border-border/50 bg-white px-2 py-1 text-right text-sm text-foreground focus:border-emerald-400 focus:outline-none"
              />
              <span className="text-sm font-semibold text-foreground">{formatCurrency(specialTotal)} + IVA</span>
            </div>
            <p className="mt-3 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Condiciones
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              {specialConditions.map((condition, index) => (
                <li key={`condition-${index}`}>
                  <input
                    type="text"
                    value={condition}
                    onChange={(event) =>
                      setSpecialConditions((prev) =>
                        prev.map((current, itemIndex) =>
                          itemIndex === index ? event.target.value : current,
                        ),
                      )
                    }
                    className="w-full rounded-md border border-border/40 bg-white px-2 py-1 text-sm text-foreground focus:border-emerald-400 focus:outline-none"
                  />
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-8 rounded-xl border border-border/50 bg-muted/10 p-4">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-foreground">
              💰 Renta mensual SaaS
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              Incluye uso de plataforma, asistente IA multicanal, CRM operativo, automatizaciones y soporte continuo.
            </p>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <label className="space-y-1 text-[0.65rem] uppercase tracking-[0.3em] text-muted-foreground">
                <span className="text-xs font-semibold text-foreground">Incluye 1 ciudad</span>
                <input
                  type="number"
                  min={0}
                  value={monthlyBase}
                  onChange={(event) => setMonthlyBase(Number(event.target.value) || 0)}
                  className="w-full rounded-md border border-border/50 bg-white px-3 py-2 text-right text-sm text-foreground focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                />
              </label>
              <label className="space-y-1 text-[0.65rem] uppercase tracking-[0.3em] text-muted-foreground">
                <span className="text-xs font-semibold text-foreground">Por ciudad adicional</span>
                <input
                  type="number"
                  min={0}
                  value={monthlyAdditional}
                  onChange={(event) => setMonthlyAdditional(Number(event.target.value) || 0)}
                  className="w-full rounded-md border border-border/50 bg-white px-3 py-2 text-right text-sm text-foreground focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                />
              </label>
            </div>
            <div className="mt-4 rounded-lg border border-border/50 bg-white p-3 text-sm">
              <p className="text-muted-foreground">
                Estructura:{" "}
                <strong className="text-foreground">{formatCurrency(monthlyBase)} / mes</strong>{" "}
                (1 ciudad) +{" "}
                <strong className="text-foreground">{formatCurrency(monthlyAdditional)} / mes</strong>{" "}
                por ciudad adicional.
              </p>
              <p className="mt-2 text-muted-foreground">
                Total mensual estimado para <strong className="text-foreground">{cities.length}</strong>{" "}
                ciudades:{" "}
                <strong className="text-foreground">{formatCurrency(monthlyForCurrentCities)} + IVA</strong>
              </p>
            </div>
          </div>

          <div className="mt-8 rounded-xl border border-border/50 bg-surface p-4 text-sm">
            <div className="flex flex-wrap items-center justify-end gap-3">
              <button
                type="button"
                onClick={handleExport}
                className="rounded-full border border-emerald-400 bg-emerald-50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700 transition hover:bg-emerald-100"
              >
                Exportar a PDF
              </button>
            </div>
            <p className="mt-4 text-xs font-semibold uppercase tracking-[0.3em] text-muted-foreground">
              Enviar por correo
            </p>
            <div className="mt-3 flex flex-col gap-2 md:flex-row md:items-center md:gap-3">
              <input
                type="email"
                placeholder="Correo del destinatario"
                value={recipientEmail}
                onChange={(event) => setRecipientEmail(event.target.value)}
                className="flex-1 rounded-2xl border border-border/50 bg-white/70 px-4 py-2 text-sm text-foreground outline-none focus:border-emerald-400"
              />
              <button
                type="button"
                onClick={handleSendEmail}
                disabled={sendingEmail}
                className="rounded-2xl bg-emerald-600 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-white transition hover:bg-emerald-700 disabled:opacity-60"
              >
                {sendingEmail ? "Enviando…" : "Enviar propuesta"}
              </button>
            </div>
            <textarea
              rows={2}
              value={messageBody}
              onChange={(event) => setMessageBody(event.target.value)}
              className="mt-3 w-full rounded-2xl border border-border/50 bg-white/70 px-4 py-2 text-sm text-foreground outline-none focus:border-emerald-400"
            />
            {emailFeedback && (
              <p className="mt-2 text-xs font-medium text-emerald-700">{emailFeedback}</p>
            )}
          </div>
        </section>
      </div>
    </AppViewLayout>
  )
}
