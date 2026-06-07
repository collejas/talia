"use client"

import * as React from "react"
import {
  IconAlertTriangle,
  IconBuilding,
  IconCalendar,
  IconCheck,
  IconFileText,
  IconFolder,
  IconPlus,
  IconSearch,
  IconSend,
  IconSparkles,
  IconTrash,
  IconX,
} from "@tabler/icons-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"

type QuoteStatus =
  | "Borrador"
  | "Enviada"
  | "Aceptada"
  | "Orden de compra"
  | "Facturada"

type LineItemType = "Producto" | "Servicio" | "Concepto libre"

type LineItem = {
  id: string
  type: LineItemType
  concept: string
  description: string
  unit: string
  quantity: number
  unitPrice: number
  discount: number
  taxRate: number
  cost: number
  deliveryDays: string
  warranty: string
  internalNotes: string
}

const statusSteps: QuoteStatus[] = [
  "Borrador",
  "Enviada",
  "Aceptada",
  "Orden de compra",
  "Facturada",
]

const paymentOptions = ["Contado", "Crédito 15 días", "Crédito 30 días", "Anticipo + saldo"]
const deliveryOptions = ["Inmediata", "7 días", "15 días", "Personalizada"]
const warrantyOptions = ["1 año", "2 años", "3 años", "Personalizada"]
const currencyOptions = ["MXN", "USD"]
const vatOptions = ["Incluido", "Más IVA", "Exento"]
const templateOptions = ["Ejecutiva", "Técnica", "Detallada", "Minimal"]

const initialItems: LineItem[] = [
  {
    id: "led-150w",
    type: "Producto",
    concept: "Luminaria LED 150W",
    description: "Luminaria de alto desempeño para vialidades y áreas exteriores.",
    unit: "Pza",
    quantity: 20,
    unitPrice: 2300,
    discount: 5,
    taxRate: 16,
    cost: 1600,
    deliveryDays: "7 días",
    warranty: "2 años",
    internalNotes: "Confirmar fotometría y ficha técnica antes de enviar.",
  },
  {
    id: "poste-7m",
    type: "Producto",
    concept: "Poste cónico 7 m",
    description: "Poste galvanizado con placa y herraje de instalación.",
    unit: "Pza",
    quantity: 20,
    unitPrice: 4100,
    discount: 0,
    taxRate: 16,
    cost: 2500,
    deliveryDays: "15 días",
    warranty: "3 años",
    internalNotes: "Alinear con obra civil y plantilla de anclaje.",
  },
  {
    id: "instalacion",
    type: "Servicio",
    concept: "Instalación y puesta en marcha",
    description: "Montaje, conexión, pruebas y arranque operativo del sistema.",
    unit: "Servicio",
    quantity: 1,
    unitPrice: 28000,
    discount: 0,
    taxRate: 16,
    cost: 18000,
    deliveryDays: "15 días",
    warranty: "90 días",
    internalNotes: "Se agenda después de la entrega del material.",
  },
]

function moneyFormatter(currency: string) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  })
}

function QuoteField({
  label,
  children,
  hint,
}: {
  label: string
  children: React.ReactNode
  hint?: string
}) {
  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-3">
        <Label className="text-xs font-medium tracking-wide uppercase">{label}</Label>
        {hint ? <span className="text-muted-foreground text-xs">{hint}</span> : null}
      </div>
      {children}
    </div>
  )
}

function QuotePillButton({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <Button
      type="button"
      variant={active ? "default" : "outline"}
      size="sm"
      onClick={onClick}
      className={cn("justify-start rounded-full", !active && "text-muted-foreground")}
    >
      {active ? <IconCheck className="size-4" /> : null}
      {label}
    </Button>
  )
}

function formatPercent(value: number) {
  return `${Math.max(0, Math.round(value))}%`
}

export function QuoteCreationModal() {
  const [open, setOpen] = React.useState(false)
  const [status, setStatus] = React.useState<QuoteStatus>("Borrador")
  const [currency, setCurrency] = React.useState("MXN")
  const [paymentTerm, setPaymentTerm] = React.useState("Crédito 30 días")
  const [deliveryTerm, setDeliveryTerm] = React.useState("15 días")
  const [warrantyTerm, setWarrantyTerm] = React.useState("2 años")
  const [vatMode, setVatMode] = React.useState("Más IVA")
  const [template, setTemplate] = React.useState("Ejecutiva")
  const [globalDiscount, setGlobalDiscount] = React.useState("5000")
  const [validityDays, setValidityDays] = React.useState("15")
  const [clientQuery, setClientQuery] = React.useState("Comercializadora ABC SA de CV")
  const [contactName, setContactName] = React.useState("Juan Pérez")
  const [projectName, setProjectName] = React.useState("Alumbrado Parque Norte")
  const [projectLocation, setProjectLocation] = React.useState("Querétaro, Qro.")
  const [internalReference, setInternalReference] = React.useState("LIC-2026-004")
  const [customerEmail, setCustomerEmail] = React.useState("compras@abc.com")
  const [customerPhone, setCustomerPhone] = React.useState("+52 442 555 0198")
  const [quoteNotes, setQuoteNotes] = React.useState(
    "- Precios más IVA.\n- Vigencia de la cotización: 15 días.\n- Entrega sujeta a disponibilidad.\n- Garantía conforme a ficha técnica del producto."
  )
  const [customerNotes, setCustomerNotes] = React.useState(
    "Gracias por la oportunidad. Quedamos atentos a comentarios y ajustes finales."
  )
  const [internalNotes, setInternalNotes] = React.useState(
    "Validar existencias del poste antes de confirmar la fecha de entrega."
  )
  const attachments = [
    "Ficha técnica LED.pdf",
    "Imagen referencial.png",
    "Plano parque norte.dwg",
  ]
  const [lineItems, setLineItems] = React.useState<LineItem[]>(initialItems)
  const [selectedLineId, setSelectedLineId] = React.useState(initialItems[0]?.id ?? "")

  const formatter = React.useMemo(() => moneyFormatter(currency), [currency])

  const subtotal = lineItems.reduce((sum, item) => {
    const lineNet = item.quantity * item.unitPrice * (1 - item.discount / 100)
    return sum + lineNet
  }, 0)

  const estimatedCost = lineItems.reduce((sum, item) => sum + item.quantity * item.cost, 0)
  const discountValue = Number(globalDiscount) || 0
  const baseIva = Math.max(0, subtotal - discountValue)
  const vatRate = vatMode === "Exento" ? 0 : 16
  const vatAmount = baseIva * (vatRate / 100)
  const total = baseIva + vatAmount
  const marginPercent = subtotal > 0 ? ((subtotal - estimatedCost) / subtotal) * 100 : 0

  const selectedLine =
    lineItems.find((item) => item.id === selectedLineId) ?? lineItems[0] ?? null

  function updateLine(id: string, patch: Partial<LineItem>) {
    setLineItems((current) =>
      current.map((item) => (item.id === id ? { ...item, ...patch } : item))
    )
  }

  function addLine(type: LineItemType) {
    const id = crypto.randomUUID()
    const defaults: LineItem =
      type === "Servicio"
        ? {
            id,
            type,
            concept: "Servicio nuevo",
            description: "Describe aquí el alcance del servicio.",
            unit: "Servicio",
            quantity: 1,
            unitPrice: 0,
            discount: 0,
            taxRate: 16,
            cost: 0,
            deliveryDays: "Personalizada",
            warranty: "Personalizada",
            internalNotes: "",
          }
        : {
            id,
            type,
            concept: type === "Producto" ? "Producto nuevo" : "Concepto libre",
            description: "Añade la descripción larga para impresión en PDF.",
            unit: "Pza",
            quantity: 1,
            unitPrice: 0,
            discount: 0,
            taxRate: 16,
            cost: 0,
            deliveryDays: "Personalizada",
            warranty: "Personalizada",
            internalNotes: "",
          }

    setLineItems((current) => [...current, defaults])
    setSelectedLineId(id)
  }

  function removeLine(id: string) {
    setLineItems((current) => current.filter((item) => item.id !== id))
    if (selectedLineId === id) {
      const next = lineItems.find((item) => item.id !== id) ?? null
      setSelectedLineId(next?.id ?? "")
    }
  }

  function warnIfNeeded() {
    toast.message("Cotización lista para guardar", {
      description: "El resumen financiero y las condiciones comerciales están sincronizados.",
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2 rounded-full bg-slate-950 text-white hover:bg-slate-800">
          <IconSparkles className="size-4" />
          Nueva cotización
        </Button>
      </DialogTrigger>
      <DialogContent
        showCloseButton={false}
        className="max-h-[95vh] overflow-hidden border-slate-200 bg-white p-0 shadow-2xl sm:max-w-[96vw] lg:max-w-[1460px]"
      >
        <div className="flex flex-wrap items-start justify-between gap-3 border-b px-4 py-4 sm:px-6">
          <div className="grid gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <DialogTitle className="text-2xl font-semibold tracking-tight">Nueva cotización</DialogTitle>
              <Badge variant="secondary" className="rounded-full">
                Folio: COT-2026-00034
              </Badge>
              <Badge variant="outline" className="rounded-full border-amber-200 bg-amber-50 text-amber-700">
                {status}
              </Badge>
            </div>
            <DialogDescription className="text-sm text-slate-500">
              Cotización compacta: cliente, proyecto, partidas, condiciones, notas y resumen.
            </DialogDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" className="h-10 rounded-lg">
              <IconCheck className="size-4" />
              Guardar borrador
            </Button>
            <Button size="sm" className="h-10 rounded-lg bg-slate-950 text-white hover:bg-slate-800">
              <IconSend className="size-4" />
              Enviar cotización
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setOpen(false)}
              className="rounded-full"
            >
              <IconX className="size-5" />
              <span className="sr-only">Cerrar</span>
            </Button>
          </div>
        </div>

        <div className="max-h-[calc(95vh-88px)] overflow-y-auto">
          <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:p-6">
            <div className="grid gap-4">
              <div className="rounded-2xl border bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">Datos principales</div>
                    <p className="text-xs text-slate-500">Cliente, contacto, fecha, vigencia y moneda.</p>
                  </div>
                  <Badge className="rounded-full bg-amber-50 text-amber-700 hover:bg-amber-50">
                    Estado: {status}
                  </Badge>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                  <QuoteField label="Cliente" hint="buscar o crear">
                    <div className="relative">
                      <IconSearch className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
                      <Input
                        value={clientQuery}
                        onChange={(event) => setClientQuery(event.target.value)}
                        className="h-9 rounded-lg pl-9 text-sm"
                        placeholder="Buscar cliente..."
                      />
                    </div>
                  </QuoteField>
                  <QuoteField label="Contacto">
                    <Input
                      value={contactName}
                      onChange={(event) => setContactName(event.target.value)}
                      className="h-9 rounded-lg text-sm"
                      placeholder="Seleccionar contacto"
                    />
                  </QuoteField>
                  <QuoteField label="Fecha">
                    <Input
                      type="date"
                      defaultValue="2026-06-07"
                      className="h-9 rounded-lg text-sm"
                    />
                  </QuoteField>
                  <QuoteField label="Vigencia" hint="días">
                    <Input
                      value={validityDays}
                      onChange={(event) => setValidityDays(event.target.value)}
                      className="h-9 rounded-lg text-sm"
                    />
                  </QuoteField>
                  <QuoteField label="Moneda">
                    <ToggleGroup
                      type="single"
                      value={currency}
                      onValueChange={(value) => value && setCurrency(value)}
                      variant="outline"
                      className="w-full"
                    >
                      {currencyOptions.map((option) => (
                        <ToggleGroupItem key={option} value={option} className="rounded-lg px-3 text-sm">
                          {option}
                        </ToggleGroupItem>
                      ))}
                    </ToggleGroup>
                  </QuoteField>
                  <QuoteField label="Estado">
                    <ToggleGroup
                      type="single"
                      value={status}
                      onValueChange={(value) => value && setStatus(value as QuoteStatus)}
                      variant="outline"
                      className="w-full"
                    >
                      <ToggleGroupItem value="Borrador" className="rounded-lg px-3 text-sm">
                        Borrador
                      </ToggleGroupItem>
                      <ToggleGroupItem value="Enviada" className="rounded-lg px-3 text-sm">
                        Enviada
                      </ToggleGroupItem>
                    </ToggleGroup>
                  </QuoteField>
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-2xl border bg-white p-4 shadow-sm">
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                    <IconBuilding className="size-4 text-slate-500" />
                    Cliente
                  </div>
                  <div className="mt-3 grid gap-2 text-sm">
                    <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-3">
                      <span className="text-slate-500">Razón social:</span>
                      <span className="font-medium">{clientQuery}</span>
                    </div>
                    <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-3">
                      <span className="text-slate-500">RFC:</span>
                      <span className="font-medium">ABC010101XXX</span>
                    </div>
                    <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-3">
                      <span className="text-slate-500">Email:</span>
                      <span className="font-medium">{customerEmail}</span>
                    </div>
                    <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-3">
                      <span className="text-slate-500">Teléfono:</span>
                      <span className="font-medium">{customerPhone}</span>
                    </div>
                  </div>
                  <div className="mt-3">
                    <Button variant="outline" size="sm" className="h-9 rounded-lg">
                      Ver perfil del cliente
                    </Button>
                  </div>
                </div>
                <div className="rounded-2xl border bg-white p-4 shadow-sm">
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                    <IconSparkles className="size-4 text-violet-600" />
                    Proyecto <span className="text-xs font-normal text-slate-500">(opcional)</span>
                  </div>
                  <div className="mt-3 grid gap-2 text-sm">
                    <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-3">
                      <span className="text-slate-500">Nombre:</span>
                      <span className="font-medium">{projectName}</span>
                    </div>
                    <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-3">
                      <span className="text-slate-500">Ubicación:</span>
                      <span className="font-medium">{projectLocation}</span>
                    </div>
                    <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-3">
                      <span className="text-slate-500">Referencia:</span>
                      <span className="font-medium">{internalReference}</span>
                    </div>
                  </div>
                  <div className="mt-3">
                    <Button variant="outline" size="sm" className="h-9 rounded-lg">
                      Seleccionar proyecto
                    </Button>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">Productos y servicios</div>
                    <p className="text-xs text-slate-500">Búsqueda, partidas y edición inline.</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" className="h-9 rounded-lg" onClick={() => addLine("Producto")}>
                      <IconPlus className="size-4" />
                      Agregar producto
                    </Button>
                    <Button variant="outline" size="sm" className="h-9 rounded-lg" onClick={() => addLine("Servicio")}>
                      <IconPlus className="size-4" />
                      Agregar servicio
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-9 rounded-lg"
                      onClick={() => addLine("Concepto libre")}
                    >
                      <IconPlus className="size-4" />
                      Concepto libre
                    </Button>
                  </div>
                </div>

                <div className="mt-3 flex items-center gap-3 rounded-xl border bg-slate-50 px-3 py-2.5">
                  <IconSearch className="text-muted-foreground size-4" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">Buscar producto por código, nombre o SKU</div>
                    <div className="text-muted-foreground text-xs">
                      El selector puede conectarse después al catálogo y autocompletar precio, IVA y garantía.
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" className="rounded-lg">
                    Catálogo
                  </Button>
                </div>

                <div className="mt-3 overflow-hidden rounded-xl border">
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead className="bg-slate-50 text-left">
                        <tr className="[&>th]:px-2.5 [&>th]:py-2.5 [&>th]:text-xs [&>th]:font-semibold">
                          <th>#</th>
                          <th>Concepto</th>
                          <th>Tipo</th>
                          <th className="text-right">Cant</th>
                          <th className="text-right">Precio</th>
                          <th className="text-right">Desc.</th>
                          <th className="text-right">Importe</th>
                          <th className="text-right">Acción</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lineItems.map((item, index) => {
                          const lineAmount = item.quantity * item.unitPrice * (1 - item.discount / 100)
                          const active = item.id === selectedLineId
                          return (
                            <tr
                              key={item.id}
                              className={cn(
                                "border-t transition-colors",
                                active ? "bg-sky-50/80" : "bg-white hover:bg-slate-50"
                              )}
                            >
                              <td className="px-2.5 py-2.5 align-top text-slate-500">{index + 1}</td>
                              <td className="px-2.5 py-2.5 align-top">
                                <button
                                  type="button"
                                  onClick={() => setSelectedLineId(item.id)}
                                  className="text-left font-medium hover:underline"
                                >
                                  {item.concept}
                                </button>
                                <div className="text-muted-foreground mt-0.5 max-w-md truncate text-xs">
                                  {item.description}
                                </div>
                              </td>
                              <td className="px-2.5 py-2.5 align-top">
                                <Badge variant="outline" className="rounded-full">
                                  {item.type}
                                </Badge>
                              </td>
                              <td className="px-2.5 py-2.5 align-top">
                                <Input
                                  type="number"
                                  min="0"
                                  value={item.quantity}
                                  onChange={(event) =>
                                    updateLine(item.id, { quantity: Number(event.target.value || 0) })
                                  }
                                  className="h-9 w-18 rounded-lg text-right text-sm"
                                />
                              </td>
                              <td className="px-2.5 py-2.5 align-top">
                                <Input
                                  type="number"
                                  min="0"
                                  value={item.unitPrice}
                                  onChange={(event) =>
                                    updateLine(item.id, { unitPrice: Number(event.target.value || 0) })
                                  }
                                  className="h-9 w-24 rounded-lg text-right text-sm"
                                />
                              </td>
                              <td className="px-2.5 py-2.5 align-top">
                                <Input
                                  type="number"
                                  min="0"
                                  value={item.discount}
                                  onChange={(event) =>
                                    updateLine(item.id, { discount: Number(event.target.value || 0) })
                                  }
                                  className="h-9 w-18 rounded-lg text-right text-sm"
                                />
                              </td>
                              <td className="px-2.5 py-2.5 align-top text-right font-medium">
                                {formatter.format(lineAmount)}
                              </td>
                              <td className="px-2.5 py-2.5 align-top text-right">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => removeLine(item.id)}
                                  className="rounded-full"
                                >
                                  <IconTrash className="size-4" />
                                  <span className="sr-only">Eliminar</span>
                                </Button>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {selectedLine ? (
                  <details className="mt-3 rounded-xl border border-dashed bg-slate-50 p-3">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-slate-900">Editar partida seleccionada</div>
                        <div className="text-xs text-slate-500">{selectedLine.concept}</div>
                      </div>
                      <Badge variant="secondary" className="rounded-full">
                        {selectedLine.type}
                      </Badge>
                    </summary>

                    <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                      <QuoteField label="Concepto comercial">
                        <Input
                          value={selectedLine.concept}
                          onChange={(event) =>
                            updateLine(selectedLine.id, { concept: event.target.value })
                          }
                          className="h-9 rounded-lg bg-white text-sm"
                        />
                      </QuoteField>
                      <QuoteField label="Unidad">
                        <Input
                          value={selectedLine.unit}
                          onChange={(event) =>
                            updateLine(selectedLine.id, { unit: event.target.value })
                          }
                          className="h-9 rounded-lg bg-white text-sm"
                        />
                      </QuoteField>
                      <QuoteField label="Cantidad">
                        <Input
                          type="number"
                          min="0"
                          value={selectedLine.quantity}
                          onChange={(event) =>
                            updateLine(selectedLine.id, {
                            quantity: Number(event.target.value || 0),
                          })
                          }
                          className="h-9 rounded-lg bg-white text-sm"
                        />
                      </QuoteField>
                      <QuoteField label="Precio unitario">
                        <Input
                          type="number"
                          min="0"
                          value={selectedLine.unitPrice}
                          onChange={(event) =>
                            updateLine(selectedLine.id, {
                            unitPrice: Number(event.target.value || 0),
                          })
                          }
                          className="h-9 rounded-lg bg-white text-sm"
                        />
                      </QuoteField>
                      <QuoteField label="Descuento %">
                        <Input
                          type="number"
                          min="0"
                          value={selectedLine.discount}
                          onChange={(event) =>
                            updateLine(selectedLine.id, {
                            discount: Number(event.target.value || 0),
                          })
                          }
                          className="h-9 rounded-lg bg-white text-sm"
                        />
                      </QuoteField>
                      <QuoteField label="IVA %">
                        <Input
                          type="number"
                          min="0"
                          value={selectedLine.taxRate}
                          onChange={(event) =>
                            updateLine(selectedLine.id, {
                            taxRate: Number(event.target.value || 0),
                          })
                          }
                          className="h-9 rounded-lg bg-white text-sm"
                        />
                      </QuoteField>
                      <QuoteField label="Tiempo de entrega">
                        <Input
                          value={selectedLine.deliveryDays}
                          onChange={(event) =>
                            updateLine(selectedLine.id, {
                            deliveryDays: event.target.value,
                          })
                          }
                          className="h-9 rounded-lg bg-white text-sm"
                        />
                      </QuoteField>
                      <QuoteField label="Garantía">
                        <Input
                          value={selectedLine.warranty}
                          onChange={(event) =>
                            updateLine(selectedLine.id, {
                            warranty: event.target.value,
                          })
                          }
                          className="h-9 rounded-lg bg-white text-sm"
                        />
                      </QuoteField>
                    </div>

                    <div className="mt-3 grid gap-3 xl:grid-cols-[minmax(0,1fr)_280px]">
                      <QuoteField label="Descripción larga para PDF">
                        <Textarea
                          value={selectedLine.description}
                          onChange={(event) =>
                            updateLine(selectedLine.id, {
                            description: event.target.value,
                          })
                          }
                          className="min-h-24 rounded-lg bg-white text-sm"
                        />
                      </QuoteField>
                      <QuoteField label="Notas internas">
                        <Textarea
                          value={selectedLine.internalNotes}
                          onChange={(event) =>
                            updateLine(selectedLine.id, {
                            internalNotes: event.target.value,
                          })
                          }
                          className="min-h-24 rounded-lg bg-white text-sm"
                        />
                      </QuoteField>
                    </div>
                  </details>
                ) : null}
              </div>

              <div className="rounded-2xl border bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">Condiciones comerciales</div>
                    <p className="text-xs text-slate-500">Forma de pago, entrega, garantía e IVA.</p>
                  </div>
                  <Badge variant="outline" className="rounded-full">
                    Plantilla: {template}
                  </Badge>
                </div>

                <div className="mt-3 grid gap-3 xl:grid-cols-2">
                  <QuoteField label="Forma de pago">
                    <div className="flex flex-wrap gap-2">
                      {paymentOptions.map((option) => (
                        <QuotePillButton
                          key={option}
                          label={option}
                          active={paymentTerm === option}
                          onClick={() => setPaymentTerm(option)}
                        />
                      ))}
                    </div>
                  </QuoteField>
                  <QuoteField label="Entrega">
                    <div className="flex flex-wrap gap-2">
                      {deliveryOptions.map((option) => (
                        <QuotePillButton
                          key={option}
                          label={option}
                          active={deliveryTerm === option}
                          onClick={() => setDeliveryTerm(option)}
                        />
                      ))}
                    </div>
                  </QuoteField>
                  <QuoteField label="Garantía">
                    <div className="flex flex-wrap gap-2">
                      {warrantyOptions.map((option) => (
                        <QuotePillButton
                          key={option}
                          label={option}
                          active={warrantyTerm === option}
                          onClick={() => setWarrantyTerm(option)}
                        />
                      ))}
                    </div>
                  </QuoteField>
                  <QuoteField label="IVA">
                    <div className="flex flex-wrap gap-2">
                      {vatOptions.map((option) => (
                        <QuotePillButton
                          key={option}
                          label={option}
                          active={vatMode === option}
                          onClick={() => setVatMode(option)}
                        />
                      ))}
                    </div>
                  </QuoteField>
                </div>

                <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_280px]">
                  <QuoteField label="Texto de condiciones">
                    <Textarea
                      value={quoteNotes}
                      onChange={(event) => setQuoteNotes(event.target.value)}
                      className="min-h-28 rounded-lg bg-white text-sm"
                    />
                  </QuoteField>
                  <QuoteField label="Plantillas">
                    <div className="grid gap-2">
                      {templateOptions.map((option) => (
                        <Button
                          key={option}
                          type="button"
                          variant={template === option ? "default" : "outline"}
                          className="justify-between rounded-lg text-sm"
                          onClick={() => setTemplate(option)}
                        >
                          {option}
                          {template === option ? <IconCheck className="size-4" /> : null}
                        </Button>
                      ))}
                    </div>
                  </QuoteField>
                </div>
              </div>

              <div className="rounded-2xl border bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">Notas y anexos</div>
                    <p className="text-xs text-slate-500">Texto para cliente, notas internas y archivos.</p>
                  </div>
                  <Button variant="outline" size="sm" className="h-9 rounded-lg">
                    <IconFileText className="size-4" />
                    Vista previa PDF
                  </Button>
                </div>

                <div className="mt-3 grid gap-3 xl:grid-cols-2">
                  <QuoteField label="Notas para el cliente">
                    <Textarea
                      value={customerNotes}
                      onChange={(event) => setCustomerNotes(event.target.value)}
                      className="min-h-24 rounded-lg bg-white text-sm"
                    />
                  </QuoteField>
                  <QuoteField label="Notas internas">
                    <Textarea
                      value={internalNotes}
                      onChange={(event) => setInternalNotes(event.target.value)}
                      className="min-h-24 rounded-lg bg-white text-sm"
                    />
                  </QuoteField>
                </div>

                <Separator className="my-4" />

                <div className="flex flex-wrap items-center gap-2">
                  {attachments.map((attachment) => (
                    <Badge key={attachment} variant="secondary" className="rounded-full px-2.5 py-1">
                      <IconFolder className="size-3.5" />
                      {attachment}
                    </Badge>
                  ))}
                  <Button variant="outline" size="sm" className="h-9 rounded-lg">
                    + Ficha técnica
                  </Button>
                  <Button variant="outline" size="sm" className="h-9 rounded-lg">
                    + Imagen
                  </Button>
                  <Button variant="outline" size="sm" className="h-9 rounded-lg">
                    + PDF
                  </Button>
                  <Button variant="outline" size="sm" className="h-9 rounded-lg">
                    + Plano
                  </Button>
                </div>
              </div>
            </div>

            <aside className="grid gap-4 lg:sticky lg:top-6 lg:self-start">
              <div className="rounded-2xl border bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">Resumen</div>
                    <p className="text-xs text-slate-500">Totales y acciones principales.</p>
                  </div>
                  <Badge className="rounded-full bg-slate-100 text-slate-700 hover:bg-slate-100">
                    {currency}
                  </Badge>
                </div>

                <div className="mt-4 grid gap-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Subtotal</span>
                    <span className="font-medium text-slate-900">{formatter.format(subtotal)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Descuento global</span>
                    <Input
                      type="number"
                      min="0"
                      value={globalDiscount}
                      onChange={(event) => setGlobalDiscount(event.target.value)}
                      className="h-9 w-24 rounded-lg text-right text-sm"
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Subtotal neto</span>
                    <span className="font-medium text-slate-900">{formatter.format(baseIva)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">IVA ({vatRate}%)</span>
                    <span className="font-medium text-slate-900">{formatter.format(vatAmount)}</span>
                  </div>
                  <Separator className="my-1" />
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-900">TOTAL</span>
                    <span className="text-lg font-semibold text-violet-700">{formatter.format(total)}</span>
                  </div>
                </div>

                <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-emerald-900">Margen estimado</span>
                    <span className="font-semibold text-emerald-900">{formatPercent(marginPercent)}</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-sm">
                    <span className="text-emerald-900/80">Costo estimado</span>
                    <span className="font-medium text-emerald-900">{formatter.format(estimatedCost)}</span>
                  </div>
                </div>

                <div className="mt-4 grid gap-2">
                  <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-800">
                    <IconAlertTriangle className="mt-0.5 size-4 shrink-0" />
                    <div className="text-sm">
                      La vigencia supera la política comercial si excedes 15 días en proyectos sensibles.
                    </div>
                  </div>
                  <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-emerald-800">
                    <IconSparkles className="mt-0.5 size-4 shrink-0" />
                    <div className="text-sm">
                      La plantilla {template.toLowerCase()} se puede reutilizar como base para PDF.
                    </div>
                  </div>
                </div>

                <div className="mt-4 grid gap-2">
                  <Button variant="outline" className="h-10 rounded-lg" onClick={warnIfNeeded}>
                    <IconFileText className="size-4" />
                    Vista previa PDF
                  </Button>
                  <Button className="h-10 rounded-lg bg-slate-950 text-white hover:bg-slate-800">
                    <IconSend className="size-4" />
                    Enviar cotización
                  </Button>
                </div>
              </div>

              <div className="rounded-2xl border bg-white p-4 shadow-sm">
                <div className="flex items-center gap-2">
                  <IconCalendar className="size-4 text-slate-600" />
                  <h4 className="font-semibold text-slate-900">Alertas inteligentes</h4>
                </div>
                <div className="mt-3 grid gap-2 text-sm">
                  {marginPercent < 25 ? (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-900">
                      El margen está por debajo del objetivo recomendado.
                    </div>
                  ) : (
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-emerald-900">
                      Margen dentro del rango esperado.
                    </div>
                  )}
                  {Number(validityDays) > 15 ? (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-900">
                      La vigencia excede la política comercial sugerida.
                    </div>
                  ) : (
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-slate-700">
                      Vigencia alineada con la política comercial.
                    </div>
                  )}
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-slate-700">
                    Este diseño mapea de forma natural a `cotizaciones` + `cotizacion_items` + `quote_templates`.
                  </div>
                </div>
              </div>
            </aside>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
