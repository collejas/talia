"use client"

import * as React from "react"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type GeoCountryOption = {
  code: string
  name: string
  name_long?: string | null
}

type GeoStateOption = {
  code: string
  name: string
}

type GeoMunicipalityOption = {
  state_code: string
  code: string
  name: string
}

type FiscalAddressValues = {
  pais?: string | null
  pais_codigo_iso2?: string | null
  estado?: string | null
  estado_clave_entidad?: string | null
  ciudad?: string | null
  municipio_clave_entidad?: string | null
  municipio_clave_municipio?: string | null
  direccion_fiscal_calle?: string | null
  direccion_fiscal_numero_exterior?: string | null
  direccion_fiscal_numero_interior?: string | null
  direccion_fiscal_colonia?: string | null
  direccion_fiscal_localidad?: string | null
  direccion_fiscal_referencia?: string | null
  codigo_postal?: string | null
}

type FiscalAddressFieldsProps = {
  values?: FiscalAddressValues | null
  disabled?: boolean
}

async function fetchGeoJson<T>(url: string, signal: AbortSignal): Promise<T[]> {
  const response = await fetch(url, { signal })
  const body = (await response.json().catch(() => ({}))) as { items?: T[]; error?: string }
  if (!response.ok) {
    throw new Error(body.error || `Error ${response.status}`)
  }
  return Array.isArray(body.items) ? body.items : []
}

export function TenantFiscalAddressFields({ values, disabled = false }: FiscalAddressFieldsProps) {
  const [countries, setCountries] = React.useState<GeoCountryOption[]>([])
  const [states, setStates] = React.useState<GeoStateOption[]>([])
  const [municipalities, setMunicipalities] = React.useState<GeoMunicipalityOption[]>([])
  const initialCountryCode = (values?.pais_codigo_iso2 || values?.pais || "").trim().toUpperCase()
  const [countryCode, setCountryCode] = React.useState(() =>
    initialCountryCode.length === 2 ? initialCountryCode : "MX",
  )
  const [stateCode, setStateCode] = React.useState(() => (values?.estado_clave_entidad || "").trim())
  const [municipalityCode, setMunicipalityCode] = React.useState(() => (values?.municipio_clave_municipio || "").trim())
  const [stateName, setStateName] = React.useState(() => (values?.estado || "").trim())
  const [municipalityName, setMunicipalityName] = React.useState(() => (values?.ciudad || "").trim())
  const [cityText, setCityText] = React.useState(() => (values?.ciudad || "").trim())
  const [loadingCountries, setLoadingCountries] = React.useState(false)
  const [loadingStates, setLoadingStates] = React.useState(false)
  const [loadingMunicipalities, setLoadingMunicipalities] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    const controller = new AbortController()
    let mounted = true
    setLoadingCountries(true)
    setError(null)
    fetchGeoJson<GeoCountryOption>("/api/personas/catalogos/paises", controller.signal)
      .then((items) => {
        if (!mounted) return
        const next = items.filter((item) => item.code && item.name)
        setCountries(next)
        if (!countryCode && next.some((item) => item.code === "MX")) {
          setCountryCode("MX")
        }
      })
      .catch((fetchError) => {
        if (!mounted || controller.signal.aborted) return
        setError(fetchError instanceof Error ? fetchError.message : "No fue posible cargar países.")
        setCountries([])
      })
      .finally(() => {
        if (mounted) {
          setLoadingCountries(false)
        }
      })
    return () => {
      mounted = false
      controller.abort()
    }
  }, [countryCode])

  React.useEffect(() => {
    const controller = new AbortController()
    let mounted = true
    if (countryCode !== "MX") {
      setStates([])
      return () => {
        mounted = false
        controller.abort()
      }
    }
    setLoadingStates(true)
    setError(null)
    fetchGeoJson<GeoStateOption>(`/api/personas/catalogos/estados?pais=${encodeURIComponent(countryCode)}`, controller.signal)
      .then((items) => {
        if (!mounted) return
        const next = items.filter((item) => item.code && item.name)
        setStates(next)
        if (stateCode && !stateName) {
          const matched = next.find((item) => item.code === stateCode)
          if (matched) {
            setStateName(matched.name)
          }
        }
        if (!stateCode && stateName) {
          const matched = next.find((item) => item.name.trim().toLowerCase() === stateName.trim().toLowerCase())
          if (matched) {
            setStateCode(matched.code)
            setStateName(matched.name)
          }
        }
      })
      .catch((fetchError) => {
        if (!mounted || controller.signal.aborted) return
        setError(fetchError instanceof Error ? fetchError.message : "No fue posible cargar estados.")
        setStates([])
      })
      .finally(() => {
        if (mounted) {
          setLoadingStates(false)
        }
      })
    return () => {
      mounted = false
      controller.abort()
    }
  }, [countryCode, stateCode, stateName])

  React.useEffect(() => {
    const controller = new AbortController()
    let mounted = true
    if (countryCode !== "MX" || !stateCode) {
      setMunicipalities([])
      return () => {
        mounted = false
        controller.abort()
      }
    }
    setLoadingMunicipalities(true)
    setError(null)
    fetchGeoJson<GeoMunicipalityOption>(
      `/api/personas/catalogos/municipios?pais=${encodeURIComponent(countryCode)}&estado=${encodeURIComponent(stateCode)}`,
      controller.signal,
    )
      .then((items) => {
        if (!mounted) return
        const next = items.filter((item) => item.code && item.name)
        setMunicipalities(next)
        if (municipalityCode && !municipalityName) {
          const matched = next.find((item) => item.code === municipalityCode)
          if (matched) {
            setMunicipalityName(matched.name)
            setCityText(matched.name)
          }
        }
        if (!municipalityCode && cityText) {
          const matched = next.find((item) => item.name.trim().toLowerCase() === cityText.trim().toLowerCase())
          if (matched) {
            setMunicipalityCode(matched.code)
            setMunicipalityName(matched.name)
            setCityText(matched.name)
          }
        }
      })
      .catch((fetchError) => {
        if (!mounted || controller.signal.aborted) return
        setError(fetchError instanceof Error ? fetchError.message : "No fue posible cargar municipios.")
        setMunicipalities([])
      })
      .finally(() => {
        if (mounted) {
          setLoadingMunicipalities(false)
        }
      })
    return () => {
      mounted = false
      controller.abort()
    }
  }, [countryCode, stateCode, municipalityCode, cityText])

  const selectedCountry = countries.find((item) => item.code === countryCode)
  const stateSelectDisabled = disabled || countryCode !== "MX" || loadingStates
  const municipalitySelectDisabled = disabled || countryCode !== "MX" || !stateCode || loadingMunicipalities

  return (
    <section className="space-y-4 rounded-xl border border-border/60 bg-muted/20 p-4">
      <div className="space-y-1">
        <p className="text-sm font-medium">Domicilio fiscal</p>
        <p className="text-xs text-muted-foreground">
          Usa catálogos geográficos para país y, en México, para estado y municipio.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="tenant_pais_codigo_iso2">País</Label>
          <select
            id="tenant_pais_codigo_iso2"
            name="tenant_pais_codigo_iso2"
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs disabled:cursor-not-allowed disabled:opacity-50"
            value={countryCode}
            onChange={(event) => {
              const nextCountry = event.target.value.trim().toUpperCase()
              setCountryCode(nextCountry)
              setStateCode("")
              setMunicipalityCode("")
              setStateName("")
              setMunicipalityName("")
              setCityText("")
            }}
            disabled={disabled || loadingCountries}
          >
            {countries.length ? null : <option value="MX">México</option>}
            {countries.map((country) => (
              <option key={country.code} value={country.code}>
                {country.name_long || country.name}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">
            {selectedCountry ? selectedCountry.name_long || selectedCountry.name : "Selecciona el país fiscal."}
          </p>
        </div>

        {countryCode === "MX" ? (
          <div className="space-y-2">
            <Label htmlFor="tenant_estado_clave_entidad">Estado</Label>
            <select
              id="tenant_estado_clave_entidad"
              name="tenant_estado_clave_entidad"
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs disabled:cursor-not-allowed disabled:opacity-50"
              value={stateCode}
              onChange={(event) => {
                const nextStateCode = event.target.value.trim()
                const nextState = states.find((item) => item.code === nextStateCode)
                setStateCode(nextStateCode)
                setStateName(nextState?.name || "")
                setMunicipalityCode("")
                setMunicipalityName("")
                setCityText("")
              }}
              disabled={stateSelectDisabled}
            >
              <option value="">{loadingStates ? "Cargando estados..." : "Selecciona un estado"}</option>
              {states.map((state) => (
                <option key={state.code} value={state.code}>
                  {state.code} - {state.name}
                </option>
              ))}
            </select>
            <input type="hidden" name="tenant_estado" value={stateName} />
            <input type="hidden" name="tenant_municipio_clave_entidad" value={stateCode} />
            {loadingStates ? <p className="text-xs text-muted-foreground">Cargando estados...</p> : null}
          </div>
        ) : (
          <div className="space-y-2">
            <Label htmlFor="tenant_estado">Estado / provincia</Label>
            <Input
              id="tenant_estado"
              name="tenant_estado"
              value={stateName}
              onChange={(event) => setStateName(event.target.value)}
              placeholder="Estado, provincia o región"
              disabled={disabled}
            />
            <input type="hidden" name="tenant_estado_clave_entidad" value="" />
            <input type="hidden" name="tenant_municipio_clave_entidad" value="" />
            <input type="hidden" name="tenant_municipio_clave_municipio" value="" />
          </div>
        )}

        {countryCode === "MX" ? (
          <div className="space-y-2">
            <Label htmlFor="tenant_municipio_clave_municipio">Municipio</Label>
            <select
              id="tenant_municipio_clave_municipio"
              name="tenant_municipio_clave_municipio"
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs disabled:cursor-not-allowed disabled:opacity-50"
              value={municipalityCode}
              onChange={(event) => {
                const nextMunicipalityCode = event.target.value.trim()
                const nextMunicipality = municipalities.find((item) => item.code === nextMunicipalityCode)
                setMunicipalityCode(nextMunicipalityCode)
                setMunicipalityName(nextMunicipality?.name || "")
                setCityText(nextMunicipality?.name || "")
              }}
              disabled={municipalitySelectDisabled}
            >
              <option value="">{loadingMunicipalities ? "Cargando municipios..." : "Selecciona un municipio"}</option>
              {municipalities.map((municipality) => (
                <option key={`${municipality.state_code}-${municipality.code}`} value={municipality.code}>
                  {municipality.code} - {municipality.name}
                </option>
              ))}
            </select>
            <input type="hidden" name="tenant_ciudad" value={municipalityName} />
            <input type="hidden" name="tenant_pais" value={countryCode} />
            {loadingMunicipalities ? <p className="text-xs text-muted-foreground">Cargando municipios...</p> : null}
          </div>
        ) : (
          <div className="space-y-2">
            <Label htmlFor="tenant_ciudad">Ciudad</Label>
            <Input
              id="tenant_ciudad"
              name="tenant_ciudad"
              value={cityText}
              onChange={(event) => setCityText(event.target.value)}
              placeholder="Ciudad o localidad"
              disabled={disabled}
            />
            <input type="hidden" name="tenant_pais" value={countryCode} />
            <input type="hidden" name="tenant_municipio_clave_entidad" value="" />
            <input type="hidden" name="tenant_municipio_clave_municipio" value="" />
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="tenant_codigo_postal">Código postal</Label>
          <Input
            id="tenant_codigo_postal"
            name="tenant_codigo_postal"
            defaultValue={values?.codigo_postal ?? ""}
            disabled={disabled}
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="tenant_direccion_fiscal_calle">Calle</Label>
          <Input
            id="tenant_direccion_fiscal_calle"
            name="tenant_direccion_fiscal_calle"
            defaultValue={values?.direccion_fiscal_calle ?? ""}
            disabled={disabled}
            placeholder="Calle principal"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="tenant_direccion_fiscal_numero_exterior">Número exterior</Label>
          <Input
            id="tenant_direccion_fiscal_numero_exterior"
            name="tenant_direccion_fiscal_numero_exterior"
            defaultValue={values?.direccion_fiscal_numero_exterior ?? ""}
            disabled={disabled}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="tenant_direccion_fiscal_numero_interior">Número interior</Label>
          <Input
            id="tenant_direccion_fiscal_numero_interior"
            name="tenant_direccion_fiscal_numero_interior"
            defaultValue={values?.direccion_fiscal_numero_interior ?? ""}
            disabled={disabled}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="tenant_direccion_fiscal_colonia">Colonia</Label>
          <Input
            id="tenant_direccion_fiscal_colonia"
            name="tenant_direccion_fiscal_colonia"
            defaultValue={values?.direccion_fiscal_colonia ?? ""}
            disabled={disabled}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="tenant_direccion_fiscal_localidad">Localidad</Label>
          <Input
            id="tenant_direccion_fiscal_localidad"
            name="tenant_direccion_fiscal_localidad"
            defaultValue={values?.direccion_fiscal_localidad ?? ""}
            disabled={disabled}
          />
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="tenant_direccion_fiscal_referencia">Referencia</Label>
          <Input
            id="tenant_direccion_fiscal_referencia"
            name="tenant_direccion_fiscal_referencia"
            defaultValue={values?.direccion_fiscal_referencia ?? ""}
            disabled={disabled}
            placeholder="Entre calles, puntos de referencia o acceso"
          />
        </div>
      </div>

      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </section>
  )
}
