"use client"

import { useCallback, useMemo, useState } from "react"
import { IconPhotoPlus, IconTrash, IconStar } from "@tabler/icons-react"

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
  const [draftUrl, setDraftUrl] = useState("")
  const [draftDescripcion, setDraftDescripcion] = useState("")
  const [draftTipo, setDraftTipo] = useState<(typeof MEDIA_TYPES)[number]["value"]>(DEFAULT_TYPE)

  const hasDefault = useMemo(() => items.some((item) => item.predeterminada), [items])

  const resetDraft = useCallback(() => {
    setDraftUrl("")
    setDraftDescripcion("")
    setDraftTipo(DEFAULT_TYPE)
  }, [])

  const handleAdd = useCallback(() => {
    const url = draftUrl.trim()
    if (!url) {
      return
    }
    const nextEntry: MediaEntry = {
      id: randomId(),
      url,
      descripcion: draftDescripcion.trim() || null,
      tipo: draftTipo,
      predeterminada: !hasDefault,
    }
    const nextItems = [...items, nextEntry]
    onChange(nextItems)
    resetDraft()
  }, [draftDescripcion, draftTipo, draftUrl, hasDefault, items, onChange, resetDraft])

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
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold">{title ?? "Imágenes"}</p>
          <p className="text-xs text-muted-foreground">{description ?? "Agrega imágenes representativas."}</p>
        </div>
        <Button size="sm" variant="outline" onClick={handleAdd} disabled={!draftUrl.trim()}>
          <IconPhotoPlus className="me-2 size-4" />
          Agregar
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <Label htmlFor="media-url">URL de la imagen</Label>
          <Input
            id="media-url"
            placeholder="https://"
            value={draftUrl}
            onChange={(event) => setDraftUrl(event.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="media-descripcion">Descripción breve</Label>
          <Textarea
            id="media-descripcion"
            placeholder="Uso o contexto"
            value={draftDescripcion}
            onChange={(event) => setDraftDescripcion(event.target.value)}
            rows={1}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="media-tipo">Tipo</Label>
          <Select value={draftTipo} onValueChange={(value) => setDraftTipo(value as MediaEntry["tipo"])}>
            <SelectTrigger id="media-tipo">
              <SelectValue placeholder="Selecciona un tipo" />
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
