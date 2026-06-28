"use client"

import { FormEvent, useState } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

import { createTenantWithAdmin, TenantCreationResponse, TenantWithAdminPayload } from "../actions"

type CommercialPlanOption = {
  id: string
  code: string
  name: string
}

type FormState = {
  name: string
  alias: string
  whatsappProvider: "twilio" | "meta"
  active: boolean
  onboarding: string
  razonSocial: string
  dominio: string
  rfc: string
  phone: string
  country: string
  state: string
  city: string
  website: string
  adminEmail: string
  adminName: string
  adminPhone: string
  adminStatus: "activo" | "bloqueado"
  commercialPlanId: string
  commercialAccessStatus: "internal_free" | "active" | "manual_review"
}

type Props = {
  commercialPlans: CommercialPlanOption[]
  commercialPlansError: string | null
}

export function TenantCreationPanel({ commercialPlans, commercialPlansError }: Props) {
  const [form, setForm] = useState<FormState>({
    name: "",
    alias: "",
    whatsappProvider: "meta",
    active: true,
    onboarding: "pendiente",
    razonSocial: "",
    dominio: "",
    rfc: "",
    phone: "",
    country: "",
    state: "",
    city: "",
    website: "",
    adminEmail: "",
    adminName: "",
    adminPhone: "",
    adminStatus: "activo",
    commercialPlanId: commercialPlans[0]?.id ?? "",
    commercialAccessStatus: "internal_free",
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<TenantCreationResponse | null>(null)

  const handleChange = (
    field: keyof FormState,
    value: string | boolean,
  ) => {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setSuccess(null)

    if (!form.name.trim()) {
      setError("El nombre del tenant es obligatorio.")
      return
    }
    if (!form.adminEmail.trim()) {
      setError("El correo del administrador es obligatorio.")
      return
    }
    if (!form.commercialPlanId.trim()) {
      setError("Debes seleccionar un plan comercial.")
      return
    }

    const payload: TenantWithAdminPayload = {
      tenant: {
        nombre: form.name,
        webchat_alias: form.alias || undefined,
        config: {
          whatsapp: {
            provider: form.whatsappProvider,
          },
        },
        pais: form.country || undefined,
        estado: form.state || undefined,
        ciudad: form.city || undefined,
        sitio_web: form.website || undefined,
        activo: form.active,
        estado_onboarding: form.onboarding || undefined,
        razon_social: form.razonSocial || undefined,
        dominio_principal: form.dominio || undefined,
        rfc: form.rfc || undefined,
        telefono: form.phone || undefined,
        commercial_plan_id: form.commercialPlanId,
        commercial_access_status: form.commercialAccessStatus,
      },
      admin: {
        correo: form.adminEmail,
        nombre_completo: form.adminName || undefined,
        telefono: form.adminPhone || undefined,
        estado: form.adminStatus,
      },
    }

    setLoading(true)
    try {
      const result = await createTenantWithAdmin(payload)
      if (!result.ok) {
        setError(result.error || "No se pudo crear el tenant.")
        return
      }
      setSuccess(result.data)
      setForm((prev) => ({
        ...prev,
        name: "",
        alias: "",
        whatsappProvider: "meta",
        razonSocial: "",
        dominio: "",
        rfc: "",
        phone: "",
        country: "",
        state: "",
        city: "",
        website: "",
        adminEmail: "",
        adminName: "",
        adminPhone: "",
        commercialPlanId: commercialPlans[0]?.id ?? "",
        commercialAccessStatus: "internal_free",
      }))
    } catch (err) {
      setError((err as Error).message || "No se pudo crear el tenant.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader className="space-y-1">
        <CardTitle>Crear tenant + admin</CardTitle>
        <CardDescription>
          Ingresa los datos del tenant y del usuario admin; los seeds mínimos se generan automáticamente en el backend.
          Si seleccionas un plan comercial, el tenant nace con billing interno sin pasar por Stripe.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {commercialPlansError ? (
          <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            No se pudieron cargar los planes comerciales: {commercialPlansError}
          </div>
        ) : null}
        <form className="space-y-6" onSubmit={handleSubmit}>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="tenant-name">Nombre del tenant</Label>
              <Input
                id="tenant-name"
                value={form.name}
                onChange={(event) => handleChange("name", event.target.value)}
                placeholder="Cliente / organización"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tenant-alias">
                Alias webchat{" "}
                <span className="text-muted-foreground text-xs">(se guarda en minúsculas)</span>
              </Label>
              <Input
                id="tenant-alias"
                value={form.alias}
                onChange={(event) => handleChange("alias", event.target.value)}
                placeholder="alias-del-cliente"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tenant-whatsapp-provider">Provider WhatsApp</Label>
              <select
                id="tenant-whatsapp-provider"
                value={form.whatsappProvider}
                onChange={(event) => handleChange("whatsappProvider", event.target.value as "twilio" | "meta")}
                className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              >
                <option value="meta">Meta WhatsApp Cloud API</option>
                <option value="twilio">Twilio</option>
              </select>
              <p className="text-xs text-muted-foreground">
                Los tenants nuevos nacen con Meta por defecto, pero puedes dejar Twilio para compatibilidad.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="tenant-razon">Razón social</Label>
              <Input
                id="tenant-razon"
                value={form.razonSocial}
                onChange={(event) => handleChange("razonSocial", event.target.value)}
                placeholder="Opcional"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tenant-dominio">Dominio principal</Label>
              <Input
                id="tenant-dominio"
                value={form.dominio}
                onChange={(event) => handleChange("dominio", event.target.value)}
                placeholder="cliente.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tenant-rfc">RFC</Label>
              <Input
                id="tenant-rfc"
                value={form.rfc}
                onChange={(event) => handleChange("rfc", event.target.value)}
                placeholder="Opcional"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tenant-phone">Teléfono</Label>
              <Input
                id="tenant-phone"
                value={form.phone}
                onChange={(event) => handleChange("phone", event.target.value)}
                placeholder="+521234567890"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tenant-country">País</Label>
              <Input
                id="tenant-country"
                value={form.country}
                onChange={(event) => handleChange("country", event.target.value)}
                placeholder="México"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tenant-state">Estado</Label>
              <Input
                id="tenant-state"
                value={form.state}
                onChange={(event) => handleChange("state", event.target.value)}
                placeholder="Jalisco"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tenant-city">Ciudad</Label>
              <Input
                id="tenant-city"
                value={form.city}
                onChange={(event) => handleChange("city", event.target.value)}
                placeholder="Guadalajara"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tenant-website">Sitio web</Label>
              <Input
                id="tenant-website"
                value={form.website}
                onChange={(event) => handleChange("website", event.target.value)}
                placeholder="https://cliente.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tenant-onboarding">Estado de onboarding</Label>
              <select
                id="tenant-onboarding"
                value={form.onboarding}
                onChange={(event) => handleChange("onboarding", event.target.value)}
                className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              >
                <option value="pendiente">Pendiente</option>
                <option value="en_progreso">En progreso</option>
                <option value="completado">Completado</option>
                <option value="pausado">Pausado</option>
                <option value="cancelado">Cancelado</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="tenant-commercial-plan">Plan comercial</Label>
              <select
                id="tenant-commercial-plan"
                value={form.commercialPlanId}
                onChange={(event) => handleChange("commercialPlanId", event.target.value)}
                className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                required
                disabled={commercialPlans.length === 0}
              >
                <option value="">Selecciona un plan</option>
                {commercialPlans.map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.name} ({plan.code})
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                El tenant se crea con una cuenta interna de billing, lista para migrarse a Stripe después.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="tenant-commercial-access">Acceso inicial</Label>
              <select
                id="tenant-commercial-access"
                value={form.commercialAccessStatus}
                onChange={(event) =>
                  handleChange(
                    "commercialAccessStatus",
                    event.target.value as "internal_free" | "active" | "manual_review",
                  )
                }
                className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              >
                <option value="internal_free">Gratis interno</option>
                <option value="active">Activo</option>
                <option value="manual_review">Revisión manual</option>
              </select>
            </div>
            <div className="space-y-2 flex flex-col justify-between">
              <label className="flex items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-border"
                  checked={form.active}
                  onChange={(event) => handleChange("active", event.target.checked)}
                />
                <span>Activo</span>
              </label>
            </div>
          </div>

          <div className="border-t border-border pt-4">
            <p className="text-sm font-semibold">Usuario administrador</p>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="admin-email">Correo</Label>
                <Input
                  id="admin-email"
                  type="email"
                  value={form.adminEmail}
                  onChange={(event) => handleChange("adminEmail", event.target.value)}
                  placeholder="admin@cliente.com"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="admin-name">Nombre completo</Label>
                <Input
                  id="admin-name"
                  value={form.adminName}
                  onChange={(event) => handleChange("adminName", event.target.value)}
                  placeholder="Admin Cliente"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="admin-phone">Teléfono (E.164)</Label>
                <Input
                  id="admin-phone"
                  value={form.adminPhone}
                  onChange={(event) => handleChange("adminPhone", event.target.value)}
                  placeholder="+521234567890"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="admin-status">Estado</Label>
                <select
                  id="admin-status"
                  value={form.adminStatus}
                  onChange={(event) =>
                    handleChange("adminStatus", event.target.value as "activo" | "bloqueado")
                  }
                  className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                >
                  <option value="activo">Activo</option>
                  <option value="bloqueado">Bloqueado</option>
                </select>
              </div>
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex justify-end gap-3">
            <Button type="submit" disabled={loading}>
              {loading ? "Creando tenant…" : "Crear tenant + admin"}
            </Button>
          </div>
        </form>

        {success && (
          <div className="mt-6 space-y-3 rounded-lg border border-border/60 bg-muted p-4 text-sm">
            <p className="font-semibold text-foreground">Tenant creado correctamente</p>
            <p className="text-muted-foreground">Se envió el correo de recuperación.</p>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <p className="text-muted-foreground">Tenant ID</p>
                <p className="font-mono">{success.tenant_id}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Usuario ID</p>
                <p className="font-mono">{success.usuario_id}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Rol ID</p>
                <p className="font-mono">{success.seed.rol_id}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Departamento</p>
                <p className="font-mono">{success.seed.departamento_id}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Puesto</p>
                <p className="font-mono">{success.seed.puesto_id}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Permisos</p>
                <p className="font-mono">{success.seed.permisos_ids.length} IDs</p>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
