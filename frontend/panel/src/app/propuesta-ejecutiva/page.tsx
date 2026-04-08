"use client"

import Image from "next/image"
import { useCallback, useMemo, useState } from "react"

import { AppViewLayout } from "@/components/layouts/app-view-layout"

type CityInvestment = {
  id: string
  name: string
  amount: number
}

type HeroCard = {
  caption: string
  title: string
  description: string
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

const defaultHeroCards: HeroCard[] = [
  {
    caption: "1️⃣ 🏢 INVENTARIO INMOBILIARIO 3D INTERACTIVO",
    title: "Visualiza propiedades en plano digital 3D con estatus en tiempo real.",
    description: "Una experiencia que acelera decisiones y eleva la percepción del proyecto.",
  },
  {
    caption: "2️⃣ 🔁 MARKETING + REMARKETING INTELIGENTE",
    title: "Activa campañas automáticas que convierten sin depender del equipo.",
    description: "Segmenta, dispara y vuelve a impactar en el momento exacto.",
  },
  {
    caption: "3️⃣ 🎯 CALIFICACION + ASIGNACION AUTOMATICA",
    title: "Detecta intención real y asigna al asesor correcto con contexto completo.",
    description: "Menos ruido. Mas cierres.",
  },
  {
    caption: "4️⃣ 🤖 ASISTENTE IA MULTICANAL CON MEMORIA",
    title: "WhatsApp y webchat con contexto unificado y perfil 360°.",
    description: "Habla como tu mejor vendedor y recuerda cada interacción.",
  },
  {
    caption: "5️⃣ 🧠 CRM PERSONALIZADO",
    title: "Control total del embudo en un solo tablero.",
    description: "Historial, métricas y reglas de negocio centralizadas.",
  },
  {
    caption: "6️⃣ 🔄 SEGUIMIENTO + ALERTAS INTELIGENTES",
    title: "Activa mensajes, recordatorios y avisos en tiempo real.",
    description: "Detecta oportunidades antes que se enfríen.",
  },
  {
    caption: "7️⃣ 📅 AGENDA Y CITAS",
    title: "Coordina visitas y reuniones sin fricción.",
    description: "Confirmaciones y cambios centralizados.",
  },
  {
    caption: "8️⃣ 📈 ANALITICA COMERCIAL",
    title: "KPIs claros y reportes accionables en tiempo real.",
    description: "Decisiones basadas en datos, no en intuición.",
  },
  {
    caption: "9️⃣ 📍 GEO-PROSPECCION",
    title: "Genera prospectos por ubicación, giro y radio configurable.",
    description: "Expande tu alcance con inteligencia territorial.",
  },
  {
    caption: "🔟 🧾 CONTRATOS + PAPELERIA AUTOMATICA",
    title: "Solicita documentos y completa contratos con datos validados.",
    description: "Menos fricción legal. Más velocidad de firma.",
  },
  {
    caption: "1️⃣1️⃣ 🏆 EXPERIENCIA DE CLIENTE DIFERENCIADA",
    title: "Interacciones rápidas, personalizadas y profesionales.",
    description: "Tu proyecto destaca frente a la competencia.",
  },
  {
    caption: "1️⃣2️⃣ 💰 OPTIMIZACION DEL CICLO DE VENTA",
    title: "Reduce tiempos desde el primer contacto hasta la firma.",
    description: "Más velocidad significa mayor rotación de inventario.",
  },
  {
    caption: "1️⃣3️⃣ 🔗 INTEGRACIONES + ESCALABILIDAD SAAS",
    title: "Conecta tus herramientas actuales y crece sin infraestructura propia.",
    description: "La plataforma evoluciona contigo sin fricción técnica.",
  },
  {
    caption: "1️⃣4️⃣ 🛡️ SEGURIDAD + AUDITORIA",
    title: "Roles, permisos y bitácora completa de acciones por usuario.",
    description: "Control total y trazabilidad empresarial.",
  },
  {
    caption: "1️⃣5️⃣ ⚡ IMPLEMENTACION EN 4 SEMANAS",
    title: "Workshops, configuración y puesta en marcha estructurada.",
    description: "De idea a operando sin fricción.",
  },
]

const heroGroupTitles = [
  "🔥 IMPACTO DIRECTO EN VENTAS",
  "🤖 MOTOR OPERATIVO",
  "📊 CONTROL Y EXPANSION",
  "🧾 FORMALIZACION Y EXPERIENCIA",
  "🏢 INFRAESTRUCTURA EMPRESARIAL",
]

const defaultMvpTitle = "🚀 MVP · DESPLIEGUE INICIAL"
const defaultMvpIntro = "El MVP comprende las piezas mínimas para arrancar Tal-IA:"
const defaultMvpItems = [
  "Asistente multicanal: entrenamiento con esquemas de conversación, respuestas preaprobadas y conexión a WhatsApp + webchat.",
  "Marketing multicanal: plantillas y automatizaciones para campañas activas + seguimiento automático de respuestas.",
  "CRM personalizado: flujo de ventas, sincronización de contactos y seguimiento de oportunidades en un tablero único.",
  "Cantidad de Usuarios 50.",
]
const defaultMvpTimeline =
  "Tiempos de entrega aproximados: una vez que el cliente provea toda la información solicitada, estimamos un despliegue en 4 semanas."
const defaultMvpValidity = "Vigencia de propuesta: 20 días naturales"
const defaultExpectedResultItems = [
  "Todos los leads llegan a la empresa (no al asesor).",
  "Atención inmediata 24/7.",
  "Calificación automática de prospectos.",
  "Asignación inteligente a asesores.",
  "Seguimiento estructurado.",
  "Visibilidad total del pipeline.",
]
const defaultExpectedResultClosing =
  "Tal-IA no es solo un sistema, es la infraestructura que permite operar múltiples ciudades con control, velocidad y consistencia comercial desde un solo punto."

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
  const [heroCards] = useState<HeroCard[]>(() => [...defaultHeroCards])

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

  const [mvpTitle, setMvpTitle] = useState(defaultMvpTitle)
  const [mvpIntro, setMvpIntro] = useState(defaultMvpIntro)
  const [mvpItems, setMvpItems] = useState<string[]>(() => [...defaultMvpItems])
  const [mvpTimeline, setMvpTimeline] = useState(defaultMvpTimeline)
  const [mvpValidity, setMvpValidity] = useState(defaultMvpValidity)
  const [expectedResultItems] = useState<string[]>(() => [...defaultExpectedResultItems])
  const [expectedResultClosing] = useState(defaultExpectedResultClosing)

  const [secondaryContactName, setSecondaryContactName] = useState("")
  const [secondaryContactPhone, setSecondaryContactPhone] = useState("")
  const [secondaryContactEmail, setSecondaryContactEmail] = useState("")

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
  const implementationGrandTotal = useMemo(
    () => implementationTotal + (Number.isFinite(corporateInvestment) ? corporateInvestment : 0),
    [implementationTotal, corporateInvestment],
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

  const today = useMemo(
    () =>
      new Date().toLocaleDateString("es-MX", {
        year: "numeric",
        month: "long",
        day: "numeric",
        timeZone: "America/Mexico_City",
      }),
    [],
  )

  const proposalPayload = useMemo(
    () => ({
      proposalTitle,
      strategicIntroOne,
      strategicIntroTwo,
      strategicIntroThree,
      heroCards,
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
      mvpTitle,
      mvpIntro,
      mvpItems,
      mvpTimeline,
      mvpValidity,
      expectedResultItems,
      expectedResultClosing,
      secondaryContactName,
      secondaryContactPhone,
      secondaryContactEmail,
    }),
    [
      proposalTitle,
      strategicIntroOne,
      strategicIntroTwo,
      strategicIntroThree,
      heroCards,
      corporateItems,
      corporateInvestment,
      cityItems,
      cities,
      specialTotal,
      specialConditions,
      monthlyBase,
      monthlyAdditional,
      mvpTitle,
      mvpIntro,
      mvpItems,
      mvpTimeline,
      mvpValidity,
      expectedResultItems,
      expectedResultClosing,
      secondaryContactName,
      secondaryContactPhone,
      secondaryContactEmail,
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
      <div className="propuesta-print space-y-6 px-4 pb-8 lg:px-6">
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

          <div className="mt-6 space-y-5">
            {heroGroupTitles.map((groupTitle, groupIndex) => {
              const start = groupIndex * 3
              const groupCards = heroCards.slice(start, start + 3)
              if (!groupCards.length) {
                return null
              }
              return (
                <section key={`hero-group-${groupIndex}`} className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.25em] text-foreground">
                    {groupTitle}
                  </p>
                  <div className="grid gap-4 md:grid-cols-3">
                    {groupCards.map((item, cardIndex) => (
                      <article
                        key={`hero-card-${start + cardIndex}-${item.title}`}
                        className="rounded-2xl border border-border/50 bg-gradient-to-r from-emerald-50 via-white to-white/80 p-4 shadow-sm"
                      >
                        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-emerald-700">
                          {item.caption}
                        </p>
                        <p className="mt-2 text-sm font-semibold text-foreground">{item.title}</p>
                        <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>
                      </article>
                    ))}
                  </div>
                </section>
              )
            })}
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
                💵 Subtotal implementación por ciudad:{" "}
                <strong className="text-foreground">{formatCurrency(implementationTotal)} + IVA</strong>
              </p>
              <p className="mt-1 text-sm text-foreground">
                💵 Total implementación (plataforma corporativa + ciudades):{" "}
                <strong>{formatCurrency(implementationGrandTotal)} + IVA</strong>
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

          <div className="mt-8 rounded-xl border border-border/50 bg-white p-4">
            <label className="block space-y-1 text-[0.65rem] uppercase tracking-[0.3em] text-muted-foreground">
              <span className="text-xs font-semibold text-foreground">Título MVP</span>
              <input
                type="text"
                value={mvpTitle}
                onChange={(event) => setMvpTitle(event.target.value)}
                className="w-full rounded-md border border-border/50 bg-white px-3 py-2 text-sm text-foreground focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-200"
              />
            </label>
            <label className="mt-3 block space-y-1 text-[0.65rem] uppercase tracking-[0.3em] text-muted-foreground">
              <span className="text-xs font-semibold text-foreground">Introducción</span>
              <textarea
                rows={2}
                value={mvpIntro}
                onChange={(event) => setMvpIntro(event.target.value)}
                className="w-full rounded-md border border-border/50 bg-white px-3 py-2 text-sm text-foreground focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-200"
              />
            </label>
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              {mvpItems.map((item, index) => (
                <textarea
                  key={`mvp-item-${index}`}
                  rows={2}
                  value={item}
                  onChange={(event) =>
                    setMvpItems((prev) =>
                      prev.map((current, itemIndex) =>
                        itemIndex === index ? event.target.value : current,
                      ),
                    )
                  }
                  className="w-full rounded-md border border-border/50 bg-white px-3 py-2 text-sm text-foreground focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                />
              ))}
            </div>
            <label className="mt-3 block space-y-1 text-[0.65rem] uppercase tracking-[0.3em] text-muted-foreground">
              <span className="text-xs font-semibold text-foreground">Timeline</span>
              <textarea
                rows={2}
                value={mvpTimeline}
                onChange={(event) => setMvpTimeline(event.target.value)}
                className="w-full rounded-md border border-border/50 bg-white px-3 py-2 text-sm text-foreground focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-200"
              />
            </label>
            <label className="mt-3 block space-y-1 text-[0.65rem] uppercase tracking-[0.3em] text-muted-foreground">
              <span className="text-xs font-semibold text-foreground">Vigencia</span>
              <input
                type="text"
                value={mvpValidity}
                onChange={(event) => setMvpValidity(event.target.value)}
                className="w-full rounded-md border border-border/50 bg-white px-3 py-2 text-sm text-foreground focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-200"
              />
            </label>
          </div>

          <section className="mt-8 rounded-xl border border-border/50 bg-white p-4">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-foreground">
              🧠 RESULTADO ESPERADO
            </p>
            <p className="mt-2 text-sm text-muted-foreground">Con esta implementación:</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              {expectedResultItems.map((item, index) => (
                <li key={`expected-result-${index}`}>{item}</li>
              ))}
            </ul>
            <p className="mt-3 text-sm font-medium text-foreground">{expectedResultClosing}</p>
          </section>

          <section className="mt-8 border-t border-border/40 px-2 py-4 text-sm text-muted-foreground">
            <div className="space-y-1">
              <p>Fecha: {today}</p>
              <p>Jorge Torre · Sistema Tal-IA*</p>
            </div>
            <div className="mt-4 flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-1 text-sm text-muted-foreground">
                <p>Cel: 4443354450</p>
                <p>Email: administracion@talia.mx</p>
                {secondaryContactName.trim() ? (
                  <p className="pt-2 font-semibold text-foreground">{secondaryContactName.trim()}</p>
                ) : null}
                {secondaryContactPhone.trim() ? <p>Cel: {secondaryContactPhone.trim()}</p> : null}
                {secondaryContactEmail.trim() ? <p>Email: {secondaryContactEmail.trim()}</p> : null}
                <p>
                  Web:{" "}
                  <a
                    href="https://geoactiv.mx/"
                    className="text-foreground underline"
                    target="_blank"
                    rel="noreferrer"
                  >
                    https://geoactiv.mx/
                  </a>
                </p>
              </div>
              <div className="flex flex-row items-center justify-end gap-4">
                <a
                  href="https://talia.mx/"
                  className="text-xs font-semibold uppercase tracking-[0.3em] text-emerald-700"
                  target="_blank"
                  rel="noreferrer"
                >
                  Web: https://talia.mx/
                </a>
                <div className="relative h-[90px] w-[90px]">
                  <Image
                    src="/QR_Lia.png"
                    alt="QR Tal-IA"
                    fill
                    sizes="90px"
                    className="h-auto w-auto"
                  />
                </div>
              </div>
            </div>
            <div className="mt-6 rounded-2xl border border-border/60 bg-surface p-4 text-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-muted-foreground">
                Contacto adicional (opcional)
              </p>
              <div className="mt-3 grid gap-2 md:grid-cols-3">
                <input
                  type="text"
                  placeholder="Nombre"
                  value={secondaryContactName}
                  onChange={(event) => setSecondaryContactName(event.target.value)}
                  className="rounded-2xl border border-border/50 bg-white/70 px-4 py-2 text-sm text-foreground outline-none focus:border-emerald-400"
                />
                <input
                  type="text"
                  placeholder="Teléfono"
                  value={secondaryContactPhone}
                  onChange={(event) => setSecondaryContactPhone(event.target.value)}
                  className="rounded-2xl border border-border/50 bg-white/70 px-4 py-2 text-sm text-foreground outline-none focus:border-emerald-400"
                />
                <input
                  type="email"
                  placeholder="Correo"
                  value={secondaryContactEmail}
                  onChange={(event) => setSecondaryContactEmail(event.target.value)}
                  className="rounded-2xl border border-border/50 bg-white/70 px-4 py-2 text-sm text-foreground outline-none focus:border-emerald-400"
                />
              </div>
            </div>
            <p className="mt-4 text-[0.6rem] uppercase tracking-[0.3em] text-muted-foreground">
              *SaaS (Software como servicio): plataforma en la nube con actualizaciones y soporte continuo.
            </p>
          </section>

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
