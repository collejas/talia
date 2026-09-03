import { AppViewLayout } from "@/components/layouts/app-view-layout";
import { fetchCatalogItemPriceListsBatch, fetchCatalogItems, fetchCatalogPriceLists } from "@/app/settings/catalogo/actions";
import { callCrmApi } from "@/lib/api/crm";
import { CatalogPricesWorkspace, type CatalogPriceProduct, type CatalogPriceProperty } from "@/components/crm/catalog-prices-workspace";

export const dynamic = "force-dynamic";

type HierarchyNode = Record<string, unknown>;

function asRecord(value: unknown): HierarchyNode | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as HierarchyNode : null;
}

function asArray(value: unknown): HierarchyNode[] {
  return Array.isArray(value) ? value.map(asRecord).filter((item): item is HierarchyNode => item !== null) : [];
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function number(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function flattenProperties(features: unknown): CatalogPriceProperty[] {
  const rows: CatalogPriceProperty[] = [];
  const visitUnits = (units: HierarchyNode[], context: { desarrollo: string; capa: string | null; manzana: string | null }) => {
    for (const unit of units) {
      const precioTipo = text(unit.precio_tipo) ?? (unit.precio_m2 != null ? "m2" : "manual");
      rows.push({
        id: String(unit.id ?? `${rows.length}`),
        nombre: text(unit.nombre) ?? text(unit.unidad) ?? "Unidad inmobiliaria",
        unidad: text(unit.unidad),
        desarrollo: context.desarrollo,
        capa: context.capa,
        manzana: context.manzana,
        status: text(unit.status),
        precio: number(unit.precio),
        precioM2: number(unit.precio_m2),
        areaM2: number(unit.area_m2),
        precioTipo,
      });
    }
  };

  for (const desarrollo of asArray(features)) {
    const desarrolloNombre = text(desarrollo.nombre) ?? "Desarrollo sin nombre";
    for (const capa of asArray(desarrollo.capas)) {
      const capaNombre = text(capa.nombre) ?? (capa.nivel != null ? `Nivel ${String(capa.nivel)}` : null);
      visitUnits(asArray(capa.unidades), { desarrollo: desarrolloNombre, capa: capaNombre, manzana: null });
      for (const manzana of asArray(capa.manzanas)) {
        visitUnits(asArray(manzana.unidades), {
          desarrollo: desarrolloNombre,
          capa: capaNombre,
          manzana: text(manzana.nombre) ?? "Manzana",
        });
      }
    }
    visitUnits(asArray(desarrollo.unidades), { desarrollo: desarrolloNombre, capa: null, manzana: null });
  }
  return rows;
}

async function fetchPropertyHierarchy(): Promise<CatalogPriceProperty[]> {
  const response = await callCrmApi<{ features?: unknown }>("/crm/propiedades/hierarquia");
  return response.ok ? flattenProperties(response.data?.features) : [];
}

export default async function CrmCatalogoPreciosPage() {
  const [items, priceLists, properties] = await Promise.all([
    fetchCatalogItems({ includeInactive: false, limit: 5000 }),
    fetchCatalogPriceLists(),
    fetchPropertyHierarchy(),
  ]);
  const priceListValues = await fetchCatalogItemPriceListsBatch(items.map((item) => item.id));
  const products: CatalogPriceProduct[] = items.map((item) => ({
    id: item.id,
    nombre: item.nombre,
    codigo: item.codigo,
    tipo: item.tipo,
    unidad: item.unidad ?? "unidad",
    precioBase: item.precioBase,
    moneda: item.moneda,
    activo: item.activo,
    lineaNombre: item.lineaNombre,
    familiaNombre: item.familiaNombre,
    modeloNombre: item.modeloNombre,
    preciosLista: priceLists.flatMap((list) => {
      const value = priceListValues[item.id]?.[list.id];
      return value ? [{ nombre: list.nombre, precio: value.precio, moneda: value.moneda }] : [];
    }),
  }));

  return (
    <AppViewLayout title="CRM · Catálogo de precios">
      <CatalogPricesWorkspace products={products} properties={properties} />
    </AppViewLayout>
  );
}
