"use client"

import { useEffect, useMemo, useState } from "react"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

type LogoAsset = { id: string; nombre: string; file_url: string }
type Variable = { clave: string; etiqueta: string }
type BlockKind = "text" | "image" | "button" | "divider" | "space" | "columns"
type ColumnElement = { id: string; kind: "text" | "button" | "image"; content: string; href?: string; imageId?: string }
type EmailColumn = { id: string; width: number; elements: ColumnElement[] }
type Block = { id: string; kind: BlockKind; title: string; content: string; imageId?: string; href?: string; columns?: EmailColumn[] }

const CTA_OPTIONS = [
  { label: "Sitio web", value: "{{website_url}}" },
  { label: "Agenda", value: "{{booking_url}}" },
  { label: "Seguimiento", value: "{{tracking_url}}" },
]

const LABELS: Record<string, string> = {
  display_name: "Nombre visible",
  nombre: "Nombre",
  titulo: "Título",
  primer_apellido: "Primer apellido",
  segundo_apellido: "Segundo apellido",
  empresa: "Empresa",
  email: "Correo",
  telefono: "Teléfono",
  segmento: "Segmento",
  canal_origen: "Canal de origen",
  logo_url: "Logo",
  hero_image_url: "Imagen principal",
  product_image_1_url: "Producto 1",
  product_image_2_url: "Producto 2",
  product_image_3_url: "Producto 3",
  product_image_4_url: "Producto 4",
  warranty_image_url: "Garantía",
  tracking_url: "Seguimiento",
  website_url: "Sitio web",
  booking_url: "Agenda",
  booking_link_text: "Texto de agenda",
}

const fallbackVariables: Variable[] = Object.keys(LABELS).map((clave) => ({ clave, etiqueta: LABELS[clave] }))

const makeElement = (kind: ColumnElement["kind"]): ColumnElement => ({
  id: `${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  kind,
  content: kind === "button" ? "Conoce más" : kind === "text" ? "Escribe aquí..." : "",
  href: kind === "button" ? "{{website_url}}" : undefined,
})

const makeBlock = (kind: BlockKind, overrides: Partial<Block> = {}): Block => ({
  id: `${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  kind,
  title: kind === "text" ? "Texto principal" : kind === "button" ? "Botón" : kind === "image" ? "Imagen" : "Nuevo bloque",
  content: kind === "text" ? "Hola, {{nombre}}\n\nEscribe aquí tu mensaje para {{empresa}}." : kind === "button" ? "Quiero conocer más" : "",
  href: kind === "button" ? "{{website_url}}" : undefined,
  columns: kind === "columns" ? [
    { id: `column-left-${Date.now()}`, width: 50, elements: [makeElement("text")] },
    { id: `column-right-${Date.now()}`, width: 50, elements: [makeElement("text")] },
  ] : undefined,
  ...overrides,
})

function initialBlocks(html: string, structure = ""): Block[] {
  if (structure.trim()) {
    try {
      const parsed = JSON.parse(structure) as unknown
      if (Array.isArray(parsed) && parsed.length) return parsed as Block[]
    } catch {
      // Si la estructura no es válida, se conserva la plantilla base.
    }
  }
  if (html.trim()) return [makeBlock("text", { content: html.replace(/<[^>]+>/g, "").trim() || "Escribe aquí tu mensaje." })]
  return [
    makeBlock("image", { title: "Logo" }),
    makeBlock("text", { title: "Texto principal", content: "Hola, {{nombre}}\n\nEncontramos una forma de ayudar a {{empresa}} a conseguir nuevos prospectos y dar seguimiento comercial desde un solo lugar." }),
    makeBlock("columns", { title: "Beneficios" }),
    makeBlock("button", { title: "Botón", content: "Quiero conocer Tal-IA", href: "{{website_url}}" }),
    makeBlock("text", { title: "Firma", content: "Equipo Tal-IA\nVentas inteligentes con IA" }),
  ]
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;")
}

function blockToHtml(block: Block, assets: LogoAsset[]): string {
  if (block.kind === "image") {
    const asset = assets.find((item) => item.id === block.imageId)
    const src = asset ? asset.file_url : "{{logo_url}}"
    return `<img src="${escapeHtml(src)}" alt="" style="display:block;width:100%;max-width:600px;height:auto;margin:20px auto;border:0;" />`
  }
  if (block.kind === "button") return `<p style="text-align:center;margin:24px 0;"><a href="${escapeHtml(block.href || "{{website_url}}")}" style="display:inline-block;background:#171923;color:#fff;border-radius:11px;padding:13px 20px;font-weight:700;text-decoration:none;">${escapeHtml(block.content)}</a></p>`
  if (block.kind === "divider") return `<hr style="border:0;border-top:1px solid #e7e9ef;margin:24px 0;" />`
  if (block.kind === "space") return `<div style="height:38px;"></div>`
  if (block.kind === "columns") {
    const columns = block.columns?.length === 2 ? block.columns : [
      { id: "left", width: 50, elements: [makeElement("text")] },
      { id: "right", width: 50, elements: [makeElement("text")] },
    ]
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${columns.map((column) => `<td width="${column.width}%" valign="top" style="padding:8px;">${column.elements.map((element) => element.kind === "button" ? `<p style="margin:10px 0;"><a href="${escapeHtml(element.href || "{{website_url}}")}" style="display:inline-block;background:#171923;color:#fff;border-radius:11px;padding:10px 14px;font-weight:700;text-decoration:none;">${escapeHtml(element.content)}</a></p>` : element.kind === "image" ? `<img src="${escapeHtml(assets.find((asset) => asset.id === element.imageId)?.file_url || "{{hero_image_url}}")}" alt="" style="display:block;width:100%;height:auto;" />` : `<p style="font-size:14px;line-height:1.6;color:#4d5361;white-space:pre-line;">${escapeHtml(element.content).replaceAll("\n", "<br />")}</p>`).join("")}</td>`).join("")}</tr></table>`
  }
  return `<div style="margin:5px 0;"><p style="font-size:15px;line-height:1.7;color:#4d5361;white-space:pre-line;">${escapeHtml(block.content).replaceAll("\n", "<br />")}</p></div>`
}

type Props = {
  value: string
  assets: LogoAsset[]
  onChange: (value: string) => void
  onStructureChange?: (value: string) => void
  structure?: string
}

export function VisualEmailTemplateEditor({ value, assets, onChange, onStructureChange, structure }: Props) {
  const [blocks, setBlocks] = useState<Block[]>(() => initialBlocks(value, structure))
  const [selectedId, setSelectedId] = useState(() => blocks[0]?.id ?? "")
  const [mobile, setMobile] = useState(false)
  const [variables, setVariables] = useState<Variable[]>(fallbackVariables)

  useEffect(() => {
    let cancelled = false
    void fetch("/api/prospeccion/plantillas/ai?canal=correo", { cache: "no-store" })
      .then((response) => response.json())
      .then((payload) => {
        if (!cancelled && Array.isArray(payload?.items) && payload.items.length) {
          setVariables(payload.items.map((item: { clave?: string; etiqueta?: string }) => ({
            clave: item.clave ?? "",
            etiqueta: item.etiqueta ?? LABELS[item.clave ?? ""] ?? "Dato del prospecto",
          })).filter((item: Variable) => item.clave))
        }
      })
      .catch(() => undefined)
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    onChange(blocks.map((block) => blockToHtml(block, assets)).join("\n"))
    onStructureChange?.(JSON.stringify(blocks))
  }, [assets, blocks, onChange, onStructureChange])

  const selected = useMemo(() => blocks.find((block) => block.id === selectedId) ?? blocks[0], [blocks, selectedId])

  const updateSelected = (patch: Partial<Block>) => {
    if (!selected) return
    setBlocks((current) => current.map((block) => block.id === selected.id ? { ...block, ...patch } : block))
  }

  const addBlock = (kind: BlockKind) => {
    const block = makeBlock(kind)
    setBlocks((current) => [...current, block])
    setSelectedId(block.id)
  }

  const removeSelected = () => {
    if (!selected) return
    const remaining = blocks.filter((block) => block.id !== selected.id)
    setBlocks(remaining)
    setSelectedId(remaining[0]?.id ?? "")
  }

  const moveSelected = (direction: -1 | 1) => {
    if (!selected) return
    setBlocks((current) => {
      const index = current.findIndex((block) => block.id === selected.id)
      const nextIndex = index + direction
      if (index < 0 || nextIndex < 0 || nextIndex >= current.length) return current
      const next = [...current]
      ;[next[index], next[nextIndex]] = [next[nextIndex], next[index]]
      return next
    })
  }

  const updateColumnWidth = (columnIndex: number, width: number) => {
    if (!selected?.columns) return
    const normalized = Math.max(10, Math.min(90, width || 10))
    setBlocks((current) => current.map((block) => {
      if (block.id !== selected.id || !block.columns || block.columns.length !== 2) return block
      return {
        ...block,
        columns: block.columns.map((column, index) => index === columnIndex
          ? { ...column, width: normalized }
          : { ...column, width: 100 - normalized }),
      }
    }))
  }

  const updateColumnElement = (columnIndex: number, elementId: string, patch: Partial<ColumnElement>) => {
    if (!selected?.columns) return
    setBlocks((current) => current.map((block) => block.id === selected.id
      ? { ...block, columns: block.columns?.map((column, index) => index === columnIndex ? { ...column, elements: column.elements.map((element) => element.id === elementId ? { ...element, ...patch } : element) } : column) }
      : block))
  }

  const addColumnElement = (columnIndex: number, kind: ColumnElement["kind"]) => {
    const element = makeElement(kind)
    if (!selected?.columns) return
    setBlocks((current) => current.map((block) => block.id === selected.id
      ? { ...block, columns: block.columns?.map((column, index) => index === columnIndex ? { ...column, elements: [...column.elements, element] } : column) }
      : block))
  }

  const removeColumnElement = (columnIndex: number, elementId: string) => {
    if (!selected?.columns) return
    setBlocks((current) => current.map((block) => block.id === selected.id
      ? { ...block, columns: block.columns?.map((column, index) => index === columnIndex ? { ...column, elements: column.elements.filter((element) => element.id !== elementId) } : column) }
      : block))
  }

  return (
    <div className="overflow-hidden rounded-2xl border bg-[#f6f7fb] shadow-sm">
      <div className="flex min-h-16 flex-wrap items-center gap-3 border-b bg-white px-4 py-3">
        <div className="flex items-center gap-2"><div className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-[#6d5dfc] to-[#9a7cff] font-bold text-white">T</div><div><p className="text-sm font-semibold">Tal-IA</p><p className="text-[11px] text-muted-foreground">Constructor de plantillas</p></div></div>
      </div>
      <div className="grid min-h-[680px] lg:grid-cols-[220px_minmax(0,1fr)_240px]">
        <aside className="border-b bg-white p-3 lg:border-b-0 lg:border-r">
          <p className="mb-3 text-[11px] font-bold uppercase tracking-wider text-slate-400">Agregar contenido</p>
          <div className="grid grid-cols-2 gap-2">
            {(["text", "image", "button", "divider", "space", "columns"] as BlockKind[]).map((kind) => (
              <Button key={kind} type="button" variant="outline" className="h-auto justify-start px-2 py-3 text-left text-xs" onClick={() => addBlock(kind)}>
                <span className="mr-1.5 text-sm">{kind === "text" ? "Aa" : kind === "image" ? "▧" : kind === "button" ? "▬" : kind === "divider" ? "—" : kind === "space" ? "↕" : "▥"}</span>{kind === "text" ? "Texto" : kind === "image" ? "Imagen" : kind === "button" ? "Botón" : kind === "divider" ? "Separador" : kind === "space" ? "Espacio" : "Columnas"}
              </Button>
            ))}
          </div>
          <div className="my-5 h-px bg-slate-100" />
          <p className="mb-3 text-[11px] font-bold uppercase tracking-wider text-slate-400">Personalización</p>
          <div className="flex flex-wrap gap-1.5">
            {variables.map((variable) => <button key={variable.clave} type="button" className="rounded-full border bg-[#f7f7fa] px-2 py-1.5 text-[11px] hover:border-violet-300 hover:bg-violet-50" onClick={() => updateSelected({ content: `${selected?.content ?? ""}${selected?.content ? " " : ""}{{${variable.clave}}}` })}>{variable.clave === variable.etiqueta ? `{{${variable.clave}}}` : variable.etiqueta}</button>)}
          </div>
        </aside>
        <section className="overflow-auto p-4 sm:p-6">
          <div className="mb-4 flex items-center justify-between text-xs text-slate-500"><span>Haz clic en cualquier bloque para editarlo</span><div className="flex rounded-lg border bg-white p-1"><button type="button" className={`rounded px-2 py-1 ${!mobile ? "bg-violet-50 font-semibold text-violet-700" : ""}`} onClick={() => setMobile(false)}>▱ Escritorio</button><button type="button" className={`rounded px-2 py-1 ${mobile ? "bg-violet-50 font-semibold text-violet-700" : ""}`} onClick={() => setMobile(true)}>▯ Móvil</button></div></div>
          <div className={`mx-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_14px_40px_rgba(25,30,55,.08)] transition-all sm:p-8 ${mobile ? "max-w-[390px]" : "max-w-[720px]"}`}>
            {blocks.map((block) => <button key={block.id} type="button" className={`group relative mb-2 block w-full rounded-xl border p-3 text-left ${selected?.id === block.id ? "border-violet-500 bg-violet-50/40 ring-4 ring-violet-500/10" : "border-transparent hover:border-violet-200"}`} onClick={() => setSelectedId(block.id)}>
              {selected?.id === block.id ? <span className="absolute -right-1 -top-3 rounded-md border bg-white px-1.5 py-1 text-[10px] shadow-sm">⋮⋮</span> : null}
              {block.kind === "image" ? (block.imageId && assets.find((asset) => asset.id === block.imageId) ? <Image src={assets.find((asset) => asset.id === block.imageId)?.file_url ?? ""} alt="" width={600} height={180} className="mx-auto max-h-40 w-full object-contain" unoptimized /> : <div className="grid h-28 place-items-center rounded-xl bg-slate-100 text-xs text-slate-400">Logo o fotografía</div>) : block.kind === "divider" ? <div className="h-px bg-slate-200" /> : block.kind === "space" ? <div className="h-10" /> : block.kind === "button" ? <div className="text-center"><span className="inline-flex rounded-xl bg-[#171923] px-5 py-3 text-sm font-bold text-white">{block.content}</span></div> : block.kind === "columns" ? <div className="grid gap-2" style={{ gridTemplateColumns: `${block.columns?.[0]?.width ?? 50}% ${block.columns?.[1]?.width ?? 50}%` }}>{(block.columns ?? []).map((column) => <div key={column.id} className="min-h-16 rounded-xl border bg-slate-50 p-3 text-xs text-slate-600">{column.elements.map((element) => <div key={element.id} className="mb-2 last:mb-0">{element.kind === "button" ? <span className="inline-flex rounded bg-[#171923] px-2 py-1 text-[10px] font-bold text-white">{element.content}</span> : element.kind === "image" ? <span className="text-slate-400">Imagen</span> : element.content}</div>)}</div>)}</div> : <div><h3 className="text-xl font-bold">{block.title}</h3><p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-600">{block.content}</p></div>}
            </button>)}
          </div>
        </section>
        <aside className="border-t bg-white p-4 lg:border-l lg:border-t-0">
          <p className="text-sm font-semibold">{selected?.title ?? "Bloque"}</p><p className="mb-5 mt-1 text-xs text-muted-foreground">Personaliza el bloque seleccionado</p>
          {selected?.kind === "image" ? <div className="space-y-2"><Label>Imagen</Label><select className="h-9 w-full rounded-md border bg-white px-2 text-sm" value={selected.imageId ?? ""} onChange={(event) => updateSelected({ imageId: event.target.value || undefined })}><option value="">Seleccionar imagen</option>{assets.map((asset) => <option key={asset.id} value={asset.id}>{asset.nombre}</option>)}</select></div> : null}
          {selected?.kind === "button" ? <div className="space-y-3"><div className="space-y-2"><Label>Texto</Label><Input value={selected.content} onChange={(event) => updateSelected({ content: event.target.value })} /></div><div className="space-y-2"><Label>Enlace</Label><select className="h-9 w-full rounded-md border bg-white px-2 text-sm" value={CTA_OPTIONS.some((option) => option.value === selected.href) ? selected.href : "custom"} onChange={(event) => updateSelected({ href: event.target.value === "custom" ? selected.href : event.target.value })}><option value="custom">Enlace personalizado</option>{CTA_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select><Input value={selected.href ?? ""} onChange={(event) => updateSelected({ href: event.target.value })} placeholder="https://... o {{sitio_web}}" /></div></div> : null}
          {selected?.kind === "columns" ? <div className="space-y-5">{(selected.columns ?? []).map((column, columnIndex) => <div key={column.id} className="space-y-3 rounded-lg border p-3"><div className="flex items-end gap-2"><div className="flex-1 space-y-2"><Label>Columna {columnIndex + 1}</Label><Input type="number" min={10} max={90} value={column.width} onChange={(event) => updateColumnWidth(columnIndex, Number(event.target.value))} /></div><span className="pb-2 text-xs text-muted-foreground">%</span></div>{column.elements.map((element) => <div key={element.id} className="space-y-2 rounded border bg-muted/20 p-2"><div className="flex items-center justify-between"><span className="text-xs font-medium">{element.kind === "text" ? "Texto" : element.kind === "button" ? "Botón" : "Imagen"}</span><Button type="button" variant="ghost" size="sm" className="h-6 px-1 text-destructive" onClick={() => removeColumnElement(columnIndex, element.id)}>Eliminar</Button></div>{element.kind === "text" ? <Textarea rows={3} value={element.content} onChange={(event) => updateColumnElement(columnIndex, element.id, { content: event.target.value })} /> : element.kind === "button" ? <div className="space-y-2"><Input value={element.content} onChange={(event) => updateColumnElement(columnIndex, element.id, { content: event.target.value })} placeholder="Texto del botón" /><select className="h-9 w-full rounded-md border bg-white px-2 text-sm" value={CTA_OPTIONS.some((option) => option.value === element.href) ? element.href : "custom"} onChange={(event) => updateColumnElement(columnIndex, element.id, { href: event.target.value === "custom" ? element.href : event.target.value })}><option value="custom">Enlace personalizado</option>{CTA_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select><Input value={element.href ?? ""} onChange={(event) => updateColumnElement(columnIndex, element.id, { href: event.target.value })} placeholder="https://... o {{sitio_web}}" /></div> : <select className="h-9 w-full rounded-md border bg-white px-2 text-sm" value={element.imageId ?? ""} onChange={(event) => updateColumnElement(columnIndex, element.id, { imageId: event.target.value || undefined })}><option value="">Seleccionar imagen</option>{assets.map((asset) => <option key={asset.id} value={asset.id}>{asset.nombre}</option>)}</select>}</div>)}<div className="flex gap-1"><Button type="button" variant="outline" size="sm" onClick={() => addColumnElement(columnIndex, "text")}>+ Texto</Button><Button type="button" variant="outline" size="sm" onClick={() => addColumnElement(columnIndex, "button")}>+ Botón</Button><Button type="button" variant="outline" size="sm" onClick={() => addColumnElement(columnIndex, "image")}>+ Imagen</Button></div></div>)}</div> : null}
          {selected?.kind === "text" ? <div className="space-y-2"><Label>Contenido</Label><Textarea rows={8} value={selected.content} onChange={(event) => updateSelected({ content: event.target.value })} /></div> : null}
          <div className="mt-5 flex gap-2"><Button type="button" variant="outline" className="flex-1" onClick={() => moveSelected(-1)}>↑</Button><Button type="button" variant="outline" className="flex-1" onClick={() => moveSelected(1)}>↓</Button></div><Button type="button" variant="outline" className="mt-2 w-full" onClick={() => { if (selected) { const copy = makeBlock(selected.kind, selected); setBlocks((current) => [...current, copy]); setSelectedId(copy.id) } }}>Duplicar</Button><Button type="button" variant="outline" className="mt-2 w-full text-destructive" onClick={removeSelected}>Eliminar</Button>
        </aside>
      </div>
    </div>
  )
}
