/* eslint-disable react-hooks/set-state-in-effect */
"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"

import {
  createAgenteAduanalAction,
  createPedimentoGastoAction,
  createPedimentoImportacionAction,
  deleteAgenteAduanalAction,
  deletePedimentoGastoAction,
  deletePedimentoImportacionAction,
  detachPedimentoOrdenAction,
  recalcularPedimentoImportacionAction,
  updateAgenteAduanalAction,
  updatePedimentoImportacionAction,
} from "./actions"

type AnyRecord = Record<string, unknown>

type PedimentosImportacionPanelProps = {
  mode: "agentes" | "pedimentos"
  agentes: AnyRecord[]
  pedimentos: AnyRecord[]
  ordenes: AnyRecord[]
  monedas: AnyRecord[]
  selectedPedimento: AnyRecord | null
  selectedPedimentoId: string
}

function asString(value: unknown, fallback = ""): string {
  if (typeof value === "string") {
    const trimmed = value.trim()
    return trimmed.length ? trimmed : fallback
  }
  if (value === null || value === undefined) {
    return fallback
  }
  return String(value)
}

function asNumber(value: unknown, fallback = 0): number {
  const parsed = typeof value === "number" ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function formatMoney(value: unknown, currency = "MXN"): string {
  const amount = asNumber(value, 0)
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: currency || "MXN",
    maximumFractionDigits: 2,
  }).format(amount)
}

function parseCurrencyInput(value: string): number {
  const raw = value.replace(/\s+/g, "").replace(/[^0-9,.-]/g, "")
  if (!raw) {
    return 0
  }
  const lastComma = raw.lastIndexOf(",")
  const lastDot = raw.lastIndexOf(".")
  const decimalSeparator = lastComma > lastDot ? "," : lastDot > -1 ? "." : null
  const normalized = decimalSeparator
    ? (() => {
        const parts = raw.split(decimalSeparator)
        const whole = parts.slice(0, -1).join("").replace(/[.,-]/g, "")
        const fraction = parts[parts.length - 1]?.replace(/[.,-]/g, "") ?? ""
        return `${whole || "0"}.${fraction}`
      })()
    : raw.replace(/[^\d-]/g, "")
  const parsed = Number.parseFloat(normalized)
  return Number.isFinite(parsed) ? parsed : 0
}

function formatCurrencyInput(value: unknown, currency: string, editing: boolean): string {
  const amount = asNumber(value, 0)
  if (editing) {
    return Number.isFinite(amount) ? String(amount) : ""
  }
  return formatMoney(amount, currency)
}

function formatDate(value: unknown): string {
  const raw = asString(value)
  if (!raw) return "—"
  const datePart = raw.includes("T") ? raw.slice(0, 10) : raw.slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return raw
  const [year, month, day] = datePart.split("-")
  if (!year || !month || !day) return raw
  return `${day}/${month}/${year}`
}

function getPedimentoOrders(pedimento: AnyRecord | null): AnyRecord[] {
  const value = pedimento?.ordenes_compra
  return Array.isArray(value) ? value.filter((item) => Boolean(item) && typeof item === "object") as AnyRecord[] : []
}

function getPedimentoGastos(pedimento: AnyRecord | null): AnyRecord[] {
  const value = pedimento?.gastos
  return Array.isArray(value) ? value.filter((item) => Boolean(item) && typeof item === "object") as AnyRecord[] : []
}

function getPedimentoProrrateos(pedimento: AnyRecord | null): AnyRecord[] {
  const value = pedimento?.prorrateos
  return Array.isArray(value) ? value.filter((item) => Boolean(item) && typeof item === "object") as AnyRecord[] : []
}

function getRecordId(value: unknown): string {
  if (!value || typeof value !== "object") {
    return ""
  }
  const record = value as AnyRecord
  const directId = asString(record.id)
  if (directId) {
    return directId
  }
  return ""
}

function buildAgentFormState(agent?: AnyRecord | null) {
  return {
    nombre: asString(agent?.nombre),
    patente: asString(agent?.patente),
    razon_social: asString(agent?.razon_social),
    rfc: asString(agent?.rfc),
    contacto: asString(agent?.contacto),
    telefono: asString(agent?.telefono),
    email: asString(agent?.email),
    direccion: asString(agent?.direccion),
    observaciones: asString(agent?.observaciones),
    activo: Boolean(agent?.activo ?? true),
  }
}

function buildPedimentoFormState(pedimento?: AnyRecord | null) {
  return {
    numero_pedimento: asString(pedimento?.numero_pedimento),
    embarque: asString(pedimento?.embarque),
    agente_aduanal_id: asString(pedimento?.agente_aduanal_id),
    estado: asString(pedimento?.estado, "borrador"),
    fecha_pedimento: asString(pedimento?.fecha_pedimento),
    fecha_presentacion: asString(pedimento?.fecha_presentacion),
    fecha_liberacion: asString(pedimento?.fecha_liberacion),
    moneda: asString(pedimento?.moneda, "MXN"),
    tipo_cambio: asString(pedimento?.tipo_cambio),
    subtotal_aduanal: asString(pedimento?.subtotal_aduanal, "0"),
    observaciones: asString(pedimento?.observaciones),
  }
}

function buildGastoFormState() {
  return {
    agente_aduanal_id: "",
    tipo_gasto: "",
    descripcion: "",
    monto: "",
    moneda: "MXN",
    tipo_cambio: "1",
    fecha_gasto: "",
    referencia_factura: "",
    estado: "registrado",
    observaciones: "",
  }
}

function extractPedimentoOrdenIds(pedimento?: AnyRecord | null): string[] {
  const value = pedimento?.ordenes_compra
  if (!Array.isArray(value)) {
    return []
  }
  return Array.from(
    new Set(
      value
        .filter((item) => Boolean(item) && typeof item === "object")
        .map((item) => {
          const record = item as AnyRecord
          return String(record.orden_compra_id ?? getRecordId(record.orden_compra) ?? "").trim()
        })
        .filter((id) => id.length > 0),
    ),
  )
}

export function PedimentosImportacionPanel({
  mode,
  agentes,
  pedimentos,
  ordenes,
  monedas,
  selectedPedimento,
  selectedPedimentoId,
}: PedimentosImportacionPanelProps) {
  const router = useRouter()
  const [editingAgentId, setEditingAgentId] = useState<string | null>(null)
  const [agentForm, setAgentForm] = useState(() => buildAgentFormState())
  const [editingPedimentoId, setEditingPedimentoId] = useState<string | null>(null)
  const [pedimentoModalOpen, setPedimentoModalOpen] = useState(false)
  const [pedimentoGastoModalOpen, setPedimentoGastoModalOpen] = useState(false)
  const [pedimentoDetailOpen, setPedimentoDetailOpen] = useState(Boolean(selectedPedimento))
  const [editingPedimentoSubtotal, setEditingPedimentoSubtotal] = useState(false)
  const [pedimentoForm, setPedimentoForm] = useState(() => buildPedimentoFormState())
  const [selectedPedimentoRowId, setSelectedPedimentoRowId] = useState<string>(selectedPedimentoId || "")
  const [pedimentoOrdenIds, setPedimentoOrdenIds] = useState<string[]>([])
  const [availableOrderSelection, setAvailableOrderSelection] = useState<string[]>([])
  const [associatedOrderSelection, setAssociatedOrderSelection] = useState<string[]>([])
  const [gastoForm, setGastoForm] = useState(() => buildGastoFormState())
  const [gastoPedimentoId, setGastoPedimentoId] = useState<string>(() => selectedPedimentoId || String(pedimentos[0]?.id ?? ""))

  useEffect(() => {
    if (editingAgentId) {
      const current = agentes.find((row) => String(row.id) === editingAgentId) ?? null
      setAgentForm(buildAgentFormState(current))
    } else {
      setAgentForm(buildAgentFormState())
    }
  }, [agentes, editingAgentId])

  useEffect(() => {
    if (editingPedimentoId) {
      const current = pedimentos.find((row) => String(row.id) === editingPedimentoId) ?? null
      setPedimentoForm(buildPedimentoFormState(current))
      setPedimentoOrdenIds(extractPedimentoOrdenIds(current))
    } else {
      setPedimentoForm(buildPedimentoFormState())
      setPedimentoOrdenIds([])
    }
    setEditingPedimentoSubtotal(false)
    setAvailableOrderSelection([])
    setAssociatedOrderSelection([])
  }, [editingPedimentoId, pedimentos])

  useEffect(() => {
    setGastoForm({
      ...buildGastoFormState(),
      agente_aduanal_id: asString(selectedPedimento?.agente_aduanal_id),
    })
  }, [selectedPedimento, selectedPedimentoId])

  useEffect(() => {
    if (selectedPedimentoId) {
      setGastoPedimentoId(selectedPedimentoId)
    }
  }, [selectedPedimentoId])

  useEffect(() => {
    setPedimentoDetailOpen(Boolean(selectedPedimento))
  }, [selectedPedimento, selectedPedimentoId])

  useEffect(() => {
    if (selectedPedimentoId) {
      setSelectedPedimentoRowId(selectedPedimentoId)
    }
  }, [selectedPedimentoId])

  useEffect(() => {
    if (!gastoPedimentoId) {
      return
    }
    const currentPedimento = pedimentos.find((row) => String(row.id) === gastoPedimentoId) ?? null
    setGastoForm((prev) => ({
      ...prev,
      agente_aduanal_id: asString(currentPedimento?.agente_aduanal_id),
    }))
  }, [gastoPedimentoId, pedimentos])

  const selectedOrders = useMemo(() => getPedimentoOrders(selectedPedimento), [selectedPedimento])
  const selectedGastos = useMemo(() => getPedimentoGastos(selectedPedimento), [selectedPedimento])
  const selectedProrrateos = useMemo(() => getPedimentoProrrateos(selectedPedimento), [selectedPedimento])
  const selectedPedimentoForActions = useMemo(() => {
    if (selectedPedimento) {
      return selectedPedimento
    }
    if (!selectedPedimentoRowId) {
      return null
    }
    return pedimentos.find((row) => String(row.id) === selectedPedimentoRowId) ?? null
  }, [pedimentos, selectedPedimento, selectedPedimentoRowId])
  const selectedPedimentoForActionsId = selectedPedimentoForActions ? String(selectedPedimentoForActions.id) : ""
  const selectedPedimentoForActionsGastos = useMemo(() => getPedimentoGastos(selectedPedimentoForActions), [selectedPedimentoForActions])
  const selectedPedimentoForActionsGastosTotal = useMemo(
    () =>
      selectedPedimentoForActionsGastos.reduce((sum, gasto) => {
        const amount = asNumber(gasto.monto_mxn ?? gasto.monto, 0)
        return sum + amount
      }, 0),
    [selectedPedimentoForActionsGastos],
  )
  const internationalOrders = useMemo(
    () => ordenes.filter((orden) => String(orden.tipo_operacion ?? "").toLowerCase() === "internacional"),
    [ordenes],
  )
  const otherLinkedOrderIds = useMemo(() => {
    const ids = new Set<string>()
    for (const pedimento of pedimentos) {
      if (editingPedimentoId && String(pedimento.id) === editingPedimentoId) {
        continue
      }
      for (const ordenId of extractPedimentoOrdenIds(pedimento)) {
        ids.add(ordenId)
      }
    }
    return ids
  }, [editingPedimentoId, pedimentos])
  const otherLinkedOrderDetails = useMemo(() => {
    const rows: Array<{ ordenId: string; folio: string; pedimentoNumero: string }> = []
    for (const pedimento of pedimentos) {
      if (editingPedimentoId && String(pedimento.id) === editingPedimentoId) {
        continue
      }
      const pedimentoNumero = asString(pedimento.numero_pedimento, "Sin número")
      for (const ordenId of extractPedimentoOrdenIds(pedimento)) {
        const orden = internationalOrders.find((row) => String(row.id) === ordenId) ?? ordenes.find((row) => String(row.id) === ordenId) ?? null
        rows.push({
          ordenId,
          folio: asString(orden?.folio, ordenId),
          pedimentoNumero,
        })
      }
    }
    return rows
  }, [editingPedimentoId, internationalOrders, ordenes, pedimentos])
  const selectedPedimentoOrderSet = useMemo(() => new Set(pedimentoOrdenIds), [pedimentoOrdenIds])
  const availablePedimentoOrders = useMemo(
    () =>
      internationalOrders.filter((orden) => {
        const ordenId = String(orden.id)
        return !otherLinkedOrderIds.has(ordenId) && !selectedPedimentoOrderSet.has(ordenId)
      }),
    [internationalOrders, otherLinkedOrderIds, selectedPedimentoOrderSet],
  )
  const associatedPedimentoOrders = useMemo(
    () =>
      pedimentoOrdenIds
        .map((ordenId) => internationalOrders.find((orden) => String(orden.id) === ordenId))
        .filter((orden): orden is AnyRecord => Boolean(orden)),
    [internationalOrders, pedimentoOrdenIds],
  )

  const moneyOptions = monedas.length ? monedas : [{ codigo: "MXN", nombre: "Peso mexicano" }]

  const openCreatePedimentoModal = () => {
    setEditingPedimentoId(null)
    setPedimentoForm(buildPedimentoFormState())
    setPedimentoOrdenIds([])
    setEditingPedimentoSubtotal(false)
    setGastoPedimentoId("")
    setAvailableOrderSelection([])
    setAssociatedOrderSelection([])
    setPedimentoModalOpen(true)
  }

  const openEditPedimentoModal = (pedimento: AnyRecord) => {
    setEditingPedimentoId(String(pedimento.id))
    setPedimentoForm(buildPedimentoFormState(pedimento))
    setPedimentoOrdenIds(extractPedimentoOrdenIds(pedimento))
    setEditingPedimentoSubtotal(false)
    setGastoPedimentoId(String(pedimento.id))
    setAvailableOrderSelection([])
    setAssociatedOrderSelection([])
    setPedimentoModalOpen(true)
  }

  const handlePedimentoModalOpenChange = (open: boolean) => {
    setPedimentoModalOpen(open)
    if (!open) {
      setEditingPedimentoId(null)
      setPedimentoForm(buildPedimentoFormState())
      setPedimentoOrdenIds([])
      setEditingPedimentoSubtotal(false)
      setAvailableOrderSelection([])
      setAssociatedOrderSelection([])
    }
  }

  const openPedimentoGastosModal = () => {
    const currentPedimentoId = selectedPedimento ? String(selectedPedimento.id) : selectedPedimentoRowId
    setGastoPedimentoId(currentPedimentoId)
    setGastoForm({
      ...buildGastoFormState(),
      agente_aduanal_id: asString(selectedPedimento?.agente_aduanal_id),
    })
    setPedimentoGastoModalOpen(true)
  }

  const handlePedimentoGastoModalOpenChange = (open: boolean) => {
    setPedimentoGastoModalOpen(open)
    if (!open) {
      setGastoForm(buildGastoFormState())
    }
  }

  const handlePedimentoDetailOpenChange = (open: boolean) => {
    setPedimentoDetailOpen(open)
    if (!open) {
      router.replace("/compras?vista=pedimentos")
    }
  }

  if (mode === "agentes") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Agentes aduanales</CardTitle>
          <CardDescription>Catálogo reutilizable para vincular pedimentos sin capturar el agente cada vez.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <form action={editingAgentId ? updateAgenteAduanalAction.bind(null, editingAgentId) : createAgenteAduanalAction} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="agente-nombre">Nombre</Label>
                <Input id="agente-nombre" name="nombre" value={agentForm.nombre} onChange={(event) => setAgentForm((prev) => ({ ...prev, nombre: event.target.value }))} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="agente-patente">Patente</Label>
                <Input id="agente-patente" name="patente" value={agentForm.patente} onChange={(event) => setAgentForm((prev) => ({ ...prev, patente: event.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="agente-rfc">RFC</Label>
                <Input id="agente-rfc" name="rfc" value={agentForm.rfc} onChange={(event) => setAgentForm((prev) => ({ ...prev, rfc: event.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="agente-razon">Razón social</Label>
                <Input id="agente-razon" name="razon_social" value={agentForm.razon_social} onChange={(event) => setAgentForm((prev) => ({ ...prev, razon_social: event.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="agente-contacto">Contacto</Label>
                <Input id="agente-contacto" name="contacto" value={agentForm.contacto} onChange={(event) => setAgentForm((prev) => ({ ...prev, contacto: event.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="agente-telefono">Teléfono</Label>
                <Input id="agente-telefono" name="telefono" value={agentForm.telefono} onChange={(event) => setAgentForm((prev) => ({ ...prev, telefono: event.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="agente-email">Email</Label>
                <Input id="agente-email" type="email" name="email" value={agentForm.email} onChange={(event) => setAgentForm((prev) => ({ ...prev, email: event.target.value }))} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="agente-direccion">Dirección</Label>
              <Textarea id="agente-direccion" name="direccion" value={agentForm.direccion} onChange={(event) => setAgentForm((prev) => ({ ...prev, direccion: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="agente-observaciones">Observaciones</Label>
              <Textarea id="agente-observaciones" name="observaciones" value={agentForm.observaciones} onChange={(event) => setAgentForm((prev) => ({ ...prev, observaciones: event.target.value }))} />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="activo" checked={agentForm.activo} onChange={(event) => setAgentForm((prev) => ({ ...prev, activo: event.target.checked }))} />
              Activo
            </label>
            <div className="flex gap-2">
              <Button type="submit">{editingAgentId ? "Actualizar agente" : "Guardar agente"}</Button>
              {editingAgentId ? (
                <Button type="button" variant="outline" onClick={() => setEditingAgentId(null)}>
                  Cancelar
                </Button>
              ) : null}
            </div>
          </form>

          <div className="overflow-hidden rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Patente</TableHead>
                  <TableHead>RFC</TableHead>
                  <TableHead>Activo</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!agentes.length ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-6 text-center text-sm text-muted-foreground">
                      Aún no hay agentes aduanales.
                    </TableCell>
                  </TableRow>
                ) : (
                  agentes.map((agente) => (
                    <TableRow key={String(agente.id)}>
                      <TableCell>{asString(agente.nombre)}</TableCell>
                      <TableCell className="font-mono text-xs">{asString(agente.patente, "—")}</TableCell>
                      <TableCell>{asString(agente.rfc, "—")}</TableCell>
                      <TableCell>{Boolean(agente.activo) ? "Sí" : "No"}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button type="button" variant="outline" size="sm" onClick={() => setEditingAgentId(String(agente.id))}>
                            Editar
                          </Button>
                          <form action={deleteAgenteAduanalAction.bind(null, String(agente.id))}>
                            <Button type="submit" variant="ghost" size="sm">
                              Eliminar
                            </Button>
                          </form>
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
    )
  }

  return (
    <div className="space-y-6">
      <Dialog open={pedimentoModalOpen} onOpenChange={handlePedimentoModalOpenChange}>
        <DialogContent className="max-h-[92vh] max-w-7xl overflow-y-auto p-0">
          <DialogHeader className="sr-only">
            <DialogTitle>{editingPedimentoId ? "Editar pedimento" : "Crear pedimento"}</DialogTitle>
            <DialogDescription>Formulario de alta y edición de pedimentos de importación.</DialogDescription>
          </DialogHeader>
          <Card className="border-0 shadow-none">
            <CardHeader>
              <CardTitle>{editingPedimentoId ? "Editar pedimento" : "Crear pedimento"}</CardTitle>
              <CardDescription>Centraliza el número de pedimento, los agentes y los costos compartidos por importación.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
          <form action={editingPedimentoId ? updatePedimentoImportacionAction.bind(null, editingPedimentoId) : createPedimentoImportacionAction} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="space-y-2">
                <Label htmlFor="pedimento-numero">Número de pedimento</Label>
                <Input id="pedimento-numero" name="numero_pedimento" value={pedimentoForm.numero_pedimento} onChange={(event) => setPedimentoForm((prev) => ({ ...prev, numero_pedimento: event.target.value }))} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pedimento-embarque">Embarque</Label>
                <Input id="pedimento-embarque" name="embarque" value={pedimentoForm.embarque} onChange={(event) => setPedimentoForm((prev) => ({ ...prev, embarque: event.target.value }))} placeholder="Referencia o identificador del embarque" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pedimento-agente">Agente aduanal</Label>
                <select id="pedimento-agente" name="agente_aduanal_id" value={pedimentoForm.agente_aduanal_id} onChange={(event) => setPedimentoForm((prev) => ({ ...prev, agente_aduanal_id: event.target.value }))} className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                  <option value="">Sin agente</option>
                  {agentes.map((agente) => (
                    <option key={String(agente.id)} value={String(agente.id)}>
                      {asString(agente.nombre)}{asString(agente.patente) ? ` · ${asString(agente.patente)}` : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="pedimento-estado">Estado</Label>
                <select id="pedimento-estado" name="estado" value={pedimentoForm.estado} onChange={(event) => setPedimentoForm((prev) => ({ ...prev, estado: event.target.value }))} className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                  <option value="borrador">Borrador</option>
                  <option value="en_integracion">En integración</option>
                  <option value="presentado">Presentado</option>
                  <option value="pagado">Pagado</option>
                  <option value="cerrado">Cerrado</option>
                  <option value="cancelado">Cancelado</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="pedimento-moneda">Moneda</Label>
                <select id="pedimento-moneda" name="moneda" value={pedimentoForm.moneda} onChange={(event) => setPedimentoForm((prev) => ({ ...prev, moneda: event.target.value }))} className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                  {moneyOptions.map((moneda) => (
                    <option key={String(moneda.codigo)} value={String(moneda.codigo)}>
                      {asString(moneda.codigo)} {asString(moneda.nombre) ? `· ${asString(moneda.nombre)}` : ""}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="pedimento-ordenes-compra">Ordenes internacionales a ligar</Label>
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
                <div className="rounded-lg border bg-background">
                  <div className="border-b px-3 py-2">
                    <div className="text-sm font-medium">Órdenes disponibles</div>
                    <p className="text-xs text-muted-foreground">Selecciona una o varias órdenes para moverlas a la derecha.</p>
                  </div>
                  <div className="max-h-72 overflow-auto p-2">
                    {!availablePedimentoOrders.length ? (
                      <div className="rounded-md border border-dashed px-3 py-4 text-sm text-muted-foreground">
                        No hay órdenes disponibles para agregar.
                      </div>
                    ) : (
                      <div className="grid gap-2">
                        {availablePedimentoOrders.map((orden) => {
                          const ordenId = String(orden.id)
                          const checked = availableOrderSelection.includes(ordenId)
                          return (
                            <label
                              key={ordenId}
                              className={`flex cursor-pointer items-start gap-3 rounded-md border px-3 py-2 text-sm transition-colors ${
                                checked ? "border-primary bg-primary/5" : "hover:bg-muted/40"
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(event) => {
                                  setAvailableOrderSelection((prev) =>
                                    event.target.checked
                                      ? Array.from(new Set([...prev, ordenId]))
                                      : prev.filter((id) => id !== ordenId),
                                  )
                                }}
                                className="mt-1 h-4 w-4 rounded border-input"
                              />
                              <div className="min-w-0 flex-1">
                                <div className="font-medium">
                                  {asString(orden.folio)} · {formatMoney(orden.total, asString(orden.moneda, "MXN"))}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  Estado: {asString(orden.estado)} · Tipo: {asString(orden.tipo_operacion)}
                                </div>
                              </div>
                            </label>
                          )
                        })}
                      </div>
                    )}
                  </div>
                  {otherLinkedOrderDetails.length ? (
                    <div className="border-t px-3 py-2">
                      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Ya asignadas a otro pedimento
                      </div>
                      <div className="mt-2 grid gap-2">
                        {otherLinkedOrderDetails.map((row) => (
                          <div key={row.ordenId} className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
                            {row.folio} ya está asignada al pedimento {row.pedimentoNumero}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className="flex flex-row items-center justify-center gap-2 xl:flex-col">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (!availableOrderSelection.length) return
                      setPedimentoOrdenIds((prev) =>
                        Array.from(new Set([...prev, ...availableOrderSelection])),
                      )
                      setAvailableOrderSelection([])
                    }}
                    disabled={!availableOrderSelection.length}
                  >
                    Agregar &gt;
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (!associatedOrderSelection.length) return
                      setPedimentoOrdenIds((prev) => prev.filter((id) => !associatedOrderSelection.includes(id)))
                      setAssociatedOrderSelection([])
                    }}
                    disabled={!associatedOrderSelection.length}
                  >
                    &lt; Quitar
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setPedimentoOrdenIds(internationalOrders.map((orden) => String(orden.id)))
                      setAvailableOrderSelection([])
                      setAssociatedOrderSelection([])
                    }}
                    disabled={!internationalOrders.length}
                  >
                    Todas
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setPedimentoOrdenIds([])
                      setAvailableOrderSelection([])
                      setAssociatedOrderSelection([])
                    }}
                    disabled={!pedimentoOrdenIds.length}
                  >
                    Limpiar
                  </Button>
                </div>

                <div className="rounded-lg border bg-background">
                  <div className="border-b px-3 py-2">
                    <div className="text-sm font-medium">Órdenes de compra asociadas</div>
                    <p className="text-xs text-muted-foreground">Estas se guardarán al crear o actualizar el pedimento.</p>
                  </div>
                  <div className="max-h-72 overflow-auto p-2">
                    {!associatedPedimentoOrders.length ? (
                      <div className="rounded-md border border-dashed px-3 py-4 text-sm text-muted-foreground">
                        Aún no hay órdenes asociadas.
                      </div>
                    ) : (
                      <div className="grid gap-2">
                        {associatedPedimentoOrders.map((orden) => {
                          const ordenId = String(orden.id)
                          const checked = associatedOrderSelection.includes(ordenId)
                          return (
                            <label
                              key={ordenId}
                              className={`flex cursor-pointer items-start gap-3 rounded-md border px-3 py-2 text-sm transition-colors ${
                                checked ? "border-primary bg-primary/5" : "hover:bg-muted/40"
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(event) => {
                                  setAssociatedOrderSelection((prev) =>
                                    event.target.checked
                                      ? Array.from(new Set([...prev, ordenId]))
                                      : prev.filter((id) => id !== ordenId),
                                  )
                                }}
                                className="mt-1 h-4 w-4 rounded border-input"
                              />
                              <div className="min-w-0 flex-1">
                                <div className="font-medium">
                                  {asString(orden.folio)} · {formatMoney(orden.total, asString(orden.moneda, "MXN"))}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  Estado: {asString(orden.estado)} · Tipo: {asString(orden.tipo_operacion)}
                                </div>
                              </div>
                            </label>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
              {pedimentoOrdenIds.length ? (
                <div className="hidden">
                  {pedimentoOrdenIds.map((ordenId) => (
                    <input key={ordenId} type="hidden" name="ordenes_compra_ids" value={ordenId} />
                  ))}
                </div>
              ) : null}
              <p className="text-xs text-muted-foreground">
                Selecciona una o varias órdenes internacionales. Al guardar el pedimento se ligarán automáticamente.
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="pedimento-fecha">Fecha pedimento</Label>
                <Input id="pedimento-fecha" name="fecha_pedimento" type="date" value={pedimentoForm.fecha_pedimento} onChange={(event) => setPedimentoForm((prev) => ({ ...prev, fecha_pedimento: event.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pedimento-presentacion">Fecha presentación</Label>
                <Input id="pedimento-presentacion" name="fecha_presentacion" type="date" value={pedimentoForm.fecha_presentacion} onChange={(event) => setPedimentoForm((prev) => ({ ...prev, fecha_presentacion: event.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pedimento-liberacion">Fecha liberación</Label>
                <Input id="pedimento-liberacion" name="fecha_liberacion" type="date" value={pedimentoForm.fecha_liberacion} onChange={(event) => setPedimentoForm((prev) => ({ ...prev, fecha_liberacion: event.target.value }))} />
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="pedimento-tipo-cambio">Tipo de cambio</Label>
                <Input id="pedimento-tipo-cambio" name="tipo_cambio" type="number" step="0.000001" min="0" value={pedimentoForm.tipo_cambio} onChange={(event) => setPedimentoForm((prev) => ({ ...prev, tipo_cambio: event.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pedimento-subtotal">Subtotal aduanal</Label>
                <Input
                  id="pedimento-subtotal"
                  type="text"
                  inputMode="decimal"
                  value={formatCurrencyInput(pedimentoForm.subtotal_aduanal, pedimentoForm.moneda, editingPedimentoSubtotal)}
                  onFocus={() => setEditingPedimentoSubtotal(true)}
                  onBlur={() => setEditingPedimentoSubtotal(false)}
                  onChange={(event) => setPedimentoForm((prev) => ({ ...prev, subtotal_aduanal: String(parseCurrencyInput(event.target.value)) }))}
                  placeholder={formatMoney(0, pedimentoForm.moneda)}
                  className="text-right tabular-nums"
                />
                <input
                  type="hidden"
                  name="subtotal_aduanal"
                  value={Number.isFinite(asNumber(pedimentoForm.subtotal_aduanal)) ? asNumber(pedimentoForm.subtotal_aduanal) : 0}
                  readOnly
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pedimento-observaciones">Observaciones</Label>
                <Textarea id="pedimento-observaciones" name="observaciones" value={pedimentoForm.observaciones} onChange={(event) => setPedimentoForm((prev) => ({ ...prev, observaciones: event.target.value }))} />
              </div>
            </div>
            <div className="flex gap-2">
              <Button type="submit">{editingPedimentoId ? "Actualizar pedimento" : "Guardar pedimento"}</Button>
              {editingPedimentoId ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handlePedimentoModalOpenChange(false)}
                >
                  Cancelar
                </Button>
              ) : null}
            </div>
          </form>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-none">
            <CardHeader>
              <CardTitle>Gastos del pedimento</CardTitle>
              <CardDescription>Los gastos se administran desde el detalle del pedimento.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg border border-dashed bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
                Abre el detalle del pedimento y usa el botón de gastos para capturar o revisar sus gastos.
              </div>
            </CardContent>
          </Card>
        </DialogContent>
      </Dialog>

      <Dialog open={pedimentoGastoModalOpen} onOpenChange={handlePedimentoGastoModalOpenChange}>
        <DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto p-0">
          <DialogHeader className="border-b px-4 py-4">
            <DialogTitle>Gastos del pedimento</DialogTitle>
            <DialogDescription>Captura un gasto ligado al pedimento seleccionado.</DialogDescription>
          </DialogHeader>
          <Card className="border-0 shadow-none">
            <CardHeader>
              <CardTitle>Nuevo gasto</CardTitle>
              <CardDescription>Registra agente, tipo, monto y estado del gasto del pedimento.</CardDescription>
            </CardHeader>
            <CardContent>
              {selectedPedimentoForActions || gastoPedimentoId ? (
                <>
                  <form
                  action={createPedimentoGastoAction.bind(null, gastoPedimentoId || selectedPedimentoId)}
                  className="grid gap-4 md:grid-cols-4"
                >
                  <div className="space-y-2 md:col-span-4">
                    <Label htmlFor="gasto-pedimento-modal">Pedimento de importación</Label>
                    <select
                      id="gasto-pedimento-modal"
                      value={gastoPedimentoId || selectedPedimentoId}
                      onChange={(event) => setGastoPedimentoId(event.target.value)}
                      className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      required
                      disabled={!pedimentos.length}
                    >
                      <option value="" disabled>
                        Selecciona un pedimento
                      </option>
                      {pedimentos.map((pedimento) => (
                        <option key={String(pedimento.id)} value={String(pedimento.id)}>
                          {asString(pedimento.numero_pedimento)} · {asString(pedimento.estado)}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-muted-foreground">
                      Este gasto se registrará en el pedimento que selecciones aquí.
                    </p>
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="gasto-agente-modal">Agente aduanal</Label>
                    <select
                      id="gasto-agente-modal"
                      name="agente_aduanal_id"
                      value={gastoForm.agente_aduanal_id}
                      onChange={(event) => setGastoForm((prev) => ({ ...prev, agente_aduanal_id: event.target.value }))}
                      className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      disabled={!agentes.length}
                    >
                      <option value="">Sin agente</option>
                      {agentes.map((agente) => (
                        <option key={String(agente.id)} value={String(agente.id)}>
                          {asString(agente.nombre)}{asString(agente.patente) ? ` · ${asString(agente.patente)}` : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="gasto-tipo-modal">Tipo</Label>
                    <Input id="gasto-tipo-modal" name="tipo_gasto" value={gastoForm.tipo_gasto} onChange={(event) => setGastoForm((prev) => ({ ...prev, tipo_gasto: event.target.value }))} placeholder="Agente aduanal, maniobras..." required />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="gasto-descripcion-modal">Descripción</Label>
                    <Input id="gasto-descripcion-modal" name="descripcion" value={gastoForm.descripcion} onChange={(event) => setGastoForm((prev) => ({ ...prev, descripcion: event.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="gasto-monto-modal">Monto</Label>
                    <Input id="gasto-monto-modal" name="monto" type="number" step="0.0001" min="0" value={gastoForm.monto} onChange={(event) => setGastoForm((prev) => ({ ...prev, monto: event.target.value }))} required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="gasto-moneda-modal">Moneda</Label>
                    <select id="gasto-moneda-modal" name="moneda" value={gastoForm.moneda} onChange={(event) => setGastoForm((prev) => ({ ...prev, moneda: event.target.value }))} className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                      {moneyOptions.map((moneda) => (
                        <option key={String(moneda.codigo)} value={String(moneda.codigo)}>
                          {asString(moneda.codigo)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="gasto-tipo-cambio-modal">Tipo cambio</Label>
                    <Input id="gasto-tipo-cambio-modal" name="tipo_cambio" type="number" step="0.000001" min="0" value={gastoForm.tipo_cambio} onChange={(event) => setGastoForm((prev) => ({ ...prev, tipo_cambio: event.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="gasto-fecha-modal">Fecha</Label>
                    <Input id="gasto-fecha-modal" name="fecha_gasto" type="date" value={gastoForm.fecha_gasto} onChange={(event) => setGastoForm((prev) => ({ ...prev, fecha_gasto: event.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="gasto-factura-modal">Factura</Label>
                    <Input id="gasto-factura-modal" name="referencia_factura" value={gastoForm.referencia_factura} onChange={(event) => setGastoForm((prev) => ({ ...prev, referencia_factura: event.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="gasto-estado-modal">Estado</Label>
                    <select id="gasto-estado-modal" name="estado" value={gastoForm.estado} onChange={(event) => setGastoForm((prev) => ({ ...prev, estado: event.target.value }))} className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                      <option value="pendiente">Pendiente</option>
                      <option value="registrado">Registrado</option>
                      <option value="pagado">Pagado</option>
                      <option value="cancelado">Cancelado</option>
                    </select>
                  </div>
                  <div className="space-y-2 md:col-span-4">
                    <Label htmlFor="gasto-observaciones-modal">Observaciones</Label>
                    <Textarea id="gasto-observaciones-modal" name="observaciones" value={gastoForm.observaciones} onChange={(event) => setGastoForm((prev) => ({ ...prev, observaciones: event.target.value }))} />
                  </div>
                  <div className="md:col-span-4 flex gap-2">
                    <Button type="submit" disabled={!pedimentos.length || !Boolean(gastoPedimentoId || selectedPedimentoId)}>
                      Agregar gasto
                    </Button>
                    <Button type="button" variant="outline" onClick={() => handlePedimentoGastoModalOpenChange(false)}>
                      Cerrar
                    </Button>
                  </div>
                </form>
                  <div className="mt-6 space-y-3 border-t pt-6">
                    <div className="flex flex-wrap items-end justify-between gap-3">
                      <div>
                      <h3 className="text-sm font-semibold">Gastos capturados</h3>
                      <p className="text-xs text-muted-foreground">Estos son los gastos ya guardados para este pedimento.</p>
                      </div>
                      <div className="rounded-lg border bg-muted/20 px-3 py-2 text-right">
                        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Total gastos</div>
                        <div className="text-sm font-semibold">{formatMoney(selectedPedimentoForActionsGastosTotal, "MXN")}</div>
                      </div>
                    </div>
                    <div className="overflow-hidden rounded-lg border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Tipo</TableHead>
                            <TableHead>Descripción</TableHead>
                            <TableHead>Fecha</TableHead>
                            <TableHead className="text-right">Monto</TableHead>
                            <TableHead className="text-right">Acciones</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {!selectedPedimentoForActionsGastos.length ? (
                            <TableRow>
                              <TableCell colSpan={5} className="py-6 text-center text-sm text-muted-foreground">
                                No hay gastos capturados todavía.
                              </TableCell>
                            </TableRow>
                          ) : (
                            selectedPedimentoForActionsGastos.map((gasto) => (
                              <TableRow key={String(gasto.id)}>
                                <TableCell>{asString(gasto.tipo_gasto)}</TableCell>
                                <TableCell>{asString(gasto.descripcion, "—")}</TableCell>
                                <TableCell>{formatDate(gasto.fecha_gasto)}</TableCell>
                                <TableCell className="text-right">{formatMoney(gasto.monto_mxn ?? gasto.monto, "MXN")}</TableCell>
                                <TableCell className="text-right">
                                  <form
                                    action={deletePedimentoGastoAction.bind(null, selectedPedimentoForActionsId, String(gasto.id))}
                                    onSubmit={(event) => {
                                      if (!window.confirm("¿Eliminar este gasto del pedimento? Esta acción no se puede deshacer.")) {
                                        event.preventDefault()
                                      }
                                    }}
                                  >
                                    <Button type="submit" variant="ghost" size="sm">
                                      Eliminar
                                    </Button>
                                  </form>
                                </TableCell>
                              </TableRow>
                            ))
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                </>
              ) : (
                <div className="rounded-lg border border-dashed bg-muted/20 px-4 py-5 text-sm text-muted-foreground">
                  Selecciona un pedimento para capturar gastos.
                </div>
              )}
            </CardContent>
          </Card>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <CardTitle>Listado de pedimentos</CardTitle>
              <CardDescription>Selecciona un pedimento para ver órdenes, gastos y prorrateo.</CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" onClick={openCreatePedimentoModal}>
                Crear pedimento
              </Button>
              {selectedPedimentoForActions ? (
                <Button type="button" variant="outline" onClick={() => openEditPedimentoModal(selectedPedimentoForActions)}>
                  Editar
                </Button>
              ) : (
                <Button type="button" variant="outline" disabled>
                  Editar
                </Button>
              )}
              {selectedPedimentoForActions ? (
                <Button type="button" onClick={openPedimentoGastosModal}>
                  Gastos pedimento
                </Button>
              ) : (
                <Button type="button" disabled>
                  Gastos pedimento
                </Button>
              )}
              {selectedPedimentoForActions ? (
                <form action={recalcularPedimentoImportacionAction.bind(null, String(selectedPedimentoForActions.id))}>
                  <Button type="submit" variant="secondary">
                    Recalcular
                  </Button>
                </form>
              ) : (
                <Button type="button" variant="secondary" disabled>
                  Recalcular
                </Button>
              )}
              {selectedPedimentoForActions ? (
                <form action={deletePedimentoImportacionAction.bind(null, String(selectedPedimentoForActions.id))}>
                  <Button type="submit" variant="ghost">
                    Eliminar
                  </Button>
                </form>
              ) : (
                <Button type="button" variant="ghost" disabled>
                  Eliminar
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-hidden rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Número</TableHead>
                  <TableHead>Embarque</TableHead>
                  <TableHead>Agente</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead className="text-right">Costo global</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!pedimentos.length ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-6 text-center text-sm text-muted-foreground">
                      Aún no hay pedimentos registrados.
                    </TableCell>
                  </TableRow>
                ) : (
                  pedimentos.map((pedimento) => {
                    const agente = pedimento.agente_aduanal && typeof pedimento.agente_aduanal === "object" ? (pedimento.agente_aduanal as AnyRecord) : null
                    const currentId = String(pedimento.id)
                    return (
                      <TableRow key={currentId} className={currentId === (selectedPedimentoRowId || selectedPedimentoId) ? "bg-muted/30" : undefined}>
                        <TableCell className="font-mono text-xs">{asString(pedimento.numero_pedimento)}</TableCell>
                        <TableCell>{asString(pedimento.embarque, "—")}</TableCell>
                        <TableCell>{agente ? `${asString(agente.nombre)}${asString(agente.patente) ? ` · ${asString(agente.patente)}` : ""}` : "Sin agente"}</TableCell>
                        <TableCell>{asString(pedimento.estado)}</TableCell>
                        <TableCell>{formatDate(pedimento.fecha_pedimento)}</TableCell>
                        <TableCell className="text-right">{formatMoney(pedimento.costo_total_prorrateable, asString(pedimento.moneda, "MXN"))}</TableCell>
                        <TableCell className="text-right">
                          <div className="inline-flex gap-2">
                            <Button type="button" variant="outline" size="sm" onClick={() => setSelectedPedimentoRowId(currentId)}>
                              Seleccionar
                            </Button>
                            <Link href={`/compras?vista=pedimentos&pedimento_id=${encodeURIComponent(currentId)}`} className="inline-flex items-center rounded-md border border-input px-3 py-1.5 text-sm hover:bg-muted">
                              Ver
                            </Link>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={pedimentoDetailOpen && Boolean(selectedPedimento)} onOpenChange={handlePedimentoDetailOpenChange}>
        <DialogContent className="max-h-[92vh] w-[95vw] max-w-7xl overflow-y-auto p-0">
          {selectedPedimento ? (
            <div className="flex h-full flex-col">
              <DialogHeader className="border-b bg-background/95 px-4 py-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-1">
                    <DialogTitle className="text-2xl">
                      Pedimento {asString(selectedPedimento.numero_pedimento)}
                    </DialogTitle>
                    <DialogDescription>
                      Vista completa del pedimento, sus órdenes, gastos y prorrateo.
                    </DialogDescription>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="outline" onClick={() => openEditPedimentoModal(selectedPedimento)}>
                      Editar
                    </Button>
                    <form action={recalcularPedimentoImportacionAction.bind(null, String(selectedPedimento.id))}>
                      <Button type="submit" variant="secondary">
                        Recalcular
                      </Button>
                    </form>
                    <Button type="button" variant="ghost" onClick={() => handlePedimentoDetailOpenChange(false)}>
                      Cerrar
                    </Button>
                  </div>
                </div>
              </DialogHeader>
              <div className="space-y-4 px-4 py-4 pb-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Detalle del pedimento</CardTitle>
                    <CardDescription>Resumen operativo del pedimento seleccionado.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-4 md:grid-cols-5">
                      <div className="rounded-lg border bg-muted/20 p-4">
                        <div className="text-xs uppercase tracking-wide text-muted-foreground">Número</div>
                        <div className="mt-1 font-mono text-sm">{asString(selectedPedimento.numero_pedimento)}</div>
                      </div>
                      <div className="rounded-lg border bg-muted/20 p-4">
                        <div className="text-xs uppercase tracking-wide text-muted-foreground">Embarque</div>
                        <div className="mt-1 text-sm font-semibold">{asString(selectedPedimento.embarque, "—")}</div>
                      </div>
                      <div className="rounded-lg border bg-muted/20 p-4">
                        <div className="text-xs uppercase tracking-wide text-muted-foreground">Gastos pedimento</div>
                        <div className="mt-1 text-sm font-semibold">{formatMoney(selectedPedimento.gastos_pedimento_total, asString(selectedPedimento.moneda, "MXN"))}</div>
                      </div>
                      <div className="rounded-lg border bg-muted/20 p-4">
                        <div className="text-xs uppercase tracking-wide text-muted-foreground">Gastos órdenes</div>
                        <div className="mt-1 text-sm font-semibold">{formatMoney(selectedPedimento.gastos_ordenes_total, asString(selectedPedimento.moneda, "MXN"))}</div>
                      </div>
                      <div className="rounded-lg border bg-muted/20 p-4">
                        <div className="text-xs uppercase tracking-wide text-muted-foreground">Total prorrateable</div>
                        <div className="mt-1 text-sm font-semibold">{formatMoney(selectedPedimento.costo_total_prorrateable, asString(selectedPedimento.moneda, "MXN"))}</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Órdenes ligadas</CardTitle>
                    <CardDescription>Órdenes internacionales asociadas a este pedimento.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-hidden rounded-lg border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Folio</TableHead>
                            <TableHead>Rol</TableHead>
                            <TableHead>Estado</TableHead>
                            <TableHead className="text-right">Total</TableHead>
                            <TableHead className="text-right">Acciones</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {!selectedOrders.length ? (
                            <TableRow>
                              <TableCell colSpan={5} className="py-6 text-center text-sm text-muted-foreground">
                                No hay órdenes ligadas todavía.
                              </TableCell>
                            </TableRow>
                          ) : (
                            selectedOrders.map((row) => {
                              const order = row.orden_compra && typeof row.orden_compra === "object" ? (row.orden_compra as AnyRecord) : null
                              return (
                                <TableRow key={String(row.id)}>
                                  <TableCell className="font-mono text-xs">{asString(order?.folio)}</TableCell>
                                  <TableCell>{asString(row.rol)}</TableCell>
                                  <TableCell>{asString(order?.estado)}</TableCell>
                                  <TableCell className="text-right">{formatMoney(order?.total, asString(order?.moneda, "MXN"))}</TableCell>
                                  <TableCell className="text-right">
                                    <form action={detachPedimentoOrdenAction.bind(null, String(selectedPedimento.id), String(row.orden_compra_id))}>
                                      <Button type="submit" variant="ghost" size="sm">
                                        Quitar
                                      </Button>
                                    </form>
                                  </TableCell>
                                </TableRow>
                              )
                            })
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Gastos del pedimento</CardTitle>
                    <CardDescription>Listado de gastos ya capturados para este pedimento.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-hidden rounded-lg border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Tipo</TableHead>
                            <TableHead>Descripción</TableHead>
                            <TableHead>Fecha</TableHead>
                            <TableHead className="text-right">Monto</TableHead>
                            <TableHead className="text-right">Acciones</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {!selectedGastos.length ? (
                            <TableRow>
                              <TableCell colSpan={5} className="py-6 text-center text-sm text-muted-foreground">
                                No hay gastos capturados.
                              </TableCell>
                            </TableRow>
                          ) : (
                            selectedGastos.map((gasto) => (
                              <TableRow key={String(gasto.id)}>
                                <TableCell>{asString(gasto.tipo_gasto)}</TableCell>
                                <TableCell>{asString(gasto.descripcion, "—")}</TableCell>
                                <TableCell>{formatDate(gasto.fecha_gasto)}</TableCell>
                                <TableCell className="text-right">{formatMoney(gasto.monto_mxn ?? gasto.monto, "MXN")}</TableCell>
                                <TableCell className="text-right">
                                  <form action={deletePedimentoGastoAction.bind(null, String(selectedPedimento.id), String(gasto.id))}>
                                    <Button type="submit" variant="ghost" size="sm">
                                      Eliminar
                                    </Button>
                                  </form>
                                </TableCell>
                              </TableRow>
                            ))
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Prorrateo por item</CardTitle>
                    <CardDescription>
                      Todos los items de las órdenes ligadas comparten el mismo costo aduanal total normalizado a MXN.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="mb-4 grid gap-3 md:grid-cols-3">
                      <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
                        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Gastos pedimento</div>
                        <div className="mt-1 text-sm font-semibold">
                          {formatMoney(asNumber(selectedPedimento?.gastos_pedimento_total), "MXN")}
                        </div>
                      </div>
                      <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
                        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Gastos órdenes</div>
                        <div className="mt-1 text-sm font-semibold">
                          {formatMoney(asNumber(selectedPedimento?.gastos_ordenes_total), "MXN")}
                        </div>
                      </div>
                      <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
                        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Total prorrateable</div>
                        <div className="mt-1 text-sm font-semibold">
                          {formatMoney(asNumber(selectedPedimento?.costo_total_prorrateable), "MXN")}
                        </div>
                      </div>
                    </div>
                    <div className="overflow-hidden rounded-lg border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>#</TableHead>
                            <TableHead>Orden</TableHead>
                            <TableHead>Partida</TableHead>
                            <TableHead className="text-right">Cantidad</TableHead>
                            <TableHead>Item</TableHead>
                            <TableHead className="text-right">Base OC MXN</TableHead>
                            <TableHead className="text-right">Base total MXN</TableHead>
                            <TableHead className="text-right">Inc %</TableHead>
                            <TableHead className="text-right">Inc. unit. MXN</TableHead>
                            <TableHead className="text-right">Total unit. MXN</TableHead>
                            <TableHead className="text-right">Total línea MXN</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {!selectedProrrateos.length ? (
                            <TableRow>
                              <TableCell colSpan={11} className="py-6 text-center text-sm text-muted-foreground">
                                No hay prorrateo calculado todavía.
                              </TableCell>
                            </TableRow>
                          ) : (
                            selectedProrrateos.map((prorrateo, index) => {
                              const item = prorrateo.orden_compra_item && typeof prorrateo.orden_compra_item === "object" ? (prorrateo.orden_compra_item as AnyRecord) : null
                              const order = prorrateo.orden_compra && typeof prorrateo.orden_compra === "object" ? (prorrateo.orden_compra as AnyRecord) : null
                              const quantity = asNumber(item?.cantidad_solicitada, asNumber(item?.cantidad_recibida, 0))
                              const baseTotalMxn = asNumber(prorrateo.base_total_mxn, 0)
                              const baseUnitMxn = quantity > 0 ? baseTotalMxn / quantity : 0
                              const extraUnitMxn = asNumber(prorrateo.costo_unitario_adicional, 0)
                              const extraUnitPercent = baseUnitMxn > 0 ? (extraUnitMxn / baseUnitMxn) * 100 : 0
                              const totalUnitMxn = baseUnitMxn + extraUnitMxn
                              const totalLineMxn = totalUnitMxn * quantity
                              return (
                                <TableRow key={String(prorrateo.id)}>
                                  <TableCell className="text-xs text-muted-foreground">{index + 1}</TableCell>
                                  <TableCell className="font-mono text-xs">{asString(order?.folio, "—")}</TableCell>
                                  <TableCell>{asString(item?.numero_partida, "—")}</TableCell>
                                  <TableCell className="text-right">{quantity.toFixed(3)}</TableCell>
                                  <TableCell>{asString(item?.descripcion, "—")}</TableCell>
                                  <TableCell className="text-right">{formatMoney(baseUnitMxn, "MXN")}</TableCell>
                                  <TableCell className="text-right">{formatMoney(baseTotalMxn, "MXN")}</TableCell>
                                  <TableCell className="text-right">{extraUnitPercent.toFixed(4)}%</TableCell>
                                  <TableCell className="text-right">{formatMoney(extraUnitMxn, "MXN")}</TableCell>
                                  <TableCell className="text-right">{formatMoney(totalUnitMxn, "MXN")}</TableCell>
                                  <TableCell className="text-right">{formatMoney(totalLineMxn, "MXN")}</TableCell>
                                </TableRow>
                              )
                            })
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}
