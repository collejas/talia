"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";

const STATUS_COLORS = {
  disponible: "#2ECC71",
  apartado: "#F1C40F",
  vendido: "#E74C3C",
  reservado: "#9B59B6",
};

const DEFAULT_CENTER = [19.4326, -99.1332];
const TILE_SOURCE = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";

export function PropertyMap() {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const osmbRef = useRef(null);
  const layerRef = useRef(null);

  const [features, setFeatures] = useState([]);
  const [tipos, setTipos] = useState([]);
  const [nivelFilter, setNivelFilter] = useState("");
  const [tipoFilter, setTipoFilter] = useState("");
  const [viewMode, setViewMode] = useState("3d");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [leaflet, setLeaflet] = useState(null);
  const [osmbReady, setOsmbReady] = useState(false);
  const selectedIdRef = useRef(selectedId);

  const nivelOptions = useMemo(() => {
    const niveles = new Set();
    for (const feature of features) {
      const value = feature?.properties?.nivel;
      if (typeof value === "number") {
        niveles.add(value);
      }
    }
    return Array.from(niveles).sort((a, b) => a - b);
  }, [features]);

  const filteredFeatures = useMemo(() => {
    return features.filter((feature) => {
      if (nivelFilter) {
        const levelValue = feature?.properties?.nivel;
        if (String(levelValue) !== nivelFilter) {
          return false;
        }
      }
      if (tipoFilter && feature?.properties?.tipo_id) {
        if (feature.properties.tipo_id !== tipoFilter) {
          return false;
        }
      }
      return true;
    });
  }, [features, nivelFilter, tipoFilter]);

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  const getFeatureColor = useCallback((feature) => {
    const props = feature?.properties;
    if (!props) {
      return "#95A5A6";
    }
    return props.wallColor ?? STATUS_COLORS[props.status ?? ""] ?? "#95A5A6";
  }, []);

  const applyLayerStyle = useCallback(
    (layerInstance, feature) => {
      const props = feature?.properties;
      if (!props) {
        return;
      }
      const color = getFeatureColor(feature);
      const isSelected = String(feature.id ?? "") === selectedIdRef.current;
      layerInstance.setStyle({
        color,
        weight: isSelected ? 4 : 2,
        fillColor: color,
        fillOpacity: isSelected ? 0.55 : 0.45,
      });
    },
    [getFeatureColor],
  );


  useEffect(() => {
    let cancelled = false;
    import("leaflet")
      .then((mod) => {
        if (cancelled) return;
        setLeaflet(mod?.default ?? mod);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current || !leaflet) {
      return;
    }
    const map = leaflet.map(mapContainerRef.current, {
      center: DEFAULT_CENTER,
      zoom: 16,
      zoomControl: true,
      preferCanvas: true,
    });
    mapInstanceRef.current = map;
    leaflet.tileLayer(TILE_SOURCE, {
      attribution: "&copy; OpenStreetMap contributors",
    }).addTo(map);

    const layer = leaflet.geoJSON([], {
      style: () => ({
        color: "#000000",
        weight: 2,
        fillOpacity: 0.45,
      }),
      onEachFeature: (feature, layerInstance) => {
        layerInstance.on("click", () => {
          const props = feature?.properties;
          if (props) {
            layerInstance.bindPopup(
              `<strong>${props.nombre ?? "Propiedad"}</strong><br>${props.status ?? ""}`,
            );
            layerInstance.openPopup();
            setSelectedId(String(feature?.id ?? ""));
          }
        });
        layerInstance.on("mouseover", () => {
          const highlightWeight = (layerInstance.options?.weight ?? 2) + 2;
          layerInstance.setStyle({ weight: highlightWeight, fillOpacity: 0.7 });
        });
        layerInstance.on("mouseout", () => {
          applyLayerStyle(layerInstance, feature);
        });
      },
    });
    layerRef.current = layer;
    layer.addTo(map);

    return () => {
      map.remove();
      layerRef.current?.clearLayers();
    };
  }, [leaflet, applyLayerStyle]);

  useEffect(() => {
    if (!mapInstanceRef.current) {
      return;
    }
    let cancelled = false;
    import("osmbuildings/dist/OSMBuildings-Leaflet.js").then(() => {
        if (cancelled || !mapInstanceRef.current) {
          return;
        }
        const globalContext = typeof window !== "undefined" ? window : globalThis;
        const constructor = globalContext.OSMBuildings;
        if (!constructor) {
          return;
        }
        const osmb = new constructor(mapInstanceRef.current, {
          position: "bottomright",
          minZoom: 15,
          maxZoom: 21,
        });
        osmb.hide();
      osmbRef.current = osmb;
      setOsmbReady(true);
    });
    return () => {
      cancelled = true;
      osmbRef.current?.hide();
      setOsmbReady(false);
    };
  }, []);

  useEffect(() => {
    if (!osmbRef.current) {
      return;
    }
    if (viewMode === "3d") {
      osmbRef.current.show();
    } else {
      osmbRef.current.hide();
    }
  }, [viewMode]);

  useEffect(() => {
    const controller = new AbortController();

    const params = new URLSearchParams();
    if (nivelFilter) {
      params.set("nivel", nivelFilter);
    }
    if (tipoFilter) {
      params.set("tipo_id", tipoFilter);
    }

    setLoading(true);
    setError(null);

    const query = params.toString();
    const endpoint = `/api/crm/propiedades/geojson${query ? `?${query}` : ""}`;

    fetch(endpoint, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body.error || "Error al obtener propiedades");
        }
        return response.json();
      })
      .then((data) => {
        setFeatures(data?.features ?? []);
        if (controller.signal.aborted) return;
        setLoading(false);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setError(err.message || "No se pudo obtener las propiedades");
        setLoading(false);
      });

    return () => {
      controller.abort();
    };
  }, [nivelFilter, tipoFilter]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/crm/propiedades/tipos")
      .then(async (response) => {
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body.error || "Error al leer tipos");
        }
        return response.json();
      })
      .then((tiposData) => {
        if (cancelled) return;
        setTipos(tiposData);
      })
      .catch(() => {
        if (cancelled) return;
        setTipos([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!layerRef.current) {
      return;
    }
    const processed = filteredFeatures.map((feature) => {
      const baseColor = feature?.properties?.tipo_color || STATUS_COLORS[feature?.properties?.status] || "#95A5A6";
      return {
        ...feature,
        properties: {
          ...feature.properties,
          wallColor: baseColor,
          roofColor: baseColor,
          height: Number(feature.properties?.height ?? 0),
          min_height: Number(feature.properties?.min_height ?? 0),
          levels: Number(feature.properties?.levels ?? 0),
        },
      };
    });

    const payload = { type: "FeatureCollection", features: processed };
    if (osmbReady && osmbRef.current) {
      osmbRef.current.setData(payload);
      if (viewMode === "3d") {
        osmbRef.current.show();
      } else {
        osmbRef.current.hide();
      }
    }

    layerRef.current.clearLayers();
    layerRef.current.addData(payload);
    layerRef.current.eachLayer((layer) => {
      if (layer.feature) {
        applyLayerStyle(layer, layer.feature);
      }
    });

    if (processed.length && mapInstanceRef.current && leaflet) {
      const bounds = leaflet.geoJSON(payload).getBounds();
      if (bounds.isValid()) {
        mapInstanceRef.current.fitBounds(bounds, { padding: [40, 40], maxZoom: 19 });
      }
    }
  }, [filteredFeatures, viewMode, selectedId, leaflet, applyLayerStyle, osmbReady]);

  const zoomToFeature = useCallback(
    (feature) => {
      if (!mapInstanceRef.current || !leaflet) {
        return;
      }
      const bounds = leaflet.geoJSON(feature).getBounds();
      if (bounds.isValid()) {
        mapInstanceRef.current.fitBounds(bounds, { padding: [30, 30], maxZoom: 19 });
      }
    },
    [leaflet],
  );

  const centerAllFeatures = useCallback(() => {
    if (!mapInstanceRef.current || !leaflet || !filteredFeatures.length) {
      return;
    }
    const bounds = leaflet
      .geoJSON({ type: "FeatureCollection", features: filteredFeatures })
      .getBounds();
    if (bounds.isValid()) {
      mapInstanceRef.current.fitBounds(bounds, { padding: [40, 40], maxZoom: 19 });
    }
  }, [filteredFeatures, leaflet]);

  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      <aside className="w-full rounded-md border border-slate-200 bg-white/60 p-4 shadow-sm shadow-slate-900/5 backdrop-blur dark:border-slate-800 dark:bg-slate-950/60 lg:w-80">
        <div className="flex flex-col gap-4">
          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700 dark:text-slate-200">
              Filtrar por nivel
            </label>
            <select
              className="w-full rounded border border-slate-200 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
              value={nivelFilter}
              onChange={(event) => setNivelFilter(event.target.value)}
            >
              <option value="">Todos</option>
              {nivelOptions.map((nivel) => (
                <option key={nivel} value={nivel}>
                  Nivel {nivel}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700 dark:text-slate-200">
              Filtrar por tipo
            </label>
            <select
              className="w-full rounded border border-slate-200 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
              value={tipoFilter}
              onChange={(event) => setTipoFilter(event.target.value)}
            >
              <option value="">Todos</option>
              {tipos.map((tipo) => (
                <option key={tipo.id} value={tipo.id}>
                  {tipo.nombre}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-3 text-sm font-semibold text-slate-700 dark:text-slate-200">
            <button
              type="button"
              className={`rounded-md px-3 py-1 ${
                viewMode === "3d"
                  ? "border border-slate-900 bg-slate-900 text-white"
                  : "border border-slate-200 bg-white text-slate-700"
              }`}
              onClick={() => setViewMode("3d")}
            >
              3D
            </button>
            <button
              type="button"
              className={`rounded-md px-3 py-1 ${
                viewMode === "planta"
                  ? "border border-slate-900 bg-slate-900 text-white"
                  : "border border-slate-200 bg-white text-slate-700"
              }`}
              onClick={() => setViewMode("planta")}
            >
              Planta
            </button>
            <button
              type="button"
              className={`rounded-md px-3 py-1 border ${
                filteredFeatures.length && leaflet
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-200 bg-slate-100 text-slate-400"
              }`}
              disabled={!filteredFeatures.length || !leaflet}
              onClick={centerAllFeatures}
            >
              Centrar todo
            </button>
          </div>
          <div className="text-sm text-slate-500 dark:text-slate-300">
            {loading
              ? "Cargando propiedades..."
              : error
              ? error
              : `${filteredFeatures.length} propiedades mostrando`}
          </div>
          <div className="space-y-2">
            {filteredFeatures.map((feature) => {
              const props = feature.properties;
              if (!props) {
                return null;
              }
              const active = String(feature.id ?? "") === selectedId;
              const baseColor = props.tipo_color || STATUS_COLORS[props.status || ""] || "#888";
              return (
                <button
                  key={feature.id ?? JSON.stringify(props)}
                  type="button"
                  className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm ${
                    active
                      ? "border border-slate-900 bg-slate-900 text-white"
                      : "border border-slate-200 bg-white text-slate-700 hover:border-slate-400"
                  }`}
                  onClick={() => {
                    setSelectedId(String(feature.id ?? ""));
                    zoomToFeature(feature);
                  }}
                >
                  <div>
                    <div className="font-semibold">{props.nombre || "Propiedad"}</div>
                    <div className="text-[0.65rem] text-slate-500 dark:text-slate-400">
                      {props.status?.toUpperCase() || "Estado desconocido"}
                    </div>
                  </div>
                  <span
                    className="h-4 w-4 rounded-full border border-slate-300"
                    style={{ backgroundColor: baseColor }}
                  />
                </button>
              );
            })}
          </div>
        </div>
      </aside>
      <section className="relative flex-1">
        <div
          ref={mapContainerRef}
          className="h-[600px] w-full rounded-md border border-slate-200 bg-white/10 shadow-sm shadow-slate-900/10"
        />
      </section>
    </div>
  );
}
