"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import "mapbox-gl/dist/mapbox-gl.css";

const STATUS_COLORS = {
  disponible: "#2ECC71",
  apartado: "#F1C40F",
  vendido: "#E74C3C",
  reservado: "#9B59B6",
};

const DEFAULT_CENTER = [-99.1332, 19.4326];
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

function collectCoordinates(coord, callback) {
  if (!Array.isArray(coord)) {
    return;
  }
  if (typeof coord[0] === "number" && typeof coord[1] === "number") {
    callback(coord[0], coord[1]);
    return;
  }
  for (const item of coord) {
    collectCoordinates(item, callback);
  }
}

function getGeometryBounds(geometry) {
  if (!geometry || typeof geometry !== "object") {
    return null;
  }
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;
  collectCoordinates(geometry.coordinates, (lng, lat) => {
    minLng = Math.min(minLng, lng);
    minLat = Math.min(minLat, lat);
    maxLng = Math.max(maxLng, lng);
    maxLat = Math.max(maxLat, lat);
  });
  if (minLng === Infinity || minLat === Infinity) {
    return null;
  }
  return { minLng, minLat, maxLng, maxLat };
}

function getFeatureCenter(feature) {
  const bounds = getGeometryBounds(feature?.geometry);
  if (!bounds) {
    return null;
  }
  return [(bounds.minLng + bounds.maxLng) / 2, (bounds.minLat + bounds.maxLat) / 2];
}

function ensureStatusColors(feature) {
  if (!feature || typeof feature !== "object") {
    return feature;
  }
  const props = feature.properties || {};
  if (!props.color) {
    props.color = STATUS_COLORS[(props.status ?? "").toLowerCase()] ?? "#95A5A6";
  }
  if (!props.status_color) {
    props.status_color = STATUS_COLORS[(props.status ?? "").toLowerCase()] ?? "#95A5A6";
  }
  feature.properties = props;
  return feature;
}

function buildHierarchy(features) {
  const devMap = new Map();
  for (const feature of features) {
    const props = feature?.properties ?? {};
    const devId = props.desarrollo_id ?? props.desarrollo_nombre ?? props.nombre ?? "sin-desarrollo";
    const devName = props.desarrollo_nombre ?? props.desarrollo_tipo ?? "Desarrollo";
    if (!devMap.has(devId)) {
      devMap.set(devId, { id: devId, name: devName, capas: new Map() });
    }
    const dev = devMap.get(devId);
    if (!dev) continue;
    const capaNombre = props.capa_nombre ?? `Capa ${props.nivel ?? "0"}`;
    const capaKey = `${capaNombre}:${props.nivel ?? ""}`;
    if (!dev.capas.has(capaKey)) {
      dev.capas.set(capaKey, {
        id: capaKey,
        name: capaNombre,
        units: [],
      });
    }
    const capa = dev.capas.get(capaKey);
    if (!capa) continue;
    const status = (props.status ?? "").toLowerCase();
    const statusColor = props.status_color ?? STATUS_COLORS[status] ?? STATUS_COLORS.disponible;
    capa.units.push({
      id: feature.id,
      name: props.nombre ?? props.unidad ?? "Unidad",
      feature,
      color: statusColor,
    });
  }
  return Array.from(devMap.values())
    .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""))
    .map((dev) => ({
      id: dev.id,
      name: dev.name,
      capas: Array.from(dev.capas.values()).sort((a, b) =>
        (a.name ?? "").localeCompare(b.name ?? ""),
      ),
    }));
}

export function PropertyMap() {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const osmbRef = useRef(null);
  const layerRef = useRef(null);
  const mapboxContainerRef = useRef(null);
  const mapboxInstanceRef = useRef(null);

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
  const [pitch, setPitch] = useState(60);
  const [bearing, setBearing] = useState(0);
  const selectedIdRef = useRef(selectedId);
  const hierarchyLayerRef = useRef(null);
  const markersLayerRef = useRef(null);
  const [mapLevel, setMapLevel] = useState("pais");
  const [demografiaGeojson, setDemografiaGeojson] = useState(null);
  const [demografiaDataset, setDemografiaDataset] = useState([]);
  const [demografiaLevel, setDemografiaLevel] = useState("pais");
  const [selectedStateKey, setSelectedStateKey] = useState(null);
  const [selectedMunicipioKey, setSelectedMunicipioKey] = useState(null);
  const [hoveredRegionKey, setHoveredRegionKey] = useState(null);
  const [activeMarkerFeature, setActiveMarkerFeature] = useState(null);
  const [mapboxActive, setMapboxActive] = useState(false);
  const [mapboxFeature, setMapboxFeature] = useState(null);
  const [expandedDevIds, setExpandedDevIds] = useState(() => new Set());
  const [expandedCapas, setExpandedCapas] = useState(new Set());
  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

  const logMapboxEvent = useCallback((payload, label = "event") => {
    if (!payload) return;
    fetch("/api/mapbox/depura", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-mapbox-msg": label,
      },
      body: JSON.stringify(payload),
    }).catch(() => {
      // ignore logging failures
    });
  }, []);

  const waitForMapboxInstance = useCallback(() => {
    return new Promise((resolve) => {
      const check = () => {
        const candidate =
          (typeof window !== "undefined" && window.__mapboxInstance) ?? mapboxInstanceRef.current;
        if (candidate) {
          resolve(candidate);
          return;
        }
        setTimeout(check, 250);
      };
      check();
    });
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.waitForMapboxPayload = async (forcedPayload) => {
      const map = await waitForMapboxInstance();
      const source = map.getSource("propiedad-3d");
      console.log("Mapbox before forced payload", source?._data);
      if (forcedPayload && source && typeof source.setData === "function") {
        source.setData(forcedPayload);
        map.fitBounds(
          [
            [-109.73834533, 23.00161481],
            [-109.73770243, 23.0023697],
          ],
          { padding: 30, maxZoom: 19 },
        );
      }
      console.log("Mapbox after forced payload", source?._data);
    };
  }, [waitForMapboxInstance]);

  const mapboxFeatureRef = useRef(null);
  const pendingMapboxFeatureRef = useRef(null);

  useEffect(() => {
    mapboxFeatureRef.current = mapboxFeature;
  }, [mapboxFeature]);

  const sendFeatureToMapbox = useCallback(
    (feature) => {
      if (!feature || !mapboxActive) {
        logMapboxEvent(
          { step: "send-failure", reason: "inactive", featureId: feature?.id ?? null },
          "send-failure",
        );
        return false;
      }
      const map = mapboxInstanceRef.current;
      if (!map) {
        logMapboxEvent(
          { step: "send-failure", reason: "no-map", featureId: feature?.id ?? null },
          "send-failure",
        );
        return false;
      }
      const source = map.getSource("propiedad-3d");
      if (!source || typeof source.setData !== "function") {
        logMapboxEvent(
          { step: "send-failure", reason: "no-source", featureId: feature?.id ?? null },
          "send-failure",
        );
        return false;
      }
      const enrichedFeature = ensureStatusColors({ ...feature });
      const payload = {
        type: "FeatureCollection",
        features: [enrichedFeature],
      };
      source.setData(payload);
      const bounds = getGeometryBounds(feature.geometry);
      const applyCamera = () => {
        try {
          map.setPitch(pitch);
          map.setBearing(bearing);
        } catch {
          /* ignore */
        }
      };
      const applyFit = () => {
        if (bounds && map.isStyleLoaded()) {
          map.fitBounds(
            [
              [bounds.minLng, bounds.minLat],
              [bounds.maxLng, bounds.maxLat],
            ],
            { padding: 40, maxZoom: 19 },
          );
          applyCamera();
        }
      };
      if (bounds && map.isStyleLoaded()) {
        map.fitBounds(
          [
            [bounds.minLng, bounds.minLat],
            [bounds.maxLng, bounds.maxLat],
          ],
          { padding: 30, maxZoom: 19 },
        );
        applyCamera();
      } else {
        map.once("styledata", applyFit);
        map.once("idle", applyFit);
      }
      logMapboxEvent(
        {
          feature,
          bounds,
          timestamp: new Date().toISOString(),
        },
        "set-data",
      );
      return true;
    },
    [logMapboxEvent, mapboxActive, pitch, bearing],
  );

  useEffect(() => {
    if (!mapboxActive) {
      pendingMapboxFeatureRef.current = null;
      return;
    }
    const targetFeature = mapboxFeature ?? pendingMapboxFeatureRef.current;
    if (!targetFeature) {
      return;
    }
    if (!sendFeatureToMapbox(targetFeature)) {
      pendingMapboxFeatureRef.current = targetFeature;
    } else {
      pendingMapboxFeatureRef.current = null;
    }
  }, [mapboxActive, mapboxFeature, sendFeatureToMapbox]);

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

  const hierarchyTree = useMemo(() => buildHierarchy(filteredFeatures), [filteredFeatures]);

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  const getFeatureColor = useCallback((feature) => {
    const props = feature?.properties;
    if (!props) {
      return "#95A5A6";
    }
    const statusColor =
      (typeof props.status_color === "string" && props.status_color) ||
      STATUS_COLORS[props.status ?? ""] ||
      "#95A5A6";
    return props.color ?? props.wallColor ?? statusColor;
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

  const mapboxProps = mapboxFeature?.properties ?? null;
  const mapboxStatusLabel =
    typeof mapboxProps?.status === "string" ? mapboxProps.status.toUpperCase() : null;
  const mapboxPriceLabel =
    mapboxProps?.precio != null
      ? new Intl.NumberFormat("es-MX", {
          style: "currency",
          currency: "MXN",
          maximumFractionDigits: 0,
        }).format(Number(mapboxProps.precio))
      : "Sin precio";
  const mapboxAreaLabel =
    mapboxProps?.area_m2 != null ? `${Number(mapboxProps.area_m2)} m²` : "Sin área registrada";
  const mapboxLevelsLabel =
    (mapboxProps?.levels ?? mapboxProps?.altura ?? mapboxProps?.height) != null
      ? `${Number(mapboxProps?.levels ?? mapboxProps?.altura ?? mapboxProps?.height)} niveles`
      : "Niveles no definidos";
  const mapboxCatalogLabel = [
    mapboxProps?.linea_nombre ? `Línea ${mapboxProps.linea_nombre}` : null,
    mapboxProps?.familia_nombre ? `Familia ${mapboxProps.familia_nombre}` : null,
    mapboxProps?.modelo_nombre ? `Modelo ${mapboxProps.modelo_nombre}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const mapboxLocationLabel = mapboxProps
    ? [
        mapboxProps.pais_codigo ? `País ${mapboxProps.pais_codigo}` : null,
        mapboxProps.estado_cve ? `Estado ${mapboxProps.estado_cve}` : null,
        mapboxProps.municipio_cve ? `Municipio ${mapboxProps.municipio_cve}` : null,
        mapboxProps.colonia ? mapboxProps.colonia : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : null;

  const activeFeatureProps = activeMarkerFeature?.properties ?? null;
  const activeDevelopmentSummary = (() => {
    if (!activeFeatureProps) {
      return null;
    }
    if (typeof activeFeatureProps.desarrollo_nombre === "string") {
      return `${activeFeatureProps.desarrollo_nombre}${
        typeof activeFeatureProps.desarrollo_tipo === "string"
          ? ` · ${activeFeatureProps.desarrollo_tipo}`
          : ""
      }`;
    }
    return typeof activeFeatureProps.nombre === "string" ? activeFeatureProps.nombre : null;
  })();
  const activeLocationSummary = activeFeatureProps
    ? [
        typeof activeFeatureProps.pais_codigo === "string"
          ? `País ${activeFeatureProps.pais_codigo}`
          : null,
        typeof activeFeatureProps.estado_cve === "string"
          ? `Estado ${activeFeatureProps.estado_cve}`
          : null,
        typeof activeFeatureProps.municipio_cve === "string"
          ? `Municipio ${activeFeatureProps.municipio_cve}`
          : null,
        typeof activeFeatureProps.colonia === "string" ? activeFeatureProps.colonia : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : null;

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
      const isMunicipioView = mapLevel === "municipio";
      const fillColor = isMunicipioView ? "transparent" : color;
      const fillOpacity = isMunicipioView
        ? hoveredRegionKey === key
          ? 0.35
          : 0
        : hoveredRegionKey === key
        ? 0.85
        : 0.6;
      layerInstance.setStyle({
        color: "#0f172a",
        weight: isActive ? 3 : 1,
        fillColor,
        fillOpacity,
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

  const openMapboxFeature = useCallback(
    (feature) => {
      if (!feature) return;
      setSelectedId(String(feature.id ?? ""));
      setActiveMarkerFeature(feature);
      pendingMapboxFeatureRef.current = feature;
      setMapboxFeature(feature);
      setMapboxActive(true);
      logMapboxEvent(
        {
          feature,
          action: "open",
        },
        "open-mapbox",
      );
    },
    [logMapboxEvent],
  );

const closeMapbox = useCallback(() => {
  setMapboxActive(false);
  setMapboxFeature(null);
}, []);

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

      const response = await fetch(url.toString(), {
        cache: "no-store",
        credentials: "include",
        headers: { Accept: "application/json" },
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        console.warn("demografia mapa error", response.status, body ?? {});
        setDemografiaDataset([]);
        setDemografiaGeojson(null);
        return;
      }
      const payload = await response.json();
      if (!payload?.ok) {
        console.warn("demografia mapa payload error", payload);
        setDemografiaDataset([]);
        setDemografiaGeojson(null);
        return;
      }
      setDemografiaDataset(payload.dataset ?? []);
      setDemografiaGeojson(payload.geojson ?? null);
      setDemografiaLevel(nivel);
    } catch (err) {
      console.warn("Error cargando el mapa demográfico:", err);
      setDemografiaDataset([]);
      setDemografiaGeojson(null);
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
    const markerPane = map.getPane?.("markerPane");
    if (markerPane) {
      markerPane.style.zIndex = "750";
    }

    return () => {
      map.remove();
      layerRef.current?.clearLayers();
    };
  }, [leaflet, applyLayerStyle]);

  useEffect(() => {
    const estadoKey = mapLevel === "municipio" ? selectedStateKey : undefined;
    fetchDemografiaLevel(mapLevel, estadoKey);
  }, [fetchDemografiaLevel, mapLevel, selectedStateKey]);

  const filteredDemografiaGeojson = useMemo(() => {
    if (!demografiaGeojson) return null;
    if (demografiaLevel !== mapLevel) return null;
    let features = demografiaGeojson.features || [];
    if (mapLevel === "pais") {
      features = features.filter((feature) => {
        const props = feature.properties || {};
        const countries = [props.iso_a3, props.ISO_A3, props.iso_a2, props.ISO_A2];
        return countries.some((item) => typeof item === "string" && item.toUpperCase() === "MEX");
      });
    }
    if (!features.length) return null;
    return { ...demografiaGeojson, features };
  }, [demografiaGeojson, mapLevel, demografiaLevel]);

  useEffect(() => {
    if (!hierarchyLayerRef.current || !filteredDemografiaGeojson) {
      return;
    }
    hierarchyLayerRef.current.clearLayers();
    hierarchyLayerRef.current.addData(filteredDemografiaGeojson);
    if (!leaflet || !mapInstanceRef.current) {
      return;
    }
    try {
      const bounds = leaflet.geoJSON(filteredDemografiaGeojson).getBounds();
      if (!bounds.isValid()) {
        return;
      }
      const maxZoom = mapLevel === "municipio" ? 15 : mapLevel === "estado" ? 10 : 7;
      mapInstanceRef.current.fitBounds(bounds, { padding: [30, 30], maxZoom });
    } catch {
      // ignore invalid bounds
    }
  }, [filteredDemografiaGeojson, leaflet, mapLevel]);

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
    let aggregatedBounds = null;
    for (const feature of filteredFeatures) {
      const bounds = leaflet.geoJSON(feature).getBounds();
      if (!bounds.isValid()) {
        continue;
      }
      if (aggregatedBounds) {
        aggregatedBounds.extend(bounds);
      } else {
        aggregatedBounds = bounds;
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
      const props = feature.properties ?? {};
      const tooltipParts = [
        props.nombre ?? "Propiedad",
        props.desarrollo_nombre ? `Desarrollo ${props.desarrollo_nombre}` : null,
        props.estado_cve ? `Estado ${props.estado_cve}` : null,
        props.municipio_cve ? `Municipio ${props.municipio_cve}` : null,
        props.linea_nombre ? `Línea ${props.linea_nombre}` : null,
        props.status ? props.status.toUpperCase() : null,
      ].filter(Boolean);
      marker.bindTooltip(tooltipParts.join(" · "));
      if (typeof marker.setZIndexOffset === "function") {
        marker.setZIndexOffset(1000);
      }
      if (typeof marker.bringToFront === "function") {
        marker.bringToFront();
      }
      marker.on("click", () => {
        setSelectedId(String(feature.id ?? ""));
        setActiveMarkerFeature(feature);
      });
      markersLayerRef.current.addLayer(marker);
    }
    if (mapInstanceRef.current && mapLevel === "municipio" && aggregatedBounds?.isValid()) {
      mapInstanceRef.current.fitBounds(aggregatedBounds, { padding: [30, 30], maxZoom: 19 });
    }
  }, [filteredFeatures, leaflet, mapLevel, getFeatureColor]);

  useEffect(() => {
    if (!mapboxActive) {
      mapboxInstanceRef.current?.remove();
      mapboxInstanceRef.current = null;
      return;
    }
    if (!mapboxToken) {
      return;
    }
    let cancelled = false;
    (async () => {
      const mapboxglModule = (await import("mapbox-gl")).default;
      if (cancelled) return;
      mapboxglModule.accessToken = mapboxToken;
      const container = mapboxContainerRef.current;
      if (!container) return;
      const initialFeature =
        pendingMapboxFeatureRef.current ?? mapboxFeatureRef.current ?? null;
      const initialBounds = initialFeature
        ? getGeometryBounds(initialFeature.geometry)
        : null;
      const initialCenter = getFeatureCenter(initialFeature) ?? DEFAULT_CENTER;
      const initialZoom = initialBounds ? 18 : 12;
      const map = new mapboxglModule.Map({
        container,
        style: "mapbox://styles/mapbox/satellite-v9",
        center: initialCenter,
        zoom: initialZoom,
        pitch: 60,
        bearing: 0,
        projection: "mercator",
      });
      logMapboxEvent(
        {
          step: "initial-center",
          bounds: initialBounds,
          center: initialCenter,
          zoom: initialZoom,
        },
        "initial-center",
      );
      mapboxInstanceRef.current = map;
      if (typeof window !== "undefined") {
        window.__mapboxInstance = map;
      }
      const sourceId = "propiedad-3d";
      const fillLayerId = "propiedad-3d-fill";
      const lineLayerId = "propiedad-3d-outline";
      const addLayerRules = () => {
        const styleReady = map.isStyleLoaded();
        logMapboxEvent(
          {
            step: "add-layer",
            styleLoaded: styleReady,
            fillLayer: Boolean(map.getLayer(fillLayerId)),
            outlineLayer: Boolean(map.getLayer(lineLayerId)),
          },
          "add-layer",
        );
        if (cancelled || !styleReady) {
          return;
        }
        if (!map.getSource(sourceId)) {
          map.addSource(sourceId, {
            type: "geojson",
            data: {
              type: "FeatureCollection",
              features: [],
            },
          });
        }
        if (!map.getLayer(fillLayerId)) {
          map.addLayer({
            id: fillLayerId,
            type: "fill-extrusion",
            source: sourceId,
              paint: {
                "fill-extrusion-color": [
                  "coalesce",
                  ["get", "status_color"],
                  ["get", "color"],
                  "#95A5A6",
                ],
                "fill-extrusion-height": [
                  "coalesce",
                  ["to-number", ["get", "height"], 0],
                  0,
              ],
              "fill-extrusion-base": [
                "coalesce",
                ["to-number", ["get", "min_height"], 0],
                0,
              ],
              "fill-extrusion-opacity": 0.9,
            },
          });
        }
        if (!map.getLayer(lineLayerId)) {
          map.addLayer({
            id: lineLayerId,
            type: "line",
            source: sourceId,
            paint: {
              "line-color": ["coalesce", ["get", "status_color"], "#000"],
              "line-width": 1,
              "line-opacity": 0.6,
            },
          });
        }
      };
      const applyPendingFeature = () => {
        const candidate =
          pendingMapboxFeatureRef.current ?? mapboxFeatureRef.current;
        if (!candidate) {
          return;
        }
        if (sendFeatureToMapbox(candidate)) {
          pendingMapboxFeatureRef.current = null;
        }
      };
      map.on("load", () => {
        if (cancelled) return;
        map.setPitch(pitch);
        map.setBearing(bearing);
        addLayerRules();
        applyPendingFeature();
        map.resize();
      });
      map.on("styledata", () => {
        if (cancelled) return;
        map.setPitch(pitch);
        map.setBearing(bearing);
        addLayerRules();
        applyPendingFeature();
        map.resize();
      });
    })();
    return () => {
      cancelled = true;
      pendingMapboxFeatureRef.current = null;
      mapboxInstanceRef.current?.remove();
      mapboxInstanceRef.current = null;
      if (typeof window !== "undefined") {
        delete window.__mapboxInstance;
      }
    };
  }, [mapboxActive, mapboxToken, sendFeatureToMapbox, logMapboxEvent, pitch, bearing]);

  useEffect(() => {
    if (!mapboxActive) {
      return;
    }
    mapboxInstanceRef.current?.resize();
  }, [mapboxActive]);

  useEffect(() => {
    if (!mapboxActive) {
      return;
    }
    const map = mapboxInstanceRef.current;
    if (!map) {
      return;
    }
    try {
      map.setPitch(pitch);
      map.setBearing(bearing);
    } catch {
      /* ignore */
    }
  }, [pitch, bearing, mapboxActive]);

  useEffect(() => {
    if (!mapboxActive || !mapboxFeature) {
      return;
    }
    const map = mapboxInstanceRef.current;
    const bounds = getGeometryBounds(mapboxFeature.geometry);
    if (map && bounds) {
      map.fitBounds(
        [
          [bounds.minLng, bounds.minLat],
          [bounds.maxLng, bounds.maxLat],
        ],
        { padding: 40, maxZoom: 19 },
      );
    }
  }, [mapboxActive, mapboxFeature]);


  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    if (mapboxInstanceRef.current) {
      window.__mapboxInstance = mapboxInstanceRef.current;
    } else if (window.__mapboxInstance) {
      delete window.__mapboxInstance;
    }
  }, [mapboxActive]);

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
        const normalized =
          (data?.features ?? []).map((feature) => ensureStatusColors(feature));
        setFeatures(normalized);
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
      const props = feature?.properties ?? {};
      const normalizedColor =
        (typeof props.color === "string" && props.color) ||
        (typeof props.status_color === "string" && props.status_color) ||
        (typeof props.tipo_color === "string" && props.tipo_color) ||
        STATUS_COLORS[props.status ?? ""] ||
        "#95A5A6";
      return {
        ...feature,
        properties: {
          ...props,
          wallColor: normalizedColor,
          roofColor: normalizedColor,
          height: Number(props.height ?? 0),
          min_height: Number(props.min_height ?? 0),
          levels: Number(props.levels ?? 0),
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

    if (processed.length && mapInstanceRef.current && leaflet && mapLevel === "pais") {
      const bounds = leaflet.geoJSON(payload).getBounds();
      if (bounds.isValid()) {
        mapInstanceRef.current.fitBounds(bounds, { padding: [40, 40], maxZoom: 19 });
      }
    }
  }, [filteredFeatures, viewMode, selectedId, leaflet, applyLayerStyle, osmbReady, mapLevel]);

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

  const handleUnitSelect = useCallback(
    (unit) => {
      if (!unit?.feature) {
        return;
      }
      const id = String(unit.feature.id ?? "");
      setSelectedId(id);
      zoomToFeature(unit.feature);
      openMapboxFeature(unit.feature);
    },
    [openMapboxFeature, zoomToFeature],
  );

  return (
    <div className="lg:flex-row flex flex-col gap-4">
      <aside
        className="h-[600px] w-full rounded-md border border-slate-200 bg-white/60 p-3 shadow-sm shadow-slate-900/5 backdrop-blur dark:border-slate-800 dark:bg-slate-950/60 lg:h-[600px] lg:w-80"
        style={{ maxHeight: "600px", overflow: "hidden" }}
      >
        <div className="flex flex-col gap-2">
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
                {activeDevelopmentSummary
                  ? `Desarrollo seleccionado: ${activeDevelopmentSummary}`
                  : "Unidad seleccionada"}
                {activeLocationSummary && (
                  <div className="mt-0.5 text-[0.65rem] text-slate-500 dark:text-slate-400">
                    {activeLocationSummary}
                  </div>
                )}
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
          <div
            className="flex flex-1 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white/40 shadow-sm transition"
            style={{ height: "calc(100vh - 360px)" }}
          >
            <div
              className="h-full overflow-y-auto px-3 py-2"
              style={{ maxHeight: "calc(100vh - 360px)", minHeight: 260 }}
            >
              <div className="space-y-2">
                {hierarchyTree.map((dev) => {
                  const devExpanded = expandedDevIds.has(dev.id);
                  return (
                    <div key={dev.id} className="border-b border-slate-100 pb-2 last:border-0">
                      <button
                        type="button"
                        className="flex w-full items-center justify-between text-left font-semibold text-slate-700"
                        onClick={() =>
                          setExpandedDevIds((prev) => {
                            const next = new Set(prev);
                            if (next.has(dev.id)) {
                              next.delete(dev.id);
                            } else {
                              next.add(dev.id);
                            }
                            return next;
                          })
                        }
                      >
                        <span>{dev.name}</span>
                        <span className="text-xs text-slate-400">{devExpanded ? "-" : "+"}</span>
                      </button>
                      {devExpanded && (
                        <div className="mt-1 space-y-3 pl-4 text-xs text-slate-600">
                          {dev.capas.map((capa) => {
                            const capaExpanded = expandedCapas.has(capa.id);
                            return (
                              <div key={capa.id} className="border-t border-slate-100 pt-2">
                                <button
                                  type="button"
                                  className="flex w-full items-center justify-between text-left font-semibold uppercase tracking-[0.2em]"
                                  onClick={() =>
                                    setExpandedCapas((prev) => {
                                      const next = new Set(prev);
                                      if (next.has(capa.id)) {
                                        next.delete(capa.id);
                                      } else {
                                        next.add(capa.id);
                                      }
                                      return next;
                                    })
                                  }
                                >
                                  <span>{capa.name}</span>
                                  <span className="text-[0.6rem] text-slate-400">
                                    {capaExpanded ? "-" : "+"}
                                  </span>
                                </button>
                                {capaExpanded && (
                                  <div className="mt-1 space-y-1 pl-3 text-[0.8rem]">
                                    {capa.units.map((unit) => (
                                      <button
                                        key={unit.id}
                                        type="button"
                                        onClick={() => handleUnitSelect(unit)}
                                        className={`flex w-full items-center gap-2 rounded-md border px-2 py-1 text-left text-slate-700 transition ${
                                          selectedId === String(unit.id)
                                            ? "border-slate-900 bg-slate-900 text-white"
                                            : "border-slate-200 bg-white hover:border-slate-400 hover:bg-slate-100"
                                        }`}
                                      >
                                        <span
                                          className="h-2.5 w-2.5 rounded-full border"
                                          style={{
                                            backgroundColor: unit.color,
                                            borderColor: unit.color,
                                          }}
                                        />
                                        <span className="font-semibold">{unit.name}</span>
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </aside>
      <section className="relative flex-1 min-w-0">
        <div className="relative h-[600px] w-full min-h-[600px]">
          <div
            ref={mapContainerRef}
            className={`absolute inset-0 z-10 rounded-md border border-slate-200 bg-white/10 shadow-sm shadow-slate-900/10 transition-opacity duration-200 ${
              mapboxActive ? "opacity-0 pointer-events-none" : "opacity-100 pointer-events-auto"
            }`}
          />
          <div
            ref={mapboxContainerRef}
            className={`absolute inset-0 z-20 w-full h-full rounded-md transition-opacity duration-200 ${
              mapboxActive
                ? "pointer-events-auto opacity-100"
                : "pointer-events-none opacity-0"
            }`}
          />
          <div
            className={`absolute inset-0 z-30 transition-opacity duration-200 ${
              mapboxActive
                ? "pointer-events-none opacity-100"
                : "pointer-events-none opacity-0"
            }`}
          >
            <div className="absolute inset-y-4 right-4 z-50 w-full max-w-sm rounded-xl border border-slate-800 bg-gradient-to-b from-slate-950/80 via-slate-950/60 to-slate-950/40 p-0 shadow-xl">
              <div className="pointer-events-auto">
                <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
                  <div>
                    <p className="text-[0.65rem] font-semibold uppercase tracking-[0.3em] text-slate-300">
                      Mapbox 3D
                    </p>
                    {!mapboxToken && (
                      <p className="text-[0.65rem] text-rose-400">
                        Configura `NEXT_PUBLIC_MAPBOX_TOKEN` para activar esta vista.
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    className="rounded border border-slate-600 px-3 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-slate-200 transition hover:bg-slate-900 hover:text-white"
                    onClick={closeMapbox}
                  >
                    Cerrar
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto px-4 py-5 text-sm text-slate-200">
                  {mapboxFeature ? (
                    <>
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-lg font-semibold text-white">
                          {mapboxProps?.desarrollo_nombre ?? mapboxProps?.nombre ?? "Propiedad"}
                        </div>
                        <span
                          className="h-4 w-4 rounded-full border border-slate-500"
                          style={{
                            backgroundColor:
                              mapboxProps?.color ??
                              mapboxProps?.status_color ??
                              "#95A5A6",
                          }}
                        />
                      </div>
                      {mapboxCatalogLabel && (
                        <p className="mt-1 text-[0.65rem] text-slate-400">{mapboxCatalogLabel}</p>
                      )}
                      {mapboxLocationLabel && (
                        <p className="mt-1 text-[0.65rem] text-slate-400">{mapboxLocationLabel}</p>
                      )}
                      <div className="mt-4 space-y-2 text-slate-200">
                        <div className="flex items-center justify-between text-[0.75rem] uppercase tracking-[0.2em]">
                          <span>Status:</span>
                          <span className="font-semibold">{mapboxStatusLabel ?? "Sin status"}</span>
                        </div>
                        <div className="flex items-center justify-between text-[0.75rem] uppercase tracking-[0.2em]">
                          <span>Precio:</span>
                          <span className="font-semibold">{mapboxPriceLabel}</span>
                        </div>
                        <div className="flex items-center justify-between text-[0.75rem] uppercase tracking-[0.2em]">
                          <span>Área:</span>
                          <span className="font-semibold">{mapboxAreaLabel}</span>
                        </div>
                        <div className="flex items-center justify-between text-[0.75rem] uppercase tracking-[0.2em]">
                          <span>Niveles:</span>
                          <span className="font-semibold">{mapboxLevelsLabel}</span>
                        </div>
                        {mapboxProps?.descripcion && (
                          <div>
                            <p className="text-xs text-slate-300">Descripción:</p>
                            <p className="text-[0.75rem] text-slate-200">{mapboxProps.descripcion}</p>
                          </div>
                        )}
                      </div>
                    </>
                  ) : (
                    <p className="text-[0.85rem] text-slate-400">
                      Selecciona un marcador o una unidad de la lista para mostrarla en Mapbox.
                    </p>
                  )}
                  <div className="mt-5 border-t border-slate-800 pt-4">
                    <div className="text-xs uppercase tracking-[0.2em] text-slate-500">
                      Vista Mapbox
                    </div>
                    <div className="mt-3 space-y-3 text-[0.7rem] text-slate-300">
                      <div className="flex items-center justify-between">
                        <span>Pitch</span>
                        <span className="font-mono">{pitch}°</span>
                      </div>
                      <input
                        className="h-2 w-full appearance-none rounded-full bg-slate-700"
                        type="range"
                        min="0"
                        max="80"
                        value={pitch}
                        onChange={(event) => setPitch(Number(event.target.value))}
                      />
                      <div className="flex items-center justify-between">
                        <span>Rotación</span>
                        <span className="font-mono">{bearing}°</span>
                      </div>
                      <input
                        className="h-2 w-full appearance-none rounded-full bg-slate-700"
                        type="range"
                        min="-180"
                        max="180"
                        value={bearing}
                        onChange={(event) => setBearing(Number(event.target.value))}
                      />
                    </div>
                  </div>
                </div>
                <div className="border-t border-slate-800 px-4 py-3 text-xs text-slate-500">
                  La vista 3D utiliza los datos de altura y color del RPC `crm_propiedades_geojson`.
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
