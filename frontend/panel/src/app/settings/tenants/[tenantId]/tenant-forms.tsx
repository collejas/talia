"use client"

import { useActionState, useEffect, useRef, useState } from "react"
import { useFormStatus } from "react-dom"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"

import {
  CrudActionHandler,
  CrudActionState,
  createTenantRouteAction,
  deleteTenantRouteAction,
  deleteTenantSecretAction,
  setTenantSecretAction,
  updateTenantConfigAction,
} from "./actions"

const INITIAL_CRUD_STATE: CrudActionState = { status: "idle" }

function FormStatusMessage({ state }: { state: CrudActionState }) {
  if (state.status === "idle") return null
  if (state.status === "success") {
    return (
      <p className="rounded-md border border-emerald-500/50 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-900 dark:text-emerald-200">
        {state.message ?? "Cambios guardados."}
      </p>
    )
  }
  if (state.status === "error") {
    return (
      <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
        {state.message ?? "No se pudo completar la acción."}
      </p>
    )
  }
  return null
}

function SubmitButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending}>
      {pending ? pendingLabel : label}
    </Button>
  )
}

function useCrudForm(action: CrudActionHandler) {
  const [state, formAction] = useActionState(action, INITIAL_CRUD_STATE)
  const formRef = useRef<HTMLFormElement>(null)
  useEffect(() => {
    if (state.status === "success") formRef.current?.reset()
  }, [state])
  return { state, formAction, formRef }
}

export function TenantConfigEditor({
  tenantId,
  initialConfigJson,
}: {
  tenantId: string
  initialConfigJson: string
}) {
  const [state, formAction] = useActionState(updateTenantConfigAction, INITIAL_CRUD_STATE)
  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="tenant_id" value={tenantId} />
      <div className="space-y-2">
        <Label htmlFor="config_json">organizaciones.config (JSON)</Label>
        <Textarea
          id="config_json"
          name="config_json"
          defaultValue={initialConfigJson}
          className="min-h-[260px] font-mono text-xs"
          spellCheck={false}
        />
        <p className="text-xs text-muted-foreground">
          Tip: esta es la primera iteración. Después lo convertimos a formularios por sección (webchat/whatsapp/etc.).
        </p>
      </div>
      <div className="flex items-center justify-between gap-3">
        <FormStatusMessage state={state} />
        <SubmitButton label="Guardar config" pendingLabel="Guardando..." />
      </div>
    </form>
  )
}

export type SecretItem = {
  clave: string
  etiqueta?: string | null
  version: number
  actualizado_en?: string | null
}

export type RouteItem = {
  id: string
  canal: string
  clave: string
  activo?: boolean | null
}

export function TenantRoutingManager({ tenantId, routes }: { tenantId: string; routes: RouteItem[] }) {
  const { state: createState, formAction: createAction, formRef: createRef } = useCrudForm(createTenantRouteAction)
  const { state: deleteState, formAction: deleteAction } = useCrudForm(deleteTenantRouteAction)

  return (
    <div className="space-y-6">
      <form ref={createRef} action={createAction} className="space-y-4">
        <input type="hidden" name="tenant_id" value={tenantId} />
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="route_canal">Canal</Label>
            <Input id="route_canal" name="canal" placeholder="webchat | whatsapp | messenger" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="route_clave">Clave</Label>
            <Input id="route_clave" name="clave" placeholder="alias / +E164 / page_id" required />
          </div>
        </div>
        <div className="flex items-center justify-between gap-3">
          <FormStatusMessage state={createState} />
          <SubmitButton label="Crear ruta" pendingLabel="Creando..." />
        </div>
      </form>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-medium">Rutas registradas</h3>
          <FormStatusMessage state={deleteState} />
        </div>
        <div className="rounded-lg border border-border/60">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Canal</TableHead>
                  <TableHead>Clave</TableHead>
                  <TableHead className="hidden md:table-cell">Activo</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {routes.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-sm text-muted-foreground">
                      No hay rutas (aún).
                    </TableCell>
                  </TableRow>
                ) : (
                  routes.map((route) => (
                    <TableRow key={route.id}>
                      <TableCell className="font-mono text-xs">{route.canal}</TableCell>
                      <TableCell className="font-mono text-xs">{route.clave}</TableCell>
                      <TableCell className="hidden md:table-cell">
                        {route.activo === null || route.activo === undefined ? "—" : route.activo ? "Sí" : "No"}
                      </TableCell>
                      <TableCell className="text-right">
                        <form action={deleteAction}>
                          <input type="hidden" name="tenant_id" value={tenantId} />
                          <input type="hidden" name="route_id" value={route.id} />
                          <Button type="submit" variant="destructive" size="sm">
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
      </div>
    </div>
  )
}

export function TenantSecretsManager({ tenantId, secrets }: { tenantId: string; secrets: SecretItem[] }) {
  const { state: setState, formAction: setAction, formRef: setRef } = useCrudForm(setTenantSecretAction)
  const { state: deleteState, formAction: deleteAction } = useCrudForm(deleteTenantSecretAction)
  const [tier, setTier] = useState<"A" | "B">("A")

  return (
    <div className="space-y-6">
      <form ref={setRef} action={setAction} className="space-y-4">
        <input type="hidden" name="tenant_id" value={tenantId} />
        <input type="hidden" name="tier" value={tier} />
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="secret_clave">Clave</Label>
            <Input id="secret_clave" name="clave" placeholder="ej. openai.api_key" required />
          </div>
          <div className="space-y-2">
            <Label>Tier</Label>
            <Select value={tier} onValueChange={(value) => setTier((value as "A" | "B") ?? "A")}>
              <SelectTrigger>
                <SelectValue placeholder="Selecciona tier" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="A">A (normal)</SelectItem>
                <SelectItem value="B">B (seguridad extendida)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="secret_valor">Valor (no se vuelve a mostrar)</Label>
            <Input id="secret_valor" name="valor" type="password" placeholder="Pega el secreto aquí" required />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="secret_etiqueta">Etiqueta (opcional)</Label>
            <Input id="secret_etiqueta" name="etiqueta" placeholder="ej. aesgcm:v1:tier:B" />
          </div>
        </div>
        <div className="flex items-center justify-between gap-3">
          <FormStatusMessage state={setState} />
          <SubmitButton label="Guardar secreto" pendingLabel="Guardando..." />
        </div>
      </form>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-medium">Secretos registrados</h3>
          <FormStatusMessage state={deleteState} />
        </div>
        <div className="rounded-lg border border-border/60">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Clave</TableHead>
                  <TableHead className="hidden md:table-cell">Etiqueta</TableHead>
                  <TableHead className="hidden md:table-cell">Versión</TableHead>
                  <TableHead className="hidden lg:table-cell">Actualizado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {secrets.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                      No hay secretos (aún).
                    </TableCell>
                  </TableRow>
                ) : (
                  secrets.map((item) => (
                    <TableRow key={item.clave}>
                      <TableCell className="font-mono text-xs">{item.clave}</TableCell>
                      <TableCell className="hidden md:table-cell">{item.etiqueta ?? "—"}</TableCell>
                      <TableCell className="hidden md:table-cell">{item.version}</TableCell>
                      <TableCell className="hidden lg:table-cell">{item.actualizado_en ?? "—"}</TableCell>
                      <TableCell className="text-right">
                        <form action={deleteAction}>
                          <input type="hidden" name="tenant_id" value={tenantId} />
                          <input type="hidden" name="clave" value={item.clave} />
                          <Button type="submit" variant="destructive" size="sm">
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
      </div>
    </div>
  )
}
