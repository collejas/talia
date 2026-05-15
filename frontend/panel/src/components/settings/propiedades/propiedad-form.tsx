"use client";

import { ChangeEvent, ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import {
  IconBuilding,
  IconChevronDown,
  IconChevronRight,
  IconDownload,
  IconLayersSelected,
  IconMinus,
  IconPlus,
  IconMapPin,
  IconPencil,
  IconSquares,
} from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardTitle, CardHeader, CardDescription } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { PropiedadGeomEditor } from "@/components/settings/propiedades/propiedad-geom-editor";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";

type CatalogOption = {
  id: string;
  nombre: string;
};

type LocationOption = {
  value: string;
  label: string;
};

type PropiedadTipo = {
  id: string;
  nombre: string;
  descripcion: string | null;
  color: string;
};

type PropiedadFormProps = {
  lineas: CatalogOption[];
  familias: CatalogOption[];
  modelos: CatalogOption[];
  tipos: PropiedadTipo[];
};

type UnidadNode = {
  id: string;
  unidad: string;
  status: string | null;
  precio: number | null;
  area_m2: number | null;
  metadata: Record<string, unknown>;
  poligono_id?: string | null;
  geom: { type: string; coordinates: unknown };
  nombre?: string | null;
  tipo_id?: string | null;
  linea_id?: string | null;
  familia_id?: string | null;
  modelo_id?: string | null;
  descripcion?: string | null;
};

type CapaNode = {
  id: string;
  nombre: string | null;
  nivel: number | null;
  altura: number | null;
  status: string | null;
  metadata: Record<string, unknown>;
  poligono_id?: string | null;
  geom: { type: string; coordinates: unknown };
  unidades: UnidadNode[];
  descripcion?: string | null;
};

type DesarrolloNode = {
  id: string;
  nombre: string;
  tipo: string;
  status: string | null;
  descripcion?: string | null;
  pais_codigo: string | null;
  estado_cve: string | null;
  municipio_cve: string | null;
  codigo_postal: string | null;
  colonia: string | null;
  metadata: Record<string, unknown>;
  poligono_id?: string | null;
  geom: { type: string; coordinates: unknown };
  capas: CapaNode[];
  items?: MixItem[];
};

type MixItem = {
  id: string;
  modo: "horizontal" | "vertical";
  status: string | null;
  metadata: Record<string, unknown>;
  desarrollo_id: string;
};

type UnidadFormState = {
  unidad: string;
  nombre: string;
  tipoId: string;
  status: UnidadStatus;
  precio: string;
  area: string;
  lineaId: string;
  familiaId: string;
  modeloId: string;
  descripcion: string;
};

type GeometryTarget =
  | { type: "desarrollo"; id: string; label: string; poligonoId?: string | null }
  | { type: "capa"; id: string; label: string; desarrolloId: string; nivel: number | null; poligonoId?: string | null }
  | { type: "unidad"; id: string; label: string; desarrolloId: string; capaId: string; nivel: number | null; poligonoId?: string | null };

type GeoFeature = {
  id: string;
  geometry: { type: string; coordinates: unknown };
  properties?: Record<string, unknown>;
};

type GeoJsonGeometry = {
  type: string;
  coordinates: unknown;
};

type ImportStatus = "idle" | "submitting" | "success";

type Point3DZ = [number, number, number];
type Ring3DZ = Point3DZ[];
type Polygon3DZ = Ring3DZ[];
type MultiPolygon3DZ = Polygon3DZ[];

function ensureArray(value: unknown): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error("La geometría no tiene el formato esperado.");
  }
  return value;
}

function toNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  const parsed = Number(value);
  if (!Number.isNaN(parsed)) {
    return parsed;
  }
  throw new Error("Coordenada inválida en la geometría.");
}

function ensurePoint(coords: unknown): Point3DZ {
  const array = ensureArray(coords);
  if (array.length < 2) {
    throw new Error("Se requieren al menos X e Y en cada punto.");
  }
  const x = toNumber(array[0]);
  const y = toNumber(array[1]);
  const z = array.length >= 3 ? toNumber(array[2]) : 0;
  return [x, y, z];
}

function ensureRing(coords: unknown): Ring3DZ {
  const array = ensureArray(coords);
  if (!array.length) {
    throw new Error("Un anillo no puede estar vacío.");
  }
  return array.map(ensurePoint);
}

function ensurePolygon(coords: unknown): Polygon3DZ {
  const array = ensureArray(coords);
  if (!array.length) {
    throw new Error("El polígono debe tener al menos un anillo.");
  }
  return array.map(ensureRing);
}

function ensureMultiPolygon(geometry: GeoJsonGeometry): MultiPolygon3DZ {
  const type = geometry.type?.toLowerCase();
  if (type === "polygon") {
    return [ensurePolygon(geometry.coordinates)];
  }
  if (type === "multipolygon") {
    const array = ensureArray(geometry.coordinates);
    return array.map(ensurePolygon);
  }
  throw new Error("Solo se permite dibujar polígonos o multipolígonos.");
}

function formatMultiPolygonWkt(multiPolygon: MultiPolygon3DZ): string {
  const polygons = multiPolygon
    .map((polygon) => {
      const rings = polygon
        .map((ring) => {
          const coordinates = ring
            .map(([x, y, z]) => `${x} ${y} ${z}`)
            .join(", ");
          return `(${coordinates})`;
        })
        .join(", ");
      return `(${rings})`;
    })
    .join(", ");
  if (!polygons.length) {
    throw new Error("La geometría debe contener al menos un polígono.");
  }
  return `SRID=4326;MULTIPOLYGON Z (${polygons})`;
}

function geoJsonToMultiPolygonZWkt(geometry: GeoJsonGeometry): string {
  const normalized = ensureMultiPolygon(geometry);
  return formatMultiPolygonWkt(normalized);
}

function safeGeoJsonToMultiPolygonZWkt(geometry: GeoJsonGeometry | null | undefined): string {
  if (!geometry?.type || !geometry.coordinates) {
    return "";
  }
  try {
    return geoJsonToMultiPolygonZWkt(geometry);
  } catch {
    return "";
  }
}

const PROPERTY_IMPORT_TEMPLATE_HEADERS = [
  "entidad",
  "grupo",
  "nombre",
  "status",
  "nivel",
  "capa_nivel",
  "unidad",
  "tipo_desarrollo",
  "tipo_unidad_nombre",
  "descripcion",
  "poligono",
  "height",
  "min_height",
  "levels",
  "color",
  "precio",
  "area_m2",
  "pais_codigo",
  "estado_cve",
  "municipio_cve",
  "codigo_postal",
  "colonia",
  "metadata_cuartos",
  "metadata_patio_servicio",
  "metadata_cocina",
  "metadata_banos",
  "metadata_m2_construccion",
  "metadata_m2_terreno",
  "metadata_frente",
  "metadata_cisterna",
  "metadata_terraza",
  "metadata_roof_garden",
  "metadata_vestidor_recamara_principal",
] as const;

const PROPERTY_IMPORT_METADATA_COLUMNS = PROPERTY_IMPORT_TEMPLATE_HEADERS.filter((column) =>
  column.startsWith("metadata_"),
);

const PROPERTY_IMPORT_TEMPLATE_ROWS = [
  [
    "desarrollo",
    "Mirador",
    "Mirador Azul",
    "disponible",
    "",
    "",
    "",
    "horizontal",
    "",
    "Desarrollo base",
    "POLYGON((-109.7383 23.0022, -109.7381 23.0023, -109.7377 23.0018, -109.7380 23.0016, -109.7383 23.0022))",
    "",
    "",
    "",
    "#0F766E",
    "",
    "",
    "MX",
    "09",
    "004",
    "78398",
    "Aguaje 2000",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
  ],
  [
    "capa",
    "Mirador",
    "Planta baja",
    "disponible",
    "0",
    "",
    "",
    "",
    "",
    "Nivel principal",
    "POLYGON((-109.7383 23.0022, -109.7380 23.0016, -109.7381 23.0018, -109.7383 23.0022))",
    "3",
    "0",
    "1",
    "#0F766E",
    "",
    "",
    "MX",
    "09",
    "004",
    "78398",
    "Aguaje 2000",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
  ],
  [
    "unidad",
    "Mirador",
    "LOTE-1",
    "disponible",
    "",
    "0",
    "LOTE-1",
    "Terreno Departamental",
    "",
    "Unidad ejemplo",
    "POLYGON((-109.7383 23.0022, -109.7381 23.0018, -109.7382 23.0020, -109.7383 23.0022))",
    "3",
    "0",
    "1",
    "#0F766E",
    "3119155",
    "479.87",
    "MX",
    "09",
    "004",
    "78398",
    "Aguaje 2000",
    "2",
    "1",
    "1",
    "2",
    "85",
    "120",
    "8",
    "1",
    "1",
    "0",
    "1",
  ],
] as const;

function csvCell(value: string) {
  if (value === "") {
    return "";
  }
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function buildPropertyImportTemplateCsv() {
  const rows = [PROPERTY_IMPORT_TEMPLATE_HEADERS, ...PROPERTY_IMPORT_TEMPLATE_ROWS];
  return `${rows.map((row) => row.map(csvCell).join(",")).join("\n")}\n`;
}

function csvField(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "";
  }
  if (typeof value === "boolean") {
    return value ? "1" : "0";
  }
  return String(value);
}

function csvMetadataField(metadata: Record<string, unknown> | undefined, suffix: string): string {
  if (!metadata) {
    return "";
  }
  const directKey = `metadata_${suffix}`;
  const value = metadata[suffix] ?? metadata[directKey];
  return csvField(value);
}

function buildPropertyExportCsv(
  hierarchy: DesarrolloNode[],
  tipos: PropiedadTipo[],
  geojsonFeatures: GeoFeature[] = [],
) {
  const tipoNombreById = new Map(tipos.map((tipo) => [tipo.id, tipo.nombre]));
  const featureByKey = new Map<string, GeoFeature>();
  geojsonFeatures.forEach((feature) => {
    const layer = typeof feature.properties?.layer === "string" ? feature.properties.layer : undefined;
    const key = `${layer || "feature"}:${String(feature.id)}`;
    featureByKey.set(key, feature);
  });
  const getFeatureProps = (layer: string, id: string) => {
    return (
      featureByKey.get(`${layer}:${id}`)?.properties ||
      featureByKey.get(`feature:${id}`)?.properties ||
      undefined
    );
  };
  const stringFromProps = (props: Record<string, unknown> | undefined, keys: string[]) => {
    if (!props) return "";
    for (const key of keys) {
      const value = props[key];
      if (value !== null && value !== undefined && String(value).trim() !== "") {
        return csvField(value);
      }
    }
    return "";
  };
  const rows: string[][] = [PROPERTY_IMPORT_TEMPLATE_HEADERS.map((header) => header)];

  hierarchy.forEach((desarrollo) => {
    const desarrolloProps = getFeatureProps("desarrollo", desarrollo.id);
    const desarrolloGeometry = geojsonFeatures.find((feature) => String(feature.id) === desarrollo.id)?.geometry;
    const geo = {
      pais_codigo: stringFromProps(desarrolloProps, ["pais_codigo"]) || csvField(desarrollo.pais_codigo || ""),
      estado_cve: stringFromProps(desarrolloProps, ["estado_cve"]) || csvField(desarrollo.estado_cve || ""),
      municipio_cve: stringFromProps(desarrolloProps, ["municipio_cve"]) || csvField(desarrollo.municipio_cve || ""),
      codigo_postal: stringFromProps(desarrolloProps, ["codigo_postal"]) || csvField(desarrollo.codigo_postal || ""),
      colonia: stringFromProps(desarrolloProps, ["colonia"]) || csvField(desarrollo.colonia || ""),
    };
    rows.push([
      "desarrollo",
      desarrollo.nombre,
      desarrollo.nombre,
      stringFromProps(desarrolloProps, ["status"]) || csvField(desarrollo.status || "disponible"),
      "",
      "",
      "",
      stringFromProps(desarrolloProps, ["desarrollo_tipo", "tipo", "tipo_desarrollo"]) ||
        csvField(desarrollo.tipo || "horizontal"),
      "",
      stringFromProps(desarrolloProps, ["descripcion"]) || csvField(desarrollo.descripcion || ""),
      csvField(safeGeoJsonToMultiPolygonZWkt(desarrolloGeometry || desarrollo.geom)),
      stringFromProps(desarrolloProps, ["height"]) || "",
      stringFromProps(desarrolloProps, ["min_height"]) || "",
      stringFromProps(desarrolloProps, ["levels"]) || "",
      stringFromProps(desarrolloProps, ["color"]) || "",
      "",
      "",
      geo.pais_codigo,
      geo.estado_cve,
      geo.municipio_cve,
      geo.codigo_postal,
      geo.colonia,
      ...PROPERTY_IMPORT_METADATA_COLUMNS.map((column) => csvMetadataField(desarrollo.metadata, column.slice(9))),
    ]);

    desarrollo.capas?.forEach((capa) => {
      const capaProps = getFeatureProps("capa", capa.id);
      const capaGeometry = geojsonFeatures.find((feature) => String(feature.id) === capa.id)?.geometry;
      rows.push([
        "capa",
        desarrollo.nombre,
        csvField(capa.nombre || `Nivel ${capa.nivel ?? ""}`),
        stringFromProps(capaProps, ["status"]) || csvField(capa.status || "disponible"),
        stringFromProps(capaProps, ["nivel"]) || csvField(capa.nivel ?? ""),
        "",
        "",
        "",
        "",
        stringFromProps(capaProps, ["descripcion"]) || csvField(capa.descripcion || ""),
        csvField(safeGeoJsonToMultiPolygonZWkt(capaGeometry || capa.geom)),
        stringFromProps(capaProps, ["height"]) || "",
        stringFromProps(capaProps, ["min_height"]) || "",
        stringFromProps(capaProps, ["levels"]) || "",
        stringFromProps(capaProps, ["color"]) || "",
        "",
        "",
        geo.pais_codigo,
        geo.estado_cve,
        geo.municipio_cve,
        geo.codigo_postal,
        geo.colonia,
        ...PROPERTY_IMPORT_METADATA_COLUMNS.map((column) => csvMetadataField(capa.metadata, column.slice(9))),
      ]);

      capa.unidades?.forEach((unidad) => {
        const unidadProps = getFeatureProps("unidad", unidad.id);
        const unidadGeometry = geojsonFeatures.find((feature) => String(feature.id) === unidad.id)?.geometry;
        rows.push([
          "unidad",
          desarrollo.nombre,
          csvField(unidad.nombre || unidad.unidad),
          stringFromProps(unidadProps, ["status"]) || csvField(unidad.status || "disponible"),
          "",
          stringFromProps(unidadProps, ["nivel"]) || csvField(capa.nivel ?? ""),
          csvField(unidad.unidad),
          "",
          stringFromProps(unidadProps, ["tipo", "tipo_nombre"]) ||
            csvField(tipoNombreById.get(unidad.tipo_id || "") || ""),
          stringFromProps(unidadProps, ["descripcion"]) || csvField(unidad.descripcion || ""),
          csvField(safeGeoJsonToMultiPolygonZWkt(unidadGeometry || unidad.geom)),
          stringFromProps(unidadProps, ["height"]) || "",
          stringFromProps(unidadProps, ["min_height"]) || "",
          stringFromProps(unidadProps, ["levels"]) || "",
          stringFromProps(unidadProps, ["color"]) || "",
          stringFromProps(unidadProps, ["precio"]) || csvField(unidad.precio ?? ""),
          stringFromProps(unidadProps, ["area_m2"]) || csvField(unidad.area_m2 ?? ""),
          geo.pais_codigo,
          geo.estado_cve,
          geo.municipio_cve,
          geo.codigo_postal,
          geo.colonia,
          ...PROPERTY_IMPORT_METADATA_COLUMNS.map((column) => csvMetadataField(unidad.metadata, column.slice(9))),
        ]);
      });
    });
  });

  return `${rows.map((row) => row.map(csvCell).join(",")).join("\n")}\n`;
}

const UNIDAD_STATUS_OPTIONS = [
  { value: "disponible", label: "Disponible" },
  { value: "apartado", label: "Apartado" },
  { value: "vendido", label: "Vendido" },
  { value: "reservado", label: "Reservado" },
] as const;
type UnidadStatus = (typeof UNIDAD_STATUS_OPTIONS)[number]["value"];

const CAPA_STATUS_OPTIONS = UNIDAD_STATUS_OPTIONS;
type CapaStatus = UnidadStatus;

export function PropiedadForm({ lineas, familias, modelos, tipos }: PropiedadFormProps) {
  const [formValues, setFormValues] = useState({
    nombre: "",
    descripcion: "",
    tipoId: "",
    precio: "",
    height: "",
    minHeight: "",
    levels: "",
    estadoCve: "",
    municipioCve: "",
    codigoPostal: "",
    colonia: "",
    lineaId: "",
    familiaId: "",
    modeloId: "",
    geom: "",
  });
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [geometryTarget, setGeometryTarget] = useState<GeometryTarget | null>(null);
  const [geometryStatusMessage, setGeometryStatusMessage] = useState<string | null>(null);
  const [geometryError, setGeometryError] = useState<string | null>(null);
  const [isSavingGeometry, setIsSavingGeometry] = useState(false);
  const [isCapaModalOpen, setIsCapaModalOpen] = useState(false);
  const [creatingCapaFor, setCreatingCapaFor] = useState<DesarrolloNode | null>(null);
  const [capaForm, setCapaForm] = useState({
    nombre: "",
    nivel: "",
    status: "disponible" as CapaStatus,
    altura: "",
    descripcion: "",
    copias: "1",
  });
  const createUnidadFormDefaults = useCallback(
    (): UnidadFormState => ({
      unidad: "",
      nombre: "",
      tipoId: tipos[0]?.id ?? "",
      status: "disponible",
      precio: "",
      area: "",
      lineaId: lineas[0]?.id ?? "",
      familiaId: familias[0]?.id ?? "",
      modeloId: modelos[0]?.id ?? "",
      descripcion: "",
    }),
    [familias, lineas, modelos, tipos],
  );
  const [unidadForm, setUnidadForm] = useState<UnidadFormState>(createUnidadFormDefaults);
  const [isUnidadModalOpen, setIsUnidadModalOpen] = useState(false);
  const [creatingUnidadFor, setCreatingUnidadFor] = useState<{ desarrollo: DesarrolloNode; capa: CapaNode } | null>(null);
  const [unidadFormError, setUnidadFormError] = useState<string | null>(null);
  const [isSubmittingUnidad, setIsSubmittingUnidad] = useState(false);
  const [editingUnidad, setEditingUnidad] = useState<UnidadNode | null>(null);
  const [duplicatingCapa, setDuplicatingCapa] = useState<CapaNode | null>(null);
  const [editingCapa, setEditingCapa] = useState<CapaNode | null>(null);
  const [isSubmittingCapa, setIsSubmittingCapa] = useState(false);
  const [capaFormError, setCapaFormError] = useState<string | null>(null);
  const handleGeometryChange = useCallback((value?: string) => {
    setFormValues((prev) => ({ ...prev, geom: value ?? "" }));
  }, []);

  const [isDesarrolloModalOpen, setIsDesarrolloModalOpen] = useState(false);
  const [desarrolloForm, setDesarrolloForm] = useState({
    nombre: "",
    descripcion: "",
    tipo: "horizontal",
    paisCodigo: "MX",
    estadoCve: "",
    municipioCve: "",
    codigoPostal: "",
  });
  const [editingDesarrolloId, setEditingDesarrolloId] = useState<string | null>(null);
  const [isSubmittingDesarrollo, setIsSubmittingDesarrollo] = useState(false);
  const [desarrolloFormError, setDesarrolloFormError] = useState<string | null>(null);
  const [isMixModalOpen, setIsMixModalOpen] = useState(false);
  const [mixForm, setMixForm] = useState({
    nombre: "",
    descripcion: "",
    paisCodigo: "MX",
    estadoCve: "",
    municipioCve: "",
    codigoPostal: "",
    colonia: "",
  });
  const [mixFormError, setMixFormError] = useState<string | null>(null);
  const [isMixItemModalOpen, setIsMixItemModalOpen] = useState(false);
  const [mixItemForm, setMixItemForm] = useState({
    desarrolloId: "",
    modo: "horizontal",
    nombre: "",
  });
  const [mixItemError, setMixItemError] = useState<string | null>(null);
  const [activeMixId, setActiveMixId] = useState<string | null>(null);
  const [isSubmittingMix, setIsSubmittingMix] = useState(false);
  const [isSubmittingMixItem, setIsSubmittingMixItem] = useState(false);

  const handleDesarrolloField = useCallback(
    (field: keyof typeof desarrolloForm, value: string) => {
      setDesarrolloForm((prev) => ({ ...prev, [field]: value }));
    },
    [],
  );

  const handleMixField = useCallback(
    (field: keyof typeof mixForm, value: string) => {
      setMixForm((prev) => ({ ...prev, [field]: value }));
    },
    [],
  );

  const handleMixItemField = useCallback(
    (field: keyof typeof mixItemForm, value: string) => {
      setMixItemForm((prev) => ({ ...prev, [field]: value }));
    },
    [],
  );

  const resetDesarrolloForm = useCallback((keepEditing = false) => {
    setDesarrolloForm({
      nombre: "",
      descripcion: "",
      tipo: "horizontal",
      paisCodigo: "MX",
      estadoCve: "",
      municipioCve: "",
      codigoPostal: "",
    });
    setDesarrolloFormError(null);
    if (!keepEditing) {
      setEditingDesarrolloId(null);
    }
  }, []);

  const openDesarrolloModal = useCallback(
    (tipo: "horizontal" | "vertical") => {
      setEditingDesarrolloId(null);
      setDesarrolloForm({
        nombre: "",
        descripcion: "",
        tipo,
        paisCodigo: "MX",
        estadoCve: "",
        municipioCve: "",
        codigoPostal: "",
      });
      setDesarrolloFormError(null);
      setIsDesarrolloModalOpen(true);
    },
    [],
  );

  const resetMixForm = useCallback(() => {
    setMixForm({
      nombre: "",
      descripcion: "",
      paisCodigo: "MX",
      estadoCve: "",
      municipioCve: "",
      codigoPostal: "",
      colonia: "",
    });
    setMixFormError(null);
  }, []);

  const resetMixItemForm = useCallback(() => {
    setMixItemForm({
      desarrolloId: "",
      modo: "horizontal",
      nombre: "",
    });
    setMixItemError(null);
    setActiveMixId(null);
  }, []);

  const handleNodeAction = useCallback((message: string) => {
    setStatusMessage(message);
  }, []);

  const loadHierarchy = useCallback(async () => {
    setIsHierarchyLoading(true);
    try {
      const response = await fetch("/api/crm/propiedades/hierarquia");
      if (!response.ok) {
        throw new Error("No fue posible cargar la jerarquía.");
      }
      const data = await response.json().catch(() => ({}));
      if (!Array.isArray(data.features)) {
        throw new Error("Respuesta inválida para la jerarquía.");
      }
      setHierarchy(
        data.features.filter(
          (feature: unknown): feature is DesarrolloNode => !!feature && typeof feature === "object",
        ),
      );
      setHierarchyError(null);
    } catch (error) {
      console.error("Error cargando jerarquía:", error);
      setHierarchy([]);
      setHierarchyError(error instanceof Error ? error.message : "Error desconocido.");
    } finally {
      setIsHierarchyLoading(false);
    }
  }, []);

  const handleDeleteNode = useCallback(
    async (target: {
      type: "desarrollo" | "capa" | "unidad";
      id: string;
      label: string;
      poligonoId?: string | null;
    }) => {
      if (!target.id) {
        return;
      }
      const typeLabel = target.type === "unidad" ? "unidad" : target.type === "capa" ? "capa" : "desarrollo";
      const confirmMessage = `Eliminarás el ${typeLabel} "${target.label}" y sus datos asociados. ¿Quieres continuar?`;
      if (!window.confirm(confirmMessage)) {
        return;
      }
      setIsDeletingNode(true);
      try {
        if (target.poligonoId) {
          const polygonResponse = await fetch(`/api/crm/propiedad-poligonos/${target.poligonoId}`, {
            method: "DELETE",
          });
          if (!polygonResponse.ok) {
            const payload = await polygonResponse.json().catch(() => null);
            throw new Error(
              payload?.error || "No fue posible eliminar el polígono asociado.",
            );
          }
        }
        const endpoint =
          target.type === "desarrollo"
            ? `/api/crm/propiedad-desarrollos/${target.id}`
            : target.type === "capa"
              ? `/api/crm/propiedad-capas/${target.id}`
              : `/api/crm/propiedad-unidades/${target.id}`;
        const response = await fetch(endpoint, { method: "DELETE" });
        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          throw new Error(
            payload?.error || "No fue posible eliminar el nodo seleccionado.",
          );
        }
        handleNodeAction(`${typeLabel.charAt(0).toUpperCase() + typeLabel.slice(1)} eliminado con éxito.`);
        await loadHierarchy();
      } catch (error) {
        const message = error instanceof Error ? error.message : "Error desconocido al eliminar.";
        handleNodeAction(message);
      } finally {
        setIsDeletingNode(false);
      }
    },
    [handleNodeAction, loadHierarchy],
  );

  const handleSelectGeometryTarget = useCallback(
    (target: GeometryTarget, geometry?: GeoJsonGeometry) => {
      setGeometryTarget(target);
      setFormValues((prev) => ({
        ...prev,
        geom: geometry ? JSON.stringify(geometry) : "",
      }));
      setGeometryError(null);
      setGeometryStatusMessage(null);
    },
    [],
  );

  const handleSelectDesarrolloGeometry = useCallback(
    (desarrollo: DesarrolloNode) => {
      handleSelectGeometryTarget(
        {
          type: "desarrollo",
          id: desarrollo.id,
          label: desarrollo.nombre,
          poligonoId: desarrollo.poligono_id ?? null,
        },
        desarrollo.geom,
      );
    },
    [handleSelectGeometryTarget],
  );

  const handleSelectCapaGeometry = useCallback(
    (desarrollo: DesarrolloNode, capa: CapaNode) => {
      handleSelectGeometryTarget(
        {
          type: "capa",
          id: capa.id,
          label: capa.nombre || `Nivel ${capa.nivel ?? "?"}`,
          desarrolloId: desarrollo.id,
          nivel: capa.nivel ?? null,
          poligonoId: capa.poligono_id ?? null,
        },
        capa.geom,
      );
    },
    [handleSelectGeometryTarget],
  );

  const handleSelectUnidadGeometry = useCallback(
    (desarrollo: DesarrolloNode, capa: CapaNode, unidad: UnidadNode) => {
      handleSelectGeometryTarget(
        {
          type: "unidad",
          id: unidad.id,
          label: unidad.unidad || `Unidad ${unidad.id.slice(0, 4)}`,
          desarrolloId: desarrollo.id,
          capaId: capa.id,
          nivel: capa.nivel ?? null,
          poligonoId: unidad.poligono_id ?? null,
        },
        unidad.geom,
      );
    },
    [handleSelectGeometryTarget],
  );

  const handleCapaField = useCallback(
    (field: keyof typeof capaForm, value: string) => {
      setCapaForm((prev) => ({ ...prev, [field]: value }));
    },
    [setCapaForm],
  );

  const handleUnidadField = useCallback(
    (field: keyof UnidadFormState, value: string) => {
      setUnidadForm((prev) => ({ ...prev, [field]: value }));
    },
    [],
  );

  const resetCapaForm = useCallback(() => {
    setCapaForm({
      nombre: "",
      nivel: "",
      status: "disponible",
      altura: "",
      descripcion: "",
      copias: "1",
    });
    setCapaFormError(null);
    setCreatingCapaFor(null);
    setDuplicatingCapa(null);
    setEditingCapa(null);
  }, []);

  const resetUnidadForm = useCallback(() => {
    setUnidadForm(createUnidadFormDefaults());
    setUnidadFormError(null);
    setEditingUnidad(null);
  }, [createUnidadFormDefaults]);

  const openCapaModal = useCallback(
    (desarrollo: DesarrolloNode, duplicateFrom?: CapaNode) => {
      setCreatingCapaFor(desarrollo);
      setDuplicatingCapa(duplicateFrom ?? null);
      setCapaForm({
        nombre: duplicateFrom
          ? `${duplicateFrom.nombre || `Nivel ${duplicateFrom.nivel ?? "?"}`} copia`
          : "",
        nivel: duplicateFrom && duplicateFrom.nivel != null ? String(duplicateFrom.nivel + 1) : "",
        status: duplicateFrom?.status ? (duplicateFrom.status as CapaStatus) : "disponible",
        altura: duplicateFrom && duplicateFrom.altura != null ? String(duplicateFrom.altura) : "",
        descripcion: duplicateFrom?.descripcion || "",
        copias: "1",
      });
      setCapaFormError(null);
      setEditingCapa(null);
      setIsCapaModalOpen(true);
      if (duplicateFrom) {
        handleSelectCapaGeometry(desarrollo, duplicateFrom);
      }
    },
    [handleSelectCapaGeometry],
  );

  const openUnidadModal = useCallback(
    (desarrollo: DesarrolloNode, capa: CapaNode) => {
      setCreatingUnidadFor({ desarrollo, capa });
      resetUnidadForm();
      setIsUnidadModalOpen(true);
    },
    [resetUnidadForm],
  );

  const openEditUnidadModal = useCallback(
    (desarrollo: DesarrolloNode, capa: CapaNode, unidad: UnidadNode) => {
      setCreatingUnidadFor({ desarrollo, capa });
      setEditingUnidad(unidad);
      setUnidadForm({
        unidad: unidad.unidad || "",
        nombre: unidad.nombre || unidad.unidad,
        tipoId: unidad.tipo_id || tipos[0]?.id || "",
        status: (unidad.status || "disponible") as UnidadStatus,
        precio: unidad.precio != null ? String(unidad.precio) : "",
        area: unidad.area_m2 != null ? String(unidad.area_m2) : "",
        lineaId: unidad.linea_id || "",
        familiaId: unidad.familia_id || "",
        modeloId: unidad.modelo_id || "",
        descripcion: unidad.descripcion || "",
      });
      setUnidadFormError(null);
      setIsUnidadModalOpen(true);
    },
    [tipos],
  );

  const openEditCapaModal = useCallback(
    (desarrollo: DesarrolloNode, capa: CapaNode) => {
      setCreatingCapaFor(desarrollo);
      setDuplicatingCapa(null);
      setEditingCapa(capa);
      setCapaForm({
        nombre: capa.nombre || "",
        nivel: capa.nivel != null ? String(capa.nivel) : "",
        status: (capa.status || "disponible") as CapaStatus,
        altura: capa.altura != null ? String(capa.altura) : "",
        descripcion: capa.descripcion || "",
        copias: "1",
      });
      setCapaFormError(null);
      setIsCapaModalOpen(true);
    },
    [],
  );

  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({});
  type TreeActionTarget =
    | { type: "desarrollo"; desarrollo: DesarrolloNode }
    | { type: "capa"; desarrollo: DesarrolloNode; capa: CapaNode }
    | { type: "unidad"; desarrollo: DesarrolloNode; capa: CapaNode; unidad: UnidadNode };
  const [treePlusTarget, setTreePlusTarget] = useState<TreeActionTarget | null>(null);

  const handleTreePlusChoice = useCallback(
    (option: "caracteristicas" | "poligono") => {
      if (!treePlusTarget) {
        return;
      }
      if (treePlusTarget.type === "capa") {
        if (option === "caracteristicas") {
          openUnidadModal(treePlusTarget.desarrollo, treePlusTarget.capa);
        } else {
          handleSelectCapaGeometry(treePlusTarget.desarrollo, treePlusTarget.capa);
        }
      } else if (treePlusTarget.type === "desarrollo") {
        if (option === "caracteristicas") {
          openCapaModal(treePlusTarget.desarrollo);
        } else {
          handleSelectDesarrolloGeometry(treePlusTarget.desarrollo);
        }
      } else {
        if (option === "caracteristicas") {
          openEditUnidadModal(treePlusTarget.desarrollo, treePlusTarget.capa, treePlusTarget.unidad);
        } else {
          handleSelectUnidadGeometry(
            treePlusTarget.desarrollo,
            treePlusTarget.capa,
            treePlusTarget.unidad,
          );
        }
      }
      setTreePlusTarget(null);
    },
    [
      handleSelectCapaGeometry,
      handleSelectDesarrolloGeometry,
      handleSelectUnidadGeometry,
      openCapaModal,
      openEditUnidadModal,
      openUnidadModal,
      treePlusTarget,
    ],
  );
  const toggleNodeExpansion = useCallback((id: string) => {
    setExpandedNodes((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const getTreePrimaryActionLabel = (target: TreeActionTarget | null) => {
    if (!target) return "Agregar características";
    if (target.type === "desarrollo") return "Agregar capa";
    if (target.type === "capa") return "Agregar unidad";
    return "Editar unidad";
  };

  const [hierarchy, setHierarchy] = useState<DesarrolloNode[]>([]);
  const [isHierarchyLoading, setIsHierarchyLoading] = useState(false);
  const [hierarchyError, setHierarchyError] = useState<string | null>(null);
  const [estadoOptions, setEstadoOptions] = useState<LocationOption[]>([]);
  const [desarrolloMunicipioOptions, setDesarrolloMunicipioOptions] = useState<LocationOption[]>([]);
  const [mixMunicipioOptions, setMixMunicipioOptions] = useState<LocationOption[]>([]);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importFileName, setImportFileName] = useState<string | null>(null);
  const [importStatus, setImportStatus] = useState<ImportStatus>("idle");
  const [importError, setImportError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<string | null>(null);
  const [isDeletingNode, setIsDeletingNode] = useState(false);

  const desarrolloMap = useMemo(() => {
    const map = new Map<string, DesarrolloNode>();
    hierarchy.forEach((node) => map.set(node.id, node));
    return map;
  }, [hierarchy]);

  const handleFocusDesarrolloById = useCallback(
    (id: string) => {
      const desarrollo = desarrolloMap.get(id);
      if (desarrollo) {
        handleSelectDesarrolloGeometry(desarrollo);
        setExpandedNodes((prev) => ({ ...prev, [desarrollo.id]: true }));
      }
    },
    [desarrolloMap, handleSelectDesarrolloGeometry],
  );

  const mixChildIds = useMemo(() => {
    const ids = new Set<string>();
    hierarchy.forEach((node) => {
      node.items?.forEach((item) => {
        ids.add(item.desarrollo_id);
      });
    });
    return ids;
  }, [hierarchy]);

  const rootDevelopments = useMemo(() => {
    return hierarchy.filter((node) => !mixChildIds.has(node.id));
  }, [hierarchy, mixChildIds]);

  const availableChildDevelopments = useMemo(() => {
    return hierarchy.filter((node) => node.tipo !== "mixto" && !mixChildIds.has(node.id));
  }, [hierarchy, mixChildIds]);

  const openMixItemModal = useCallback(
    (mixId: string) => {
      setActiveMixId(mixId);
      resetMixItemForm();
      const first = availableChildDevelopments[0];
      setMixItemForm((prev) => ({
        ...prev,
        desarrolloId: first?.id ?? "",
      }));
      setIsMixItemModalOpen(true);
      setMixItemError(null);
    },
    [availableChildDevelopments, resetMixItemForm],
  );

  const hierarchyFeatures = useMemo(() => {
    const features: GeoFeature[] = [];
    hierarchy.forEach((desarrollo) => {
      if (desarrollo.geom?.type && desarrollo.geom?.coordinates) {
        features.push({
          id: desarrollo.id,
          geometry: desarrollo.geom,
          properties: {
            nombre: desarrollo.nombre,
            tipo: desarrollo.tipo,
            layerType: "desarrollo",
          },
        });
      }
      desarrollo.capas?.forEach((capa) => {
        if (!capa.geom?.type || !capa.geom?.coordinates) {
          return;
        }
        features.push({
          id: capa.id,
          geometry: capa.geom,
          properties: {
            nombre: capa.nombre || `Nivel ${capa.nivel ?? "?"}`,
            layerType: "capa",
            nivel: capa.nivel,
            desarrolloId: desarrollo.id,
          },
        });
        capa.unidades?.forEach((unidad) => {
          if (!unidad.geom?.type || !unidad.geom?.coordinates) {
            return;
          }
          features.push({
            id: unidad.id,
            geometry: unidad.geom,
            properties: {
              nombre: unidad.unidad || "Unidad",
              layerType: "unidad",
              nivel: capa.nivel,
              desarrolloId: desarrollo.id,
              capaId: capa.id,
              status: unidad.status,
            },
          });
        });
      });
    });
    return features;
  }, [hierarchy]);

  const handleImportFileChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0] ?? null;
    if (!file) {
      setImportFile(null);
      setImportFileName(null);
      return;
    }
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setImportError("Solo se aceptan archivos CSV.");
      setImportFile(null);
      setImportFileName(null);
      return;
    }
    setImportFile(file);
    setImportFileName(file.name);
    setImportStatus("idle");
    setImportError(null);
    setImportResult(null);
  }, []);

  const handleDownloadImportTemplate = useCallback(() => {
    const csv = buildPropertyImportTemplateCsv();
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "plantilla_importacion_propiedades.csv";
    anchor.rel = "noopener noreferrer";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }, []);

  const handleDownloadPropertyExport = useCallback(async () => {
    let geojsonFeatures: GeoFeature[] = [];
    try {
      const response = await fetch("/api/crm/propiedades/geojson");
      if (response.ok) {
        const body = (await response.json().catch(() => ({}))) as { features?: unknown };
        if (Array.isArray(body.features)) {
          geojsonFeatures = body.features.filter((feature): feature is GeoFeature =>
            Boolean(feature && typeof feature === "object" && "id" in feature),
          );
        }
      }
    } catch (error) {
      console.error("No se pudo cargar el geojson de propiedades para exportar:", error);
    }
    const csv = buildPropertyExportCsv(hierarchy, tipos, geojsonFeatures);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `propiedades_exportadas_${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.rel = "noopener noreferrer";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }, [hierarchy, tipos]);

  const handleRunImport = useCallback(async () => {
    if (!importFile) {
      setImportError("Selecciona un archivo CSV antes de importar.");
      return;
    }

    setImportStatus("submitting");
    setImportError(null);
    setImportResult(null);
    try {
      const formData = new FormData();
      formData.append("file", importFile);
      const response = await fetch("/api/crm/propiedades/importar/csv", {
        method: "POST",
        body: formData,
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body?.error || "No fue posible importar el CSV.");
      }
      setImportStatus("success");
      setImportResult("Importación completada. Actualizando la jerarquía…");
      setImportFile(null);
      setImportFileName(null);
      await loadHierarchy();
    } catch (error) {
      setImportStatus("idle");
      setImportError(
        error instanceof Error ? error.message : "Error desconocido durante la importación.",
      );
    }
  }, [importFile, loadHierarchy]);

  const openEditDesarrollo = useCallback((desarrollo: DesarrolloNode) => {
    setEditingDesarrolloId(desarrollo.id);
    setDesarrolloForm({
      nombre: desarrollo.nombre,
      descripcion: desarrollo.descripcion ?? "",
      tipo: desarrollo.tipo || "horizontal",
      paisCodigo: desarrollo.pais_codigo || "MX",
      estadoCve: desarrollo.estado_cve || "",
      municipioCve: desarrollo.municipio_cve || "",
      codigoPostal: desarrollo.codigo_postal || "",
    });
    setIsDesarrolloModalOpen(true);
  }, []);

  useEffect(() => {
    loadHierarchy();
  }, [loadHierarchy]);

  useEffect(() => {
    if (!geometryTarget) {
      return;
    }
    if (geometryTarget.type === "desarrollo") {
      const selected = hierarchy.find((node) => node.id === geometryTarget.id);
      if (!selected) {
        return;
      }
      setFormValues((prev) => ({
        ...prev,
        geom: selected.geom ? JSON.stringify(selected.geom) : "",
      }));
      return;
    }
    const desarrollo = hierarchy.find((node) => node.id === geometryTarget.desarrolloId);
    if (!desarrollo) {
      return;
    }
    if (geometryTarget.type === "capa") {
      const capa = desarrollo.capas?.find((node) => node.id === geometryTarget.id);
      if (!capa) return;
      setFormValues((prev) => ({
        ...prev,
        geom: capa.geom ? JSON.stringify(capa.geom) : "",
      }));
      return;
    }
    if (geometryTarget.type === "unidad") {
      const capa = desarrollo.capas?.find((node) => node.id === geometryTarget.capaId);
      const unidad = capa?.unidades?.find((node) => node.id === geometryTarget.id);
      if (!unidad) return;
      setFormValues((prev) => ({
        ...prev,
        geom: unidad.geom ? JSON.stringify(unidad.geom) : "",
      }));
    }
  }, [geometryTarget, hierarchy]);

  useEffect(() => {
    let mounted = true;
    setLocationError(null);
    fetch("/api/crm/demografia/geo/estados")
      .then((response) => response.json())
      .then((body) => {
        const features = body?.geojson?.features;
        if (!Array.isArray(features)) {
          throw new Error("No fue posible cargar los estados.");
        }
        const options = features
          .map((feature) => {
            const props = feature?.properties || {};
            const value =
              String(props.cve_ent || props.CVE_ENT || props.cveent || "").padStart(2, "0");
            const label = props.nom_ent || props.NOM_ENT || props.name;
            if (!value || !label) return null;
            return { value, label: String(label) };
          })
          .filter((value): value is LocationOption => Boolean(value));
        if (mounted) {
          setEstadoOptions(options);
        }
      })
      .catch((error) => {
        console.error("Error cargando estados:", error);
        if (mounted) {
          setLocationError(error instanceof Error ? error.message : "Error cargando estados.");
          setEstadoOptions([]);
        }
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!desarrolloForm.estadoCve) {
      setDesarrolloMunicipioOptions([]);
      return;
    }
    let mounted = true;
    setLocationError(null);
    fetch(
      `/api/crm/demografia/geo/municipios/${encodeURIComponent(
        desarrolloForm.estadoCve,
      )}`,
    )
      .then((response) => response.json())
      .then((body) => {
        const features = body?.geojson?.features;
        if (!Array.isArray(features)) {
          throw new Error("No fue posible cargar los municipios.");
        }
        const options = features
          .map((feature) => {
            const props = feature?.properties || {};
            const value =
              String(props.cve_mun || props.CVE_MUN || props.cvemun || "").padStart(3, "0");
            const label = props.nom_mun || props.NOM_MUN || props.name;
            if (!value || !label) return null;
            return { value, label: String(label) };
          })
          .filter((value): value is LocationOption => Boolean(value));
        if (mounted) {
          setDesarrolloMunicipioOptions(options);
        }
      })
      .catch((error) => {
        console.error("Error cargando municipios:", error);
        if (mounted) {
          setLocationError(error instanceof Error ? error.message : "Error cargando municipios.");
          setDesarrolloMunicipioOptions([]);
        }
      });
    return () => {
      mounted = false;
    };
  }, [desarrolloForm.estadoCve]);

  useEffect(() => {
    if (!mixForm.estadoCve) {
      setMixMunicipioOptions([]);
      return;
    }
    let mounted = true;
    setLocationError(null);
    fetch(
      `/api/crm/demografia/geo/municipios/${encodeURIComponent(
        mixForm.estadoCve,
      )}`,
    )
      .then((response) => response.json())
      .then((body) => {
        const features = body?.geojson?.features;
        if (!Array.isArray(features)) {
          throw new Error("No fue posible cargar los municipios.");
        }
        const options = features
          .map((feature) => {
            const props = feature?.properties || {};
            const value =
              String(props.cve_mun || props.CVE_MUN || props.cvemun || "").padStart(3, "0");
            const label = props.nom_mun || props.NOM_MUN || props.name;
            if (!value || !label) return null;
            return { value, label: String(label) };
          })
          .filter((value): value is LocationOption => Boolean(value));
        if (mounted) {
          setMixMunicipioOptions(options);
        }
      })
      .catch((error) => {
        console.error("Error cargando municipios:", error);
        if (mounted) {
          setLocationError(error instanceof Error ? error.message : "Error cargando municipios.");
          setMixMunicipioOptions([]);
        }
      });
    return () => {
      mounted = false;
    };
  }, [mixForm.estadoCve]);

  const isEditingDesarrollo = Boolean(editingDesarrolloId);

  const handleSaveDesarrollo = useCallback(async () => {
    if (!desarrolloForm.nombre.trim()) {
      setDesarrolloFormError("Ingresa el nombre del desarrollo.");
      return;
    }
    setIsSubmittingDesarrollo(true);
    setDesarrolloFormError(null);
    try {
      const payload: Record<string, string | null> = {
        nombre: desarrolloForm.nombre.trim(),
        descripcion: desarrolloForm.descripcion.trim() || null,
        tipo: desarrolloForm.tipo,
      };
      const paisCodigo = desarrolloForm.paisCodigo?.trim().toUpperCase();
      if (paisCodigo) payload.pais_codigo = paisCodigo;
      if (desarrolloForm.estadoCve) payload.estado_cve = desarrolloForm.estadoCve;
      if (desarrolloForm.municipioCve) payload.municipio_cve = desarrolloForm.municipioCve;
      if (desarrolloForm.codigoPostal?.trim()) {
        payload.codigo_postal = desarrolloForm.codigoPostal.trim();
      }
      const response = await fetch(
        isEditingDesarrollo
          ? `/api/crm/propiedad-desarrollos/${editingDesarrolloId}`
          : "/api/crm/propiedad-desarrollos",
        {
          method: isEditingDesarrollo ? "PATCH" : "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          (body as { error?: string }).error || "No se pudo guardar el desarrollo.",
        );
      }
      handleNodeAction(
        isEditingDesarrollo
          ? "Desarrollo actualizado con éxito."
          : "Desarrollo guardado con éxito.",
      );
      resetDesarrolloForm();
      setIsDesarrolloModalOpen(false);
      loadHierarchy();
    } catch (error) {
      console.error("Falló la creación del desarrollo:", error);
      setDesarrolloFormError(
        error instanceof Error ? error.message : "Error desconocido al guardar.",
      );
    } finally {
      setIsSubmittingDesarrollo(false);
    }
  }, [
    desarrolloForm,
    editingDesarrolloId,
    handleNodeAction,
    isEditingDesarrollo,
    loadHierarchy,
    resetDesarrolloForm,
  ]);

  const handleCreateCapa = useCallback(async () => {
    if (!creatingCapaFor) {
      setCapaFormError("Selecciona el desarrollo que recibirá la capa.");
      return;
    }
    if (editingCapa) {
      const payload: Record<string, unknown> = {};
      if (capaForm.nombre.trim()) {
        payload.nombre = capaForm.nombre.trim();
      }
      if (capaForm.descripcion.trim()) {
        payload.descripcion = capaForm.descripcion.trim();
      }
      payload.status = capaForm.status;
      if (capaForm.nivel.trim()) {
        const parsedNivel = Number.parseInt(capaForm.nivel, 10);
        if (!Number.isNaN(parsedNivel)) {
          payload.nivel = parsedNivel;
        }
      }
      if (capaForm.altura.trim() && !Number.isNaN(Number(capaForm.altura))) {
        payload.altura = Number(capaForm.altura);
      }
      if (!Object.keys(payload).length) {
        setCapaFormError("Actualiza al menos un campo antes de guardar.");
        return;
      }
      setIsSubmittingCapa(true);
      setCapaFormError(null);
      try {
        const response = await fetch(`/api/crm/propiedad-capas/${editingCapa.id}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(
            (body as { error?: string }).error || "No se pudo actualizar la capa.",
          );
        }
        handleNodeAction("Capa actualizada con éxito.");
        resetCapaForm();
        setIsCapaModalOpen(false);
        await loadHierarchy();
      } catch (error) {
        setCapaFormError(
          error instanceof Error ? error.message : "Error desconocido al guardar la capa.",
        );
      } finally {
        setIsSubmittingCapa(false);
      }
      return;
    }
    const isVertical = creatingCapaFor.tipo === "vertical";
    const isDuplicating = Boolean(duplicatingCapa);
    if (!isVertical && capaForm.nivel?.trim()) {
      // ensure nivel stays consistent even if provided accidentally
    }
    let nivel = 0;
    if (isVertical && !isDuplicating) {
      const nivelValue = capaForm.nivel.trim();
      if (!nivelValue) {
        setCapaFormError("El nivel es obligatorio para desarrollos verticales.");
        return;
      }
      nivel = Number.parseInt(nivelValue, 10);
      if (Number.isNaN(nivel)) {
        setCapaFormError("Ingresa un nivel válido.");
        return;
      }
    }
    const alturaValue =
      capaForm.altura.trim() && !Number.isNaN(Number(capaForm.altura))
        ? Number(capaForm.altura)
        : undefined;
    const copies = isDuplicating
      ? Math.max(1, Number.parseInt(capaForm.copias, 10) || 1)
      : 1;
    setIsSubmittingCapa(true);
    setCapaFormError(null);
    try {
      let lastCreatedLabel: string | null = null;
      let lastCreatedId: string | null = null;
      for (let index = 0; index < copies; index += 1) {
        const currentLevel = isVertical
          ? isDuplicating
            ? (duplicatingCapa?.nivel ?? 0) + index + 1
            : nivel
          : 0;
        const payload: Record<string, unknown> = {
          desarrollo_id: creatingCapaFor.id,
          nivel: currentLevel,
          status: capaForm.status,
        };
        if (capaForm.nombre.trim()) {
          payload.nombre = capaForm.nombre.trim();
        }
        if (capaForm.descripcion.trim()) {
          payload.descripcion = capaForm.descripcion.trim();
        }
        if (isVertical && alturaValue) {
          payload.altura = alturaValue;
        }
        const response = await fetch("/api/crm/propiedad-capas", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(
            (body as { error?: string }).error || "No se pudo guardar la capa.",
          );
        }
        const savedCapa = (body as { capa?: { id?: string; nombre?: string; nivel?: number; desarrollo_id?: string } })
          .capa;
        if (savedCapa?.id) {
          lastCreatedId = savedCapa.id;
          lastCreatedLabel = savedCapa.nombre || `Nivel ${savedCapa.nivel ?? currentLevel}`;
        }
      }
      handleNodeAction(
        isDuplicating
          ? `Se duplicaron ${copies} nivel(es) a partir de ${duplicatingCapa?.nombre}.`
          : "Capa creada con éxito.",
      );
      resetCapaForm();
      setIsCapaModalOpen(false);
      await loadHierarchy();
      if (lastCreatedId && lastCreatedLabel) {
        handleSelectGeometryTarget(
          {
            type: "capa",
            id: lastCreatedId,
            label: lastCreatedLabel,
            desarrolloId: creatingCapaFor.id,
            nivel: isDuplicating
              ? (duplicatingCapa?.nivel ?? 0) + copies
              : nivel,
            poligonoId: null,
          },
          undefined,
        );
      }
    } catch (error) {
      setCapaFormError(
        error instanceof Error ? error.message : "Error desconocido al guardar la capa.",
      );
    } finally {
      setIsSubmittingCapa(false);
    }
  }, [
    capaForm,
    creatingCapaFor,
    duplicatingCapa,
    editingCapa,
    handleNodeAction,
    handleSelectGeometryTarget,
    loadHierarchy,
    resetCapaForm,
  ]);

  const handleCreateUnidad = useCallback(async () => {
    if (!creatingUnidadFor) {
      setUnidadFormError("Selecciona el nivel donde registrar la unidad.");
      return;
    }
    if (!unidadForm.unidad.trim()) {
      setUnidadFormError("Define una clave o nombre corto para la unidad.");
      return;
    }
    if (!unidadForm.tipoId) {
      setUnidadFormError("Selecciona el tipo de propiedad.");
      return;
    }
    const unidadKey = unidadForm.unidad.trim();
    const nombreValue = unidadForm.nombre.trim() || unidadKey;
    const payload: Record<string, unknown> = {
      unidad: unidadKey,
      nombre: nombreValue,
      tipo_id: unidadForm.tipoId,
      nivel_id: creatingUnidadFor.capa.id,
      desarrollo_id: creatingUnidadFor.desarrollo.id,
      status: unidadForm.status,
    };
    if (unidadForm.descripcion.trim()) {
      payload.descripcion = unidadForm.descripcion.trim();
    }
    if (unidadForm.precio.trim()) {
      const precioValue = Number(unidadForm.precio);
      if (Number.isNaN(precioValue)) {
        setUnidadFormError("Ingresa un precio válido.");
        return;
      }
      payload.precio = precioValue;
    }
    if (unidadForm.area.trim()) {
      const areaValue = Number(unidadForm.area);
      if (Number.isNaN(areaValue)) {
        setUnidadFormError("Ingresa un área en m² válida.");
        return;
      }
      payload.area_m2 = areaValue;
    }
    if (unidadForm.lineaId) {
      payload.linea_id = unidadForm.lineaId;
    }
    if (unidadForm.familiaId) {
      payload.familia_id = unidadForm.familiaId;
    }
    if (unidadForm.modeloId) {
      payload.modelo_id = unidadForm.modeloId;
    }
    const isEditingUnidad = Boolean(editingUnidad);
    setIsSubmittingUnidad(true);
    setUnidadFormError(null);
    try {
      const endpoint = isEditingUnidad
        ? `/api/crm/propiedad-unidades/${editingUnidad?.id}`
        : "/api/crm/propiedades";
      const method = isEditingUnidad ? "PATCH" : "POST";
      const response = await fetch(endpoint, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          (body as { error?: string }).error || "No se pudo guardar la unidad.",
        );
      }
      handleNodeAction(isEditingUnidad ? "Unidad actualizada con éxito." : "Unidad creada con éxito.");
      setCreatingUnidadFor(null);
      resetUnidadForm();
      setIsUnidadModalOpen(false);
      await loadHierarchy();
    } catch (error) {
      setUnidadFormError(
        error instanceof Error ? error.message : "Error desconocido al guardar la unidad.",
      );
    } finally {
      setIsSubmittingUnidad(false);
    }
  }, [
    creatingUnidadFor,
    handleNodeAction,
    loadHierarchy,
    editingUnidad,
    resetUnidadForm,
    unidadForm,
  ]);

  const handleCreateMix = useCallback(async () => {
    if (!mixForm.nombre.trim()) {
      setMixFormError("Ingresa el nombre del desarrollo mixto.");
      return;
    }
    setIsSubmittingMix(true);
    setMixFormError(null);
    try {
      const payload: Record<string, unknown> = {
        nombre: mixForm.nombre.trim(),
        descripcion: mixForm.descripcion?.trim() || null,
        tipo: "mixto",
        status: "disponible",
      };
      if (mixForm.paisCodigo) payload.pais_codigo = mixForm.paisCodigo.trim().toUpperCase();
      if (mixForm.estadoCve) payload.estado_cve = mixForm.estadoCve.trim();
      if (mixForm.municipioCve) payload.municipio_cve = mixForm.municipioCve.trim();
      if (mixForm.codigoPostal) payload.codigo_postal = mixForm.codigoPostal.trim();
      if (mixForm.colonia) payload.colonia = mixForm.colonia.trim();
      const response = await fetch("/api/crm/propiedad-desarrollos-mix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error((body as { error?: string }).error || "No se pudo crear el mix.");
      }
      setStatusMessage("Desarrollo mixto creado.");
      resetMixForm();
      setIsMixModalOpen(false);
      await loadHierarchy();
    } catch (error) {
      setMixFormError(error instanceof Error ? error.message : "Error desconocido al crear el mix.");
    } finally {
      setIsSubmittingMix(false);
    }
  }, [loadHierarchy, mixForm, resetMixForm]);

  const handleCreateMixItem = useCallback(async () => {
    if (!activeMixId) {
      setMixItemError("Selecciona primero el desarrollo mixto.");
      return;
    }
    if (!mixItemForm.desarrolloId) {
      setMixItemError("Selecciona un desarrollo para la sección.");
      return;
    }
    setIsSubmittingMixItem(true);
    setMixItemError(null);
    try {
      const response = await fetch("/api/crm/propiedad-desarrollos-mix-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mix_id: activeMixId,
          desarrollo_id: mixItemForm.desarrolloId,
          nombre: mixItemForm.nombre.trim() || undefined,
          modo: mixItemForm.modo,
          status: "disponible",
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error((body as { error?: string }).error || "No se pudo agregar la sección.");
      }
      setStatusMessage("Sección agregada al desarrollo mixto.");
      resetMixItemForm();
      setIsMixItemModalOpen(false);
      await loadHierarchy();
    } catch (error) {
      setMixItemError(
        error instanceof Error ? error.message : "Error desconocido al crear la sección.",
      );
    } finally {
      setIsSubmittingMixItem(false);
    }
  }, [activeMixId, loadHierarchy, mixItemForm.desarrolloId, mixItemForm.modo, mixItemForm.nombre, resetMixItemForm]);

  const handleSaveGeometry = useCallback(async () => {
    if (!geometryTarget) {
      setGeometryError("Selecciona el desarrollo, capa o unidad correspondiente.");
      return;
    }
    if (!formValues.geom) {
      setGeometryError("Dibuja un polígono válido antes de guardar.");
      return;
    }
    let parsed: GeoJsonGeometry;
    try {
      parsed = JSON.parse(formValues.geom);
    } catch {
      setGeometryError("La geometría no tiene un formato válido.");
      return;
    }
    const normalizedValue = JSON.stringify(parsed);
    let wkt: string;
    try {
      wkt = geoJsonToMultiPolygonZWkt(parsed);
    } catch (error) {
      setGeometryError(
        error instanceof Error ? error.message : "El polígono generado no es válido.",
      );
      return;
    }
    setFormValues((prev) => ({ ...prev, geom: normalizedValue }));
    setIsSavingGeometry(true);
    setGeometryError(null);
    setGeometryStatusMessage("Guardando polígono…");
    try {
      const isUpdate = Boolean(geometryTarget.poligonoId);
      const endpoint = isUpdate
        ? `/api/crm/propiedad-poligonos/${geometryTarget.poligonoId}`
        : "/api/crm/propiedad-poligonos";
      const payload: Record<string, unknown> = isUpdate
        ? { geom: wkt }
        : {
            target_type: geometryTarget.type,
            target_id: geometryTarget.id,
            geom: wkt,
          };
      const response = await fetch(endpoint, {
        method: isUpdate ? "PATCH" : "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          (body as { error?: string }).error || "No se pudo guardar el polígono.",
        );
      }
      const returnedPoligono = (body as { poligono?: { id?: string } }).poligono;
      if (!geometryTarget.poligonoId && returnedPoligono?.id) {
        setGeometryTarget((prev) =>
          prev ? { ...prev, poligonoId: returnedPoligono.id } : prev,
        );
      }
      handleNodeAction(`Polígono guardado para ${geometryTarget.label}.`);
      setGeometryStatusMessage("Polígono guardado correctamente.");
      setGeometryError(null);
      await loadHierarchy();
    } catch (error) {
      setGeometryStatusMessage(null);
      setGeometryError(
        error instanceof Error ? error.message : "Error desconocido al guardar la geometría.",
      );
    } finally {
      setIsSavingGeometry(false);
    }
  }, [formValues.geom, geometryTarget, handleNodeAction, loadHierarchy]);

  const STATUS_COLOR: Record<string, string> = {
    disponible: "text-emerald-600",
    apartado: "text-amber-500",
    vendido: "text-rose-500",
    reservado: "text-slate-400",
  };

  const getStatusLabelClass = (status: string | null) => {
    if (!status) return "text-slate-500";
    return STATUS_COLOR[status.toLowerCase()] ?? "text-slate-500";
  };

  const renderMixItems = (mix: DesarrolloNode) => {
    if (!mix.items?.length) {
      return <p className="text-[0.65rem] text-slate-400">No se han definido secciones aún.</p>;
    }
    return (
      <div className="space-y-2">
        {mix.items.map((item) => {
          const child = desarrolloMap.get(item.desarrollo_id);
          return (
            <div
              key={item.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-200 bg-slate-50/70 px-3 py-2 text-[0.65rem]"
            >
              <div className="space-y-1">
                <p className="text-xs font-semibold">
                  {child?.nombre || `Desarrollo ${item.desarrollo_id.slice(0, 4)}`}
                </p>
                <div className="flex flex-wrap items-center gap-2 text-slate-500">
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[0.6rem] text-slate-600">
                    {item.modo.toUpperCase()}
                  </span>
                  <span className={`font-semibold tracking-wide ${getStatusLabelClass(item.status)}`}>
                    {item.status ?? "sin status"}
                  </span>
                </div>
              </div>
              <div className="flex gap-1">
                {child && (
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-sm"
                    onClick={() => handleFocusDesarrolloById(child.id)}
                    aria-label={`Abrir desarrollo ${child.nombre}`}
                  >
                    <IconMapPin className="size-4" />
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderPolygonInfo = (geom?: { type: string; coordinates: unknown }) => (
    <div className="flex flex-wrap items-center gap-2 text-[0.65rem] text-slate-500">
      <IconMapPin className="size-4 text-slate-400" />
      <span>{geom?.type ? "Polígono guardado" : "Sin polígono"}</span>
    </div>
  );

  const PolygonContainer = ({
    geom,
    children,
  }: {
    geom?: { type: string; coordinates: unknown };
    children?: ReactNode;
  }) => (
    <div className="space-y-2 rounded border border-dashed border-slate-200 bg-slate-50/80 p-2">
      {renderPolygonInfo(geom)}
      {children}
    </div>
  );

  const renderUnidadRow = (desarrollo: DesarrolloNode, capa: CapaNode, unidad: UnidadNode) => {
    return (
      <div key={unidad.id} className="space-y-1 border-b border-dashed border-slate-200 pb-2 last:border-b-0">
        <div className="flex items-center justify-between gap-3 text-[0.75rem]">
          <div className="flex items-center gap-2">
            <IconSquares className="size-4 text-slate-400" />
            <div className="flex flex-col">
              <span className="font-semibold">{unidad.unidad || "Unidad sin clave"}</span>
              <span className="text-[0.6rem] uppercase tracking-[0.2em] text-slate-400">
                unidad
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1 text-slate-500">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => setTreePlusTarget({ type: "unidad", desarrollo, capa, unidad })}
              aria-label="Agregar características o polígono de la unidad"
            >
              <IconPlus className="size-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => handleSelectUnidadGeometry(desarrollo, capa, unidad)}
              aria-label="Editar polígono de la unidad"
            >
              <IconMapPin className="size-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => openEditUnidadModal(desarrollo, capa, unidad)}
              aria-label="Editar unidad"
            >
              <IconPencil className="size-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() =>
                handleDeleteNode({
                  type: "unidad",
                  id: unidad.id,
                  label: unidad.unidad || unidad.nombre || "unidad",
                  poligonoId: unidad.poligono_id ?? null,
                })
              }
              aria-label="Eliminar unidad"
              disabled={isDeletingNode}
            >
              <IconMinus className="size-4" />
            </Button>
          </div>
        </div>
        <PolygonContainer geom={unidad.geom} />
      </div>
    );
  };

  const renderCapaNode = (desarrollo: DesarrolloNode, capa: CapaNode) => {
    const isExpanded = expandedNodes[capa.id] ?? false;
    const capaLabel = capa.nombre || `Nivel ${capa.nivel ?? "?"}`;
    return (
      <div key={capa.id} className="space-y-2 border-b border-dashed border-slate-200 pb-3 last:border-b-0">
        <div className="flex items-center justify-between gap-3 text-[0.75rem]">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => toggleNodeExpansion(capa.id)}
              aria-label={isExpanded ? "Ocultar unidades" : "Mostrar unidades"}
            >
              {isExpanded ? <IconChevronDown className="size-4" /> : <IconChevronRight className="size-4" />}
            </Button>
            <div className="flex items-center gap-2">
              <IconLayersSelected className="size-4 text-slate-400" />
              <div className="flex flex-col">
                <span className="font-semibold">{capaLabel}</span>
                <span className="text-[0.6rem] uppercase tracking-[0.2em] text-slate-400">capa</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1 text-slate-500">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => setTreePlusTarget({ type: "capa", desarrollo, capa })}
              aria-label="Agregar características o polígono"
            >
              <IconPlus className="size-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => openEditCapaModal(desarrollo, capa)}
              aria-label="Editar capa"
            >
              <IconPencil className="size-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() =>
                handleDeleteNode({
                  type: "capa",
                  id: capa.id,
                  label: capaLabel,
                  poligonoId: capa.poligono_id ?? null,
                })
              }
              aria-label="Eliminar capa"
              disabled={isDeletingNode}
            >
              <IconMinus className="size-4" />
            </Button>
          </div>
        </div>
        {isExpanded && (
          <PolygonContainer geom={capa.geom}>
            <div className="space-y-2 border-l border-dashed border-slate-200 pl-5">
              {capa.unidades?.length ? (
                capa.unidades.map((unidad) => renderUnidadRow(desarrollo, capa, unidad))
              ) : (
                <p className="text-[0.65rem] text-slate-400">Sin unidades aún</p>
              )}
            </div>
          </PolygonContainer>
        )}
      </div>
    );
  };

  const renderDesarrolloNode = (desarrollo: DesarrolloNode) => {
    const isExpanded = expandedNodes[desarrollo.id] ?? true;
    return (
      <div key={desarrollo.id} className="space-y-2 border-b border-dashed border-slate-200 pb-4 last:border-b-0">
        <div className="flex items-center justify-between gap-3 text-[0.85rem]">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => toggleNodeExpansion(desarrollo.id)}
              aria-label={isExpanded ? "Ocultar capas" : "Mostrar capas"}
            >
              {isExpanded ? <IconChevronDown className="size-4" /> : <IconChevronRight className="size-4" />}
            </Button>
            <div className="flex items-center gap-2">
              <IconBuilding className="size-4 text-slate-400" />
              <div className="flex flex-col">
                <span className="font-semibold">{desarrollo.nombre}</span>
                <span className="text-[0.6rem] uppercase tracking-[0.3em] text-slate-400">
                  {desarrollo.tipo || "horizontal"}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1 text-slate-500">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => setTreePlusTarget({ type: "desarrollo", desarrollo })}
              aria-label="Agregar características o polígono"
            >
              <IconPlus className="size-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => handleSelectDesarrolloGeometry(desarrollo)}
              aria-label="Editar polígono del desarrollo"
            >
              <IconMapPin className="size-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => openEditDesarrollo(desarrollo)}
              aria-label="Editar desarrollo"
            >
              <IconPencil className="size-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() =>
                handleDeleteNode({
                  type: "desarrollo",
                  id: desarrollo.id,
                  label: desarrollo.nombre,
                  poligonoId: desarrollo.poligono_id ?? null,
                })
              }
              aria-label="Eliminar desarrollo"
              disabled={isDeletingNode}
            >
              <IconMinus className="size-4" />
            </Button>
          </div>
        </div>
        {isExpanded && (
          <PolygonContainer geom={desarrollo.geom}>
            {desarrollo.tipo === "mixto" && (
              <div className="space-y-1 text-[0.65rem] text-slate-400">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-slate-600">Secciones mixtas</span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => openMixItemModal(desarrollo.id)}
                  >
                    Agregar sección
                  </Button>
                </div>
                {renderMixItems(desarrollo)}
              </div>
            )}
            <div className="space-y-3 border-l border-dashed border-slate-200 pl-5">
              {desarrollo.capas?.length ? (
                desarrollo.capas.map((capa) => renderCapaNode(desarrollo, capa))
              ) : (
                <p className="text-[0.65rem] text-slate-400">Sin capas aún</p>
              )}
            </div>
          </PolygonContainer>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      <section className="lg:w-[420px]">
        <div className="flex h-full flex-col gap-3 rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-lg font-semibold text-slate-900">Creación de desarrollos</p>
              <p className="text-xs text-slate-500">
                Crea o edita la ficha de cada desarrollo, sus capas y sus unidades antes de dibujar la geometría.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => openDesarrolloModal("horizontal")}>
                Horizontal
              </Button>
              <Button variant="outline" size="sm" onClick={() => openDesarrolloModal("vertical")}>
                Vertical
              </Button>
              <Button variant="outline" size="sm" onClick={() => setIsMixModalOpen(true)}>
                Mixto
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setIsImportModalOpen(true)}>
                Importar CSV
              </Button>
              <Button size="sm" onClick={loadHierarchy} disabled={isHierarchyLoading}>
                {isHierarchyLoading ? "Actualizando…" : "Actualizar"}
              </Button>
            </div>
          </div>
          <div className="space-y-1 text-[0.7rem] text-slate-500">
            <p>La jerarquía se ordena de mayor a menor: desarrollo → capa/nivel → unidad.</p>
            <p>Usa el árbol para inspeccionar cada nodo, elige los iconos pequeños para acciones rápidas y mantén el foco en el polígono correspondiente.</p>
          </div>
          {statusMessage && <span className="text-xs text-slate-500">{statusMessage}</span>}
          {hierarchyError && <span className="text-xs text-rose-500">{hierarchyError}</span>}
          <ScrollArea className="max-h-[520px] rounded-xl border border-slate-200 bg-white/60">
            <div className="space-y-3 p-2">
              {isHierarchyLoading ? (
                <p className="text-[0.7rem] text-slate-400">Cargando jerarquía...</p>
              ) : rootDevelopments.length ? (
                rootDevelopments.map(renderDesarrolloNode)
              ) : (
                <p className="text-[0.7rem] text-slate-400">No hay desarrollos registrados aún.</p>
              )}
            </div>
          </ScrollArea>
        </div>
      </section>

      <section className="lg:flex-1">
        <Card className="h-full flex flex-col">
      <CardHeader>
        <CardTitle>Mapa y capas</CardTitle>
        <CardDescription className="text-xs">
          El panel derecho es el canvas de capas: dibuja, edita y visualiza la geometría antes de
          publicarla.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 flex-1">
            <PropiedadGeomEditor
              value={formValues.geom}
              onGeometryChange={handleGeometryChange}
              features={hierarchyFeatures}
              highlightId={geometryTarget?.id ?? undefined}
            />
        <div className="space-y-2">
            {geometryTarget ? (
              <p className="text-[0.65rem] text-slate-500">
                Dibujando el polígono de
                {geometryTarget.type === "unidad"
                  ? " la unidad "
                  : geometryTarget.type === "capa"
                    ? " la capa "
                    : " el desarrollo "}
                <strong>{geometryTarget.label}</strong>. Finaliza el trazo y pulsa Guardar para
                publicarlo.
              </p>
            ) : (
              <p className="text-[0.65rem] text-slate-500">
                Selecciona un desarrollo o una capa y haz clic en “Editar polígono” para comenzar a
                dibujar.
              </p>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                onClick={handleSaveGeometry}
                disabled={!geometryTarget || !formValues.geom || isSavingGeometry}
              >
                {isSavingGeometry
                  ? "Guardando…"
                  : geometryTarget?.type === "capa"
                    ? "Guardar polígono de la capa"
                    : "Guardar polígono del desarrollo"}
              </Button>
            {geometryStatusMessage && (
              <span className="text-[0.65rem] text-emerald-600">{geometryStatusMessage}</span>
            )}
          </div>
          {geometryError && (
            <p className="text-[0.65rem] text-rose-500">{geometryError}</p>
          )}
        </div>
        <p className="text-[0.65rem] text-slate-500">
          Usa los controles para añadir o ajustar la capa y revisar la forma antes de guardar.
        </p>
      </CardContent>
    </Card>
  </section>

      <Dialog
        open={Boolean(treePlusTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setTreePlusTarget(null);
          }
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {treePlusTarget
                ? treePlusTarget.type === "desarrollo"
                  ? `¿Qué deseas hacer con ${treePlusTarget.desarrollo.nombre}?`
                  : treePlusTarget.type === "capa"
                    ? `¿Qué deseas hacer con ${treePlusTarget.capa.nombre ?? "esta capa"}?`
                    : `¿Qué deseas hacer con ${treePlusTarget.unidad.unidad || "esta unidad"}?`
                : "¿Qué deseas hacer?"}
            </DialogTitle>
            <DialogDescription>
              Elige si quieres agregar/editar las características dependientes o preparar el polígono.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full justify-start"
              onClick={() => handleTreePlusChoice("caracteristicas")}
            >
              {getTreePrimaryActionLabel(treePlusTarget)}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full justify-start"
              onClick={() => handleTreePlusChoice("poligono")}
            >
              Dibujar o actualizar polígono
            </Button>
          </div>
          <DialogFooter className="pt-4">
            <Button type="button" variant="ghost" size="sm" onClick={() => setTreePlusTarget(null)}>
              Cancelar
            </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>

  <Dialog
    open={isImportModalOpen}
    onOpenChange={(open) => {
      setIsImportModalOpen(open);
      if (!open) {
        setImportFile(null);
        setImportFileName(null);
        setImportStatus("idle");
        setImportError(null);
        setImportResult(null);
      }
    }}
  >
    <DialogContent className="max-w-2xl">
      <DialogHeader>
        <DialogTitle>Importar jerarquía inmobiliaria</DialogTitle>
        <DialogDescription>
          Descarga la plantilla mínima si quieres empezar rápido. El CSV solo necesita
          <span className="font-semibold text-slate-700">
            entidad, grupo, nombre, status y poligono
          </span>;
          el tipo de desarrollo vive en <code>tipo_desarrollo</code> y el tipo de unidad en
          <code>tipo_unidad_nombre</code>. Para unidades, <code>area_m2</code> es opcional pero conviene
          mandarlo como columna. Los extras no operativos van al final en columnas como
          <code>metadata_cuartos</code> y <code>metadata_patio_servicio</code>.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-3 pt-2">
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={handleDownloadImportTemplate}>
            <IconDownload className="mr-2 h-4 w-4" />
            Descargar plantilla mínima
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={handleDownloadPropertyExport}>
            <IconDownload className="mr-2 h-4 w-4" />
            Descargar datos actuales
          </Button>
        </div>
        <div className="space-y-1">
          <Label className="text-[0.7rem]">Archivo CSV</Label>
          <input
            type="file"
            accept=".csv,text/csv"
            className="text-xs text-slate-500"
            onChange={handleImportFileChange}
          />
          {importFileName && (
            <p className="text-[0.65rem] text-slate-500">Archivo listo: {importFileName}</p>
          )}
        </div>
        <p className="text-[0.65rem] text-slate-500">
          Si ya tienes un CSV propio, basta con respetar la plantilla mínima. También puedes
          descargar los datos actuales con la misma estructura para usarlos como base. Las columnas de
          volumen 3D son <code>height</code>, <code>min_height</code>, <code>levels</code> y <code>color</code>.
          La altura de capa sigue siendo <code>altura</code> y solo aplica a <code>propiedad_capas</code>.
          Si necesitas mandar extras no operativos, agrega columnas <code>metadata_*</code> al final; si lo
          consultas o filtras seguido, mejor conviértelo en columna normal.
        </p>
        {importError && <p className="text-xs text-rose-500">{importError}</p>}
        {importStatus === "success" && importResult && (
          <p className="text-xs text-emerald-600">{importResult}</p>
        )}
      </div>
      <DialogFooter className="flex gap-2 pt-4">
        <Button variant="ghost" size="sm" onClick={() => setIsImportModalOpen(false)}>
          Cerrar
        </Button>
        <Button variant="outline" size="sm" onClick={handleDownloadImportTemplate}>
          <IconDownload className="mr-2 h-4 w-4" />
          Plantilla
        </Button>
        <Button
          size="sm"
          onClick={handleRunImport}
          disabled={!importFile || importStatus === "submitting"}
        >
          {importStatus === "submitting" ? "Importando…" : "Importar CSV"}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>

      <Dialog
        open={isDesarrolloModalOpen}
        onOpenChange={(open) => {
          setIsDesarrolloModalOpen(open);
          if (!open) {
            resetDesarrolloForm();
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {isEditingDesarrollo
                ? "Editar desarrollo"
                : `Nuevo desarrollo ${desarrolloForm.tipo}`}
            </DialogTitle>
            <DialogDescription>
              Define los metadatos del desarrollo antes de dibujar el plano correspondiente.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-[0.7rem]">Nombre</Label>
              <Input
                value={desarrolloForm.nombre}
                onChange={(event) => handleDesarrolloField("nombre", event.target.value)}
                placeholder="Ej. Torre Miramar"
              />
            </div>
            <div className="text-xs font-medium uppercase tracking-[0.4em] text-slate-500">
              {desarrolloForm.tipo}
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-[0.7rem]">País</Label>
                <Input
                  value={desarrolloForm.paisCodigo}
                  onChange={(event) =>
                    handleDesarrolloField("paisCodigo", event.target.value.toUpperCase())
                  }
                  placeholder="MX"
                  maxLength={3}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[0.7rem]">Código postal</Label>
                <Input
                  value={desarrolloForm.codigoPostal}
                  onChange={(event) => handleDesarrolloField("codigoPostal", event.target.value)}
                  placeholder="Ej. 01210"
                />
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-[0.7rem]">Estado</Label>
                <Select
                  value={desarrolloForm.estadoCve || undefined}
                  onValueChange={(value) => handleDesarrolloField("estadoCve", value)}
                >
                  <SelectTrigger size="sm">
                    <SelectValue placeholder="Selecciona un estado" />
                  </SelectTrigger>
                  <SelectContent>
                  {estadoOptions.map((option, index) => (
                    <SelectItem
                      key={`${option.value}-${option.label}-${index}`}
                      value={option.value}
                    >
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-[0.7rem]">Municipio</Label>
                <Select
                  value={desarrolloForm.municipioCve || undefined}
                  onValueChange={(value) => handleDesarrolloField("municipioCve", value)}
                >
                  <SelectTrigger size="sm">
                    <SelectValue placeholder="Selecciona un municipio" />
                  </SelectTrigger>
                  <SelectContent>
                    {desarrolloMunicipioOptions.map((option, index) => (
                      <SelectItem
                        key={`${option.value}-${option.label}-${index}`}
                        value={option.value}
                      >
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {locationError && <p className="text-xs text-rose-500">{locationError}</p>}
            <div className="space-y-1">
              <Label className="text-[0.7rem]">Descripción</Label>
              <Textarea
                value={desarrolloForm.descripcion}
                onChange={(event) => handleDesarrolloField("descripcion", event.target.value)}
                className="text-sm"
              />
            </div>
            {desarrolloFormError && (
              <p className="text-xs text-rose-500">{desarrolloFormError}</p>
            )}
          </div>
          <DialogFooter className="flex gap-2 pt-4">
            <Button
              variant="ghost"
              onClick={() => {
                setIsDesarrolloModalOpen(false);
                resetDesarrolloForm();
              }}
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={handleSaveDesarrollo}
              disabled={isSubmittingDesarrollo}
            >
              {isSubmittingDesarrollo
                ? isEditingDesarrollo
                  ? "Actualizando…"
                  : "Guardando…"
                : isEditingDesarrollo
                  ? "Actualizar desarrollo"
                  : "Guardar desarrollo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isMixModalOpen}
        onOpenChange={(open) => {
          setIsMixModalOpen(open);
          if (!open) {
            resetMixForm();
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nuevo desarrollo mixto</DialogTitle>
            <DialogDescription>
              Define el contenedor mixto antes de agregar secciones horizontales o verticales.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-[0.7rem]">Nombre</Label>
              <Input
                value={mixForm.nombre}
                onChange={(event) => handleMixField("nombre", event.target.value)}
                placeholder="Desarrollo mixto"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[0.7rem]">Descripción</Label>
              <Textarea
                value={mixForm.descripcion}
                onChange={(event) => handleMixField("descripcion", event.target.value)}
                className="text-sm"
              />
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-[0.7rem]">Estado</Label>
                <Select
                  value={mixForm.estadoCve || undefined}
                  onValueChange={(value) => handleMixField("estadoCve", value)}
                >
                  <SelectTrigger size="sm">
                    <SelectValue placeholder="Selecciona un estado" />
                  </SelectTrigger>
                  <SelectContent>
                  {estadoOptions.map((option, index) => (
                    <SelectItem
                      key={`${option.value}-${option.label}-${index}`}
                      value={option.value}
                    >
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
              <div className="space-y-1">
                <Label className="text-[0.7rem]">Municipio</Label>
                <Select
                  value={mixForm.municipioCve || undefined}
                  onValueChange={(value) => handleMixField("municipioCve", value)}
                >
                  <SelectTrigger size="sm">
                    <SelectValue placeholder="Selecciona un municipio" />
                  </SelectTrigger>
                  <SelectContent>
                    {mixMunicipioOptions.map((option, index) => (
                      <SelectItem
                        key={`${option.value}-${option.label}-${index}`}
                        value={option.value}
                      >
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-[0.7rem]">Código postal</Label>
                <Input
                  value={mixForm.codigoPostal}
                  onChange={(event) => handleMixField("codigoPostal", event.target.value)}
                  placeholder="Ej. 11540"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[0.7rem]">Colonia</Label>
                <Input
                  value={mixForm.colonia}
                  onChange={(event) => handleMixField("colonia", event.target.value)}
                />
              </div>
            </div>
            {mixFormError && <p className="text-xs text-rose-500">{mixFormError}</p>}
          </div>
          <DialogFooter className="flex gap-2 pt-4">
            <Button
              variant="ghost"
              onClick={() => {
                setIsMixModalOpen(false);
                resetMixForm();
              }}
            >
              Cancelar
            </Button>
            <Button size="sm" onClick={handleCreateMix} disabled={isSubmittingMix}>
              {isSubmittingMix ? "Creando…" : "Guardar mixto"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isMixItemModalOpen}
        onOpenChange={(open) => {
          setIsMixItemModalOpen(open);
          if (!open) {
            resetMixItemForm();
            setActiveMixId(null);
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nueva sección del mixto</DialogTitle>
            <DialogDescription>
              Vincula un desarrollo horizontal o vertical y define el modo.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-[0.7rem]">Desarrollo</Label>
              <Select
                value={mixItemForm.desarrolloId || undefined}
                onValueChange={(value) => handleMixItemField("desarrolloId", value)}
              >
                <SelectTrigger size="sm">
                  <SelectValue placeholder={availableChildDevelopments.length ? "Selecciona un desarrollo" : "No hay desarrollos disponibles"} />
                </SelectTrigger>
                <SelectContent>
                  {availableChildDevelopments.map((node) => (
                    <SelectItem key={node.id} value={node.id}>
                      {node.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-[0.7rem]">Modo</Label>
              <Select
                value={mixItemForm.modo}
                onValueChange={(value) => handleMixItemField("modo", value)}
              >
                <SelectTrigger size="sm">
                  <SelectValue placeholder="Selecciona un modo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="horizontal">Horizontal</SelectItem>
                  <SelectItem value="vertical">Vertical</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-[0.7rem]">Nombre opcional</Label>
              <Input
                value={mixItemForm.nombre}
                onChange={(event) => handleMixItemField("nombre", event.target.value)}
                placeholder="Título interno"
              />
            </div>
            {mixItemError && <p className="text-xs text-rose-500">{mixItemError}</p>}
          </div>
          <DialogFooter className="flex gap-2 pt-4">
            <Button variant="ghost" onClick={() => setIsMixItemModalOpen(false)}>
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={handleCreateMixItem}
              disabled={!availableChildDevelopments.length || isSubmittingMixItem}
            >
              {isSubmittingMixItem ? "Guardando…" : "Agregar sección"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={isCapaModalOpen}
        onOpenChange={(open) => {
          setIsCapaModalOpen(open);
          if (!open) {
            resetCapaForm();
          }
        }}
      >
        <DialogContent className="max-w-md">
        <DialogHeader>
            <DialogTitle>
              {editingCapa
                ? "Editar capa"
                : duplicatingCapa
                  ? "Duplicar capa"
                  : "Crear capa"}{" "}
              para {creatingCapaFor ? `"${creatingCapaFor.nombre}"` : "este desarrollo"}
            </DialogTitle>
            <DialogDescription>
              {editingCapa ? (
                "Actualiza los metadatos de esta capa. La geometría se edita desde el mapa."
              ) : duplicatingCapa ? (
                <>
                  Se copiará la geometría del nivel <strong>{duplicatingCapa.nombre}</strong>,
                  puedes ajustar los metadatos antes de guardar el nuevo plano.
                </>
              ) : (
                "Define nivel, altura de capa y descripción antes de dibujar el polígono que representa este plano intermedio en el mapa."
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-[0.7rem]">Nombre de la capa</Label>
              <Input
                value={capaForm.nombre}
                onChange={(event) => handleCapaField("nombre", event.target.value)}
                placeholder="Ej. Planta baja, Manzana A"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[0.7rem]">Estado</Label>
              <Select
                value={capaForm.status}
                onValueChange={(value) => handleCapaField("status", value)}
              >
                <SelectTrigger size="sm">
                  <SelectValue placeholder="Selecciona un estado" />
                </SelectTrigger>
                <SelectContent>
                  {CAPA_STATUS_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {creatingCapaFor?.tipo === "vertical" && (
              <>
                {!duplicatingCapa && (
                  <div className="space-y-1">
                    <Label className="text-[0.7rem]">Nivel</Label>
                    <Input
                      value={capaForm.nivel}
                      onChange={(event) => handleCapaField("nivel", event.target.value)}
                      placeholder="Ej. 1"
                      type="number"
                      min={0}
                    />
                  </div>
                )}
                <div className="space-y-1">
                  <Label className="text-[0.7rem]">
                    Altura de capa (m)
                  </Label>
                  <Input
                    value={capaForm.altura}
                    onChange={(event) => handleCapaField("altura", event.target.value)}
                    placeholder="Ej. 3.5"
                    type="number"
                    step="0.01"
                    min={0}
                  />
                </div>
                <p className="text-[0.65rem] text-muted-foreground">
                  Este valor describe la altura del plano de la capa. El volumen 3D del
                  polígono se controla con `height`, `min_height`, `levels` y `color`.
                </p>
                {duplicatingCapa && (
                  <div className="space-y-1">
                    <Label className="text-[0.7rem]">Niveles a generar</Label>
                    <Input
                      value={capaForm.copias}
                      onChange={(event) => handleCapaField("copias", event.target.value)}
                      placeholder="Ej. 3"
                      type="number"
                      min={1}
                    />
                  </div>
                )}
              </>
            )}
            <div className="space-y-1">
              <Label className="text-[0.7rem]">Descripción</Label>
              <Textarea
                value={capaForm.descripcion}
                onChange={(event) => handleCapaField("descripcion", event.target.value)}
                className="text-sm"
              />
            </div>
            {capaFormError && <p className="text-xs text-rose-500">{capaFormError}</p>}
          </div>
          <DialogFooter className="flex gap-2 pt-4">
            <Button
              variant="ghost"
              onClick={() => {
                setIsCapaModalOpen(false);
                resetCapaForm();
              }}
            >
              Cancelar
            </Button>
            <Button size="sm" onClick={handleCreateCapa} disabled={isSubmittingCapa}>
              {isSubmittingCapa
                ? editingCapa
                  ? "Actualizando…"
                  : "Guardando…"
                : editingCapa
                  ? "Actualizar capa"
                  : "Guardar capa"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={isUnidadModalOpen}
        onOpenChange={(open) => {
          setIsUnidadModalOpen(open);
          if (!open) {
            resetUnidadForm();
            setCreatingUnidadFor(null);
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingUnidad ? "Editar unidad" : "Crear unidad"} para{" "}
              {creatingUnidadFor ? `"${creatingUnidadFor.capa.nombre || `Nivel ${creatingUnidadFor.capa.nivel ?? "?"}`}"` : "este nivel"}
            </DialogTitle>
            <DialogDescription>
              {editingUnidad
                ? "Actualiza los datos comerciales de esta unidad y guarda el resultado."
                : "Captura el inventario comercial y dibuja el polígono correspondiente antes de guardar."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-[0.7rem]">Clave de unidad</Label>
                <Input
                  value={unidadForm.unidad}
                  onChange={(event) => handleUnidadField("unidad", event.target.value)}
                  placeholder="Ej. A101"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[0.7rem]">Nombre comercial</Label>
                <Input
                  value={unidadForm.nombre}
                  onChange={(event) => handleUnidadField("nombre", event.target.value)}
                  placeholder="Ej. Departamento A"
                />
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-[0.7rem]">Tipo comercial</Label>
                <Select
                  value={unidadForm.tipoId || undefined}
                  onValueChange={(value) => handleUnidadField("tipoId", value)}
                >
                  <SelectTrigger size="sm">
                    <SelectValue placeholder="Selecciona un tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    {tipos.map((option) => (
                      <SelectItem key={option.id} value={option.id}>
                        {option.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-[0.7rem]">Status</Label>
                <Select
                  value={unidadForm.status}
                  onValueChange={(value) => handleUnidadField("status", value as UnidadStatus)}
                >
                  <SelectTrigger size="sm">
                    <SelectValue placeholder="Selecciona un status" />
                  </SelectTrigger>
                  <SelectContent>
                    {UNIDAD_STATUS_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-[0.7rem]">Precio</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={unidadForm.precio}
                  onChange={(event) => handleUnidadField("precio", event.target.value)}
                  placeholder="Ej. 3500000"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[0.7rem]">Área (m²)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={unidadForm.area}
                  onChange={(event) => handleUnidadField("area", event.target.value)}
                  placeholder="Ej. 90"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-[0.7rem]">Línea de negocio</Label>
                <Select
                  value={unidadForm.lineaId || "__none"}
                  onValueChange={(value) =>
                    handleUnidadField("lineaId", value === "__none" ? "" : value)
                  }
                >
                <SelectTrigger size="sm">
                  <SelectValue placeholder="Selecciona una línea (opcional)" />
                </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">Sin línea</SelectItem>
                    {lineas.map((option) => (
                      <SelectItem key={option.id} value={option.id}>
                        {option.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
              </Select>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-[0.7rem]">Familia</Label>
                <Select
                  value={unidadForm.familiaId || "__none"}
                  onValueChange={(value) =>
                    handleUnidadField("familiaId", value === "__none" ? "" : value)
                  }
                >
                  <SelectTrigger size="sm">
                    <SelectValue placeholder="Selecciona una familia (opcional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">Sin familia</SelectItem>
                    {familias.map((option) => (
                      <SelectItem key={option.id} value={option.id}>
                        {option.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-[0.7rem]">Modelo</Label>
                <Select
                  value={unidadForm.modeloId || "__none"}
                  onValueChange={(value) =>
                    handleUnidadField("modeloId", value === "__none" ? "" : value)
                  }
                >
                  <SelectTrigger size="sm">
                    <SelectValue placeholder="Selecciona un modelo (opcional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">Sin modelo</SelectItem>
                    {modelos.map((option) => (
                      <SelectItem key={option.id} value={option.id}>
                        {option.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-[0.7rem]">Descripción</Label>
              <Textarea
                value={unidadForm.descripcion}
                onChange={(event) => handleUnidadField("descripcion", event.target.value)}
                className="text-sm"
              />
            </div>
            {unidadFormError && <p className="text-xs text-rose-500">{unidadFormError}</p>}
          </div>
          <DialogFooter className="flex gap-2 pt-4">
            <Button
              variant="ghost"
              onClick={() => {
                setIsUnidadModalOpen(false);
                resetUnidadForm();
                setCreatingUnidadFor(null);
              }}
            >
              Cancelar
            </Button>
            <Button size="sm" onClick={handleCreateUnidad} disabled={isSubmittingUnidad}>
              {isSubmittingUnidad ? "Guardando…" : "Guardar unidad"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
