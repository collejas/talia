"use client"

import { useActionState, useState } from "react"
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

export type EmailServiceActionState = { status: "idle" | "success" | "error"; message?: string }
export type EmailServiceAction = (
  previousState: EmailServiceActionState,
  formData: FormData,
) => Promise<EmailServiceActionState>

type Props = {
  data: TenantEmailServiceData | null
  createDomainAction?: EmailServiceAction
  verifyDomainAction?: EmailServiceAction
  removeDomainAction?: EmailServiceAction
  updateSenderAction?: EmailServiceAction
  actionTenantId?: string
}

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

function DomainCreateForm({ action, tenantId }: { action: EmailServiceAction; tenantId?: string }) {
  const [state, formAction] = useActionState(action, { status: "idle" } satisfies EmailServiceActionState)
  return (
    <form action={formAction} className="grid gap-3 sm:grid-cols-[minmax(0,24rem)_auto] sm:items-end">
      {tenantId ? <input type="hidden" name="tenant_id" value={tenantId} /> : null}
      <div className="space-y-2">
        <label htmlFor="email-domain" className="text-sm font-medium">Dominio de envío</label>
        <input
          id="email-domain"
          name="email_domain"
          className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          placeholder="correo.ejemplo.com"
          maxLength={253}
          required
        />
      </div>
      <Button type="submit" variant="outline">Registrar dominio</Button>
      {state.message ? <p className={state.status === "error" ? "text-sm text-destructive sm:col-span-2" : "text-sm text-emerald-600 sm:col-span-2"}>{state.message}</p> : null}
    </form>
  )
}

function DomainVerifyForm({ domainId, action, tenantId }: { domainId: string; action: EmailServiceAction; tenantId?: string }) {
  const [state, formAction] = useActionState(action, { status: "idle" } satisfies EmailServiceActionState)
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      {tenantId ? <input type="hidden" name="tenant_id" value={tenantId} /> : null}
      <input type="hidden" name="email_domain_id" value={domainId} />
      <Button type="submit" size="sm" variant="outline">Verificar DNS</Button>
      {state.message ? <span className={state.status === "error" ? "text-xs text-destructive" : "text-xs text-emerald-600"}>{state.message}</span> : null}
    </form>
  )
}

function DomainRemoveForm({ domain, action, tenantId }: { domain: TenantEmailServiceData["domains"][number]; action: EmailServiceAction; tenantId?: string }) {
  const [state, formAction] = useActionState(action, { status: "idle" } satisfies EmailServiceActionState)

  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        if (!window.confirm(`¿Eliminar el dominio ${domain.domain} de la configuración de correo?`)) {
          event.preventDefault()
        }
      }}
    >
      {tenantId ? <input type="hidden" name="tenant_id" value={tenantId} /> : null}
      <input type="hidden" name="email_domain_id" value={domain.id} />
      <Button type="submit" size="sm" variant="destructive">Eliminar</Button>
      {state.status !== "idle" ? <p className={state.status === "error" ? "mt-2 text-xs text-destructive" : "mt-2 text-xs text-muted-foreground"}>{state.message}</p> : null}
    </form>
  )
}

function SenderForm({
  domain,
  action,
  tenantId,
}: {
  domain: TenantEmailServiceData["domains"][number]
  action: EmailServiceAction
  tenantId?: string
}) {
  const [state, formAction] = useActionState(action, { status: "idle" } satisfies EmailServiceActionState)
  return (
    <form action={formAction} className="grid gap-3 rounded-md border bg-muted/20 p-4 sm:grid-cols-2">
      {tenantId ? <input type="hidden" name="tenant_id" value={tenantId} /> : null}
      <input type="hidden" name="email_domain_id" value={domain.id} />
      <div className="space-y-2">
        <label htmlFor={`sender-email-${domain.id}`} className="text-sm font-medium">Correo remitente</label>
        <input
          id={`sender-email-${domain.id}`}
          name="sender_email"
          type="email"
          defaultValue={domain.from_email ?? ""}
          placeholder={`nombre@${domain.domain}`}
          className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          required
        />
        <p className="text-xs text-muted-foreground">Es la dirección que verá la persona que reciba tus correos.</p>
      </div>
      <div className="space-y-2">
        <label htmlFor={`sender-name-${domain.id}`} className="text-sm font-medium">Nombre que aparecerá</label>
        <input
          id={`sender-name-${domain.id}`}
          name="sender_name"
          defaultValue={domain.from_name ?? ""}
          placeholder="Nombre de tu empresa"
          maxLength={200}
          className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        />
      </div>
      <div className="space-y-2 sm:col-span-2">
        <label htmlFor={`reply-to-${domain.id}`} className="text-sm font-medium">Correo para recibir respuestas <span className="font-normal text-muted-foreground">(opcional)</span></label>
        <input
          id={`reply-to-${domain.id}`}
          name="reply_to_email"
          type="email"
          defaultValue={domain.reply_to_email ?? ""}
          placeholder="respuestas@talia.mx"
          className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        />
        <p className="text-xs text-muted-foreground">Si alguien responde al correo, la respuesta llegará a esta dirección.</p>
      </div>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <Button type="submit" size="sm">Guardar remitente</Button>
        {state.message ? <p className={state.status === "error" ? "text-sm text-destructive" : "text-sm text-emerald-600"}>{state.message}</p> : null}
      </div>
    </form>
  )
}

export function TenantEmailServicePanel({ data, createDomainAction, verifyDomainAction, removeDomainAction, updateSenderAction, actionTenantId }: Props) {
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

            {createDomainAction ? (
              <section className="space-y-3 rounded-lg border border-dashed p-4">
                <div><h3 className="font-medium">Registrar un dominio</h3><p className="text-sm text-muted-foreground">Después de registrarlo, publica los registros DNS que aparecerán abajo.</p></div>
                <DomainCreateForm action={createDomainAction} tenantId={actionTenantId} />
              </section>
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
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={domain.status === "verified" ? "secondary" : "outline"}>{label(domain.status, statusLabels)}</Badge>
                      {verifyDomainAction && domain.status !== "verified" ? <DomainVerifyForm domainId={domain.id} action={verifyDomainAction} tenantId={actionTenantId} /> : null}
                      {removeDomainAction ? (
                        <DomainRemoveForm domain={domain} action={removeDomainAction} tenantId={actionTenantId} />
                      ) : null}
                    </div>
                  </div>
                  {updateSenderAction && domain.status === "verified" ? (
                    <section className="space-y-3">
                      <div>
                        <h3 className="font-medium">Remitente de los correos</h3>
                        <p className="text-sm text-muted-foreground">Define el correo y el nombre que aparecerán al enviar desde este dominio.</p>
                      </div>
                      <SenderForm domain={domain} action={updateSenderAction} tenantId={actionTenantId} />
                    </section>
                  ) : null}
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
