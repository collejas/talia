"use client"

import { useCallback, useMemo, useState, useTransition } from "react"
import { Controller, useFieldArray, useForm } from "react-hook-form"
import {
  IconAdjustments,
  IconCircleCheck,
  IconCircleX,
  IconMessages,
  IconPencil,
  IconPlus,
  IconReload,
  IconTrash,
} from "@tabler/icons-react"

import {
  type ContactTemplate,
  type ContactTemplateInput,
  createContactTemplate,
  deleteContactTemplate,
  updateContactTemplate,
} from "@/app/settings/prospeccion/plantillas/actions"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

type StatusBanner = { type: "success" | "error"; message: string } | null

type TwilioVariableEntry = { key: string; value: string }

type TemplateFormValues = {
  nombre: string
  slug: string
  canal: "correo" | "whatsapp" | "llamada"
  descripcion: string
  asunto: string
  bodyText: string
  bodyHtml: string
  activo: boolean
  twilioSid: string
  twilioVariables: TwilioVariableEntry[]
}

const MAIL_VARIABLE_TOKENS = ["{{nombre}}", "{{empresa}}", "{{email}}", "{{telefono}}", "{{segmento}}"]

const EMPTY_FORM: TemplateFormValues = {
  nombre: "",
  slug: "",
  canal: "whatsapp",
  descripcion: "",
  asunto: "",
  bodyText: "",
  bodyHtml: "",
  activo: true,
  twilioSid: "",
  twilioVariables: [],
}

function sortTemplates(list: ContactTemplate[]): ContactTemplate[] {
  return [...list].sort((a, b) =>
    a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" }),
  )
}

function extractTwilioVariables(meta: Record<string, unknown>): TwilioVariableEntry[] {
  const raw = meta?.twilio_variables
  if (!raw || typeof raw !== "object") return []
  return Object.entries(raw as Record<string, unknown>).map(([key, value]) => ({
    key,
    value: typeof value === "string" ? value : String(value ?? ""),
  }))
}

function templateToFormValues(template?: ContactTemplate): TemplateFormValues {
  if (!template) {
    return { ...EMPTY_FORM }
  }
  const metadata = template.metadata ?? {}
  const twilioSid =
    typeof metadata.twilio_content_sid === "string" ? metadata.twilio_content_sid : ""
  const twilioVariables = extractTwilioVariables(metadata)

  return {
    nombre: template.nombre,
    slug: template.slug ?? "",
    canal: template.canal,
    descripcion: template.descripcion ?? "",
    asunto: template.asunto ?? "",
    bodyText: template.cuerpoTexto ?? "",
    bodyHtml: template.cuerpoHtml ?? "",
    activo: template.activo,
    twilioSid,
    twilioVariables,
  }
}

function buildInputFromValues(
  values: TemplateFormValues,
  metadataSource?: Record<string, unknown>,
): ContactTemplateInput {
  const metadata: Record<string, unknown> = { ...(metadataSource ?? {}) }
  const twilioSid = values.twilioSid.trim()
  if (twilioSid) {
    metadata.twilio_content_sid = twilioSid
  } else {
    delete metadata.twilio_content_sid
  }

  const variables: Record<string, string> = {}
  values.twilioVariables.forEach((entry) => {
    const key = entry.key.trim()
    if (!key) return
    variables[key] = entry.value.trim()
  })
  if (Object.keys(variables).length) {
    metadata.twilio_variables = variables
  } else {
    delete metadata.twilio_variables
  }

  const baseInput: ContactTemplateInput = {
    canal: values.canal,
    nombre: values.nombre.trim(),
    slug: values.slug.trim(),
    descripcion: values.descripcion.trim() || null,
    cuerpo_texto: values.bodyText.trim() || null,
    cuerpo_html: values.canal === "correo" ? values.bodyHtml.trim() || null : null,
    activo: values.activo,
    metadata,
  }
  if (values.canal === "correo") {
    baseInput.asunto = values.asunto.trim()
  } else {
    baseInput.asunto = null
  }
  return baseInput
}

function formatChannelLabel(canal: ContactTemplate["canal"]): string {
  switch (canal) {
    case "correo":
      return "Correo"
    case "llamada":
      return "Llamada"
    default:
      return "WhatsApp"
  }
}

function twilioSummary(template: ContactTemplate): string {
  const metadata = template.metadata ?? {}
  const sid =
    typeof metadata.twilio_content_sid === "string" ? metadata.twilio_content_sid : ""
  const vars = metadata.twilio_variables && typeof metadata.twilio_variables === "object"
    ? Object.keys(metadata.twilio_variables as Record<string, unknown>).length
    : 0
  if (!sid && !vars) return "—"
  if (sid && vars) return `${sid} (${vars} var.)`
  return sid || `${vars} var.`
}

export function ContactTemplatesPanel({
  initialTemplates,
  lockedChannel,
}: {
  initialTemplates: ContactTemplate[]
  lockedChannel?: ContactTemplate["canal"]
}) {
  const [templates, setTemplates] = useState<ContactTemplate[]>(() =>
    sortTemplates(initialTemplates.filter((item) => (lockedChannel ? item.canal === lockedChannel : true))),
  )
  const [search, setSearch] = useState("")
  const [channelFilter, setChannelFilter] = useState<"all" | ContactTemplate["canal"]>(lockedChannel ?? "all")
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editing, setEditing] = useState<ContactTemplate | null>(null)
  const [feedback, setFeedback] = useState<StatusBanner>(null)
  const [pendingAction, setPendingAction] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const form = useForm<TemplateFormValues>({
    defaultValues: {
      ...EMPTY_FORM,
      canal: lockedChannel ?? EMPTY_FORM.canal,
    },
  })
  const { fields: twilioFields, append, remove, replace } = useFieldArray({
    control: form.control,
    name: "twilioVariables",
  })

  const canalWatch = form.watch("canal")

  const filteredTemplates = useMemo(() => {
    const query = search.trim().toLowerCase()
    return templates.filter((template) => {
      if (lockedChannel && template.canal !== lockedChannel) {
        return false
      }
      if (channelFilter !== "all" && template.canal !== channelFilter) {
        return false
      }
      if (!query) {
        return true
      }
      const haystack = [template.nombre, template.slug ?? "", template.descripcion ?? ""]
        .join(" ")
        .toLowerCase()
      return haystack.includes(query)
    })
  }, [templates, search, channelFilter, lockedChannel])

  const activeTotal = useMemo(() => templates.filter((tpl) => tpl.activo).length, [templates])

  const resetForm = useCallback(() => {
    form.reset({
      ...EMPTY_FORM,
      canal: lockedChannel ?? EMPTY_FORM.canal,
    })
    replace([])
    setEditing(null)
    setFeedback(null)
  }, [form, lockedChannel, replace])

  const closeSheet = useCallback(() => {
    setSheetOpen(false)
    resetForm()
  }, [resetForm])

  const openCreateSheet = useCallback(() => {
    resetForm()
    setSheetOpen(true)
  }, [resetForm])

  const openEditSheet = useCallback(
    (template: ContactTemplate) => {
      setEditing(template)
      const values = templateToFormValues(template)
      form.reset(values)
      replace(values.twilioVariables.length ? values.twilioVariables : [])
      setSheetOpen(true)
    },
    [form, replace],
  )

  const handleDelete = useCallback(
    (template: ContactTemplate) => {
      if (!window.confirm(`¿Eliminar la plantilla "${template.nombre}"?`)) {
        return
      }
      setPendingAction(template.id)
      startTransition(async () => {
        try {
          await deleteContactTemplate(template.id)
          setTemplates((prev) => prev.filter((item) => item.id !== template.id))
          setFeedback({ type: "success", message: "Plantilla eliminada." })
        } catch (error) {
          console.error(error)
          setFeedback({
            type: "error",
            message: error instanceof Error ? error.message : "No se pudo eliminar.",
          })
        } finally {
          setPendingAction(null)
        }
      })
    },
    [],
  )

  const handleToggleActive = useCallback(
    (template: ContactTemplate) => {
      setPendingAction(template.id)
      startTransition(async () => {
        try {
          const updated = await updateContactTemplate(template.id, {
            activo: !template.activo,
            metadata: template.metadata,
          })
          setTemplates((prev) => sortTemplates(prev.map((item) => (item.id === updated.id ? updated : item))))
        } catch (error) {
          console.error(error)
          setFeedback({
            type: "error",
            message: error instanceof Error ? error.message : "No se pudo actualizar el estado.",
          })
        } finally {
          setPendingAction(null)
        }
      })
    },
    [],
  )

  const validateForm = (values: TemplateFormValues): string | null => {
    if (!values.nombre.trim()) return "El nombre es obligatorio."
    if (!values.slug.trim()) return "Define un slug único para la plantilla."
    if (values.canal === "correo") {
      if (!values.asunto.trim()) return "El asunto es obligatorio para las plantillas de correo."
      if (!values.bodyText.trim()) return "Agrega un cuerpo de correo."
    }
    if (values.canal === "whatsapp") {
      const hasBody = Boolean(values.bodyText.trim())
      const hasTemplate = Boolean(values.twilioSid.trim())
      if (!hasBody && !hasTemplate) {
        return "Escribe un cuerpo o asigna un template de Twilio para WhatsApp."
      }
    }
    if (values.canal === "llamada" && !values.bodyText.trim()) {
      return "Describe el script de la llamada."
    }
    return null
  }

  const onSubmit = form.handleSubmit((values) => {
    const validationError = validateForm(values)
    if (validationError) {
      setFeedback({ type: "error", message: validationError })
      return
    }
    setFeedback(null)
    setPendingAction("save")
    startTransition(async () => {
      try {
        const payload = buildInputFromValues(values, editing?.metadata)
        const result = editing
          ? await updateContactTemplate(editing.id, payload)
          : await createContactTemplate(payload)
        setTemplates((prev) => sortTemplates([...(editing ? prev.filter((item) => item.id !== result.id) : prev), result]))
        setFeedback({
          type: "success",
          message: editing ? "Plantilla actualizada." : "Plantilla creada.",
        })
        closeSheet()
      } catch (error) {
        console.error(error)
        setFeedback({
          type: "error",
          message: error instanceof Error ? error.message : "No se pudo guardar la plantilla.",
        })
      } finally {
        setPendingAction(null)
      }
    })
  })

  const appendTemplateToken = useCallback(
    (field: "asunto" | "bodyText" | "bodyHtml", token: string) => {
      const current = String(form.getValues(field) ?? "")
      const separator =
        field === "asunto"
          ? (current && !/\s$/.test(current) ? " " : "")
          : (current && !current.endsWith("\n") ? "\n" : "")
      form.setValue(field, `${current}${separator}${token}`, { shouldDirty: true })
    },
    [form],
  )

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader className="flex flex-col gap-2">
          <CardTitle className="flex items-center gap-2 text-xl font-semibold">
            <IconMessages className="h-5 w-5 text-primary" />
            Plantillas de contacto
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Define el mensaje base por canal y vincula tus templates aprobados de Twilio para
            la etapa de primer contacto. Estas plantillas se reutilizan en el wizard de prospección.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{activeTotal}</span> activas ·{" "}
              <span className="font-medium text-foreground">{templates.length - activeTotal}</span> pausadas
            </div>
            <div className="flex flex-1 flex-wrap items-center gap-3">
              <Input
                placeholder="Buscar por nombre o slug..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="max-w-xs"
              />
              {lockedChannel ? null : (
                <Select
                  value={channelFilter}
                  onValueChange={(value) => setChannelFilter(value as "all" | ContactTemplate["canal"])}
                >
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Canal" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos los canales</SelectItem>
                    <SelectItem value="correo">Correo</SelectItem>
                    <SelectItem value="whatsapp">WhatsApp</SelectItem>
                    <SelectItem value="llamada">Llamada</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setTemplates(sortTemplates([...templates]))}>
                <IconReload className="mr-2 h-4 w-4" />
                Refrescar
              </Button>
              <Button size="sm" onClick={openCreateSheet}>
                <IconPlus className="mr-2 h-4 w-4" />
                Nueva plantilla
              </Button>
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Canal</TableHead>
                  <TableHead>Twilio</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="w-[120px] text-center">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTemplates.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-6 text-center text-sm text-muted-foreground">
                      No hay plantillas que coincidan con tu búsqueda.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredTemplates.map((template) => (
                    <TableRow key={template.id}>
                      <TableCell className="max-w-xs">
                        <div className="flex flex-col gap-1">
                          <span className="font-medium text-foreground">{template.nombre}</span>
                          <span className="text-xs text-muted-foreground">{template.slug}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{formatChannelLabel(template.canal)}</Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{twilioSummary(template)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Checkbox
                            checked={template.activo}
                            onCheckedChange={() => handleToggleActive(template)}
                            disabled={isPending && pendingAction === template.id}
                            aria-label={`Alternar plantilla ${template.nombre}`}
                          />
                          <span className="text-xs text-muted-foreground">
                            {template.activo ? "Activa" : "Pausada"}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-center gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openEditSheet(template)}
                            aria-label={`Editar ${template.nombre}`}
                          >
                            <IconPencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDelete(template)}
                            disabled={isPending && pendingAction === template.id}
                            aria-label={`Eliminar ${template.nombre}`}
                          >
                            <IconTrash className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Sheet open={sheetOpen} onOpenChange={(open) => (open ? setSheetOpen(true) : closeSheet())}>
        <SheetContent
          side="right"
          className="flex w-full flex-col gap-4 overflow-y-auto sm:max-w-2xl"
        >
          <SheetHeader>
            <SheetTitle>{editing ? "Editar plantilla" : "Nueva plantilla"}</SheetTitle>
            <SheetDescription>
              {editing
                ? "Actualiza los campos disponibles. Los cambios afectan a las campañas futuras."
                : "Define el contenido base y, si aplica, liga un template aprobado de Twilio."}
            </SheetDescription>
          </SheetHeader>

          {feedback && (
            <div
              className={cn(
                "rounded-md border px-4 py-2 text-sm",
                feedback.type === "success"
                  ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                  : "border-destructive/50 bg-destructive/10 text-destructive",
              )}
            >
              {feedback.message}
            </div>
          )}

          <form className="flex flex-1 flex-col gap-5" onSubmit={onSubmit}>
            <div className="space-y-3">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="nombre">Nombre</Label>
                  <Input id="nombre" {...form.register("nombre")} placeholder="Bienvenida WhatsApp" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="slug">Slug</Label>
                  <Input id="slug" {...form.register("slug")} placeholder="whatsapp_bienvenida" />
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Canal</Label>
                  {lockedChannel ? (
                    <div className="rounded-md border px-3 py-2 text-sm">{formatChannelLabel(lockedChannel)}</div>
                  ) : (
                    <Controller
                      control={form.control}
                      name="canal"
                      render={({ field }) => (
                        <Select value={field.value} onValueChange={field.onChange}>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecciona un canal" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="correo">Correo</SelectItem>
                            <SelectItem value="whatsapp">WhatsApp</SelectItem>
                            <SelectItem value="llamada">Llamada</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    />
                  )}
                </div>
                <div className="flex items-center justify-between rounded-lg border px-3 py-2">
                  <div>
                    <Label htmlFor="activo">Plantilla activa</Label>
                    <p className="text-xs text-muted-foreground">
                      Solo las plantillas activas aparecen en el wizard.
                    </p>
                  </div>
                  <Controller
                    control={form.control}
                    name="activo"
                    render={({ field }) => (
                      <Checkbox
                        id="activo"
                        checked={!!field.value}
                        onCheckedChange={(checked) => field.onChange(checked === true)}
                      />
                    )}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="descripcion">Descripción</Label>
                <Input id="descripcion" {...form.register("descripcion")} placeholder="Mensaje corto que aparece en la UI" />
              </div>
            </div>

            {canalWatch === "correo" && (
              <div className="space-y-3 rounded-lg border p-4">
                <p className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <IconAdjustments className="h-4 w-4" />
                  Contenido de correo
                </p>
                <div className="space-y-1.5">
                  <Label htmlFor="asunto">Asunto</Label>
                  <Input id="asunto" {...form.register("asunto")} placeholder="Seguimos con tu demo" />
                  <div className="flex flex-wrap gap-1">
                    {MAIL_VARIABLE_TOKENS.map((token) => (
                      <Button key={`asunto-${token}`} type="button" variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => appendTemplateToken("asunto", token)}>
                        {token}
                      </Button>
                    ))}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="bodyText">Cuerpo (texto)</Label>
                  <Textarea id="bodyText" rows={6} {...form.register("bodyText")} placeholder="Hola {{display_name}}, gracias por agendar..." />
                  <div className="flex flex-wrap gap-1">
                    {MAIL_VARIABLE_TOKENS.map((token) => (
                      <Button key={`body-${token}`} type="button" variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => appendTemplateToken("bodyText", token)}>
                        {token}
                      </Button>
                    ))}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="bodyHtml">
                    Cuerpo (HTML) <span className="text-xs text-muted-foreground">(opcional)</span>
                  </Label>
                  <Textarea id="bodyHtml" rows={6} {...form.register("bodyHtml")} placeholder="<p>Hola...</p>" />
                  <div className="flex flex-wrap gap-1">
                    {MAIL_VARIABLE_TOKENS.map((token) => (
                      <Button key={`html-${token}`} type="button" variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => appendTemplateToken("bodyHtml", token)}>
                        {token}
                      </Button>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Para imágenes usa URL pública: <code>{`<img src=\"https://...\" alt=\"...\" />`}</code>.
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Variables disponibles: <code>{"{{nombre}}"}</code>, <code>{"{{empresa}}"}</code>,{" "}
                    <code>{"{{email}}"}</code>, <code>{"{{telefono}}"}</code>, <code>{"{{segmento}}"}</code>.
                  </p>
                </div>
              </div>
            )}

            {canalWatch === "whatsapp" && (
              <div className="space-y-3 rounded-lg border p-4">
                <p className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <IconAdjustments className="h-4 w-4" />
                  Contenido de WhatsApp
                </p>
                <div className="space-y-1.5">
                  <Label htmlFor="bodyText">Mensaje (texto libre)</Label>
                  <Textarea
                    id="bodyText"
                    rows={5}
                    {...form.register("bodyText")}
                    placeholder="Hola {{display_name}}, soy parte del equipo Tal-IA..."
                  />
                  <p className="text-xs text-muted-foreground">
                    Puedes usar placeholders como <code>{"{{display_name}}"}</code>,{" "}
                    <code>{"{{actividad}}"}</code>, etc.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="twilioSid">
                    Twilio Content SID <span className="text-xs text-muted-foreground">(opcional)</span>
                  </Label>
                  <Input id="twilioSid" {...form.register("twilioSid")} placeholder="HXe3bf0ddb90a..." />
                  <p className="text-xs text-muted-foreground">
                    Si defines el SID, se enviará ese template aprobado en lugar del texto libre.
                  </p>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Variables del template</Label>
                    <Button type="button" variant="outline" size="sm" onClick={() => append({ key: "", value: "" })}>
                      <IconPlus className="mr-1 h-3.5 w-3.5" />
                      Agregar variable
                    </Button>
                  </div>
                  {twilioFields.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Agrega pares clave/valor solo si tu template lo requiere.</p>
                  ) : (
                    <div className="space-y-2">
                      {twilioFields.map((field, index) => (
                        <div key={field.id} className="grid gap-2 md:grid-cols-[160px_1fr_auto]">
                          <Input
                            placeholder="1"
                            {...form.register(`twilioVariables.${index}.key` as const)}
                          />
                          <Input
                            placeholder="{{display_name}}"
                            {...form.register(`twilioVariables.${index}.value` as const)}
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => remove(index)}
                            aria-label="Eliminar variable"
                          >
                            <IconTrash className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {canalWatch === "llamada" && (
              <div className="space-y-3 rounded-lg border p-4">
                <p className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <IconAdjustments className="h-4 w-4" />
                  Script de llamada
                </p>
                <Textarea
                  rows={6}
                  {...form.register("bodyText")}
                  placeholder="Mensaje base que reproducirá la llamada saliente."
                />
              </div>
            )}

            <SheetFooter className="mt-auto flex items-center gap-2">
              <Button type="submit" disabled={isPending && pendingAction === "save"}>
                <IconCircleCheck className="mr-2 h-4 w-4" />
                Guardar
              </Button>
              <Button type="button" variant="outline" onClick={closeSheet} disabled={isPending}>
                <IconCircleX className="mr-2 h-4 w-4" />
                Cancelar
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  )
}
