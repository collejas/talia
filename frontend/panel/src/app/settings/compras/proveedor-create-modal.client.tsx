"use client"

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ContactCatalogSelect, mergeCatalogOptions } from "@/components/contactos/contact-catalog-select"

import {
  createProveedorConRelacionesAction,
  createProveedorContactoAction,
  createProveedorCuentaBancariaAction,
  deleteProveedorContactoAction,
  deleteProveedorCuentaBancariaAction,
  updateProveedorAction,
} from "./actions"

type AnyRecord = Record<string, unknown>

type ProveedorCreateModalProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultCode: string
  personas: AnyRecord[]
  mode: "create" | "edit"
  proveedor: AnyRecord | null
  proveedorContactos: AnyRecord[]
  proveedorCuentasBancarias: AnyRecord[]
}

type ContactDraft = {
  id: string
  persona_id: string
  rol_en_proveedor: string
  es_principal: boolean
  es_compras: boolean
  es_facturacion: boolean
  es_logistica: boolean
  activo: boolean
  fecha_inicio: string
  fecha_fin: string
  notas: string
}

type BankDraft = {
  id: string
  alias: string
  banco_nombre: string
  banco_clave: string
  pais: string
  moneda: string
  tipo_cuenta: string
  titular: string
  numero_cuenta: string
  clabe: string
  swift: string
  iban: string
  es_principal: boolean
  activo: boolean
  observaciones: string
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

function newContactDraft(): ContactDraft {
  return {
    id: crypto.randomUUID(),
    persona_id: "",
    rol_en_proveedor: "general",
    es_principal: false,
    es_compras: false,
    es_facturacion: false,
    es_logistica: false,
    activo: true,
    fecha_inicio: "",
    fecha_fin: "",
    notas: "",
  }
}

function newBankDraft(): BankDraft {
  return {
    id: crypto.randomUUID(),
    alias: "",
    banco_nombre: "",
    banco_clave: "",
    pais: "MX",
    moneda: "MXN",
    tipo_cuenta: "",
    titular: "",
    numero_cuenta: "",
    clabe: "",
    swift: "",
    iban: "",
    es_principal: false,
    activo: true,
    observaciones: "",
  }
}

function contactDraftFromRecord(record: AnyRecord): ContactDraft {
  return {
    id: String(record.id ?? crypto.randomUUID()),
    persona_id: asString(record.persona_id, ""),
    rol_en_proveedor: asString(record.rol_en_proveedor, "general"),
    es_principal: Boolean(record.es_principal),
    es_compras: Boolean(record.es_compras),
    es_facturacion: Boolean(record.es_facturacion),
    es_logistica: Boolean(record.es_logistica),
    activo: Boolean(record.activo ?? true),
    fecha_inicio: asString(record.fecha_inicio, ""),
    fecha_fin: asString(record.fecha_fin, ""),
    notas: asString(record.notas, ""),
  }
}

function bankDraftFromRecord(record: AnyRecord): BankDraft {
  return {
    id: String(record.id ?? crypto.randomUUID()),
    alias: asString(record.alias, ""),
    banco_nombre: asString(record.banco_nombre, ""),
    banco_clave: asString(record.banco_clave, ""),
    pais: asString(record.pais, "MX"),
    moneda: asString(record.moneda, "MXN"),
    tipo_cuenta: asString(record.tipo_cuenta, ""),
    titular: asString(record.titular, ""),
    numero_cuenta: asString(record.numero_cuenta, ""),
    clabe: asString(record.clabe, ""),
    swift: asString(record.swift, ""),
    iban: asString(record.iban, ""),
    es_principal: Boolean(record.es_principal),
    activo: Boolean(record.activo ?? true),
    observaciones: asString(record.observaciones, ""),
  }
}

export function ProveedorCreateModal({
  open,
  onOpenChange,
  defaultCode,
  personas,
  mode,
  proveedor,
  proveedorContactos,
  proveedorCuentasBancarias,
}: ProveedorCreateModalProps) {
  const router = useRouter()
  const [tab, setTab] = useState("general")
  const [saving, setSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState("")
  const [codigoProveedor, setCodigoProveedor] = useState(defaultCode)
  const [razonSocial, setRazonSocial] = useState("")
  const [nombreComercial, setNombreComercial] = useState("")
  const [rfc, setRfc] = useState("")
  const [correo, setCorreo] = useState("")
  const [telefono, setTelefono] = useState("")
  const [plazoPagoDias, setPlazoPagoDias] = useState("")
  const [plazoEntregaDias, setPlazoEntregaDias] = useState("")
  const [limiteCredito, setLimiteCredito] = useState("")
  const [monedaPreferida, setMonedaPreferida] = useState("MXN")
  const [activo, setActivo] = useState(true)
  const [observaciones, setObservaciones] = useState("")
  const [contacts, setContacts] = useState<ContactDraft[]>([])
  const [banks, setBanks] = useState<BankDraft[]>([])
  const [originalContactIds, setOriginalContactIds] = useState<string[]>([])
  const [originalBankIds, setOriginalBankIds] = useState<string[]>([])

  const personaOptions = useMemo(
    () =>
      personas
        .map((persona) => {
          const value = asString(persona?.id, "").trim()
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

  const resetForm = useCallback(() => {
    setTab("general")
    setSaving(false)
    setErrorMessage("")
    setCodigoProveedor(defaultCode)
    setRazonSocial("")
    setNombreComercial("")
    setRfc("")
    setCorreo("")
    setTelefono("")
    setPlazoPagoDias("")
    setPlazoEntregaDias("")
    setLimiteCredito("")
    setMonedaPreferida("MXN")
    setActivo(true)
    setObservaciones("")
    setContacts([])
    setBanks([])
    setOriginalContactIds([])
    setOriginalBankIds([])
  }, [defaultCode])

  useEffect(() => {
    if (open) {
      if (mode === "edit" && proveedor) {
        setTab("general")
        setSaving(false)
        setErrorMessage("")
        setCodigoProveedor(asString(proveedor.codigo_proveedor, defaultCode))
        setRazonSocial(asString(proveedor.razon_social, ""))
        setNombreComercial(asString(proveedor.nombre_comercial, ""))
        setRfc(asString(proveedor.rfc, ""))
        setCorreo(asString(proveedor.correo, ""))
        setTelefono(asString(proveedor.telefono, ""))
        setPlazoPagoDias(asString(proveedor.plazo_pago_dias, ""))
        setPlazoEntregaDias(asString(proveedor.plazo_entrega_dias, ""))
        setLimiteCredito(asString(proveedor.limite_credito, ""))
        setMonedaPreferida(asString(proveedor.moneda_preferida, "MXN"))
        setActivo(Boolean(proveedor.activo ?? true))
        setObservaciones(asString(proveedor.observaciones, ""))
        const providerId = String(proveedor.id ?? "")
        const providerContacts = proveedorContactos.filter((item) => String(item.proveedor_id) === providerId)
        const providerBanks = proveedorCuentasBancarias.filter((item) => String(item.proveedor_id) === providerId)
        setContacts(providerContacts.map(contactDraftFromRecord))
        setBanks(providerBanks.map(bankDraftFromRecord))
        setOriginalContactIds(providerContacts.map((item) => String(item.id)))
        setOriginalBankIds(providerBanks.map((item) => String(item.id)))
      } else {
        resetForm()
      }
    }
  }, [open, defaultCode, mode, proveedor, proveedorContactos, proveedorCuentasBancarias, resetForm])

  const handleClose = (nextOpen: boolean) => {
    onOpenChange(nextOpen)
    if (!nextOpen) {
      resetForm()
    }
  }

  const updateContact = (id: string, patch: Partial<ContactDraft>) => {
    setContacts((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)))
  }

  const updateBank = (id: string, patch: Partial<BankDraft>) => {
    setBanks((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)))
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSaving(true)
    setErrorMessage("")
    try {
      const formData = new FormData()
      formData.set("codigo_proveedor", codigoProveedor)
      formData.set("razon_social", razonSocial)
      if (nombreComercial.trim()) formData.set("nombre_comercial", nombreComercial)
      if (rfc.trim()) formData.set("rfc", rfc)
      if (correo.trim()) formData.set("correo", correo)
      if (telefono.trim()) formData.set("telefono", telefono)
      if (plazoPagoDias.trim()) formData.set("plazo_pago_dias", plazoPagoDias)
      if (plazoEntregaDias.trim()) formData.set("plazo_entrega_dias", plazoEntregaDias)
      if (limiteCredito.trim()) formData.set("limite_credito", limiteCredito)
      formData.set("moneda_preferida", monedaPreferida)
      formData.set("activo", String(activo))
      if (observaciones.trim()) formData.set("observaciones", observaciones)
      formData.set(
        "contactos_json",
        JSON.stringify(
          contacts
            .filter((row) => row.persona_id.trim().length > 0)
            .map((row) => ({
              persona_id: row.persona_id,
              rol_en_proveedor: row.rol_en_proveedor || "general",
              es_principal: row.es_principal,
              es_compras: row.es_compras,
              es_facturacion: row.es_facturacion,
              es_logistica: row.es_logistica,
              activo: row.activo,
              fecha_inicio: row.fecha_inicio || null,
              fecha_fin: row.fecha_fin || null,
              notas: row.notas || null,
            })),
        ),
      )
      formData.set(
        "cuentas_json",
        JSON.stringify(
          banks
            .filter((row) => row.banco_nombre.trim().length > 0)
            .map((row) => ({
              alias: row.alias || null,
              banco_nombre: row.banco_nombre,
              banco_clave: row.banco_clave || null,
              pais: row.pais || "MX",
              moneda: row.moneda || "MXN",
              tipo_cuenta: row.tipo_cuenta || null,
              titular: row.titular || null,
              numero_cuenta: row.numero_cuenta || null,
              clabe: row.clabe || null,
              swift: row.swift || null,
              iban: row.iban || null,
              es_principal: row.es_principal,
              activo: row.activo,
              observaciones: row.observaciones || null,
            })),
        ),
      )
      if (mode === "edit" && proveedor?.id) {
        await updateProveedorAction(String(proveedor.id), formData)
        for (const contactoId of originalContactIds) {
          await deleteProveedorContactoAction(contactoId)
        }
        for (const cuentaId of originalBankIds) {
          await deleteProveedorCuentaBancariaAction(cuentaId)
        }
        for (const contacto of contacts.filter((row) => row.persona_id.trim().length > 0)) {
          const contactoFormData = new FormData()
          contactoFormData.set("persona_id", contacto.persona_id)
          contactoFormData.set("rol_en_proveedor", contacto.rol_en_proveedor || "general")
          contactoFormData.set("es_principal", String(contacto.es_principal))
          contactoFormData.set("es_compras", String(contacto.es_compras))
          contactoFormData.set("es_facturacion", String(contacto.es_facturacion))
          contactoFormData.set("es_logistica", String(contacto.es_logistica))
          contactoFormData.set("activo", String(contacto.activo))
          if (contacto.fecha_inicio) contactoFormData.set("fecha_inicio", contacto.fecha_inicio)
          if (contacto.fecha_fin) contactoFormData.set("fecha_fin", contacto.fecha_fin)
          if (contacto.notas) contactoFormData.set("notas", contacto.notas)
          await createProveedorContactoAction(String(proveedor.id), contactoFormData)
        }
        for (const cuenta of banks.filter((row) => row.banco_nombre.trim().length > 0)) {
          const cuentaFormData = new FormData()
          if (cuenta.alias) cuentaFormData.set("alias", cuenta.alias)
          cuentaFormData.set("banco_nombre", cuenta.banco_nombre)
          if (cuenta.banco_clave) cuentaFormData.set("banco_clave", cuenta.banco_clave)
          cuentaFormData.set("pais", cuenta.pais || "MX")
          cuentaFormData.set("moneda", cuenta.moneda || "MXN")
          if (cuenta.tipo_cuenta) cuentaFormData.set("tipo_cuenta", cuenta.tipo_cuenta)
          if (cuenta.titular) cuentaFormData.set("titular", cuenta.titular)
          if (cuenta.numero_cuenta) cuentaFormData.set("numero_cuenta", cuenta.numero_cuenta)
          if (cuenta.clabe) cuentaFormData.set("clabe", cuenta.clabe)
          if (cuenta.swift) cuentaFormData.set("swift", cuenta.swift)
          if (cuenta.iban) cuentaFormData.set("iban", cuenta.iban)
          cuentaFormData.set("es_principal", String(cuenta.es_principal))
          cuentaFormData.set("activo", String(cuenta.activo))
          if (cuenta.observaciones) cuentaFormData.set("observaciones", cuenta.observaciones)
          await createProveedorCuentaBancariaAction(String(proveedor.id), cuentaFormData)
        }
      } else {
        const response = await createProveedorConRelacionesAction(formData)
        void response
      }
      handleClose(false)
      router.refresh()
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : mode === "edit" ? "No se pudo actualizar el proveedor" : "No se pudo crear el proveedor")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-h-[92vh] max-w-6xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{mode === "edit" ? "Editar proveedor" : "Crear proveedor"}</DialogTitle>
          <DialogDescription>
            Captura la información general, condiciones, contactos y cuentas bancarias en un solo flujo.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input type="hidden" name="codigo_proveedor" value={codigoProveedor} readOnly />
          <Tabs value={tab} onValueChange={setTab} className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="general">General</TabsTrigger>
              <TabsTrigger value="condiciones">Condiciones</TabsTrigger>
              <TabsTrigger value="contactos">Contactos</TabsTrigger>
              <TabsTrigger value="bancos">Bancos</TabsTrigger>
            </TabsList>

            <TabsContent value="general" className="mt-4 space-y-4">
              <div className="grid gap-4 md:grid-cols-6">
                <div className="space-y-2 md:col-span-1">
                  <label className="text-sm font-medium">Código</label>
                  <Input value={codigoProveedor} readOnly className="bg-muted/40" />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm font-medium" htmlFor="proveedor-razon-modal">
                    Razón social
                  </label>
                  <Input id="proveedor-razon-modal" value={razonSocial} onChange={(event) => setRazonSocial(event.target.value)} required />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm font-medium" htmlFor="proveedor-comercial-modal">
                    Nombre comercial
                  </label>
                  <Input id="proveedor-comercial-modal" value={nombreComercial} onChange={(event) => setNombreComercial(event.target.value)} />
                </div>
                <div className="space-y-2 md:col-span-1">
                  <label className="text-sm font-medium" htmlFor="proveedor-rfc-modal">
                    RFC
                  </label>
                  <Input id="proveedor-rfc-modal" value={rfc} onChange={(event) => setRfc(event.target.value)} />
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-4">
                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm font-medium" htmlFor="proveedor-correo-modal">
                    Correo
                  </label>
                  <Input id="proveedor-correo-modal" type="email" value={correo} onChange={(event) => setCorreo(event.target.value)} />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm font-medium" htmlFor="proveedor-telefono-modal">
                    Teléfono
                  </label>
                  <Input id="proveedor-telefono-modal" value={telefono} onChange={(event) => setTelefono(event.target.value)} />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="condiciones" className="mt-4 space-y-4">
              <div className="grid gap-3 md:grid-cols-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="proveedor-plazo-pago-modal">
                    Plazo pago
                  </label>
                  <Input id="proveedor-plazo-pago-modal" type="number" min="0" value={plazoPagoDias} onChange={(event) => setPlazoPagoDias(event.target.value)} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="proveedor-plazo-entrega-modal">
                    Plazo entrega
                  </label>
                  <Input id="proveedor-plazo-entrega-modal" type="number" min="0" value={plazoEntregaDias} onChange={(event) => setPlazoEntregaDias(event.target.value)} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="proveedor-limite-credito-modal">
                    Límite crédito
                  </label>
                  <Input id="proveedor-limite-credito-modal" type="number" min="0" step="0.01" value={limiteCredito} onChange={(event) => setLimiteCredito(event.target.value)} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="proveedor-moneda-modal">
                    Moneda preferida
                  </label>
                  <Input id="proveedor-moneda-modal" maxLength={3} value={monedaPreferida} onChange={(event) => setMonedaPreferida(event.target.value.toUpperCase())} />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={activo} onChange={(event) => setActivo(event.target.checked)} />
                Activo
              </label>
              <Textarea value={observaciones} onChange={(event) => setObservaciones(event.target.value)} placeholder="Observaciones y condiciones comerciales" />
            </TabsContent>

            <TabsContent value="contactos" className="mt-4 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h4 className="text-base font-semibold">Contactos</h4>
                  <p className="text-sm text-muted-foreground">Agrega las personas que atenderán este proveedor.</p>
                </div>
                <Button type="button" variant="outline" onClick={() => setContacts((current) => [...current, newContactDraft()])}>
                  Agregar contacto
                </Button>
              </div>
              {!contacts.length ? (
                <div className="rounded-lg border border-dashed px-4 py-6 text-sm text-muted-foreground">
                  Aún no has agregado contactos. Usa &quot;Agregar contacto&quot; si quieres capturarlos en este momento.
                </div>
              ) : (
                <div className="space-y-4">
                  {contacts.map((row, index) => (
                    <div key={row.id} className="space-y-4 rounded-lg border p-4">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm font-medium">Contacto {index + 1}</div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setContacts((current) => current.filter((item) => item.id !== row.id))}
                        >
                          Quitar
                        </Button>
                      </div>
                      <div className="grid gap-3 md:grid-cols-2">
                        <div className="space-y-2 md:col-span-2">
                          <label className="text-sm font-medium">Persona</label>
                          <ContactCatalogSelect
                            value={row.persona_id}
                            onValueChange={(value) => updateContact(row.id, { persona_id: value })}
                            options={mergeCatalogOptions(personaOptions, row.persona_id, "Actual")}
                            placeholder="Selecciona una persona"
                            emptyLabel="No hay personas disponibles"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-medium">Rol</label>
                          <Input value={row.rol_en_proveedor} onChange={(event) => updateContact(row.id, { rol_en_proveedor: event.target.value })} />
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-medium">Inicio</label>
                          <Input type="date" value={row.fecha_inicio} onChange={(event) => updateContact(row.id, { fecha_inicio: event.target.value })} />
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-medium">Fin</label>
                          <Input type="date" value={row.fecha_fin} onChange={(event) => updateContact(row.id, { fecha_fin: event.target.value })} />
                        </div>
                      </div>
                      <div className="grid gap-3 md:grid-cols-3">
                        <label className="flex items-center gap-2 text-sm">
                          <input type="checkbox" checked={row.es_principal} onChange={(event) => updateContact(row.id, { es_principal: event.target.checked })} />
                          Principal
                        </label>
                        <label className="flex items-center gap-2 text-sm">
                          <input type="checkbox" checked={row.activo} onChange={(event) => updateContact(row.id, { activo: event.target.checked })} />
                          Activo
                        </label>
                        <label className="flex items-center gap-2 text-sm">
                          <input type="checkbox" checked={row.es_compras} onChange={(event) => updateContact(row.id, { es_compras: event.target.checked })} />
                          Compras
                        </label>
                        <label className="flex items-center gap-2 text-sm">
                          <input type="checkbox" checked={row.es_facturacion} onChange={(event) => updateContact(row.id, { es_facturacion: event.target.checked })} />
                          Facturación
                        </label>
                        <label className="flex items-center gap-2 text-sm">
                          <input type="checkbox" checked={row.es_logistica} onChange={(event) => updateContact(row.id, { es_logistica: event.target.checked })} />
                          Logística
                        </label>
                      </div>
                      <Textarea value={row.notas} onChange={(event) => updateContact(row.id, { notas: event.target.value })} placeholder="Notas del contacto" />
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="bancos" className="mt-4 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h4 className="text-base font-semibold">Cuentas bancarias</h4>
                  <p className="text-sm text-muted-foreground">Captura una o más cuentas para pagos y transferencias.</p>
                </div>
                <Button type="button" variant="outline" onClick={() => setBanks((current) => [...current, newBankDraft()])}>
                  Agregar cuenta
                </Button>
              </div>
              {!banks.length ? (
                <div className="rounded-lg border border-dashed px-4 py-6 text-sm text-muted-foreground">
                  Aún no has agregado cuentas. Si no las necesitas ahora, puedes crear el proveedor sin ellas.
                </div>
              ) : (
                <div className="space-y-4">
                  {banks.map((row, index) => (
                    <div key={row.id} className="space-y-4 rounded-lg border p-4">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm font-medium">Cuenta {index + 1}</div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setBanks((current) => current.filter((item) => item.id !== row.id))}
                        >
                          Quitar
                        </Button>
                      </div>
                      <div className="grid gap-3 md:grid-cols-2">
                        <div className="space-y-2">
                          <label className="text-sm font-medium">Banco</label>
                          <Input value={row.banco_nombre} onChange={(event) => updateBank(row.id, { banco_nombre: event.target.value })} required />
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-medium">Alias</label>
                          <Input value={row.alias} onChange={(event) => updateBank(row.id, { alias: event.target.value })} />
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-medium">Titular</label>
                          <Input value={row.titular} onChange={(event) => updateBank(row.id, { titular: event.target.value })} />
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-medium">Tipo de cuenta</label>
                          <Input value={row.tipo_cuenta} onChange={(event) => updateBank(row.id, { tipo_cuenta: event.target.value })} />
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-medium">País</label>
                          <Input maxLength={2} value={row.pais} onChange={(event) => updateBank(row.id, { pais: event.target.value.toUpperCase() })} />
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-medium">Moneda</label>
                          <Input maxLength={3} value={row.moneda} onChange={(event) => updateBank(row.id, { moneda: event.target.value.toUpperCase() })} />
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-medium">Número de cuenta</label>
                          <Input value={row.numero_cuenta} onChange={(event) => updateBank(row.id, { numero_cuenta: event.target.value })} />
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-medium">CLABE</label>
                          <Input value={row.clabe} onChange={(event) => updateBank(row.id, { clabe: event.target.value })} />
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-medium">SWIFT</label>
                          <Input value={row.swift} onChange={(event) => updateBank(row.id, { swift: event.target.value })} />
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-medium">IBAN</label>
                          <Input value={row.iban} onChange={(event) => updateBank(row.id, { iban: event.target.value })} />
                        </div>
                      </div>
                      <div className="grid gap-3 md:grid-cols-2">
                        <label className="flex items-center gap-2 text-sm">
                          <input type="checkbox" checked={row.es_principal} onChange={(event) => updateBank(row.id, { es_principal: event.target.checked })} />
                          Principal
                        </label>
                        <label className="flex items-center gap-2 text-sm">
                          <input type="checkbox" checked={row.activo} onChange={(event) => updateBank(row.id, { activo: event.target.checked })} />
                          Activa
                        </label>
                      </div>
                      <Textarea value={row.observaciones} onChange={(event) => updateBank(row.id, { observaciones: event.target.value })} placeholder="Observaciones de la cuenta" />
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>

          {errorMessage ? <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">{errorMessage}</div> : null}

          <div className="flex items-center justify-end gap-2 border-t pt-4">
            <Button type="button" variant="outline" onClick={() => handleClose(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving || !razonSocial.trim()}>
              {saving ? "Guardando..." : mode === "edit" ? "Guardar cambios" : "Crear proveedor"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
