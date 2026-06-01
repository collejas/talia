"use client"

import { useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { ContactCatalogSelect, mergeCatalogOptions } from "@/components/contactos/contact-catalog-select"

import {
  createProveedorContactoAction,
  createProveedorCuentaBancariaAction,
  deleteProveedorContactoAction,
  deleteProveedorCuentaBancariaAction,
  updateProveedorContactoAction,
  updateProveedorCuentaBancariaAction,
} from "./actions"

type AnyRecord = Record<string, unknown>

type ProveedorDetailPanelProps = {
  proveedores: AnyRecord[]
  proveedorContactos: AnyRecord[]
  proveedorCuentasBancarias: AnyRecord[]
  personas: AnyRecord[]
  selectedProviderId: string
  onSelectedProviderIdChange: (providerId: string) => void
  onEditProvider: (proveedor: AnyRecord) => void
}

function asString(value: unknown, fallback = "—"): string {
  if (typeof value === "string") {
    const trimmed = value.trim()
    return trimmed.length ? trimmed : fallback
  }
  if (value === null || value === undefined) {
    return fallback
  }
  return String(value)
}

function maskIdentifier(value: unknown, prefix: string): string {
  const raw = asString(value, "")
  if (!raw) {
    return "Sin identificador"
  }
  return `${prefix} ****${raw.slice(-4)}`
}

export function ProveedorDetailPanel({
  proveedores,
  proveedorContactos,
  proveedorCuentasBancarias,
  personas,
  selectedProviderId,
  onSelectedProviderIdChange,
  onEditProvider,
}: ProveedorDetailPanelProps) {
  const [editingProviderContactId, setEditingProviderContactId] = useState<string | null>(null)
  const [providerContactPersonaId, setProviderContactPersonaId] = useState("")
  const [providerContactRole, setProviderContactRole] = useState("general")
  const [providerContactPrincipal, setProviderContactPrincipal] = useState(false)
  const [providerContactCompras, setProviderContactCompras] = useState(false)
  const [providerContactFacturacion, setProviderContactFacturacion] = useState(false)
  const [providerContactLogistica, setProviderContactLogistica] = useState(false)
  const [providerContactActive, setProviderContactActive] = useState(true)
  const [providerContactStartDate, setProviderContactStartDate] = useState("")
  const [providerContactEndDate, setProviderContactEndDate] = useState("")
  const [providerContactNotes, setProviderContactNotes] = useState("")
  const [editingProviderBankId, setEditingProviderBankId] = useState<string | null>(null)
  const [providerBankAlias, setProviderBankAlias] = useState("")
  const [providerBankName, setProviderBankName] = useState("")
  const [providerBankClave, setProviderBankClave] = useState("")
  const [providerBankCountry, setProviderBankCountry] = useState("MX")
  const [providerBankCurrency, setProviderBankCurrency] = useState("MXN")
  const [providerBankType, setProviderBankType] = useState("")
  const [providerBankHolder, setProviderBankHolder] = useState("")
  const [providerBankNumber, setProviderBankNumber] = useState("")
  const [providerBankClabe, setProviderBankClabe] = useState("")
  const [providerBankSwift, setProviderBankSwift] = useState("")
  const [providerBankIban, setProviderBankIban] = useState("")
  const [providerBankPrincipal, setProviderBankPrincipal] = useState(false)
  const [providerBankActive, setProviderBankActive] = useState(true)
  const [providerBankNotes, setProviderBankNotes] = useState("")

  const personaOptions = useMemo(
    () =>
      personas
        .map((persona) => {
          const value = String(persona?.id ?? "").trim()
          if (!value || value === "undefined" || value === "null") {
            return null
          }
          return {
            value,
            label: [asString(persona.nombre_completo, "Sin nombre"), asString(persona.company_name, "")]
              .filter(Boolean)
              .join(" · "),
          }
        })
        .filter((option): option is { value: string; label: string } => Boolean(option)),
    [personas],
  )

  const selectedProvider =
    proveedores.find((proveedor) => String(proveedor.id) === selectedProviderId) ?? proveedores[0] ?? null
  const selectedProviderContacts = proveedorContactos.filter(
    (contacto) => String(contacto.proveedor_id) === String(selectedProvider?.id ?? ""),
  )
  const selectedProviderBanks = proveedorCuentasBancarias.filter(
    (cuenta) => String(cuenta.proveedor_id) === String(selectedProvider?.id ?? ""),
  )

  const resetProviderContactForm = () => {
    setEditingProviderContactId(null)
    setProviderContactPersonaId("")
    setProviderContactRole("general")
    setProviderContactPrincipal(false)
    setProviderContactCompras(false)
    setProviderContactFacturacion(false)
    setProviderContactLogistica(false)
    setProviderContactActive(true)
    setProviderContactStartDate("")
    setProviderContactEndDate("")
    setProviderContactNotes("")
  }

  const resetProviderBankForm = () => {
    setEditingProviderBankId(null)
    setProviderBankAlias("")
    setProviderBankName("")
    setProviderBankClave("")
    setProviderBankCountry("MX")
    setProviderBankCurrency("MXN")
    setProviderBankType("")
    setProviderBankHolder("")
    setProviderBankNumber("")
    setProviderBankClabe("")
    setProviderBankSwift("")
    setProviderBankIban("")
    setProviderBankPrincipal(false)
    setProviderBankActive(true)
    setProviderBankNotes("")
  }

  const startEditProviderContact = (contacto: AnyRecord) => {
    onSelectedProviderIdChange(String(contacto.proveedor_id ?? selectedProviderId))
    setEditingProviderContactId(String(contacto.id))
    setProviderContactPersonaId(String(contacto.persona_id ?? ""))
    setProviderContactRole(asString(contacto.rol_en_proveedor, "general"))
    setProviderContactPrincipal(Boolean(contacto.es_principal))
    setProviderContactCompras(Boolean(contacto.es_compras))
    setProviderContactFacturacion(Boolean(contacto.es_facturacion))
    setProviderContactLogistica(Boolean(contacto.es_logistica))
    setProviderContactActive(Boolean(contacto.activo))
    setProviderContactStartDate(asString(contacto.fecha_inicio, ""))
    setProviderContactEndDate(asString(contacto.fecha_fin, ""))
    setProviderContactNotes(asString(contacto.notas, ""))
  }

  const startEditProviderBank = (cuenta: AnyRecord) => {
    onSelectedProviderIdChange(String(cuenta.proveedor_id ?? selectedProviderId))
    setEditingProviderBankId(String(cuenta.id))
    setProviderBankAlias(asString(cuenta.alias, ""))
    setProviderBankName(asString(cuenta.banco_nombre, ""))
    setProviderBankClave(asString(cuenta.banco_clave, ""))
    setProviderBankCountry(asString(cuenta.pais, "MX"))
    setProviderBankCurrency(asString(cuenta.moneda, "MXN"))
    setProviderBankType(asString(cuenta.tipo_cuenta, ""))
    setProviderBankHolder(asString(cuenta.titular, ""))
    setProviderBankNumber(asString(cuenta.numero_cuenta, ""))
    setProviderBankClabe(asString(cuenta.clabe, ""))
    setProviderBankSwift(asString(cuenta.swift, ""))
    setProviderBankIban(asString(cuenta.iban, ""))
    setProviderBankPrincipal(Boolean(cuenta.es_principal))
    setProviderBankActive(Boolean(cuenta.activo))
    setProviderBankNotes(asString(cuenta.observaciones, ""))
  }

  const providerContactFormAction = editingProviderContactId
    ? updateProveedorContactoAction.bind(null, editingProviderContactId)
    : createProveedorContactoAction.bind(null, String(selectedProviderId))
  const providerBankFormAction = editingProviderBankId
    ? updateProveedorCuentaBancariaAction.bind(null, editingProviderBankId)
    : createProveedorCuentaBancariaAction.bind(null, String(selectedProviderId))


  return (
    <Card>
      <CardHeader>
        <CardTitle>Detalle del proveedor</CardTitle>
        <CardDescription>Gestiona contactos y cuentas bancarias del proveedor seleccionado.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-lg border bg-muted/20 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Proveedor activo</p>
                <h3 className="text-lg font-semibold">
                  {selectedProvider ? asString(selectedProvider.nombre_comercial ?? selectedProvider.razon_social, "Proveedor") : "Sin proveedor seleccionado"}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {selectedProvider
                    ? `${asString(selectedProvider.codigo_proveedor)} · ${selectedProviderContacts.length} contactos · ${selectedProviderBanks.length} cuentas`
                    : "Selecciona un proveedor para administrar sus relaciones"}
                </p>
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => selectedProvider && onEditProvider(selectedProvider)} disabled={!selectedProvider}>
                  Editar proveedor
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => resetProviderContactForm()} disabled={!selectedProvider}>
                  Nuevo contacto
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => resetProviderBankForm()} disabled={!selectedProvider}>
                  Nueva cuenta
                </Button>
              </div>
            </div>
          </div>
          <div className="rounded-lg border p-4">
            <label className="mb-2 block text-sm font-medium">Seleccionar proveedor</label>
            <select
              value={selectedProviderId}
              onChange={(event) => onSelectedProviderIdChange(event.target.value)}
              className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">Selecciona un proveedor</option>
              {proveedores.map((proveedor) => (
                <option key={String(proveedor.id)} value={String(proveedor.id)}>
                  {asString(proveedor.codigo_proveedor)} · {asString(proveedor.nombre_comercial ?? proveedor.razon_social)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <div className="space-y-4 rounded-lg border p-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h4 className="text-base font-semibold">Contactos</h4>
                <p className="text-sm text-muted-foreground">Personas que atienden compras, facturación o logística.</p>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={resetProviderContactForm} disabled={!selectedProvider}>
                Nuevo
              </Button>
            </div>

            <form action={providerContactFormAction} className="space-y-4">
              {editingProviderContactId ? <input type="hidden" name="proveedor_id" value={String(selectedProvider?.id ?? selectedProviderId)} readOnly /> : null}
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm font-medium">Persona</label>
                  <ContactCatalogSelect
                    value={providerContactPersonaId}
                    onValueChange={setProviderContactPersonaId}
                    options={mergeCatalogOptions(personaOptions, providerContactPersonaId, "Actual")}
                    placeholder="Selecciona una persona"
                    emptyLabel="No hay personas disponibles"
                  />
                  <input type="hidden" name="persona_id" value={providerContactPersonaId} readOnly />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="provider-contact-role">
                    Rol
                  </label>
                  <Input
                    id="provider-contact-role"
                    name="rol_en_proveedor"
                    value={providerContactRole}
                    onChange={(event) => setProviderContactRole(event.target.value)}
                    placeholder="general, compras, facturacion"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="provider-contact-start">
                    Inicio
                  </label>
                  <Input
                    id="provider-contact-start"
                    name="fecha_inicio"
                    type="date"
                    value={providerContactStartDate}
                    onChange={(event) => setProviderContactStartDate(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="provider-contact-end">
                    Fin
                  </label>
                  <Input
                    id="provider-contact-end"
                    name="fecha_fin"
                    type="date"
                    value={providerContactEndDate}
                    onChange={(event) => setProviderContactEndDate(event.target.value)}
                  />
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="es_principal" checked={providerContactPrincipal} onChange={(event) => setProviderContactPrincipal(event.target.checked)} />
                  Principal
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="activo" checked={providerContactActive} onChange={(event) => setProviderContactActive(event.target.checked)} />
                  Activo
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="es_compras" checked={providerContactCompras} onChange={(event) => setProviderContactCompras(event.target.checked)} />
                  Compras
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="es_facturacion" checked={providerContactFacturacion} onChange={(event) => setProviderContactFacturacion(event.target.checked)} />
                  Facturación
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="es_logistica" checked={providerContactLogistica} onChange={(event) => setProviderContactLogistica(event.target.checked)} />
                  Logística
                </label>
              </div>
              <Textarea
                name="notas"
                value={providerContactNotes}
                onChange={(event) => setProviderContactNotes(event.target.value)}
                placeholder="Notas internas del contacto"
              />
              <div className="flex gap-2">
                <Button type="submit" className="flex-1" disabled={!selectedProviderId || !providerContactPersonaId}>
                  {editingProviderContactId ? "Actualizar contacto" : "Guardar contacto"}
                </Button>
                {editingProviderContactId ? (
                  <Button type="button" variant="outline" onClick={resetProviderContactForm}>
                    Cancelar
                  </Button>
                ) : null}
              </div>
            </form>

            <div className="overflow-hidden rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Persona</TableHead>
                    <TableHead>Rol</TableHead>
                    <TableHead>Flags</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!selectedProviderContacts.length ? (
                    <TableRow>
                      <TableCell colSpan={4} className="py-6 text-center text-sm text-muted-foreground">
                        No hay contactos para este proveedor.
                      </TableCell>
                    </TableRow>
                  ) : (
                    selectedProviderContacts.map((contacto) => (
                      <TableRow key={String(contacto.id)}>
                        <TableCell>
                          <div className="space-y-1">
                            <div className="font-medium">{asString((contacto.persona as AnyRecord | undefined)?.nombre_completo, "Sin nombre")}</div>
                            <div className="text-xs text-muted-foreground">{asString((contacto.persona as AnyRecord | undefined)?.correo, "")}</div>
                            <div className="text-xs text-muted-foreground">{asString((contacto.persona as AnyRecord | undefined)?.telefono_e164, "")}</div>
                          </div>
                        </TableCell>
                        <TableCell>{asString(contacto.rol_en_proveedor, "general")}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {[
                            contacto.es_principal ? "Principal" : null,
                            contacto.es_compras ? "Compras" : null,
                            contacto.es_facturacion ? "Facturación" : null,
                            contacto.es_logistica ? "Logística" : null,
                          ]
                            .filter(Boolean)
                            .join(" · ") || "Sin flags"}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button type="button" variant="outline" size="sm" onClick={() => startEditProviderContact(contacto)}>
                              Editar
                            </Button>
                            <form action={deleteProveedorContactoAction.bind(null, String(contacto.id))}>
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
          </div>

          <div className="space-y-4 rounded-lg border p-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h4 className="text-base font-semibold">Cuentas bancarias</h4>
                <p className="text-sm text-muted-foreground">Registra varias cuentas y marca una principal.</p>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={resetProviderBankForm} disabled={!selectedProvider}>
                Nueva
              </Button>
            </div>

            <form action={providerBankFormAction} className="space-y-4">
              {editingProviderBankId ? <input type="hidden" name="proveedor_id" value={String(selectedProvider?.id ?? selectedProviderId)} readOnly /> : null}
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="provider-bank-alias">
                    Alias
                  </label>
                  <Input id="provider-bank-alias" name="alias" value={providerBankAlias} onChange={(event) => setProviderBankAlias(event.target.value)} placeholder="Cuenta principal" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="provider-bank-name">
                    Banco
                  </label>
                  <Input id="provider-bank-name" name="banco_nombre" value={providerBankName} onChange={(event) => setProviderBankName(event.target.value)} placeholder="BBVA" required />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="provider-bank-clave">
                    Clave banco
                  </label>
                  <Input id="provider-bank-clave" name="banco_clave" value={providerBankClave} onChange={(event) => setProviderBankClave(event.target.value)} placeholder="012" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="provider-bank-holder">
                    Titular
                  </label>
                  <Input id="provider-bank-holder" name="titular" value={providerBankHolder} onChange={(event) => setProviderBankHolder(event.target.value)} placeholder="Razón social o titular" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="provider-bank-type">
                    Tipo de cuenta
                  </label>
                  <Input id="provider-bank-type" name="tipo_cuenta" value={providerBankType} onChange={(event) => setProviderBankType(event.target.value)} placeholder="cheques, ahorro, CLABE" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="provider-bank-country">
                    País
                  </label>
                  <Input id="provider-bank-country" name="pais" value={providerBankCountry} onChange={(event) => setProviderBankCountry(event.target.value.toUpperCase())} maxLength={2} placeholder="MX" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="provider-bank-currency">
                    Moneda
                  </label>
                  <Input id="provider-bank-currency" name="moneda" value={providerBankCurrency} onChange={(event) => setProviderBankCurrency(event.target.value.toUpperCase())} maxLength={3} placeholder="MXN" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="provider-bank-clabe-value">
                    CLABE
                  </label>
                  <Input id="provider-bank-clabe-value" name="clabe" value={providerBankClabe} onChange={(event) => setProviderBankClabe(event.target.value)} placeholder="18 dígitos" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="provider-bank-number">
                    Número de cuenta
                  </label>
                  <Input id="provider-bank-number" name="numero_cuenta" value={providerBankNumber} onChange={(event) => setProviderBankNumber(event.target.value)} placeholder="Cuenta o IBAN local" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="provider-bank-swift">
                    SWIFT
                  </label>
                  <Input id="provider-bank-swift" name="swift" value={providerBankSwift} onChange={(event) => setProviderBankSwift(event.target.value)} placeholder="SWIFT/BIC" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="provider-bank-iban">
                    IBAN
                  </label>
                  <Input id="provider-bank-iban" name="iban" value={providerBankIban} onChange={(event) => setProviderBankIban(event.target.value)} placeholder="IBAN" />
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="es_principal" checked={providerBankPrincipal} onChange={(event) => setProviderBankPrincipal(event.target.checked)} />
                  Principal
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="activo" checked={providerBankActive} onChange={(event) => setProviderBankActive(event.target.checked)} />
                  Activo
                </label>
              </div>
              <Textarea
                name="observaciones"
                value={providerBankNotes}
                onChange={(event) => setProviderBankNotes(event.target.value)}
                placeholder="Observaciones de la cuenta bancaria"
              />
              <div className="flex gap-2">
                <Button type="submit" className="flex-1" disabled={!selectedProviderId || !providerBankName.trim()}>
                  {editingProviderBankId ? "Actualizar cuenta" : "Guardar cuenta"}
                </Button>
                {editingProviderBankId ? (
                  <Button type="button" variant="outline" onClick={resetProviderBankForm}>
                    Cancelar
                  </Button>
                ) : null}
              </div>
            </form>

            <div className="overflow-hidden rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Banco</TableHead>
                    <TableHead>Titular</TableHead>
                    <TableHead>Identificador</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!selectedProviderBanks.length ? (
                    <TableRow>
                      <TableCell colSpan={4} className="py-6 text-center text-sm text-muted-foreground">
                        No hay cuentas bancarias para este proveedor.
                      </TableCell>
                    </TableRow>
                  ) : (
                    selectedProviderBanks.map((cuenta) => (
                      <TableRow key={String(cuenta.id)}>
                        <TableCell>
                          <div className="space-y-1">
                            <div className="font-medium">{asString(cuenta.alias ?? cuenta.banco_nombre)}</div>
                            <div className="text-xs text-muted-foreground">
                              {asString(cuenta.banco_nombre)} · {asString(cuenta.moneda, "MXN")}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>{asString(cuenta.titular, "Sin titular")}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {cuenta.clabe ? maskIdentifier(cuenta.clabe, "CLABE") : cuenta.numero_cuenta ? maskIdentifier(cuenta.numero_cuenta, "Cuenta") : "Sin identificador"}
                          <div>{cuenta.es_principal ? "Principal" : "Secundaria"} · {cuenta.activo ? "Activa" : "Inactiva"}</div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button type="button" variant="outline" size="sm" onClick={() => startEditProviderBank(cuenta)}>
                              Editar
                            </Button>
                            <form action={deleteProveedorCuentaBancariaAction.bind(null, String(cuenta.id))}>
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
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
