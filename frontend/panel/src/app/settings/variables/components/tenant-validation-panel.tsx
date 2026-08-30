"use client"

import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { formatApiError } from "@/app/settings/variables/utils/format-error"

type ValidationScope = "webchat" | "calendar" | "mail" | "twilio" | "messenger" | "whatsapp" | "full"

type ReportItem = string | number | Record<string, unknown> | readonly unknown[]

type Report = {
  missing_routes: ReportItem[]
  missing_config: ReportItem[]
  missing_secrets: ReportItem[]
  notes: ReportItem[]
}

type Props = {
  scope: ValidationScope
  label: string
  description?: string
}

export function TenantValidationPanel({ scope, label, description }: Props) {
  const [report, setReport] = useState<Report | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleValidate = async () => {
    setError(null)
    setLoading(true)
    try {
      const response = await fetch("/api/settings/variables/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope }),
      })
      const payload = await response.json()
      if (!response.ok) {
        const errorMessage = formatApiError((payload as { error?: unknown })?.error) ?? "No se pudo validar."
        throw new Error(errorMessage)
      }
      setReport(payload)
      setError(null)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const formatReportItem = (item: ReportItem): string => {
    if (typeof item === "string") return item
    if (typeof item === "number") return item.toString()
    if (Array.isArray(item)) {
      return item.map((child) => formatReportItem(child as ReportItem)).join(", ")
    }
    try {
      return "Hay un dato pendiente de revisar."
    } catch {
      return String(item)
    }
  }

  const renderList = (items: ReportItem[]) => {
    if (!items.length) {
      return <li className="text-xs text-muted-foreground">—</li>
    }
    return items.map((item, index) => (
      <li key={`${index}-${formatReportItem(item)}`} className="text-xs text-muted-foreground">
        {formatReportItem(item)}
      </li>
    ))
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{label}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-muted-foreground">Validación de scope `{scope}`</p>
          <Button variant="outline" size="sm" onClick={handleValidate} disabled={loading}>
            {loading ? "Validando…" : "Validar"}
          </Button>
        </div>
        {error ? <p className="text-xs text-destructive">{error}</p> : null}
        {report ? (
          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Canales pendientes</p>
              <ul className="list-disc pl-4">{renderList(report.missing_routes)}</ul>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Datos pendientes</p>
              <ul className="list-disc pl-4">{renderList(report.missing_config)}</ul>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Conexiones pendientes</p>
              <ul className="list-disc pl-4">{renderList(report.missing_secrets)}</ul>
            </div>
            {report.notes.length ? (
              <div className="md:col-span-3">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Recomendaciones</p>
                <ul className="list-disc pl-4">{renderList(report.notes)}</ul>
              </div>
            ) : null}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Ejecuta la validación para detectar faltantes.</p>
        )}
      </CardContent>
    </Card>
  )
}
