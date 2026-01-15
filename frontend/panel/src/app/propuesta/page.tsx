"use client"

import Image from "next/image"
import { useCallback, useMemo, useState } from "react"

import { AppViewLayout } from "@/components/layouts/app-view-layout"

const columnHeaders = [
  "Plan mensual 0%",
  "Plan trimestral 10%",
  "Plan semestral 15%",
  "Precio mínimo anual objetivo 20%",
]

const rentaRows = [
  {
    label: "",
    cells: [
      "12 pagos de: $4,166.67",
      "4 pagos de: $11,764.71",
      "2 pagos de: $22,222.22",
      "Pago único de: $40,000.00",
    ],
  },
  {
    label: "Pago anual total",
    cells: ["$50,000.04", "$47,058.84", "$44,444.44", "Pago único de: $40,000.00"],
  },
]

const configuracionRows = [
  {
    label: "",
    cells: [
      "12 pagos de: $10,312.50",
      "4 pagos de: $29,117.65",
      "2 pagos de: $55,000.00",
      "Pago único de: $99,000.00",
    ],
  },
  {
    label: "Pago anual total",
    cells: ["$123,750.00", "$116,470.59", "$110,000.00", "Pago único de: $99,000.00"],
  },
]

export default function Page() {
  const [expanded, setExpanded] = useState(false)
  const [mvpOpen, setMvpOpen] = useState(false)
  const [recipientEmail, setRecipientEmail] = useState("")
  const [messageBody, setMessageBody] = useState(
    "Adjunto encontrarás la propuesta Tal-IA para Gran Peñón.",
  )
  const [sendingEmail, setSendingEmail] = useState(false)
  const [emailFeedback, setEmailFeedback] = useState<string | null>(null)
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
  const handleExport = useCallback(() => {
    if (typeof window === "undefined") {
      return
    }
    window.open("/api/propuesta/tal-ia/pdf", "_blank")
  }, [])
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
  }, [recipientEmail, messageBody])
  return (
    <AppViewLayout title="Propuesta" contentClassName="max-w-full">
      <div className="propuesta-print space-y-8 px-4 pb-8 lg:px-6">
        <section className="rounded-2xl border border-border/60 bg-surface-alt p-6 shadow-sm">
          <h1 className="mt-2 text-3xl font-semibold text-foreground">
            Propuesta sistema Tal-IA *SaaS
          </h1>
          <p className="mt-1 text-sm uppercase tracking-[0.3em] font-semibold text-foreground underline">
            DESARROLLADORA EL PEÑON
          </p>
          <div className="mt-6 grid gap-4 md:grid-cols-4">
            {[
              {
                caption: "Asistente multicanal",
                title: "Atiende prospectos y clientes en todos los canales",
                description:
                  "WhatsApp, webchat y otros canales comparten contexto para dar una experiencia fluida.",
              },
              {
                caption: "Marketing integrado",
                title: "Orquesta campañas proactivas",
                description:
                  "Automatiza contenidos, notificaciones y flujos segmentados sin salir de Tal-IA.",
              },
              {
                caption: "CRM personalizado",
                title: "Centraliza contactos y oportunidades",
                description:
                  "Mantiene el historial, métricas y reglas de negocio para alimentar al asistente y al equipo.",
              },
              {
                caption: "Prospección",
                title: "Generación de contactos y leads",
                description:
                  "Búsquedas configuradas generan prospectos que nutren al asistente y al CRM en tiempo real.",
              },
            ].map((item) => (
              <article
                key={item.title}
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
          <p className="mt-6 text-base text-muted-foreground">
            El sistema Tal-IA se configura a la medida del flujo de ventas, marketing y
            operaciones de Gran Peñón. Todos los montos indicados son más IVA y pueden
            combinarse según el nivel de compromiso anual.
          </p>
          <p className="text-sm text-muted-foreground">
            Tal-IA se entrega como SaaS (software como servicio), lo que permite acceder
            al sistema sin inversión en infraestructura física y recibir soporte y mejoras
            continuas desde la nube.
          </p>
        </section>

        <section className="rounded-2xl border border-border/60 bg-white p-6 shadow-sm">
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
              <section className="space-y-4">
                <div className="flex flex-wrap items-baseline gap-3">
                  <span className="text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                    Precio renta
                  </span>
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
                            {header}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/40">
                      {rentaRows.map((row) => (
                        <tr key={row.label || JSON.stringify(row.cells)} className="even:bg-muted/5">
                          <td className="px-4 py-4 font-medium text-foreground">{row.label}</td>
                          {row.cells.map((cell, index) => (
                            <td key={`${row.label}-${index}`} className="px-4 py-4 text-foreground">
                              {cell}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="space-y-4">
                <div className="flex flex-wrap items-baseline gap-3">
                  <span className="text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                    Configuración
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Costos de configuración, programación y puesta en marcha (más IVA)
                  </span>
                </div>
                <div className="overflow-hidden rounded-2xl border border-border/40">
                  <table className="w-full min-w-[480px] border-collapse text-sm">
                    <thead className="bg-muted/10 text-xs uppercase tracking-[0.2em] text-muted-foreground">
                      <tr>
                        <th className="px-4 py-3 text-left">Concepto</th>
                        {columnHeaders.map((header) => (
                          <th key={`config-${header}`} className="px-4 py-3 text-left">
                            {header}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/40">
                      {configuracionRows.map((row) => (
                        <tr key={row.label || JSON.stringify(row.cells)} className="even:bg-muted/5">
                          <td className="px-4 py-4 font-medium text-foreground">{row.label}</td>
                          {row.cells.map((cell, index) => (
                            <td key={`${row.label}-${index}`} className="px-4 py-4 text-foreground">
                              {cell}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-sm text-muted-foreground">
                  La configuración incluye workshops de discovery, ajuste de workflows y
                  la parametrización de reglas de negocio para los tres módulos mencionados.
                  El pago aquí refleja la inversión única necesaria para que el sistema esté
                  plenamente operativo.
                </p>
              </section>
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-border/60 bg-white p-6 shadow-sm">
          <button
            type="button"
            onClick={() => setMvpOpen((prev) => !prev)}
            className="flex w-full items-center justify-between text-left text-sm font-semibold text-foreground"
          >
            <span>MVP · Despliegue inicial</span>
            <span className="text-xs text-muted-foreground">
              {mvpOpen ? "Cerrar" : "Ver detalles"}
            </span>
          </button>
          {mvpOpen && (
            <div className="mt-6 space-y-4 text-sm text-muted-foreground">
              <p>
                El MVP comprende las piezas mínimas para arrancar Tal-IA en Gran Peñón:
              </p>
              <ul className="list-disc space-y-2 pl-5 text-muted-foreground">
                <li>
                  <strong>Asistente multicanal:</strong> entrenamiento con esquemas de conversación,
                  respuestas preaprobadas y conexión a WhatsApp + webchat.
                </li>
                <li>
                  <strong>Marketing multicanal:</strong> plantillas y automatizaciones para campañas
                  activas + seguimiento automático de respuestas.
                </li>
                <li>
                  <strong>CRM personalizado:</strong> flujo de ventas, sincronización de contactos y
                  seguimiento de oportunidades en un tablero único.
                </li>
                <li>Contidad de Usuarios 50</li>
              </ul>
              <p>
                Tiempos de entrega aproximados: una vez que Gran Peñón provea toda la información
                solicitada (flujos, contactos clave, contenidos y aprobaciones) estimamos
                un despliegue en <strong>4 semanas</strong>. Si surgen contratiempos con la entrega
                de datos, el plazo puede extenderse.
              </p>
              <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
                Vigencia de propuesta: 20 días naturales
              </p>
            </div>
          )}
        </section>

        <section className="border-t border-border/40 px-4 py-6 text-sm text-muted-foreground">
          <div className="space-y-1">
            <p>Fecha: {today}</p>
            <p>Jorge Torre · Sistema Tal-IA*</p>
          </div>
          <div className="mt-4 flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-1 text-sm text-muted-foreground">
              <p>Cel: 4441302811</p>
              <p>Email: administracion@geoactiv.mx</p>
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
            .propuesta-print section,
            .propuesta-print table {
              page-break-inside: avoid !important;
              break-inside: avoid !important;
            }
            .propuesta-print table {
              border-collapse: collapse;
            }
            .propuesta-print table,
            .propuesta-print section {
              page-break-after: avoid !important;
              break-after: avoid !important;
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
