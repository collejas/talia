"use client"

import { FormEvent, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { archiveCommercialPlanAction, createCommercialPlanAction, updateCommercialPlanAction } from "./actions"

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

export function CommercialPlansManager({ plans, prices }: Props) {
  const router = useRouter()
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loadingPlanId, setLoadingPlanId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>({
    code: "",
    name: "",
    description: "",
    sortOrder: "0",
    active: true,
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
          <CardTitle>Precios activos</CardTitle>
          <CardDescription>Lectura operativa del catálogo de precios sembrado en la base.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-lg border border-border/60">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Plan</TableHead>
                  <TableHead>Price ID</TableHead>
                  <TableHead>Producto</TableHead>
                  <TableHead>Precio</TableHead>
                  <TableHead>Intervalo</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {prices.filter((price) => price.active).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                      No hay precios activos.
                    </TableCell>
                  </TableRow>
                ) : (
                  prices
                    .filter((price) => price.active)
                    .map((price) => {
                      const plan = plans.find((item) => item.id === price.plan_id)
                      return (
                        <TableRow key={price.id}>
                          <TableCell className="font-medium">{plan?.name ?? price.plan_id}</TableCell>
                          <TableCell className="font-mono text-xs">{price.provider_price_id}</TableCell>
                          <TableCell className="font-mono text-xs">{price.provider_product_id}</TableCell>
                          <TableCell>{formatMoney(price.amount_cents, price.currency)}</TableCell>
                          <TableCell>{price.billing_interval}</TableCell>
                          <TableCell>{price.active ? "Activo" : "Inactivo"}</TableCell>
                        </TableRow>
                      )
                    })
                )}
              </TableBody>
            </Table>
          </div>
          <div className="mt-4 text-sm text-muted-foreground">
            Los precios se muestran solo en lectura por ahora. Si quieres administrar precios por moneda o intervalo,
            se agrega después como CRUD separado en
            <Link href="/settings/commercial-plans" className="ml-1 underline underline-offset-4">
              este mismo módulo
            </Link>
            .
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
