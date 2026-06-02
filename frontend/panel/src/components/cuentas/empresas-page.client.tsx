"use client";

import * as React from "react";
import { IconAdjustmentsHorizontal, IconSearch, IconX } from "@tabler/icons-react";

import { AccountSectionCards } from "@/components/cuentas/section-cards";
import { AccountsDataTable } from "@/components/cuentas/accounts-data-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { ContactCatalogSelect, mergeCatalogOptions } from "@/components/contactos/contact-catalog-select";
import { useTenantContactCatalogs } from "@/components/contactos/use-contact-catalogs";
import type { DataTableRow } from "@/components/data-table";
import type { AccountAdvancedFilters, AccountCards, AccountFilters } from "@/lib/cuentas/types";

type Props = {
  rows: DataTableRow[];
};

const DEFAULT_ADVANCED_FILTERS: AccountAdvancedFilters = {
  estado: "all",
  tipoCuenta: "all",
  tamano: "",
  clasificacion: "",
  regimenCapital: "",
  fechaCreacionFrom: "",
  fechaCreacionTo: "",
  fechaIncorporacionFrom: "",
  fechaIncorporacionTo: "",
  pais: "",
  estadoDireccion: "",
  municipio: "",
};

const ACCOUNT_TYPE_OPTIONS = [
  { value: "all", label: "Todos" },
  { value: "empresa", label: "Empresa" },
  { value: "persona_fisica_actividad_empresarial", label: "Persona física con actividad empresarial" },
] as const;

const ACCOUNT_STATE_OPTIONS = [
  { value: "all", label: "Todos" },
  { value: "activo", label: "Activo" },
  { value: "inactivo", label: "Inactivo" },
] as const;

const ACCOUNT_FILTERS_STORAGE_KEY = "accounts-view-filters";

type StoredAccountFilters = {
  searchTerm: string;
  ownerFilter: string;
  createdFromFilter: string;
  createdToFilter: string;
  advancedFilters: AccountAdvancedFilters;
};

function isStoredAccountFilters(value: unknown): value is StoredAccountFilters {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.searchTerm === "string" &&
    typeof record.ownerFilter === "string" &&
    typeof record.createdFromFilter === "string" &&
    typeof record.createdToFilter === "string" &&
    typeof record.advancedFilters === "object" &&
    record.advancedFilters !== null
  );
}

function loadStoredAccountFilters(): StoredAccountFilters | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(ACCOUNT_FILTERS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!isStoredAccountFilters(parsed)) return null;
    return {
      searchTerm: parsed.searchTerm,
      ownerFilter: parsed.ownerFilter,
      createdFromFilter: parsed.createdFromFilter,
      createdToFilter: parsed.createdToFilter,
      advancedFilters: { ...DEFAULT_ADVANCED_FILTERS, ...parsed.advancedFilters },
    };
  } catch {
    return null;
  }
}

export function EmpresasPageClient({ rows }: Props) {
  const [tableRows, setTableRows] = React.useState<DataTableRow[]>(rows);
  const [filtersHydrated, setFiltersHydrated] = React.useState(false);
  const [searchTerm, setSearchTerm] = React.useState("");
  const [ownerFilter, setOwnerFilter] = React.useState("all");
  const [createdFromFilter, setCreatedFromFilter] = React.useState("");
  const [createdToFilter, setCreatedToFilter] = React.useState("");
  const [advancedFilters, setAdvancedFilters] = React.useState<AccountAdvancedFilters>({ ...DEFAULT_ADVANCED_FILTERS });
  const [advancedOpen, setAdvancedOpen] = React.useState(false);

  const tenantCatalogs = useTenantContactCatalogs();

  React.useEffect(() => {
    setTableRows(rows);
  }, [rows]);

  React.useEffect(() => {
    const stored = loadStoredAccountFilters();
    if (stored) {
      setSearchTerm(stored.searchTerm);
      setOwnerFilter(stored.ownerFilter);
      setCreatedFromFilter(stored.createdFromFilter);
      setCreatedToFilter(stored.createdToFilter);
      setAdvancedFilters(stored.advancedFilters);
    }
    setFiltersHydrated(true);
  }, []);

  React.useEffect(() => {
    if (!filtersHydrated || typeof window === "undefined") return;
    try {
      const payload: StoredAccountFilters = {
        searchTerm,
        ownerFilter,
        createdFromFilter,
        createdToFilter,
        advancedFilters,
      };
      window.localStorage.setItem(ACCOUNT_FILTERS_STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // Ignore persistence failures.
    }
  }, [advancedFilters, createdFromFilter, createdToFilter, filtersHydrated, ownerFilter, searchTerm]);

  const tamanoOptions = React.useMemo(
    () => mergeCatalogOptions(tenantCatalogs.tamanoOptions, advancedFilters.tamano),
    [advancedFilters.tamano, tenantCatalogs.tamanoOptions],
  );
  const clasificacionOptions = React.useMemo(
    () => mergeCatalogOptions(tenantCatalogs.clasificacionNegocioOptions, advancedFilters.clasificacion),
    [advancedFilters.clasificacion, tenantCatalogs.clasificacionNegocioOptions],
  );

  const ownerOptions = React.useMemo(() => {
    const options = new Map<string, string>();
    for (const row of tableRows) {
      const raw = row.raw as Record<string, unknown> | undefined;
      const ownerId = getText(raw?.propietario_usuario_id);
      const ownerName = getText(raw?.propietario_nombre);
      if (!ownerId) continue;
      if (!options.has(ownerId)) {
        options.set(ownerId, ownerName || ownerId);
      }
    }
    if (ownerFilter !== "all" && !options.has(ownerFilter)) {
      options.set(ownerFilter, ownerFilter);
    }
    return Array.from(options.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((left, right) => left.label.localeCompare(right.label, "es"));
  }, [ownerFilter, tableRows]);

  const filteredRows = React.useMemo(() => {
    const search = normalizeSearch(searchTerm);
    const createdFrom = parseDateInput(createdFromFilter, "start");
    const createdTo = parseDateInput(createdToFilter, "end");

    return tableRows.filter((row) => {
      const raw = row.raw as Record<string, unknown> | undefined;
      if (!raw) return false;
      if (search && !matchesSearch(raw, search)) return false;
      if (ownerFilter !== "all" && getText(raw.propietario_usuario_id) !== ownerFilter) return false;

      const createdAt = getRowDate(raw, ["creado_en"]);
      if (createdFrom !== null && (createdAt === null || createdAt < createdFrom)) return false;
      if (createdTo !== null && (createdAt === null || createdAt > createdTo)) return false;

      if (!matchesAdvancedFilters(raw, advancedFilters)) return false;
      return true;
    });
  }, [advancedFilters, createdFromFilter, createdToFilter, ownerFilter, searchTerm, tableRows]);

  const cards = React.useMemo(() => mapCardsFromRows(filteredRows), [filteredRows]);
  const activeAdvancedFilterCount = React.useMemo(
    () => countAdvancedFilterSelections(advancedFilters),
    [advancedFilters],
  );

  const resultsLabel =
    searchTerm.trim().length > 0 || createdFromFilter || createdToFilter || ownerFilter !== "all" || activeAdvancedFilterCount > 0
      ? `${filteredRows.length} de ${tableRows.length} empresas`
      : `${tableRows.length} empresas`;

  return (
    <div className="space-y-4">
      <AccountSectionCards data={cards} />
      <div className="px-4 lg:px-6">
        <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-xs">
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-[260px] flex-1">
              <Label htmlFor="empresas-search" className="sr-only">Buscar empresas</Label>
              <div className="relative">
                <IconSearch className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="empresas-search"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Buscar empresa, razón social, RFC o contacto..."
                  className="pl-9"
                />
              </div>
            </div>
            <Select value={ownerFilter} onValueChange={setOwnerFilter}>
              <SelectTrigger className="w-[220px]">
                <SelectValue placeholder="Propietario" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los propietarios</SelectItem>
                {ownerOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input type="date" value={createdFromFilter} onChange={(event) => setCreatedFromFilter(event.target.value)} className="w-[170px]" />
            <Input type="date" value={createdToFilter} onChange={(event) => setCreatedToFilter(event.target.value)} className="w-[170px]" />
            <Button type="button" variant="secondary" onClick={() => setAdvancedOpen(true)}>
              <IconAdjustmentsHorizontal className="size-4" />
              Filtros avanzados
              {activeAdvancedFilterCount > 0 ? <span className="ml-1 rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">{activeAdvancedFilterCount}</span> : null}
            </Button>
            {(searchTerm || ownerFilter !== "all" || createdFromFilter || createdToFilter || activeAdvancedFilterCount > 0) ? (
              <Button type="button" variant="ghost" onClick={clearFilters}>
                <IconX className="size-4" />
                Limpiar
              </Button>
            ) : null}
          </div>
          <div className="text-sm text-muted-foreground">{resultsLabel}</div>
        </div>
      </div>

      <AccountsDataTable rows={filteredRows} />

      <Dialog open={advancedOpen} onOpenChange={setAdvancedOpen}>
        <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Filtros avanzados</DialogTitle>
            <DialogDescription>Filtra empresas por campos comerciales, fiscales y de dirección.</DialogDescription>
          </DialogHeader>
          <div className="space-y-5">
            <FilterSection title="Empresas" description="Campos generales de la cuenta.">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label>Estado</Label>
                  <Select value={advancedFilters.estado} onValueChange={(value) => setAdvancedFilters((current) => ({ ...current, estado: value as AccountAdvancedFilters["estado"] }))}>
                    <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
                    <SelectContent>
                      {ACCOUNT_STATE_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label>Tipo de cuenta</Label>
                  <Select value={advancedFilters.tipoCuenta} onValueChange={(value) => setAdvancedFilters((current) => ({ ...current, tipoCuenta: value as AccountAdvancedFilters["tipoCuenta"] }))}>
                    <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
                    <SelectContent>
                      {ACCOUNT_TYPE_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label>Tamaño</Label>
                  <ContactCatalogSelect
                    value={advancedFilters.tamano}
                    onValueChange={(value) => setAdvancedFilters((current) => ({ ...current, tamano: value }))}
                    options={tamanoOptions}
                    placeholder={tenantCatalogs.loading ? "Cargando catálogo..." : "Todos"}
                    emptyLabel="Sin opciones configuradas"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label>Clasificación</Label>
                  <ContactCatalogSelect
                    value={advancedFilters.clasificacion}
                    onValueChange={(value) => setAdvancedFilters((current) => ({ ...current, clasificacion: value }))}
                    options={clasificacionOptions}
                    placeholder={tenantCatalogs.loading ? "Cargando catálogo..." : "Todos"}
                    emptyLabel="Sin opciones configuradas"
                  />
                </div>
                <div className="grid gap-1.5 md:col-span-2">
                  <Label>Régimen de capital</Label>
                  <Input
                    value={advancedFilters.regimenCapital}
                    onChange={(event) => setAdvancedFilters((current) => ({ ...current, regimenCapital: event.target.value }))}
                    placeholder="Ej. Persona moral, capital variable..."
                  />
                </div>
              </div>
            </FilterSection>

            <FilterSection title="Fechas" description="Rangos de creación e incorporación.">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label>Fecha de creación desde</Label>
                  <Input type="date" value={advancedFilters.fechaCreacionFrom} onChange={(event) => setAdvancedFilters((current) => ({ ...current, fechaCreacionFrom: event.target.value }))} />
                </div>
                <div className="grid gap-1.5">
                  <Label>Fecha de creación hasta</Label>
                  <Input type="date" value={advancedFilters.fechaCreacionTo} onChange={(event) => setAdvancedFilters((current) => ({ ...current, fechaCreacionTo: event.target.value }))} />
                </div>
                <div className="grid gap-1.5">
                  <Label>Fecha de incorporación desde</Label>
                  <Input type="date" value={advancedFilters.fechaIncorporacionFrom} onChange={(event) => setAdvancedFilters((current) => ({ ...current, fechaIncorporacionFrom: event.target.value }))} />
                </div>
                <div className="grid gap-1.5">
                  <Label>Fecha de incorporación hasta</Label>
                  <Input type="date" value={advancedFilters.fechaIncorporacionTo} onChange={(event) => setAdvancedFilters((current) => ({ ...current, fechaIncorporacionTo: event.target.value }))} />
                </div>
              </div>
            </FilterSection>

            <FilterSection title="Direcciones" description="Ubicación fiscal o principal de la empresa.">
              <div className="grid gap-4 md:grid-cols-3">
                <div className="grid gap-1.5">
                  <Label>País</Label>
                  <Input value={advancedFilters.pais} onChange={(event) => setAdvancedFilters((current) => ({ ...current, pais: event.target.value }))} />
                </div>
                <div className="grid gap-1.5">
                  <Label>Estado</Label>
                  <Input value={advancedFilters.estadoDireccion} onChange={(event) => setAdvancedFilters((current) => ({ ...current, estadoDireccion: event.target.value }))} />
                </div>
                <div className="grid gap-1.5">
                  <Label>Municipio</Label>
                  <Input value={advancedFilters.municipio} onChange={(event) => setAdvancedFilters((current) => ({ ...current, municipio: event.target.value }))} />
                </div>
              </div>
            </FilterSection>
          </div>
          <DialogFooter className="gap-2 sm:justify-between">
            <Button type="button" variant="outline" onClick={resetAdvancedFilters}>Limpiar filtros</Button>
            <Button type="button" onClick={() => setAdvancedOpen(false)}>Aplicar filtros</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );

  function clearFilters() {
    setSearchTerm("");
    setOwnerFilter("all");
    setCreatedFromFilter("");
    setCreatedToFilter("");
    setAdvancedFilters({ ...DEFAULT_ADVANCED_FILTERS });
  }

  function resetAdvancedFilters() {
    setAdvancedFilters({ ...DEFAULT_ADVANCED_FILTERS });
  }
}

function FilterSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Separator />
      {children}
    </section>
  );
}

function getText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function normalizeSearch(value: string): string {
  return value.trim().toLowerCase();
}

function parseDateInput(value: string, boundary: "start" | "end"): number | null {
  const raw = value.trim();
  if (!raw) return null;
  const parts = raw.split("-").map((part) => Number(part));
  if (parts.length !== 3 || parts.some((part) => !Number.isInteger(part))) return null;
  const [year, month, day] = parts;
  const date =
    boundary === "start"
      ? new Date(year, month - 1, day, 0, 0, 0, 0)
      : new Date(year, month - 1, day, 23, 59, 59, 999);
  const timestamp = date.getTime();
  return Number.isNaN(timestamp) ? null : timestamp;
}

function getRowDate(raw: Record<string, unknown> | undefined, keys: string[]): number | null {
  if (!raw) return null;
  for (const key of keys) {
    const value = getText(raw[key]);
    if (!value) continue;
    const timestamp = Date.parse(value);
    if (!Number.isNaN(timestamp)) return timestamp;
  }
  return null;
}

function matchesSearch(raw: Record<string, unknown>, term: string): boolean {
  const haystack = [
    raw.nombre,
    raw.alias,
    raw.razon_social,
    raw.codigo_cuenta,
    raw.rfc,
    raw.tipo,
    raw.industria,
    raw.tipo_establecimiento,
    raw.propietario_nombre,
    raw.contacto_principal_nombre,
  ]
    .map((value) => normalizeSearch(getText(value)))
    .join(" ");
  return haystack.includes(term);
}

function matchesAdvancedFilters(raw: Record<string, unknown>, filters: AccountAdvancedFilters): boolean {
  if (filters.estado !== "all" && normalizeSearch(getText(raw.estado)) !== filters.estado) return false;
  if (filters.tipoCuenta !== "all" && normalizeSearch(getText(raw.tipo)) !== filters.tipoCuenta) return false;
  if (filters.tamano && normalizeSearch(getText(raw.tamano)) !== normalizeSearch(filters.tamano)) return false;
  if (filters.clasificacion && normalizeSearch(getText(raw.tipo_establecimiento)) !== normalizeSearch(filters.clasificacion)) return false;
  if (filters.regimenCapital && normalizeSearch(getText(raw.regimen_capital)) !== normalizeSearch(filters.regimenCapital)) return false;

  const createdAt = getRowDate(raw, ["creado_en", "actualizado_en"]);
  const createdFrom = parseDateInput(filters.fechaCreacionFrom, "start");
  const createdTo = parseDateInput(filters.fechaCreacionTo, "end");
  if (createdFrom !== null && (createdAt === null || createdAt < createdFrom)) return false;
  if (createdTo !== null && (createdAt === null || createdAt > createdTo)) return false;

  const incorporation = getRowDate(raw, ["fecha_incorporacion"]);
  const incorporationFrom = parseDateInput(filters.fechaIncorporacionFrom, "start");
  const incorporationTo = parseDateInput(filters.fechaIncorporacionTo, "end");
  if (incorporationFrom !== null && (incorporation === null || incorporation < incorporationFrom)) return false;
  if (incorporationTo !== null && (incorporation === null || incorporation > incorporationTo)) return false;

  if (filters.pais && normalizeSearch(getText(raw.pais)) !== normalizeSearch(filters.pais)) return false;
  if (filters.estadoDireccion && normalizeSearch(getText(raw.entidad)) !== normalizeSearch(filters.estadoDireccion)) return false;
  if (filters.municipio && normalizeSearch(getText(raw.municipio)) !== normalizeSearch(filters.municipio)) return false;
  return true;
}

function countAdvancedFilterSelections(filters: AccountAdvancedFilters): number {
  let count = 0;
  if (filters.estado !== "all") count += 1;
  if (filters.tipoCuenta !== "all") count += 1;
  if (filters.tamano) count += 1;
  if (filters.clasificacion) count += 1;
  if (filters.regimenCapital) count += 1;
  if (filters.fechaCreacionFrom) count += 1;
  if (filters.fechaCreacionTo) count += 1;
  if (filters.fechaIncorporacionFrom) count += 1;
  if (filters.fechaIncorporacionTo) count += 1;
  if (filters.pais) count += 1;
  if (filters.estadoDireccion) count += 1;
  if (filters.municipio) count += 1;
  return count;
}

function mapCardsFromRows(rows: DataTableRow[]): AccountCards {
  if (!rows.length) {
    return {
      total: 0,
      completas: 0,
      incompletas: 0,
      activas: 0,
      propietarios: 0,
      topPropietarioNombre: null,
      topPropietarioTotal: 0,
      ultimo: null,
    };
  }

  const ownerCounts = new Map<string, { label: string; count: number }>();
  const owners = new Set<string>();
  let completas = 0;
  let incompletas = 0;
  let activas = 0;
  let ultimo: number | null = null;

  for (const row of rows) {
    const raw = row.raw as Record<string, unknown> | undefined;
    if (!raw) continue;
    if (isAccountComplete(raw)) completas += 1;
    else incompletas += 1;
    if (normalizeSearch(getText(raw.estado)) === "activo") activas += 1;
    const ownerId = getText(raw.propietario_usuario_id);
    const ownerName = getText(raw.propietario_nombre);
    if (ownerId) {
      owners.add(ownerId);
      const current = ownerCounts.get(ownerId);
      ownerCounts.set(ownerId, {
        label: ownerName || ownerId,
        count: (current?.count ?? 0) + 1,
      });
    }
    const createdAt = getRowDate(raw, ["creado_en"]);
    if (createdAt !== null && (ultimo === null || createdAt > ultimo)) {
      ultimo = createdAt;
    }
  }

  const topOwner = Array.from(ownerCounts.values()).sort((left, right) => {
    if (right.count !== left.count) return right.count - left.count;
    return left.label.localeCompare(right.label, "es");
  })[0];

  return {
    total: rows.length,
    completas,
    incompletas,
    activas,
    propietarios: owners.size,
    topPropietarioNombre: topOwner?.label ?? null,
    topPropietarioTotal: topOwner?.count ?? 0,
    ultimo: ultimo ? new Date(ultimo).toISOString() : null,
  };
}

function isAccountComplete(raw: Record<string, unknown>): boolean {
  return [
    getText(raw.tipo),
    getText(raw.tamano),
    getText(raw.tipo_establecimiento),
    getText(raw.regimen_capital),
    getText(raw.estado),
  ].every((value) => value.length > 0);
}
