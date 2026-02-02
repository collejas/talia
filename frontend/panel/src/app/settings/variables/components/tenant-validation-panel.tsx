"use client"

import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

type ValidationScope = "webchat" | "calendar" | "mail" | "twilio" | "messenger" | "full"

type Report = {
  missing_routes: string[]
  missing_config: string[]
  missing_secrets: string[]
  notes: string[]
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
        throw new Error(payload.error || "No se pudo validar.")
      }
      setReport(payload)
      setError(null)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const renderList = (items: string[]) => {
    if (!items.length) {
      return <li className="text-xs text-muted-foreground">—</li>
    }
    return items.map((item) => (
      <li key={item} className="text-xs text-muted-foreground">
        {item}
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
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Missing routes</p>
              <ul className="list-disc pl-4">{renderList(report.missing_routes)}</ul>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Missing config</p>
              <ul className="list-disc pl-4">{renderList(report.missing_config)}</ul>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Missing secrets</p>
              <ul className="list-disc pl-4">{renderList(report.missing_secrets)}</ul>
            </div>
            {report.notes.length ? (
              <div className="md:col-span-3">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Notes</p>
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
