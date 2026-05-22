"use client"

import type React from "react"
import { useEffect, useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { formatApiError } from "@/app/settings/variables/utils/format-error"

type FieldSpec = {
  label: string
  path: string
  type?: "text" | "number" | "list"
  placeholder?: string
  multiline?: boolean
  control?: "checkbox"
}

type SecretField = {
  clave: string
  label: string
  tier?: "A" | "B"
  placeholder?: string
  note?: string
}

type SectionConfig = {
  title: string
  description?: string
  fields: FieldSpec[]
  secrets?: SecretField[]
  notes?: string[]
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

type FieldValue = string | boolean
type SecretPayload = {
  clave: string
  valor: string
  tier: "A" | "B"
  etiqueta?: string
}

export function TenantSectionForm({ section, config }: SectionFormProps) {
  const initialValues = useMemo(() => {
    const values: Record<string, FieldValue> = {}
    section.fields.forEach((field) => {
      const raw = getNestedValue(config, field.path)
      if (field.control === "checkbox") {
        values[field.path] = Boolean(raw)
      } else if (field.type === "list") {
        values[field.path] = Array.isArray(raw)
          ? raw.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean).join("\n")
          : typeof raw === "string"
            ? raw
            : ""
      } else {
        values[field.path] = raw !== undefined && raw !== null ? String(raw) : ""
      }
    })
    return values
  }, [config, section.fields])

  const initialSecretValues = useMemo<Record<string, string>>(() => {
    const values: Record<string, string> = {}
    section.secrets?.forEach((secret) => {
      values[secret.clave] = ""
    })
    return values
  }, [section.secrets])

  const [values, setValues] = useState<Record<string, FieldValue>>(initialValues)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)
  const [secretValues, setSecretValues] = useState(initialSecretValues)

  useEffect(() => {
    setValues(initialValues)
  }, [initialValues])

  useEffect(() => {
    setSecretValues(initialSecretValues)
  }, [initialSecretValues])

  const handleChange = (path: string, value: FieldValue) => {
    setValues((prev) => ({ ...prev, [path]: value }))
  }

  const handleSecretChange = (clave: string, value: string) => {
    setSecretValues((prev) => ({ ...prev, [clave]: value }))
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setLoading(true)
    setMessage(null)
    try {
      const patch: Record<string, unknown> = {}
      section.fields.forEach((field) => {
        if (field.control === "checkbox") {
          const checkboxValue = Boolean(values[field.path])
          setNestedValue(patch, field.path.split("."), checkboxValue)
          return
        }

        const rawValue = values[field.path]
        if (typeof rawValue !== "string") return
        const raw = rawValue.trim()
        if (!raw && field.type !== "list") return
        const parsed =
          field.type === "number"
            ? (isNaN(Number(raw)) ? undefined : Number(raw))
            : field.type === "list"
              ? raw
                  .split(/\r?\n/)
                  .map((item) => item.trim())
                  .filter(Boolean)
              : raw
        if (parsed === undefined) return
        setNestedValue(patch, field.path.split("."), parsed)
      })
      const secretsToSave: SecretPayload[] =
      section.secrets
        ?.reduce<SecretPayload[]>((acc, secret) => {
          const raw = (secretValues[secret.clave] ?? "").trim()
          if (!raw) return acc
          acc.push({
            clave: secret.clave,
            valor: raw,
            tier: secret.tier ?? "B",
            etiqueta: secret.note ?? secret.label,
          })
          return acc
        }, []) ?? []

      if (!Object.keys(patch).length && !secretsToSave.length) {
        setMessage({ type: "error", text: "Completa al menos un campo para guardar." })
        return
      }

      const successParts: string[] = []
      if (Object.keys(patch).length) {
        const response = await fetch("/api/settings/variables/config", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ config: patch }),
        })
      const payload = await response.json()
      if (!response.ok) {
        const errorMessage =
          formatApiError((payload as { error?: unknown })?.error) ?? "No se pudo guardar la sección."
        throw new Error(errorMessage)
      }
        successParts.push("Configuración guardada")
      }

      if (secretsToSave.length) {
        const response = await fetch("/api/settings/variables/secrets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ secrets: secretsToSave }),
        })
        const payload = await response.json()
        if (!response.ok) {
          const errorMessage =
            formatApiError((payload as { error?: unknown })?.error) ?? "No se pudieron guardar los secretos."
          throw new Error(errorMessage)
        }
        successParts.push("Secretos guardados")
        setSecretValues((prev) => {
          const next = { ...prev }
          secretsToSave.forEach((secret) => {
            next[secret.clave] = ""
          })
          return next
        })
      }

      setMessage({
        type: "success",
        text: successParts.length ? successParts.join(" y ") : "Cambios guardados",
      })
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
            {section.fields.map((field) => {
              if (field.control === "checkbox") {
                return (
                  <div key={field.path} className="space-y-1 md:col-span-2">
                    <div className="flex items-center gap-3">
                      <input
                        id={field.path}
                        type="checkbox"
                        className="h-4 w-4 rounded border-border text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        checked={Boolean(values[field.path])}
                        onChange={(event) => handleChange(field.path, event.target.checked)}
                      />
                      <Label htmlFor={field.path} className="mb-0 text-sm">
                        {field.label}
                      </Label>
                    </div>
                  </div>
                )
              }

              const fieldValue: string =
                typeof values[field.path] === "string" ? (values[field.path] as string) : ""

              if (field.multiline || field.type === "list") {
                return (
                  <div key={field.path} className="space-y-1 md:col-span-2">
                    <Label htmlFor={field.path}>{field.label}</Label>
                    <Textarea
                      id={field.path}
                      value={fieldValue}
                      onChange={(event) => handleChange(field.path, event.target.value)}
                      placeholder={field.placeholder}
                      rows={field.type === "list" ? 5 : 4}
                    />
                    {field.type === "list" ? (
                      <p className="text-xs text-muted-foreground">Un valor por línea. El catálogo se mostrará como select en contactos.</p>
                    ) : null}
                  </div>
                )
              }

              return (
                <div key={field.path} className="space-y-1">
                  <Label htmlFor={field.path}>{field.label}</Label>
                  <Input
                    id={field.path}
                    value={fieldValue}
                    onChange={(event) => handleChange(field.path, event.target.value)}
                    placeholder={field.placeholder}
                    type={field.type === "number" ? "number" : "text"}
                  />
                </div>
              )
            })}
          </div>
          {section.notes?.length ? (
            <div className="space-y-2 border-t border-border/60 pt-4">
              <div className="space-y-1 text-xs text-muted-foreground">
                {section.notes.map((note) => (
                  <p key={note}>{note}</p>
                ))}
              </div>
            </div>
          ) : null}
          {section.secrets?.length ? (
            <div className="space-y-2 border-t border-border/60 pt-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">Secretos</p>
                <p className="text-xs text-muted-foreground">Los valores se ocultan después de guardarlos.</p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                {section.secrets.map((secret) => (
                  <div key={secret.clave} className="space-y-1">
                    <Label htmlFor={`secret-${secret.clave}`}>{secret.label}</Label>
                    <Input
                      id={`secret-${secret.clave}`}
                      type="password"
                      value={secretValues[secret.clave] ?? ""}
                      onChange={(event) => handleSecretChange(secret.clave, event.target.value)}
                      placeholder={secret.placeholder ?? "Pega la clave"}
                    />
                    {secret.note ? (
                      <p className="text-xs text-muted-foreground">{secret.note}</p>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

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
