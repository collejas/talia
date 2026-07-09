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
  type?: "text" | "number" | "list" | "select" | "switch"
  placeholder?: string
  defaultValue?: string
  multiline?: boolean
  control?: "checkbox" | "switch"
  options?: Array<{ label: string; value: string }>
  switchValues?: { on: string | boolean; off: string | boolean }
  switchLabels?: { on: string; off: string }
  visibleWhen?: { fieldPath: string; equals: string | boolean }
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
  groups?: Array<{
    title: string
    description?: string
    fieldPaths: string[]
    visibleWhen?: { fieldPath: string; equals: string | boolean }
    subgroups?: Array<{
      title: string
      description?: string
      fieldPaths: string[]
      visibleWhen?: { fieldPath: string; equals: string | boolean }
    }>
  }>
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
  const isVisible = (visibleWhen: FieldSpec["visibleWhen"], valueMap: Record<string, FieldValue>) => {
    if (!visibleWhen) return true
    return valueMap[visibleWhen.fieldPath] === visibleWhen.equals
  }

  const initialValues = useMemo(() => {
    const values: Record<string, FieldValue> = {}
    section.fields.forEach((field) => {
      const raw = getNestedValue(config, field.path)
      if (field.control === "checkbox") {
        values[field.path] = Boolean(raw)
      } else if (field.control === "switch") {
        values[field.path] = raw === (field.switchValues?.on ?? true)
      } else if (field.type === "list") {
        values[field.path] = Array.isArray(raw)
          ? raw.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean).join("\n")
          : typeof raw === "string"
            ? raw
            : ""
      } else {
        values[field.path] = raw !== undefined && raw !== null ? String(raw) : field.defaultValue ?? ""
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

  const renderField = (field: FieldSpec) => {
    if (!isVisible(field.visibleWhen, values)) return null

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

    const fieldValue: string = typeof values[field.path] === "string" ? (values[field.path] as string) : ""

    if (field.control === "switch") {
      const checked = Boolean(values[field.path])
      const labelOff = field.switchLabels?.off ?? "Desactivado"
      const labelOn = field.switchLabels?.on ?? "Activado"
      return (
        <div key={field.path} className="space-y-1">
          <div className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-background px-3 py-2">
            <div className="space-y-0.5">
              <Label htmlFor={field.path} className="text-sm font-medium">
                {field.label}
              </Label>
              <p className="text-xs text-muted-foreground">{checked ? labelOn : labelOff}</p>
            </div>
            <label className="relative inline-flex h-6 w-11 cursor-pointer items-center">
              <input
                id={field.path}
                type="checkbox"
                className="peer sr-only"
                checked={checked}
                onChange={(event) => handleChange(field.path, event.target.checked)}
              />
              <span className="absolute inset-0 rounded-full bg-input transition-colors peer-checked:bg-primary" />
              <span className="absolute left-0.5 h-5 w-5 rounded-full bg-background shadow transition-transform peer-checked:translate-x-5" />
            </label>
          </div>
        </div>
      )
    }

    if (field.type === "select") {
      return (
        <div key={field.path} className="space-y-1">
          <Label htmlFor={field.path}>{field.label}</Label>
          <select
            id={field.path}
            value={fieldValue}
            onChange={(event) => handleChange(field.path, event.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
          >
            <option value="" disabled>
              Selecciona una opción
            </option>
            {(field.options ?? []).map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      )
    }

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
  }

  const renderFieldGroup = (group: NonNullable<SectionConfig["groups"]>[number]) => {
    if (!isVisible(group.visibleWhen, values)) return null
    const groupFields = section.fields.filter((field) => group.fieldPaths.includes(field.path))
    return (
      <div key={group.title} className="rounded-xl border border-border/60 bg-muted/20 p-4 space-y-4">
        <div className="space-y-1">
          <p className="text-sm font-medium">{group.title}</p>
          {group.description ? <p className="text-xs text-muted-foreground">{group.description}</p> : null}
        </div>
        {group.subgroups?.length ? (
          <div className="space-y-4">
            {group.subgroups.map((subgroup) => {
              if (!isVisible(subgroup.visibleWhen, values)) return null
              const subgroupFields = section.fields.filter((field) => subgroup.fieldPaths.includes(field.path))
              return (
                <div key={subgroup.title} className="rounded-lg border border-border/60 bg-background/70 p-4 space-y-4">
                  <div className="space-y-1">
                    <p className="text-sm font-medium">{subgroup.title}</p>
                    {subgroup.description ? (
                      <p className="text-xs text-muted-foreground">{subgroup.description}</p>
                    ) : null}
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">{subgroupFields.map(renderField)}</div>
                </div>
              )
            })}
            {groupFields
              .filter((field) => !group.subgroups?.some((subgroup) => subgroup.fieldPaths.includes(field.path)))
              .map(renderField)
            }
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">{groupFields.map(renderField)}</div>
        )}
      </div>
    )
  }

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
        if (!isVisible(field.visibleWhen, values)) return
        if (field.control === "checkbox") {
          const checkboxValue = Boolean(values[field.path])
          setNestedValue(patch, field.path.split("."), checkboxValue)
          return
        }
        if (field.control === "switch") {
          const switchValue = Boolean(values[field.path])
          const nextValue = switchValue ? field.switchValues?.on ?? true : field.switchValues?.off ?? false
          setNestedValue(patch, field.path.split("."), nextValue)
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
          {section.groups?.length ? (
            <div className="grid gap-4 md:grid-cols-2">
              {section.groups.map(renderFieldGroup)}
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">{section.fields.map(renderField)}</div>
          )}
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
