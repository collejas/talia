"use client"

import type React from "react"
import { useEffect, useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"

type FieldSpec = {
  label: string
  path: string
  type?: "text" | "number"
  placeholder?: string
  multiline?: boolean
}

type SectionConfig = {
  title: string
  description?: string
  fields: FieldSpec[]
}

type SectionFormProps = {
  section: SectionConfig
  config: Record<string, unknown>
}

function getNestedValue(root: Record<string, unknown>, path: string) {
  return path.split(".").reduce<unknown>((current, key) => {
    if (!current || typeof current !== "object") return undefined
    const obj = current as Record<string, unknown>
    return obj[key]
  }, root)
}

function setNestedValue(target: Record<string, unknown>, path: string[], value: unknown) {
  const [head, ...rest] = path
  if (!head) return
  if (!rest.length) {
    target[head] = value
    return
  }
  if (!target[head] || typeof target[head] !== "object") {
    target[head] = {}
  }
  setNestedValue(target[head] as Record<string, unknown>, rest, value)
}

export function TenantSectionForm({ section, config }: SectionFormProps) {
  const initialValues = useMemo(() => {
    const values: Record<string, string> = {}
    section.fields.forEach((field) => {
      const raw = getNestedValue(config, field.path)
      values[field.path] = raw !== undefined && raw !== null ? String(raw) : ""
    })
    return values
  }, [config, section.fields])

  const [values, setValues] = useState(initialValues)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)

  useEffect(() => {
    setValues(initialValues)
  }, [initialValues])

  const handleChange = (path: string, value: string) => {
    setValues((prev) => ({ ...prev, [path]: value }))
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setLoading(true)
    setMessage(null)
    try {
      const patch: Record<string, unknown> = {}
      section.fields.forEach((field) => {
        const raw = values[field.path]?.trim()
        if (!raw) return
        const parsed =
          field.type === "number" ? (isNaN(Number(raw)) ? undefined : Number(raw)) : raw
        if (parsed === undefined) return
        setNestedValue(patch, field.path.split("."), parsed)
      })
      if (!Object.keys(patch).length) {
        setMessage({ type: "error", text: "Completa al menos un campo para guardar." })
        return
      }
      const response = await fetch("/api/settings/variables/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config: patch }),
      })
      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload.error || "No se pudo guardar la sección.")
      }
      setMessage({ type: "success", text: "Cambios guardados" })
    } catch (err) {
      setMessage({ type: "error", text: (err as Error).message })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{section.title}</CardTitle>
        {section.description ? <CardDescription>{section.description}</CardDescription> : null}
      </CardHeader>
      <CardContent className="space-y-4">
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="grid gap-4 md:grid-cols-2">
            {section.fields.map((field) =>
              field.multiline ? (
                <div key={field.path} className="space-y-1 md:col-span-2">
                  <Label htmlFor={field.path}>{field.label}</Label>
                  <Textarea
                    id={field.path}
                    value={values[field.path]}
                    onChange={(event) => handleChange(field.path, event.target.value)}
                    placeholder={field.placeholder}
                    rows={4}
                  />
                </div>
              ) : (
                <div key={field.path} className="space-y-1">
                  <Label htmlFor={field.path}>{field.label}</Label>
                  <Input
                    id={field.path}
                    value={values[field.path]}
                    onChange={(event) => handleChange(field.path, event.target.value)}
                    placeholder={field.placeholder}
                    type={field.type === "number" ? "number" : "text"}
                  />
                </div>
              ),
            )}
          </div>
          {message && (
            <p className={`text-sm ${message.type === "success" ? "text-emerald-600" : "text-destructive"}`}>
              {message.text}
            </p>
          )}
          <div className="flex justify-end">
            <Button type="submit" disabled={loading}>
              {loading ? "Guardando…" : "Guardar sección"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
