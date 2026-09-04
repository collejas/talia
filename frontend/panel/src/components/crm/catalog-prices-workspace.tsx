"use client";

import { useMemo, useState } from "react";
import { IconBuilding, IconPackage, IconSearch } from "@tabler/icons-react";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export type CatalogPriceProduct = {
  id: string;
  nombre: string;
  codigo: string | null;
  tipo: string;
  unidad: string;
  precioBase: number | null;
  moneda: string;
  activo: boolean;
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

function formatMoney(value: number | null, currency = "MXN") {
  if (value === null || !Number.isFinite(value)) return "Sin precio";
  return new Intl.NumberFormat("es-MX", { style: "currency", currency, maximumFractionDigits: 2 }).format(value);
}

function normalize(value: string | null | undefined) {
  return (value ?? "").trim().toLocaleLowerCase("es-MX");
}

function ProductTable({ items }: { items: CatalogPriceProduct[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table className="min-w-[900px]">
        <TableHeader><TableRow>
          <TableHead>Producto / servicio</TableHead><TableHead>Tipo</TableHead><TableHead>Clasificación</TableHead>
          <TableHead>Unidad</TableHead><TableHead className="text-right">Precio base</TableHead><TableHead>Precios por lista</TableHead>
        </TableRow></TableHeader>
        <TableBody>{items.map((item) => {
          const hierarchy = [item.lineaNombre, item.familiaNombre, item.modeloNombre].filter(Boolean).join(" · ");
          return <TableRow key={item.id}>
            <TableCell className="font-medium"><div>{item.nombre}</div>{item.codigo ? <div className="text-xs text-muted-foreground">{item.codigo}</div> : null}</TableCell>
            <TableCell><Badge variant="outline">{item.tipo}</Badge></TableCell>
            <TableCell className="max-w-[260px] truncate text-muted-foreground">{hierarchy || "—"}</TableCell>
            <TableCell>{item.unidad}</TableCell>
            <TableCell className="text-right font-medium">{formatMoney(item.precioBase, item.moneda)}</TableCell>
            <TableCell><div className="min-w-[190px] space-y-1">{item.preciosLista.length ? item.preciosLista.map((price) => <div className="flex justify-between gap-3" key={`${item.id}-${price.nombre}`}><span className="truncate text-muted-foreground">{price.nombre}</span><span>{formatMoney(price.precio, price.moneda)}</span></div>) : <span className="text-muted-foreground">—</span>}</div></TableCell>
          </TableRow>;
        })}</TableBody>
      </Table>
    </div>
  );
}

function PropertyTable({ items }: { items: CatalogPriceProperty[] }) {
  return (
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
  );
}

export function CatalogPricesWorkspace({
  products,
  properties,
}: {
  products: CatalogPriceProduct[];
  properties: CatalogPriceProperty[];
}) {
  const [search, setSearch] = useState("");
  const [productType, setProductType] = useState("all");
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

  return (
    <div className="space-y-6 px-4 py-6 lg:px-6">
      <header className="space-y-2">
        <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">Consulta comercial</p>
        <h1 className="text-2xl font-semibold">Catálogo de precios</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">Consulta rápidamente precios de productos, servicios y propiedades inmobiliarias. Esta vista es de sólo lectura.</p>
      </header>

      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <div className="relative min-w-0 flex-1">
          <IconSearch className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
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
          {filteredProducts.length ? <ProductTable items={filteredProducts} /> : <EmptyState text="No hay productos que coincidan con la búsqueda." />}
        </TabsContent>
        <TabsContent value="propiedades">
          {filteredProperties.length ? <PropertyTable items={filteredProperties} /> : <EmptyState text="No hay propiedades que coincidan con la búsqueda." />}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="rounded-lg border border-dashed px-4 py-12 text-center text-sm text-muted-foreground">{text}</div>;
}
