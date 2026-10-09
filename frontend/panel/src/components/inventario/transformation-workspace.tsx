"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { IconArrowsExchange, IconRefresh } from "@tabler/icons-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { usePermissions } from "@/hooks/use-permissions";

type Product = { id: string; nombre: string; codigo: string | null; unidad: string | null };
type Warehouse = { id: string; codigo: string; nombre: string; tipo: string };
type Formula = {
  id: string;
  codigo: string;
  nombre: string;
  version: number;
  estado: string;
  unidad_produccion: string;
  cantidad_produccion: number;
  componentes: Array<{ catalog_item_id: string; cantidad_requerida: number; unidad: string; catalog_item?: Product }>;
  salidas: Array<{ catalog_item_id: string | null; cantidad_producida: number; unidad: string; es_merma: boolean; catalog_item?: Product }>;
};
type InventoryResponse = { productos: Product[]; almacenes: Warehouse[] };

function displayProduct(product: Product | undefined) {
  return product ? `${product.nombre}${product.codigo ? ` · ${product.codigo}` : ""}` : "Producto";
}

export function TransformationWorkspace() {
  const [products, setProducts] = useState<Product[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [formulas, setFormulas] = useState<Formula[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [inputProductId, setInputProductId] = useState("");
  const [outputProductId, setOutputProductId] = useState("");
  const [inputQuantity, setInputQuantity] = useState("1");
  const [outputQuantity, setOutputQuantity] = useState("1");
  const [selectedFormulaId, setSelectedFormulaId] = useState("");
  const [sourceWarehouseId, setSourceWarehouseId] = useState("");
  const [destinationWarehouseId, setDestinationWarehouseId] = useState("");
  const [lots, setLots] = useState("1");
  const { context } = usePermissions();
  const canManage = context.es_admin || context.es_owner || context.permisos.some((item) => item.toLowerCase() === "inventory.transformations.manage");
  const canExecute = context.es_admin || context.es_owner || context.permisos.some((item) => item.toLowerCase() === "inventory.transformations.execute");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [inventoryResponse, formulaResponse] = await Promise.all([
        fetch("/api/operacion/inventario?limit=1000", { cache: "no-store" }),
        fetch("/api/operacion/transformaciones?limit=500", { cache: "no-store" }),
      ]);
      const inventoryPayload = await inventoryResponse.json().catch(() => null) as InventoryResponse & { detail?: string };
      const formulaPayload = await formulaResponse.json().catch(() => null) as Formula[] & { detail?: string };
      if (!inventoryResponse.ok) throw new Error(inventoryPayload?.detail ?? "No se pudo consultar el inventario.");
      if (!formulaResponse.ok) throw new Error(formulaPayload?.detail ?? "No se pudieron consultar las transformaciones.");
      setProducts(inventoryPayload.productos ?? []);
      setWarehouses(inventoryPayload.almacenes ?? []);
      setFormulas(Array.isArray(formulaPayload) ? formulaPayload : []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo cargar Transformaciones.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!inputProductId && products[0]) setInputProductId(products[0].id);
    if (!outputProductId && products[1]) setOutputProductId(products[1].id);
    if (!sourceWarehouseId && warehouses[0]) setSourceWarehouseId(warehouses[0].id);
    if (!destinationWarehouseId && warehouses[0]) setDestinationWarehouseId(warehouses[0].id);
  }, [products, warehouses, inputProductId, outputProductId, sourceWarehouseId, destinationWarehouseId]);

  const inputProduct = useMemo(() => products.find((item) => item.id === inputProductId), [products, inputProductId]);
  const outputProduct = useMemo(() => products.find((item) => item.id === outputProductId), [products, outputProductId]);

  async function createFormula() {
    setSaving(true); setMessage(null); setError(null);
    try {
      const response = await fetch("/api/operacion/transformaciones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          codigo: code.trim(), nombre: name.trim(), version: 1, unidad_produccion: outputProduct?.unidad ?? "unidad",
          cantidad_produccion: Number(outputQuantity), merma_esperada: 0,
          componentes: [{ catalog_item_id: inputProductId, cantidad_requerida: Number(inputQuantity), unidad: inputProduct?.unidad ?? "unidad" }],
          salidas: [{ catalog_item_id: outputProductId, cantidad_producida: Number(outputQuantity), unidad: outputProduct?.unidad ?? "unidad", porcentaje_costo: 100, es_merma: false }],
        }),
      });
      const payload = await response.json().catch(() => null) as Formula & { detail?: string };
      if (!response.ok || !payload?.id) throw new Error(payload?.detail ?? "No se pudo crear la fórmula.");
      const activationResponse = await fetch(`/api/operacion/transformaciones/${encodeURIComponent(payload.id)}/activar`, { method: "POST" });
      if (!activationResponse.ok) throw new Error("La fórmula se creó, pero no se pudo activar.");
      setMessage("Fórmula creada y activada.");
      setCode(""); setName(""); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo crear la fórmula."); }
    finally { setSaving(false); }
  }

  async function executeFormula() {
    setRunning(true); setMessage(null); setError(null);
    try {
      const orderResponse = await fetch("/api/operacion/transformaciones/ordenes", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transformacion_id: selectedFormulaId, almacen_origen_id: sourceWarehouseId, almacen_destino_id: destinationWarehouseId, cantidad_lotes: Number(lots) }),
      });
      const orderPayload = await orderResponse.json().catch(() => null) as { id?: string; detail?: string };
      if (!orderResponse.ok || !orderPayload?.id) throw new Error(orderPayload?.detail ?? "No se pudo crear la orden de transformación.");
      const executeResponse = await fetch(`/api/operacion/transformaciones/ordenes/${encodeURIComponent(orderPayload.id)}/ejecutar`, { method: "POST" });
      const executePayload = await executeResponse.json().catch(() => null) as { detail?: string };
      if (!executeResponse.ok) throw new Error(executePayload?.detail ?? "No se pudo ejecutar la transformación.");
      setMessage("Transformación ejecutada. Se actualizó el inventario de entrada y salida.");
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo ejecutar la transformación."); }
    finally { setRunning(false); }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div><p className="text-sm text-muted-foreground">Operación de inventario</p><h1 className="text-2xl font-semibold tracking-tight">Transformaciones</h1></div>
        <Button variant="outline" onClick={() => void load()} disabled={loading}><IconRefresh className="mr-2 size-4" />Actualizar</Button>
      </div>
      {error ? <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">{error}</div> : null}
      {message ? <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-4 text-sm text-emerald-700">{message}</div> : null}

      {canManage ? <Card><CardHeader><CardTitle className="text-base">Nueva fórmula</CardTitle><p className="text-sm text-muted-foreground">Define una entrada y una salida. La fórmula no modifica existencias.</p></CardHeader><CardContent className="grid gap-4 md:grid-cols-2">
        <div><Label htmlFor="formula-code">Código</Label><Input id="formula-code" value={code} onChange={(event) => setCode(event.target.value)} placeholder="TRANS-001" /></div>
        <div><Label htmlFor="formula-name">Nombre</Label><Input id="formula-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Ensamble producto A" /></div>
        <div><Label>Producto de entrada</Label><Select value={inputProductId} onValueChange={setInputProductId}><SelectTrigger><SelectValue placeholder="Selecciona P1" /></SelectTrigger><SelectContent>{products.map((product) => <SelectItem key={product.id} value={product.id}>{displayProduct(product)}</SelectItem>)}</SelectContent></Select></div>
        <div><Label>Cantidad de entrada</Label><Input type="number" min="0.001" step="0.001" value={inputQuantity} onChange={(event) => setInputQuantity(event.target.value)} /></div>
        <div><Label>Producto de salida</Label><Select value={outputProductId} onValueChange={setOutputProductId}><SelectTrigger><SelectValue placeholder="Selecciona producto transformado" /></SelectTrigger><SelectContent>{products.map((product) => <SelectItem key={product.id} value={product.id}>{displayProduct(product)}</SelectItem>)}</SelectContent></Select></div>
        <div><Label>Cantidad de salida</Label><Input type="number" min="0.001" step="0.001" value={outputQuantity} onChange={(event) => setOutputQuantity(event.target.value)} /></div>
        <div className="md:col-span-2"><Button onClick={() => void createFormula()} disabled={saving || !code.trim() || !name.trim() || !inputProductId || !outputProductId}>{saving ? "Guardando…" : "Crear fórmula"}</Button></div>
      </CardContent></Card> : null}

      {canExecute ? <Card><CardHeader><CardTitle className="text-base">Ejecutar transformación</CardTitle><p className="text-sm text-muted-foreground">Consume el producto de entrada y produce el resultado en una operación transaccional.</p></CardHeader><CardContent className="grid gap-4 md:grid-cols-2">
        <div className="md:col-span-2"><Label>Fórmula activa</Label><Select value={selectedFormulaId} onValueChange={setSelectedFormulaId}><SelectTrigger><SelectValue placeholder="Selecciona una fórmula activa" /></SelectTrigger><SelectContent>{formulas.filter((formula) => formula.estado === "activa" && formula.componentes.length && formula.salidas.length).map((formula) => <SelectItem key={formula.id} value={formula.id}>{formula.codigo} · {formula.nombre}</SelectItem>)}</SelectContent></Select></div>
        <div><Label>Almacén origen</Label><Select value={sourceWarehouseId} onValueChange={setSourceWarehouseId}><SelectTrigger><SelectValue placeholder="Almacén origen" /></SelectTrigger><SelectContent>{warehouses.map((warehouse) => <SelectItem key={warehouse.id} value={warehouse.id}>{warehouse.codigo} · {warehouse.nombre}</SelectItem>)}</SelectContent></Select></div>
        <div><Label>Almacén destino</Label><Select value={destinationWarehouseId} onValueChange={setDestinationWarehouseId}><SelectTrigger><SelectValue placeholder="Almacén destino" /></SelectTrigger><SelectContent>{warehouses.map((warehouse) => <SelectItem key={warehouse.id} value={warehouse.id}>{warehouse.codigo} · {warehouse.nombre}</SelectItem>)}</SelectContent></Select></div>
        <div><Label>Lotes de producción</Label><Input type="number" min="0.001" step="0.001" value={lots} onChange={(event) => setLots(event.target.value)} /></div>
        <div className="flex items-end"><Button onClick={() => void executeFormula()} disabled={running || !selectedFormulaId || !sourceWarehouseId || !destinationWarehouseId}><IconArrowsExchange className="mr-2 size-4" />{running ? "Ejecutando…" : "Ejecutar transformación"}</Button></div>
      </CardContent></Card> : null}

      <Card><CardHeader><CardTitle className="text-base">Fórmulas registradas</CardTitle></CardHeader><CardContent>{loading ? <p className="py-6 text-center text-sm text-muted-foreground">Cargando…</p> : formulas.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">Aún no hay fórmulas.</p> : <div className="overflow-x-auto rounded-md border"><Table><TableHeader><TableRow><TableHead>Código</TableHead><TableHead>Nombre</TableHead><TableHead>Versión</TableHead><TableHead>Entrada</TableHead><TableHead>Salida</TableHead><TableHead>Estado</TableHead></TableRow></TableHeader><TableBody>{formulas.map((formula) => <TableRow key={formula.id}><TableCell className="font-medium">{formula.codigo}</TableCell><TableCell>{formula.nombre}</TableCell><TableCell>{formula.version}</TableCell><TableCell>{formula.componentes.map((item) => `${item.cantidad_requerida} ${item.unidad}`).join(", ")}</TableCell><TableCell>{formula.salidas.map((item) => `${item.cantidad_producida} ${item.unidad}`).join(", ")}</TableCell><TableCell><Badge variant={formula.estado === "activa" ? "default" : "secondary"}>{formula.estado}</Badge></TableCell></TableRow>)}</TableBody></Table></div>}</CardContent></Card>
    </div>
  );
}
