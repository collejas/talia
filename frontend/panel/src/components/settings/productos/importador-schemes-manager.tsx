"use client"

import { useCallback, useMemo, useState, useTransition } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"

import {
  ImporterField,
  ImporterFieldType,
  ImporterScheme,
} from "@/app/settings/productos/importador/types"

type Scheme = ImporterScheme

const DEFAULT_IMPORTER_FIELDS: ImporterField[] = [
  {
    id: "descripcion_corta",
    label: "Descripción corta",
    type: "text",
    required: false,
    description: "Resumen breve del producto.",
  },
  {
    id: "descripcion_larga",
    label: "Descripción larga",
    type: "text",
    required: false,
    description: "Descripción extensa del producto.",
  },
  {
    id: "precio_base",
    label: "Precio base",
    type: "number",
    required: false,
    description: "Precio base del producto.",
  },
]

const DEFAULT_IMPORTER_FIELD_IDS = new Set(DEFAULT_IMPORTER_FIELDS.map((field) => field.id))
const LEGACY_IMPORTER_FIELD_IDS = new Set(["descripcion"])

const FIELD_TYPES: { label: string; value: ImporterFieldType }[] = [
  { label: "Texto", value: "text" },
  { label: "Número", value: "number" },
  { label: "Booleano", value: "boolean" },
  { label: "Lista", value: "select" },
]

function newField(): ImporterField {
  return { id: "", label: "", type: "text", required: false, description: "" }
}

function mergeDefaultFields(fields: ImporterField[]): ImporterField[] {
  const customFields = fields.filter(
    (field) => !DEFAULT_IMPORTER_FIELD_IDS.has(field.id) && !LEGACY_IMPORTER_FIELD_IDS.has(field.id),
  )
  return [...DEFAULT_IMPORTER_FIELDS.map((field) => ({ ...field })), ...customFields]
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
}

function parseApiErrorPayload(payload: unknown): string {
  if (!payload) return "error"
  if (typeof payload === "string") return payload
  if (Array.isArray(payload)) {
    return JSON.stringify(payload)
  }
  if (typeof payload === "object") {
    const record = payload as Record<string, unknown>
    const candidates = ["error_description", "detail", "message", "error"]
    for (const key of candidates) {
      const value = record[key]
      if (typeof value === "string" && value.trim()) {
        return value
      }
    }
    if (record.error && typeof record.error !== "string") {
      try {
        return JSON.stringify(record.error)
      } catch {
        // fall through
      }
    }
  }
  return "error"
}

function buildFormValuesForScheme(scheme: Scheme | null) {
  if (!scheme) {
    return { name: "", description: "", fields: [...DEFAULT_IMPORTER_FIELDS, newField()] }
  }
  const fields =
    scheme.fields.length > 0
      ? mergeDefaultFields(scheme.fields.map((field) => ({ ...field })))
      : [...DEFAULT_IMPORTER_FIELDS, newField()]
  return {
    name: scheme.name,
    description: scheme.description ?? "",
    fields,
  }
}

async function postScheme(payload: Omit<Scheme, "id">) {
  const response = await fetch("/api/settings/productos/importador/schemes", {
    method: "POST",
    body: JSON.stringify({ ...payload, fields: payload.fields }),
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
  })
  if (!response.ok) {
    const payload = await response.json().catch(() => null)
    const message = parseApiErrorPayload(payload)
    throw new Error(message)
  }
  return (await response.json()) as Scheme
}

async function patchScheme(id: string, payload: Partial<Omit<Scheme, "id">>) {
  const response = await fetch(`/api/settings/productos/importador/schemes/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
  })
  if (!response.ok) {
    const payload = await response.json().catch(() => null)
    const message = parseApiErrorPayload(payload)
    throw new Error(message)
  }
  return (await response.json()) as Scheme
}

async function deleteScheme(id: string) {
  if (!id) {
    throw new Error("scheme_id_required")
  }
  const response = await fetch(`/api/settings/productos/importador/schemes/${id}`, {
    method: "DELETE",
    cache: "no-store",
  })
  if (!response.ok && response.status !== 204) {
    const payload = await response.json().catch(() => null)
    const message = parseApiErrorPayload(payload)
    throw new Error(message)
  }
}

export function ProductMetadataSchemesManager({ initialSchemes }: { initialSchemes: Scheme[] }) {
  const [schemes, setSchemes] = useState(initialSchemes)
  const initialScheme = initialSchemes[0] ?? null
  const [selectedId, setSelectedId] = useState<string | null>(initialScheme?.id ?? null)
  const activeScheme = useMemo(() => schemes.find((scheme) => scheme.id === selectedId) ?? null, [
    schemes,
    selectedId,
  ])
  const [formValues, setFormValues] = useState(() => buildFormValuesForScheme(initialScheme))
  const [feedback, setFeedback] = useState<string | null>(null)
  const [draftError, setDraftError] = useState<string | null>(null)
  const [fieldDraft, setFieldDraft] = useState<ImporterField>(newField())
  const [isPending, startTransition] = useTransition()
  const applySchemeSelection = useCallback((scheme: Scheme | null) => {
    setSelectedId(scheme?.id ?? null)
    setFormValues(buildFormValuesForScheme(scheme))
    setFieldDraft(newField())
    setDraftError(null)
  }, [setSelectedId, setFormValues])

  const downloadTemplate = useCallback(
    (scheme: Scheme) => {
      const headers = [
        "nombre",
        "descripcion_corta",
        "descripcion_larga",
        "precio_base",
        "linea",
        "familia",
        "modelo",
        ...mergeDefaultFields(scheme.fields)
          .map((field) => field.id || field.label)
          .filter((field): field is string => !DEFAULT_IMPORTER_FIELD_IDS.has(field)),
      ]
      const csv = headers.join(",") + "\n"
      const blob = new Blob([csv], { type: "text/csv" })
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = `${scheme.name.replace(/\s+/g, "_")}_plantilla.csv`
      document.body.appendChild(link)
      link.click()
      URL.revokeObjectURL(url)
      link.remove()
    },
    [],
  )

  const resetForm = useCallback(() => {
    applySchemeSelection(null)
  }, [applySchemeSelection])

  const handleDraftChange = useCallback((value: Partial<ImporterField>) => {
    setDraftError(null)
    setFieldDraft((prev) => ({ ...prev, ...value }))
  }, [])

  const handleAddField = useCallback(() => {
    const label = fieldDraft.label.trim()
    if (!label) {
      setDraftError("La etiqueta es obligatoria.")
      return
    }
    const candidateId = fieldDraft.id.trim() || slugify(label) || `campo_${Date.now()}`
    if (!candidateId) {
      setDraftError("Genera un slug válido.")
      return
    }
    if (formValues.fields.some((field) => field.id === candidateId)) {
      setDraftError("Ya existe un campo con ese identificador.")
      return
    }
    const nextField: ImporterField = {
      ...fieldDraft,
      id: candidateId,
      label,
    }
    setFormValues((prev) => ({ ...prev, fields: [...prev.fields, nextField] }))
    setFieldDraft(newField())
    setDraftError(null)
  }, [fieldDraft, formValues.fields])

  const handleRemoveField = useCallback((index: number) => {
    setFormValues((prev) => {
      const nextFields = [...prev.fields]
      nextFields.splice(index, 1)
      return { ...prev, fields: nextFields }
    })
  }, [])

  const saveScheme = useCallback(
    async (update: boolean) => {
      if (isPending) return
      setFeedback(null)
      startTransition(async () => {
        try {
          if (update && activeScheme) {
            const fields = formValues.fields.filter((field) => field.id || field.label)
            const updated = await patchScheme(activeScheme.id, {
              name: formValues.name,
              description: formValues.description,
              fields,
            })
            setSchemes((prev) => prev.map((scheme) => (scheme.id === updated.id ? updated : scheme)))
            applySchemeSelection(updated)
            setFeedback("Esquema actualizado")
          } else {
            const fields = formValues.fields.filter((field) => field.id || field.label)
            const created = await postScheme({
              name: formValues.name,
              description: formValues.description,
              fields,
            })
            setSchemes((prev) => [created, ...prev])
            applySchemeSelection(created)
            setFeedback("Esquema creado")
          }
        } catch (error) {
          console.error("[importador] save scheme", error)
          setFeedback(error instanceof Error ? error.message : "Ocurrió un error")
        }
      })
    },
    [activeScheme, formValues, isPending, applySchemeSelection],
  )

  const handleDelete = useCallback(async () => {
    if (!activeScheme?.id || isPending) return
    startTransition(async () => {
      try {
        await deleteScheme(activeScheme.id)
        setSchemes((prev) => prev.filter((scheme) => scheme.id !== activeScheme.id))
        setFeedback("Esquema eliminado")
        resetForm()
      } catch (error) {
        console.error("[importador] delete scheme", error)
        setFeedback(error instanceof Error ? error.message : "No se pudo eliminar")
      }
    })
  }, [activeScheme, isPending, resetForm])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-semibold">Configuración de esquemas</h2>
        <Badge variant="outline">{schemes.length} esquemas guardados</Badge>
      </div>
      <div className="space-y-3">
        {feedback ? (
          <p className="text-sm text-muted-foreground">{feedback}</p>
        ) : (
          <p className="text-sm text-muted-foreground">
            Define los campos adicionales que conformarán el `metadata` cuando subas CSV/Excel.
          </p>
        )}
        <div className="flex flex-wrap gap-3">
          {schemes.map((scheme) => (
            <Button
              key={scheme.id}
              variant={scheme.id === selectedId ? "secondary" : "outline"}
              size="sm"
              onClick={() => applySchemeSelection(scheme)}
            >
              {scheme.name}
            </Button>
          ))}
          <Button variant="outline" size="sm" onClick={() => resetForm()}>
            Nuevo esquema
          </Button>
        </div>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Esquema {activeScheme ? "existente" : "nuevo"}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Nombre del esquema</Label>
              <Input
                value={formValues.name}
                onChange={(event) => setFormValues((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="Ej. Productos inmobiliarios Las Aguilas"
              />
            </div>
            <div className="space-y-1">
              <Label>Descripción</Label>
              <Textarea
                value={formValues.description}
                onChange={(event) => setFormValues((prev) => ({ ...prev, description: event.target.value }))}
                placeholder="Describe en qué consiste este esquema..."
                rows={3}
              />
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-2xl border border-border/80 p-4 space-y-4">
              <div className="text-sm font-semibold">Agregar campo</div>
              <p className="text-xs text-muted-foreground">
                Cada nuevo campo se convierte en una columna adicional en la tabla de vista previa. Completa la etiqueta y la tabla se actualiza automáticamente.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label>Etiqueta</Label>
                  <Input
                    value={fieldDraft.label}
                    onChange={(event) => handleDraftChange({ label: event.target.value })}
                    placeholder="Habitaciones"
                  />
                </div>
                <div className="space-y-1">
                  <Label>ID (slug)</Label>
                  <Input
                    value={fieldDraft.id}
                    onChange={(event) => handleDraftChange({ id: event.target.value })}
                    placeholder="habitaciones"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Tipo</Label>
                  <Select
                    value={fieldDraft.type}
                    onValueChange={(value) => handleDraftChange({ type: value as ImporterFieldType })}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Tipo" />
                    </SelectTrigger>
                    <SelectContent>
                      {FIELD_TYPES.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end gap-2">
                  <Checkbox
                    checked={fieldDraft.required}
                    onCheckedChange={(checked) => handleDraftChange({ required: Boolean(checked) })}
                    id="field-required-draft"
                  />
                  <Label htmlFor="field-required-draft">Requerido</Label>
                </div>
              </div>
              <div className="space-y-1">
                <Label>Descripción (opcional)</Label>
                <Textarea
                  value={fieldDraft.description ?? ""}
                  onChange={(event) => handleDraftChange({ description: event.target.value })}
                  rows={2}
                  placeholder="Describe para qué sirve este campo"
                />
              </div>
              <div className="flex items-center gap-3">
                <Button size="sm" variant="ghost" onClick={handleAddField}>
                  Agregar campo a la tabla
                </Button>
                <p className="text-xs text-muted-foreground">
                  {draftError ? <span className="text-destructive">{draftError}</span> : "El slug se genera automáticamente si lo dejas en blanco."}
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Vista previa de la tabla que genera el importador. Las columnas nuevas se agregan aquí.
            </p>
            <ScrollArea className="max-h-[240px] rounded-xl border border-border/80">
              <Table className="w-full min-w-[640px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Descripción corta</TableHead>
                    <TableHead>Descripción larga</TableHead>
                    <TableHead>Precio base</TableHead>
                    <TableHead>Línea</TableHead>
                    <TableHead>Familia</TableHead>
                    <TableHead>Modelo</TableHead>
                    {formValues.fields.map((field, index) => {
                      if (DEFAULT_IMPORTER_FIELD_IDS.has(field.id)) {
                        return null
                      }
                      return (
                        <TableHead key={`${field.id}-${index}`}>
                          <div className="flex items-center justify-between gap-2">
                            <span>{field.label || field.id || `Campo ${index + 1}`}</span>
                            <button
                              type="button"
                              className="text-xs text-destructive underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              onClick={() => handleRemoveField(index)}
                            >
                              Eliminar
                            </button>
                          </div>
                        </TableHead>
                      )
                    })}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell>Protótipo 1</TableCell>
                    <TableCell>Resumen breve del producto</TableCell>
                    <TableCell>Descripción extensa del producto</TableCell>
                    <TableCell>$ 0.00</TableCell>
                    <TableCell>Residencial</TableCell>
                    <TableCell>Familia muestra</TableCell>
                    <TableCell>Modelo base</TableCell>
                    {formValues.fields.map((field, index) => {
                      if (DEFAULT_IMPORTER_FIELD_IDS.has(field.id)) {
                        return null
                      }
                      return (
                        <TableCell key={`${field.id || index}`}>
                          {field.type === "boolean"
                            ? "sí / no"
                            : field.label || field.id || `Val ${index + 1}`}
                        </TableCell>
                      )
                    })}
                  </TableRow>
                </TableBody>
              </Table>
            </ScrollArea>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              onClick={() => saveScheme(Boolean(activeScheme))}
              disabled={isPending}
              variant="default"
            >
              {activeScheme ? "Actualizar esquema" : "Crear esquema"}
            </Button>
            {activeScheme && (
              <>
                <Button onClick={() => handleDelete()} variant="destructive" disabled={isPending}>
                  Eliminar esquema
                </Button>
                <Button onClick={() => downloadTemplate(activeScheme)} variant="outline">
                  Descargar plantilla CSV
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
