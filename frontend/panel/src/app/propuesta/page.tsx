"use client"

import Image from "next/image"
import { useCallback, useMemo, useState } from "react"

import { AppViewLayout } from "@/components/layouts/app-view-layout"

type TableRow = {
  label: string
  cells: string[]
}

type HeroCard = {
  caption: string
  title: string
  description: string
}

const defaultColumnHeaders = [
  "Plan mensual · 12 pagos · - 0%",
  "Plan trimestral · 4 pagos · - 10%",
  "Plan semestral · 2 pagos · - 15%",
  "Plan anual · Pago único · - 20%",
]

const defaultRentaRows: TableRow[] = [
  {
    label: "Pagos",
    cells: [
      "$4,166.67",
      "$11,764.71",
      "$22,222.22",
      "",
    ],
  },
  {
    label: "Costo anual total",
    cells: ["$50,000.04", "$47,058.84", "$44,444.44", "$40,000.00"],
  },
]

const defaultConfiguracionRows: TableRow[] = [
  {
    label: "Pagos",
    cells: [
      "$10,312.50",
      "$29,117.65",
      "$55,000.00",
      "",
    ],
  },
  {
    label: "Costo anual total",
    cells: ["$123,750.00", "$116,470.59", "$110,000.00", "$99,000.00"],
  },
]
const defaultHeroCards: HeroCard[] = [
  {
    caption: "1️⃣ 🏢 INVENTARIO INMOBILIARIO 3D INTERACTIVO",
    title: "Visualiza propiedades en plano digital 3D con estatus en tiempo real.",
    description:
      "Una experiencia que acelera decisiones y eleva la percepción del proyecto.",
  },
  {
    caption: "2️⃣ 🔁 MARKETING + REMARKETING INTELIGENTE",
    title: "Activa campañas automáticas que convierten sin depender del equipo.",
    description:
      "Segmenta, dispara y vuelve a impactar en el momento exacto.",
  },
  {
    caption: "3️⃣ 🎯 CALIFICACION + ASIGNACION AUTOMATICA",
    title: "Detecta intención real y asigna al asesor correcto con contexto completo.",
    description:
      "Menos ruido. Mas cierres.",
  },
  {
    caption: "4️⃣ 🤖 ASISTENTE IA MULTICANAL CON MEMORIA",
    title: "WhatsApp y webchat con contexto unificado y perfil 360°.",
    description:
      "Habla como tu mejor vendedor y recuerda cada interacción.",
  },
  {
    caption: "5️⃣ 🧠 CRM PERSONALIZADO",
    title: "Control total del embudo en un solo tablero.",
    description:
      "Historial, métricas y reglas de negocio centralizadas.",
  },
  {
    caption: "6️⃣ 🔄 SEGUIMIENTO + ALERTAS INTELIGENTES",
    title: "Activa mensajes, recordatorios y avisos en tiempo real.",
    description:
      "Detecta oportunidades antes que se enfríen.",
  },
  {
    caption: "7️⃣ 📅 AGENDA Y CITAS",
    title: "Coordina visitas y reuniones sin fricción.",
    description: "Confirmaciones y cambios centralizados.",
  },
  {
    caption: "8️⃣ 📈 ANALITICA COMERCIAL",
    title: "KPIs claros y reportes accionables en tiempo real.",
    description:
      "Decisiones basadas en datos, no en intuición.",
  },
  {
    caption: "9️⃣ 📍 GEO-PROSPECCION",
    title: "Genera prospectos por ubicación, giro y radio configurable.",
    description:
      "Expande tu alcance con inteligencia territorial.",
  },
  {
    caption: "🔟 🧾 CONTRATOS + PAPELERIA AUTOMATICA",
    title: "Solicita documentos y completa contratos con datos validados.",
    description:
      "Menos fricción legal. Más velocidad de firma.",
  },
  {
    caption: "1️⃣1️⃣ 🏆 EXPERIENCIA DE CLIENTE DIFERENCIADA",
    title: "Interacciones rápidas, personalizadas y profesionales.",
    description:
      "Tu proyecto destaca frente a la competencia.",
  },
  {
    caption: "1️⃣2️⃣ 💰 OPTIMIZACION DEL CICLO DE VENTA",
    title: "Reduce tiempos desde el primer contacto hasta la firma.",
    description:
      "Más velocidad significa mayor rotación de inventario.",
  },
  {
    caption: "1️⃣3️⃣ 🔗 INTEGRACIONES + ESCALABILIDAD SAAS",
    title: "Conecta tus herramientas actuales y crece sin infraestructura propia.",
    description:
      "La plataforma evoluciona contigo sin fricción técnica.",
  },
  {
    caption: "1️⃣4️⃣ 🛡️ SEGURIDAD + AUDITORIA",
    title: "Roles, permisos y bitácora completa de acciones por usuario.",
    description:
      "Control total y trazabilidad empresarial.",
  },
  {
    caption: "1️⃣5️⃣ ⚡ IMPLEMENTACION EN 4 SEMANAS",
    title: "Workshops, configuración y puesta en marcha estructurada.",
    description:
      "De idea a operando sin fricción.",
  },
]
const heroGroupTitles = [
  "🔥 IMPACTO DIRECTO EN VENTAS",
  "🤖 MOTOR OPERATIVO",
  "📊 CONTROL Y EXPANSION",
  "🧾 FORMALIZACION Y EXPERIENCIA",
  "🏢 INFRAESTRUCTURA EMPRESARIAL",
]
const defaultHeroIntroOne =
  "El sistema Tal-IA se configura a la medida del flujo de ventas, marketing y operaciones de Gran Peñón. Todos los montos indicados son más IVA y pueden combinarse según el nivel de compromiso anual."
const defaultHeroIntroTwo =
  "Tal-IA se entrega como SaaS (software como servicio), lo que permite acceder al sistema sin inversión en infraestructura física y recibir soporte y mejoras continuas desde la nube."
const defaultMvpTitle = "MVP · Despliegue inicial"
const defaultMvpIntro = "El MVP comprende las piezas mínimas para arrancar Tal-IA en Gran Peñón:"
const defaultMvpItems = [
  "Asistente multicanal: entrenamiento con esquemas de conversación, respuestas preaprobadas y conexión a WhatsApp + webchat.",
  "Marketing multicanal: plantillas y automatizaciones para campañas activas + seguimiento automático de respuestas.",
  "CRM personalizado: flujo de ventas, sincronización de contactos y seguimiento de oportunidades en un tablero único.",
  "Contidad de Usuarios 50",
]
const defaultMvpTimeline =
  "Tiempos de entrega aproximados: una vez que Gran Peñón provea toda la información solicitada (flujos, contactos clave, contenidos y aprobaciones) estimamos un despliegue en 4 semanas. Si surgen contratiempos con la entrega de datos, el plazo puede extenderse."
const defaultMvpValidity = "Vigencia de propuesta: 20 días naturales"

const cloneHeaders = (headers: string[]) => [...headers]

const cloneRows = (rows: TableRow[]) =>
  rows.map((row) => ({
    ...row,
    cells: [...row.cells],
  }))

type ColumnEditorProps = {
  headers: string[]
  onHeaderChange: (index: number, value: string) => void
  onReset: () => void
}

function ColumnEditor({ headers, onHeaderChange, onReset }: ColumnEditorProps) {
  return (
    <div className="space-y-3 rounded-2xl border border-border/60 bg-muted/5 p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-[0.6rem] font-semibold uppercase tracking-[0.4em] text-muted-foreground">
          Encabezados editables
        </p>
        <button
          type="button"
          onClick={onReset}
          className="rounded-full border border-emerald-200 px-3 py-1 text-xs font-semibold text-emerald-600 transition hover:bg-emerald-50"
        >
          Restaurar
        </button>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {headers.map((header, index) => (
          <label key={`header-${index}`} className="space-y-1 text-[0.65rem] uppercase tracking-[0.3em] text-muted-foreground">
            <span className="text-xs font-semibold text-foreground">Columna {index + 1}</span>
            <input
              type="text"
              value={header}
              onChange={(event) => onHeaderChange(index, event.target.value)}
              className="w-full rounded-md border border-border/50 bg-white px-3 py-2 text-sm text-foreground focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-200"
            />
          </label>
        ))}
      </div>
    </div>
  )
}

type RowEditorProps = {
  title: string
  rows: TableRow[]
  onRowLabelChange: (rowIndex: number, value: string) => void
  onCellChange: (rowIndex: number, cellIndex: number, value: string) => void
  onReset: () => void
}

function RowEditor({ title, rows, onRowLabelChange, onCellChange, onReset }: RowEditorProps) {
  return (
    <div className="space-y-3 rounded-2xl border border-border/60 bg-white/80 p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-[0.6rem] font-semibold uppercase tracking-[0.4em] text-muted-foreground">
          {title}
        </p>
        <button
          type="button"
          onClick={onReset}
          className="rounded-full border border-emerald-200 px-3 py-1 text-xs font-semibold text-emerald-600 transition hover:bg-emerald-50"
        >
          Restaurar
        </button>
      </div>
      <div className="space-y-3">
        {rows.map((row, rowIndex) => (
          <div key={`row-${rowIndex}`} className="space-y-2 rounded-xl border border-border/40 bg-muted/5 p-3">
            <label className="block space-y-1 text-[0.6rem] uppercase tracking-[0.3em] text-muted-foreground">
              <span className="text-xs font-semibold text-foreground">Concepto</span>
              <input
                type="text"
                value={row.label}
                onChange={(event) => onRowLabelChange(rowIndex, event.target.value)}
                className="w-full rounded-md border border-border/50 bg-white px-3 py-2 text-sm text-foreground focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-200"
              />
            </label>
            <div className="grid gap-2 md:grid-cols-2">
              {row.cells.map((cell, cellIndex) => (
                <label key={`cell-${rowIndex}-${cellIndex}`} className="space-y-1 text-[0.6rem] uppercase tracking-[0.3em] text-muted-foreground">
                  <span className="text-[0.65rem] font-semibold text-foreground">Columna {cellIndex + 1}</span>
                  <input
                    type="text"
                    value={cell}
                    onChange={(event) => onCellChange(rowIndex, cellIndex, event.target.value)}
                    className="w-full rounded-md border border-border/50 bg-white px-3 py-2 text-sm text-foreground focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                  />
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function renderColumnHeader(header: string) {
  const lines = header.split(" · ").map((part) => part.trim()).filter(Boolean)
  return (
    <span className="block">
      {lines.map((line, index) => (
        <span
          key={`${header}-${index}`}
          className={
            index === 0
              ? "block"
              : "mt-0.5 block text-[0.62rem] tracking-[0.12em] text-muted-foreground"
          }
        >
          {line}
        </span>
      ))}
    </span>
  )
}

export default function Page() {
  const [expanded, setExpanded] = useState(false)
  const [mvpOpen, setMvpOpen] = useState(false)
  const [proposalTitle, setProposalTitle] = useState("Propuesta sistema Tal-IA *SaaS")
  const [proposalSubtitle, setProposalSubtitle] = useState("DESARROLLADORA EL PEÑON")
  const [heroCards, setHeroCards] = useState<HeroCard[]>(() => [...defaultHeroCards])
  const [heroIntroOne, setHeroIntroOne] = useState(defaultHeroIntroOne)
  const [heroIntroTwo, setHeroIntroTwo] = useState(defaultHeroIntroTwo)
  const [mvpTitle, setMvpTitle] = useState(defaultMvpTitle)
  const [mvpIntro, setMvpIntro] = useState(defaultMvpIntro)
  const [mvpItems, setMvpItems] = useState(() => [...defaultMvpItems])
  const [mvpTimeline, setMvpTimeline] = useState(defaultMvpTimeline)
  const [mvpValidity, setMvpValidity] = useState(defaultMvpValidity)
  const [secondaryContactName, setSecondaryContactName] = useState("")
  const [secondaryContactPhone, setSecondaryContactPhone] = useState("")
  const [secondaryContactEmail, setSecondaryContactEmail] = useState("")
  const [recipientEmail, setRecipientEmail] = useState("")
  const [messageBody, setMessageBody] = useState(
    "Adjunto encontrarás la propuesta Tal-IA para Gran Peñón.",
  )
  const [sendingEmail, setSendingEmail] = useState(false)
  const [emailFeedback, setEmailFeedback] = useState<string | null>(null)
  const [columnHeaders, setColumnHeaders] = useState(() =>
    cloneHeaders(defaultColumnHeaders),
  )
  const [rentaRows, setRentaRows] = useState<TableRow[]>(() =>
    cloneRows(defaultRentaRows),
  )
  const [configuracionRows, setConfiguracionRows] = useState<TableRow[]>(() =>
    cloneRows(defaultConfiguracionRows),
  )
  const proposalPayload = useMemo(
    () => ({
      proposalTitle,
      proposalSubtitle,
      heroCards,
      heroIntroOne,
      heroIntroTwo,
      mvpTitle,
      mvpIntro,
      mvpItems,
      mvpTimeline,
      mvpValidity,
      secondaryContactName,
      secondaryContactPhone,
      secondaryContactEmail,
      columnHeaders,
      rentaRows,
      configuracionRows,
    }),
    [
      proposalTitle,
      proposalSubtitle,
      heroCards,
      heroIntroOne,
      heroIntroTwo,
      mvpTitle,
      mvpIntro,
      mvpItems,
      mvpTimeline,
      mvpValidity,
      secondaryContactName,
      secondaryContactPhone,
      secondaryContactEmail,
      columnHeaders,
      rentaRows,
      configuracionRows,
    ],
  )
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
  const resetColumnHeaders = () => setColumnHeaders(cloneHeaders(defaultColumnHeaders))
  const resetRentaRows = () => setRentaRows(cloneRows(defaultRentaRows))
  const resetConfiguracionRows = () =>
    setConfiguracionRows(cloneRows(defaultConfiguracionRows))
  const resetHeroSection = () => {
    setHeroCards([...defaultHeroCards])
    setHeroIntroOne(defaultHeroIntroOne)
    setHeroIntroTwo(defaultHeroIntroTwo)
  }
  const resetMvpSection = () => {
    setMvpTitle(defaultMvpTitle)
    setMvpIntro(defaultMvpIntro)
    setMvpItems([...defaultMvpItems])
    setMvpTimeline(defaultMvpTimeline)
    setMvpValidity(defaultMvpValidity)
  }
  const handleHeaderChange = (index: number, value: string) => {
    setColumnHeaders((prev) =>
      prev.map((header, headerIndex) => (headerIndex === index ? value : header)),
    )
  }
  const handleExport = useCallback(async () => {
    if (typeof window === "undefined") {
      return
    }
    try {
      const response = await fetch("/api/propuesta/tal-ia/pdf", {
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
      const response = await fetch("/api/propuesta/tal-ia/email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          recipients: [recipientEmail.trim()],
          subject: "Propuesta Tal-IA · Gran Peñón",
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
    <AppViewLayout title="Propuesta" contentClassName="max-w-full">
      <div className="propuesta-print space-y-8 px-4 pb-8 lg:px-6">
        <section className="rounded-2xl border border-border/60 bg-surface-alt p-6 shadow-sm">
          <div className="rounded-2xl border border-border/60 bg-white/80 p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-[0.6rem] font-semibold uppercase tracking-[0.4em] text-muted-foreground">
                Encabezado y presentación editables
              </p>
              <button
                type="button"
                onClick={resetHeroSection}
                className="rounded-full border border-emerald-200 px-3 py-1 text-xs font-semibold text-emerald-600 transition hover:bg-emerald-50"
              >
                Restaurar bloque
              </button>
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <label className="space-y-1 text-[0.65rem] uppercase tracking-[0.3em] text-muted-foreground">
                <span className="text-xs font-semibold text-foreground">Título</span>
                <input
                  type="text"
                  value={proposalTitle}
                  onChange={(event) => setProposalTitle(event.target.value)}
                  className="w-full rounded-md border border-border/50 bg-white px-3 py-2 text-sm text-foreground focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                />
              </label>
              <label className="space-y-1 text-[0.65rem] uppercase tracking-[0.3em] text-muted-foreground">
                <span className="text-xs font-semibold text-foreground">Subtítulo</span>
                <input
                  type="text"
                  value={proposalSubtitle}
                  onChange={(event) => setProposalSubtitle(event.target.value)}
                  className="w-full rounded-md border border-border/50 bg-white px-3 py-2 text-sm text-foreground focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                />
              </label>
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              {heroCards.map((card, index) => (
                <div key={`hero-card-editor-${index}`} className="space-y-2 rounded-xl border border-border/40 bg-muted/5 p-3">
                  <label className="block space-y-1 text-[0.6rem] uppercase tracking-[0.3em] text-muted-foreground">
                    <span className="text-xs font-semibold text-foreground">Tarjeta {index + 1} · Etiqueta</span>
                    <input
                      type="text"
                      value={card.caption}
                      onChange={(event) =>
                        setHeroCards((prev) =>
                          prev.map((item, itemIndex) =>
                            itemIndex === index ? { ...item, caption: event.target.value } : item,
                          ),
                        )
                      }
                      className="w-full rounded-md border border-border/50 bg-white px-3 py-2 text-sm text-foreground focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                    />
                  </label>
                  <label className="block space-y-1 text-[0.6rem] uppercase tracking-[0.3em] text-muted-foreground">
                    <span className="text-xs font-semibold text-foreground">Título</span>
                    <input
                      type="text"
                      value={card.title}
                      onChange={(event) =>
                        setHeroCards((prev) =>
                          prev.map((item, itemIndex) =>
                            itemIndex === index ? { ...item, title: event.target.value } : item,
                          ),
                        )
                      }
                      className="w-full rounded-md border border-border/50 bg-white px-3 py-2 text-sm text-foreground focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                    />
                  </label>
                  <label className="block space-y-1 text-[0.6rem] uppercase tracking-[0.3em] text-muted-foreground">
                    <span className="text-xs font-semibold text-foreground">Descripción</span>
                    <textarea
                      rows={3}
                      value={card.description}
                      onChange={(event) =>
                        setHeroCards((prev) =>
                          prev.map((item, itemIndex) =>
                            itemIndex === index
                              ? { ...item, description: event.target.value }
                              : item,
                          ),
                        )
                      }
                      className="w-full rounded-md border border-border/50 bg-white px-3 py-2 text-sm text-foreground focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                    />
                  </label>
                </div>
              ))}
            </div>
            <label className="mt-3 block space-y-1 text-[0.6rem] uppercase tracking-[0.3em] text-muted-foreground">
              <span className="text-xs font-semibold text-foreground">Párrafo 1</span>
              <textarea
                rows={3}
                value={heroIntroOne}
                onChange={(event) => setHeroIntroOne(event.target.value)}
                className="w-full rounded-md border border-border/50 bg-white px-3 py-2 text-sm text-foreground focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-200"
              />
            </label>
            <label className="mt-3 block space-y-1 text-[0.6rem] uppercase tracking-[0.3em] text-muted-foreground">
              <span className="text-xs font-semibold text-foreground">Párrafo 2</span>
              <textarea
                rows={3}
                value={heroIntroTwo}
                onChange={(event) => setHeroIntroTwo(event.target.value)}
                className="w-full rounded-md border border-border/50 bg-white px-3 py-2 text-sm text-foreground focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-200"
              />
            </label>
          </div>
          <h1 className="mt-2 text-3xl font-semibold text-foreground">
            {proposalTitle}
          </h1>
          <p className="mt-1 text-sm uppercase tracking-[0.3em] font-semibold text-foreground underline">
            {proposalSubtitle}
          </p>
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
          <p className="mt-6 text-base text-muted-foreground">
            {heroIntroOne}
          </p>
          <p className="text-sm text-muted-foreground">
            {heroIntroTwo}
          </p>
        </section>

        <section className="propuesta-print-economic rounded-2xl border border-border/60 bg-white p-6 shadow-sm">
          <button
            type="button"
            onClick={() => setExpanded((prev) => !prev)}
            className="flex w-full items-center justify-between text-left text-sm font-semibold text-foreground"
          >
            <span>Propuesta económica</span>
            <span className="text-xs text-muted-foreground">
              {expanded ? "Cerrar" : "Abrir"}
            </span>
          </button>
          {expanded && (
            <div className="mt-6 space-y-8">
              <ColumnEditor
                headers={columnHeaders}
                onHeaderChange={handleHeaderChange}
                onReset={resetColumnHeaders}
              />
              <section className="space-y-4">
                <div className="flex flex-wrap items-baseline gap-3">
                  <strong className="text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                    Precio renta
                  </strong>
                  <span className="text-xs text-muted-foreground">
                    Renta mensual por aplicación (más IVA)
                  </span>
                </div>
                <div className="overflow-hidden rounded-2xl border border-border/40">
                  <table className="w-full min-w-[480px] border-collapse text-sm">
                    <thead className="bg-muted/10 text-xs uppercase tracking-[0.2em] text-muted-foreground">
                      <tr>
                        <th className="px-4 py-3 text-left">Concepto</th>
                        {columnHeaders.map((header) => (
                          <th key={header} className="px-4 py-3 text-left">
                            {renderColumnHeader(header)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/40">
                      {rentaRows.map((row, rowIndex) => (
                        <tr key={`renta-row-${rowIndex}`} className="even:bg-muted/5">
                          <td className="px-4 py-4 font-medium text-foreground">{row.label}</td>
                          {row.cells.map((cell, cellIndex) => (
                            <td key={`renta-${rowIndex}-${cellIndex}`} className="px-4 py-4 text-foreground">
                              {cell}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <RowEditor
                  title="Montos editables · Precio renta"
                  rows={rentaRows}
                  onRowLabelChange={(rowIndex, value) =>
                    setRentaRows((prev) =>
                      prev.map((row, index) => (index === rowIndex ? { ...row, label: value } : row)),
                    )
                  }
                  onCellChange={(rowIndex, cellIndex, value) =>
                    setRentaRows((prev) =>
                      prev.map((row, index) =>
                        index === rowIndex
                          ? {
                              ...row,
                              cells: row.cells.map((cell, cIndex) =>
                                cIndex === cellIndex ? value : cell,
                              ),
                            }
                          : row,
                      ),
                    )
                  }
                  onReset={resetRentaRows}
                />
              </section>

              <section className="space-y-4">
                <div className="flex flex-wrap items-baseline gap-3">
                  <strong className="text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                    Configuración
                  </strong>
                  <span className="text-xs text-muted-foreground">
                    Costos de configuración, programación y puesta en marcha (más IVA){" "}
                    <strong className="text-foreground">Pago único no recurrente.</strong>
                  </span>
                </div>
                <div className="overflow-hidden rounded-2xl border border-border/40">
                  <table className="w-full min-w-[480px] border-collapse text-sm">
                    <thead className="bg-muted/10 text-xs uppercase tracking-[0.2em] text-muted-foreground">
                      <tr>
                        <th className="px-4 py-3 text-left">Concepto</th>
                        {columnHeaders.map((header) => (
                          <th key={`config-${header}`} className="px-4 py-3 text-left">
                            {renderColumnHeader(header)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/40">
                      {configuracionRows.map((row, rowIndex) => (
                        <tr key={`config-row-${rowIndex}`} className="even:bg-muted/5">
                          <td className="px-4 py-4 font-medium text-foreground">{row.label}</td>
                          {row.cells.map((cell, cellIndex) => (
                            <td
                              key={`config-${rowIndex}-${cellIndex}`}
                              className="px-4 py-4 text-foreground"
                            >
                              {cell}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <RowEditor
                  title="Montos editables · Configuración"
                  rows={configuracionRows}
                  onRowLabelChange={(rowIndex, value) =>
                    setConfiguracionRows((prev) =>
                      prev.map((row, index) => (index === rowIndex ? { ...row, label: value } : row)),
                    )
                  }
                  onCellChange={(rowIndex, cellIndex, value) =>
                    setConfiguracionRows((prev) =>
                      prev.map((row, index) =>
                        index === rowIndex
                          ? {
                              ...row,
                              cells: row.cells.map((cell, cIndex) =>
                                cIndex === cellIndex ? value : cell,
                              ),
                            }
                          : row,
                      ),
                    )
                  }
                  onReset={resetConfiguracionRows}
                />
                <p className="text-sm text-muted-foreground">
                  La configuración incluye workshops de discovery, ajuste de workflows y
                  la parametrización de reglas de negocio.
                  El pago aquí refleja la inversión única necesaria para que el sistema esté
                  plenamente operativo.
                </p>
              </section>
            </div>
          )}
        </section>

        <section className="propuesta-print-final-start rounded-2xl border border-border/60 bg-white p-6 shadow-sm">
          <button
            type="button"
            onClick={() => setMvpOpen((prev) => !prev)}
            className="flex w-full items-center justify-between text-left text-sm font-semibold text-foreground"
          >
            <span>{mvpTitle}</span>
            <span className="text-xs text-muted-foreground">
              {mvpOpen ? "Cerrar" : "Ver detalles"}
            </span>
          </button>
          {mvpOpen && (
            <div className="mt-6 space-y-4 text-sm text-muted-foreground">
              <div className="space-y-3 rounded-2xl border border-border/60 bg-white/80 p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <p className="text-[0.6rem] font-semibold uppercase tracking-[0.4em] text-muted-foreground">
                    MVP editable
                  </p>
                  <button
                    type="button"
                    onClick={resetMvpSection}
                    className="rounded-full border border-emerald-200 px-3 py-1 text-xs font-semibold text-emerald-600 transition hover:bg-emerald-50"
                  >
                    Restaurar
                  </button>
                </div>
                <label className="block space-y-1 text-[0.6rem] uppercase tracking-[0.3em] text-muted-foreground">
                  <span className="text-xs font-semibold text-foreground">Título sección</span>
                  <input
                    type="text"
                    value={mvpTitle}
                    onChange={(event) => setMvpTitle(event.target.value)}
                    className="w-full rounded-md border border-border/50 bg-white px-3 py-2 text-sm text-foreground focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                  />
                </label>
                <label className="block space-y-1 text-[0.6rem] uppercase tracking-[0.3em] text-muted-foreground">
                  <span className="text-xs font-semibold text-foreground">Introducción</span>
                  <textarea
                    rows={2}
                    value={mvpIntro}
                    onChange={(event) => setMvpIntro(event.target.value)}
                    className="w-full rounded-md border border-border/50 bg-white px-3 py-2 text-sm text-foreground focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                  />
                </label>
                <div className="grid gap-2 md:grid-cols-2">
                  {mvpItems.map((item, index) => (
                    <label key={`mvp-item-${index}`} className="space-y-1 text-[0.6rem] uppercase tracking-[0.3em] text-muted-foreground">
                      <span className="text-[0.65rem] font-semibold text-foreground">Punto {index + 1}</span>
                      <textarea
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
                    </label>
                  ))}
                </div>
                <label className="block space-y-1 text-[0.6rem] uppercase tracking-[0.3em] text-muted-foreground">
                  <span className="text-xs font-semibold text-foreground">Tiempos de entrega</span>
                  <textarea
                    rows={3}
                    value={mvpTimeline}
                    onChange={(event) => setMvpTimeline(event.target.value)}
                    className="w-full rounded-md border border-border/50 bg-white px-3 py-2 text-sm text-foreground focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                  />
                </label>
                <label className="block space-y-1 text-[0.6rem] uppercase tracking-[0.3em] text-muted-foreground">
                  <span className="text-xs font-semibold text-foreground">Vigencia</span>
                  <input
                    type="text"
                    value={mvpValidity}
                    onChange={(event) => setMvpValidity(event.target.value)}
                    className="w-full rounded-md border border-border/50 bg-white px-3 py-2 text-sm text-foreground focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                  />
                </label>
              </div>
              <p>{mvpIntro}</p>
              <ul className="list-disc space-y-2 pl-5 text-muted-foreground">
                {mvpItems.map((item, index) => (
                  <li key={`mvp-preview-${index}`}>{item}</li>
                ))}
              </ul>
              <p>{mvpTimeline}</p>
              <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
                {mvpValidity}
              </p>
            </div>
          )}
        </section>

        <section className="propuesta-print-final-continue border-t border-border/40 px-4 py-6 text-sm text-muted-foreground">
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
          <div className="mt-6 flex flex-col gap-6">
            <div className="flex flex-wrap items-center justify-end gap-3">
              <button
                type="button"
                onClick={handleExport}
                className="rounded-full border border-emerald-400 bg-emerald-50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700 transition hover:bg-emerald-100"
              >
                Exportar a PDF
              </button>
            </div>
            <div className="rounded-2xl border border-border/60 bg-surface p-4 text-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-muted-foreground">
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
                <p className="mt-2 text-xs font-medium text-emerald-700">
                  {emailFeedback}
                </p>
              )}
            </div>
            <div className="rounded-2xl border border-border/60 bg-surface p-4 text-sm">
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
          </div>
          <p className="mt-2 text-[0.6rem] uppercase tracking-[0.3em] text-muted-foreground">
            *SaaS (Software como servicio): plataforma en la nube con actualizaciones y soporte continuo.
          </p>
        </section>
        <style jsx global>{`
          @media print {
            body * {
              visibility: hidden !important;
            }
            .propuesta-print,
            .propuesta-print * {
              visibility: visible !important;
            }
            .propuesta-print {
              position: relative;
              left: 0;
              top: 0;
              width: 100%;
            }
            .propuesta-print table {
              border-collapse: collapse;
            }
            .propuesta-print section,
            .propuesta-print table,
            .propuesta-print tbody,
            .propuesta-print tr {
              page-break-inside: auto !important;
              break-inside: auto !important;
            }
            .propuesta-print thead {
              display: table-header-group;
            }
            .propuesta-print-economic {
              break-before: page;
              page-break-before: always;
            }
            .propuesta-print-final-start {
              break-before: page;
              page-break-before: always;
            }
            @page {
              size: auto;
              margin: 1.5cm;
            }
          }
        `}</style>
      </div>
    </AppViewLayout>
  )
}
