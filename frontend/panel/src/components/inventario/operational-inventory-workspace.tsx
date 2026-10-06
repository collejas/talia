"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { IconAlertTriangle, IconBox, IconRefresh, IconSearch } from "@tabler/icons-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Warehouse = { id: string; codigo: string; nombre: string; tipo: string; es_principal: boolean };
type Product = { id: string; nombre: string; codigo: string | null; unidad: string | null };
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
  almacen_seleccionado_id: string | null;
  existencias: StockRow[];
};

function quantity(value: number) {
  return new Intl.NumberFormat("es-MX", { maximumFractionDigits: 3 }).format(value);
}

function isLowStock(row: StockRow) {
  return row.stock_minimo !== null && row.stock_disponible <= row.stock_minimo;
}

export function OperationalInventoryWorkspace() {
  const [data, setData] = useState<InventoryResponse>({
    almacenes: [],
    almacen_seleccionado_id: null,
    existencias: [],
  });
  const [warehouseId, setWarehouseId] = useState("todos");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

      <Card>
        <CardHeader className="gap-4 md:flex-row md:items-center md:justify-between">
          <CardTitle className="text-base">Inventario por almacén</CardTitle>
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
