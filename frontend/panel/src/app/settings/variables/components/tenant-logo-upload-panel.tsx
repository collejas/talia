"use client"

import { ChangeEvent, useRef, useState } from "react"

import { Button } from "@/components/ui/button"

type LogoAsset = { file_url?: string | null; error?: string }

export function TenantLogoUploadPanel({ initialLogoUrl = "", showRequiredMarkers = false }: { initialLogoUrl?: string | null; showRequiredMarkers?: boolean }) {
  const [logoUrl, setLogoUrl] = useState(initialLogoUrl ?? "")
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const uploadLogo = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    setLoading(true)
    setMessage(null)
    setError(null)
    try {
      const uploadData = new FormData()
      uploadData.append("file", file, file.name || "logo.png")
      uploadData.append("nombre", "Logo de la organización")
      const uploadResponse = await fetch("/api/settings/logos", { method: "POST", body: uploadData })
      const uploadPayload = await uploadResponse.json() as LogoAsset
      if (!uploadResponse.ok || !uploadPayload.file_url) {
        throw new Error(uploadPayload.error || "No se pudo cargar el logo.")
      }

      const saveResponse = await fetch("/api/settings/variables", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logo_url: uploadPayload.file_url }),
      })
      if (!saveResponse.ok) {
        const savePayload = await saveResponse.json().catch(() => null) as { error?: string } | null
        throw new Error(savePayload?.error || "El logo se cargó, pero no se pudo asociar a la organización.")
      }
      setLogoUrl(uploadPayload.file_url)
      setMessage("Logo guardado correctamente.")
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo guardar el logo.")
    } finally {
      setLoading(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  return (
    <section className="space-y-4 rounded-lg border bg-muted/20 p-4">
      <div>
        <h3 className="font-medium">Logo de la organización{showRequiredMarkers ? <span className="text-destructive" aria-hidden="true"> *</span> : null}</h3>
        <p className="text-sm text-muted-foreground">Carga una imagen para utilizarla en cotizaciones, correos y materiales comerciales.</p>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex h-24 w-40 items-center justify-center rounded-md border bg-white p-3 dark:bg-background">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="Logo de la organización" className="max-h-full max-w-full object-contain" />
          ) : <span className="text-sm text-muted-foreground">Sin logo</span>}
        </div>
        <div className="space-y-2">
          <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" onChange={(event) => void uploadLogo(event)} />
          <Button type="button" variant="outline" disabled={loading} onClick={() => fileInputRef.current?.click()}>
            {loading ? "Cargando…" : logoUrl ? "Cambiar logo" : "Cargar logo"}
          </Button>
          <p className="text-xs text-muted-foreground">Formatos permitidos: PNG, JPG, WEBP o SVG.</p>
        </div>
      </div>
      {message ? <p className="text-sm text-emerald-600">{message}</p> : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </section>
  )
}
