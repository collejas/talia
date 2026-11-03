"use client"

import { useEffect, useState } from "react"
import type { ReactNode } from "react"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  type OperationDetail,
  date,
  detailDate,
  documentLabel,
  fileHref,
  hierarchy,
  money,
  relationName,
  statusClasses,
  statusLabels,
  validationClasses,
  validationLabels,
} from "./inmobiliaria-sales-view"

type Props = { operationId: string }

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <section className="rounded-lg border p-4"><h2 className="mb-3 text-sm font-semibold">{title}</h2>{children}</section>
}

export function InmobiliariaOperationDetailView({ operationId }: Props) {
  const [detail, setDetail] = useState<OperationDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    fetch(`/api/crm/inmobiliaria/ventas/${encodeURIComponent(operationId)}/expediente`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json().catch(() => null) as { expediente?: OperationDetail; error?: string } | null
        if (!response.ok) throw new Error(payload?.error || "No se pudo cargar el expediente.")
        return payload?.expediente || null
      })
      .then((value) => { if (!controller.signal.aborted) setDetail(value) })
      .catch((failure: unknown) => { if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "No se pudo cargar el expediente.") })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [operationId])

  if (loading) return <p className="py-12 text-center text-sm text-muted-foreground">Cargando expediente inmobiliario…</p>
  if (error) return <div className="space-y-4"><Button asChild variant="outline"><Link href="/ventas-inmobiliarias">Volver a ventas inmobiliarias</Link></Button><p className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{error}</p></div>
  if (!detail) return <div className="space-y-4"><Button asChild variant="outline"><Link href="/ventas-inmobiliarias">Volver a ventas inmobiliarias</Link></Button><p className="rounded-md border p-4 text-sm text-muted-foreground">La operación no existe o no está disponible para este tenant.</p></div>

  const value = Number(detail.precio_final ?? detail.precio_acordado ?? detail.precio_establecido ?? 0)
  const confirmed = (detail.pagos || []).filter((payment) => payment.estado === "confirmado").reduce((sum, payment) => sum + Number(payment.importe || 0), 0)

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><Button asChild variant="ghost" className="-ml-3 mb-2"><Link href="/ventas-inmobiliarias">← Volver a ventas inmobiliarias</Link></Button><h1 className="text-2xl font-semibold tracking-tight">Expediente inmobiliario</h1><p className="mt-1 text-sm text-muted-foreground">{hierarchy(detail.unidad)}</p></div>
        <div className="text-right text-sm"><p className={statusClasses[detail.estado] || "font-semibold"}>{statusLabels[detail.estado] || detail.estado}</p><p className={validationClasses[detail.estado_validacion || ""] || "text-muted-foreground"}>{detail.estado_validacion ? validationLabels[detail.estado_validacion] || detail.estado_validacion : "Sin validación"}</p></div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card><CardHeader className="pb-2"><CardDescription>Valor de operación</CardDescription><CardTitle>{money(value, detail.moneda || "MXN")}</CardTitle></CardHeader><CardContent className="text-xs text-muted-foreground">Precio final, acordado o establecido</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardDescription>Pagos confirmados</CardDescription><CardTitle>{money(confirmed, detail.moneda || "MXN")}</CardTitle></CardHeader><CardContent className="text-xs text-muted-foreground">Aplicados a esta operación</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardDescription>Saldo estimado</CardDescription><CardTitle>{money(Math.max(0, value - confirmed), detail.moneda || "MXN")}</CardTitle></CardHeader><CardContent className="text-xs text-muted-foreground">Valor menos pagos confirmados</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardDescription>Fecha de operación</CardDescription><CardTitle className="text-base">{date(detail.fecha_evento_externo || detail.creado_en)}</CardTitle></CardHeader><CardContent className="text-xs text-muted-foreground">{detail.origen_venta === "externo" ? "Origen externo" : "Equipo interno"}</CardContent></Card>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Section title="Unidad inmobiliaria"><p className="font-medium">{hierarchy(detail.unidad)}</p><p className="mt-1 text-sm text-muted-foreground">Forma de adquisición: {detail.forma_adquisicion || "Por definir"}</p><p className="text-sm text-muted-foreground">Referencia externa: {detail.referencia_externa || "—"}</p></Section>
        <Section title="Comprador y oportunidad"><p className="font-medium">{relationName(detail.cliente)}</p><p className="text-sm">{detail.cliente?.correo_principal || detail.cliente?.correo || "—"} · {detail.cliente?.telefono_principal_e164 || "—"}</p><p className="mt-1 text-sm text-muted-foreground">{relationName(detail.oportunidad)}{detail.oportunidad?.codigo_oportunidad ? ` · ${detail.oportunidad.codigo_oportunidad}` : ""}</p></Section>
        <Section title="Responsables y origen"><p className="font-medium">{detail.origen_venta === "externo" ? relationName(detail.agente_externo) : relationName(detail.agente_usuario)}</p><p className="text-sm text-muted-foreground">{detail.origen_venta === "externo" ? `Socio comercial: ${relationName(detail.socio_comercial)}` : `Responsable interno: ${relationName(detail.responsable_interno)}`}</p><p className="text-sm text-muted-foreground">Comisión: {detail.comision_monto != null ? money(detail.comision_monto, detail.moneda || "MXN") : "—"}{detail.comision_porcentaje != null ? ` (${detail.comision_porcentaje}%)` : ""}</p></Section>
        <Section title={`Documentos del comprador (${detail.documentos?.length || 0})`}><div className="space-y-2">{(detail.documentos || []).map((document) => <div key={document.id} className="flex flex-wrap items-center justify-between gap-2 rounded border p-3"><div><p className="font-medium">{documentLabel(document.tipo_documento)}</p><p className="text-xs text-muted-foreground">{document.estado_revision || "Pendiente"} · {detailDate(document.subido_en)}</p></div><div className="flex gap-2">{fileHref(document.archivo_id) ? <><a className="text-xs text-primary underline" href={fileHref(document.archivo_id) || ""} target="_blank" rel="noreferrer">Ver</a><a className="text-xs text-primary underline" href={fileHref(document.archivo_id, true) || ""} download>Descargar</a></> : null}</div></div>)}{!detail.documentos?.length ? <p className="text-sm text-muted-foreground">No hay documentos registrados.</p> : null}</div></Section>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Section title={`Contratos (${detail.contratos?.length || 0})`}><div className="space-y-2">{(detail.contratos || []).map((contract) => <div key={contract.id} className="rounded border p-3"><div className="flex justify-between gap-2"><span>Versión {contract.version_operacion || "—"}</span><span className="font-medium">{contract.estado || "—"}</span></div><p className="text-xs text-muted-foreground">Firma: {contract.fecha_firma || contract.firmado_en || "—"}</p><div className="mt-2 flex gap-3 text-xs">{fileHref(contract.archivo_generado_id) ? <a className="text-primary underline" href={fileHref(contract.archivo_generado_id) || ""} target="_blank" rel="noreferrer">Contrato generado</a> : null}{fileHref(contract.archivo_firmado_id) ? <a className="text-primary underline" href={fileHref(contract.archivo_firmado_id, true) || ""} download>Descargar firmado</a> : null}</div></div>)}{!detail.contratos?.length ? <p className="text-sm text-muted-foreground">No hay contratos registrados.</p> : null}</div></Section>
        <Section title="Pagos y estado de cuenta"><div className="space-y-2">{(detail.pagos || []).map((payment) => <div key={payment.id} className="flex items-center justify-between gap-3 border-b pb-2"><div><p className="font-medium">{payment.concepto || "Pago"}</p><p className="text-xs text-muted-foreground">{payment.estado || "—"} · {payment.forma_pago || "—"} · {payment.fecha_pago ? detailDate(payment.fecha_pago) : "Sin fecha"}</p></div><span className="font-semibold">{money(payment.importe, payment.moneda || detail.moneda || "MXN")}</span></div>)}{!detail.pagos?.length ? <p className="text-sm text-muted-foreground">No hay movimientos financieros registrados.</p> : null}</div></Section>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Section title={`Cotizaciones y propuestas (${detail.cotizaciones?.length || 0})`}><div className="space-y-2">{(detail.cotizaciones || []).map((quote) => <div key={quote.id} className="flex items-center justify-between gap-3 border-b pb-2"><div><p className="font-medium">{quote.folio || "Cotización"}</p><p className="text-xs text-muted-foreground">{quote.dominio_comercial || "—"} · {quote.estatus || "—"} · {detailDate(quote.creado_en)}</p></div><span className="font-semibold">{money(quote.total, quote.moneda || detail.moneda || "MXN")}</span></div>)}{!detail.cotizaciones?.length ? <p className="text-sm text-muted-foreground">No hay cotizaciones ligadas a esta operación.</p> : null}</div></Section>
        <Section title={`Movimientos de unidad (${detail.movimientos?.length || 0})`}><div className="space-y-2">{(detail.movimientos || []).slice(0, 20).map((movement) => <div key={movement.id} className="border-b pb-2"><p className="font-medium">{movement.estado_anterior || "—"} → {movement.estado_nuevo || "—"}</p><p className="text-xs text-muted-foreground">{detailDate(movement.creado_en)} · {movement.motivo || "Sin motivo"}</p></div>)}{!detail.movimientos?.length ? <p className="text-sm text-muted-foreground">No hay movimientos registrados.</p> : null}</div></Section>
      </div>
    </div>
  )
}
