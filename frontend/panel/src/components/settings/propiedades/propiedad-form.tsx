"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardTitle, CardHeader, CardDescription } from "@/components/ui/card";
import { PropiedadGeomEditor } from "@/components/settings/propiedades/propiedad-geom-editor";

type CatalogOption = {
  id: string;
  nombre: string;
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
  pais_codigo: string | null;
  estado_cve: string | null;
  municipio_cve: string | null;
  codigo_postal: string | null;
  colonia: string | null;
  metadata: Record<string, unknown>;
  geom: { type: string; coordinates: unknown };
  capas: CapaNode[];
};

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
  void lineas;
  void familias;
  void modelos;
  void tipos;
  const handleGeometryChange = useCallback((value?: string) => {
    setFormValues((prev) => ({ ...prev, geom: value ?? "" }));
  }, []);

  const [hierarchy, setHierarchy] = useState<DesarrolloNode[]>([]);
  const [isHierarchyLoading, setIsHierarchyLoading] = useState(false);
  const [hierarchyError, setHierarchyError] = useState<string | null>(null);

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
        data.features.filter((feature): feature is DesarrolloNode => feature && typeof feature === "object"),
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

  useEffect(() => {
    loadHierarchy();
  }, [loadHierarchy]);

  const handleNodeAction = useCallback((message: string) => {
    setStatusMessage(message);
  }, []);

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
        <Button variant="ghost" size="xs" onClick={() => handleNodeAction(`Editar unidad ${unidad.unidad}`)}>
          Editar
        </Button>
        <Button variant="ghost" size="xs" onClick={() => handleNodeAction(`Eliminar unidad ${unidad.unidad}`)}>
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
          <Button variant="outline" size="xs" onClick={() => handleNodeAction(`Agregar unidad al nivel ${capa.nombre}`)}>
            Nueva unidad
          </Button>
          <Button variant="ghost" size="xs" onClick={() => handleNodeAction(`Editar nivel ${capa.nombre}`)}>
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
          <Button variant="outline" size="xs" onClick={() => handleNodeAction(`Nueva capa para ${desarrollo.nombre}`)}>
            Nueva capa
          </Button>
          <Button variant="ghost" size="xs" onClick={() => handleNodeAction(`Editar desarrollo ${desarrollo.nombre}`)}>
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
              <Button variant="outline" size="sm" onClick={() => handleNodeAction("Abrir popup para nuevo desarrollo")}>
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
            <PropiedadGeomEditor value={formValues.geom} onGeometryChange={handleGeometryChange} />
            <p className="text-[0.65rem] text-slate-500">
              Usa los controles para añadir o ajustar la capa y revisar la forma antes de guardar.
            </p>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
