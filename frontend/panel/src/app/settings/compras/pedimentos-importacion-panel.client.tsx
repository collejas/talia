"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"

import {
  attachPedimentoOrdenAction,
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

function formatDate(value: unknown): string {
  const raw = asString(value)
  if (!raw) return "—"
  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) return raw
  return new Intl.DateTimeFormat("es-MX", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date)
}

function formatDateTime(value: unknown): string {
  const raw = asString(value)
  if (!raw) return "—"
  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) return raw
  return new Intl.DateTimeFormat("es-MX", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)
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

function buildLinkFormState() {
  return {
    orden_compra_id: "",
    rol: "principal",
    observaciones: "",
  }
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
  const [editingAgentId, setEditingAgentId] = useState<string | null>(null)
  const [agentForm, setAgentForm] = useState(() => buildAgentFormState())
  const [editingPedimentoId, setEditingPedimentoId] = useState<string | null>(null)
  const [pedimentoForm, setPedimentoForm] = useState(() => buildPedimentoFormState())
  const [gastoForm, setGastoForm] = useState(() => buildGastoFormState())
  const [linkForm, setLinkForm] = useState(() => buildLinkFormState())

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
    } else {
      setPedimentoForm(buildPedimentoFormState())
    }
  }, [editingPedimentoId, pedimentos])

  useEffect(() => {
    setGastoForm(buildGastoFormState())
    setLinkForm(buildLinkFormState())
  }, [selectedPedimentoId])

  const selectedOrders = useMemo(() => getPedimentoOrders(selectedPedimento), [selectedPedimento])
  const selectedGastos = useMemo(() => getPedimentoGastos(selectedPedimento), [selectedPedimento])
  const selectedProrrateos = useMemo(() => getPedimentoProrrateos(selectedPedimento), [selectedPedimento])
  const selectedOrderIds = useMemo(() => new Set(selectedOrders.map((row) => String(row.orden_compra_id ?? row.orden_compra?.id ?? ""))), [selectedOrders])
  const selectableOrders = useMemo(
    () =>
      ordenes.filter((orden) => {
        if (String(orden.tipo_operacion ?? "").toLowerCase() !== "internacional") {
          return false
        }
        return !selectedOrderIds.has(String(orden.id))
      }),
    [ordenes, selectedOrderIds],
  )

  const moneyOptions = monedas.length ? monedas : [{ codigo: "MXN", nombre: "Peso mexicano" }]

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
      <Card>
        <CardHeader>
          <CardTitle>Pedimentos de importación</CardTitle>
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
                <Input id="pedimento-subtotal" name="subtotal_aduanal" type="number" step="0.0001" min="0" value={pedimentoForm.subtotal_aduanal} onChange={(event) => setPedimentoForm((prev) => ({ ...prev, subtotal_aduanal: event.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pedimento-observaciones">Observaciones</Label>
                <Textarea id="pedimento-observaciones" name="observaciones" value={pedimentoForm.observaciones} onChange={(event) => setPedimentoForm((prev) => ({ ...prev, observaciones: event.target.value }))} />
              </div>
            </div>
            <div className="flex gap-2">
              <Button type="submit">{editingPedimentoId ? "Actualizar pedimento" : "Guardar pedimento"}</Button>
              {editingPedimentoId ? (
                <Button type="button" variant="outline" onClick={() => setEditingPedimentoId(null)}>
                  Cancelar
                </Button>
              ) : null}
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Listado de pedimentos</CardTitle>
          <CardDescription>Selecciona un pedimento para ver órdenes, gastos y prorrateo.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-hidden rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Número</TableHead>
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
                    <TableCell colSpan={6} className="py-6 text-center text-sm text-muted-foreground">
                      Aún no hay pedimentos registrados.
                    </TableCell>
                  </TableRow>
                ) : (
                  pedimentos.map((pedimento) => {
                    const agente = pedimento.agente_aduanal && typeof pedimento.agente_aduanal === "object" ? (pedimento.agente_aduanal as AnyRecord) : null
                    const currentId = String(pedimento.id)
                    return (
                      <TableRow key={currentId} className={currentId === selectedPedimentoId ? "bg-muted/30" : undefined}>
                        <TableCell className="font-mono text-xs">{asString(pedimento.numero_pedimento)}</TableCell>
                        <TableCell>{agente ? `${asString(agente.nombre)}${asString(agente.patente) ? ` · ${asString(agente.patente)}` : ""}` : "Sin agente"}</TableCell>
                        <TableCell>{asString(pedimento.estado)}</TableCell>
                        <TableCell>{formatDate(pedimento.fecha_pedimento)}</TableCell>
                        <TableCell className="text-right">{formatMoney(pedimento.costo_total_prorrateable, asString(pedimento.moneda, "MXN"))}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Link href={`/compras?vista=pedimentos&pedimento_id=${encodeURIComponent(currentId)}`} className="inline-flex items-center rounded-md border border-input px-3 py-1.5 text-sm hover:bg-muted">
                              Ver
                            </Link>
                            <Button type="button" variant="outline" size="sm" onClick={() => {
                              setEditingPedimentoId(currentId)
                              setPedimentoForm(buildPedimentoFormState(pedimento))
                            }}>
                              Editar
                            </Button>
                            <form action={deletePedimentoImportacionAction.bind(null, currentId)}>
                              <Button type="submit" variant="ghost" size="sm">
                                Eliminar
                              </Button>
                            </form>
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

      {selectedPedimento ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Detalle del pedimento</CardTitle>
              <CardDescription>Los totales se recalculan con los gastos del pedimento y los gastos tipo gasto de las órdenes ligadas.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-4">
                <div className="rounded-lg border bg-muted/20 p-4">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Número</div>
                  <div className="mt-1 font-mono text-sm">{asString(selectedPedimento.numero_pedimento)}</div>
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
              <div className="flex flex-wrap gap-2">
                <form action={recalcularPedimentoImportacionAction.bind(null, String(selectedPedimento.id))}>
                  <Button type="submit">Recalcular</Button>
                </form>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Órdenes ligadas</CardTitle>
              <CardDescription>Solo se permiten órdenes internacionales de la misma organización.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <form action={attachPedimentoOrdenAction.bind(null, String(selectedPedimento.id))} className="grid gap-4 md:grid-cols-4">
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="pedimento-orden">Orden internacional</Label>
                  <select id="pedimento-orden" name="orden_compra_id" value={linkForm.orden_compra_id} onChange={(event) => setLinkForm((prev) => ({ ...prev, orden_compra_id: event.target.value }))} className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" required>
                    <option value="">Selecciona una orden</option>
                    {selectableOrders.map((orden) => (
                      <option key={String(orden.id)} value={String(orden.id)}>
                        {asString(orden.folio)} · {formatMoney(orden.total, asString(orden.moneda, "MXN"))}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pedimento-rol">Rol</Label>
                  <select id="pedimento-rol" name="rol" value={linkForm.rol} onChange={(event) => setLinkForm((prev) => ({ ...prev, rol: event.target.value }))} className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                    <option value="principal">Principal</option>
                    <option value="complementaria">Complementaria</option>
                    <option value="parcial">Parcial</option>
                  </select>
                </div>
                <div className="space-y-2 md:col-span-4">
                  <Label htmlFor="pedimento-orden-observaciones">Observaciones</Label>
                  <Input id="pedimento-orden-observaciones" name="observaciones" value={linkForm.observaciones} onChange={(event) => setLinkForm((prev) => ({ ...prev, observaciones: event.target.value }))} />
                </div>
                <div className="md:col-span-4">
                  <Button type="submit">Ligar orden</Button>
                </div>
              </form>

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
              <CardDescription>Estos gastos se suman a los gastos de las órdenes para el total prorrateable.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <form action={createPedimentoGastoAction.bind(null, String(selectedPedimento.id))} className="grid gap-4 md:grid-cols-4">
                <div className="space-y-2">
                  <Label htmlFor="gasto-tipo">Tipo</Label>
                  <Input id="gasto-tipo" name="tipo_gasto" value={gastoForm.tipo_gasto} onChange={(event) => setGastoForm((prev) => ({ ...prev, tipo_gasto: event.target.value }))} placeholder="Agente aduanal, maniobras..." required />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="gasto-descripcion">Descripción</Label>
                  <Input id="gasto-descripcion" name="descripcion" value={gastoForm.descripcion} onChange={(event) => setGastoForm((prev) => ({ ...prev, descripcion: event.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="gasto-monto">Monto</Label>
                  <Input id="gasto-monto" name="monto" type="number" step="0.0001" min="0" value={gastoForm.monto} onChange={(event) => setGastoForm((prev) => ({ ...prev, monto: event.target.value }))} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="gasto-moneda">Moneda</Label>
                  <select id="gasto-moneda" name="moneda" value={gastoForm.moneda} onChange={(event) => setGastoForm((prev) => ({ ...prev, moneda: event.target.value }))} className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                    {moneyOptions.map((moneda) => (
                      <option key={String(moneda.codigo)} value={String(moneda.codigo)}>
                        {asString(moneda.codigo)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="gasto-tipo-cambio">Tipo cambio</Label>
                  <Input id="gasto-tipo-cambio" name="tipo_cambio" type="number" step="0.000001" min="0" value={gastoForm.tipo_cambio} onChange={(event) => setGastoForm((prev) => ({ ...prev, tipo_cambio: event.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="gasto-fecha">Fecha</Label>
                  <Input id="gasto-fecha" name="fecha_gasto" type="date" value={gastoForm.fecha_gasto} onChange={(event) => setGastoForm((prev) => ({ ...prev, fecha_gasto: event.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="gasto-factura">Factura</Label>
                  <Input id="gasto-factura" name="referencia_factura" value={gastoForm.referencia_factura} onChange={(event) => setGastoForm((prev) => ({ ...prev, referencia_factura: event.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="gasto-estado">Estado</Label>
                  <select id="gasto-estado" name="estado" value={gastoForm.estado} onChange={(event) => setGastoForm((prev) => ({ ...prev, estado: event.target.value }))} className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                    <option value="pendiente">Pendiente</option>
                    <option value="registrado">Registrado</option>
                    <option value="pagado">Pagado</option>
                    <option value="cancelado">Cancelado</option>
                  </select>
                </div>
                <div className="space-y-2 md:col-span-4">
                  <Label htmlFor="gasto-observaciones">Observaciones</Label>
                  <Textarea id="gasto-observaciones" name="observaciones" value={gastoForm.observaciones} onChange={(event) => setGastoForm((prev) => ({ ...prev, observaciones: event.target.value }))} />
                </div>
                <div className="md:col-span-4">
                  <Button type="submit">Agregar gasto</Button>
                </div>
              </form>

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
              <CardDescription>Todos los items de las órdenes ligadas comparten el mismo costo aduanal total.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-hidden rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Orden</TableHead>
                      <TableHead>Partida</TableHead>
                      <TableHead>Item</TableHead>
                      <TableHead className="text-right">Base</TableHead>
                      <TableHead className="text-right">%</TableHead>
                      <TableHead className="text-right">Asignado</TableHead>
                      <TableHead className="text-right">Adicional unitario</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {!selectedProrrateos.length ? (
                      <TableRow>
                        <TableCell colSpan={7} className="py-6 text-center text-sm text-muted-foreground">
                          No hay prorrateo calculado todavía.
                        </TableCell>
                      </TableRow>
                    ) : (
                      selectedProrrateos.map((prorrateo) => {
                        const item = prorrateo.orden_compra_item && typeof prorrateo.orden_compra_item === "object" ? (prorrateo.orden_compra_item as AnyRecord) : null
                        const order = prorrateo.orden_compra && typeof prorrateo.orden_compra === "object" ? (prorrateo.orden_compra as AnyRecord) : null
                        return (
                          <TableRow key={String(prorrateo.id)}>
                            <TableCell className="font-mono text-xs">{asString(order?.folio, "—")}</TableCell>
                            <TableCell>{asString(item?.numero_partida, "—")}</TableCell>
                            <TableCell>{asString(item?.descripcion, "—")}</TableCell>
                            <TableCell className="text-right">{formatMoney(prorrateo.base_item, asString(selectedPedimento.moneda, "MXN"))}</TableCell>
                            <TableCell className="text-right">{(asNumber(prorrateo.porcentaje_prorrateo) * 100).toFixed(4)}%</TableCell>
                            <TableCell className="text-right">{formatMoney(prorrateo.costo_total_asignado, asString(selectedPedimento.moneda, "MXN"))}</TableCell>
                            <TableCell className="text-right">{formatMoney(prorrateo.costo_unitario_adicional, asString(selectedPedimento.moneda, "MXN"))}</TableCell>
                          </TableRow>
                        )
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  )
}
