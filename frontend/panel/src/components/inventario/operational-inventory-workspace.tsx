"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { IconAlertTriangle, IconBox, IconDownload, IconPrinter, IconRefresh, IconSearch } from "@tabler/icons-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePermissions } from "@/hooks/use-permissions";

type Warehouse = { id: string; codigo: string; nombre: string; tipo: string; es_principal: boolean };
type Product = { id: string; nombre: string; codigo: string | null; unidad: string | null; maneja_inventario?: boolean };
type StockRow = {
  id: string | null;
  catalog_item_id: string;
  almacen_id: string;
  stock_actual: number;
  stock_reservado: number;
  stock_disponible: number;
  stock_en_transito: number;
  stock_minimo: number | null;
  stock_objetivo: number | null;
  producto: Product | null;
  almacen: Warehouse | null;
};
type InventoryResponse = {
  almacenes: Warehouse[];
  productos: Product[];
  almacen_seleccionado_id: string | null;
  existencias: StockRow[];
};
type AdjustmentResponse = { stock_actual: number; stock_reservado: number; stock_disponible: number };

function quantity(value: number) {
  return new Intl.NumberFormat("es-MX", { maximumFractionDigits: 3 }).format(value);
}

function isLowStock(row: StockRow) {
  return row.stock_minimo !== null && row.stock_disponible <= row.stock_minimo;
}

function escapeHtml(value: unknown) {
  const escaped: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  return String(value ?? "—").replace(/[&<>"']/g, (character) => escaped[character] ?? character);
}

async function downloadInventoryWorkbook(rows: StockRow[], warehouseLabel: string) {
  const xlsx = await import("@e965/xlsx");
  const values = [
    ["Producto", "Código", "Almacén", "Unidad", "Stock actual", "Reservado", "Disponible", "En tránsito", "Mínimo"],
    ...rows.map((row) => [
      row.producto?.nombre ?? "Producto sin nombre",
      row.producto?.codigo ?? "",
      row.almacen?.nombre ?? "Almacén",
      row.producto?.unidad ?? "",
      row.stock_actual,
      row.stock_reservado,
      row.stock_disponible,
      row.stock_en_transito,
      row.stock_minimo ?? "",
    ]),
  ];
  const sheet = xlsx.utils.aoa_to_sheet(values);
  sheet["!cols"] = [28, 18, 24, 12, 14, 14, 14, 14, 12].map((wch) => ({ wch }));
  const workbook = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(workbook, sheet, "Inventario");
  const buffer = xlsx.write(workbook, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
  const url = URL.createObjectURL(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "inventario_" + warehouseLabel.toLocaleLowerCase("es-MX").replace(/[^a-z0-9]+/gi, "_") + ".xlsx";
  anchor.click();
  URL.revokeObjectURL(url);
}

function printInventory(rows: StockRow[], warehouseLabel: string) {
  const printWindow = window.open("", "_blank");
  if (!printWindow) return;
  const tableRows = rows.map((row) =>
    "<tr><td>" + escapeHtml(row.producto?.nombre ?? "Producto sin nombre")
    + "<small>" + escapeHtml(row.producto?.codigo ?? "") + "</small></td>"
    + "<td>" + escapeHtml(row.almacen?.nombre ?? "Almacén") + "</td>"
    + '<td class="number">' + escapeHtml(row.stock_actual) + "</td>"
    + '<td class="number">' + escapeHtml(row.stock_reservado) + "</td>"
    + '<td class="number">' + escapeHtml(row.stock_disponible) + "</td>"
    + '<td class="number">' + escapeHtml(row.stock_en_transito) + "</td>"
    + "<td>" + (isLowStock(row) ? "Bajo mínimo" : "Disponible") + "</td></tr>",
  ).join("");
  printWindow.document.open();
  printWindow.document.write(
    '<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Inventario · '
    + escapeHtml(warehouseLabel)
    + "</title><style>@page{size:A4 landscape;margin:12mm}*{box-sizing:border-box}body{font:11px Arial,sans-serif;color:#172033;margin:0}h1{font-size:20px;margin:0 0 4px}p{color:#64748b;margin:0 0 18px}table{border-collapse:collapse;width:100%}th{background:#0f172a;color:white;text-align:left}th,td{border:1px solid #cbd5e1;padding:7px}small{color:#64748b;display:block;margin-top:2px}.number{text-align:right}</style></head><body><h1>Inventario</h1><p>"
    + escapeHtml(warehouseLabel)
    + " · " + rows.length + " línea(s)</p><table><thead><tr><th>Producto</th><th>Almacén</th><th>Actual</th><th>Reservado</th><th>Disponible</th><th>En tránsito</th><th>Estado</th></tr></thead><tbody>"
    + tableRows
    + "</tbody></table><script>window.onload=function(){window.print()}<\/script></body></html>",
  );
  printWindow.document.close();
}

export function OperationalInventoryWorkspace() {
  const [data, setData] = useState<InventoryResponse>({
    almacenes: [],
    productos: [],
    almacen_seleccionado_id: null,
    existencias: [],
  });
  const [warehouseId, setWarehouseId] = useState("todos");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adjustmentWarehouseId, setAdjustmentWarehouseId] = useState("");
  const [adjustmentProductId, setAdjustmentProductId] = useState("");
  const [adjustmentDirection, setAdjustmentDirection] = useState<"entrada" | "salida">("entrada");
  const [adjustmentQuantity, setAdjustmentQuantity] = useState("");
  const [adjustmentReason, setAdjustmentReason] = useState("");
  const [adjusting, setAdjusting] = useState(false);
  const [adjustmentMessage, setAdjustmentMessage] = useState<string | null>(null);
  const { context: permissionContext } = usePermissions();
  const canAdjust = permissionContext.es_admin
    || permissionContext.es_owner
    || permissionContext.permisos.some((permission) => permission.toLowerCase() === "inventory.stock.adjust");

  const load = useCallback(async (selectedWarehouseId = warehouseId) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: "1000" });
      if (selectedWarehouseId !== "todos") params.set("almacen_id", selectedWarehouseId);
      const response = await fetch(`/api/operacion/inventario?${params.toString()}`, { cache: "no-store" });
      const payload = await response.json().catch(() => null) as InventoryResponse | { detail?: string } | null;
      if (!response.ok) {
        throw new Error(
          payload && "detail" in payload
            ? payload.detail ?? "No se pudo consultar el inventario."
            : "No se pudo consultar el inventario.",
        );
      }
      setData(payload as InventoryResponse);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo consultar el inventario.");
    } finally {
      setLoading(false);
    }
  }, [warehouseId]);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredRows = useMemo(() => {
    const normalized = search.trim().toLocaleLowerCase("es-MX");
    if (!normalized) return data.existencias;
    return data.existencias.filter((row) => {
      const product = `${row.producto?.nombre ?? ""} ${row.producto?.codigo ?? ""}`.toLocaleLowerCase("es-MX");
      const warehouse = `${row.almacen?.nombre ?? ""} ${row.almacen?.codigo ?? ""}`.toLocaleLowerCase("es-MX");
      return product.includes(normalized) || warehouse.includes(normalized);
    });
  }, [data.existencias, search]);

  const metrics = useMemo(() => ({
    products: filteredRows.length,
    low: filteredRows.filter(isLowStock).length,
    reserved: filteredRows.reduce((sum, row) => sum + row.stock_reservado, 0),
    transit: filteredRows.reduce((sum, row) => sum + row.stock_en_transito, 0),
  }), [filteredRows]);

  const selectedAdjustmentStock = useMemo(
    () => data.existencias.find(
      (row) => row.almacen_id === adjustmentWarehouseId && row.catalog_item_id === adjustmentProductId,
    ) ?? null,
    [adjustmentProductId, adjustmentWarehouseId, data.existencias],
  );
  const selectedWarehouseLabel = warehouseId === "todos"
    ? "Todos los almacenes"
    : data.almacenes.find((warehouse) => warehouse.id === warehouseId)?.nombre ?? "Almacén";

  async function submitAdjustment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAdjusting(true);
    setAdjustmentMessage(null);
    try {
      const response = await fetch("/api/operacion/inventario", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          almacen_id: adjustmentWarehouseId,
          catalog_item_id: adjustmentProductId,
          sentido: adjustmentDirection,
          cantidad: Number(adjustmentQuantity),
          motivo: adjustmentReason.trim() || null,
        }),
      });
      const payload = await response.json().catch(() => null) as (AdjustmentResponse & { detail?: string }) | null;
      if (!response.ok) throw new Error(payload?.detail ?? "No se pudo aplicar el ajuste.");
      const directionLabel = adjustmentDirection === "entrada" ? "Entrada" : "Salida";
      const productName = data.productos.find((product) => product.id === adjustmentProductId)?.nombre ?? "Producto";
      setAdjustmentMessage(
        directionLabel
        + " de " + quantity(Number(adjustmentQuantity))
        + " ajustada para " + productName
        + ". Stock actual: " + quantity(payload?.stock_actual ?? 0)
        + "; disponible: " + quantity(payload?.stock_disponible ?? 0) + ".",
      );
      setAdjustmentQuantity("");
      setAdjustmentReason("");
      await load(warehouseId);
    } catch (cause) {
      setAdjustmentMessage(cause instanceof Error ? cause.message : "No se pudo aplicar el ajuste.");
    } finally {
      setAdjusting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Consulta operativa por almacén</p>
          <h1 className="text-2xl font-semibold tracking-tight">Existencias</h1>
        </div>
        <Button variant="outline" onClick={() => void load()} disabled={loading}>
          <IconRefresh className="mr-2 size-4" />Actualizar
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard icon={<IconBox className="size-4" />} label="Productos" value={String(metrics.products)} />
        <MetricCard icon={<IconAlertTriangle className="size-4" />} label="Existencia baja" value={String(metrics.low)} warning={metrics.low > 0} />
        <MetricCard icon={<IconBox className="size-4" />} label="Unidades reservadas" value={quantity(metrics.reserved)} />
        <MetricCard icon={<IconBox className="size-4" />} label="En tránsito" value={quantity(metrics.transit)} />
      </div>

      <Tabs defaultValue="existencias" className="space-y-4">
        <TabsList>
          <TabsTrigger value="existencias">Existencias</TabsTrigger>
          {canAdjust ? <TabsTrigger value="ajustes">Ajustes</TabsTrigger> : null}
        </TabsList>

        <TabsContent value="existencias">
        <Card>
        <CardHeader className="gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="mr-2 text-base">Inventario por almacén</CardTitle>
            <Button type="button" variant="outline" size="sm" onClick={() => printInventory(filteredRows, selectedWarehouseLabel)} disabled={loading || filteredRows.length === 0}>
              <IconPrinter className="mr-2 size-4" />Imprimir
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => void downloadInventoryWorkbook(filteredRows, selectedWarehouseLabel)} disabled={loading || filteredRows.length === 0}>
              <IconDownload className="mr-2 size-4" />Excel
            </Button>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative">
              <IconSearch className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar producto o almacén" className="pl-9 sm:w-64" />
            </div>
            <Select value={warehouseId} onValueChange={(value) => { setWarehouseId(value); void load(value); }}>
              <SelectTrigger className="sm:w-56"><SelectValue placeholder="Todos los almacenes" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos los almacenes</SelectItem>
                {data.almacenes.map((warehouse) => (
                  <SelectItem key={warehouse.id} value={warehouse.id}>
                    {warehouse.codigo ? `${warehouse.codigo} · ` : ""}{warehouse.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {error ? <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">{error}</div> : null}
          {!error && loading ? <p className="py-8 text-center text-sm text-muted-foreground">Cargando existencias…</p> : null}
          {!error && !loading && filteredRows.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">No hay existencias para los filtros seleccionados.</p> : null}
          {!error && !loading && filteredRows.length > 0 ? (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Producto</TableHead>
                    <TableHead>Almacén</TableHead>
                    <TableHead className="text-right">Actual</TableHead>
                    <TableHead className="text-right">Reservado</TableHead>
                    <TableHead className="text-right">Disponible</TableHead>
                    <TableHead className="text-right">En tránsito</TableHead>
                    <TableHead>Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRows.map((row) => (
                    <TableRow key={`${row.almacen_id}-${row.catalog_item_id}`}>
                      <TableCell>
                        <div className="font-medium">{row.producto?.nombre ?? "Producto sin nombre"}</div>
                        <div className="text-xs text-muted-foreground">{row.producto?.codigo ?? "Sin código"}</div>
                      </TableCell>
                      <TableCell>{row.almacen?.nombre ?? "Almacén"}</TableCell>
                      <TableCell className="text-right">{quantity(row.stock_actual)} {row.producto?.unidad ?? ""}</TableCell>
                      <TableCell className="text-right">{quantity(row.stock_reservado)}</TableCell>
                      <TableCell className="text-right font-medium">{quantity(row.stock_disponible)}</TableCell>
                      <TableCell className="text-right">{quantity(row.stock_en_transito)}</TableCell>
                      <TableCell>
                        {isLowStock(row) ? <Badge variant="destructive">Bajo mínimo</Badge> : <Badge variant="secondary">Disponible</Badge>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : null}
        </CardContent>
        </Card>
        </TabsContent>

      {canAdjust ? (
        <TabsContent value="ajustes">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Ajustar existencias</CardTitle>
            <p className="text-sm text-muted-foreground">Registra una entrada o salida por conteo físico, merma o corrección. Cada ajuste queda auditado.</p>
          </CardHeader>
          <CardContent>
            <form className="grid gap-4 md:grid-cols-5" onSubmit={submitAdjustment}>
              <Select value={adjustmentWarehouseId} onValueChange={setAdjustmentWarehouseId}>
                <SelectTrigger><SelectValue placeholder="Almacén" /></SelectTrigger>
                <SelectContent>
                  {data.almacenes.map((warehouse) => <SelectItem key={warehouse.id} value={warehouse.id}>{warehouse.codigo ? `${warehouse.codigo} · ` : ""}{warehouse.nombre}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={adjustmentProductId} onValueChange={setAdjustmentProductId}>
                <SelectTrigger><SelectValue placeholder="Producto" /></SelectTrigger>
                <SelectContent>
                  {data.productos.map((product) => <SelectItem key={product.id} value={product.id}>{product.nombre}{product.codigo ? ` · ${product.codigo}` : ""}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={adjustmentDirection} onValueChange={(value) => setAdjustmentDirection(value as "entrada" | "salida")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="entrada">Entrada</SelectItem><SelectItem value="salida">Salida</SelectItem></SelectContent>
              </Select>
              <Input type="number" min="0.001" step="0.001" value={adjustmentQuantity} onChange={(event) => setAdjustmentQuantity(event.target.value)} placeholder="Cantidad" required />
              <Button type="submit" disabled={adjusting || !adjustmentWarehouseId || !adjustmentProductId || Number(adjustmentQuantity) <= 0}>{adjusting ? "Aplicando…" : "Aplicar ajuste"}</Button>
              <Input className="md:col-span-4" value={adjustmentReason} onChange={(event) => setAdjustmentReason(event.target.value)} placeholder="Motivo del ajuste (recomendado)" />
            </form>
            {adjustmentWarehouseId && adjustmentProductId ? (
              <div className="mt-4 grid gap-3 rounded-md border bg-muted/20 p-3 text-sm sm:grid-cols-3">
                <div><p className="text-xs text-muted-foreground">Stock actual</p><p className="font-semibold">{quantity(selectedAdjustmentStock?.stock_actual ?? 0)}</p></div>
                <div><p className="text-xs text-muted-foreground">Reservado</p><p className="font-semibold">{quantity(selectedAdjustmentStock?.stock_reservado ?? 0)}</p></div>
                <div><p className="text-xs text-muted-foreground">Disponible</p><p className="font-semibold">{quantity(selectedAdjustmentStock?.stock_disponible ?? 0)}</p></div>
              </div>
            ) : null}
            {adjustmentMessage ? <p className="mt-3 text-sm text-muted-foreground" role="status">{adjustmentMessage}</p> : null}
          </CardContent>
        </Card>
        </TabsContent>
      ) : null}
      </Tabs>
    </div>
  );
}

function MetricCard({ icon, label, value, warning = false }: { icon: ReactNode; label: string; value: string; warning?: boolean }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className={warning ? "rounded-md bg-destructive/10 p-2 text-destructive" : "rounded-md bg-muted p-2 text-muted-foreground"}>{icon}</div>
        <div><p className="text-xs text-muted-foreground">{label}</p><p className="text-xl font-semibold">{value}</p></div>
      </CardContent>
    </Card>
  );
}
