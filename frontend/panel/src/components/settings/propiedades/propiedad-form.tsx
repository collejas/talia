"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
  geom: { type: string; coordinates: unknown };
};

type CapaNode = {
  id: string;
  nombre: string | null;
  nivel: number | null;
  altura: number | null;
  status: string | null;
  metadata: Record<string, unknown>;
  geom: { type: string; coordinates: unknown };
  unidades: UnidadNode[];
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
  geom: { type: string; coordinates: unknown };
  capas: CapaNode[];
};

type GeometryTarget = {
  type: "desarrollo";
  id: string;
  label: string;
};

type GeoFeature = {
  id: string;
  geometry: { type: string; coordinates: unknown };
  properties?: Record<string, unknown>;
};

type GeoJsonGeometry = {
  type: string;
  coordinates: unknown;
};

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
  void lineas;
  void familias;
  void modelos;
  void tipos;
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

  const handleDesarrolloField = useCallback(
    (field: keyof typeof desarrolloForm, value: string) => {
      setDesarrolloForm((prev) => ({ ...prev, [field]: value }));
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

  const handleNodeAction = useCallback((message: string) => {
    setStatusMessage(message);
  }, []);

  const handleSelectGeometryTarget = useCallback((desarrollo: DesarrolloNode) => {
    setGeometryTarget({
      type: "desarrollo",
      id: desarrollo.id,
      label: desarrollo.nombre,
    });
    setFormValues((prev) => ({
      ...prev,
      geom: desarrollo.geom ? JSON.stringify(desarrollo.geom) : "",
    }));
    setGeometryError(null);
    setGeometryStatusMessage(null);
  }, []);

  const [hierarchy, setHierarchy] = useState<DesarrolloNode[]>([]);
  const [isHierarchyLoading, setIsHierarchyLoading] = useState(false);
  const [hierarchyError, setHierarchyError] = useState<string | null>(null);
  const [estadoOptions, setEstadoOptions] = useState<LocationOption[]>([]);
  const [municipioOptions, setMunicipioOptions] = useState<LocationOption[]>([]);
  const [locationError, setLocationError] = useState<string | null>(null);

  const hierarchyFeatures = useMemo(() => {
    const features: GeoFeature[] = [];
    hierarchy.forEach((desarrollo) => {
      if (!desarrollo.geom?.type || !desarrollo.geom?.coordinates) {
        return;
      }
      features.push({
        id: desarrollo.id,
        geometry: desarrollo.geom,
        properties: {
          nombre: desarrollo.nombre,
          tipo: desarrollo.tipo,
        },
      });
    });
    return features;
  }, [hierarchy]);

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
    const selected = hierarchy.find((node) => node.id === geometryTarget.id);
    if (!selected) {
      return;
    }
    setFormValues((prev) => ({
      ...prev,
      geom: selected.geom ? JSON.stringify(selected.geom) : "",
    }));
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
      setMunicipioOptions([]);
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
          setMunicipioOptions(options);
        }
      })
      .catch((error) => {
        console.error("Error cargando municipios:", error);
        if (mounted) {
          setLocationError(error instanceof Error ? error.message : "Error cargando municipios.");
          setMunicipioOptions([]);
        }
      });
    return () => {
      mounted = false;
    };
  }, [desarrolloForm.estadoCve]);

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

  const handleSaveGeometry = useCallback(async () => {
    if (!geometryTarget) {
      setGeometryError("Selecciona un desarrollo antes de guardar.");
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
      const response = await fetch(`/api/crm/propiedad-desarrollos/${geometryTarget.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ geom: wkt }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          (body as { error?: string }).error || "No se pudo guardar el polígono.",
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

  const renderUnidad = (unidad: UnidadNode) => (
    <div
      key={unidad.id}
      className="flex items-center justify-between rounded border border-slate-200 bg-slate-50/60 px-3 py-2 text-[0.7rem]"
    >
      <div>
        <p className="text-xs font-medium">{unidad.unidad || "Sin unidad"}</p>
        <p className="text-[0.6rem] text-slate-500">
          {unidad.precio ? `$${unidad.precio.toLocaleString("es-MX")}` : "Precio pendiente"}
        </p>
      </div>
      <div className="text-right text-[0.65rem] font-semibold tracking-wide">
        <span className={getStatusLabelClass(unidad.status)}>{unidad.status ?? "sin status"}</span>
      </div>
      <div className="flex gap-1">
        <Button variant="ghost" size="sm" onClick={() => handleNodeAction(`Editar unidad ${unidad.unidad}`)}>
          Editar
        </Button>
        <Button variant="ghost" size="sm" onClick={() => handleNodeAction(`Eliminar unidad ${unidad.unidad}`)}>
          Eliminar
        </Button>
      </div>
    </div>
  );

  const renderCapa = (capa: CapaNode) => (
    <div key={capa.id} className="space-y-2 rounded border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold">
            {capa.nombre || `Nivel ${capa.nivel ?? "?"}`}
          </p>
          <p className="text-xs text-slate-500">
            Altura {capa.altura ?? "—"} m
          </p>
        </div>
        <div className="flex gap-1">
          <Button variant="outline" size="sm" onClick={() => handleNodeAction(`Agregar unidad al nivel ${capa.nombre}`)}>
            Nueva unidad
          </Button>
          <Button variant="ghost" size="sm" onClick={() => handleNodeAction(`Editar nivel ${capa.nombre}`)}>
            Editar
          </Button>
        </div>
      </div>
      <div className="space-y-1">
        {capa.unidades?.length ? (
          capa.unidades.map(renderUnidad)
        ) : (
          <p className="text-[0.6rem] text-slate-400">Sin unidades aún</p>
        )}
      </div>
    </div>
  );

  const renderDesarrollo = (desarrollo: DesarrolloNode) => (
    <div key={desarrollo.id} className="space-y-3 rounded border border-slate-200 bg-slate-50/40 p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-base font-semibold">{desarrollo.nombre}</p>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-500">{desarrollo.tipo}</p>
        </div>
      <div className="flex gap-1">
        <Button variant="outline" size="sm" onClick={() => handleNodeAction(`Nueva capa para ${desarrollo.nombre}`)}>
          Nueva capa
        </Button>
        <Button
          variant={geometryTarget?.id === desarrollo.id ? "secondary" : "outline"}
          size="sm"
          onClick={() => handleSelectGeometryTarget(desarrollo)}
        >
          Editar polígono
        </Button>
        <Button variant="ghost" size="sm" onClick={() => openEditDesarrollo(desarrollo)}>
          Editar
        </Button>
      </div>
      </div>
      <div className="space-y-2">
        {desarrollo.capas?.length ? desarrollo.capas.map(renderCapa) : <p className="text-[0.6rem] text-slate-400">Sin capas aún</p>}
      </div>
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>{desarrollo.capas?.length ?? 0} capas</span>
        <span>{desarrollo.capas?.reduce((count, capa) => count + (capa.unidades?.length ?? 0), 0)} unidades</span>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      <section className="lg:w-[420px]">
        <Card className="h-full space-y-4">
          <CardHeader>
            <div>
              <CardTitle className="text-lg">Jerarquía de desarrollos</CardTitle>
              <CardDescription className="text-xs">
                Crea o edita la ficha de cada desarrollo, sus capas y sus unidades antes de dibujar la geometría.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setIsDesarrolloModalOpen(true)}>
                Nuevo desarrollo
              </Button>
              <Button size="sm" onClick={loadHierarchy} disabled={isHierarchyLoading}>
                {isHierarchyLoading ? "Actualizando…" : "Actualizar"}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 text-xs">
            <div className="space-y-1 text-[0.7rem] text-slate-500">
              <p>La jerarquía se ordena de mayor a menor: desarrollo → capa/nivel → unidad.</p>
              <p>Abre un popup para cada nodo antes de dibujar su correspondiente polígono en el mapa.</p>
            </div>
            {statusMessage && <span className="text-xs text-slate-500">{statusMessage}</span>}
            {hierarchyError && <span className="text-xs text-rose-500">{hierarchyError}</span>}
            <div className="space-y-3 max-h-[520px] overflow-y-auto pr-1">
              {isHierarchyLoading ? (
                <p className="text-[0.7rem] text-slate-400">Cargando jerarquía...</p>
              ) : hierarchy.length ? (
                hierarchy.map(renderDesarrollo)
              ) : (
                <p className="text-[0.7rem] text-slate-400">No hay desarrollos registrados aún.</p>
              )}
            </div>
        </CardContent>
      </Card>
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
              Dibujando el polígono del desarrollo <strong>{geometryTarget.label}</strong>. Finaliza
              el trazo y pulsa Guardar para publicarlo.
            </p>
          ) : (
            <p className="text-[0.65rem] text-slate-500">
              Selecciona un desarrollo y haz clic en “Editar polígono” para comenzar a dibujar.
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              onClick={handleSaveGeometry}
              disabled={!geometryTarget || !formValues.geom || isSavingGeometry}
            >
              {isSavingGeometry ? "Guardando…" : "Guardar polígono del desarrollo"}
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
            <DialogTitle>{isEditingDesarrollo ? "Editar desarrollo" : "Nuevo desarrollo"}</DialogTitle>
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
            <div className="space-y-1">
              <Label className="text-[0.7rem]">Tipo de desarrollo</Label>
              <RadioGroup
                value={desarrolloForm.tipo}
                onValueChange={(value) => handleDesarrolloField("tipo", value)}
                className="flex gap-2"
              >
                <RadioGroupItem value="horizontal">Horizontal</RadioGroupItem>
                <RadioGroupItem value="vertical">Vertical</RadioGroupItem>
              </RadioGroup>
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
                    {estadoOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
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
                    {municipioOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
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
    </div>
  );
}
