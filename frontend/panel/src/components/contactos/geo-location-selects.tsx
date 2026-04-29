"use client";

import * as React from "react";

import { Label } from "@/components/ui/label";

type GeoCountryOption = {
  code: string;
  name: string;
  name_long?: string | null;
};

type GeoStateOption = {
  code: string;
  name: string;
};

type GeoMunicipalityOption = {
  state_code: string;
  code: string;
  name: string;
};

type GeoLocationSelectsProps = {
  countryCode: string;
  stateCode: string;
  municipalityCode: string;
  onCountryChange: (countryCode: string) => void;
  onStateChange: (stateCode: string, stateName: string) => void;
  onMunicipalityChange: (municipalityCode: string, municipalityName: string) => void;
  disabled?: boolean;
};

async function fetchGeoJson<T>(url: string, signal: AbortSignal): Promise<T[]> {
  const response = await fetch(url, { signal });
  const body = (await response.json().catch(() => ({}))) as { items?: T[]; error?: string };
  if (!response.ok) {
    throw new Error(body.error || `Error ${response.status}`);
  }
  return Array.isArray(body.items) ? body.items : [];
}

export function GeoLocationSelects({
  countryCode,
  stateCode,
  municipalityCode,
  onCountryChange,
  onStateChange,
  onMunicipalityChange,
  disabled = false,
}: GeoLocationSelectsProps) {
  const [countries, setCountries] = React.useState<GeoCountryOption[]>([]);
  const [states, setStates] = React.useState<GeoStateOption[]>([]);
  const [municipalities, setMunicipalities] = React.useState<GeoMunicipalityOption[]>([]);
  const [loadingCountries, setLoadingCountries] = React.useState(false);
  const [loadingStates, setLoadingStates] = React.useState(false);
  const [loadingMunicipalities, setLoadingMunicipalities] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const onCountryChangeRef = React.useRef(onCountryChange);
  const onStateChangeRef = React.useRef(onStateChange);
  const onMunicipalityChangeRef = React.useRef(onMunicipalityChange);

  React.useEffect(() => {
    onCountryChangeRef.current = onCountryChange;
  }, [onCountryChange]);

  React.useEffect(() => {
    onStateChangeRef.current = onStateChange;
  }, [onStateChange]);

  React.useEffect(() => {
    onMunicipalityChangeRef.current = onMunicipalityChange;
  }, [onMunicipalityChange]);

  React.useEffect(() => {
    const controller = new AbortController();
    let mounted = true;
    setLoadingCountries(true);
    setError(null);
    fetchGeoJson<GeoCountryOption>("/api/contactos/catalogos/paises", controller.signal)
      .then((items) => {
        if (!mounted) return;
        const next = items.filter((item) => item.code && item.name);
        setCountries(next);
        if (!countryCode && next.some((item) => item.code === "MX")) {
          onCountryChangeRef.current("MX");
        }
      })
      .catch((fetchError) => {
        if (!mounted || controller.signal.aborted) return;
        setError(fetchError instanceof Error ? fetchError.message : "No fue posible cargar países.");
        setCountries([]);
      })
      .finally(() => {
        if (mounted) {
          setLoadingCountries(false);
        }
      });
    return () => {
      mounted = false;
      controller.abort();
    };
  }, [countryCode]);

  React.useEffect(() => {
    const controller = new AbortController();
    let mounted = true;
    if (countryCode !== "MX") {
      setStates([]);
      setMunicipalities([]);
      return () => {
        mounted = false;
        controller.abort();
      };
    }
    setLoadingStates(true);
    setError(null);
    fetchGeoJson<GeoStateOption>(`/api/contactos/catalogos/estados?pais=${encodeURIComponent(countryCode)}`, controller.signal)
      .then((items) => {
        if (!mounted) return;
        const next = items.filter((item) => item.code && item.name);
        setStates(next);
      })
      .catch((fetchError) => {
        if (!mounted || controller.signal.aborted) return;
        setError(fetchError instanceof Error ? fetchError.message : "No fue posible cargar estados.");
        setStates([]);
      })
      .finally(() => {
        if (mounted) {
          setLoadingStates(false);
        }
      });
    return () => {
      mounted = false;
      controller.abort();
    };
  }, [countryCode]);

  React.useEffect(() => {
    const controller = new AbortController();
    let mounted = true;
    if (countryCode !== "MX" || !stateCode) {
      setMunicipalities([]);
      return () => {
        mounted = false;
        controller.abort();
      };
    }
    setLoadingMunicipalities(true);
    setError(null);
    fetchGeoJson<GeoMunicipalityOption>(
      `/api/contactos/catalogos/municipios?pais=${encodeURIComponent(countryCode)}&estado=${encodeURIComponent(stateCode)}`,
      controller.signal,
    )
      .then((items) => {
        if (!mounted) return;
        const next = items.filter((item) => item.code && item.name);
        setMunicipalities(next);
      })
      .catch((fetchError) => {
        if (!mounted || controller.signal.aborted) return;
        setError(fetchError instanceof Error ? fetchError.message : "No fue posible cargar municipios.");
        setMunicipalities([]);
      })
      .finally(() => {
        if (mounted) {
          setLoadingMunicipalities(false);
        }
      });
    return () => {
      mounted = false;
      controller.abort();
    };
  }, [countryCode, stateCode]);

  const selectedCountryLabel =
    countries.find((item) => item.code === countryCode)?.name ||
    countries.find((item) => item.code === "MX")?.name ||
    "México";

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      <div className="space-y-2">
        <Label htmlFor="geo-country">País</Label>
        <select
          id="geo-country"
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
          value={countryCode || "MX"}
          onChange={(event) => onCountryChangeRef.current(event.target.value)}
          disabled={disabled || loadingCountries}
        >
          {countries.length ? null : <option value="MX">México</option>}
          {countries.map((country) => (
            <option key={country.code} value={country.code}>
              {country.name}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">{selectedCountryLabel}</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="geo-state">Estado</Label>
        <select
          id="geo-state"
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs disabled:cursor-not-allowed disabled:opacity-50"
          value={stateCode}
          onChange={(event) => {
            const nextState = states.find((item) => item.code === event.target.value);
            onStateChangeRef.current(event.target.value, nextState?.name || "");
          }}
          disabled={disabled || countryCode !== "MX" || loadingStates}
        >
          <option value="">{countryCode === "MX" ? "Selecciona un estado" : "Solo México"}</option>
          {states.map((state) => (
            <option key={state.code} value={state.code}>
              {state.code} - {state.name}
            </option>
          ))}
        </select>
        {loadingStates ? <p className="text-xs text-muted-foreground">Cargando estados...</p> : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="geo-municipality">Municipio</Label>
        <select
          id="geo-municipality"
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs disabled:cursor-not-allowed disabled:opacity-50"
          value={municipalityCode}
          onChange={(event) => {
            const nextMunicipality = municipalities.find((item) => item.code === event.target.value);
            onMunicipalityChangeRef.current(event.target.value, nextMunicipality?.name || "");
          }}
          disabled={disabled || countryCode !== "MX" || !stateCode || loadingMunicipalities}
        >
          <option value="">{countryCode === "MX" ? "Selecciona un municipio" : "Solo México"}</option>
          {municipalities.map((municipality) => (
            <option key={`${municipality.state_code}-${municipality.code}`} value={municipality.code}>
              {municipality.code} - {municipality.name}
            </option>
          ))}
        </select>
        {loadingMunicipalities ? <p className="text-xs text-muted-foreground">Cargando municipios...</p> : null}
      </div>

      {error ? <p className="md:col-span-3 text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
