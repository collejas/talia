"use client"

import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from "react"
import Link from "next/link"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

import {
  ImporterImportSummary,
  ImporterScheme,
} from "@/app/settings/productos/importador/types"

type ImportStatus = "idle" | "uploading" | "success" | "error"

const ACCEPTED_FILE_EXT = ".csv,.xlsx,.xls"

function friendlyImportRequestError(message: string): string {
  const normalized = message.toLowerCase()
  if (normalized.includes("xlrd_required")) {
    return "El servidor todavía no puede leer archivos .xls. Usa .xlsx o CSV, o solicita habilitar este formato."
  }
  if (normalized.includes("openpyxl_required")) {
    return "El servidor todavía no puede leer archivos .xlsx. Usa CSV o solicita habilitar este formato."
  }
  if (normalized.includes("empty_file")) {
    return "El archivo está vacío. Agrega al menos una fila de productos."
  }
  if (normalized.includes("scheme_id_required")) {
    return "Selecciona el esquema de importación antes de continuar."
  }
  if (normalized.includes("file_required") || normalized.includes("invalid_payload")) {
    return "Selecciona un archivo CSV o Excel válido antes de continuar."
  }
  if (normalized.includes("401") || normalized.includes("sesión")) {
    return "Tu sesión caducó. Vuelve a iniciar sesión e inténtalo nuevamente."
  }
  if (normalized.includes("403") || normalized.includes("permisos")) {
    return "No tienes permisos para importar productos."
  }
  if (normalized.includes("500") || normalized.includes("internal server error")) {
    return "No se pudo procesar el archivo. Revisa su formato e inténtalo nuevamente."
  }
  return "No se pudo procesar el archivo. Revisa los datos e inténtalo nuevamente."
}

export type ProductMetadataImporterUploaderProps = {
  initialSchemes: ImporterScheme[]
}

export function ProductMetadataImporterUploader({ initialSchemes }: ProductMetadataImporterUploaderProps) {
  const [schemes, setSchemes] = useState<ImporterScheme[]>(initialSchemes)
  const [selectedSchemeId, setSelectedSchemeId] = useState<string | null>(initialSchemes[0]?.id ?? null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [status, setStatus] = useState<ImportStatus>("idle")
  const [error, setError] = useState<string | null>(null)
  const [summary, setSummary] = useState<ImporterImportSummary | null>(null)

  useEffect(() => {
    let active = true
    fetch("/api/settings/productos/importador/schemes")
      .then((response) => response.json())
      .then((payload: ImporterScheme[]) => {
        if (!active) return
        if (!payload || !payload.length) return
        setSchemes(payload)
        if (!selectedSchemeId) {
          setSelectedSchemeId(payload[0]?.id ?? null)
        }
      })
      .catch(() => {
        // Silencia errores; se muestran cuando se intenta importar.
      })
    return () => {
      active = false
    }
  }, [selectedSchemeId])

  const selectedScheme = useMemo(() => schemes.find((scheme) => scheme.id === selectedSchemeId) ?? null, [schemes, selectedSchemeId])

  const handleFileChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setSelectedFile(event.target.files?.[0] ?? null)
  }, [])

  const handleSubmit = useCallback(async () => {
    if (!selectedSchemeId || !selectedFile) {
      setError("Selecciona un esquema y un archivo antes de subir.")
      return
    }
    setStatus("uploading")
    setError(null)
    setSummary(null)

    const formData = new FormData()
    formData.append("scheme_id", selectedSchemeId)
    formData.append("file", selectedFile, selectedFile.name || "import")

    try {
      const response = await fetch("/api/settings/productos/importador/upload", {
        method: "POST",
        body: formData,
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok || !payload) {
        throw new Error(friendlyImportRequestError(payload?.error ?? "error"))
      }
      setSummary(payload)
      setStatus("success")
      setSelectedFile(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo procesar el archivo.")
      setStatus("error")
    }
  }, [selectedFile, selectedSchemeId])

  const isButtonDisabled = useMemo(() => status === "uploading" || !selectedFile || !selectedSchemeId, [status, selectedFile, selectedSchemeId])

  return (
    <Card>
      <CardHeader>
        <CardTitle>Importar productos</CardTitle>
          <p className="text-sm text-muted-foreground">
            Sube un CSV o Excel. La columna <code>codigo</code> identifica el producto y permite actualizar nombre,
            descripción, precio base, listas de precios y jerarquía sin duplicarlo. Para renombrar líneas, familias o
            modelos incluye sus códigos estables. Las columnas de listas de precios se obtienen desde la plantilla y
            requieren permisos de administrador. <Link className="text-primary" href="/settings/productos/ayuda">Ver guía</Link>
          </p>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-1">
            <Label>Esquema</Label>
            <Select value={selectedSchemeId ?? ""} onValueChange={(value) => setSelectedSchemeId(value || null)}>
              <SelectTrigger>
                <SelectValue placeholder="Selecciona un esquema" />
              </SelectTrigger>
              <SelectContent>
                {schemes.map((scheme) => (
                  <SelectItem key={scheme.id} value={scheme.id}>
                    {scheme.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Archivo</Label>
            <Input type="file" accept={ACCEPTED_FILE_EXT} onChange={handleFileChange} />
            {selectedFile && <p className="text-xs text-muted-foreground">{selectedFile.name}</p>}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={handleSubmit} disabled={isButtonDisabled} variant="default">
            {status === "uploading" ? "Cargando…" : "Subir y procesar"}
          </Button>
          {status === "success" && <Badge variant="outline">Importación exitosa</Badge>}
          {status === "error" && <Badge variant="destructive">Error</Badge>}
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        {selectedScheme && (
          <p className="text-xs text-muted-foreground">{selectedScheme.description ?? ""}</p>
        )}
        {summary && (
          <div className="rounded-2xl border border-border/70 bg-muted/50 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">Resumen de carga</p>
              <Badge>{summary.total} filas</Badge>
            </div>
            <div className="grid grid-cols-3 gap-3 text-sm">
              <p className="text-muted-foreground">Creadas: <strong>{summary.created}</strong></p>
              <p className="text-muted-foreground">Actualizadas: <strong>{summary.updated}</strong></p>
              <p className="text-muted-foreground">Errores: <strong>{summary.errors.length}</strong></p>
            </div>
            {summary.errors.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Detalles de errores</span>
                  <Badge variant="destructive">{summary.errors.length}</Badge>
                </div>
                <div className="space-y-2 max-h-48 overflow-y-auto text-xs">
                  {summary.errors.map((item) => (
                    <div key={`${item.row}-${item.message}`} className="rounded-xl border border-destructive/30 bg-destructive/10 p-2">
                      <p>
                        <strong>Fila {item.row}:</strong> {item.message}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
