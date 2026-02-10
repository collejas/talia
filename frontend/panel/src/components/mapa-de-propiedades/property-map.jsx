"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import "mapbox-gl/dist/mapbox-gl.css";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

function formatDescriptionLabel(value) {
  if (!value) return null;
  const trimmed = value.toString().trim();
  if (!trimmed.length) return null;
  const maxLen = 50;
  return trimmed.length <= maxLen ? trimmed : `${trimmed.slice(0, maxLen - 3)}...`;
}
const STATUS_COLORS = {
  disponible: "#2ECC71",
  apartado: "#F1C40F",
  vendido: "#E74C3C",
  reservado: "#9B59B6",
};

const DEFAULT_CENTER = [-99.1332, 19.4326];
const TILE_SOURCE = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";

function getFeatureId(feature) {
  if (!feature || typeof feature !== "object") return null;
  const props = feature.properties ?? {};
  const candidates = [
    props.__feature_id,
    props.__original_id,
    feature.id,
    props.id,
    props.target_id,
    props.poligono_id,
    props.desarrollo_id,
    props.nivel_id,
  ];
  const picked = candidates.find((v) => v !== undefined && v !== null && String(v).length);
  return picked ? String(picked) : null;
}

const inferFeatureKind = (feature) => {
  const props = feature?.properties ?? {};
  const rawTipo = (props.target_type ?? props.tipo ?? "").toString().toLowerCase();
  // Normaliza tipos conocidos y evita que labels de negocio (p.ej. "lote") rompan el drill-down.
  const normalized = rawTipo.trim();
  if (["desarrollo", "mix", "capa", "unidad"].includes(normalized)) {
    return normalized;
  }

  // Tipos que en la UI deben comportarse como unidad.
  const unitAliases = new Set([
    "departamento",
    "lote",
    "casa",
    "terreno",
    "local",
    "oficina",
    "bodega",
    "unit",
    "department",
  ]);
  if (unitAliases.has(normalized)) {
    return "unidad";
  }

  // Inferencia por estructura de datos (más confiable que `tipo`).
  if (props.unidad != null || props.tipo_id != null || props.precio != null || props.area_m2 != null) {
    return "unidad";
  }
  if (props.nivel != null || props.capa_nombre != null || props.altura != null) return "capa";
  if (props.desarrollo_tipo || props.desarrollo_status) return "desarrollo";
  return "unknown";
};

function getDevelopmentPolygonColor(properties) {
  if (!properties || typeof properties !== "object") {
    return "#2563EB";
  }
  const status = (properties.desarrollo_status ?? properties.status ?? "").toString().trim().toLowerCase();
  return STATUS_COLORS[status] ?? "#2563EB";
}

function getDevelopmentPolygonStyle(feature) {
  const color = getDevelopmentPolygonColor(feature?.properties);
  return {
    color,
    weight: 3,
    fillColor: color,
    fillOpacity: 0.25,
  };
}

function inferFeatureLayer(feature) {
  if (!feature || typeof feature !== "object") {
    return "unknown";
  }
  const props = feature.properties ?? {};
  const directLayer = (feature.layer ?? props.layer ?? "").toString().trim().toLowerCase();
  if (directLayer) {
    return directLayer;
  }
  if (props.target_type === "desarrollo") return "desarrollo";
  if (props.unidad || props.tipo_id || props.area_m2) {
    return "unidad";
  }
  if (props.capa_nombre || props.nivel != null) {
    return "capa";
  }
  if (props.desarrollo_tipo || props.desarrollo_status || props.descripcion) {
    return "desarrollo";
  }
  return "unknown";
}

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
  const statusKey =
    typeof props.status === "string" ? props.status.trim().toLowerCase() : "";
  if (!props.color) {
    props.color = (statusKey && STATUS_COLORS[statusKey]) ?? "#95A5A6";
  }
  if (!props.status_color) {
    props.status_color = (statusKey && STATUS_COLORS[statusKey]) ?? "#95A5A6";
  }
  feature.properties = props;
  return feature;
}

function normalizeTipoLabel(value) {
  if (typeof value !== "string") {
    return "General";
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "vertical") return "Vertical";
  if (normalized === "horizontal") return "Horizontal";
  if (normalized === "mixto") return "Mixto";
  if (normalized === "capa") return "Capa";
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function toFiniteNumber(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed.length) return null;
    const numeric = Number(trimmed);
    return Number.isFinite(numeric) ? numeric : null;
  }
  return null;
}

function normalizeLooseString(value) {
  if (value === null || value === undefined) return null;
  const str = String(value).trim();
  return str.length ? str.toLowerCase() : null;
}

function buildHierarchy(features) {
  const devMap = new Map();
  for (const feature of features) {
    const props = feature?.properties ?? {};
    const featureSource =
      typeof props.target_type === "string"
        ? props.target_type
        : typeof props.tipo === "string"
        ? props.tipo
        : "";
    const featureKind = featureSource.toString().trim().toLowerCase();
    const isUnit =
      !featureKind || ["unidad", "departamento", "poligono", "unit", "department"].includes(featureKind);
    if (!isUnit) {
      continue;
    }
    const rawDevId = props.desarrollo_id;
    if (!rawDevId || (typeof rawDevId === "string" && !rawDevId.trim())) {
      continue;
    }
    let devId =
      typeof rawDevId === "string" ? rawDevId.trim() : typeof rawDevId === "number" ? String(rawDevId) : "";
    if (!devId) {
      devId = "sin-desarrollo";
    }
    const devName = props.desarrollo_nombre ?? props.nombre ?? devId;
    const tipoLabel =
      normalizeTipoLabel(props.desarrollo_tipo ?? props.tipo_nombre ?? props.desarrollo_ambito ?? "");
    const tipoKey = `${devId}::${tipoLabel}`;

    if (!devMap.has(devId)) {
      devMap.set(devId, {
        id: devId,
        name: devName,
        tipoLabels: new Set(),
        tipos: new Map(),
      });
    }
    const dev = devMap.get(devId);
    if (!dev) continue;
    dev.tipoLabels.add(tipoLabel);

    if (!dev.tipos.has(tipoKey)) {
      dev.tipos.set(tipoKey, {
        id: tipoKey,
        label: tipoLabel,
        capas: new Map(),
      });
    }
    const tipo = dev.tipos.get(tipoKey);
    if (!tipo) continue;

    const capaNombre = props.capa_nombre ?? `Capa ${props.nivel ?? "0"}`;
    const capaKey = `${tipoKey}::${capaNombre}`;
    if (!tipo.capas.has(capaKey)) {
      tipo.capas.set(capaKey, {
        id: capaKey,
        name: capaNombre,
        units: [],
      });
    }
    const capa = tipo.capas.get(capaKey);
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
    .map((dev) => ({
      id: dev.id,
      name: dev.name,
      tipoSummary: Array.from(dev.tipoLabels).filter(Boolean),
      tipos: Array.from(dev.tipos.values())
        .map((tipo) => ({
          id: tipo.id,
          label: tipo.label,
          capas: Array.from(tipo.capas.values()).sort((a, b) =>
            (a.name ?? "").localeCompare(b.name ?? ""),
          ),
        }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    }))
    .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
}

function padNumeric(value, length) {
  if (value == null) {
    return "".padStart(length, "0");
  }
  const cleaned = `${value}`.replace(/\D/g, "");
  return cleaned.padStart(length, "0");
}

function buildMunicipioGeoKey(properties) {
  const statePart = padNumeric(
    properties?.estado_cve ?? properties?.cve_ent ?? properties?.cve_entidad ?? "",
    2,
  );
  const municipioPart = padNumeric(
    properties?.municipio_cve ?? properties?.cve_mun ?? "",
    3,
  );
  if (!statePart.trim() || !municipioPart.trim()) {
    return "";
  }
  return `${statePart}${municipioPart}`;
}

function getCountryKeyFromProps(props) {
  const candidate =
    (props?.pais_codigo ?? props?.ISO_A2 ?? props?.iso_a2 ?? props?.iso_a3 ?? props?.ISO_A3 ?? "")
      .toString()
      .trim()
      .toUpperCase();
  if (!candidate) return null;
  return candidate;
}

function getStateKeyFromProps(props, normalizeState) {
  const candidate =
    (props?.estado_cve ?? props?.cve_ent ?? props?.cve_entidad ?? "").toString().trim();
  if (!candidate) return null;
  return normalizeState(candidate);
}

function stripZFromCoords(coords) {
  if (!Array.isArray(coords)) return coords;
  if (coords.length === 0) return coords;
  if (typeof coords[0] === "number" && typeof coords[1] === "number") {
    return coords.slice(0, 2);
  }
  return coords.map(stripZFromCoords);
}

function stripZGeometry(geometry) {
  if (!geometry || typeof geometry !== "object") return geometry;
  if (!Array.isArray(geometry.coordinates)) return geometry;
  return {
    ...geometry,
    coordinates: stripZFromCoords(geometry.coordinates),
  };
}

export function PropertyMap() {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const osmbRef = useRef(null);
  const layerRef = useRef(null);
  const leafletDrillControlsRef = useRef(null);
  const mapboxContainerRef = useRef(null);
  const mapboxInstanceRef = useRef(null);
  const featuresRef = useRef([]);
  const filteredFeaturesRef = useRef([]);
  const activeNodeRef = useRef(null);
  const pendingPayloadRef = useRef(null);
  const hoveredMapboxIdRef = useRef(null);
  const municipioDevelopmentFeaturesRef = useRef([]);
  const mapboxVisibleIdsRef = useRef([]);
  const mapboxIdIndexRef = useRef(new Map());
  const selectedMapboxUnitIdRef = useRef(null);
  const mapboxPanelRef = useRef({
    scopeKind: null,
    visibleTotal: 0,
    kindCounts: {},
    statusCounts: {},
    selectedUnitId: null,
    selectedUnitLabel: null,
  });

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
  const [mapboxPanelVersion, setMapboxPanelVersion] = useState(0);
  const [saleLoading, setSaleLoading] = useState(false);
  const [saleError, setSaleError] = useState(null);
  const [saleSuccess, setSaleSuccess] = useState(null);
  const [saleLogs, setSaleLogs] = useState([]);
  const [isSaleModalOpen, setSaleModalOpen] = useState(false);
  const [saleModalPrice, setSaleModalPrice] = useState("");
  const [saleModalOpportunityId, setSaleModalOpportunityId] = useState(null);
  const [saleModalError, setSaleModalError] = useState(null);
  const [availableOpportunities, setAvailableOpportunities] = useState([]);
  const [opportunitiesLoading, setOpportunitiesLoading] = useState(false);
  const [statusLoading, setStatusLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState(null);
  const [statusError, setStatusError] = useState(null);
  const [geojsonRefreshVersion, setGeojsonRefreshVersion] = useState(0);
  const lastSaleTimestampRef = useRef(null);
  const refreshGeojson = useCallback(() => {
    setGeojsonRefreshVersion((value) => value + 1);
  }, []);
  const selectedIdRef = useRef(selectedId);
  const hierarchyLayerRef = useRef(null);
  const markersLayerRef = useRef(null);
  const municipalPolygonLayerRef = useRef(null);
  const [mapLevel, setMapLevel] = useState("pais");
  const [demografiaGeojson, setDemografiaGeojson] = useState(null);
  const [demografiaDataset, setDemografiaDataset] = useState([]);
  const [demografiaLevel, setDemografiaLevel] = useState("pais");
  const [selectedCountryKey, setSelectedCountryKey] = useState(null);
  const [selectedStateKey, setSelectedStateKey] = useState(null);
  const [selectedMunicipioKey, setSelectedMunicipioKey] = useState(null);
  const [selectedMunicipioGeoKey, setSelectedMunicipioGeoKey] = useState(null);
  const [hoveredRegionKey, setHoveredRegionKey] = useState(null);
  const [activeMarkerFeature, setActiveMarkerFeature] = useState(null);
  const [mapboxActive, setMapboxActive] = useState(false);
  const [mapboxFeature, setMapboxFeature] = useState(null);
  const [leafletActiveNode, setLeafletActiveNode] = useState(null);
  const [leafletParentStack, setLeafletParentStack] = useState([]);
  const [activeNode, setActiveNode] = useState(null);
  const [parentStack, setParentStack] = useState([]);
  const [expandedDevIds, setExpandedDevIds] = useState(() => new Set());
  const [expandedCapas, setExpandedCapas] = useState(new Set());
  const [expandedTipos, setExpandedTipos] = useState(() => new Set());
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

  useEffect(() => {
    if (!mapboxFeature) return;
    const props = mapboxFeature.properties ?? {};
    const metadata = props.metadata ?? {};
    logMapboxEvent(
      {
        feature_id: getFeatureId(mapboxFeature),
        layer: mapboxFeature.layer ?? props.layer ?? null,
        catalog_item_id:
          metadata.catalog_item_id ??
          props.catalog_item_id ??
          metadata.catalog_item ??
          props.catalog_item ??
          null,
        status: (props.status ?? "").toString().toLowerCase(),
        metadata_keys: Object.keys(metadata),
        properties: {
          unidad: props.unidad ?? props.nombre ?? null,
          desarrollo_id: props.desarrollo_id ?? props.target_id ?? null,
        },
      },
      "mapbox-feature-selected",
    );
  }, [logMapboxEvent, mapboxFeature]);

  const leafletActiveNodeRef = useRef(null);
  useEffect(() => {
    leafletActiveNodeRef.current = leafletActiveNode;
  }, [leafletActiveNode]);

  const fitLeafletToFeatures = useCallback(
    (featureList, options = { padding: [30, 30], maxZoom: 19 }) => {
      if (!mapInstanceRef.current || !leaflet) return;
      if (!Array.isArray(featureList) || featureList.length === 0) return;
      try {
        const bounds = leaflet.geoJSON({ type: "FeatureCollection", features: featureList }).getBounds();
        if (bounds.isValid()) {
          mapInstanceRef.current.fitBounds(bounds, options);
        }
      } catch {
        /* ignore */
      }
    },
    [leaflet],
  );

  const resetLeafletDrilldown = useCallback(() => {
    setLeafletParentStack([]);
    setLeafletActiveNode(null);
    // Vuelve a la vista raíz del nivel actual.
    const municipioFeatures = municipioDevelopmentFeaturesRef.current ?? [];
    const filtered = filteredFeaturesRef.current ?? [];
    if (mapLevel === "municipio" && municipioFeatures.length) {
      fitLeafletToFeatures(municipioFeatures, { padding: [30, 30], maxZoom: 18 });
    } else if (filtered.length) {
      fitLeafletToFeatures(filtered, { padding: [30, 30], maxZoom: 19 });
    }
    if (typeof window !== "undefined") {
      console.debug("[leaflet] inicio", {
        mapLevel,
        municipioCount: municipioFeatures.length,
        filteredCount: filtered.length,
      });
    }
  }, [fitLeafletToFeatures, mapLevel]);

  useEffect(() => {
    activeNodeRef.current = activeNode;
  }, [activeNode]);

  useEffect(() => {
    featuresRef.current = features;
  }, [features]);

  const applyMapboxBoundsCamera = useCallback(
    (map, bounds, options = {}) => {
      if (!map || !bounds) return false;
      const padding = options.padding ?? 30;
      const maxZoom = options.maxZoom ?? 19;
      const duration = options.duration ?? 650;
      const targetBounds = [
        [bounds.minLng, bounds.minLat],
        [bounds.maxLng, bounds.maxLat],
      ];
      try {
        if (typeof map.cameraForBounds === "function") {
          const camera = map.cameraForBounds(targetBounds, {
            padding,
            bearing,
            pitch,
          });
          if (camera) {
            const nextZoom =
              typeof camera.zoom === "number"
                ? Math.min(camera.zoom, maxZoom)
                : maxZoom;
            map.easeTo({
              ...camera,
              zoom: nextZoom,
              bearing,
              pitch,
              duration,
              essential: true,
            });
            return true;
          }
        }
      } catch {
        /* ignore */
      }
      // Fallback: fitBounds + keep pitch/bearing stable.
      try {
        map.fitBounds(targetBounds, {
          padding,
          maxZoom,
          duration,
          bearing,
          pitch,
        });
        return true;
      } catch {
        try {
          map.fitBounds(targetBounds, { padding, maxZoom });
          map.setPitch(pitch);
          map.setBearing(bearing);
        } catch {
          /* ignore */
        }
        return false;
      }
    },
    [bearing, pitch],
  );

  const sendFeaturesToMapbox = useCallback(
    (featureList, parentKindOverride = null) => {
      if (!Array.isArray(featureList) || !featureList.length) {
        return false;
      }
      if (!mapboxActive) {
        pendingPayloadRef.current = featureList;
        logMapboxEvent({ step: "send-failure", reason: "inactive" }, "send-failure");
        return false;
      }
      const map = mapboxInstanceRef.current;
      if (!map) {
        pendingPayloadRef.current = featureList;
        logMapboxEvent({ step: "send-failure", reason: "no-map" }, "send-failure");
        return false;
      }
      // Solo envia hijos inmediatos según el tipo del nodo activo/clicado para evitar mezclar niveles.
      const parentKind = parentKindOverride ?? inferFeatureKind(activeNodeRef.current);
      let childList = featureList;
      if (parentKind === "desarrollo") {
        childList = featureList.filter((f) => inferFeatureKind(f) === "capa");
      } else if (parentKind === "capa") {
        // Solo unidades cuyo nivel coincide con la capa seleccionada
        const parentLevel = activeNodeRef.current?.properties?.nivel;
        childList = featureList.filter((f) => {
          if (inferFeatureKind(f) !== "unidad") return false;
          const unitLevel = f?.properties?.nivel;
          return (
            typeof parentLevel === "number" &&
            typeof unitLevel === "number" &&
            Number(unitLevel) === Number(parentLevel)
          );
        });
      }
      if (!childList.length) {
        childList = featureList;
      }
      const source = map.getSource("propiedad-3d");
      if (!source || typeof source.setData !== "function") {
        pendingPayloadRef.current = featureList;
        logMapboxEvent({ step: "send-failure", reason: "no-source" }, "send-failure");
        return false;
      }
      const enriched = childList.map((f) => {
        const clone = ensureStatusColors({ ...f });
        const props = { ...(clone.properties ?? {}) };
        const kind = inferFeatureKind(clone);
        // Fuerza 2D para que Mapbox extruya sin caras faltantes (ignora coordenadas Z).
        clone.geometry = stripZGeometry(clone.geometry);
        const resolvedId =
          props.__feature_id ??
          clone.id ??
          props.id ??
          props.target_id ??
          props.poligono_id ??
          props.desarrollo_id ??
          props.nivel_id ??
          null;
        if (resolvedId) {
          clone.id = resolvedId;
          props.id = resolvedId;
        }
        if (kind === "desarrollo") {
          props.__feature_id = props.desarrollo_id ?? props.target_id ?? props.id ?? f.id ?? null;
        } else if (kind === "capa") {
          props.__feature_id = props.id ?? f.id ?? props.target_id ?? null;
        } else {
          props.__feature_id = props.id ?? f.id ?? props.target_id ?? null;
        }
        // Conserva el id original para cuando Mapbox pierda feature.id en eventos de clic.
        props.__original_id = f.id ?? props.id ?? null;
        // Normaliza numéricos sin forzar a cero; deja que el dato decida la extrusión.
        props.height = Number(props.height ?? props.levels ?? props.altura ?? 0);
        props.min_height = Number(props.min_height ?? props.base ?? 0);
        props.levels = Number(props.levels ?? props.nivel ?? props.height ?? 0);
        // Si es capa y no viene min_height, calcularlo según nivel*height para que se apilen.
        if (kind === "capa" && (!props.min_height || Number.isNaN(props.min_height))) {
          const nivelNum = Number(props.nivel ?? props.levels ?? 0);
          if (!Number.isNaN(nivelNum) && props.height) {
            props.min_height = nivelNum * props.height;
          }
        }
        const metadataPayload = props.metadata ?? {};
        if (metadataPayload && typeof metadataPayload === "object") {
          const catalogValue =
            metadataPayload.catalog_item_id ?? metadataPayload.catalog_item ?? null;
          if (catalogValue) {
            props.catalog_item_id = String(catalogValue);
          }
        }
        clone.properties = props;
        return clone;
      });
      const payload = { type: "FeatureCollection", features: enriched };
      source.setData(payload);
      mapboxVisibleIdsRef.current = enriched
        .map((f) => (f?.id != null ? String(f.id) : null))
        .filter(Boolean);
      // Índice para resolver clicks de Mapbox (que a veces traen ids en props diferentes).
      try {
        const index = new Map();
        for (const feature of enriched) {
          const props = feature?.properties ?? {};
          const idValue = feature?.id ?? props.id ?? props.__feature_id ?? props.__original_id ?? null;
          if (idValue == null) continue;
          const idStr = String(idValue);
          index.set(idStr, idStr);
          const keys = [
            props.id,
            props.__feature_id,
            props.__original_id,
            props.poligono_id,
            props.target_id,
          ].filter((v) => v !== undefined && v !== null && String(v).length);
          for (const k of keys) {
            index.set(String(k), idStr);
          }
        }
        mapboxIdIndexRef.current = index;
      } catch {
        mapboxIdIndexRef.current = new Map();
      }
      // panel summary removed
      // Al cambiar el set de features visibles, se limpia el aislamiento de unidad.
      selectedMapboxUnitIdRef.current = null;
      mapboxPanelRef.current = {
        scopeKind: parentKind,
        visibleTotal: enriched.length,
        kindCounts: {},
        statusCounts: {},
        selectedUnitId: null,
        selectedUnitLabel: null,
      };
      try {
        const kindCounts = {};
        const statusCounts = {};
        for (const feature of enriched) {
          const kind = inferFeatureKind(feature);
          kindCounts[kind] = (kindCounts[kind] ?? 0) + 1;
          const statusRaw =
            (feature?.properties?.status ??
              feature?.properties?.desarrollo_status ??
              "")
              .toString()
              .trim()
              .toLowerCase();
          if (statusRaw) {
            statusCounts[statusRaw] = (statusCounts[statusRaw] ?? 0) + 1;
          }
        }
        mapboxPanelRef.current.kindCounts = kindCounts;
        mapboxPanelRef.current.statusCounts = statusCounts;
      } catch {
        // ignore
      }
      setMapboxPanelVersion((v) => v + 1);
      // Limpia cualquier aislamiento previo en el nuevo set.
      try {
        for (const id of mapboxVisibleIdsRef.current) {
          map.setFeatureState({ source: "propiedad-3d", id }, { hidden: false });
        }
      } catch {
        /* ignore */
      }
      let bounds = null;
      try {
        for (const feat of enriched) {
          const b = getGeometryBounds(feat.geometry);
          if (!b) continue;
          if (!bounds) bounds = { ...b };
          bounds.minLng = Math.min(bounds.minLng, b.minLng);
          bounds.minLat = Math.min(bounds.minLat, b.minLat);
          bounds.maxLng = Math.max(bounds.maxLng, b.maxLng);
          bounds.maxLat = Math.max(bounds.maxLat, b.maxLat);
        }
      } catch {
        bounds = null;
      }
      const applyFit = () => {
        if (!bounds || !map.isStyleLoaded()) return;
        applyMapboxBoundsCamera(map, bounds, { padding: 30, maxZoom: 19, duration: 650 });
      };
      if (bounds && map.isStyleLoaded()) {
        applyMapboxBoundsCamera(map, bounds, { padding: 30, maxZoom: 19, duration: 650 });
      } else {
        map.once("styledata", applyFit);
        map.once("idle", applyFit);
      }
      pendingPayloadRef.current = null;
      logMapboxEvent(
        {
          features: featureList,
          bounds,
          mapbox: {
            parentKind,
            enrichedCount: enriched.length,
            visibleIdsSample: mapboxVisibleIdsRef.current.slice(0, 10),
            styleLoaded: map.isStyleLoaded(),
          },
        },
        "set-data",
      );
      return true;
    },
    [applyMapboxBoundsCamera, logMapboxEvent, mapboxActive],
  );

  const sendFeatureToMapbox = useCallback(
    (feature) => sendFeaturesToMapbox(feature ? [feature] : []),
    [sendFeaturesToMapbox],
  );

  useEffect(() => {
    if (!mapboxActive) {
      pendingMapboxFeatureRef.current = null;
      pendingPayloadRef.current = null;
      return;
    }
    const hasVisibleSet = (mapboxVisibleIdsRef.current ?? []).length > 0;
    // Priorizamos el feature pendiente (abrir Mapbox) y evitamos que cambios de `mapboxFeature`
    // (clics para actualizar el panel) reescriban el source y rompan el drill-down.
    const targetFeature = pendingMapboxFeatureRef.current ?? mapboxFeature;
    if (!targetFeature) {
      return;
    }
    if (hasVisibleSet && !pendingMapboxFeatureRef.current) {
      return;
    }
    if (!sendFeatureToMapbox(targetFeature)) {
      pendingMapboxFeatureRef.current = targetFeature;
    } else {
      pendingMapboxFeatureRef.current = null;
    }
  }, [mapboxActive, mapboxFeature, sendFeatureToMapbox]);

  const getChildrenForNode = useCallback(
    (node) => {
      if (!node) return [];
      const parentId = getFeatureId(node);
      const parentProps = node?.properties ?? {};
      const parentNombre = normalizeLooseString(parentProps?.nombre);
      const parentNivel = toFiniteNumber(parentProps?.nivel);
      const parentDesarrolloId = parentProps?.desarrollo_id ?? parentProps?.target_id ?? null;
      const parentKind = inferFeatureKind(node);
      const list = featuresRef.current ?? [];
      return list.filter((child) => {
        if (getFeatureId(child) === parentId) {
          return false; // evita incluir al padre en el set de hijos
        }
        const props = child?.properties ?? {};
        const kind = inferFeatureKind(child);
        const childDevId = props.desarrollo_id ?? props.target_id ?? null;
        if (childDevId && childDevId === parentId && parentKind === "desarrollo") {
          return true;
        }
        if (parentKind === "desarrollo") {
          return (
            props.desarrollo_id === parentId ||
            props.target_parent_id === parentId ||
            (kind === "capa" && props.desarrollo_id === parentId) ||
            (kind === "unidad" && props.desarrollo_id === parentId)
          );
        }
        if (parentKind === "capa") {
          const unitNivel = toFiniteNumber(props?.nivel);
          const unitCapaNombre = normalizeLooseString(props?.capa_nombre);
          const unitDesarrolloId = props?.desarrollo_id ?? props?.target_id ?? null;
          const sameDesarrollo =
            parentDesarrolloId && unitDesarrolloId
              ? parentDesarrolloId === unitDesarrolloId
              : Boolean(parentDesarrolloId ? unitDesarrolloId === parentDesarrolloId : true);
          return (
            (parentId && (props.nivel_id === parentId || props.capa_id === parentId)) ||
            props.parent_id === parentId ||
            props.target_parent_id === parentId ||
            (sameDesarrollo &&
              parentNivel !== null &&
              unitNivel !== null &&
              unitNivel === parentNivel) ||
            (parentNombre &&
              unitCapaNombre &&
              parentNombre === unitCapaNombre &&
              sameDesarrollo)
          );
        }
        if (parentKind === "unidad") {
          if (parentId) {
            return props.parent_id === parentId || props.target_parent_id === parentId;
          }
          return false;
        }
        if (!parentId) return false;
        return props.parent_id === parentId || props.target_parent_id === parentId;
      });
    },
    [featuresRef],
  );

  const deriveDrillChildren = useCallback(
    (node) => {
      if (!node) return [];
      const parentKind = inferFeatureKind(node);
      const children = getChildrenForNode(node);
      if (!children.length) return [];
      if (parentKind === "desarrollo") {
        const capas = children.filter((child) => inferFeatureKind(child) === "capa");
        return capas.length ? capas : children;
      }
      if (parentKind === "capa") {
        const unidades = children.filter((child) => inferFeatureKind(child) === "unidad");
        return unidades.length ? unidades : children;
      }
      return children;
    },
    [getChildrenForNode],
  );

  const ascendLeaflet = useCallback(() => {
    const nextStack = [...leafletParentStack];
    const parent = nextStack.pop() ?? null;
    setLeafletParentStack(nextStack);
    setLeafletActiveNode(parent);

    if (parent) {
      const children = deriveDrillChildren(parent);
      fitLeafletToFeatures(children.length ? children : [parent]);
      return;
    }

    // Si no hay padre (primer nivel), "subir" equivale a salir del drill-down.
    const municipioFeatures = municipioDevelopmentFeaturesRef.current ?? [];
    const filtered = filteredFeaturesRef.current ?? [];
    if (mapLevel === "municipio" && municipioFeatures.length) {
      fitLeafletToFeatures(municipioFeatures, { padding: [30, 30], maxZoom: 18 });
    } else if (filtered.length) {
      fitLeafletToFeatures(filtered, { padding: [30, 30], maxZoom: 19 });
    }
    if (typeof window !== "undefined") {
      console.debug("[leaflet] subir", {
        hadParent: Boolean(parent),
        nextStackLen: nextStack.length,
        mapLevel,
      });
    }
  }, [
    deriveDrillChildren,
    fitLeafletToFeatures,
    leafletParentStack,
    mapLevel,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    console.debug("[leaflet] drill-state", {
      mapLevel,
      activeKind: leafletActiveNode ? inferFeatureKind(leafletActiveNode) : null,
      stackLen: leafletParentStack.length,
    });
  }, [leafletActiveNode, leafletParentStack.length, mapLevel]);

  const handleLeafletFeatureClick = useCallback(
    (feature, layerInstance) => {
      if (!feature) return;
      const props = feature?.properties ?? {};
      const kind = inferFeatureKind(feature);
      const id = getFeatureId(feature) ?? (feature?.id != null ? String(feature.id) : "");
      if (props) {
        layerInstance?.bindPopup?.(
          `<strong>${props.nombre ?? props.desarrollo_nombre ?? "Propiedad"}</strong><br>${props.status ?? ""}`,
        );
        layerInstance?.openPopup?.();
      }
      if (id) {
        setSelectedId(String(id));
      }
      if (kind === "unidad") {
        return;
      }
      if (kind === "desarrollo" || kind === "capa") {
        try {
          const bounds = layerInstance?.getBounds?.();
          if (bounds?.isValid?.() && mapInstanceRef.current) {
            mapInstanceRef.current.fitBounds(bounds, { padding: [30, 30], maxZoom: 19 });
          }
        } catch {
          /* ignore */
        }
        setLeafletParentStack((prev) => {
          const next = [...prev];
          const current = leafletActiveNodeRef.current;
          if (current) {
            next.push(current);
          }
          return next;
        });
        setLeafletActiveNode(feature);
      }
    },
    [],
  );

  // Recentrar cuando cambia el nodo activo del drill-down Leaflet.
  useEffect(() => {
    if (mapboxActive) return;
    if (!leafletActiveNode) return;
    const children = deriveDrillChildren(leafletActiveNode);
    fitLeafletToFeatures(children.length ? children : [leafletActiveNode], {
      padding: [30, 30],
      maxZoom: 19,
    });
  }, [deriveDrillChildren, fitLeafletToFeatures, leafletActiveNode, mapboxActive]);

  const ascendMapbox = useCallback(() => {
    const map = mapboxInstanceRef.current;
    if (map) {
      try {
        for (const id of mapboxVisibleIdsRef.current ?? []) {
          map.setFeatureState({ source: "propiedad-3d", id }, { hidden: false });
        }
      } catch {
        /* ignore */
      }
    }
    selectedMapboxUnitIdRef.current = null;
    setParentStack((prev) => {
      if (!prev.length) return prev;
      const next = [...prev];
      const parent = next.pop();
      setActiveNode(parent ?? null);
      if (parent) {
        const children = getChildrenForNode(parent);
        if (children.length) {
          sendFeaturesToMapbox(children);
        } else {
          sendFeatureToMapbox(parent);
        }
        setMapboxFeature(parent);
      }
      return next;
    });
  }, [getChildrenForNode, sendFeatureToMapbox, sendFeaturesToMapbox]);

  useEffect(() => {
    if (!activeNode || !mapboxActive) {
      return;
    }
    const children = getChildrenForNode(activeNode);
    if (children.length) {
      sendFeaturesToMapbox(children);
    } else {
      sendFeatureToMapbox(activeNode);
    }
  }, [activeNode, getChildrenForNode, mapboxActive, sendFeatureToMapbox, sendFeaturesToMapbox]);

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
      if (mapLevel === "municipio") {
        const featureProps = feature?.properties ?? {};
        if (selectedMunicipioGeoKey) {
          const featureGeoKey = buildMunicipioGeoKey(featureProps);
          if (!featureGeoKey || featureGeoKey !== selectedMunicipioGeoKey) {
            return false;
          }
        } else if (selectedStateKey) {
          const featureStateKey = padNumeric(
            featureProps.estado_cve ?? featureProps.cve_ent ?? featureProps.cve_entidad ?? "",
            2,
          );
          const selectedStateNormalized = padNumeric(selectedStateKey, 2);
          if (!featureStateKey || featureStateKey !== selectedStateNormalized) {
            return false;
          }
        }
      }
      return true;
    });
  }, [features, nivelFilter, tipoFilter, mapLevel, selectedMunicipioGeoKey, selectedStateKey]);

  useEffect(() => {
    filteredFeaturesRef.current = filteredFeatures;
  }, [filteredFeatures]);

  const leafletVisibleFeatures = useMemo(() => {
    if (mapboxActive) {
      return filteredFeatures;
    }
    if (!leafletActiveNode) {
      return filteredFeatures;
    }
    const children = deriveDrillChildren(leafletActiveNode);
    return children.length ? children : [leafletActiveNode];
  }, [deriveDrillChildren, filteredFeatures, leafletActiveNode, mapboxActive]);

  const municipioDevelopmentFeatures = useMemo(() => {
    if (mapLevel !== "municipio" || !selectedMunicipioGeoKey) {
      return [];
    }
    return features.filter((feature) => {
      const props = feature?.properties ?? {};
      const layerValue = inferFeatureLayer(feature);
      if (!["desarrollo", "mix"].includes(layerValue)) {
        return false;
      }
      const municipioKey = buildMunicipioGeoKey(props);
      return Boolean(municipioKey && municipioKey === selectedMunicipioGeoKey);
    });
  }, [features, mapLevel, selectedMunicipioGeoKey]);

  useEffect(() => {
    municipioDevelopmentFeaturesRef.current = municipioDevelopmentFeatures;
  }, [municipioDevelopmentFeatures]);

  useEffect(() => {
    if (mapLevel !== "municipio") {
      return;
    }
    const layers = Array.from(
      new Set(filteredFeatures.map((feature) => inferFeatureLayer(feature)).slice(0, 10)),
    );
    logMapboxEvent(
      {
        action: "municipio-feature-debug",
        selectedMunicipioGeoKey,
        filteredCount: filteredFeatures.length,
        developmentCount: municipioDevelopmentFeatures.length,
        layers,
      },
      "municipio-debug",
    );
  }, [filteredFeatures, logMapboxEvent, mapLevel, municipioDevelopmentFeatures, selectedMunicipioGeoKey]);

  const hierarchyTree = useMemo(() => buildHierarchy(filteredFeatures), [filteredFeatures]);

  useEffect(() => {
    if (!hierarchyTree.length) return;
    const summary = hierarchyTree.map((dev) => ({
      id: dev.id,
      tipos: dev.tipos.map((tipo) => tipo.label),
      capas: dev.tipos.reduce((acc, tipo) => acc + tipo.capas.length, 0),
    }));
    logMapboxEvent(
      {
        hierarchy: summary,
        featureCount: filteredFeatures.length,
      },
      "hierarchy-tree",
    );
  }, [filteredFeatures.length, hierarchyTree, logMapboxEvent]);

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  const getFeatureColor = useCallback((feature) => {
    const props = feature?.properties;
    if (!props) {
      return "#95A5A6";
    }
    const statusKey =
      typeof props.status === "string" ? props.status.trim().toLowerCase() : "";
    const statusColor =
      (typeof props.status_color === "string" && props.status_color) ||
      (statusKey && STATUS_COLORS[statusKey]) ||
      "#95A5A6";
    // Prioriza siempre el color por status (vendido/apartado/etc).
    return statusColor || props.color || props.wallColor || "#95A5A6";
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

  const normalizeStateCode = useCallback((value) => {
    if (!value) return "";
    return `${value}`.padStart(2, "0");
  }, []);

  const normalizeMunicipioCode = useCallback((value) => {
    if (!value) return "";
    return `${value}`.padStart(3, "0");
  }, []);

  const logRegionSelection = useCallback(
    (level, feature, nextLevel) => {
      if (!feature) return;
      const props = feature?.properties ?? {};
      const stateKey = getStateKeyFromProps(props, normalizeStateCode);
      const municipioKey = buildMunicipioGeoKey(props);
      const resolvedKey = resolveRegionKey(feature);
      logMapboxEvent(
        {
          action: "region-navigate",
          currentLevel: level,
          nextLevel,
          regionKey: resolvedKey,
          stateKey,
          municipioKey,
          estado_cve: props.estado_cve ?? props.cve_ent ?? props.cve_entidad,
          municipio_cve: props.municipio_cve ?? props.cve_mun ?? props.cvegeo,
        },
        "region-click",
      );
    },
    [logMapboxEvent, normalizeStateCode],
  );

  const propertyCountryCodes = useMemo(() => {
    const codes = new Set();
    for (const feature of features) {
      const props = feature?.properties ?? {};
      const candidate = (props.pais_codigo ?? props.ISO_A2 ?? props.iso_a2 ?? "").toString().trim().toUpperCase();
      if (candidate) {
        codes.add(candidate);
      }
    }
    return codes;
  }, [features]);

  const propertyStateCodes = useMemo(() => {
    const codes = new Set();
    for (const feature of features) {
      const props = feature?.properties ?? {};
      const value = props.estado_cve ?? props.cve_ent ?? props.cve_entidad ?? "";
      const normalized = normalizeStateCode(value.toString().trim());
      if (normalized) {
        codes.add(normalized);
        codes.add(value.toString().trim().toUpperCase());
      }
    }
    return codes;
  }, [features, normalizeStateCode]);

  const propertyMunicipioCodes = useMemo(() => {
    const codes = new Set();
    for (const feature of features) {
      const props = feature?.properties ?? {};
      const value = props.municipio_cve ?? props.cve_mun ?? props.cvegeo ?? "";
      const normalized = normalizeMunicipioCode(value.toString().trim());
      if (normalized) {
        codes.add(normalized);
      }
      if (value) {
        codes.add(value.toString().trim().toUpperCase());
      }
    }
    return codes;
  }, [features, normalizeMunicipioCode]);

  const getStatusCategory = useCallback((value) => {
    switch ((value ?? "").toString().trim().toLowerCase()) {
      case "vendido":
      case "vendidas":
        return "vendidas";
      case "reservado":
      case "apartado":
        return "apartadas";
      case "disponible":
      default:
        return "disponibles";
    }
  }, []);

  const regionStatusCounts = useMemo(() => {
    const map = new Map();
    for (const feature of features) {
      const props = feature?.properties ?? {};
      const statusBucket = getStatusCategory(props.status);
      const countryKey = getCountryKeyFromProps(props);
      const stateKey = normalizeStateCode(
        (props.estado_cve ?? props.cve_ent ?? props.cve_entidad ?? "").toString().trim(),
      );
      const municipioKey =
        buildMunicipioGeoKey(props) ||
        normalizeMunicipioCode((props.municipio_cve ?? props.cve_mun ?? props.cvegeo ?? "").toString().trim());
      const keys = [countryKey, stateKey, municipioKey].filter(Boolean);
      for (const key of keys) {
        const normalized = `${key}`.toString().trim().toUpperCase();
        const entry = map.get(normalized) ?? { disponibles: 0, apartadas: 0, vendidas: 0 };
        entry[statusBucket] = (entry[statusBucket] ?? 0) + 1;
        map.set(normalized, entry);
      }
    }
    return map;
  }, [features, getStatusCategory, normalizeStateCode, normalizeMunicipioCode]);

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

  const mapboxPanelFeature = mapboxFeature ?? activeNode ?? null;
  const mapboxProps = mapboxPanelFeature?.properties ?? null;
  const mapboxMetadata = mapboxProps?.metadata ?? {};
  const catalogItemId =
    mapboxMetadata?.catalog_item_id ??
    mapboxProps?.catalog_item_id ??
    mapboxMetadata?.catalog_item ??
    mapboxProps?.metadata?.catalog_item ??
    null;
  const unidadId = mapboxProps?.id ?? mapboxProps?.unidad_id ?? mapboxProps?.unidad ?? null;
  const propiedadId =
    mapboxProps?.desarrollo_id ?? mapboxProps?.propiedad_id ?? mapboxProps?.target_id ?? null;
  const mapboxPanelLabel = useMemo(() => {
    void mapboxPanelVersion;
    const panel = mapboxPanelRef.current ?? {};
    const isolatedId = selectedMapboxUnitIdRef.current;
    if (isolatedId) {
      const unitLabel =
        panel.selectedUnitLabel ??
        mapboxProps?.unidad ??
        mapboxProps?.nombre ??
        isolatedId;
      return `Mostrando: 1 unidad · ${unitLabel}`;
    }
    const kindCounts = panel.kindCounts ?? {};
    const parts = Object.entries(kindCounts)
      .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
      .map(([kind, count]) => `${count} ${kind}`);
    if (parts.length) {
      return `Mostrando: ${parts.join(" · ")}`;
    }
    const total = panel.visibleTotal ?? 0;
    return total ? `Mostrando: ${total} elementos` : "Mostrando: 0 elementos";
  }, [mapboxPanelVersion, mapboxProps]);
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

  const handleOpenSaleModal = useCallback(() => {
    const priceValue = mapboxProps?.precio;
    setSaleModalPrice(priceValue != null ? String(priceValue) : "");
    setSaleModalOpportunityId(null);
    setSaleModalError(null);
    setSaleModalOpen(true);
  }, [mapboxProps?.precio]);

  const handleStatusUpdate = useCallback(
    async (status) => {
      if (!mapboxProps?.id) {
        return;
      }
      setStatusLoading(true);
      setStatusMessage(null);
      setStatusError(null);
      try {
        const response = await fetch(`/api/crm/propiedad-unidades/${mapboxProps.id}/status`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ status }),
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(payload?.detail || payload?.error || "update_status_failed");
        }
        setStatusMessage(
          `Unidad ${status === "apartado" ? "apartada" : "reservada"} correctamente.`,
        );
        refreshGeojson();
      } catch (error) {
        setStatusError(
          error instanceof Error ? error.message : "update_status_failed",
        );
      } finally {
        setStatusLoading(false);
      }
    },
    [mapboxProps?.id, refreshGeojson],
  );

  useEffect(() => {
    if (!isSaleModalOpen) {
      setAvailableOpportunities([]);
      setSaleModalOpportunityId(null);
      setSaleModalPrice("");
      setSaleModalError(null);
      setOpportunitiesLoading(false);
      return;
    }
    const controller = new AbortController();
    setOpportunitiesLoading(true);
    (async () => {
      try {
        const response = await fetch("/api/crm/oportunidades/ventas/lista?limit=200", {
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(
            (await response.json().catch(() => null))?.error ?? "opportunities_sale_list_failed",
          );
        }
        const data = await response.json().catch(() => null);
        if (controller.signal.aborted) return;
        setAvailableOpportunities(Array.isArray(data) ? data : []);
      } catch (error) {
        if (controller.signal.aborted) return;
        setSaleModalError(
          error instanceof Error ? error.message : "opportunities_sale_list_failed",
        );
      } finally {
        if (!controller.signal.aborted) {
          setOpportunitiesLoading(false);
        }
      }
    })();
    return () => controller.abort();
  }, [isSaleModalOpen]);

  useEffect(() => {
    if (isSaleModalOpen && availableOpportunities.length && !saleModalOpportunityId) {
      setSaleModalOpportunityId(availableOpportunities[0].id);
    }
  }, [availableOpportunities, isSaleModalOpen, saleModalOpportunityId]);

  const selectedOpportunity = useMemo(() => {
    if (!saleModalOpportunityId) return null;
    return (
      availableOpportunities.find((opportunity) => opportunity.id === saleModalOpportunityId) ?? null
    );
  }, [availableOpportunities, saleModalOpportunityId]);

  const handleConfirmSale = useCallback(async () => {
    setSaleModalError(null);
    setSaleError(null);
    setSaleSuccess(null);
    if (!catalogItemId || !propiedadId || !unidadId) {
      setSaleModalError("Datos incompletos de la unidad seleccionada.");
      return;
    }
    if (!saleModalOpportunityId) {
      setSaleModalError("Selecciona una oportunidad lista para venta.");
      return;
    }
    const priceNumber = Number(saleModalPrice);
    if (Number.isNaN(priceNumber) || priceNumber <= 0) {
      setSaleModalError("Precio final inválido.");
      return;
    }
    setSaleLoading(true);
    try {
      const response = await fetch("/api/crm/ventas/propiedades", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          catalog_item_id: catalogItemId,
          propiedad_id: propiedadId,
          unidad_id: unidadId,
          precio_final: priceNumber,
          moneda: "MXN",
          oportunidad_id: saleModalOpportunityId,
          cuenta_id: selectedOpportunity?.cuenta_id ?? null,
          contacto_id: selectedOpportunity?.contacto_id ?? null,
        }),
      });
      if (!response.ok) {
        const errorPayload = await response.json().catch(() => null);
        throw new Error(errorPayload?.error ?? "venta_failed");
      }
      const data = await response.json().catch(() => null);
      setSaleSuccess(
        data?.id ? `Venta registrada (${data.id})` : "Venta registrada correctamente.",
      );
      refreshGeojson();
      setSaleModalOpen(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : "venta_failed";
      setSaleModalError(message);
      setSaleError(message);
    } finally {
      setSaleLoading(false);
    }
  }, [
    catalogItemId,
    propiedadId,
    unidadId,
    saleModalOpportunityId,
    saleModalPrice,
    selectedOpportunity,
    refreshGeojson,
  ]);

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
        (mapLevel === "pais" && selectedCountryKey === key) ||
        (mapLevel === "estado" && selectedStateKey === key) ||
        (mapLevel === "municipio" && selectedMunicipioKey === key);
      const isMunicipioView = mapLevel === "municipio";
      const fillColor = color;
      const fillOpacity = isMunicipioView
        ? hoveredRegionKey === key
          ? 0.35
          : 0.15
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
    [
      datasetMap,
      hoveredRegionKey,
      mapLevel,
      selectedCountryKey,
      selectedMunicipioKey,
      selectedStateKey,
    ],
  );

  const handleRegionClick = useCallback(
    (feature) => {
      const key = resolveRegionKey(feature);
      if (!key) return;
      const targetLevel =
        mapLevel === "pais"
          ? "estado"
          : mapLevel === "estado"
          ? "municipio"
          : "municipio-detail";
      logRegionSelection(mapLevel, feature, targetLevel);
      if (mapLevel === "pais") {
        setSelectedCountryKey(key);
        setSelectedStateKey(null);
        setSelectedMunicipioKey(null);
        setSelectedMunicipioGeoKey(null);
        setMapLevel("estado");
      } else if (mapLevel === "estado") {
        setSelectedStateKey(key);
        setSelectedMunicipioKey(null);
        setSelectedMunicipioGeoKey(null);
        setMapLevel("municipio");
      } else if (mapLevel === "municipio") {
        setSelectedMunicipioKey(key);
        const municipioGeoKey = buildMunicipioGeoKey(feature?.properties ?? {});
        setSelectedMunicipioGeoKey(municipioGeoKey || null);
      }
    },
    [logRegionSelection, mapLevel],
  );

  const openMapboxFeature = useCallback(
    (feature) => {
      if (!feature) return;
      setSelectedId(String(feature.id ?? ""));
      setActiveMarkerFeature(feature);
      pendingMapboxFeatureRef.current = feature;
      setMapboxFeature(feature);
      setMapboxActive(true);
      setActiveNode(feature);
      setParentStack([]);
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

  const findFeatureForDevelopment = useCallback(
    (devId) => {
      if (!devId) return null;
      const list = featuresRef.current ?? [];
      const normalized = String(devId);
      const exact = list.find((f) => {
        const props = f?.properties ?? {};
        const kind = inferFeatureKind(f);
        const featureDevId =
          kind === "desarrollo"
            ? props.target_id ?? props.desarrollo_id ?? f.id ?? null
            : props.target_id ?? props.desarrollo_id ?? null;
        return (
          featureDevId &&
          String(featureDevId) === normalized &&
          kind === "desarrollo"
        );
      });
      if (exact) return exact;
      const capaOrUnidad = list.find((f) => {
        const props = f?.properties ?? {};
        const featureDevId = props.target_id ?? props.desarrollo_id ?? null;
        const kind = inferFeatureKind(f);
        return (
          featureDevId &&
          String(featureDevId) === normalized &&
          ["capa", "unidad"].includes(kind)
        );
      });
      if (capaOrUnidad) return capaOrUnidad;
      return (
        list.find((f) => {
          const props = f?.properties ?? {};
          return (
            (props.desarrollo_id && String(props.desarrollo_id) === normalized) ||
            (props.target_id && String(props.target_id) === normalized)
          );
        }) || null
      );
    },
    [],
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

  const handleLeafletFeatureClickRef = useRef(handleLeafletFeatureClick);
  useEffect(() => {
    handleLeafletFeatureClickRef.current = handleLeafletFeatureClick;
  }, [handleLeafletFeatureClick]);

  const handleBackLevel = useCallback(() => {
    if (mapLevel === "municipio") {
      setMapLevel("estado");
      setSelectedMunicipioKey(null);
      setSelectedMunicipioGeoKey(null);
      return;
    }
    if (mapLevel === "estado") {
      setMapLevel("pais");
      setSelectedStateKey(null);
      setSelectedCountryKey(null);
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
          handleLeafletFeatureClickRef.current?.(feature, layerInstance);
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
        layerInstance.bindTooltip("", { sticky: true, direction: "top" });
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

    const municipalPolygonLayer = leaflet.geoJSON([], {
      style: getDevelopmentPolygonStyle,
      onEachFeature: (feature, layerInstance) => {
        layerInstance.on("click", () => handleLeafletFeatureClickRef.current?.(feature, layerInstance));
        layerInstance.on("mouseover", () => {
          const highlightWeight = (layerInstance.options?.weight ?? 3) + 2;
          layerInstance.setStyle({ weight: highlightWeight, fillOpacity: 0.5 });
        });
        layerInstance.on("mouseout", () => {
          layerInstance.setStyle(getDevelopmentPolygonStyle(feature));
        });
      },
    });
    municipalPolygonLayerRef.current = municipalPolygonLayer;
    municipalPolygonLayer.addTo(map);

    return () => {
      map.remove();
      layerRef.current?.clearLayers();
      municipalPolygonLayerRef.current?.clearLayers();
    };
  }, [leaflet, applyLayerStyle]);

  useEffect(() => {
    if (!leaflet || !leafletDrillControlsRef.current) {
      return;
    }
    // Evita que Leaflet capture clicks/scroll sobre los botones (Subir/Inicio).
    try {
      leaflet.DomEvent?.disableClickPropagation?.(leafletDrillControlsRef.current);
      leaflet.DomEvent?.disableScrollPropagation?.(leafletDrillControlsRef.current);
    } catch {
      /* ignore */
    }
  }, [leaflet]);

  useEffect(() => {
    const estadoKey = mapLevel === "municipio" ? selectedStateKey : undefined;
    fetchDemografiaLevel(mapLevel, estadoKey);
  }, [fetchDemografiaLevel, mapLevel, selectedStateKey]);

  const filteredDemografiaGeojson = useMemo(() => {
    if (!demografiaGeojson) return null;
    if (demografiaLevel !== mapLevel) return null;
    let features = demografiaGeojson.features || [];
    const filterByLevel = (feature) => {
      const props = feature.properties || {};
      if (mapLevel === "pais") {
        if (!propertyCountryCodes.size) return true;
        const candidate =
          (props.iso_a2 ?? props.ISO_A2 ?? props.iso_a3 ?? props.ISO_A3 ?? "").toString().trim().toUpperCase();
        return Boolean(candidate && propertyCountryCodes.has(candidate));
      }
      if (mapLevel === "estado") {
        if (!propertyStateCodes.size) return true;
        const candidate = normalizeStateCode(
          (props.cve_ent ?? props.cve_entidad ?? props.estado_cve ?? "").toString().trim(),
        );
        if (candidate && propertyStateCodes.has(candidate)) {
          return true;
        }
        if (props.cve_ent) {
          return propertyStateCodes.has(`${props.cve_ent}`.trim().toUpperCase());
        }
        return false;
      }
      if (mapLevel === "municipio") {
        if (!propertyMunicipioCodes.size) return true;
        const candidate = normalizeMunicipioCode(
          (props.cve_mun ?? props.municipio_cve ?? props.cvegeo ?? "").toString().trim(),
        );
        if (candidate && propertyMunicipioCodes.has(candidate)) {
          return true;
        }
        if (props.cvegeo) {
          return propertyMunicipioCodes.has(`${props.cvegeo}`.trim().toUpperCase());
        }
        return false;
      }
      return true;
    };
    features = features.filter(filterByLevel);
    if (!features.length) return null;
    return { ...demografiaGeojson, features };
  }, [
    demografiaGeojson,
    demografiaLevel,
    mapLevel,
    propertyCountryCodes,
    propertyStateCodes,
    propertyMunicipioCodes,
    normalizeStateCode,
    normalizeMunicipioCode,
  ]);

  useEffect(() => {
    if (!hierarchyLayerRef.current) {
      return;
    }
    hierarchyLayerRef.current.clearLayers();
    // Cuando estamos navegando desarrollo→capa→unidad en Leaflet, ocultamos la capa de demografía
    // para que no se encime con los polígonos de propiedades.
    if (leafletActiveNodeRef.current) {
      return;
    }
    if (!filteredDemografiaGeojson || (mapLevel === "municipio" && selectedMunicipioKey)) {
      return;
    }
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
  }, [filteredDemografiaGeojson, leaflet, mapLevel, selectedMunicipioKey, leafletActiveNode]);

  useEffect(() => {
    if (!hierarchyLayerRef.current) {
      return;
    }
    hierarchyLayerRef.current.eachLayer((layer) => {
      if (layer.feature) {
        applyRegionStyleRef.current?.(layer, layer.feature);
      }
    });
  }, [applyRegionStyleRef, hoveredRegionKey, mapLevel, selectedMunicipioKey, selectedStateKey]);

  const buildRegionTooltipText = useCallback(
    (key) => {
      const stats = regionStatusCounts.get(key);
      if (!stats) {
        return "Vendidas: 0 · Apartadas: 0 · Disponibles: 0";
      }
      const sold = stats.vendidas ?? 0;
      const reserved = stats.apartadas ?? 0;
      const available = stats.disponibles ?? 0;
      return `Vendidas: ${sold} · Apartadas: ${reserved} · Disponibles: ${available}`;
    },
    [regionStatusCounts],
  );

  useEffect(() => {
    if (!hierarchyLayerRef.current) {
      return;
    }
    hierarchyLayerRef.current.eachLayer((layer) => {
      if (layer.feature) {
        applyRegionStyleRef.current?.(layer, layer.feature);
        const key = resolveRegionKey(layer.feature);
        const tooltip = layer.getTooltip?.();
        if (tooltip) {
          layer.setTooltipContent(buildRegionTooltipText(key));
        }
      }
    });
  }, [
    applyRegionStyleRef,
    buildRegionTooltipText,
    hoveredRegionKey,
    mapLevel,
    regionStatusCounts,
    selectedMunicipioKey,
    selectedStateKey,
  ]);

  useEffect(() => {
    if (!markersLayerRef.current || !leaflet) {
      return;
    }
    markersLayerRef.current.clearLayers();
    // En drill-down Leaflet, apagamos marcadores para evitar "doble capa".
    if (leafletActiveNodeRef.current) {
      return;
    }
    if (mapLevel === "municipio" && municipioDevelopmentFeatures.length) {
      return;
    }
    if (mapLevel !== "municipio" || !selectedMunicipioGeoKey) {
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
  }, [
    filteredFeatures,
    leaflet,
    mapLevel,
    getFeatureColor,
    municipioDevelopmentFeatures,
    selectedMunicipioGeoKey,
    leafletActiveNode,
  ]);

  useEffect(() => {
    const layer = municipalPolygonLayerRef.current;
    const map = mapInstanceRef.current;
    if (!layer || !leaflet || !map) {
      return;
    }
    layer.clearLayers();
    if (mapLevel !== "municipio" || !municipioDevelopmentFeatures.length) {
      return;
    }
    // Si estamos haciendo drill-down (desarrollo/capa/unidad) dejamos libre la capa municipal
    // para que no tape los polígonos de la capa/unidades.
    if (leafletActiveNodeRef.current) return;
    const payload = {
      type: "FeatureCollection",
      features: municipioDevelopmentFeatures,
    };
    layer.addData(payload);
    if (typeof layer.bringToFront === "function") {
      layer.bringToFront();
    }
    try {
      const bounds = leaflet.geoJSON(payload).getBounds();
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [30, 30], maxZoom: 18 });
      }
    } catch {
      // ignore invalid bounds
    }
  }, [leaflet, mapLevel, municipioDevelopmentFeatures, leafletActiveNode]);

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
            promoteId: "id",
          });
        }
        if (!map.getLayer(fillLayerId)) {
          const baseExpr = [
            "coalesce",
            ["to-number", ["get", "min_height"], 0],
            0,
          ];
          const heightExpr = [
            "+",
            ["coalesce", ["to-number", ["get", "height"]], 0],
            ["coalesce", ["to-number", ["get", "min_height"]], 0],
          ];
          map.addLayer({
            id: fillLayerId,
            type: "fill-extrusion",
            source: sourceId,
            paint: {
              // Nota: fill-extrusion-opacity no soporta data expressions en esta versión,
              // así que ocultamos por color/altura en lugar de opacidad.
              "fill-extrusion-color": [
                "case",
                ["boolean", ["feature-state", "hidden"], false],
                "rgba(0,0,0,0)",
                ["boolean", ["feature-state", "hover"], false],
                "#22c55e",
                ["coalesce", ["get", "status_color"], ["get", "color"], "#95A5A6"],
              ],
              "fill-extrusion-height": [
                "case",
                ["boolean", ["feature-state", "hidden"], false],
                0,
                heightExpr,
              ],
              "fill-extrusion-base": [
                "case",
                ["boolean", ["feature-state", "hidden"], false],
                0,
                baseExpr,
              ],
              "fill-extrusion-opacity": 0.95,
              "fill-extrusion-vertical-gradient": false,
            },
            layout: {
              "fill-extrusion-sort-key": [
                "coalesce",
                ["to-number", ["get", "min_height"], 0],
                0,
              ],
            },
          });
        }
        if (!map.getLayer(lineLayerId)) {
          map.addLayer({
            id: lineLayerId,
            type: "line",
            source: sourceId,
            paint: {
              "line-color": [
                "case",
                ["boolean", ["feature-state", "hidden"], false],
                "rgba(0,0,0,0)",
                ["coalesce", ["get", "status_color"], "#000"],
              ],
              "line-width": 1,
              "line-opacity": 0.6,
            },
          });
        }
      };
      const applyPendingFeature = () => {
        const pendingList = pendingPayloadRef.current;
        if (Array.isArray(pendingList) && pendingList.length) {
          if (sendFeaturesToMapbox(pendingList)) {
            pendingPayloadRef.current = null;
          }
        }
        const candidate =
          pendingMapboxFeatureRef.current ??
          mapboxFeatureRef.current ??
          activeNodeRef.current;
        if (!candidate) return;
        if (sendFeatureToMapbox(candidate)) {
          pendingMapboxFeatureRef.current = null;
        }
      };
      map.on("load", () => {
        if (cancelled) return;
        map.setPitch(pitch);
        map.setBearing(bearing);
        try {
          map.setLight({
            anchor: "viewport",
            color: "white",
            intensity: 0.35,
            position: [1.5, 180, 80],
          });
        } catch {
          /* ignore light errors */
        }
        addLayerRules();
        map.on("mouseenter", fillLayerId, () => {
          map.getCanvas().style.cursor = "pointer";
        });
        map.on("mousemove", fillLayerId, (event) => {
          const feature = event?.features?.[0];
          const fid = feature?.id ?? feature?.properties?.id;
          if (!fid) return;
          const current = hoveredMapboxIdRef.current;
          if (current && current === fid) return;
          if (current) map.setFeatureState({ source: sourceId, id: current }, { hover: false });
          hoveredMapboxIdRef.current = fid;
          map.setFeatureState({ source: sourceId, id: fid }, { hover: true });
        });
        map.on("mouseleave", fillLayerId, () => {
          const current = hoveredMapboxIdRef.current;
          if (current) {
            map.setFeatureState({ source: sourceId, id: current }, { hover: false });
            hoveredMapboxIdRef.current = null;
          }
          map.getCanvas().style.cursor = "";
        });
        map.on("click", fillLayerId, (event) => {
          const clicked = event?.features?.[0];
          if (!clicked) return;
          const parentId = getFeatureId(clicked);
          const parentKind = inferFeatureKind(clicked);
          const clearIsolation = () => {
            try {
              for (const id of mapboxVisibleIdsRef.current ?? []) {
                map.setFeatureState({ source: sourceId, id }, { hidden: false });
              }
            } catch {
              /* ignore */
            }
            selectedMapboxUnitIdRef.current = null;
            mapboxPanelRef.current.selectedUnitId = null;
            mapboxPanelRef.current.selectedUnitLabel = null;
            setMapboxPanelVersion((v) => v + 1);
          };
          const isolateToUnit = (unitId) => {
            if (!unitId) return;
            const resolved =
              mapboxIdIndexRef.current?.get(String(unitId)) ??
              (mapboxVisibleIdsRef.current ?? []).find((id) => String(id) === String(unitId)) ??
              null;
            if (!resolved) {
              logMapboxEvent(
                {
                  step: "unit-isolate-miss",
                  unitId,
                  visibleCount: (mapboxVisibleIdsRef.current ?? []).length,
                  visibleSample: (mapboxVisibleIdsRef.current ?? []).slice(0, 10),
                },
                "unit-isolate",
              );
              return;
            }
            try {
              for (const id of mapboxVisibleIdsRef.current ?? []) {
                map.setFeatureState(
                  { source: sourceId, id },
                  { hidden: String(id) !== String(resolved) },
                );
              }
            } catch {
              /* ignore */
            }
            selectedMapboxUnitIdRef.current = String(resolved);
            mapboxPanelRef.current.selectedUnitId = String(resolved);
            mapboxPanelRef.current.selectedUnitLabel =
              clicked?.properties?.unidad ?? clicked?.properties?.nombre ?? null;
            setMapboxPanelVersion((v) => v + 1);
          };

          // Aislamiento: si el usuario clickea una unidad, ocultamos el resto sin reescribir el source.
          if (parentKind === "unidad") {
            const unitId =
              getFeatureId(clicked) ??
              clicked?.id ??
              clicked?.properties?.id ??
              clicked?.properties?.__feature_id ??
              clicked?.properties?.__original_id ??
              clicked?.properties?.poligono_id ??
              null;
            if (!unitId) return;
            // Mantiene el panel informativo sincronizado con la unidad clickeada.
            setMapboxFeature(clicked);
            setSelectedId(String(unitId));
            const resolved =
              mapboxIdIndexRef.current?.get(String(unitId)) ??
              (mapboxVisibleIdsRef.current ?? []).find((id) => String(id) === String(unitId)) ??
              null;
            if (!resolved) {
              logMapboxEvent(
                {
                  step: "unit-isolate-miss",
                  unitId,
                  visibleCount: (mapboxVisibleIdsRef.current ?? []).length,
                  visibleSample: (mapboxVisibleIdsRef.current ?? []).slice(0, 10),
                },
                "unit-isolate",
              );
              return;
            }
            if (selectedMapboxUnitIdRef.current === String(resolved)) {
              clearIsolation(); // toggle: segundo clic vuelve a mostrar todas
              logMapboxEvent(
                { step: "unit-isolate-clear", unitId: resolved, visibleCount: (mapboxVisibleIdsRef.current ?? []).length },
                "unit-isolate",
              );
            } else {
              isolateToUnit(resolved);
              logMapboxEvent(
                { step: "unit-isolate", unitId: resolved, visibleCount: (mapboxVisibleIdsRef.current ?? []).length },
                "unit-isolate",
              );
            }
            return;
          }

          // Si clickea fuera de unidad, limpiamos cualquier aislamiento previo.
          if (selectedMapboxUnitIdRef.current) {
            clearIsolation();
          }
          setParentStack((prev) => {
            const next = [...prev];
            const current = activeNodeRef.current;
            if (current) {
              next.push(current);
            }
            return next;
          });
          setActiveNode(clicked);
          setMapboxFeature(clicked);
          const children = getChildrenForNode(clicked);
          logMapboxEvent(
            {
              step: "click-drill",
              parentId,
              parentKind,
              childrenCount: children.length,
              childIds: children.map((c) => getFeatureId(c)),
            },
            "click-drill",
          );
          // Para desarrollo/capa seguimos usando drill-down normal.
          if (children.length) {
            sendFeaturesToMapbox(children, parentKind);
          } else {
            sendFeatureToMapbox(clicked);
          }
        });
        applyPendingFeature();
        map.resize();
      });
      // Sin filtros persistentes para unidades; noop en idle.
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
      selectedMapboxUnitIdRef.current = null;
      mapboxInstanceRef.current?.remove();
      mapboxInstanceRef.current = null;
      if (typeof window !== "undefined") {
        delete window.__mapboxInstance;
      }
    };
  }, [
    mapboxActive,
    mapboxToken,
    sendFeatureToMapbox,
    sendFeaturesToMapbox,
    getChildrenForNode,
    logMapboxEvent,
    pitch,
    bearing,
  ]);

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
    if (map && bounds && map.isStyleLoaded()) {
      applyMapboxBoundsCamera(map, bounds, { padding: 40, maxZoom: 19, duration: 650 });
    } else if (map && bounds) {
      const apply = () => {
        if (!map.isStyleLoaded()) return;
        applyMapboxBoundsCamera(map, bounds, { padding: 40, maxZoom: 19, duration: 650 });
      };
      map.once("styledata", apply);
      map.once("idle", apply);
    }
  }, [applyMapboxBoundsCamera, mapboxActive, mapboxFeature]);


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
        resetLeafletDrilldown();
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
  }, [nivelFilter, tipoFilter, resetLeafletDrilldown, geojsonRefreshVersion]);

  useEffect(() => {
    setSaleError(null);
    setSaleSuccess(null);
  }, [mapboxProps?.id]);

  useEffect(() => {
    setStatusMessage(null);
    setStatusError(null);
    setStatusLoading(false);
  }, [mapboxProps?.id]);

  useEffect(() => {
    let cancelled = false;

    const fetchLogs = async () => {
      try {
        const response = await fetch("/api/crm/ventas/logs", {
          cache: "no-store",
        });
        if (!response.ok) {
          return;
        }
        const payload = await response.json().catch(() => null);
        if (cancelled) {
          return;
        }
        const logs = Array.isArray(payload?.logs) ? payload.logs : [];
        setSaleLogs(logs);
        const latestTimestamp = logs?.[0]?.timestamp;
        if (latestTimestamp && latestTimestamp !== lastSaleTimestampRef.current) {
          lastSaleTimestampRef.current = latestTimestamp;
          refreshGeojson();
        }
      } catch (error) {
        console.warn("ventas/logs", error);
      }
    };

    fetchLogs();
    const interval = setInterval(fetchLogs, 30000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [refreshGeojson]);

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
    const shouldRenderLayer =
      !(mapLevel === "municipio" && municipioDevelopmentFeatures.length) ||
      Boolean(leafletActiveNode) ||
      leafletParentStack.length > 0;
    const baseFeatures = mapboxActive ? filteredFeatures : leafletVisibleFeatures;
    const processed = baseFeatures.map((feature) => {
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
    if (shouldRenderLayer) {
      layerRef.current.addData(payload);
      layerRef.current.eachLayer((layer) => {
        if (layer.feature) {
          applyLayerStyle(layer, layer.feature);
        }
      });
    }

    if (
      processed.length &&
      mapInstanceRef.current &&
      leaflet &&
      mapLevel === "pais" &&
      !mapboxActive &&
      !leafletActiveNode
    ) {
      const bounds = leaflet.geoJSON(payload).getBounds();
      if (bounds.isValid()) {
        mapInstanceRef.current.fitBounds(bounds, { padding: [40, 40], maxZoom: 19 });
      }
    }
  }, [
    filteredFeatures,
    leafletVisibleFeatures,
    mapboxActive,
    leafletActiveNode,
    leafletParentStack.length,
    viewMode,
    selectedId,
    leaflet,
    applyLayerStyle,
    osmbReady,
    mapLevel,
    municipioDevelopmentFeatures,
  ]);

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
                      <div className="flex items-center justify-between gap-2">
                        <button
                          type="button"
                          className="flex-1 text-left font-semibold text-slate-700 hover:text-slate-900"
                          onClick={() => {
                            const feature = findFeatureForDevelopment(dev.id);
                            if (feature) {
                              openMapboxFeature(feature);
                            }
                          }}
                        >
                          {dev.name}
                        </button>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            className="rounded border border-slate-200 px-2 py-1 text-[0.65rem] text-slate-600 hover:border-slate-400 hover:text-slate-800"
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
                            {devExpanded ? "-" : "+"}
                          </button>
                        </div>
                      </div>
                      {dev.tipoSummary && dev.tipoSummary.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1 text-[0.6rem] uppercase tracking-[0.2em] text-slate-400">
                          {dev.tipoSummary.map((item) => (
                            <span key={item}>{item}</span>
                          ))}
                        </div>
                      )}
                      {devExpanded && (
                        <div className="mt-1 space-y-3 pl-4 text-xs text-slate-600">
                          {dev.tipos.map((tipo) => {
                            const tipoExpanded = expandedTipos.has(tipo.id);
                            return (
                              <div key={tipo.id}>
                                <button
                                  type="button"
                                  className="flex w-full items-center justify-between text-left font-semibold uppercase tracking-[0.2em] text-slate-500"
                                  onClick={() =>
                                    setExpandedTipos((prev) => {
                                      const next = new Set(prev);
                                      if (next.has(tipo.id)) {
                                        next.delete(tipo.id);
                                      } else {
                                        next.add(tipo.id);
                                      }
                                      return next;
                                    })
                                  }
                                >
                                  <span>{tipo.label}</span>
                                  <span className="text-[0.6rem] text-slate-300">
                                    {tipoExpanded ? "-" : "+"}
                                  </span>
                                </button>
                                {tipoExpanded && (
                                  <div className="mt-1 space-y-1 pl-3 text-[0.8rem]">
                                    {tipo.capas.map((capa) => {
                                      const capaExpanded = expandedCapas.has(capa.id);
                                      return (
                                        <div key={capa.id} className="border-t border-slate-100 pt-2">
                                          <button
                                            type="button"
                                            className="flex w-full items-center justify-between text-left font-semibold"
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
          {!mapboxActive && (leafletActiveNode || leafletParentStack.length > 0) && (
            <div
              ref={leafletDrillControlsRef}
              className="absolute right-4 top-4 z-50 pointer-events-auto"
            >
              <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white/90 px-3 py-2 text-xs shadow-sm">
                <div className="max-w-[220px] truncate text-slate-700">
                  {leafletActiveNode?.properties?.desarrollo_nombre ??
                    leafletActiveNode?.properties?.nombre ??
                    "Explorando"}
                </div>
                <div className="flex items-center gap-2">
                  {/** Evita que Leaflet capture el click debajo del botón (mousedown/pointerdown). */}
                  <button
                    type="button"
                    className="rounded border border-slate-300 px-2 py-1 text-[0.65rem] font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
                    onPointerDown={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      // En algunos browsers Leaflet escucha eventos nativos antes del click.
                      event.nativeEvent?.stopImmediatePropagation?.();
                    }}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      event.nativeEvent?.stopImmediatePropagation?.();
                    }}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      event.nativeEvent?.stopImmediatePropagation?.();
                      ascendLeaflet();
                    }}
                    disabled={!leafletActiveNode && leafletParentStack.length === 0}
                  >
                    Subir
                  </button>
                  <button
                    type="button"
                    className="rounded border border-slate-300 px-2 py-1 text-[0.65rem] font-semibold text-slate-800 hover:bg-slate-50"
                    onPointerDown={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      event.nativeEvent?.stopImmediatePropagation?.();
                    }}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      event.nativeEvent?.stopImmediatePropagation?.();
                    }}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      event.nativeEvent?.stopImmediatePropagation?.();
                      resetLeafletDrilldown();
                    }}
                  >
                    Inicio
                  </button>
                </div>
              </div>
            </div>
          )}
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
                    {!mapboxToken && (
                      <p className="text-[0.65rem] text-rose-400">
                        Configura `NEXT_PUBLIC_MAPBOX_TOKEN` para activar esta vista.
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {parentStack.length > 0 && (
                      <button
                        type="button"
                        className="rounded border border-slate-600 px-3 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-slate-200 transition hover:bg-slate-900 hover:text-white"
                        onClick={ascendMapbox}
                      >
                        Subir
                      </button>
                    )}
                    <button
                      type="button"
                      className="rounded border border-slate-600 px-3 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-slate-200 transition hover:bg-slate-900 hover:text-white"
                      onClick={closeMapbox}
                    >
                      Cerrar
                    </button>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto px-4 py-5 text-sm text-slate-200">
                  {mapboxPanelFeature ? (
                    <>
                      <p className="text-[0.65rem] uppercase tracking-[0.25em] text-slate-400">
                        {mapboxPanelLabel}
                      </p>
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
                      {catalogItemId && (mapboxProps?.status ?? "").toString().toLowerCase() === "disponible" && (
                        <>
                          <div className="mt-6 space-y-2 border-t border-slate-800 pt-4">
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                className="flex-1 min-w-[120px] rounded px-3 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-white transition disabled:opacity-50"
                                style={{
                                  backgroundColor: STATUS_COLORS.apartado,
                                }}
                                onClick={() => handleStatusUpdate("apartado")}
                                disabled={statusLoading}
                              >
                                {statusLoading ? "Actualizando..." : "Apartar"}
                              </button>
                              <button
                                type="button"
                                className="flex-1 min-w-[120px] rounded px-3 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-white transition disabled:opacity-50"
                                style={{
                                  backgroundColor: STATUS_COLORS.reservado,
                                }}
                                onClick={() => handleStatusUpdate("reservado")}
                                disabled={statusLoading}
                              >
                                {statusLoading ? "Actualizando..." : "Reservar"}
                              </button>
                              <button
                                type="button"
                                className="flex-1 min-w-[120px] rounded px-3 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-white transition disabled:opacity-50"
                                style={{
                                  backgroundColor: STATUS_COLORS.vendido,
                                }}
                                onClick={handleOpenSaleModal}
                                disabled={saleLoading}
                              >
                                {saleLoading ? "Registrando venta..." : "Vender"}
                              </button>
                            </div>
                            {statusMessage && (
                              <p className="text-[0.65rem] text-emerald-300">{statusMessage}</p>
                            )}
                            {statusError && (
                              <p className="text-[0.65rem] text-rose-400">{statusError}</p>
                            )}
                            {saleError && (
                              <p className="text-[0.65rem] text-rose-400">{saleError}</p>
                            )}
                            {saleSuccess && (
                              <p className="text-[0.65rem] text-emerald-300">{saleSuccess}</p>
                            )}
                          </div>
                          <Dialog open={isSaleModalOpen} onOpenChange={setSaleModalOpen}>
                            <DialogContent className="min-w-[320px] max-w-lg space-y-4">
                              <DialogHeader>
                                <DialogTitle>Registrar venta vinculada a oportunidad</DialogTitle>
                                <DialogDescription>
                                  Selecciona la oportunidad lista para cerrar esta unidad y confirma el precio
                                  final antes de enviar la cotización.
                                </DialogDescription>
                              </DialogHeader>
                              <div className="space-y-4">
                                <div className="space-y-1">
                                  <p className="text-[0.65rem] uppercase tracking-[0.3em] text-slate-500">
                                    Precio final (MXN)
                                  </p>
                                  <Input
                                    type="text"
                                    value={saleModalPrice}
                                    onChange={(event) => setSaleModalPrice(event.target.value)}
                                    placeholder="Ej. 1,200,000"
                                  />
                                </div>
                                <div className="space-y-3">
                                  <div className="flex items-center justify-between">
                                    <p className="text-sm font-semibold tracking-[0.2em] uppercase text-slate-300">
                                      Oportunidades con contacto completo
                                    </p>
                                    {opportunitiesLoading && (
                                      <span className="text-[0.65rem] text-slate-400">Cargando...</span>
                                    )}
                                  </div>
                                  <div className="space-y-2">
                                    <label className="text-[0.65rem] text-slate-400" htmlFor="opportunity-select">
                                      Elige la oportunidad o cliente vinculado antes de confirmar la venta.
                                    </label>
                                    <select
                                      id="opportunity-select"
                                      className="w-full rounded border border-slate-800 bg-slate-950/80 px-3 py-2 text-sm text-white transition focus:border-emerald-500 focus:outline-none"
                                      value={saleModalOpportunityId ?? ""}
                                      onChange={(event) => {
                                        setSaleModalOpportunityId(event.target.value || null);
                                      }}
                                      disabled={opportunitiesLoading}
                                    >
                                      <option value="">Selecciona una oportunidad</option>
                                      {availableOpportunities.map((opportunity) => {
                                        const contactLabel =
                                          opportunity.contacto_nombre ??
                                          opportunity.contacto_correo ??
                                          opportunity.contacto_telefono ??
                                          "Contacto sin datos";
                                        const descriptionLabel = formatDescriptionLabel(
                                          opportunity.descripcion,
                                        );
                                        return (
                                          <option key={opportunity.id} value={opportunity.id}>
                                            {opportunity.titulo ?? `Oportunidad ${opportunity.id}`} · {contactLabel}
                                            {descriptionLabel ? ` · ${descriptionLabel}` : ""}
                                          </option>
                                        );
                                      })}
                                    </select>
                                    {saleModalError && (
                                      <p className="text-[0.65rem] text-rose-400">{saleModalError}</p>
                                    )}
                                  </div>
                                </div>
                              </div>
                              <div className="flex gap-2">
                                <Button onClick={() => setSaleModalOpen(false)} variant="secondary">
                                  Cancelar
                                </Button>
                                <Button
                                  onClick={handleConfirmSale}
                                  disabled={saleLoading || !saleModalOpportunityId}
                                >
                                  {saleLoading ? "Registrando venta..." : "Confirmar venta"}
                                </Button>
                              </div>
                            </DialogContent>
                          </Dialog>
                        </>
                      )}
                      {saleLogs.length > 0 && (
                        <div className="mt-4 text-[0.65rem] uppercase tracking-[0.2em] text-slate-400">
                          Última venta registrada:
                          <span className="block text-[0.75rem] font-semibold text-slate-200">
                            {saleLogs[0]?.timestamp
                              ? new Date(saleLogs[0].timestamp).toLocaleString()
                              : "—"}{" "}
                            · Unidad {saleLogs[0]?.unidad_id ?? "—"}
                          </span>
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="text-[0.85rem] text-slate-400">
                      Selecciona un marcador o una unidad de la lista para mostrarla en Mapbox.
                    </p>
                  )}
                  <div className="mt-5 border-t border-slate-800 pt-4">
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
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
