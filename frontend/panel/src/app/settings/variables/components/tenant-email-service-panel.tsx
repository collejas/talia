"use client"

import { useState } from "react"
import { Check, Copy, Globe2, Mail, ShieldCheck } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

export type TenantEmailServiceData = {
  migration_status: string
  feature_enabled: boolean
  domains: Array<{
    id: string
    domain: string
    status: string
    verified_at?: string | null
    from_email?: string | null
    from_name?: string | null
    reply_to_email?: string | null
    dns_records: Array<{ host: string; record_type: string; value: string }>
  }>
  plan?: {
    code: string
    period_unit: string
    period_limit: number
    daily_limit?: number | null
    overage_allowed: boolean
  } | null
  usage?: {
    period_start: string
    period_end: string
    reserved: number
    accepted: number
    failed: number
    delivered: number
    bounced: number
    complained: number
    released: number
    available: number
  } | null
}

type Props = { data: TenantEmailServiceData | null }

const migrationLabels: Record<string, string> = {
  pending: "Pendiente",
  validating: "En validación",
  active: "Activo",
  paused: "Pausado",
  failed: "Requiere atención",
}

const statusLabels: Record<string, string> = {
  pending_dns: "DNS pendiente",
  verifying: "Verificando",
  verified: "Verificado",
  blocked: "Bloqueado",
}

function number(value: number) {
  return new Intl.NumberFormat("es-MX").format(value)
}

function label(value: string, labels: Record<string, string>) {
  return labels[value] ?? value.replaceAll("_", " ")
}

function CopyValue({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    await navigator.clipboard.writeText(value)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }

  return (
    <Button type="button" variant="ghost" size="icon-sm" onClick={copy} aria-label="Copiar valor">
      {copied ? <Check className="text-emerald-600" /> : <Copy />}
    </Button>
  )
}

export function TenantEmailServicePanel({ data }: Props) {
  const status = data?.migration_status ?? "pending"
  const plan = data?.plan
  const usage = data?.usage

  return (
    <Card>
      <CardHeader className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="flex items-center gap-2"><Mail className="size-5" /> Servicio de correo</CardTitle>
          <Badge variant={data?.feature_enabled ? "secondary" : "outline"}>{label(status, migrationLabels)}</Badge>
        </div>
        <CardDescription>
          Consulta el dominio autorizado, los registros DNS y la cuota asignada para los envíos de este tenant.
          Esta configuración pertenece al servicio central de correo y no modifica las demás configuraciones de correo existentes.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {!data ? (
          <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            No se pudo cargar el estado del servicio de correo.
          </p>
        ) : (
          <>
            {!data.feature_enabled ? (
              <div className="rounded-lg border border-dashed bg-muted/30 p-4 text-sm text-muted-foreground">
                El servicio todavía no está habilitado para este tenant. El administrador maestro debe completar la asignación antes de enviar.
              </div>
            ) : null}

            <section className="space-y-3">
              <div className="flex items-center gap-2"><Globe2 className="size-4 text-muted-foreground" /><h3 className="font-medium">Dominios de envío</h3></div>
              {data.domains.length === 0 ? (
                <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Aún no hay un dominio asignado.</p>
              ) : data.domains.map((domain) => (
                <div key={domain.id} className="space-y-4 rounded-lg border p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">{domain.domain}</p>
                      <p className="text-sm text-muted-foreground">
                        Remitente: {domain.from_email ?? "Pendiente de configurar"}
                        {domain.from_name ? ` · ${domain.from_name}` : ""}
                      </p>
                      {domain.reply_to_email ? <p className="text-sm text-muted-foreground">Responder a: {domain.reply_to_email}</p> : null}
                    </div>
                    <Badge variant={domain.status === "verified" ? "secondary" : "outline"}>{label(domain.status, statusLabels)}</Badge>
                  </div>
                  {domain.dns_records.length ? (
                    <div className="overflow-x-auto rounded-md border">
                      <Table>
                        <TableHeader><TableRow><TableHead>Host</TableHead><TableHead>Tipo</TableHead><TableHead>Valor</TableHead><TableHead className="w-10" /></TableRow></TableHeader>
                        <TableBody>{domain.dns_records.map((record) => (
                          <TableRow key={`${record.record_type}-${record.host}`}>
                            <TableCell className="font-mono text-xs">{record.host}</TableCell>
                            <TableCell>{record.record_type}</TableCell>
                            <TableCell className="max-w-[28rem] truncate font-mono text-xs" title={record.value}>{record.value}</TableCell>
                            <TableCell><CopyValue value={record.value} /></TableCell>
                          </TableRow>
                        ))}</TableBody>
                      </Table>
                    </div>
                  ) : <p className="text-sm text-muted-foreground">Los registros DNS aparecerán cuando el dominio sea preparado.</p>}
                </div>
              ))}
            </section>

            <section className="space-y-3">
              <div className="flex items-center gap-2"><ShieldCheck className="size-4 text-muted-foreground" /><h3 className="font-medium">Plan y uso</h3></div>
              {!plan ? <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Aún no hay un plan o cuota configurado.</p> : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Plan</p><p className="font-medium">{plan.code}</p></div>
                  <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Límite del periodo</p><p className="font-medium">{number(plan.period_limit)}</p></div>
                  <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Reservados</p><p className="font-medium">{number(usage?.reserved ?? 0)}</p></div>
                  <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Disponibles</p><p className="font-medium">{number(usage?.available ?? plan.period_limit)}</p></div>
                </div>
              )}
            </section>
          </>
        )}
      </CardContent>
    </Card>
  )
}
