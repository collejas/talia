"use client"

import { FormEvent, useMemo, useState } from "react"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import {
  archiveCommercialPlanAction,
  archiveCommercialPlanEntitlementAction,
  archiveCommercialPlanPriceAction,
  createCommercialPlanAction,
  createCommercialPlanEntitlementAction,
  createCommercialPlanPriceAction,
  updateCommercialPlanAction,
  updateCommercialPlanEntitlementAction,
  updateCommercialPlanPriceAction,
} from "./actions"

type CommercialPlan = {
  id: string
  code: string
  name: string
  description?: string | null
  active: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

type CommercialPlanPrice = {
  id: string
  plan_id: string
  billing_provider: string
  provider_product_id: string
  provider_price_id: string
  currency: string
  billing_interval: string
  amount_cents: number
  active: boolean
}

type CommercialPlanEntitlement = {
  id: string
  plan_id: string
  entitlement_key: string
  value_type: string
  enabled: boolean
  limit_value?: number | null
  value_text?: string | null
  value_json?: unknown
  limit_unit?: string | null
  scope?: string | null
  created_at: string
}

type PriceFormState = {
  planId: string
  billingProvider: string
  providerProductId: string
  providerPriceId: string
  currency: string
  billingInterval: CommercialPlanPrice["billing_interval"]
  amountCents: string
  active: boolean
}

type EntitlementFormState = {
  planId: string
  entitlementKey: string
  valueType: CommercialPlanEntitlement["value_type"]
  enabled: boolean
  limitValue: string
  valueText: string
  valueJson: string
  limitUnit: string
  scope: string
}

type FormState = {
  code: string
  name: string
  description: string
  sortOrder: string
  active: boolean
}

type Props = {
  plans: CommercialPlan[]
  prices: CommercialPlanPrice[]
  entitlements: CommercialPlanEntitlement[]
}

function formatMoney(amountCents: number, currency: string): string {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: currency || "MXN",
    maximumFractionDigits: 0,
  }).format(amountCents / 100)
}

function priceLabel(price: CommercialPlanPrice | undefined): string {
  if (!price) return "Sin precio activo"
  const intervalLabel =
    price.billing_interval === "month"
      ? "/ mes"
      : price.billing_interval === "year"
        ? "/ año"
        : price.billing_interval === "one_time"
          ? "único"
          : price.billing_interval
  return `${formatMoney(price.amount_cents, price.currency)} ${intervalLabel}`.trim()
}

export function CommercialPlansManager({ plans, prices, entitlements }: Props) {
  const router = useRouter()
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loadingPlanId, setLoadingPlanId] = useState<string | null>(null)
  const [priceMessage, setPriceMessage] = useState<string | null>(null)
  const [priceError, setPriceError] = useState<string | null>(null)
  const [editingPriceId, setEditingPriceId] = useState<string | null>(null)
  const [loadingPriceId, setLoadingPriceId] = useState<string | null>(null)
  const [entitlementMessage, setEntitlementMessage] = useState<string | null>(null)
  const [entitlementError, setEntitlementError] = useState<string | null>(null)
  const [editingEntitlementId, setEditingEntitlementId] = useState<string | null>(null)
  const [loadingEntitlementId, setLoadingEntitlementId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>({
    code: "",
    name: "",
    description: "",
    sortOrder: "0",
    active: true,
  })
  const [priceForm, setPriceForm] = useState<PriceFormState>({
    planId: "",
    billingProvider: "stripe",
    providerProductId: "",
    providerPriceId: "",
    currency: "MXN",
    billingInterval: "month",
    amountCents: "0",
    active: true,
  })
  const [entitlementForm, setEntitlementForm] = useState<EntitlementFormState>({
    planId: "",
    entitlementKey: "",
    valueType: "boolean",
    enabled: true,
    limitValue: "",
    valueText: "",
    valueJson: "",
    limitUnit: "",
    scope: "",
  })

  const priceByPlanId = useMemo(() => {
    const map = new Map<string, CommercialPlanPrice>()
    for (const price of prices) {
      if (!price.active || map.has(price.plan_id)) continue
      map.set(price.plan_id, price)
    }
    return map
  }, [prices])

  const sortedPlans = useMemo(() => [...plans].sort((a, b) => a.sort_order - b.sort_order), [plans])
  const sortedPrices = useMemo(
    () =>
      [...prices].sort((a, b) => {
        if (a.active !== b.active) return a.active ? -1 : 1
        if (a.plan_id !== b.plan_id) return a.plan_id.localeCompare(b.plan_id)
        if (a.amount_cents !== b.amount_cents) return a.amount_cents - b.amount_cents
        return a.provider_price_id.localeCompare(b.provider_price_id)
      }),
    [prices],
  )

  const planNameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const plan of plans) {
      map.set(plan.id, `${plan.name} (${plan.code})`)
    }
    return map
  }, [plans])

  const sortedEntitlements = useMemo(
    () =>
      [...entitlements].sort((a, b) => {
        if (a.plan_id !== b.plan_id) return a.plan_id.localeCompare(b.plan_id)
        return a.entitlement_key.localeCompare(b.entitlement_key)
      }),
    [entitlements],
  )

  const resetForm = () => {
    setEditingPlanId(null)
    setForm({
      code: "",
      name: "",
      description: "",
      sortOrder: "0",
      active: true,
    })
  }

  const resetPriceForm = () => {
    setEditingPriceId(null)
    setPriceForm({
      planId: plans[0]?.id ?? "",
      billingProvider: "stripe",
      providerProductId: "",
      providerPriceId: "",
      currency: "MXN",
      billingInterval: "month",
      amountCents: "0",
      active: true,
    })
  }

  const resetEntitlementForm = () => {
    setEditingEntitlementId(null)
    setEntitlementForm({
      planId: plans[0]?.id ?? "",
      entitlementKey: "",
      valueType: "boolean",
      enabled: true,
      limitValue: "",
      valueText: "",
      valueJson: "",
      limitUnit: "",
      scope: "",
    })
  }

  const startEdit = (plan: CommercialPlan) => {
    setMessage(null)
    setError(null)
    setEditingPlanId(plan.id)
    setForm({
      code: plan.code,
      name: plan.name,
      description: plan.description ?? "",
      sortOrder: String(plan.sort_order ?? 0),
      active: plan.active,
    })
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  const startEditPrice = (price: CommercialPlanPrice) => {
    setPriceMessage(null)
    setPriceError(null)
    setEditingPriceId(price.id)
    setPriceForm({
      planId: price.plan_id,
      billingProvider: price.billing_provider,
      providerProductId: price.provider_product_id,
      providerPriceId: price.provider_price_id,
      currency: price.currency,
      billingInterval: price.billing_interval,
      amountCents: String(price.amount_cents),
      active: price.active,
    })
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  const startEditEntitlement = (entitlement: CommercialPlanEntitlement) => {
    setEntitlementMessage(null)
    setEntitlementError(null)
    setEditingEntitlementId(entitlement.id)
    setEntitlementForm({
      planId: entitlement.plan_id,
      entitlementKey: entitlement.entitlement_key,
      valueType: entitlement.value_type,
      enabled: entitlement.enabled,
      limitValue: entitlement.limit_value === null || entitlement.limit_value === undefined ? "" : String(entitlement.limit_value),
      valueText: entitlement.value_text ?? "",
      valueJson:
        entitlement.value_json === null || entitlement.value_json === undefined
          ? ""
          : JSON.stringify(entitlement.value_json, null, 2),
      limitUnit: entitlement.limit_unit ?? "",
      scope: entitlement.scope ?? "",
    })
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  const submitPlan = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setMessage(null)
    setError(null)
    const body = new FormData()
    body.set("name", form.name)
    if (form.description.trim()) {
      body.set("description", form.description)
    }
    body.set("sort_order", form.sortOrder)
    body.set("active", form.active ? "true" : "false")
    if (editingPlanId) {
      body.set("plan_id", editingPlanId)
    } else {
      body.set("code", form.code)
    }

    setLoadingPlanId(editingPlanId ?? "new")
    try {
      const result = editingPlanId
        ? await updateCommercialPlanAction({ ok: true, message: "" }, body)
        : await createCommercialPlanAction({ ok: true, message: "" }, body)
      if (!result.ok) {
        setError(result.error)
        return
      }
      setMessage(result.message)
      resetForm()
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar el plan.")
    } finally {
      setLoadingPlanId(null)
    }
  }

  const submitPrice = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setPriceMessage(null)
    setPriceError(null)
    const body = new FormData()
    body.set("plan_id", priceForm.planId)
    body.set("billing_provider", priceForm.billingProvider)
    body.set("provider_product_id", priceForm.providerProductId)
    body.set("provider_price_id", priceForm.providerPriceId)
    body.set("currency", priceForm.currency)
    body.set("billing_interval", priceForm.billingInterval)
    body.set("amount_cents", priceForm.amountCents)
    body.set("active", priceForm.active ? "true" : "false")
    if (editingPriceId) {
      body.set("price_id", editingPriceId)
    }

    setLoadingPriceId(editingPriceId ?? "new")
    try {
      const result = editingPriceId
        ? await updateCommercialPlanPriceAction({ ok: true, message: "" }, body)
        : await createCommercialPlanPriceAction({ ok: true, message: "" }, body)
      if (!result.ok) {
        setPriceError(result.error)
        return
      }
      setPriceMessage(result.message)
      resetPriceForm()
      router.refresh()
    } catch (err) {
      setPriceError(err instanceof Error ? err.message : "No se pudo guardar el precio.")
    } finally {
      setLoadingPriceId(null)
    }
  }

  const handleArchive = async (planId: string) => {
    setMessage(null)
    setError(null)
    if (!window.confirm("¿Desactivar este plan comercial?")) {
      return
    }
    const body = new FormData()
    body.set("plan_id", planId)
    setLoadingPlanId(planId)
    try {
      const result = await archiveCommercialPlanAction(body)
      if (!result.ok) {
        setError(result.error)
        return
      }
      setMessage(result.message)
      if (editingPlanId === planId) {
        resetForm()
      }
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo desactivar el plan.")
    } finally {
      setLoadingPlanId(null)
    }
  }

  const handleArchivePrice = async (priceId: string) => {
    setPriceMessage(null)
    setPriceError(null)
    if (!window.confirm("¿Desactivar este precio comercial?")) {
      return
    }
    const body = new FormData()
    body.set("price_id", priceId)
    setLoadingPriceId(priceId)
    try {
      const result = await archiveCommercialPlanPriceAction(body)
      if (!result.ok) {
        setPriceError(result.error)
        return
      }
      setPriceMessage(result.message)
      if (editingPriceId === priceId) {
        resetPriceForm()
      }
      router.refresh()
    } catch (err) {
      setPriceError(err instanceof Error ? err.message : "No se pudo desactivar el precio.")
    } finally {
      setLoadingPriceId(null)
    }
  }

  const submitEntitlement = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setEntitlementMessage(null)
    setEntitlementError(null)
    const body = new FormData()
    body.set("plan_id", entitlementForm.planId)
    body.set("entitlement_key", entitlementForm.entitlementKey)
    body.set("value_type", entitlementForm.valueType)
    body.set("enabled", entitlementForm.enabled ? "true" : "false")
    if (entitlementForm.limitValue.trim()) {
      body.set("limit_value", entitlementForm.limitValue)
    }
    if (entitlementForm.valueText.trim()) {
      body.set("value_text", entitlementForm.valueText)
    }
    if (entitlementForm.valueJson.trim()) {
      body.set("value_json", entitlementForm.valueJson)
    }
    if (entitlementForm.limitUnit.trim()) {
      body.set("limit_unit", entitlementForm.limitUnit)
    }
    if (entitlementForm.scope.trim()) {
      body.set("scope", entitlementForm.scope)
    }
    if (editingEntitlementId) {
      body.set("entitlement_id", editingEntitlementId)
    }

    setLoadingEntitlementId(editingEntitlementId ?? "new")
    try {
      const result = editingEntitlementId
        ? await updateCommercialPlanEntitlementAction({ ok: true, message: "" }, body)
        : await createCommercialPlanEntitlementAction({ ok: true, message: "" }, body)
      if (!result.ok) {
        setEntitlementError(result.error)
        return
      }
      setEntitlementMessage(result.message)
      resetEntitlementForm()
      router.refresh()
    } catch (err) {
      setEntitlementError(err instanceof Error ? err.message : "No se pudo guardar el entitlement.")
    } finally {
      setLoadingEntitlementId(null)
    }
  }

  const handleArchiveEntitlement = async (entitlementId: string) => {
    setEntitlementMessage(null)
    setEntitlementError(null)
    if (!window.confirm("¿Desactivar este entitlement?")) {
      return
    }
    const body = new FormData()
    body.set("entitlement_id", entitlementId)
    setLoadingEntitlementId(entitlementId)
    try {
      const result = await archiveCommercialPlanEntitlementAction(body)
      if (!result.ok) {
        setEntitlementError(result.error)
        return
      }
      setEntitlementMessage(result.message)
      if (editingEntitlementId === entitlementId) {
        resetEntitlementForm()
      }
      router.refresh()
    } catch (err) {
      setEntitlementError(err instanceof Error ? err.message : "No se pudo desactivar el entitlement.")
    } finally {
      setLoadingEntitlementId(null)
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="space-y-1">
          <CardTitle>{editingPlanId ? "Editar plan comercial" : "Crear plan comercial"}</CardTitle>
          <CardDescription>
            Los planes son catálogo de plataforma. No se borran físicamente; se desactivan para mantener historial.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {message ? (
            <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
              {message}
            </div>
          ) : null}
          {error ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          ) : null}
          <form className="space-y-4" onSubmit={submitPlan}>
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="commercial-plan-code">Código</Label>
                <Input
                  id="commercial-plan-code"
                  value={form.code}
                  onChange={(event) => setForm((prev) => ({ ...prev, code: event.target.value }))}
                  placeholder="starter"
                  disabled={Boolean(editingPlanId)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="commercial-plan-name">Nombre</Label>
                <Input
                  id="commercial-plan-name"
                  value={form.name}
                  onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                  placeholder="Plan Starter"
                  required
                />
              </div>
              <div className="space-y-2 lg:col-span-2">
                <Label htmlFor="commercial-plan-description">Descripción</Label>
                <Input
                  id="commercial-plan-description"
                  value={form.description}
                  onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
                  placeholder="Qué incluye este plan"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="commercial-plan-sort-order">Orden</Label>
                <Input
                  id="commercial-plan-sort-order"
                  type="number"
                  min={0}
                  max={9999}
                  value={form.sortOrder}
                  onChange={(event) => setForm((prev) => ({ ...prev, sortOrder: event.target.value }))}
                />
              </div>
              <div className="flex items-end gap-3 rounded-lg border border-border/60 px-3 py-2">
                <input
                  id="commercial-plan-active"
                  type="checkbox"
                  checked={form.active}
                  onChange={(event) => setForm((prev) => ({ ...prev, active: event.target.checked }))}
                  className="h-4 w-4 rounded border-border"
                />
                <Label htmlFor="commercial-plan-active" className="cursor-pointer">
                  Plan activo
                </Label>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={loadingPlanId !== null}>
                {loadingPlanId === (editingPlanId ?? "new")
                  ? "Guardando..."
                  : editingPlanId
                    ? "Actualizar plan"
                    : "Crear plan"}
              </Button>
              {editingPlanId ? (
                <Button type="button" variant="outline" onClick={resetForm}>
                  Cancelar edición
                </Button>
              ) : null}
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="space-y-1">
          <CardTitle>Catálogo de planes</CardTitle>
          <CardDescription>
            Se muestran los planes activos e inactivos con su precio activo actual cuando existe.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-lg border border-border/60">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Nombre</TableHead>
                  <TableHead className="hidden lg:table-cell">Precio activo</TableHead>
                  <TableHead className="hidden xl:table-cell">Orden</TableHead>
                  <TableHead className="hidden md:table-cell">Estado</TableHead>
                  <TableHead>Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedPlans.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                      No hay planes comerciales todavía.
                    </TableCell>
                  </TableRow>
                ) : (
                  sortedPlans.map((plan) => {
                    const price = priceByPlanId.get(plan.id)
                    const isLoading = loadingPlanId === plan.id
                    return (
                      <TableRow key={plan.id}>
                        <TableCell className="font-mono text-xs">{plan.code}</TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <div className="font-medium">{plan.name}</div>
                            {plan.description ? (
                              <div className="text-xs text-muted-foreground">{plan.description}</div>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell text-sm">
                          {priceLabel(price)}
                        </TableCell>
                        <TableCell className="hidden xl:table-cell">{plan.sort_order}</TableCell>
                        <TableCell className="hidden md:table-cell text-sm">
                          {plan.active ? "Activo" : "Inactivo"}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-2">
                            <Button size="sm" variant="outline" onClick={() => startEdit(plan)}>
                              Editar
                            </Button>
                            <Button
                              size="sm"
                              variant={plan.active ? "destructive" : "secondary"}
                              disabled={isLoading}
                              onClick={() => void handleArchive(plan.id)}
                            >
                              {plan.active ? "Desactivar" : "Inactivo"}
                            </Button>
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

      <Card>
        <CardHeader className="space-y-1">
          <CardTitle>{editingPriceId ? "Editar precio comercial" : "Crear precio comercial"}</CardTitle>
          <CardDescription>
            Cada plan puede tener varios precios por moneda o intervalo. Los precios son catálogo de cobro, no
            configuración por tenant.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {priceMessage ? (
            <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
              {priceMessage}
            </div>
          ) : null}
          {priceError ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {priceError}
            </div>
          ) : null}
          <form className="space-y-4" onSubmit={submitPrice}>
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="commercial-plan-price-plan">Plan</Label>
                <select
                  id="commercial-plan-price-plan"
                  value={priceForm.planId}
                  onChange={(event) => setPriceForm((prev) => ({ ...prev, planId: event.target.value }))}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  required
                >
                  <option value="">Selecciona un plan</option>
                  {sortedPlans.map((plan) => (
                    <option key={plan.id} value={plan.id}>
                      {plan.name} ({plan.code})
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="commercial-plan-price-provider">Proveedor</Label>
                <Input
                  id="commercial-plan-price-provider"
                  value={priceForm.billingProvider}
                  onChange={(event) => setPriceForm((prev) => ({ ...prev, billingProvider: event.target.value }))}
                  placeholder="stripe"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="commercial-plan-price-product">Product ID</Label>
                <Input
                  id="commercial-plan-price-product"
                  value={priceForm.providerProductId}
                  onChange={(event) =>
                    setPriceForm((prev) => ({ ...prev, providerProductId: event.target.value }))
                  }
                  placeholder="prod_xxx"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="commercial-plan-price-price">Price ID</Label>
                <Input
                  id="commercial-plan-price-price"
                  value={priceForm.providerPriceId}
                  onChange={(event) => setPriceForm((prev) => ({ ...prev, providerPriceId: event.target.value }))}
                  placeholder="price_xxx"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="commercial-plan-price-currency">Moneda</Label>
                <Input
                  id="commercial-plan-price-currency"
                  value={priceForm.currency}
                  onChange={(event) => setPriceForm((prev) => ({ ...prev, currency: event.target.value }))}
                  placeholder="MXN"
                  maxLength={3}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="commercial-plan-price-interval">Intervalo</Label>
                <select
                  id="commercial-plan-price-interval"
                  value={priceForm.billingInterval}
                  onChange={(event) =>
                    setPriceForm((prev) => ({
                      ...prev,
                      billingInterval: event.target.value as CommercialPlanPrice["billing_interval"],
                    }))
                  }
                  className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  required
                >
                  <option value="month">month</option>
                  <option value="year">year</option>
                  <option value="one_time">one_time</option>
                  <option value="custom">custom</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="commercial-plan-price-amount">Monto en centavos</Label>
                <Input
                  id="commercial-plan-price-amount"
                  type="number"
                  min={0}
                  step={1}
                  value={priceForm.amountCents}
                  onChange={(event) => setPriceForm((prev) => ({ ...prev, amountCents: event.target.value }))}
                  required
                />
              </div>
              <div className="flex items-end gap-3 rounded-lg border border-border/60 px-3 py-2">
                <input
                  id="commercial-plan-price-active"
                  type="checkbox"
                  checked={priceForm.active}
                  onChange={(event) => setPriceForm((prev) => ({ ...prev, active: event.target.checked }))}
                  className="h-4 w-4 rounded border-border"
                />
                <Label htmlFor="commercial-plan-price-active" className="cursor-pointer">
                  Precio activo
                </Label>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={loadingPriceId !== null}>
                {loadingPriceId === (editingPriceId ?? "new")
                  ? "Guardando..."
                  : editingPriceId
                    ? "Actualizar precio"
                    : "Crear precio"}
              </Button>
              {editingPriceId ? (
                <Button type="button" variant="outline" onClick={resetPriceForm}>
                  Cancelar edición
                </Button>
              ) : null}
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="space-y-1">
          <CardTitle>Precios del catálogo</CardTitle>
          <CardDescription>Se muestran todos los precios con estado activo o inactivo.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-lg border border-border/60">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Plan</TableHead>
                  <TableHead className="hidden lg:table-cell">Proveedor</TableHead>
                  <TableHead>Price ID</TableHead>
                  <TableHead>Producto</TableHead>
                  <TableHead>Precio</TableHead>
                  <TableHead>Intervalo</TableHead>
                  <TableHead className="hidden md:table-cell">Estado</TableHead>
                  <TableHead>Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedPrices.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-8 text-center text-sm text-muted-foreground">
                      No hay precios comerciales todavía.
                    </TableCell>
                  </TableRow>
                ) : (
                  sortedPrices.map((price) => {
                    const isLoading = loadingPriceId === price.id
                    return (
                      <TableRow key={price.id}>
                        <TableCell className="font-medium">{planNameById.get(price.plan_id) ?? price.plan_id}</TableCell>
                        <TableCell className="hidden lg:table-cell font-mono text-xs">{price.billing_provider}</TableCell>
                        <TableCell className="font-mono text-xs">{price.provider_price_id}</TableCell>
                        <TableCell className="font-mono text-xs">{price.provider_product_id}</TableCell>
                        <TableCell>{formatMoney(price.amount_cents, price.currency)}</TableCell>
                        <TableCell>{price.billing_interval}</TableCell>
                        <TableCell className="hidden md:table-cell">{price.active ? "Activo" : "Inactivo"}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-2">
                            <Button size="sm" variant="outline" onClick={() => startEditPrice(price)}>
                              Editar
                            </Button>
                            <Button
                              size="sm"
                              variant={price.active ? "destructive" : "secondary"}
                              disabled={isLoading}
                              onClick={() => void handleArchivePrice(price.id)}
                            >
                              {price.active ? "Desactivar" : "Inactivo"}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>
          <div className="mt-4 text-sm text-muted-foreground">
            El catálogo de precios ya se administra aquí sin salir del módulo comercial.
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="space-y-1">
          <CardTitle>{editingEntitlementId ? "Editar entitlement" : "Crear entitlement"}</CardTitle>
          <CardDescription>
            Los entitlements definen features, límites y reglas del plan con columnas explícitas.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {entitlementMessage ? (
            <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
              {entitlementMessage}
            </div>
          ) : null}
          {entitlementError ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {entitlementError}
            </div>
          ) : null}
          <form className="space-y-4" onSubmit={submitEntitlement}>
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="commercial-plan-entitlement-plan">Plan</Label>
                <select
                  id="commercial-plan-entitlement-plan"
                  value={entitlementForm.planId}
                  onChange={(event) => setEntitlementForm((prev) => ({ ...prev, planId: event.target.value }))}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  required
                >
                  <option value="">Selecciona un plan</option>
                  {sortedPlans.map((plan) => (
                    <option key={plan.id} value={plan.id}>
                      {plan.name} ({plan.code})
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="commercial-plan-entitlement-key">Llave</Label>
                <Input
                  id="commercial-plan-entitlement-key"
                  value={entitlementForm.entitlementKey}
                  onChange={(event) =>
                    setEntitlementForm((prev) => ({ ...prev, entitlementKey: event.target.value }))
                  }
                  placeholder="feature.whatsapp"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="commercial-plan-entitlement-type">Tipo</Label>
                <select
                  id="commercial-plan-entitlement-type"
                  value={entitlementForm.valueType}
                  onChange={(event) =>
                    setEntitlementForm((prev) => ({
                      ...prev,
                      valueType: event.target.value as CommercialPlanEntitlement["value_type"],
                    }))
                  }
                  className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  required
                >
                  <option value="boolean">boolean</option>
                  <option value="integer">integer</option>
                  <option value="decimal">decimal</option>
                  <option value="text">text</option>
                  <option value="json">json</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="commercial-plan-entitlement-limit">Límite numérico</Label>
                <Input
                  id="commercial-plan-entitlement-limit"
                  type="number"
                  value={entitlementForm.limitValue}
                  onChange={(event) =>
                    setEntitlementForm((prev) => ({ ...prev, limitValue: event.target.value }))
                  }
                  placeholder="5"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="commercial-plan-entitlement-limit-unit">Unidad</Label>
                <Input
                  id="commercial-plan-entitlement-limit-unit"
                  value={entitlementForm.limitUnit}
                  onChange={(event) =>
                    setEntitlementForm((prev) => ({ ...prev, limitUnit: event.target.value }))
                  }
                  placeholder="usuarios"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="commercial-plan-entitlement-scope">Scope</Label>
                <Input
                  id="commercial-plan-entitlement-scope"
                  value={entitlementForm.scope}
                  onChange={(event) => setEntitlementForm((prev) => ({ ...prev, scope: event.target.value }))}
                  placeholder="global"
                />
              </div>
              <div className="lg:col-span-2 space-y-2">
                <Label htmlFor="commercial-plan-entitlement-text">Valor texto</Label>
                <Input
                  id="commercial-plan-entitlement-text"
                  value={entitlementForm.valueText}
                  onChange={(event) =>
                    setEntitlementForm((prev) => ({ ...prev, valueText: event.target.value }))
                  }
                  placeholder="true / 5 / enterprise"
                />
              </div>
              <div className="lg:col-span-2 space-y-2">
                <Label htmlFor="commercial-plan-entitlement-json">Valor JSON</Label>
                <Textarea
                  id="commercial-plan-entitlement-json"
                  value={entitlementForm.valueJson}
                  onChange={(event) =>
                    setEntitlementForm((prev) => ({ ...prev, valueJson: event.target.value }))
                  }
                  placeholder='{"models":["ventas","soporte"]}'
                />
              </div>
              <div className="flex items-end gap-3 rounded-lg border border-border/60 px-3 py-2">
                <input
                  id="commercial-plan-entitlement-enabled"
                  type="checkbox"
                  checked={entitlementForm.enabled}
                  onChange={(event) =>
                    setEntitlementForm((prev) => ({ ...prev, enabled: event.target.checked }))
                  }
                  className="h-4 w-4 rounded border-border"
                />
                <Label htmlFor="commercial-plan-entitlement-enabled" className="cursor-pointer">
                  Entitlement activo
                </Label>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={loadingEntitlementId !== null}>
                {loadingEntitlementId === (editingEntitlementId ?? "new")
                  ? "Guardando..."
                  : editingEntitlementId
                    ? "Actualizar entitlement"
                    : "Crear entitlement"}
              </Button>
              {editingEntitlementId ? (
                <Button type="button" variant="outline" onClick={resetEntitlementForm}>
                  Cancelar edición
                </Button>
              ) : null}
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="space-y-1">
          <CardTitle>Entitlements del catálogo</CardTitle>
          <CardDescription>Control operativo de features y límites por plan.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-lg border border-border/60">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Plan</TableHead>
                  <TableHead>Llave</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="hidden lg:table-cell">Límite</TableHead>
                  <TableHead className="hidden lg:table-cell">Texto</TableHead>
                  <TableHead className="hidden xl:table-cell">JSON</TableHead>
                  <TableHead className="hidden md:table-cell">Estado</TableHead>
                  <TableHead>Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedEntitlements.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-8 text-center text-sm text-muted-foreground">
                      No hay entitlements comerciales todavía.
                    </TableCell>
                  </TableRow>
                ) : (
                  sortedEntitlements.map((entitlement) => {
                    const isLoading = loadingEntitlementId === entitlement.id
                    return (
                      <TableRow key={entitlement.id}>
                        <TableCell className="font-medium">
                          {planNameById.get(entitlement.plan_id) ?? entitlement.plan_id}
                        </TableCell>
                        <TableCell className="font-mono text-xs">{entitlement.entitlement_key}</TableCell>
                        <TableCell>{entitlement.value_type}</TableCell>
                        <TableCell className="hidden lg:table-cell text-sm">
                          {entitlement.limit_value ?? "—"} {entitlement.limit_unit ?? ""}
                        </TableCell>
                        <TableCell className="hidden lg:table-cell text-sm">
                          {entitlement.value_text ?? "—"}
                        </TableCell>
                        <TableCell className="hidden xl:table-cell text-xs font-mono">
                          {entitlement.value_json === null || entitlement.value_json === undefined
                            ? "—"
                            : JSON.stringify(entitlement.value_json)}
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-sm">
                          {entitlement.enabled ? "Activo" : "Inactivo"}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-2">
                            <Button size="sm" variant="outline" onClick={() => startEditEntitlement(entitlement)}>
                              Editar
                            </Button>
                            <Button
                              size="sm"
                              variant={entitlement.enabled ? "destructive" : "secondary"}
                              disabled={isLoading}
                              onClick={() => void handleArchiveEntitlement(entitlement.id)}
                            >
                              {entitlement.enabled ? "Desactivar" : "Inactivo"}
                            </Button>
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
    </div>
  )
}
