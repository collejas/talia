"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { GeoLocationSelects } from "@/components/contactos/geo-location-selects";

export type AccountDirectionType = "fiscal" | "principal" | "sucursal" | "fiscal_principal";

export type AccountDirectionDraft = {
  key: string;
  tipo: AccountDirectionType;
  pais: string;
  clave_entidad: string;
  entidad: string;
  clave_municipio: string;
  municipio: string;
  clave_localidad: string;
  localidad: string;
  tipo_vialidad: string;
  nombre_vialidad: string;
  numero_exterior: string;
  letra_exterior: string;
  edificio: string;
  edificio_piso: string;
  numero_interior: string;
  letra_interior: string;
  tipo_asentamiento: string;
  nombre_asentamiento: string;
  tipo_centro_comercial: string;
  corredor_industrial: string;
  numero_local: string;
  codigo_postal: string;
  latitud: string;
  longitud: string;
};

export function createEmptyDirectionDraft(overrides?: Partial<AccountDirectionDraft>): AccountDirectionDraft {
  return {
    key: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    tipo: "sucursal",
    pais: "MX",
    clave_entidad: "",
    entidad: "",
    clave_municipio: "",
    municipio: "",
    clave_localidad: "",
    localidad: "",
    tipo_vialidad: "",
    nombre_vialidad: "",
    numero_exterior: "",
    letra_exterior: "",
    edificio: "",
    edificio_piso: "",
    numero_interior: "",
    letra_interior: "",
    tipo_asentamiento: "",
    nombre_asentamiento: "",
    tipo_centro_comercial: "",
    corredor_industrial: "",
    numero_local: "",
    codigo_postal: "",
    latitud: "",
    longitud: "",
    ...overrides,
  };
}

export function normalizeDirectionType(value: string | null | undefined): AccountDirectionType {
  const normalized = (value ?? "").trim().toLowerCase();
  if (normalized === "fiscal_principal" || normalized === "fiscal-principal" || normalized === "fiscal y principal") {
    return "fiscal_principal";
  }
  if (normalized === "fiscal" || normalized === "facturacion") {
    return "fiscal";
  }
  if (normalized === "principal" || normalized === "operativa") {
    return "principal";
  }
  return "sucursal";
}

export function directionTypeIncludesFiscal(value: AccountDirectionType): boolean {
  return value === "fiscal" || value === "fiscal_principal";
}

export function directionTypeIncludesPrincipal(value: AccountDirectionType): boolean {
  return value === "principal" || value === "fiscal_principal";
}

export function buildDirectionPayload(direction: AccountDirectionDraft, relationType?: "fiscal" | "principal" | "sucursal") {
  const tipo = relationType ?? (direction.tipo === "fiscal_principal" ? "fiscal" : direction.tipo);
  return {
    tipo,
    pais: direction.pais.trim() || null,
    clave_entidad: direction.clave_entidad.trim() || null,
    entidad: direction.entidad.trim() || null,
    clave_municipio: direction.clave_municipio.trim() || null,
    municipio: direction.municipio.trim() || null,
    clave_localidad: direction.clave_localidad.trim() || null,
    localidad: direction.localidad.trim() || null,
    tipo_vialidad: direction.tipo_vialidad.trim() || null,
    nombre_vialidad: direction.nombre_vialidad.trim() || null,
    numero_exterior: direction.numero_exterior.trim() || null,
    letra_exterior: direction.letra_exterior.trim() || null,
    edificio: direction.edificio.trim() || null,
    edificio_piso: direction.edificio_piso.trim() || null,
    numero_interior: direction.numero_interior.trim() || null,
    letra_interior: direction.letra_interior.trim() || null,
    tipo_asentamiento: direction.tipo_asentamiento.trim() || null,
    nombre_asentamiento: direction.nombre_asentamiento.trim() || null,
    colonia: direction.nombre_asentamiento.trim() || null,
    tipo_centro_comercial: direction.tipo_centro_comercial.trim() || null,
    corredor_industrial: direction.corredor_industrial.trim() || null,
    numero_local: direction.numero_local.trim() || null,
    codigo_postal: direction.codigo_postal.trim() || null,
    latitud: direction.latitud.trim() && Number.isFinite(Number(direction.latitud)) ? Number(direction.latitud) : null,
    longitud: direction.longitud.trim() && Number.isFinite(Number(direction.longitud)) ? Number(direction.longitud) : null,
  };
}

function directionTypeLabel(type: AccountDirectionType): string {
  switch (type) {
    case "fiscal":
      return "Fiscal";
    case "principal":
      return "Principal";
    case "fiscal_principal":
      return "Fiscal + principal";
    default:
      return "Sucursal";
  }
}

type DirectionCardProps = {
  idPrefix: string;
  value: AccountDirectionDraft;
  onChange: (next: AccountDirectionDraft) => void;
  onRemove?: () => void;
  lockFiscal?: boolean;
  disabled?: boolean;
};

export function AccountDirectionCard({
  idPrefix,
  value,
  onChange,
  onRemove,
  lockFiscal = false,
  disabled = false,
}: DirectionCardProps) {
  const showFiscalWarning = lockFiscal && !directionTypeIncludesFiscal(value.tipo);
  const canPickFiscal = !lockFiscal || directionTypeIncludesFiscal(value.tipo);

  return (
    <div className="rounded-xl border border-border/60 bg-background p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="text-sm font-semibold">Dirección</div>
          <div className="text-xs text-muted-foreground">{directionTypeLabel(value.tipo)}</div>
        </div>
        {onRemove ? (
          <Button type="button" variant="outline" size="sm" onClick={onRemove} disabled={disabled}>
            Quitar
          </Button>
        ) : null}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="md:col-span-2 space-y-2">
          <Label htmlFor={`${idPrefix}-tipo`}>Tipo de dirección</Label>
          <Select
            value={value.tipo}
            onValueChange={(nextValue) => onChange({ ...value, tipo: normalizeDirectionType(nextValue) })}
            disabled={disabled}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Selecciona un tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="fiscal" disabled={!canPickFiscal}>
                Fiscal
              </SelectItem>
              <SelectItem value="principal">Principal</SelectItem>
              <SelectItem value="sucursal">Sucursal</SelectItem>
              <SelectItem value="fiscal_principal" disabled={!canPickFiscal}>
                Fiscal + principal
              </SelectItem>
            </SelectContent>
          </Select>
          {showFiscalWarning ? (
            <p className="text-xs text-amber-600">
              Ya existe una dirección fiscal. Cambia esta dirección a principal o sucursal antes de agregar otra fiscal.
            </p>
          ) : null}
        </div>

        <GeoLocationSelects
          countryCode={value.pais}
          stateCode={value.clave_entidad}
          municipalityCode={value.clave_municipio}
          onCountryChange={(countryCode) => {
            const nextCountry = countryCode || "MX";
            onChange({
              ...value,
              pais: nextCountry,
              ...(nextCountry !== "MX"
                ? {
                    clave_entidad: "",
                    entidad: "",
                    clave_municipio: "",
                    municipio: "",
                  }
                : {}),
            });
          }}
          onStateChange={(stateCode, stateName) =>
            onChange({
              ...value,
              clave_entidad: stateCode,
              entidad: stateName,
              clave_municipio: "",
              municipio: "",
            })
          }
          onMunicipalityChange={(municipalityCode, municipalityName) =>
            onChange({
              ...value,
              clave_municipio: municipalityCode,
              municipio: municipalityName,
            })
          }
          disabled={disabled}
        />

        <Field label="Localidad">
          <Input value={value.localidad} onChange={(event) => onChange({ ...value, localidad: event.target.value })} disabled={disabled} />
        </Field>
        <Field label="Tipo de vialidad">
          <Input value={value.tipo_vialidad} onChange={(event) => onChange({ ...value, tipo_vialidad: event.target.value })} disabled={disabled} />
        </Field>
        <Field label="Nombre de vialidad">
          <Input value={value.nombre_vialidad} onChange={(event) => onChange({ ...value, nombre_vialidad: event.target.value })} disabled={disabled} />
        </Field>
        <Field label="Número exterior">
          <Input value={value.numero_exterior} onChange={(event) => onChange({ ...value, numero_exterior: event.target.value })} disabled={disabled} />
        </Field>
        <Field label="Letra exterior">
          <Input value={value.letra_exterior} onChange={(event) => onChange({ ...value, letra_exterior: event.target.value })} disabled={disabled} />
        </Field>
        <Field label="Edificio">
          <Input value={value.edificio} onChange={(event) => onChange({ ...value, edificio: event.target.value })} disabled={disabled} />
        </Field>
        <Field label="Piso / nivel">
          <Input value={value.edificio_piso} onChange={(event) => onChange({ ...value, edificio_piso: event.target.value })} disabled={disabled} />
        </Field>
        <Field label="Número interior">
          <Input value={value.numero_interior} onChange={(event) => onChange({ ...value, numero_interior: event.target.value })} disabled={disabled} />
        </Field>
        <Field label="Letra interior">
          <Input value={value.letra_interior} onChange={(event) => onChange({ ...value, letra_interior: event.target.value })} disabled={disabled} />
        </Field>
        <Field label="Tipo de asentamiento">
          <Input value={value.tipo_asentamiento} onChange={(event) => onChange({ ...value, tipo_asentamiento: event.target.value })} disabled={disabled} />
        </Field>
        <Field label="Colonia">
          <Input
            value={value.nombre_asentamiento}
            onChange={(event) => onChange({ ...value, nombre_asentamiento: event.target.value })}
            disabled={disabled}
          />
        </Field>
        <Field label="Tipo de centro comercial">
          <Input value={value.tipo_centro_comercial} onChange={(event) => onChange({ ...value, tipo_centro_comercial: event.target.value })} disabled={disabled} />
        </Field>
        <Field label="Corredor industrial">
          <Input value={value.corredor_industrial} onChange={(event) => onChange({ ...value, corredor_industrial: event.target.value })} disabled={disabled} />
        </Field>
        <Field label="Número local">
          <Input value={value.numero_local} onChange={(event) => onChange({ ...value, numero_local: event.target.value })} disabled={disabled} />
        </Field>
        <Field label="Código postal">
          <Input value={value.codigo_postal} onChange={(event) => onChange({ ...value, codigo_postal: event.target.value })} disabled={disabled} />
        </Field>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
