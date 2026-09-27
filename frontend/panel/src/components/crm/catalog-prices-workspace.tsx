"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { IconAdjustmentsHorizontal, IconBuilding, IconDownload, IconPackage, IconPrinter, IconSearch } from "@tabler/icons-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export type CatalogPriceProduct = {
  id: string;
  nombre: string;
  descripcionCorta: string | null;
  descripcionLarga: string | null;
  codigo: string | null;
  tipo: string;
  unidad: string;
  precioBase: number | null;
  moneda: string;
  activo: boolean;
  manejaInventario: boolean;
  lineaNombre: string | null;
  familiaNombre: string | null;
  modeloNombre: string | null;
  preciosLista: Array<{ nombre: string; precio: number; moneda: string }>;
};

export type CatalogPriceProperty = {
  id: string;
  nombre: string;
  unidad: string | null;
  desarrollo: string;
  capa: string | null;
  manzana: string | null;
  status: string | null;
  precio: number | null;
  precioM2: number | null;
  areaM2: number | null;
  precioTipo: string;
};

type CatalogColumnId =
  | "producto"
  | "descripcion_corta"
  | "descripcion_larga"
  | "tipo"
  | "clasificacion"
  | "unidad"
  | "precio_base"
  | "precios_lista"
  | "stock_actual"
  | "stock_reservado"
  | "stock_disponible";

type Warehouse = { id: string; codigo: string | null; nombre: string; es_principal: boolean };
type StockRow = {
  catalog_item_id: string;
  almacen_id: string;
  stock_actual: number;
  stock_reservado: number;
  stock_disponible: number;
};
type InventoryResponse = {
  almacenes: Warehouse[];
  almacen_seleccionado_id: string | null;
  existencias: StockRow[];
};
type TablePreferences = {
  visibility?: Partial<Record<CatalogColumnId, boolean>>;
  widths?: Partial<Record<CatalogColumnId, number>>;
};

export type CatalogPrintBrand = {
  organization_name: string;
  logo_url: string;
  primary_color: string;
  accent_color: string;
};

const COLUMNS: Array<{ id: CatalogColumnId; label: string; initialWidth: number; minWidth: number }> = [
  { id: "producto", label: "Producto / servicio", initialWidth: 300, minWidth: 220 },
  { id: "descripcion_corta", label: "Descripción corta", initialWidth: 240, minWidth: 160 },
  { id: "descripcion_larga", label: "Descripción larga", initialWidth: 320, minWidth: 200 },
  { id: "tipo", label: "Tipo", initialWidth: 120, minWidth: 100 },
  { id: "clasificacion", label: "Clasificación", initialWidth: 220, minWidth: 150 },
  { id: "unidad", label: "Unidad", initialWidth: 105, minWidth: 85 },
  { id: "precio_base", label: "Precio base", initialWidth: 145, minWidth: 120 },
  { id: "precios_lista", label: "Precios por lista", initialWidth: 250, minWidth: 180 },
  { id: "stock_actual", label: "Actual", initialWidth: 115, minWidth: 100 },
  { id: "stock_reservado", label: "Reservado", initialWidth: 125, minWidth: 105 },
  { id: "stock_disponible", label: "Disponible", initialWidth: 125, minWidth: 105 },
];

const DEFAULT_VISIBILITY: Record<CatalogColumnId, boolean> = {
  producto: true,
  descripcion_corta: true,
  descripcion_larga: true,
  tipo: true,
  clasificacion: true,
  unidad: true,
  precio_base: true,
  precios_lista: true,
  stock_actual: true,
  stock_reservado: true,
  stock_disponible: true,
};

const DEFAULT_WIDTHS = Object.fromEntries(COLUMNS.map((column) => [column.id, column.initialWidth])) as Record<CatalogColumnId, number>;

function formatMoney(value: number | null, currency = "MXN") {
  if (value === null || !Number.isFinite(value)) return "Sin precio";
  return new Intl.NumberFormat("es-MX", { style: "currency", currency, maximumFractionDigits: 2 }).format(value);
}

function formatQuantity(value: number) {
  return new Intl.NumberFormat("es-MX", { maximumFractionDigits: 3 }).format(value);
}

function normalize(value: string | null | undefined) {
  return (value ?? "").trim().toLocaleLowerCase("es-MX");
}

async function downloadCatalogWorkbook(fileName: string, sheetName: string, rows: unknown[][], widths: number[]) {
  const xlsx = await import("@e965/xlsx");
  const sheet = xlsx.utils.aoa_to_sheet(rows);
  sheet["!cols"] = widths.map((wch) => ({ wch }));
  const workbook = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(workbook, sheet, sheetName);
  const buffer = xlsx.write(workbook, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
  const url = URL.createObjectURL(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

function ExportExcelButton({ onClick, disabled = false }: { onClick: () => void; disabled?: boolean }) {
  return (
    <Button type="button" variant="outline" size="sm" onClick={onClick} disabled={disabled}>
      <IconDownload className="mr-2 size-4" />Exportar Excel
    </Button>
  );
}

function PrintCatalogButton({ onClick, disabled = false }: { onClick: () => void; disabled?: boolean }) {
  return (
    <Button type="button" variant="outline" size="sm" onClick={onClick} disabled={disabled}>
      <IconPrinter className="mr-2 size-4" />Imprimir / guardar PDF
    </Button>
  );
}

function escapeHtml(value: unknown) {
  const escaped: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  };
  return String(value ?? "—").replace(/[&<>"']/g, (character) => escaped[character] ?? character);
}

function openCatalogPrintWindow({
  brand,
  title,
  details,
  headers,
  rows,
}: {
  brand: CatalogPrintBrand;
  title: string;
  details: string[];
  headers: string[];
  rows: unknown[][];
}) {
  const printWindow = window.open("", "_blank");
  if (!printWindow) return false;
  printWindow.opener = null;

  const primary = /^#[\da-f]{6}$/i.test(brand.primary_color) ? brand.primary_color : "#0f172a";
  const accent = /^#[\da-f]{6}$/i.test(brand.accent_color) ? brand.accent_color : "#14b8a6";
  const logoUrl = brand.logo_url;
  const safeLogoUrl = (logoUrl.startsWith("/") && !logoUrl.startsWith("//")) || /^https?:\/\//i.test(logoUrl)
    ? logoUrl
    : "";
  const tableHeader = headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("");
  const tableRows = rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("");
  const logo = safeLogoUrl ? `<img class="logo" src="${escapeHtml(safeLogoUrl)}" alt="Logo de ${escapeHtml(brand.organization_name)}">` : "";
  const detailMarkup = details.map((detail) => `<span>${escapeHtml(detail)}</span>`).join("");

  printWindow.document.open();
  printWindow.document.write(`<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} · ${escapeHtml(brand.organization_name)}</title>
<style>
@page { size: A4 landscape; margin: 12mm; }
* { box-sizing: border-box; }
body { color: ${primary}; font: 10px/1.4 Arial, sans-serif; margin: 0; }
header { align-items: center; border-bottom: 3px solid ${accent}; display: flex; gap: 18px; margin-bottom: 18px; padding: 0 0 12px; }
.logo { max-height: 58px; max-width: 150px; object-fit: contain; }
h1 { font-size: 19px; margin: 0 0 3px; }
h2 { color: ${accent}; font-size: 14px; margin: 0; }
.details { color: #475569; display: flex; flex-wrap: wrap; gap: 4px 16px; margin: 0 0 12px; }
table { border-collapse: collapse; table-layout: auto; width: 100%; }
thead { display: table-header-group; }
th { background: ${primary}; color: #fff; font-weight: 600; text-align: left; }
th, td { border: 1px solid #d8dee8; padding: 6px 7px; vertical-align: top; }
tbody tr:nth-child(even) { background: #f5f7fa; }
tr { break-inside: avoid; page-break-inside: avoid; }
@media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style></head><body>
<header>${logo}<div><h1>${escapeHtml(brand.organization_name)}</h1><h2>${escapeHtml(title)}</h2></div></header>
<p class="details">${detailMarkup}</p>
<table><thead><tr>${tableHeader}</tr></thead><tbody>${tableRows}</tbody></table>
</body></html>`);
  printWindow.document.close();

  const waitForImages = Promise.all(Array.from(printWindow.document.images).map((image) => image.complete
    ? Promise.resolve()
    : new Promise<void>((resolve) => {
        image.onload = () => resolve();
        image.onerror = () => resolve();
        window.setTimeout(resolve, 2500);
      }),
  ));
  void waitForImages.then(() => {
    printWindow.focus();
    printWindow.print();
  });
  return true;
}

function ProductTable({
  items,
  inventoryAccess,
  inventoryLoading,
  inventoryError,
  warehouses,
  selectedWarehouseId,
  onWarehouseChange,
  stockByItemId,
  visibility,
  widths,
  onVisibilityChange,
  onWidthChange,
  onReset,
  savingPreferences,
  preferencesError,
  onExport,
  onPrint,
  printDisabled,
  exportDisabled,
}: {
  items: CatalogPriceProduct[];
  inventoryAccess: boolean;
  inventoryLoading: boolean;
  inventoryError: string | null;
  warehouses: Warehouse[];
  selectedWarehouseId: string;
  onWarehouseChange: (warehouseId: string) => void;
  stockByItemId: Map<string, StockRow>;
  visibility: Record<CatalogColumnId, boolean>;
  widths: Record<CatalogColumnId, number>;
  onVisibilityChange: (columnId: CatalogColumnId, visible: boolean) => void;
  onWidthChange: (columnId: CatalogColumnId, width: number) => void;
  onReset: () => void;
  savingPreferences: boolean;
  preferencesError: boolean;
  onExport: () => void;
  onPrint: () => void;
  printDisabled: boolean;
  exportDisabled: boolean;
}) {
  const resizeRef = useRef<{ columnId: CatalogColumnId; startX: number; startWidth: number } | null>(null);
  const visibleColumns = COLUMNS.filter((column) =>
    visibility[column.id] && (inventoryAccess || !column.id.startsWith("stock_")),
  );

  useEffect(() => {
    const handleMove = (event: PointerEvent) => {
      const resize = resizeRef.current;
      if (!resize) return;
      const column = COLUMNS.find((candidate) => candidate.id === resize.columnId);
      const nextWidth = Math.max(column?.minWidth ?? 100, Math.min(800, resize.startWidth + event.clientX - resize.startX));
      onWidthChange(resize.columnId, Math.round(nextWidth));
    };
    const handleUp = () => { resizeRef.current = null; };
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("pointercancel", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleUp);
    };
  }, [onWidthChange]);

  const startResize = (event: ReactPointerEvent<HTMLSpanElement>, columnId: CatalogColumnId) => {
    event.preventDefault();
    event.stopPropagation();
    resizeRef.current = { columnId, startX: event.clientX, startWidth: widths[columnId] };
  };

  const totalWidth = visibleColumns.reduce((total, column) => total + widths[column.id], 0);
  const stockColumnsVisible = visibleColumns.some((column) => column.id.startsWith("stock_"));

  return (
    <div className="space-y-3">
      {inventoryAccess ? (
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="w-full space-y-1 sm:max-w-sm">
            <label className="text-sm font-medium" htmlFor="catalog-price-warehouse">Almacén de existencias</label>
            <Select value={selectedWarehouseId} onValueChange={onWarehouseChange} disabled={inventoryLoading || warehouses.length === 0}>
              <SelectTrigger id="catalog-price-warehouse"><SelectValue placeholder="Selecciona un almacén" /></SelectTrigger>
              <SelectContent>
                {warehouses.map((warehouse) => (
                  <SelectItem key={warehouse.id} value={warehouse.id}>
                    {warehouse.codigo ? `${warehouse.codigo} · ` : ""}{warehouse.nombre}{warehouse.es_principal ? " · Principal" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {warehouses.length === 0 && !inventoryLoading ? (
            <p className="text-sm text-muted-foreground">No hay almacenes activos registrados.</p>
          ) : null}
          {stockColumnsVisible && !selectedWarehouseId && !inventoryLoading ? (
            <p className="text-sm text-muted-foreground">Selecciona un almacén para consultar existencias.</p>
          ) : null}
        </div>
      ) : null}

      {inventoryError ? <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">{inventoryError}</p> : null}
      {preferencesError ? <p role="status" className="text-xs text-muted-foreground">No se pudieron sincronizar las preferencias de columnas.</p> : null}
      {!inventoryLoading && !inventoryAccess ? (
        <p className="rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">Tu rol no tiene permiso para consultar existencias.</p>
      ) : null}
      {savingPreferences ? <p aria-live="polite" className="text-xs text-muted-foreground">Guardando preferencias de columnas…</p> : null}

      <div className="flex flex-wrap justify-end gap-2">
        <PrintCatalogButton onClick={onPrint} disabled={printDisabled || exportDisabled} />
        <ExportExcelButton onClick={onExport} disabled={exportDisabled} />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="outline" size="sm"><IconAdjustmentsHorizontal className="mr-2 size-4" />Columnas</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="max-h-[min(75vh,500px)] w-64 overflow-y-auto">
            <DropdownMenuLabel>Campos visibles</DropdownMenuLabel>
            {COLUMNS.map((column) => (
              <DropdownMenuCheckboxItem
                key={column.id}
                checked={visibility[column.id]}
                disabled={column.id === "producto" || (column.id.startsWith("stock_") && !inventoryAccess)}
                onSelect={(event) => event.preventDefault()}
                onCheckedChange={(checked) => onVisibilityChange(column.id, checked === true)}
              >
                {column.label}
              </DropdownMenuCheckboxItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={(event) => { event.preventDefault(); onReset(); }}>Restablecer columnas</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <Table className="table-fixed" style={{ minWidth: `${Math.max(800, totalWidth)}px` }}>
          <TableHeader><TableRow>
            {visibleColumns.map((column) => (
              <TableHead key={column.id} className="relative overflow-hidden text-ellipsis whitespace-nowrap" style={{ width: `${widths[column.id]}px`, minWidth: `${column.minWidth}px` }}>
                <span className={column.id.startsWith("stock_") ? "block pr-2 text-right" : "block pr-2"}>{column.label}</span>
                <span
                  role="separator"
                  aria-label={`Cambiar ancho de ${column.label}`}
                  aria-orientation="vertical"
                  tabIndex={0}
                  className="absolute inset-y-0 right-0 z-10 w-2 cursor-col-resize touch-none after:absolute after:inset-y-2 after:right-[3px] after:w-px after:bg-border hover:after:bg-primary focus-visible:outline-none focus-visible:after:bg-primary"
                  onPointerDown={(event) => startResize(event, column.id)}
                  onKeyDown={(event) => {
                    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
                    event.preventDefault();
                    onWidthChange(column.id, widths[column.id] + (event.key === "ArrowRight" ? 16 : -16));
                  }}
                />
              </TableHead>
            ))}
          </TableRow></TableHeader>
          <TableBody>
            {items.map((item) => {
              const hierarchy = [item.lineaNombre, item.familiaNombre, item.modeloNombre].filter(Boolean).join(" · ");
              const stock = stockByItemId.get(item.id);
              return (
                <TableRow key={item.id}>
                  {visibleColumns.map((column) => {
                    const stockValue = column.id === "stock_actual"
                      ? stock?.stock_actual
                      : column.id === "stock_reservado"
                        ? stock?.stock_reservado
                        : column.id === "stock_disponible"
                          ? stock?.stock_disponible
                          : null;
                    if (column.id.startsWith("stock_")) {
                      return <TableCell key={column.id} className="text-right tabular-nums" title={!item.manejaInventario ? "El producto tiene desactivado Maneja inventario" : undefined}>
                        {!item.manejaInventario || !selectedWarehouseId ? "—" : formatQuantity(stockValue ?? 0)}
                      </TableCell>;
                    }
                    if (column.id === "producto") return <TableCell key={column.id} className="font-medium">
                      <div className="truncate" title={item.nombre}>{item.nombre}</div>
                      {item.codigo ? <div className="truncate text-xs text-muted-foreground" title={item.codigo}>{item.codigo}</div> : null}
                      {!item.manejaInventario ? <div className="text-xs text-muted-foreground">No maneja inventario</div> : null}
                    </TableCell>;
                    if (column.id === "descripcion_corta" || column.id === "descripcion_larga") {
                      const description = column.id === "descripcion_corta" ? item.descripcionCorta : item.descripcionLarga;
                      return <TableCell key={column.id} className="text-muted-foreground">
                        <div className="line-clamp-2 whitespace-normal" title={description ?? undefined}>{description || "—"}</div>
                      </TableCell>;
                    }
                    if (column.id === "tipo") return <TableCell key={column.id}><Badge variant="outline">{item.tipo}</Badge></TableCell>;
                    if (column.id === "clasificacion") return <TableCell key={column.id} className="truncate text-muted-foreground" title={hierarchy}>{hierarchy || "—"}</TableCell>;
                    if (column.id === "unidad") return <TableCell key={column.id}>{item.unidad}</TableCell>;
                    if (column.id === "precio_base") return <TableCell key={column.id} className="text-right font-medium">{formatMoney(item.precioBase, item.moneda)}</TableCell>;
                    return <TableCell key={column.id}>
                      <div className="min-w-0 space-y-1">
                        {item.preciosLista.length ? item.preciosLista.map((price) => (
                          <div className="flex justify-between gap-3" key={`${item.id}-${price.nombre}`}>
                            <span className="truncate text-muted-foreground" title={price.nombre}>{price.nombre}</span>
                            <span className="shrink-0">{formatMoney(price.precio, price.moneda)}</span>
                          </div>
                        )) : <span className="text-muted-foreground">—</span>}
                      </div>
                    </TableCell>;
                  })}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function PropertyTable({ items, onExport, onPrint, printDisabled, exportDisabled }: { items: CatalogPriceProperty[]; onExport: () => void; onPrint: () => void; printDisabled: boolean; exportDisabled: boolean }) {
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <div className="flex flex-wrap justify-end gap-2">
          <PrintCatalogButton onClick={onPrint} disabled={printDisabled || exportDisabled} />
          <ExportExcelButton onClick={onExport} disabled={exportDisabled} />
        </div>
      </div>
      <div className="overflow-x-auto rounded-lg border">
      <Table className="min-w-[900px]"><TableHeader><TableRow>
        <TableHead>Propiedad / unidad</TableHead><TableHead>Desarrollo</TableHead><TableHead>Nivel</TableHead><TableHead>Manzana</TableHead>
        <TableHead>Estado</TableHead><TableHead className="text-right">Precio total</TableHead><TableHead className="text-right">Precio por m²</TableHead><TableHead className="text-right">Área</TableHead>
      </TableRow></TableHeader><TableBody>{items.map((item) => {
        const total = item.precioTipo.toLowerCase() === "m2" && item.precioM2 !== null && item.areaM2 !== null ? item.precioM2 * item.areaM2 : item.precio;
        return <TableRow key={item.id}>
          <TableCell className="font-medium"><div>{item.nombre}</div>{item.unidad && item.unidad !== item.nombre ? <div className="text-xs text-muted-foreground">{item.unidad}</div> : null}</TableCell>
          <TableCell>{item.desarrollo}</TableCell><TableCell>{item.capa || "—"}</TableCell><TableCell>{item.manzana || "—"}</TableCell>
          <TableCell>{item.status ? <Badge variant="outline">{item.status}</Badge> : "—"}</TableCell>
          <TableCell className="text-right font-medium">{formatMoney(total)}</TableCell>
          <TableCell className="text-right">{item.precioM2 !== null ? formatMoney(item.precioM2) : "—"}</TableCell>
          <TableCell className="text-right">{item.areaM2 !== null ? `${item.areaM2.toLocaleString("es-MX")} m²` : "—"}</TableCell>
        </TableRow>;
      })}</TableBody></Table>
      </div>
    </div>
  );
}

export function CatalogPricesWorkspace({
  products,
  properties,
  printBrand,
}: {
  products: CatalogPriceProduct[];
  properties: CatalogPriceProperty[];
  printBrand: CatalogPrintBrand | null;
}) {
  const [search, setSearch] = useState("");
  const [productType, setProductType] = useState("all");
  const [inventory, setInventory] = useState<InventoryResponse>({ almacenes: [], almacen_seleccionado_id: null, existencias: [] });
  const [inventoryAccess, setInventoryAccess] = useState(false);
  const [inventoryLoading, setInventoryLoading] = useState(true);
  const [inventoryError, setInventoryError] = useState<string | null>(null);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState("");
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  const [preferencesError, setPreferencesError] = useState(false);
  const [savingPreferences, setSavingPreferences] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [visibility, setVisibility] = useState(DEFAULT_VISIBILITY);
  const [widths, setWidths] = useState(DEFAULT_WIDTHS);
  const loadedWarehouseRef = useRef<string | null>(null);
  const query = normalize(search);
  const filteredProducts = useMemo(
    () => products.filter((item) => {
      const matchesType = productType === "all" || item.tipo === productType;
      const haystack = normalize([item.nombre, item.codigo, item.lineaNombre, item.familiaNombre, item.modeloNombre].filter(Boolean).join(" "));
      return matchesType && (!query || haystack.includes(query));
    }),
    [products, productType, query],
  );
  const filteredProperties = useMemo(
    () => properties.filter((item) => normalize([item.nombre, item.unidad, item.desarrollo, item.capa, item.manzana].filter(Boolean).join(" ")).includes(query)),
    [properties, query],
  );
  const stockByItemId = useMemo(() => {
    const result = new Map<string, StockRow>();
    for (const row of inventory.existencias) result.set(row.catalog_item_id, row);
    return result;
  }, [inventory.existencias]);

  const loadInventory = useCallback(async (warehouseId?: string) => {
    setInventoryLoading(true);
    setInventoryError(null);
    if (warehouseId) setInventory((current) => ({ ...current, existencias: [] }));
    const queryString = warehouseId ? `?almacen_id=${encodeURIComponent(warehouseId)}` : "";
    try {
      const response = await fetch(`/api/crm/catalogo-precios/inventario${queryString}`, { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (response.status === 403) {
        setInventoryAccess(false);
        setInventory((current) => ({ ...current, existencias: [] }));
        return;
      }
      if (!response.ok) throw new Error("No se pudieron consultar las existencias. Intenta actualizar la vista.");
      const data = body as InventoryResponse;
      setInventory({
        almacenes: Array.isArray(data.almacenes) ? data.almacenes : [],
        almacen_seleccionado_id: data.almacen_seleccionado_id ?? null,
        existencias: Array.isArray(data.existencias) ? data.existencias : [],
      });
      setInventoryAccess(true);
      loadedWarehouseRef.current = data.almacen_seleccionado_id ?? null;
      if (!warehouseId) setSelectedWarehouseId(data.almacen_seleccionado_id ?? "");
    } catch (error) {
      setInventoryError(error instanceof Error ? error.message : "No se pudieron consultar las existencias.");
    } finally {
      setInventoryLoading(false);
    }
  }, []);

  useEffect(() => { void loadInventory(); }, [loadInventory]);

  useEffect(() => {
    if (!selectedWarehouseId || selectedWarehouseId === loadedWarehouseRef.current) return;
    void loadInventory(selectedWarehouseId);
  }, [loadInventory, selectedWarehouseId]);

  useEffect(() => {
    let active = true;
    const loadPreferences = async () => {
      try {
        const response = await fetch("/api/crm/catalogo-precios/preferences", { cache: "no-store" });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error("No se pudieron cargar las preferencias del catálogo.");
        if (!active) return;
        if (body?.preferences) {
          const stored = body.preferences as TablePreferences;
          setVisibility((current) => ({ ...current, ...(stored.visibility ?? {}) }));
          setWidths((current) => ({
            ...current,
            ...Object.fromEntries(Object.entries(stored.widths ?? {}).map(([id, width]) => [id, Math.max(100, Math.min(800, Number(width) || 0))])),
          }));
        }
        setPreferencesLoaded(true);
      } catch {
        // No se sobrescriben preferencias remotas cuando la lectura falla.
        setPreferencesError(true);
      }
    };
    void loadPreferences();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!preferencesLoaded) return;
    const timer = window.setTimeout(async () => {
      setSavingPreferences(true);
      try {
        const response = await fetch("/api/crm/catalogo-precios/preferences", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ visibility, widths }),
        });
        if (!response.ok) throw new Error("preference_save_failed");
        setPreferencesError(false);
      } catch {
        setPreferencesError(true);
      } finally {
        setSavingPreferences(false);
      }
    }, 500);
    return () => window.clearTimeout(timer);
  }, [preferencesLoaded, visibility, widths]);

  const onWidthChange = useCallback((columnId: CatalogColumnId, width: number) => {
    const column = COLUMNS.find((candidate) => candidate.id === columnId);
    setWidths((current) => ({ ...current, [columnId]: Math.max(column?.minWidth ?? 100, Math.min(800, width)) }));
  }, []);

  const toggleColumn = useCallback((columnId: CatalogColumnId, visible: boolean) => {
    if (columnId === "producto") return;
    setVisibility((current) => ({ ...current, [columnId]: visible }));
  }, []);

  const resetColumns = useCallback(() => {
    setVisibility(DEFAULT_VISIBILITY);
    setWidths(DEFAULT_WIDTHS);
  }, []);

  const exportProducts = useCallback(async () => {
    setExporting(true);
    try {
      const columns = COLUMNS.filter((column) =>
        visibility[column.id] && (inventoryAccess || !column.id.startsWith("stock_")),
      );
      const listNames = Array.from(new Set(filteredProducts.flatMap((item) => item.preciosLista.map((price) => price.nombre))));
      const headers = columns.flatMap((column) => column.id === "precios_lista" ? listNames : [column.label]);
      const selectedWarehouse = inventory.almacenes.find((warehouse) => warehouse.id === selectedWarehouseId);
      const rows: unknown[][] = [
        ["Catálogo de precios · Productos y servicios"],
        ["Almacén", selectedWarehouse?.nombre ?? "No aplica"],
        ["Filtro de tipo", productType === "all" ? "Todos" : productType],
        ["Búsqueda", search.trim() || "Sin filtro"],
        [],
        headers,
        ...filteredProducts.map((item) => {
          const stock = stockByItemId.get(item.id);
          return columns.flatMap((column) => {
            if (column.id === "producto") return [item.codigo ? `${item.nombre} · ${item.codigo}` : item.nombre];
            if (column.id === "descripcion_corta") return [item.descripcionCorta ?? "—"];
            if (column.id === "descripcion_larga") return [item.descripcionLarga ?? "—"];
            if (column.id === "tipo") return [item.tipo];
            if (column.id === "clasificacion") return [[item.lineaNombre, item.familiaNombre, item.modeloNombre].filter(Boolean).join(" · ") || "—"];
            if (column.id === "unidad") return [item.unidad];
            if (column.id === "precio_base") return [formatMoney(item.precioBase, item.moneda)];
            if (column.id === "precios_lista") return listNames.map((name) => {
              const price = item.preciosLista.find((entry) => entry.nombre === name);
              return price ? formatMoney(price.precio, price.moneda) : "—";
            });
            if (!item.manejaInventario || !selectedWarehouseId) return ["—"];
            const quantity = column.id === "stock_actual"
              ? stock?.stock_actual
              : column.id === "stock_reservado"
                ? stock?.stock_reservado
                : stock?.stock_disponible;
            return [formatQuantity(quantity ?? 0)];
          });
        }),
      ];
      const exportColumnWidths = columns.flatMap((column) => column.id === "precios_lista"
        ? listNames.map(() => 24)
        : [Math.max(14, Math.min(36, Math.round(widths[column.id] / 8)))],
      );
      await downloadCatalogWorkbook(`catalogo_productos_${new Date().toISOString().slice(0, 10)}.xlsx`, "Productos", rows, exportColumnWidths);
      toast.success("Archivo de productos exportado.");
    } catch {
      toast.error("No se pudo generar el archivo de Excel.");
    } finally {
      setExporting(false);
    }
  }, [filteredProducts, inventory.almacenes, inventoryAccess, productType, search, selectedWarehouseId, stockByItemId, visibility, widths]);

  const printProducts = useCallback(() => {
    if (!printBrand) {
      toast.error("No se pudo cargar el formato de cotización de esta empresa.");
      return;
    }
    const columns = COLUMNS.filter((column) =>
      visibility[column.id] && (inventoryAccess || !column.id.startsWith("stock_")),
    );
    const listNames = Array.from(new Set(filteredProducts.flatMap((item) => item.preciosLista.map((price) => price.nombre))));
    const headers = columns.flatMap((column) => column.id === "precios_lista" ? listNames : [column.label]);
    const selectedWarehouse = inventory.almacenes.find((warehouse) => warehouse.id === selectedWarehouseId);
    const rows = filteredProducts.map((item) => {
      const stock = stockByItemId.get(item.id);
      return columns.flatMap((column) => {
        if (column.id === "producto") return [item.codigo ? `${item.nombre} · ${item.codigo}` : item.nombre];
        if (column.id === "descripcion_corta") return [item.descripcionCorta ?? "—"];
        if (column.id === "descripcion_larga") return [item.descripcionLarga ?? "—"];
        if (column.id === "tipo") return [item.tipo];
        if (column.id === "clasificacion") return [[item.lineaNombre, item.familiaNombre, item.modeloNombre].filter(Boolean).join(" · ") || "—"];
        if (column.id === "unidad") return [item.unidad];
        if (column.id === "precio_base") return [formatMoney(item.precioBase, item.moneda)];
        if (column.id === "precios_lista") return listNames.map((name) => {
          const price = item.preciosLista.find((entry) => entry.nombre === name);
          return price ? formatMoney(price.precio, price.moneda) : "—";
        });
        if (!item.manejaInventario || !selectedWarehouseId) return ["—"];
        const quantity = column.id === "stock_actual"
          ? stock?.stock_actual
          : column.id === "stock_reservado"
            ? stock?.stock_reservado
            : stock?.stock_disponible;
        return [formatQuantity(quantity ?? 0)];
      });
    });
    const details = [
      `Fecha: ${new Intl.DateTimeFormat("es-MX").format(new Date())}`,
      `Almacén: ${selectedWarehouse?.nombre ?? "No aplica"}`,
      `Tipo: ${productType === "all" ? "Todos" : productType}`,
      `Búsqueda: ${search.trim() || "Sin filtro"}`,
    ];
    if (!openCatalogPrintWindow({ brand: printBrand, title: "Catálogo · Productos y servicios", details, headers, rows })) {
      toast.error("Permite las ventanas emergentes para abrir la impresión.");
    }
  }, [filteredProducts, inventory.almacenes, inventoryAccess, printBrand, productType, search, selectedWarehouseId, stockByItemId, visibility]);

  const exportProperties = useCallback(async () => {
    setExporting(true);
    try {
      const selectedProperties = filteredProperties.map((item) => ({
        item,
        total: item.precioTipo.toLowerCase() === "m2" && item.precioM2 !== null && item.areaM2 !== null
          ? item.precioM2 * item.areaM2
          : item.precio,
      }));
      const rows: unknown[][] = [
        ["Catálogo de precios · Propiedades"],
        ["Búsqueda", search.trim() || "Sin filtro"],
        [],
        ["Propiedad / unidad", "Desarrollo", "Nivel", "Manzana", "Estado", "Precio total", "Precio por m²", "Área (m²)"],
        ...selectedProperties.map(({ item, total }) => [
          item.unidad && item.unidad !== item.nombre ? `${item.nombre} · ${item.unidad}` : item.nombre,
          item.desarrollo,
          item.capa ?? "—",
          item.manzana ?? "—",
          item.status ?? "—",
          formatMoney(total),
          item.precioM2 === null ? "—" : formatMoney(item.precioM2),
          item.areaM2 === null ? "—" : item.areaM2,
        ]),
      ];
      await downloadCatalogWorkbook(`catalogo_propiedades_${new Date().toISOString().slice(0, 10)}.xlsx`, "Propiedades", rows, [32, 28, 18, 18, 18, 20, 20, 14]);
      toast.success("Archivo de propiedades exportado.");
    } catch {
      toast.error("No se pudo generar el archivo de Excel.");
    } finally {
      setExporting(false);
    }
  }, [filteredProperties, search]);

  const printProperties = useCallback(() => {
    if (!printBrand) {
      toast.error("No se pudo cargar el formato de cotización de esta empresa.");
      return;
    }
    const headers = ["Propiedad / unidad", "Desarrollo", "Nivel", "Manzana", "Estado", "Precio total", "Precio por m²", "Área (m²)"];
    const rows = filteredProperties.map((item) => {
      const total = item.precioTipo.toLowerCase() === "m2" && item.precioM2 !== null && item.areaM2 !== null
        ? item.precioM2 * item.areaM2
        : item.precio;
      return [
        item.unidad && item.unidad !== item.nombre ? `${item.nombre} · ${item.unidad}` : item.nombre,
        item.desarrollo,
        item.capa ?? "—",
        item.manzana ?? "—",
        item.status ?? "—",
        formatMoney(total),
        item.precioM2 === null ? "—" : formatMoney(item.precioM2),
        item.areaM2 === null ? "—" : `${item.areaM2.toLocaleString("es-MX")} m²`,
      ];
    });
    const details = [
      `Fecha: ${new Intl.DateTimeFormat("es-MX").format(new Date())}`,
      `Búsqueda: ${search.trim() || "Sin filtro"}`,
    ];
    if (!openCatalogPrintWindow({ brand: printBrand, title: "Catálogo · Propiedades", details, headers, rows })) {
      toast.error("Permite las ventanas emergentes para abrir la impresión.");
    }
  }, [filteredProperties, printBrand, search]);

  return (
    <div className="space-y-6 px-4 py-6 lg:px-6">
      <header className="space-y-2">
        <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">Consulta comercial</p>
        <h1 className="text-2xl font-semibold">Catálogo de precios</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">Consulta precios de productos, servicios y propiedades, además de existencias por almacén cuando tu rol tiene acceso. Esta vista es de solo lectura.</p>
        {!printBrand ? <p role="status" className="text-sm text-destructive">No se pudo cargar el formato de cotización; la impresión está deshabilitada.</p> : null}
      </header>

      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <div className="relative min-w-0 flex-1">
          <IconSearch className="absolute left-3 top-1/2 size-4 text-muted-foreground" />
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nombre, código o ubicación" className="pl-9" />
        </div>
        <Select value={productType} onValueChange={setProductType}>
          <SelectTrigger className="w-full md:w-48"><SelectValue placeholder="Tipo de producto" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los productos</SelectItem>
            <SelectItem value="producto">Productos</SelectItem>
            <SelectItem value="servicio">Servicios</SelectItem>
            <SelectItem value="paquete">Paquetes</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Tabs defaultValue="productos" className="space-y-4">
        <TabsList>
          <TabsTrigger value="productos"><IconPackage className="mr-2 size-4" />Productos y servicios ({filteredProducts.length})</TabsTrigger>
          <TabsTrigger value="propiedades"><IconBuilding className="mr-2 size-4" />Propiedades ({filteredProperties.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="productos">
          {filteredProducts.length ? (
            <ProductTable
              items={filteredProducts}
              inventoryAccess={inventoryAccess}
              inventoryLoading={inventoryLoading}
              inventoryError={inventoryError}
              warehouses={inventory.almacenes}
              selectedWarehouseId={selectedWarehouseId}
              onWarehouseChange={setSelectedWarehouseId}
              stockByItemId={stockByItemId}
              visibility={visibility}
              widths={widths}
              onVisibilityChange={toggleColumn}
              onWidthChange={onWidthChange}
              onReset={resetColumns}
              savingPreferences={savingPreferences}
              preferencesError={preferencesError}
              onExport={() => { void exportProducts(); }}
              onPrint={printProducts}
              printDisabled={!printBrand}
              exportDisabled={exporting || inventoryLoading || (inventoryAccess && Boolean(inventoryError))}
            />
          ) : <EmptyState text="No hay productos que coincidan con la búsqueda." />}
        </TabsContent>
        <TabsContent value="propiedades">
          {filteredProperties.length ? <PropertyTable items={filteredProperties} onExport={() => { void exportProperties(); }} onPrint={printProperties} printDisabled={!printBrand} exportDisabled={exporting} /> : <EmptyState text="No hay propiedades que coincidan con la búsqueda." />}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="rounded-lg border border-dashed px-4 py-12 text-center text-sm text-muted-foreground">{text}</div>;
}
