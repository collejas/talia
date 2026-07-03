"use client"

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react"
import {
  IconAlertCircle,
  IconCheck,
  IconPlus,
  IconTrash,
} from "@tabler/icons-react"

import { saveQuoteTemplateSettings } from "@/app/settings/formato-cotizacion/actions"
import type {
  QuoteTemplateConfig,
  QuoteTemplateSettings,
} from "@/app/settings/formato-cotizacion/template-schema"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { cn } from "@/lib/utils"

type QuoteTemplateSettingsFormProps = {
  initialTemplate: QuoteTemplateSettings
  defaultTemplate: QuoteTemplateSettings
}

type StatusBanner = { type: "success" | "error"; message: string } | null
type LogoAsset = {
  id: string
  nombre: string
  descripcion?: string | null
  file_url: string
  file_path: string
  metadata?: Record<string, unknown> | null
  created_at: string
}

const ensureHighlights = (list: string[]) => (list.length ? [...list] : [""])

export function QuoteTemplateSettingsForm({
  initialTemplate,
  defaultTemplate,
}: QuoteTemplateSettingsFormProps) {
  const [name, setName] = useState(initialTemplate.name)
  const [description, setDescription] = useState(initialTemplate.description)

  const [logoUrl, setLogoUrl] = useState(initialTemplate.config.logoUrl)
  const [primaryColor, setPrimaryColor] = useState(initialTemplate.config.primaryColor)
  const [accentColor, setAccentColor] = useState(initialTemplate.config.accentColor)
  const [headerTitle, setHeaderTitle] = useState(initialTemplate.config.headerTitle)
  const [headerSubtitle, setHeaderSubtitle] = useState(initialTemplate.config.headerSubtitle)
  const [introText, setIntroText] = useState(initialTemplate.config.introText)
  const [highlights, setHighlights] = useState(ensureHighlights(initialTemplate.config.highlights))
  const [notesTitle, setNotesTitle] = useState(initialTemplate.config.notesTitle)
  const [notesBody, setNotesBody] = useState(initialTemplate.config.notesBody)
  const [termsTitle, setTermsTitle] = useState(initialTemplate.config.termsTitle)
  const [termsBody, setTermsBody] = useState(initialTemplate.config.termsBody)
  const [signatureName, setSignatureName] = useState(initialTemplate.config.signatureName)
  const [signatureRole, setSignatureRole] = useState(initialTemplate.config.signatureRole)
  const [footerNote, setFooterNote] = useState(initialTemplate.config.footerNote)

  const [status, setStatus] = useState<StatusBanner>(null)
  const [isPending, startTransition] = useTransition()
  const [logoSheetOpen, setLogoSheetOpen] = useState(false)
  const [logos, setLogos] = useState<LogoAsset[]>([])
  const [logosLoading, setLogosLoading] = useState(false)
  const [logosError, setLogosError] = useState<string | null>(null)
  const [logoUploading, setLogoUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    setName(initialTemplate.name)
    setDescription(initialTemplate.description)
    setLogoUrl(initialTemplate.config.logoUrl)
    setPrimaryColor(initialTemplate.config.primaryColor)
    setAccentColor(initialTemplate.config.accentColor)
    setHeaderTitle(initialTemplate.config.headerTitle)
    setHeaderSubtitle(initialTemplate.config.headerSubtitle)
    setIntroText(initialTemplate.config.introText)
    setHighlights(ensureHighlights(initialTemplate.config.highlights))
    setNotesTitle(initialTemplate.config.notesTitle)
    setNotesBody(initialTemplate.config.notesBody)
    setTermsTitle(initialTemplate.config.termsTitle)
    setTermsBody(initialTemplate.config.termsBody)
    setSignatureName(initialTemplate.config.signatureName)
    setSignatureRole(initialTemplate.config.signatureRole)
    setFooterNote(initialTemplate.config.footerNote)
  }, [initialTemplate])

  const placeholdersTip = useMemo(
    () =>
      "Puedes usar {{cliente.nombre}}, {{organizacion.nombre}}, {{organizacion.eslogan_empresa}}, {{tabla_conceptos}} u otros tokens dentro de los textos.",
    [],
  )

  const loadLogos = useCallback(async () => {
    setLogosLoading(true)
    setLogosError(null)
    try {
      const response = await fetch("/api/settings/logos", { cache: "no-store" })
      const payload = await response.json()
      if (!response.ok) {
        throw new Error(
          typeof payload?.error === "string"
            ? payload.error
            : "No se pudieron cargar los logos.",
        )
      }
      const items = Array.isArray(payload?.logos) ? payload.logos : []
      setLogos(items as LogoAsset[])
    } catch (error) {
      setLogosError(
        error instanceof Error ? error.message : "No se pudieron cargar los logos.",
      )
    } finally {
      setLogosLoading(false)
    }
  }, [])

  useEffect(() => {
    if (logoSheetOpen && !logos.length && !logosLoading) {
      void loadLogos()
    }
  }, [logoSheetOpen, logos.length, logosLoading, loadLogos])

  const handleLogoFileChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      if (!file) {
        return
      }
      setLogoUploading(true)
      setLogosError(null)
      try {
        const formData = new FormData()
        formData.append("file", file, file.name || "logo.png")
        formData.append("nombre", file.name || "Logo")
        const response = await fetch("/api/settings/logos", {
          method: "POST",
          body: formData,
        })
        const payload = await response.json()
        if (!response.ok) {
          throw new Error(
            typeof payload?.error === "string"
              ? payload.error
              : "No se pudo subir el logo.",
          )
        }
        const newLogo = payload as LogoAsset
        setLogos((prev) => {
          const filtered = prev.filter((item) => item.id !== newLogo.id)
          return [newLogo, ...filtered]
        })
        setLogoUrl(newLogo.file_url)
        setLogoSheetOpen(false)
      } catch (error) {
        setLogosError(
          error instanceof Error ? error.message : "No se pudo subir el logo.",
        )
      } finally {
        setLogoUploading(false)
        if (fileInputRef.current) {
          fileInputRef.current.value = ""
        }
      }
    },
    [],
  )

  const updateFromConfig = (config: QuoteTemplateConfig, templateName: string, templateDesc: string) => {
    setName(templateName)
    setDescription(templateDesc)
    setLogoUrl(config.logoUrl)
    setPrimaryColor(config.primaryColor)
    setAccentColor(config.accentColor)
    setHeaderTitle(config.headerTitle)
    setHeaderSubtitle(config.headerSubtitle)
    setIntroText(config.introText)
    setHighlights(ensureHighlights(config.highlights))
    setNotesTitle(config.notesTitle)
    setNotesBody(config.notesBody)
    setTermsTitle(config.termsTitle)
    setTermsBody(config.termsBody)
    setSignatureName(config.signatureName)
    setSignatureRole(config.signatureRole)
    setFooterNote(config.footerNote)
  }

  const handleResetToDefaults = () => {
    updateFromConfig(defaultTemplate.config, defaultTemplate.name, defaultTemplate.description)
    setStatus({ type: "success", message: "Se restauró la plantilla base. Recuerda guardar." })
  }

  const handleDiscardChanges = () => {
    updateFromConfig(initialTemplate.config, initialTemplate.name, initialTemplate.description)
    setStatus({ type: "success", message: "Cambios descartados." })
  }

  const handleHighlightChange = (index: number, value: string) => {
    setHighlights((items) => items.map((item, position) => (position === index ? value : item)))
  }

  const handleRemoveHighlight = (index: number) => {
    setHighlights((items) => {
      if (items.length <= 1) return [""]
      return items.filter((_, position) => position !== index)
    })
  }

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setStatus(null)

    const sanitizedHighlights = highlights
      .map((item) => item.trim())
      .filter((item) => item.length > 0)

    const configPayload: QuoteTemplateConfig = {
      logoUrl: logoUrl.trim() || defaultTemplate.config.logoUrl,
      primaryColor,
      accentColor,
      headerTitle,
      headerSubtitle,
      introText,
      highlights: sanitizedHighlights.length ? sanitizedHighlights : ["Actualiza este punto desde Settings."],
      notesTitle,
      notesBody,
      termsTitle,
      termsBody,
      signatureName,
      signatureRole,
      footerNote,
    }

    startTransition(() => {
      saveQuoteTemplateSettings({
        name,
        description,
        config: configPayload,
      })
        .then((updated) => {
          updateFromConfig(updated.config, updated.name, updated.description)
          setStatus({ type: "success", message: "Formato guardado correctamente." })
        })
        .catch((error) => {
          console.error("[settings] save quote template failed", error)
          setStatus({
            type: "error",
            message:
              error instanceof Error
                ? error.message
                : "No se pudo guardar el formato. Inténtalo nuevamente.",
          })
        })
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      {status ? (
        <div
          className={cn(
            "flex items-start gap-3 rounded-md border px-4 py-3 text-sm",
            status.type === "success"
              ? "border-emerald-500/70 bg-emerald-500/10 text-emerald-900"
              : "border-red-500/70 bg-red-500/10 text-red-900",
          )}
        >
          {status.type === "success" ? (
            <IconCheck className="mt-0.5 size-4" />
          ) : (
            <IconAlertCircle className="mt-0.5 size-4" />
          )}
          <p>{status.message}</p>
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Resumen general</CardTitle>
          <CardDescription>
            Define el nombre del formato y un texto breve para identificarlo internamente. {placeholdersTip}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="format-name">Nombre del formato</Label>
            <Input
              id="format-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Formato estándar Tal-IA"
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="format-description">Descripción interna</Label>
            <Textarea
              id="format-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Explica para qué tipo de clientes aplica este formato."
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Branding</CardTitle>
          <CardDescription>Cambia logo y colores principales del documento.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-4 rounded-lg border p-4 md:flex-row md:items-center">
            <div className="flex items-center justify-center rounded-md border bg-white px-4 py-3 shadow-sm dark:bg-background">
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={logoUrl}
                  alt="Logo seleccionado"
                  className="max-h-16 w-auto object-contain"
                />
              ) : (
                <span className="text-sm text-muted-foreground">Sin logo</span>
              )}
            </div>
            <div className="flex-1 space-y-2">
              <Label htmlFor="logo-url">URL del logo</Label>
              <Input
                id="logo-url"
                value={logoUrl}
                onChange={(event) => setLogoUrl(event.target.value)}
                placeholder="https://talia.mx/tu-logo.png"
              />
              <p className="text-xs text-muted-foreground">
                Puedes pegar una URL manualmente o elegir uno de los logos cargados.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" onClick={() => setLogoSheetOpen(true)}>
                  Galería de logos
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setLogoSheetOpen(true)
                    if (!logos.length) {
                      void loadLogos()
                    }
                    setTimeout(() => {
                      fileInputRef.current?.click()
                    }, 50)
                  }}
                >
                  Subir logo
                </Button>
              </div>
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="primary-color">Color principal</Label>
              <Input
                id="primary-color"
                type="color"
                value={primaryColor}
                onChange={(event) => setPrimaryColor(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="accent-color">Color acento</Label>
              <Input
                id="accent-color"
                type="color"
                value={accentColor}
                onChange={(event) => setAccentColor(event.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Encabezado e introducción</CardTitle>
          <CardDescription>Ajusta los textos que verán tus prospectos al inicio.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="header-title">Etiqueta superior</Label>
              <Input
                id="header-title"
                value={headerTitle}
                onChange={(event) => setHeaderTitle(event.target.value)}
                placeholder="Geoactiv · Propuesta Comercial"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="header-subtitle">Título principal</Label>
              <Input
                id="header-subtitle"
                value={headerSubtitle}
                onChange={(event) => setHeaderSubtitle(event.target.value)}
                placeholder="Solución integral Tal-IA"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="intro-text">Introducción</Label>
            <Textarea
              id="intro-text"
              value={introText}
              onChange={(event) => setIntroText(event.target.value)}
              placeholder="Saluda al cliente y recuerda el contexto de la propuesta."
              rows={3}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Puntos destacados</CardTitle>
          <CardDescription>Enumera beneficios o recordatorios clave.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {highlights.map((item, index) => (
            <div key={`highlight-${index}`} className="flex items-center gap-2">
              <Textarea
                value={item}
                onChange={(event) => handleHighlightChange(index, event.target.value)}
                placeholder="Automatizamos la atención 24/7 en webchat y WhatsApp."
                rows={2}
              />
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="text-muted-foreground"
                onClick={() => handleRemoveHighlight(index)}
                disabled={highlights.length === 1}
              >
                <IconTrash className="size-4" />
              </Button>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" className="gap-1" onClick={() => setHighlights((items) => [...items, ""])}>
            <IconPlus className="size-4" /> Agregar punto
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Condiciones comerciales</CardTitle>
          <CardDescription>Personaliza los bloques finales con las condiciones de la cotización.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="notes-title">Título de notas</Label>
            <Input
              id="notes-title"
              value={notesTitle}
              onChange={(event) => setNotesTitle(event.target.value)}
            />
            <Textarea
              value={notesBody}
              onChange={(event) => setNotesBody(event.target.value)}
              rows={5}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="terms-title">Título de términos</Label>
            <Input
              id="terms-title"
              value={termsTitle}
              onChange={(event) => setTermsTitle(event.target.value)}
            />
            <Textarea
              value={termsBody}
              onChange={(event) => setTermsBody(event.target.value)}
              rows={5}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Firma y pie de página</CardTitle>
          <CardDescription>Controla cómo aparece tu equipo al final del documento.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="signature-name">Nombre o equipo</Label>
            <Input
              id="signature-name"
              value={signatureName}
              onChange={(event) => setSignatureName(event.target.value)}
            />
            <Label htmlFor="signature-role">Cargo / rol</Label>
            <Input
              id="signature-role"
              value={signatureRole}
              onChange={(event) => setSignatureRole(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="footer-note">Nota final</Label>
            <Input
              id="footer-note"
              value={footerNote}
              onChange={(event) => setFooterNote(event.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <Separator />

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Guardando..." : "Guardar formato"}
        </Button>
        <Button type="button" variant="outline" onClick={handleDiscardChanges}>
          Descartar cambios
        </Button>
        <Button type="button" variant="ghost" onClick={handleResetToDefaults}>
          Restaurar plantilla base
        </Button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleLogoFileChange}
        className="hidden"
      />

      <Sheet open={logoSheetOpen} onOpenChange={setLogoSheetOpen}>
        <SheetContent side="right" className="flex w-full flex-col gap-4 sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>Galería de logos</SheetTitle>
            <SheetDescription>Selecciona un logo existente o sube uno nuevo.</SheetDescription>
          </SheetHeader>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={logoUploading}
            >
              {logoUploading ? "Subiendo..." : "Subir logo"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => loadLogos()}
              disabled={logosLoading}
            >
              Recargar
            </Button>
          </div>
          {logosError ? <p className="text-sm text-destructive">{logosError}</p> : null}
          <ScrollArea className="h-[calc(100vh-260px)] pr-4">
            {logosLoading ? (
              <div className="grid gap-4 md:grid-cols-2">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div
                    key={`logo-skeleton-${index}`}
                    className="h-32 animate-pulse rounded-lg border border-dashed border-muted bg-muted/40"
                  />
                ))}
              </div>
            ) : logos.length ? (
              <div className="grid gap-4 md:grid-cols-2">
                {logos.map((logo) => (
                  <button
                    key={logo.id}
                    type="button"
                    onClick={() => {
                      setLogoUrl(logo.file_url)
                      setLogoSheetOpen(false)
                    }}
                    className="flex flex-col gap-2 rounded-lg border p-3 text-left transition hover:border-primary"
                  >
                    <div className="flex h-28 items-center justify-center rounded-md border bg-white p-3 dark:bg-background">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={logo.file_url}
                        alt={logo.nombre}
                        className="max-h-24 w-auto object-contain"
                      />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{logo.nombre}</p>
                      {logo.descripcion ? (
                        <p className="text-xs text-muted-foreground">{logo.descripcion}</p>
                      ) : null}
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Aún no has cargado logos.</p>
            )}
          </ScrollArea>
        </SheetContent>
      </Sheet>
    </form>
  )
}
