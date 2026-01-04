"use client"

import { type ChangeEvent, useCallback, useMemo, useRef, useState } from "react"
import { IconTrash, IconStar, IconUpload } from "@tabler/icons-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"

const MEDIA_TYPES = [
  { value: "portada", label: "Portada" },
  { value: "galeria", label: "Galería" },
  { value: "especifico", label: "Específico" },
  { value: "manual", label: "Manual" },
] as const

const DEFAULT_TYPE = "galeria"

const randomId = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID()
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

export type MediaEntry = {
  id: string
  url: string
  descripcion?: string | null
  tipo: (typeof MEDIA_TYPES)[number]["value"]
  predeterminada?: boolean
}

type MetadataRecord = Record<string, unknown>

export function normalizeMediaList(metadata?: MetadataRecord | null): MediaEntry[] {
  if (!metadata || typeof metadata !== "object") {
    return []
  }
  const rawList = metadata.media
  if (!Array.isArray(rawList)) {
    return []
  }
  return rawList
    .filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === "object"))
    .map((entry) => {
      const url =
        typeof entry.url === "string" && entry.url.trim()
          ? entry.url.trim()
          : ""
      const tipoValue = (entry.tipo as string) ?? DEFAULT_TYPE
      const tipo = MEDIA_TYPES.find((option) => option.value === tipoValue)?.value ?? DEFAULT_TYPE
      return {
        id:
          typeof entry.id === "string" && entry.id.trim()
            ? entry.id
            : randomId(),
        url,
        descripcion:
          typeof entry.descripcion === "string" && entry.descripcion.trim()
            ? entry.descripcion.trim()
            : null,
        tipo,
        predeterminada: Boolean(entry.predeterminada),
      }
    })
}

export function buildMetadataWithMedia(
  base?: MetadataRecord | null,
  mediaList?: MediaEntry[],
): MetadataRecord {
  const clone: MetadataRecord = base && typeof base === "object" ? JSON.parse(JSON.stringify(base)) : {}
  const normalized = mediaList?.map((entry) => ({
    ...entry,
    descripcion: entry.descripcion || null,
  }))
  if (normalized?.length) {
    Object.assign(clone, { media: normalized })
  } else {
    delete clone.media
  }
  return clone
}

type MediaEditorProps = {
  items: MediaEntry[]
  onChange: (next: MediaEntry[]) => void
  title?: string
  description?: string
}

export function MediaEditor({ items, onChange, title, description }: MediaEditorProps) {
  const [isUploading, setIsUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const hasDefault = useMemo(() => items.some((item) => item.predeterminada), [items])

  const handleUploadClick = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const handleFileChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      if (!file) return
      setIsUploading(true)
      setUploadError(null)
      try {
        const form = new FormData()
        form.append("file", file, file.name)
        const response = await fetch("/api/settings/media/upload", {
          method: "POST",
          body: form,
        })
        if (!response.ok) {
          const data = (await response.json().catch(() => ({}))) as { error?: string }
          throw new Error(data.error || "upload_failed")
        }
        const data = (await response.json()) as { url: string }
        const nextEntry: MediaEntry = {
          id: randomId(),
          url: data.url,
          descripcion: file.name,
          tipo: DEFAULT_TYPE,
          predeterminada: !hasDefault,
        }
        onChange([...items, nextEntry])
      } catch (error) {
        setUploadError(error instanceof Error ? error.message : "upload_failed")
      } finally {
        setIsUploading(false)
        if (event.target) {
          event.target.value = ""
        }
      }
    },
    [hasDefault, items, onChange],
  )

  const handleUpdate = useCallback(
    (id: string, patch: Partial<Omit<MediaEntry, "id">>) => {
    onChange(
      items.map((item) => (item.id === id ? { ...item, ...patch, descripcion: patch.descripcion ?? item.descripcion } : item)),
    )
    },
    [items, onChange],
  )

  const handleRemove = useCallback(
    (id: string) => {
      const removed = items.find((item) => item.id === id)
      const filtered = items.filter((item) => item.id !== id)
      if (removed?.predeterminada && filtered.length) {
        filtered[0] = { ...filtered[0], predeterminada: true }
      }
      onChange(filtered)
    },
    [items, onChange],
  )

  const handleDefault = useCallback(
    (id: string) => {
      onChange(items.map((item) => ({ ...item, predeterminada: item.id === id })))
    },
    [items, onChange],
  )

  return (
    <div className="space-y-3 rounded-2xl border border-dashed border-muted/60 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold">{title ?? "Imágenes"}</p>
          <p className="text-xs text-muted-foreground">{description ?? "Sube imágenes representativas."}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" type="button" onClick={handleUploadClick} disabled={isUploading}>
            <IconUpload className="me-2 size-4" />
            {isUploading ? "Subiendo..." : "Agregar imagen"}
          </Button>
          {uploadError ? <p className="text-xs text-destructive">{uploadError}</p> : null}
        </div>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />
      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-muted/60 py-6 text-center text-sm text-muted-foreground">
          Añade al menos una imagen para que esté disponible en los catálogos.
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <div key={item.id} className="rounded-2xl border border-border/80 p-3">
              <div className="flex flex-wrap items-start gap-3">
                <div className="h-20 w-20 overflow-hidden rounded-lg border border-muted/40 bg-muted/10">
                  {item.url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.url} alt={item.descripcion || "Imagen"} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
                      No hay vista previa
                    </div>
                  )}
                </div>
                <div className="flex-1 space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label>URL</Label>
                      <Input
                        value={item.url}
                        onChange={(event) => handleUpdate(item.id, { url: event.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Tipo</Label>
                      <Select
                        value={item.tipo}
                        onValueChange={(value) =>
                          handleUpdate(item.id, { tipo: value as MediaEntry["tipo"] })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Tipo" />
                        </SelectTrigger>
                        <SelectContent>
                          {MEDIA_TYPES.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label>Descripción</Label>
                      <Textarea
                        rows={2}
                        value={item.descripcion ?? ""}
                        onChange={(event) =>
                          handleUpdate(item.id, {
                            descripcion: event.target.value || null,
                          })
                        }
                        placeholder="Contexto o etiquetas"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Acciones</Label>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant={item.predeterminada ? "secondary" : "outline"}
                          onClick={() => handleDefault(item.id)}
                        >
                          <IconStar className="me-2 size-4" />
                          {item.predeterminada ? "Predeterminada" : "Marcar predeterminada"}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => handleRemove(item.id)}>
                          <IconTrash className="me-2 size-4" />
                          Eliminar
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
