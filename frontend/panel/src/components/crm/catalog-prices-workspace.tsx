"use client";

import { useMemo, useState } from "react";
import { IconBuilding, IconPackage, IconSearch } from "@tabler/icons-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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

function ProductCard({ item }: { item: CatalogPriceProduct }) {
  const hierarchy = [item.lineaNombre, item.familiaNombre, item.modeloNombre].filter(Boolean).join(" · ");
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="truncate text-base">{item.nombre}</CardTitle>
            <CardDescription className="mt-1">{hierarchy || item.codigo || "Producto del catálogo"}</CardDescription>
          </div>
          <Badge variant="outline">{item.tipo}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Precio base</p>
            <p className="text-xl font-semibold">{formatMoney(item.precioBase, item.moneda)}</p>
          </div>
          <span className="text-sm text-muted-foreground">por {item.unidad}</span>
        </div>
        {item.preciosLista.length ? (
          <div className="border-t pt-3">
            <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">Precios por lista</p>
            <div className="grid gap-1.5 text-sm">
              {item.preciosLista.map((price) => (
                <div className="flex justify-between gap-3" key={`${item.id}-${price.nombre}`}>
                  <span className="truncate text-muted-foreground">{price.nombre}</span>
                  <span className="font-medium">{formatMoney(price.precio, price.moneda)}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function PropertyCard({ item }: { item: CatalogPriceProperty }) {
  const location = [item.desarrollo, item.capa, item.manzana].filter(Boolean).join(" · ");
  const total = item.precioTipo.toLowerCase() === "m2" && item.precioM2 !== null && item.areaM2 !== null
    ? item.precioM2 * item.areaM2
    : item.precio;
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="truncate text-base">{item.nombre}</CardTitle>
            <CardDescription className="mt-1 truncate">{location}</CardDescription>
          </div>
          {item.status ? <Badge variant="outline">{item.status}</Badge> : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Precio</p>
            <p className="text-xl font-semibold">{formatMoney(total)}</p>
          </div>
          {item.unidad ? <span className="text-muted-foreground">{item.unidad}</span> : null}
        </div>
        {item.precioTipo.toLowerCase() === "m2" && item.precioM2 !== null ? (
          <p className="text-muted-foreground">{formatMoney(item.precioM2)} por m²{item.areaM2 !== null ? ` · ${item.areaM2.toLocaleString("es-MX")} m²` : ""}</p>
        ) : null}
      </CardContent>
    </Card>
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
          {filteredProducts.length ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{filteredProducts.map((item) => <ProductCard item={item} key={item.id} />)}</div> : <EmptyState text="No hay productos que coincidan con la búsqueda." />}
        </TabsContent>
        <TabsContent value="propiedades">
          {filteredProperties.length ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{filteredProperties.map((item) => <PropertyCard item={item} key={item.id} />)}</div> : <EmptyState text="No hay propiedades que coincidan con la búsqueda." />}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="rounded-lg border border-dashed px-4 py-12 text-center text-sm text-muted-foreground">{text}</div>;
}
