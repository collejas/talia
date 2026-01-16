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

function resolveRegionKey(feature) {
  if (!feature || typeof feature !== "object") {
    return "";
  }
  const props = feature.properties || {};
  const candidates = [
    props.dataset_key,
    props.cvegeo,
    props.cve_ent,
    props.cve_entidad,
    props.iso_a2,
    props.ISO_A2,
    props.iso_a3,
    props.ISO_A3,
    props.id,
    props.name,
  ];
  const value = candidates.find(
    (candidate) => typeof candidate === "string" && candidate.trim().length,
  );
  if (!value) return "";
  return value.trim().toUpperCase();
}

function normalizeValue(value) {
  if (typeof value !== "number" || Number.isNaN(value) || !Number.isFinite(value)) {
    return 0;
  }
  return value;
}

function buildChoroplethColor(value, max = 5000) {
  const clamped = Math.min(normalizeValue(value), max);
  const ratio = max > 0 ? clamped / max : 0;
  const hue = 130 - ratio * 80;
  const light = 70 - ratio * 20;
  return `hsl(${hue}, 70%, ${light}%)`;
}

export function PropertyMap() {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const osmbRef = useRef(null);
  const layerRef = useRef(null);

  const [features, setFeatures] = useState([]);
  const [tipos, setTipos] = useState([]);
  const [nivelFilter, setNivelFilter] = useState("");
  const [tipoFilter, setTipoFilter] = useState("");
  const [viewMode] = useState("3d");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [leaflet, setLeaflet] = useState(null);
  const [osmbReady, setOsmbReady] = useState(false);
  const [pitch, setPitch] = useState(45);
  const [bearing, setBearing] = useState(0);
  const selectedIdRef = useRef(selectedId);
  const hierarchyLayerRef = useRef(null);
  const markersLayerRef = useRef(null);
  const [mapLevel, setMapLevel] = useState("pais");
  const [demografiaGeojson, setDemografiaGeojson] = useState(null);
  const [demografiaDataset, setDemografiaDataset] = useState([]);
  const [selectedStateKey, setSelectedStateKey] = useState(null);
  const [selectedMunicipioKey, setSelectedMunicipioKey] = useState(null);
  const [hoveredRegionKey, setHoveredRegionKey] = useState(null);
  const [activeMarkerFeature, setActiveMarkerFeature] = useState(null);

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

  const datasetMap = useMemo(() => {
    const map = new Map();
    for (const entry of demografiaDataset) {
      if (!entry || !entry.key) continue;
      map.set(entry.key.toString().toUpperCase(), entry);
    }
    return map;
  }, [demografiaDataset]);

  const mapLevelLabel = mapLevel === "pais" ? "México" : mapLevel === "estado" ? "Estado" : "Municipio";
  const currentDatasetEntry =
    mapLevel === "estado"
      ? datasetMap.get((selectedStateKey ?? "").toString().toUpperCase())
      : mapLevel === "municipio"
      ? datasetMap.get((selectedMunicipioKey ?? "").toString().toUpperCase())
      : null;
  const levelSummaryLabel = currentDatasetEntry
    ? `${currentDatasetEntry.name} · ${currentDatasetEntry.total_visitas ?? 0} visitas`
    : mapLevel === "pais"
    ? "México"
    : "Selecciona un polígono";

  const applyRegionStyle = useCallback(
    (layerInstance, feature) => {
      if (!layerInstance?.setStyle) return;
      const key = resolveRegionKey(feature);
      const entry = datasetMap.get(key);
      const total =
        (entry?.total_visitas ?? 0) +
        (entry?.leads_total ?? 0) +
        (entry?.visitantes_total ?? 0);
      const color = buildChoroplethColor(total);
      const isActive =
        (mapLevel === "estado" && selectedStateKey === key) ||
        (mapLevel === "municipio" && selectedMunicipioKey === key);
      layerInstance.setStyle({
        color: "#0f172a",
        weight: isActive ? 3 : 1,
        fillColor: color,
        fillOpacity: hoveredRegionKey === key ? 0.85 : 0.6,
      });
    },
    [datasetMap, hoveredRegionKey, mapLevel, selectedMunicipioKey, selectedStateKey],
  );

  const handleRegionClick = useCallback(
    (feature) => {
      const key = resolveRegionKey(feature);
      if (!key) return;
      if (mapLevel === "pais") {
        setMapLevel("estado");
        setSelectedStateKey(null);
        setSelectedMunicipioKey(null);
      } else if (mapLevel === "estado") {
        setSelectedStateKey(key);
        setSelectedMunicipioKey(null);
        setMapLevel("municipio");
      } else if (mapLevel === "municipio") {
        setSelectedMunicipioKey(key);
      }
    },
    [mapLevel],
  );

  const handleRegionHover = useCallback((feature) => {
    const key = resolveRegionKey(feature);
    setHoveredRegionKey(key);
  }, []);

  const handleRegionOut = useCallback(() => {
    setHoveredRegionKey(null);
  }, []);

  const applyRegionStyleRef = useRef(applyRegionStyle);
  useEffect(() => {
    applyRegionStyleRef.current = applyRegionStyle;
  }, [applyRegionStyle]);

  const handleRegionClickRef = useRef(handleRegionClick);
  useEffect(() => {
    handleRegionClickRef.current = handleRegionClick;
  }, [handleRegionClick]);

  const handleRegionHoverRef = useRef(handleRegionHover);
  useEffect(() => {
    handleRegionHoverRef.current = handleRegionHover;
  }, [handleRegionHover]);

  const handleRegionOutRef = useRef(handleRegionOut);
  useEffect(() => {
    handleRegionOutRef.current = handleRegionOut;
  }, [handleRegionOut]);

  const handleBackLevel = useCallback(() => {
    if (mapLevel === "municipio") {
      setMapLevel("estado");
      setSelectedMunicipioKey(null);
      return;
    }
    if (mapLevel === "estado") {
      setMapLevel("pais");
      setSelectedStateKey(null);
    }
  }, [mapLevel]);

  const fetchDemografiaLevel = useCallback(async (nivel, estadoKey) => {
    try {
      if (typeof window === "undefined") {
        return;
      }
      const url = new URL("/api/crm/demografia/mapa", window.location.origin);
      url.searchParams.set("nivel", nivel);
      if (nivel === "municipio" && estadoKey) {
        url.searchParams.set("estado", estadoKey);
      }
      const response = await fetch(url.toString(), { cache: "no-store" });
      if (!response.ok) {
        throw new Error("No se pudo cargar el mapa demográfico");
      }
      const payload = await response.json();
      if (!payload?.ok) {
        throw new Error(payload?.error || "Demografía respondió error");
      }
      setDemografiaDataset(payload.dataset ?? []);
      setDemografiaGeojson(payload.geojson ?? null);
    } catch (err) {
      console.error("Error cargando el mapa demográfico:", err);
    }
  }, []);


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

    const hierarchyLayer = leaflet.geoJSON([], {
      onEachFeature: (feature, layerInstance) => {
        layerInstance.on("click", () => handleRegionClickRef.current?.(feature));
        layerInstance.on("mouseover", () => handleRegionHoverRef.current?.(feature));
        layerInstance.on("mouseout", () => handleRegionOutRef.current?.());
        applyRegionStyleRef.current?.(layerInstance, feature);
      },
    });
    hierarchyLayerRef.current = hierarchyLayer;
    hierarchyLayer.addTo(map);

    const markersLayer = leaflet.layerGroup();
    markersLayerRef.current = markersLayer;
    markersLayer.addTo(map);

    return () => {
      map.remove();
      layerRef.current?.clearLayers();
    };
  }, [leaflet, applyLayerStyle]);

  useEffect(() => {
    const estadoKey = mapLevel === "municipio" ? selectedStateKey : undefined;
    fetchDemografiaLevel(mapLevel, estadoKey);
  }, [fetchDemografiaLevel, mapLevel, selectedStateKey]);

  useEffect(() => {
    if (!hierarchyLayerRef.current || !demografiaGeojson) {
      return;
    }
    hierarchyLayerRef.current.clearLayers();
    hierarchyLayerRef.current.addData(demografiaGeojson);
    if (!leaflet || !mapInstanceRef.current) {
      return;
    }
    try {
      const bounds = leaflet.geoJSON(demografiaGeojson).getBounds();
      if (bounds.isValid()) {
        mapInstanceRef.current.fitBounds(bounds, { padding: [30, 30], maxZoom: 7 });
      }
    } catch {
      // ignore invalid bounds
    }
  }, [demografiaGeojson, leaflet]);

  useEffect(() => {
    if (!hierarchyLayerRef.current) {
      return;
    }
    hierarchyLayerRef.current.eachLayer((layer) => {
      if (layer.feature) {
        applyRegionStyleRef.current?.(layer, layer.feature);
      }
    });
  }, [mapLevel, hoveredRegionKey, selectedMunicipioKey, selectedStateKey]);

  useEffect(() => {
    if (!markersLayerRef.current || !leaflet) {
      return;
    }
    markersLayerRef.current.clearLayers();
    if (mapLevel !== "municipio") {
      return;
    }
    for (const feature of filteredFeatures) {
      const bounds = leaflet.geoJSON(feature).getBounds();
      if (!bounds.isValid()) {
        continue;
      }
      const center = bounds.getCenter();
      const color = getFeatureColor(feature);
      const marker = leaflet.circleMarker(center, {
        radius: 6,
        color,
        fillColor: color,
        fillOpacity: 0.9,
        weight: 2,
      });
      marker.bindTooltip(
        `${feature.properties?.nombre ?? "Propiedad"} - ${feature.properties?.status ?? ""}`,
      );
      marker.on("click", () => {
        setSelectedId(String(feature.id ?? ""));
        setActiveMarkerFeature(feature);
      });
      markersLayerRef.current.addLayer(marker);
    }
  }, [filteredFeatures, leaflet, mapLevel, getFeatureColor]);

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
    if (!osmbReady || !osmbRef.current) {
      return;
    }
    try {
      if (typeof osmbRef.current.setPitch === "function") {
        osmbRef.current.setPitch(pitch);
      }
      if (typeof osmbRef.current.setRotation === "function") {
        osmbRef.current.setRotation(bearing);
      } else if (typeof osmbRef.current.setAzimuth === "function") {
        osmbRef.current.setAzimuth(bearing);
      }
    } catch {
      /* ignore */
    }
  }, [bearing, osmbReady, pitch]);

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
      if (!mapInstanceRef.current || !leaflet || !mapContainerRef.current) {
        return;
      }
      const bounds = leaflet.geoJSON(feature).getBounds();
      if (bounds.isValid()) {
        mapInstanceRef.current.fitBounds(bounds, { padding: [30, 30], maxZoom: 19 });
      }
    },
    [leaflet],
  );

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
          <div className="text-xs text-slate-500">Explore los niveles y seleccione un desarrollo.</div>
          <div className="space-y-1 text-xs text-slate-500">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-[0.65rem]">
                {`Nivel: ${mapLevelLabel}`}
              </span>
              <button
                type="button"
                onClick={handleBackLevel}
                disabled={mapLevel === "pais"}
                className={`rounded border px-2 py-1 text-[0.65rem] ${
                  mapLevel === "pais"
                    ? "border-slate-200 text-slate-400"
                    : "border-slate-900 text-slate-900"
                }`}
              >
                Volver
              </button>
            </div>
            <div>{levelSummaryLabel}</div>
            {activeMarkerFeature && (
              <div className="text-[0.65rem] text-slate-600">
                Desarrollo seleccionado: {activeMarkerFeature.properties?.nombre}
              </div>
            )}
          </div>
          {osmbReady && (
            <div className="space-y-2 text-xs text-slate-600 dark:text-slate-300">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-[0.65rem]">Pitch 3D</span>
                <span className="text-[0.65rem] font-mono">{pitch}°</span>
              </div>
              <input
                className="h-2 w-full appearance-none rounded-full bg-slate-200 accent-slate-900"
                type="range"
                min="0"
                max="75"
                value={pitch}
                onChange={(event) => setPitch(Number(event.target.value))}
              />
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-[0.65rem]">Rotación</span>
                <span className="text-[0.65rem] font-mono">{bearing}°</span>
              </div>
              <input
                className="h-2 w-full appearance-none rounded-full bg-slate-200 accent-slate-900"
                type="range"
                min="-180"
                max="180"
                value={bearing}
                onChange={(event) => setBearing(Number(event.target.value))}
              />
            </div>
          )}
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
