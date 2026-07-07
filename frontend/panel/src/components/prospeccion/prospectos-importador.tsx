"use client"

import { useCallback, useMemo, useState, type ChangeEvent } from "react"
import { IconAlertTriangle, IconCircleCheck, IconDownload, IconLoader, IconUpload } from "@tabler/icons-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import {
  importarProspectos,
  type ProspectoImportSummary,
  type ProspectoManualInput,
} from "@/lib/prospeccion/prospectos-client"

type ImportStatus = "idle" | "parsing" | "ready" | "importing" | "success" | "error"

type ProspectoImportadorProps = {
  onImported?: (summary: ProspectoImportSummary) => void
}

type ProspectoImportError = {
  row: number
  message: string
}

type ParsedProspectoPreview = {
  displayName: string
  contact: string
  empresa: string
  email: string
  phone: string
  persona: string
}

const ACCEPTED_FILE_EXT = ".csv,.xlsx,.xls"
const MAX_IMPORT_ROWS = 2000
const PROSPECT_TEMPLATE_HEADERS = [
  "Nombre visible",
  "Empresa / nombre comercial",
  "Título",
  "Nombre",
  "Primer apellido",
  "Segundo apellido",
  "Correo",
  "Teléfono",
  "Sitio web",
  "Dirección",
  "Segmento",
  "Actividad",
] as const
const PROSPECT_TEMPLATE_EXAMPLE = [
  "Grupo Demo",
  "Grupo Demo SA de CV",
  "Ing.",
  "Ana",
  "Lopez",
  "Garcia",
  "ana@ejemplo.com",
  "+52 55 1111 2222",
  "https://ejemplo.com",
  "Av. Reforma 123, CDMX",
  "Servicios",
  "Consultoría",
]

type ProspectoImportField =
  | "display_name"
  | "nombre_comercial"
  | "titulo"
  | "nombre"
  | "primer_apellido"
  | "segundo_apellido"
  | "actividad"
  | "phone"
  | "email"
  | "website"
  | "address"
  | "segmento"

const HEADER_ALIASES: Record<string, ProspectoImportField> = {
  displayname: "display_name",
  nombrevisible: "display_name",
  nombrevisibleprospecto: "display_name",
  nombre: "nombre",
  nombrecontacto: "nombre",
  firstname: "nombre",
  nombres: "nombre",
  primerapellido: "primer_apellido",
  apellidopaterno: "primer_apellido",
  lastname: "primer_apellido",
  segundoapellido: "segundo_apellido",
  apellidomaterno: "segundo_apellido",
  title: "titulo",
  titulo: "titulo",
  honorifico: "titulo",
  empresa: "nombre_comercial",
  compania: "nombre_comercial",
  companyname: "nombre_comercial",
  company: "nombre_comercial",
  nombredelaempresa: "nombre_comercial",
  nombredeempresa: "nombre_comercial",
  razonsocial: "nombre_comercial",
  nombrecomercial: "nombre_comercial",
  actividad: "actividad",
  giro: "actividad",
  telefono: "phone",
  phone: "phone",
  celular: "phone",
  movil: "phone",
  correo: "email",
  email: "email",
  mail: "email",
  sitioweb: "website",
  website: "website",
  web: "website",
  direccion: "address",
  address: "address",
  segmento: "segmento",
}

function normalizeHeader(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "")
}

function normalizeCell(value: unknown): string {
  if (typeof value === "string") return value.trim()
  if (typeof value === "number" && Number.isFinite(value)) return String(value).trim()
  if (typeof value === "boolean") return value ? "true" : "false"
  if (value === null || value === undefined) return ""
  return String(value).trim()
}

function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = filename
  anchor.rel = "noopener noreferrer"
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

function composeDisplayName(item: ProspectoManualInput): string {
  const explicit = normalizeCell(item.display_name)
  if (explicit) return explicit
  const company = normalizeCell(item.nombre_comercial)
  if (company) return company
  const person = [item.nombre, item.primer_apellido, item.segundo_apellido]
    .map((value) => normalizeCell(value))
    .filter(Boolean)
    .join(" ")
  if (person) return person
  return ""
}

function rowToProspecto(row: Record<string, unknown>): ProspectoManualInput | null {
  const mapped: Partial<Record<ProspectoImportField, string>> = {}
  for (const [header, value] of Object.entries(row)) {
    const normalizedHeader = normalizeHeader(header)
    const field = HEADER_ALIASES[normalizedHeader]
    if (!field) continue
    const text = normalizeCell(value)
    if (!text) continue
    mapped[field] = text
  }

  const explicitDisplayName = normalizeCell(mapped.display_name) || normalizeCell(mapped.nombre_comercial)
  const display_name_for_preview = composeDisplayName(mapped)
  if (!display_name_for_preview) {
    return null
  }

  return {
    display_name: explicitDisplayName || undefined,
    nombre_comercial: normalizeCell(mapped.nombre_comercial) || undefined,
    titulo: normalizeCell(mapped.titulo) || undefined,
    nombre: normalizeCell(mapped.nombre) || undefined,
    primer_apellido: normalizeCell(mapped.primer_apellido) || undefined,
    segundo_apellido: normalizeCell(mapped.segundo_apellido) || undefined,
    actividad: normalizeCell(mapped.actividad) || undefined,
    phone: normalizeCell(mapped.phone) || undefined,
    email: normalizeCell(mapped.email) || undefined,
    website: normalizeCell(mapped.website) || undefined,
    address: normalizeCell(mapped.address) || undefined,
    segmento: normalizeCell(mapped.segmento) || undefined,
  }
}

async function downloadProspectTemplate(): Promise<void> {
  const workbookModule = await import("xlsx")
  const worksheet = workbookModule.utils.aoa_to_sheet([
    [...PROSPECT_TEMPLATE_HEADERS],
    [...PROSPECT_TEMPLATE_EXAMPLE],
  ])
  const workbook = workbookModule.utils.book_new()
  workbookModule.utils.book_append_sheet(workbook, worksheet, "Prospectos")
  const buffer = workbookModule.write(workbook, { bookType: "xlsx", type: "array" }) as ArrayBuffer
  downloadBlob(
    "plantilla_importacion_prospectos.xlsx",
    new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
  )
}

async function parseImportedFile(file: File): Promise<{
  items: ProspectoManualInput[]
  preview: ParsedProspectoPreview[]
  errors: ProspectoImportError[]
}> {
  const workbookModule = await import("xlsx")
  const workbook =
    file.name.toLowerCase().endsWith(".csv")
      ? workbookModule.read(await file.text(), { type: "string" })
      : workbookModule.read(await file.arrayBuffer(), { type: "array" })
  const sheetName = workbook.SheetNames[0]
  if (!sheetName) {
    return { items: [], preview: [], errors: [{ row: 0, message: "El archivo no contiene hojas válidas." }] }
  }
  const sheet = workbook.Sheets[sheetName]
  const rows = workbookModule.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
    raw: false,
  })
  const items: ProspectoManualInput[] = []
  const preview: ParsedProspectoPreview[] = []
  const errors: ProspectoImportError[] = []

  rows.forEach((row, index) => {
    const item = rowToProspecto(row)
    if (!item) {
      errors.push({
        row: index + 2,
        message: "La fila no tiene nombre visible, empresa o nombre de persona.",
      })
      return
    }
    if (items.length >= MAX_IMPORT_ROWS) {
      errors.push({
        row: index + 2,
        message: `Se alcanzó el máximo de ${MAX_IMPORT_ROWS} filas por importación.`,
      })
      return
    }
    items.push(item)
    if (preview.length < 3) {
      const previewDisplayName = composeDisplayName(item)
      preview.push({
        displayName: previewDisplayName,
        contact: [normalizeCell(item.phone), normalizeCell(item.email)].filter(Boolean).join(" · "),
        empresa: normalizeCell(item.nombre_comercial),
        email: normalizeCell(item.email),
        phone: normalizeCell(item.phone),
        persona: [normalizeCell(item.titulo), normalizeCell(item.nombre), normalizeCell(item.primer_apellido), normalizeCell(item.segundo_apellido)]
          .filter(Boolean)
          .join(" "),
      })
    }
  })

  return { items, preview, errors }
}

export function ProspectosImportador({ onImported }: ProspectoImportadorProps) {
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState<ImportStatus>("idle")
  const [file, setFile] = useState<File | null>(null)
  const [parsedItems, setParsedItems] = useState<ProspectoManualInput[]>([])
  const [previewRows, setPreviewRows] = useState<ParsedProspectoPreview[]>([])
  const [errors, setErrors] = useState<ProspectoImportError[]>([])
  const [summary, setSummary] = useState<ProspectoImportSummary | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const validItemCount = parsedItems.length
  const invalidCount = errors.length
  const readyToImport = validItemCount > 0 && status === "ready"
  const isImporting = status === "importing"

  const handleOpenChange = useCallback((nextOpen: boolean) => {
    setOpen(nextOpen)
    if (!nextOpen) {
      setStatus("idle")
      setFile(null)
      setParsedItems([])
      setPreviewRows([])
      setErrors([])
      setSummary(null)
      setErrorMessage(null)
    }
  }, [])

  const handleFileChange = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const nextFile = event.target.files?.[0] ?? null
    setFile(nextFile)
    setSummary(null)
    setErrorMessage(null)
    setParsedItems([])
    setPreviewRows([])
    setErrors([])
    if (!nextFile) {
      setStatus("idle")
      return
    }
    setStatus("parsing")
    try {
      const parsed = await parseImportedFile(nextFile)
      setParsedItems(parsed.items)
      setPreviewRows(parsed.preview)
      setErrors(parsed.errors)
      setStatus(parsed.items.length ? "ready" : "error")
      if (!parsed.items.length) {
        setErrorMessage(parsed.errors[0]?.message ?? "El archivo no contiene filas importables.")
      }
    } catch (err) {
      setStatus("error")
      setErrorMessage(err instanceof Error ? err.message : "No se pudo leer el archivo.")
    }
  }, [])

  const handleImport = useCallback(async () => {
    if (!parsedItems.length) {
      setErrorMessage("Selecciona un archivo con filas válidas antes de importar.")
      return
    }
    setStatus("importing")
    setErrorMessage(null)
    try {
      const response = await importarProspectos({ items: parsedItems })
      setSummary(response)
      setStatus("success")
      onImported?.(response)
    } catch (err) {
      setStatus("error")
      setErrorMessage(err instanceof Error ? err.message : "No se pudo importar el archivo.")
    }
  }, [onImported, parsedItems])

  const handleDownloadTemplate = useCallback(() => {
    void downloadProspectTemplate()
  }, [])

  const fileLabel = useMemo(() => file?.name ?? "", [file])

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        <IconUpload className="mr-1.5 size-4" />
        Importar lote
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Importar prospectos en lote</DialogTitle>
            <DialogDescription>
              Sube un archivo CSV, XLS o XLSX con columnas como empresa, nombre, apellidos, correo y teléfono.
              Los registros se guardan como prospectos del tenant y quedan listos para campañas de correo o WhatsApp.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/30 p-3">
              <div className="space-y-1">
                <p className="text-sm font-medium">Plantilla descargable</p>
                <p className="text-xs text-muted-foreground">
                  Descarga un archivo base con encabezados listos para completar y volver a importar.
                </p>
              </div>
              <Button type="button" variant="secondary" size="sm" onClick={() => void handleDownloadTemplate()}>
                <IconDownload className="mr-1.5 size-4" />
                Descargar plantilla
              </Button>
            </div>

            <div className="space-y-1">
              <Input type="file" accept={ACCEPTED_FILE_EXT} onChange={handleFileChange} />
              <p className="text-xs text-muted-foreground">
                Columnas sugeridas: empresa, título, nombre, primer apellido, segundo apellido, correo, teléfono,
                sitio web, dirección y segmento.
              </p>
            </div>

            {fileLabel ? (
              <div className="rounded-lg border bg-muted/40 p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium">{fileLabel}</p>
                  <p className="text-xs text-muted-foreground">
                    {validItemCount.toLocaleString("es-MX")} filas válidas · {invalidCount.toLocaleString("es-MX")} filas inválidas
                  </p>
                </div>
                {previewRows.length ? (
                  <div className="mt-3 space-y-2">
                    {previewRows.map((row, index) => (
                      <div key={`${row.displayName}-${index}`} className="rounded-md border bg-background px-3 py-2 text-xs">
                        <p className="font-medium text-foreground">{row.displayName || "Sin nombre"}</p>
                        <p className="text-muted-foreground">
                          {row.persona || "Persona no indicada"}
                          {row.empresa ? ` · ${row.empresa}` : ""}
                        </p>
                        <p className="text-muted-foreground">
                          {row.contact || "Sin contacto"}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}

            {errors.length ? (
              <div className="max-h-40 space-y-2 overflow-y-auto rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-200">
                {errors.slice(0, 10).map((item) => (
                  <div key={`${item.row}-${item.message}`} className="flex items-start gap-2">
                    <IconAlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                    <p>
                      Fila {item.row}: {item.message}
                    </p>
                  </div>
                ))}
                {errors.length > 10 ? (
                  <p className="text-muted-foreground">Y {errors.length - 10} errores más.</p>
                ) : null}
              </div>
            ) : null}

            {summary ? (
              <div className="rounded-lg border bg-emerald-500/10 p-3 text-sm text-emerald-900 dark:text-emerald-200">
                <div className="flex items-center gap-2">
                  <IconCircleCheck className="size-4" />
                  <span className="font-medium">Importación completada</span>
                </div>
                <p className="mt-1 text-xs">
                  {summary.created.toLocaleString("es-MX")} prospectos creados · {summary.skipped.toLocaleString("es-MX")} omitidos · {summary.total.toLocaleString("es-MX")} filas procesadas
                </p>
              </div>
            ) : null}

            {errorMessage ? (
              <p className={cn("text-sm", status === "success" ? "text-emerald-700" : "text-destructive")}>
                {errorMessage}
              </p>
            ) : null}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => handleOpenChange(false)} type="button">
              Cerrar
            </Button>
            <Button onClick={() => void handleImport()} disabled={!readyToImport || isImporting}>
              {isImporting ? (
                <>
                  <IconLoader className="mr-2 size-4 animate-spin" />
                  Importando...
                </>
              ) : (
                "Importar prospectos"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
