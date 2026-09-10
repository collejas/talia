"use client"

import { useCallback, useMemo, useState, type ChangeEvent } from "react"
import { IconAlertTriangle, IconCircleCheck, IconDownload, IconLoader, IconUpload } from "@tabler/icons-react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { importarContactos, type ContactImportItem, type ContactImportSummary } from "@/lib/contactos/import-client"

type ImportStatus = "idle" | "parsing" | "ready" | "importing" | "success" | "error"

const MAX_IMPORT_ROWS = 2000
const ACCEPTED_FILE_EXT = ".csv,.xlsx"
const TEMPLATE_HEADERS: string[] = [
  "Nombre", "Primer apellido", "Segundo apellido", "Correo", "Teléfono", "Empresa",
  "Puesto", "Área", "Rol de decisión", "Estado", "Sitio web", "Tipo de vialidad",
  "Nombre de vialidad", "Número exterior", "Número interior", "Colonia", "Código postal",
  "Entidad", "Municipio", "País", "Notas",
]

type ContactImportField = keyof ContactImportItem
type PreviewRow = { name: string; contact: string; company: string }

const HEADER_ALIASES: Record<string, ContactImportField> = {
  nombre: "nombre", nombres: "nombre", nombrecontacto: "nombre",
  primerapellido: "apellido_paterno", apellidopaterno: "apellido_paterno",
  segundoapellido: "apellido_materno", apellidomaterno: "apellido_materno",
  correo: "correo_principal", email: "correo_principal", mail: "correo_principal",
  telefono: "telefono_principal_e164", celular: "telefono_principal_e164", movil: "telefono_principal_e164", phone: "telefono_principal_e164",
  empresa: "company_name", compania: "company_name", nombrecomercial: "company_name", razonsocial: "company_name",
  puesto: "puesto", cargo: "puesto", area: "area", roldedecision: "rol_decision",
  estado: "estado", website: "website", sitioweb: "website", web: "website",
  tipovialidad: "tipo_vialidad", nombredevialidad: "nombre_vialidad", nombrevialidad: "nombre_vialidad",
  numeroexterior: "numero_exterior", noexterior: "numero_exterior", numerointerior: "numero_interior", nointerior: "numero_interior",
  colonia: "colonia", codigopostal: "codigo_postal", cpostal: "codigo_postal",
  entidad: "entidad", estadoentidad: "entidad", municipio: "municipio", pais: "pais", notas: "notas", observaciones: "notas",
}

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "")
}

function cell(value: unknown): string {
  if (typeof value === "string") return value.trim()
  if (typeof value === "number" && Number.isFinite(value)) return String(value).trim()
  return value == null ? "" : String(value).trim()
}

function displayName(item: ContactImportItem): string {
  return [item.nombre, item.apellido_paterno, item.apellido_materno].map(cell).filter(Boolean).join(" ") || cell(item.company_name) || cell(item.telefono_principal_e164)
}

function rowToContact(row: Record<string, unknown>): ContactImportItem | null {
  const item: ContactImportItem = {}
  for (const [header, raw] of Object.entries(row)) {
    const field = HEADER_ALIASES[normalizeHeader(header)]
    const value = cell(raw)
    if (field && value) item[field] = value
  }
  const name = displayName(item)
  return name ? { ...item, display_name: name, origen: "importacion_contactos" } : null
}

async function parseFile(file: File): Promise<{ items: ContactImportItem[]; preview: PreviewRow[]; errors: string[] }> {
  const xlsx = await import("xlsx")
  const workbook = file.name.toLowerCase().endsWith(".csv")
    ? xlsx.read(await file.text(), { type: "string" })
    : xlsx.read(await file.arrayBuffer(), { type: "array" })
  const sheetName = workbook.SheetNames[0]
  if (!sheetName) return { items: [], preview: [], errors: ["El archivo no contiene hojas válidas."] }
  const rows = xlsx.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheetName], { defval: "", raw: false })
  const items: ContactImportItem[] = []
  const preview: PreviewRow[] = []
  const errors: string[] = []
  rows.forEach((row, index) => {
    if (items.length >= MAX_IMPORT_ROWS) {
      errors.push(`Fila ${index + 2}: se alcanzó el máximo de ${MAX_IMPORT_ROWS} filas.`)
      return
    }
    const item = rowToContact(row)
    if (!item) {
      errors.push(`Fila ${index + 2}: no contiene nombre, empresa o teléfono.`)
      return
    }
    items.push(item)
    if (preview.length < 3) {
      preview.push({ name: displayName(item), contact: [item.correo_principal, item.telefono_principal_e164].filter(Boolean).join(" · "), company: cell(item.company_name) })
    }
  })
  return { items, preview, errors }
}

function downloadTemplate() {
  void import("xlsx").then((xlsx) => {
    const sheet = xlsx.utils.aoa_to_sheet([TEMPLATE_HEADERS, ["Ana", "López", "García", "ana@ejemplo.com", "+525500000000", "Empresa Demo"]])
    const workbook = xlsx.utils.book_new()
    xlsx.utils.book_append_sheet(workbook, sheet, "Contactos")
    const buffer = xlsx.write(workbook, { bookType: "xlsx", type: "array" }) as ArrayBuffer
    const url = URL.createObjectURL(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }))
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = "plantilla_importacion_contactos.xlsx"
    anchor.click()
    URL.revokeObjectURL(url)
  })
}

export function ContactosImportador({ onImported }: { onImported?: (summary: ContactImportSummary) => void }) {
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState<ImportStatus>("idle")
  const [file, setFile] = useState<File | null>(null)
  const [items, setItems] = useState<ContactImportItem[]>([])
  const [preview, setPreview] = useState<PreviewRow[]>([])
  const [parseErrors, setParseErrors] = useState<string[]>([])
  const [summary, setSummary] = useState<ContactImportSummary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const importing = status === "importing"
  const reset = useCallback(() => { setStatus("idle"); setFile(null); setItems([]); setPreview([]); setParseErrors([]); setSummary(null); setError(null) }, [])
  const handleFile = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const nextFile = event.target.files?.[0] ?? null
    reset(); setFile(nextFile)
    if (!nextFile) return
    setStatus("parsing")
    try {
      const parsed = await parseFile(nextFile)
      setItems(parsed.items); setPreview(parsed.preview); setParseErrors(parsed.errors); setStatus(parsed.items.length ? "ready" : "error")
      if (!parsed.items.length) setError(parsed.errors[0] || "El archivo no contiene filas importables.")
    } catch (value) { setStatus("error"); setError(value instanceof Error ? value.message : "No se pudo leer el archivo.") }
  }, [reset])
  const handleImport = useCallback(async () => {
    if (!items.length) return
    setStatus("importing"); setError(null)
    try { const result = await importarContactos(items); setSummary(result); setStatus("success"); onImported?.(result) }
    catch (value) { setStatus("error"); setError(value instanceof Error ? value.message : "No se pudo importar el archivo.") }
  }, [items, onImported])
  const statusText = useMemo(() => status === "parsing" ? "Leyendo archivo…" : importing ? "Importando contactos…" : "", [importing, status])

  return <>
    <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
      <IconUpload className="mr-1.5 size-4" /> Importar contactos
    </Button>
    <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) reset() }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Importar contactos</DialogTitle>
          <DialogDescription>Sube un CSV o XLSX. Los contactos quedarán asignados automáticamente a tu usuario.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/30 p-3">
            <div><p className="text-sm font-medium">Plantilla descargable</p><p className="text-xs text-muted-foreground">Usa los encabezados de la plantilla para evitar errores.</p></div>
            <Button type="button" variant="secondary" size="sm" onClick={downloadTemplate}><IconDownload className="mr-1.5 size-4" />Descargar plantilla</Button>
          </div>
          <Input type="file" accept={ACCEPTED_FILE_EXT} onChange={handleFile} disabled={importing} />
          <p className="text-xs text-muted-foreground">Se aceptan CSV y XLSX, hasta {MAX_IMPORT_ROWS.toLocaleString("es-MX")} filas. No incluyas vendedor: se toma de tu sesión.</p>
          {statusText ? <p className="flex items-center gap-2 text-sm text-muted-foreground"><IconLoader className="size-4 animate-spin" />{statusText}</p> : null}
          {file && status !== "parsing" ? <div className="rounded-lg border bg-muted/40 p-3 text-sm"><p className="font-medium">{file.name}</p><p className="text-xs text-muted-foreground">{items.length.toLocaleString("es-MX")} filas válidas · {parseErrors.length.toLocaleString("es-MX")} filas omitidas antes de importar</p>{preview.length ? <div className="mt-3 space-y-2">{preview.map((row, index) => <div key={`${row.name}-${index}`} className="rounded-md border bg-background px-3 py-2 text-xs"><p className="font-medium">{row.name}</p><p className="text-muted-foreground">{row.company || "Sin empresa"}{row.contact ? ` · ${row.contact}` : ""}</p></div>)}</div> : null}</div> : null}
          {parseErrors.length ? <div className="max-h-32 overflow-y-auto rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-200"><p className="flex items-center gap-2 font-medium"><IconAlertTriangle className="size-4" />Filas no importables</p>{parseErrors.slice(0, 8).map((message) => <p key={message} className="mt-1">{message}</p>)}</div> : null}
          {error ? <p className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}
          {summary ? <div className="rounded-lg border bg-emerald-500/10 p-3 text-sm text-emerald-900 dark:text-emerald-200"><p className="flex items-center gap-2 font-medium"><IconCircleCheck className="size-4" />Importación completada</p><p className="mt-1 text-xs">{summary.created.toLocaleString("es-MX")} creados · {summary.skipped.toLocaleString("es-MX")} omitidos · {summary.failed.toLocaleString("es-MX")} con error.</p></div> : null}
        </div>
        <DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cerrar</Button><Button type="button" onClick={() => void handleImport()} disabled={!items.length || importing || status === "success"}>{importing ? "Importando…" : "Importar contactos"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </>
}
