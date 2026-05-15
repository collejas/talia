"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  IconBuilding,
  IconChevronDown,
  IconChevronRight,
  IconLayersSelected,
  IconMapPin,
} from "@tabler/icons-react";
import "leaflet/dist/leaflet.css";
import "mapbox-gl/dist/mapbox-gl.css";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  buildMunicipioGeoKey,
  createMapboxClosedState,
  createMapboxOpenedState,
  expandBoundsLike,
  getFeatureId,
  inferFeatureKind,
  inferFeatureLayer,
  matchesPropertyFeatureFilters,
} from "./property-map.logic.mjs";

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

const DEFAULT_CENTER_MAPBOX = [-99.1332, 19.4326];
const DEFAULT_CENTER_LEAFLET = [23.6345, -102.5528];
const TILE_SOURCE = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";

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
  if (clamped <= 0) {
    return "#CBD5E1";
  }
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

function normalizeLooseString(value) {
  if (value === null || value === undefined) return null;
  const str = String(value).trim();
  return str.length ? str.toLowerCase() : null;
}

function resolveCapaSortValue(props) {
  const directLevel = Number(props?.nivel);
  if (Number.isFinite(directLevel)) {
    return directLevel;
  }
  const name = (props?.capa_nombre ?? props?.nombre ?? "").toString().trim().toLowerCase();
  if (!name) {
    return Number.POSITIVE_INFINITY;
  }
  if (name.includes("planta baja") || name === "pb") {
    return 0;
  }
  const match = name.match(/(\d+)/);
  if (match) {
    const parsed = Number(match[1]);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return Number.POSITIVE_INFINITY;
}

function resolveUnitSortValue(props) {
  const directLevel = Number(props?.nivel);
  if (Number.isFinite(directLevel)) {
    return directLevel;
  }
  const candidates = [
    props?.unidad,
    props?.nombre,
    props?.descripcion,
    props?.id,
  ]
    .map((value) => (value == null ? "" : String(value).trim()))
    .filter(Boolean);
  for (const candidate of candidates) {
    const match = candidate.match(/(\d+)/);
    if (match) {
      const parsed = Number(match[1]);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }
  return Number.POSITIVE_INFINITY;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function buildHierarchy(features) {
  const devMap = new Map();
  for (const feature of features) {
    const props = feature?.properties ?? {};
    const featureKind = inferFeatureKind(feature);
    const isUnit = featureKind === "unidad";
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
        capas: new Map(),
        capaLookup: new Map(),
      });
    }
    const dev = devMap.get(devId);
    if (!dev) continue;
    dev.tipoLabels.add(tipoLabel);
    const desarrolloTipo = normalizeLooseString(
      props.desarrollo_tipo ?? props.desarrollo_ambito ?? props.tipo_nombre ?? "",
    );
    const isVerticalDevelopment = desarrolloTipo === "vertical";

    if (!dev.tipos.has(tipoKey)) {
      dev.tipos.set(tipoKey, {
        id: tipoKey,
        label: tipoLabel,
        capas: new Map(),
      });
    }
    const tipo = dev.tipos.get(tipoKey);
    if (!tipo) continue;

    if (featureKind !== "capa" && featureKind !== "unidad") {
      continue;
    }

    const capaNombre =
      featureKind === "capa"
        ? props.nombre ?? props.capa_nombre ?? `Capa ${props.nivel ?? "0"}`
        : props.capa_nombre ?? props.nombre ?? `Capa ${props.nivel ?? "0"}`;
    const capaLevel = props.nivel ?? props.nivel_id ?? props.capa_id ?? props.capa_key ?? props.target_parent_id ?? null;
    const capaNameKey = normalizeLooseString(capaNombre) ?? null;
    const capaKey = isVerticalDevelopment
      ? `${devId}::vertical::${capaLevel ?? "na"}`
      : `${devId}::${capaNameKey ?? `capa-${capaLevel ?? "na"}`}::${capaLevel ?? "na"}`;
    const capaParentKey = props.parent_id ?? props.target_parent_id ?? props.capa_parent_id ?? props.nivel_id ?? null;
    let capa = dev.capaLookup.get(capaKey) ?? null;
    if (!capa) {
      capa = {
        id: featureKind === "capa" ? String(feature.id ?? capaKey) : capaKey,
        name: capaNombre,
        units: [],
        sortValue: resolveCapaSortValue(props),
        parentKey: capaParentKey != null ? String(capaParentKey) : null,
        feature: featureKind === "capa" ? feature : null,
      };
      dev.capaLookup.set(capaKey, capa);
      dev.capas.set(capaKey, capa);
    } else if (featureKind === "capa" && !capa.feature) {
      capa.feature = feature;
      if (feature?.id != null) {
        capa.id = String(feature.id);
      }
      if ((!capa.name || /^capa\s*\d+$/i.test(capa.name)) && capaNombre) {
        capa.name = capaNombre;
      }
    }
    if (!capa) continue;
    if (!tipo.capas.has(capaKey)) {
      tipo.capas.set(capaKey, capa);
    }
    const sortValue = resolveCapaSortValue(props);
    if (Number.isFinite(sortValue) && !Number.isFinite(capa.sortValue)) {
      capa.sortValue = sortValue;
    }

    if (featureKind === "capa") {
      continue;
    }
    if (!isUnit) {
      continue;
    }

    const status = (props.status ?? "").toLowerCase();
    const statusColor = props.status_color ?? STATUS_COLORS[status] ?? STATUS_COLORS.disponible;
    capa.units.push({
      id: feature.id,
      name: props.nombre ?? props.unidad ?? "Unidad",
      feature,
      color: statusColor,
      sortValue: resolveUnitSortValue(props),
    });
  }
  return Array.from(devMap.values())
    .map((dev) => ({
      id: dev.id,
      name: dev.name,
      tipoSummary: Array.from(dev.tipoLabels).filter(Boolean),
      unitCount: Array.from(dev.tipos.values()).reduce(
        (total, tipo) =>
          total + Array.from(tipo.capas.values()).reduce((capaTotal, capa) => capaTotal + capa.units.length, 0),
        0,
      ),
      capas: Array.from(dev.capas.values())
        .sort((a, b) => {
          const aValue = Number.isFinite(a.sortValue) ? a.sortValue : Number.POSITIVE_INFINITY;
          const bValue = Number.isFinite(b.sortValue) ? b.sortValue : Number.POSITIVE_INFINITY;
          if (aValue !== bValue) {
            return aValue - bValue;
          }
          return (a.name ?? "").localeCompare(b.name ?? "");
        }),
    }))
    .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
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
  const tileLayerRef = useRef(null);
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
  const [leafletMountVersion, setLeafletMountVersion] = useState(0);
  const [saleLoading, setSaleLoading] = useState(false);
  const [saleError, setSaleError] = useState(null);
  const [saleSuccess, setSaleSuccess] = useState(null);
  const [saleLogs, setSaleLogs] = useState([]);
  const [salesVendors, setSalesVendors] = useState([]);
  const [salesVendorsLoading, setSalesVendorsLoading] = useState(false);
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
  const [mapboxLoading, setMapboxLoading] = useState(false);
  const [mapboxFeature, setMapboxFeature] = useState(null);
  const mapboxRootFeatureRef = useRef(null);
  const pendingRegionFocusRef = useRef(null);
  const skipRegionAutoFitRef = useRef(false);
  const pendingMunicipalityOverviewRef = useRef(false);
  const [leafletActiveNode, setLeafletActiveNode] = useState(null);
  const [leafletParentStack, setLeafletParentStack] = useState([]);
  const [activeNode, setActiveNode] = useState(null);
  const [parentStack, setParentStack] = useState([]);
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
  const pendingMapboxParentKindRef = useRef(null);
  const suppressMapboxSyncRef = useRef(false);
  const suppressTreeCapaFallbackRef = useRef(false);

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
        catalog_item_id: props.catalog_item_id ?? props.catalog_item ?? null,
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
    if (mapLevel === "municipio") {
      // En nivel municipio no forzamos un recuadre a desarrollo si todavía no hay
      // un municipio seleccionado. Ese encuadre se hace sólo cuando el usuario
      // entra al drill-down del municipio.
      if (selectedMunicipioGeoKey && municipioFeatures.length) {
        fitLeafletToFeatures(municipioFeatures, { padding: [30, 30], maxZoom: 18 });
      }
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
  }, [fitLeafletToFeatures, mapLevel, selectedMunicipioGeoKey]);

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

  const applyMapboxNavigationLimits = useCallback((map, feature) => {
    if (!map || !feature?.geometry) return false;
    const bounds = getGeometryBounds(feature.geometry);
    const constrainedBounds = expandBoundsLike(bounds, 0.22, 0.015);
    if (!constrainedBounds) return false;
    try {
      if (typeof map.setMaxBounds === "function") {
        map.setMaxBounds(constrainedBounds);
      }
      if (typeof map.setRenderWorldCopies === "function") {
        map.setRenderWorldCopies(false);
      }
      if (map.dragRotate && typeof map.dragRotate.disable === "function") {
        map.dragRotate.disable();
      }
      if (map.touchZoomRotate && typeof map.touchZoomRotate.disableRotation === "function") {
        map.touchZoomRotate.disableRotation();
      }
      if (map.keyboard && typeof map.keyboard.disableRotation === "function") {
        map.keyboard.disableRotation();
      }
      return true;
    } catch {
      return false;
    }
  }, []);

  const sendFeaturesToMapbox = useCallback(
    (featureList, parentKindOverride = null, forceImmediate = false) => {
      if (!Array.isArray(featureList) || !featureList.length) {
        return false;
      }
      if (!mapboxActive && !forceImmediate) {
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
      const parentKind = parentKindOverride ?? inferFeatureKind(activeNodeRef.current);
      const childList =
        forceImmediate && parentKindOverride
          ? featureList
          : (() => {
              // Solo envia hijos inmediatos según el tipo del nodo activo/clicado para evitar mezclar niveles.
              let list = featureList;
              if (parentKind === "desarrollo") {
                list = featureList.filter((f) => inferFeatureKind(f) === "capa");
              } else if (parentKind === "capa") {
                // Solo unidades cuyo nivel coincide con la capa seleccionada
                const parentLevel = activeNodeRef.current?.properties?.nivel;
                list = featureList.filter((f) => {
                  if (inferFeatureKind(f) !== "unidad") return false;
                  const unitLevel = f?.properties?.nivel;
                  return (
                    typeof parentLevel === "number" &&
                    typeof unitLevel === "number" &&
                    Number(unitLevel) === Number(parentLevel)
                  );
                });
              }
              if (!list.length) {
                list = featureList;
              }
              return list;
            })();
      const source = map.getSource("propiedad-3d");
      if (!source || typeof source.setData !== "function") {
        pendingPayloadRef.current = featureList;
        logMapboxEvent({ step: "send-failure", reason: "no-source" }, "send-failure");
        return false;
      }
      try {
        for (const id of mapboxVisibleIdsRef.current ?? []) {
          map.setFeatureState({ source: "propiedad-3d", id }, { hidden: false, hover: false });
        }
      } catch {
        /* ignore */
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
        if (props.catalog_item_id != null && props.catalog_item_id !== "") {
          props.catalog_item_id = String(props.catalog_item_id);
        }
        clone.properties = props;
        return clone;
      });
      const payload = { type: "FeatureCollection", features: enriched };
      source.setData(payload);
      if (mapboxRootFeatureRef.current) {
        applyMapboxNavigationLimits(map, mapboxRootFeatureRef.current);
      }
      setMapboxLoading(false);
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
    (feature, parentKindOverride = null, forceImmediate = false) =>
      sendFeaturesToMapbox(feature ? [feature] : [], parentKindOverride, forceImmediate),
    [sendFeaturesToMapbox],
  );

  useEffect(() => {
    if (!mapboxActive) {
      pendingMapboxFeatureRef.current = null;
      pendingMapboxParentKindRef.current = null;
      pendingPayloadRef.current = null;
      suppressMapboxSyncRef.current = false;
      suppressTreeCapaFallbackRef.current = false;
      return;
    }
    if (suppressMapboxSyncRef.current) {
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
    const pendingKind = pendingMapboxParentKindRef.current ?? inferFeatureKind(targetFeature);
    if (!sendFeatureToMapbox(targetFeature, pendingKind)) {
      pendingMapboxFeatureRef.current = targetFeature;
    } else {
      pendingMapboxFeatureRef.current = null;
      pendingMapboxParentKindRef.current = null;
    }
  }, [mapboxActive, mapboxFeature, sendFeatureToMapbox]);

  const getChildrenForNode = useCallback(
    (node) => {
      if (!node) return [];
      const parentId = getFeatureId(node);
      const parentProps = node?.properties ?? {};
      const parentNombre = normalizeLooseString(parentProps?.nombre);
      const parentDesarrolloId = parentProps?.desarrollo_id ?? parentProps?.target_id ?? null;
      const parentDesarrolloKey = normalizeLooseString(
        parentProps?.desarrollo_nombre ??
          parentProps?.desarrollo ??
          parentProps?.fraccionamiento ??
          parentProps?.fraccionamiento_nombre,
      );
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
          const unitCapaNombre = normalizeLooseString(props?.capa_nombre);
          const unitDesarrolloId = props?.desarrollo_id ?? props?.target_id ?? null;
          const unitDesarrolloKey = normalizeLooseString(
            props?.desarrollo_nombre ??
              props?.desarrollo ??
              props?.fraccionamiento ??
              props?.fraccionamiento_nombre,
          );
          const sameDesarrollo =
            parentDesarrolloId
              ? Boolean(unitDesarrolloId && unitDesarrolloId === parentDesarrolloId)
              : parentDesarrolloKey
              ? Boolean(unitDesarrolloKey && unitDesarrolloKey === parentDesarrolloKey)
              : false;
          return (
            (sameDesarrollo &&
              ((parentId && (props.nivel_id === parentId || props.capa_id === parentId)) ||
                props.parent_id === parentId ||
                props.target_parent_id === parentId ||
                (parentNombre && unitCapaNombre && parentNombre === unitCapaNombre)))
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
    if (!parentStack.length) {
      return;
    }
    const children = getChildrenForNode(activeNode);
    if (children.length) {
      sendFeaturesToMapbox(children);
    } else {
      sendFeatureToMapbox(activeNode);
    }
  }, [activeNode, getChildrenForNode, mapboxActive, parentStack.length, sendFeatureToMapbox, sendFeaturesToMapbox]);

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
    return features.filter((feature) =>
      matchesPropertyFeatureFilters(feature, {
        nivelFilter,
        tipoFilter,
        mapLevel,
        selectedMunicipioGeoKey,
        selectedStateKey,
        buildFeatureMunicipioGeoKey: buildMunicipioGeoKey,
      }),
    );
  }, [features, nivelFilter, tipoFilter, mapLevel, selectedMunicipioGeoKey, selectedStateKey]);

  const panelFeatures = useMemo(() => {
    const hasExplicitFilter = Boolean(nivelFilter || tipoFilter);
    const hasGeoSelection = Boolean(
      mapLevel !== "pais" || selectedMunicipioGeoKey || selectedStateKey,
    );
    if (filteredFeatures.length > 0 || !features.length) {
      return filteredFeatures;
    }
    if (hasExplicitFilter || hasGeoSelection) {
      return features;
    }
    return filteredFeatures;
  }, [
    features,
    filteredFeatures,
    mapLevel,
    nivelFilter,
    selectedMunicipioGeoKey,
    selectedStateKey,
    tipoFilter,
  ]);

  useEffect(() => {
    filteredFeaturesRef.current = filteredFeatures;
  }, [filteredFeatures]);

  const leafletVisibleFeatures = useMemo(() => {
    if (mapboxActive) {
      return filteredFeatures;
    }
    if (!leafletActiveNode) {
      if (mapLevel === "municipio" && selectedMunicipioGeoKey) {
        const municipioUnits = filteredFeatures.filter(
          (feature) => inferFeatureKind(feature) === "unidad",
        );
        return municipioUnits.length ? municipioUnits : filteredFeatures;
      }
      return filteredFeatures;
    }
    const children = deriveDrillChildren(leafletActiveNode);
    return children.length ? children : [leafletActiveNode];
  }, [
    deriveDrillChildren,
    filteredFeatures,
    inferFeatureKind,
    leafletActiveNode,
    mapLevel,
    mapboxActive,
    selectedMunicipioGeoKey,
  ]);

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

  const stateMunicipalityGeoKeys = useMemo(() => {
    if (mapLevel !== "municipio" || !selectedStateKey || selectedMunicipioGeoKey) {
      return new Set();
    }
    const developmentMunicipioKeys = new Set();
    const selectedStateNormalized = `${selectedStateKey}`.trim().padStart(2, "0");
    for (const feature of features) {
      const props = feature?.properties ?? {};
      const layerValue = inferFeatureLayer(feature);
      if (!["desarrollo", "mix", "capa", "unidad"].includes(layerValue)) {
        continue;
      }
      const featureStateKey = `${props.estado_cve ?? props.cve_ent ?? props.cve_entidad ?? ""}`
        .trim()
        .padStart(2, "0");
      if (featureStateKey !== selectedStateNormalized) {
        continue;
      }
      const municipioKey = buildMunicipioGeoKey(props);
      if (municipioKey) {
        developmentMunicipioKeys.add(municipioKey);
      }
    }
    if (!developmentMunicipioKeys.size) {
      return new Set();
    }
    return developmentMunicipioKeys;
  }, [features, inferFeatureLayer, mapLevel, selectedMunicipioGeoKey, selectedStateKey]);

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

  const hierarchyTree = useMemo(() => buildHierarchy(panelFeatures), [panelFeatures]);

  useEffect(() => {
    if (!hierarchyTree.length) return;
    const summary = hierarchyTree.map((dev) => ({
      id: dev.id,
      capas: Array.isArray(dev.capas) ? dev.capas.length : 0,
      unidades: Array.isArray(dev.capas)
        ? dev.capas.reduce((acc, capa) => acc + (Array.isArray(capa.units) ? capa.units.length : 0), 0)
        : 0,
    }));
    logMapboxEvent(
      {
        hierarchy: summary,
        featureCount: panelFeatures.length,
      },
      "hierarchy-tree",
    );
  }, [hierarchyTree, logMapboxEvent, panelFeatures.length]);

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
  const mapboxKind = mapboxPanelFeature ? inferFeatureKind(mapboxPanelFeature) : null;
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
  const mapboxUnitsSummaryLabel = useMemo(() => {
    void mapboxPanelVersion;
    const list = featuresRef.current ?? [];
    let unitTotal = 0;
    let capaTotal = 0;

    if (mapboxKind === "unidad") {
      return null;
    }
    if (mapboxKind === "desarrollo") {
      const rawFeatureId = getFeatureId(mapboxPanelFeature);
      const poligonoId = mapboxProps?.poligono_id ?? null;
      const preferredId =
        mapboxProps?.desarrollo_id ??
        mapboxProps?.target_id ??
        mapboxProps?.id ??
        null;
      const desarrolloId =
        preferredId ??
        (rawFeatureId && rawFeatureId !== poligonoId ? rawFeatureId : null);
      const desarrolloNombre =
        mapboxProps?.desarrollo_nombre ??
        mapboxProps?.nombre ??
        null;
      const normalizeName = (value) => {
        if (value == null) return null;
        const normalized = String(value).trim().toLowerCase();
        return normalized.length ? normalized : null;
      };
      const desarrolloKey = normalizeName(desarrolloNombre);
      const unidades = list.filter((f) => {
        if (inferFeatureKind(f) !== "unidad") return false;
        const props = f?.properties ?? {};
        if (desarrolloId) {
          return props.desarrollo_id === desarrolloId;
        }
        if (!desarrolloKey) return false;
        const candidate = normalizeName(
          props.desarrollo_nombre ?? props.desarrollo ?? props.fraccionamiento ?? props.fraccionamiento_nombre,
        );
        return Boolean(candidate && candidate === desarrolloKey);
      });
      const capas = list.filter((f) => {
        if (inferFeatureKind(f) !== "capa") return false;
        const props = f?.properties ?? {};
        if (desarrolloId) {
          return props.desarrollo_id === desarrolloId;
        }
        if (!desarrolloKey) return false;
        const candidate = normalizeName(
          props.desarrollo_nombre ?? props.desarrollo ?? props.fraccionamiento ?? props.fraccionamiento_nombre,
        );
        return Boolean(candidate && candidate === desarrolloKey);
      });
      unitTotal = unidades.length;
      capaTotal = capas.length;
      return `Capas: ${capaTotal} · Unidades: ${unitTotal}`;
    }
    if (mapboxKind === "capa") {
      const children = getChildrenForNode(mapboxPanelFeature ?? null).filter(
        (child) => inferFeatureKind(child) === "unidad",
      );
      unitTotal = children.length;
      return `Unidades: ${unitTotal}`;
    }
    return null;
  }, [mapboxPanelVersion, mapboxKind, mapboxProps, mapboxPanelFeature, getChildrenForNode]);
  const mapboxSalesSummary = useMemo(() => {
    void mapboxPanelVersion;
    const list = featuresRef.current ?? [];
    const normalizeName = (value) => {
      if (value == null) return null;
      const normalized = String(value).trim().toLowerCase();
      return normalized.length ? normalized : null;
    };
    const sumPricesByStatus = (items) => {
      const totals = {
        total: 0,
        vendido: 0,
        disponible: 0,
        apartado: 0,
        reservado: 0,
      };
      for (const item of items) {
        const props = item?.properties ?? {};
        const price = Number(props.precio ?? 0);
        if (!Number.isFinite(price) || price <= 0) continue;
        totals.total += price;
        const status = (props.status ?? "").toString().trim().toLowerCase();
        if (totals[status] != null) {
          totals[status] += price;
        }
      }
      return totals;
    };
    const countByStatus = (items) => {
      const counts = { disponible: 0, apartado: 0, vendido: 0, reservado: 0 };
      for (const item of items) {
        const status = (item?.properties?.status ?? "").toString().trim().toLowerCase();
        if (status && counts[status] != null) {
          counts[status] += 1;
        }
      }
      return counts;
    };
    const getUnitsForDesarrollo = () => {
      const rawFeatureId = getFeatureId(mapboxPanelFeature);
      const poligonoId = mapboxProps?.poligono_id ?? null;
      const preferredId =
        mapboxProps?.desarrollo_id ??
        mapboxProps?.target_id ??
        mapboxProps?.id ??
        null;
      const desarrolloId =
        preferredId ??
        (rawFeatureId && rawFeatureId !== poligonoId ? rawFeatureId : null);
      const desarrolloNombre =
        mapboxProps?.desarrollo_nombre ??
        mapboxProps?.nombre ??
        null;
      const desarrolloKey = normalizeName(desarrolloNombre);
      return list.filter((f) => {
        if (inferFeatureKind(f) !== "unidad") return false;
        const props = f?.properties ?? {};
        if (desarrolloId) {
          return props.desarrollo_id === desarrolloId;
        }
        if (!desarrolloKey) return false;
        const candidate = normalizeName(
          props.desarrollo_nombre ?? props.desarrollo ?? props.fraccionamiento ?? props.fraccionamiento_nombre,
        );
        return Boolean(candidate && candidate === desarrolloKey);
      });
    };
    const units =
      mapboxKind === "capa"
        ? getChildrenForNode(mapboxPanelFeature ?? null).filter(
            (child) => inferFeatureKind(child) === "unidad",
          )
        : mapboxKind === "desarrollo"
        ? getUnitsForDesarrollo()
        : [];
    const unitIds = units
      .map((item) => getFeatureId(item))
      .filter((value) => typeof value === "string" && value.length);
    const totalUnits = units.length;
    const statusCounts = countByStatus(units);
    const soldUnits = statusCounts.vendido;
    const availableUnits = statusCounts.disponible;
    const percentSold =
      totalUnits > 0 ? Math.round((soldUnits / totalUnits) * 100) : 0;
    const percentAvailable =
      totalUnits > 0 ? Math.round((availableUnits / totalUnits) * 100) : 0;
    const totals = sumPricesByStatus(units);
    const totalValue = totals.total;
    const soldValue = totals.vendido;
    const apartadoValue = totals.apartado;
    const reservadoValue = totals.reservado;
    const remainingValue = Math.max(totalValue - soldValue, 0);
    return {
      totalUnits,
      soldUnits,
      availableUnits,
      percentSold,
      percentAvailable,
      totalValue,
      soldValue,
      apartadoValue,
      reservadoValue,
      remainingValue,
      unitIds,
    };
  }, [mapboxPanelVersion, mapboxKind, mapboxProps, mapboxPanelFeature, getChildrenForNode]);
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
  const formatMoney = useCallback((value) => {
    if (!Number.isFinite(value) || value === 0) {
      return "Sin precio";
    }
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: "MXN",
      maximumFractionDigits: 0,
    }).format(value);
  }, []);
  const mapboxTotalValueLabel = useMemo(() => {
    if (!mapboxSalesSummary) return null;
    return formatMoney(mapboxSalesSummary.totalValue);
  }, [formatMoney, mapboxSalesSummary]);
  const mapboxSoldValueLabel = useMemo(() => {
    if (!mapboxSalesSummary) return null;
    return formatMoney(mapboxSalesSummary.soldValue);
  }, [formatMoney, mapboxSalesSummary]);
  const mapboxRemainingValueLabel = useMemo(() => {
    if (!mapboxSalesSummary) return null;
    return formatMoney(mapboxSalesSummary.remainingValue);
  }, [formatMoney, mapboxSalesSummary]);
  const mapboxApartadoValueLabel = useMemo(() => {
    if (!mapboxSalesSummary) return null;
    return formatMoney(mapboxSalesSummary.apartadoValue);
  }, [formatMoney, mapboxSalesSummary]);
  const mapboxReservadoValueLabel = useMemo(() => {
    if (!mapboxSalesSummary) return null;
    return formatMoney(mapboxSalesSummary.reservadoValue);
  }, [formatMoney, mapboxSalesSummary]);

  const salesVendorKey = useMemo(() => {
    const ids = mapboxSalesSummary?.unitIds ?? [];
    return ids.length ? ids.join("|") : "";
  }, [mapboxSalesSummary]);

  useEffect(() => {
    if (mapboxKind === "unidad") {
      setSalesVendors([]);
      setSalesVendorsLoading(false);
      return;
    }
    if (!salesVendorKey) {
      setSalesVendors([]);
      setSalesVendorsLoading(false);
      return;
    }
    const controller = new AbortController();
    setSalesVendorsLoading(true);
    fetch("/api/crm/propiedades/ventas/vendedores", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ unidad_ids: mapboxSalesSummary?.unitIds ?? [] }),
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("ventas_vendedores_failed");
        }
        return response.json();
      })
      .then((payload) => {
        const vendedores = Array.isArray(payload?.vendedores) ? payload.vendedores : [];
        setSalesVendors(vendedores);
      })
      .catch(() => {
        setSalesVendors([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setSalesVendorsLoading(false);
        }
      });

    return () => controller.abort();
  }, [mapboxKind, mapboxSalesSummary, salesVendorKey]);
  const mapboxAreaLabel =
    mapboxProps?.area_m2 != null ? `${Number(mapboxProps.area_m2)} m²` : "Sin área registrada";
  const mapboxLevelsLabel =
    (mapboxProps?.levels ?? mapboxProps?.altura ?? mapboxProps?.height) != null
      ? `${Number(mapboxProps?.levels ?? mapboxProps?.altura ?? mapboxProps?.height)} niveles`
      : "Niveles no definidos";
  const mapboxUnitLabel = mapboxProps?.unidad ?? mapboxProps?.nombre ?? null;
  const mapboxProductoLabel = mapboxProps?.nombre ?? mapboxUnitLabel ?? null;
  const mapboxModeloLabel = mapboxProps?.modelo_nombre ?? mapboxProductoLabel ?? null;
  const mapboxTipoLabel = mapboxProps?.tipo ?? null;
  const mapboxCatalogLabel = [
    mapboxProps?.linea_nombre ? `Línea ${mapboxProps.linea_nombre}` : null,
    mapboxProps?.familia_nombre ? `Familia ${mapboxProps.familia_nombre}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const mapboxLocationLabel = mapboxProps
    ? [
        mapboxProps.municipio_nombre ?? mapboxProps.municipio_cve ?? null,
        mapboxProps.estado_nombre ?? mapboxProps.estado_cve ?? null,
        mapboxProps.pais_nombre ?? mapboxProps.pais_codigo ?? null,
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
          persona_id: selectedOpportunity?.contacto_id ?? null,
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
        typeof activeFeatureProps.municipio_nombre === "string"
          ? activeFeatureProps.municipio_nombre
          : typeof activeFeatureProps.municipio_cve === "string"
          ? activeFeatureProps.municipio_cve
          : null,
        typeof activeFeatureProps.estado_nombre === "string"
          ? activeFeatureProps.estado_nombre
          : typeof activeFeatureProps.estado_cve === "string"
          ? activeFeatureProps.estado_cve
          : null,
        typeof activeFeatureProps.pais_nombre === "string"
          ? activeFeatureProps.pais_nombre
          : typeof activeFeatureProps.pais_codigo === "string"
          ? activeFeatureProps.pais_codigo
          : null,
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
        ? 0.55
        : 0.3;
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
        skipRegionAutoFitRef.current = true;
        pendingRegionFocusRef.current = feature;
        setSelectedCountryKey(key);
        setSelectedStateKey(null);
        setSelectedMunicipioKey(null);
        setSelectedMunicipioGeoKey(null);
        setMapLevel("estado");
      } else if (mapLevel === "estado") {
        pendingRegionFocusRef.current = null;
        pendingMunicipalityOverviewRef.current = true;
        skipRegionAutoFitRef.current = false;
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
      pendingMapboxParentKindRef.current = inferFeatureKind(feature);
      const next = createMapboxOpenedState(feature);
      mapboxRootFeatureRef.current = feature;
      setSelectedId(next.selectedId);
      setActiveMarkerFeature(next.activeMarkerFeature);
      pendingMapboxFeatureRef.current = feature;
      setMapboxFeature(next.mapboxFeature);
      setMapboxActive(next.mapboxActive);
      setMapboxLoading(next.mapboxLoading);
      setActiveNode(next.activeNode);
      setParentStack(next.parentStack);
      if (mapboxInstanceRef.current) {
        applyMapboxNavigationLimits(mapboxInstanceRef.current, feature);
      }
      logMapboxEvent(
        {
          feature,
          action: "open",
        },
        "open-mapbox",
      );
    },
    [applyMapboxNavigationLimits, logMapboxEvent],
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
      return null;
    },
    [],
  );

  const closeMapbox = useCallback(() => {
    const next = createMapboxClosedState();
    mapboxRootFeatureRef.current = null;
    setMapboxActive(next.mapboxActive);
    setMapboxLoading(next.mapboxLoading);
    setMapboxFeature(next.mapboxFeature);
    setActiveNode(next.activeNode);
    setParentStack(next.parentStack);
    setLeafletActiveNode(next.leafletActiveNode);
    setLeafletParentStack(next.leafletParentStack);
    setHoveredRegionKey(next.hoveredRegionKey);
    setActiveMarkerFeature(next.activeMarkerFeature);
    setSelectedCountryKey(next.selectedCountryKey);
    setSelectedStateKey(next.selectedStateKey);
    setSelectedMunicipioKey(next.selectedMunicipioKey);
    setSelectedMunicipioGeoKey(next.selectedMunicipioGeoKey);
    setMapLevel(next.mapLevel);
    // Reinicia Leaflet por completo para evitar estados visuales corruptos tras cerrar Mapbox.
    if (mapInstanceRef.current) {
      try {
        mapInstanceRef.current.remove();
      } catch {
        // ignore teardown errors
      }
      mapInstanceRef.current = null;
    }
    osmbRef.current = null;
    layerRef.current = null;
    hierarchyLayerRef.current = null;
    markersLayerRef.current = null;
    municipalPolygonLayerRef.current = null;
    tileLayerRef.current = null;
    setLeafletMountVersion((v) => v + 1);
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
    const containerEl = mapContainerRef.current;
    // Evita errores de reuso del contenedor en remontajes rápidos (React Strict Mode/dev).
    if (containerEl && containerEl._leaflet_id) {
      try {
        delete containerEl._leaflet_id;
      } catch {
        containerEl._leaflet_id = undefined;
      }
    }
    const map = leaflet.map(mapContainerRef.current, {
      center: DEFAULT_CENTER_LEAFLET,
      zoom: 5,
      zoomControl: true,
      preferCanvas: true,
    });
    mapInstanceRef.current = map;
    const tileLayer = leaflet.tileLayer(TILE_SOURCE, {
      attribution: "&copy; OpenStreetMap contributors",
    });
    tileLayer.addTo(map);
    tileLayerRef.current = tileLayer;

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
        layerInstance.on("mouseover", () => {
          handleRegionHoverRef.current?.(feature);
          layerInstance.openTooltip?.();
        });
        layerInstance.on("mouseout", () => {
          handleRegionOutRef.current?.();
          layerInstance.closeTooltip?.();
        });
        layerInstance.bindTooltip(buildRegionTooltipContent(feature), {
          sticky: true,
          direction: "top",
          className: "region-tooltip",
        });
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
      if (mapInstanceRef.current === map) {
        mapInstanceRef.current = null;
      }
      try {
        map.off?.();
        map.remove();
      } catch {
        // ignore cleanup races when container was already reused
      }
      if (containerEl && containerEl._leaflet_id) {
        try {
          delete containerEl._leaflet_id;
        } catch {
          containerEl._leaflet_id = undefined;
        }
      }
      tileLayerRef.current = null;
      layerRef.current?.clearLayers();
      municipalPolygonLayerRef.current?.clearLayers();
    };
  }, [leaflet, applyLayerStyle, leafletMountVersion]);

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
      if (skipRegionAutoFitRef.current) {
        skipRegionAutoFitRef.current = false;
        return;
      }
      if (mapLevel === "municipio" && pendingMunicipalityOverviewRef.current) {
        pendingMunicipalityOverviewRef.current = false;
        const overviewFeatures =
          filteredDemografiaGeojson?.features?.filter((feature) =>
            stateMunicipalityGeoKeys.has(resolveRegionKey(feature)),
          ) ?? [];
        const overviewCollection = {
          type: "FeatureCollection",
          features: overviewFeatures.length ? overviewFeatures : filteredDemografiaGeojson?.features ?? [],
        };
        const overviewBounds = leaflet.geoJSON(overviewCollection).getBounds();
        if (overviewBounds.isValid()) {
          const maxZoom = 11;
          mapInstanceRef.current.fitBounds(overviewBounds, { padding: [30, 30], maxZoom });
        }
        return;
      }
      const pendingRegionFocus = pendingRegionFocusRef.current;
      if (pendingRegionFocus?.geometry) {
        const focusBounds = leaflet.geoJSON(pendingRegionFocus).getBounds();
        if (focusBounds.isValid()) {
          const maxZoom = mapLevel === "municipio" ? 15 : mapLevel === "estado" ? 10 : 7;
          mapInstanceRef.current.fitBounds(focusBounds, { padding: [30, 30], maxZoom });
        }
        pendingRegionFocusRef.current = null;
        return;
      }
      const bounds = leaflet.geoJSON(filteredDemografiaGeojson).getBounds();
      if (!bounds.isValid()) {
        return;
      }
      const maxZoom = mapLevel === "municipio" ? 15 : mapLevel === "estado" ? 10 : 7;
      mapInstanceRef.current.fitBounds(bounds, { padding: [30, 30], maxZoom });
    } catch {
      // ignore invalid bounds
    }
  }, [filteredDemografiaGeojson, leaflet, mapLevel, selectedMunicipioKey, leafletActiveNode, leafletMountVersion, stateMunicipalityGeoKeys]);

  useEffect(() => {
    if (!hierarchyLayerRef.current) {
      return;
    }
    hierarchyLayerRef.current.eachLayer((layer) => {
      if (layer.feature) {
        applyRegionStyleRef.current?.(layer, layer.feature);
      }
    });
  }, [applyRegionStyleRef, hoveredRegionKey, mapLevel, selectedMunicipioKey, selectedStateKey, leafletMountVersion]);

  const buildRegionTooltipContent = useCallback(
    (feature) => {
      const props = feature?.properties ?? {};
      const key = resolveRegionKey(feature);
      const stats = regionStatusCounts.get(key) ?? {
        vendidas: 0,
        apartadas: 0,
        disponibles: 0,
      };
      const title =
        mapLevel === "pais"
          ? props.ADMIN ?? props.NAME ?? props.nombre_largo ?? props.pais_nombre ?? props.name ?? "País"
          : mapLevel === "estado"
          ? props.nom_ent ?? props.estado_nombre ?? props.nombre ?? props.name ?? "Estado"
          : props.nom_mun ?? props.municipio_nombre ?? props.nombre ?? props.name ?? "Municipio";
      return `
        <div class="min-w-[180px]">
          <div class="text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-slate-500">${escapeHtml(
            title,
          )}</div>
          <div class="mt-1 space-y-0.5 text-[0.7rem] text-slate-700">
            <div><span class="font-semibold text-emerald-700">Vendidas:</span> ${stats.vendidas ?? 0}</div>
            <div><span class="font-semibold text-amber-700">Apartadas:</span> ${stats.apartadas ?? 0}</div>
            <div><span class="font-semibold text-sky-700">Disponibles:</span> ${stats.disponibles ?? 0}</div>
          </div>
        </div>
      `;
    },
    [mapLevel, regionStatusCounts],
  );

  useEffect(() => {
    if (!hierarchyLayerRef.current) {
      return;
    }
    hierarchyLayerRef.current.eachLayer((layer) => {
      if (layer.feature) {
        applyRegionStyleRef.current?.(layer, layer.feature);
        if (layer.setTooltipContent) {
          layer.setTooltipContent(buildRegionTooltipContent(layer.feature));
        }
      }
    });
  }, [
    applyRegionStyleRef,
    buildRegionTooltipContent,
    hoveredRegionKey,
    mapLevel,
    regionStatusCounts,
    selectedMunicipioKey,
    selectedStateKey,
    leafletMountVersion,
  ]);

  useEffect(() => {
    if (!markersLayerRef.current || !leaflet) {
      return;
    }
    markersLayerRef.current.clearLayers();
    // En la vista municipal usamos polígonos completos, no puntos.
    if (leafletActiveNodeRef.current || (mapLevel === "municipio" && selectedMunicipioGeoKey)) {
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
    if (skipRegionAutoFitRef.current) {
      skipRegionAutoFitRef.current = false;
      return;
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
    leafletMountVersion,
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
  }, [leaflet, mapLevel, municipioDevelopmentFeatures, leafletActiveNode]);

  useEffect(() => {
    if (!mapboxActive) {
      setMapboxLoading(false);
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
      const initialCenter = getFeatureCenter(initialFeature) ?? DEFAULT_CENTER_MAPBOX;
      const initialZoom = initialBounds ? 18 : 12;
      const map = new mapboxglModule.Map({
        container,
        style: "mapbox://styles/mapbox/satellite-v9",
        center: initialCenter,
        zoom: initialZoom,
        pitch: 60,
        bearing: 0,
        projection: "mercator",
        renderWorldCopies: false,
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
            return true;
          }
        }
        if (suppressMapboxSyncRef.current || suppressTreeCapaFallbackRef.current) return false;
        const candidate =
          pendingMapboxFeatureRef.current ??
          mapboxFeatureRef.current ??
          activeNodeRef.current;
        if (!candidate) return false;
        if (sendFeatureToMapbox(candidate)) {
          pendingMapboxFeatureRef.current = null;
          return true;
        }
        return false;
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
        if (mapboxRootFeatureRef.current) {
          applyMapboxNavigationLimits(map, mapboxRootFeatureRef.current);
        }
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
          suppressTreeCapaFallbackRef.current = false;
          suppressMapboxSyncRef.current = false;
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
        if (mapboxRootFeatureRef.current) {
          applyMapboxNavigationLimits(map, mapboxRootFeatureRef.current);
        }
        if (applyPendingFeature()) {
          setMapboxLoading(false);
        }
        map.resize();
      });
    })();
    return () => {
      cancelled = true;
      pendingMapboxFeatureRef.current = null;
      selectedMapboxUnitIdRef.current = null;
      suppressTreeCapaFallbackRef.current = false;
      setMapboxLoading(false);
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
    if (mapboxActive) {
      return;
    }
    const map = mapInstanceRef.current;
    if (!map || typeof map.invalidateSize !== "function") {
      return;
    }
    const runInvalidate = () => {
      try {
        map.invalidateSize({ pan: false, debounceMoveend: true });
      } catch {
        // ignore leaflet resize errors
      }
    };
    const rafId = window.requestAnimationFrame(runInvalidate);
    const timeoutId = window.setTimeout(runInvalidate, 220);
    return () => {
      window.cancelAnimationFrame(rafId);
      window.clearTimeout(timeoutId);
    };
  }, [mapboxActive]);

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
      mapLevel !== "municipio" ||
      Boolean(selectedMunicipioGeoKey) ||
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
      !leafletActiveNode &&
      !filteredDemografiaGeojson
    ) {
      const bounds = leaflet.geoJSON(payload).getBounds();
      if (bounds.isValid()) {
        mapInstanceRef.current.fitBounds(bounds, { padding: [40, 40], maxZoom: 6 });
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
    filteredDemografiaGeojson,
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

  const handleCapaSelect = useCallback(
    (capa) => {
      const feature = capa?.feature ?? null;
      if (!feature?.geometry) {
        return;
      }
      const orderedUnits = [...(capa?.units ?? [])].sort((a, b) => {
        const aValue = Number.isFinite(a.sortValue) ? a.sortValue : Number.POSITIVE_INFINITY;
        const bValue = Number.isFinite(b.sortValue) ? b.sortValue : Number.POSITIVE_INFINITY;
        if (aValue !== bValue) {
          return aValue - bValue;
        }
        return (a.name ?? "").localeCompare(b.name ?? "");
      });
      let unitFeatures = orderedUnits.map((unit) => unit?.feature).filter(Boolean);
      if (!unitFeatures.length && typeof getChildrenForNode === "function") {
        unitFeatures = getChildrenForNode(feature).filter((child) => inferFeatureKind(child) === "unidad");
      }
      pendingPayloadRef.current = null;
      pendingMapboxParentKindRef.current = null;
      pendingMapboxFeatureRef.current = null;
      suppressMapboxSyncRef.current = false;
      suppressTreeCapaFallbackRef.current = true;
      selectedMapboxUnitIdRef.current = null;
      hoveredMapboxIdRef.current = null;
      mapboxRootFeatureRef.current = feature;
      setSelectedId(String(feature.id ?? ""));
      setActiveMarkerFeature(feature);
      mapboxFeatureRef.current = null;
      setMapboxFeature(null);
      setMapboxActive(true);
      setMapboxLoading(false);
      setActiveNode(feature);
      setParentStack([]);
      zoomToFeature(feature);
      if (unitFeatures.length) {
        sendFeaturesToMapbox(unitFeatures, "capa", true);
      }
      if (mapboxInstanceRef.current) {
        applyMapboxNavigationLimits(mapboxInstanceRef.current, feature);
      }
    },
    [applyMapboxNavigationLimits, getChildrenForNode, sendFeaturesToMapbox, zoomToFeature],
  );

  const handleDevelopmentSelect = useCallback(
    (developmentFeature) => {
      if (!developmentFeature?.geometry) {
        return;
      }
      const children = getChildrenForNode(developmentFeature).filter(
        (child) => inferFeatureKind(child) === "capa",
      );
      pendingPayloadRef.current = null;
      pendingMapboxParentKindRef.current = null;
      pendingMapboxFeatureRef.current = null;
      suppressMapboxSyncRef.current = false;
      suppressTreeCapaFallbackRef.current = true;
      selectedMapboxUnitIdRef.current = null;
      hoveredMapboxIdRef.current = null;
      mapboxRootFeatureRef.current = developmentFeature;
      setSelectedId(String(developmentFeature.id ?? ""));
      setActiveMarkerFeature(developmentFeature);
      mapboxFeatureRef.current = null;
      setMapboxFeature(null);
      setMapboxActive(true);
      setMapboxLoading(false);
      setActiveNode(developmentFeature);
      setParentStack([]);
      zoomToFeature(developmentFeature);
      if (children.length) {
        sendFeaturesToMapbox(children, "desarrollo", true);
      }
      if (mapboxInstanceRef.current) {
        applyMapboxNavigationLimits(mapboxInstanceRef.current, developmentFeature);
      }
    },
    [applyMapboxNavigationLimits, getChildrenForNode, sendFeaturesToMapbox, zoomToFeature],
  );

  const PolygonContainer = ({ geom, children }) => (
    <div className="space-y-2 rounded border border-dashed border-slate-200 bg-slate-50/80 p-2">
      {children}
    </div>
  );

  const renderUnidadNode = (unit) => (
    <div key={unit.id} className="space-y-1 border-b border-dashed border-slate-200 pb-2 last:border-b-0">
      <div className="flex items-center justify-between gap-3 text-[0.75rem]">
        <div className="flex items-center gap-2">
          <span className="font-semibold">{unit.name || "Unidad sin clave"}</span>
        </div>
        <button
          type="button"
          onClick={() => handleUnitSelect(unit)}
          className="rounded border border-slate-200 px-2 py-1 text-[0.65rem] text-slate-600 transition hover:border-slate-400 hover:text-slate-800"
        >
          Ver
        </button>
      </div>
      <PolygonContainer geom={unit.feature?.geometry ?? unit.geom} />
    </div>
  );

  const renderCapaNode = (desarrollo, capa) => {
    const capaExpanded = expandedCapas.has(capa.id);
    const orderedUnits = [...(capa.units ?? [])].sort((a, b) => {
      const aValue = Number.isFinite(a.sortValue) ? a.sortValue : Number.POSITIVE_INFINITY;
      const bValue = Number.isFinite(b.sortValue) ? b.sortValue : Number.POSITIVE_INFINITY;
      if (aValue !== bValue) {
        return aValue - bValue;
      }
      return (a.name ?? "").localeCompare(b.name ?? "");
    });
    return (
      <div key={capa.id} className="space-y-2 border-b border-dashed border-slate-200 pb-3 last:border-b-0">
        <div className="flex items-center justify-between gap-3 text-[0.75rem]">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
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
              aria-label={capaExpanded ? "Ocultar unidades" : "Mostrar unidades"}
            >
              {capaExpanded ? <IconChevronDown className="size-4" /> : <IconChevronRight className="size-4" />}
            </Button>
            <div className="flex items-center gap-2">
              <IconLayersSelected className="size-4 text-slate-400" />
              <span className="font-semibold">{capa.name || `Nivel ${capa.nivel ?? "?"}`}</span>
            </div>
          </div>
          <div className="flex items-center gap-1 text-slate-500">
            <button
              type="button"
              onClick={() => handleCapaSelect(capa)}
              disabled={!capa?.feature?.geometry && !capa?.geom}
              className="rounded border border-slate-200 px-2 py-1 text-[0.65rem] text-slate-600 transition hover:border-slate-400 hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Ver
            </button>
          </div>
        </div>
        {capaExpanded && (
          <PolygonContainer geom={capa.geom}>
            <div className="space-y-2 border-l border-dashed border-slate-200 pl-5">
              {orderedUnits.length ? (
                orderedUnits.map((unit) => renderUnidadNode(unit))
              ) : (
                <p className="text-[0.65rem] text-slate-400">Sin unidades aún</p>
              )}
            </div>
          </PolygonContainer>
        )}
      </div>
    );
  };

  return (
    <div className="flex min-h-0 flex-col gap-4 lg:h-[calc(100svh-9rem)] lg:flex-row lg:items-stretch">
      <aside
        className="flex min-h-0 w-full flex-col rounded-md border border-slate-200 bg-white/60 p-3 shadow-sm shadow-slate-900/5 backdrop-blur dark:border-slate-800 dark:bg-slate-950/60 lg:w-80 lg:h-[calc(100svh-9rem)]"
        style={{ minHeight: "45vh", overflow: "hidden" }}
      >
        <div className="flex min-h-0 flex-1 flex-col gap-2">
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
                    <span className="font-semibold">Ubicación:</span>{" "}
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
              : `${panelFeatures.length} propiedades mostrando`}
          </div>
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white/40 shadow-sm transition">
            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
              <div className="space-y-2">
                {hierarchyTree.map((dev) => {
                  const devExpanded = expandedDevIds.has(dev.id);
                  const developmentFeature = findFeatureForDevelopment(dev.id);
                  return (
                    <div key={dev.id} className="border-b border-slate-100 pb-2 last:border-0">
                      <div className="flex items-center justify-between gap-3 text-[0.85rem]">
                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
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
                            aria-label={devExpanded ? "Ocultar capas" : "Mostrar capas"}
                          >
                            {devExpanded ? <IconChevronDown className="size-4" /> : <IconChevronRight className="size-4" />}
                          </Button>
                          <button
                            type="button"
                            className="flex items-center gap-2 text-left font-semibold text-slate-800 transition hover:text-slate-950"
                            onClick={() => {
                              if (developmentFeature) {
                                handleDevelopmentSelect(developmentFeature);
                              }
                            }}
                          >
                            <IconBuilding className="size-4 text-slate-400" />
                            <span>{dev.name}</span>
                          </button>
                        </div>
                        <div className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[0.6rem] font-semibold text-slate-500">
                          {dev.unitCount ?? 0}
                        </div>
                      </div>
                      {devExpanded && (
                        <PolygonContainer geom={developmentFeature?.geometry}>
                          <div className="space-y-3 border-l border-dashed border-slate-200 pl-5 text-xs text-slate-600">
                            {dev.capas.map((capa) => renderCapaNode(dev, capa))}
                          </div>
                        </PolygonContainer>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </aside>
      <section className="relative min-h-0 flex-1 min-w-0 self-stretch lg:h-[calc(100svh-9rem)]">
        <div
          className="relative h-full w-full overflow-hidden rounded-md"
          style={{ minHeight: "55vh" }}
        >
          <div
            key={`leaflet-map-${leafletMountVersion}`}
            ref={mapContainerRef}
            className={`absolute inset-0 z-10 rounded-md border border-slate-200 bg-white/10 shadow-sm shadow-slate-900/10 transition-opacity duration-200 ${
              mapboxActive ? "pointer-events-none" : "pointer-events-auto"
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
          {mapboxActive ? (
            <>
              <div
                ref={mapboxContainerRef}
                className="absolute inset-0 z-20 h-full w-full rounded-md"
              />
              {mapboxLoading && (
                <div className="absolute inset-0 z-[25] flex items-center justify-center bg-slate-950/35 backdrop-blur-[1px]">
                  <div className="rounded-lg border border-slate-700/50 bg-slate-950/80 px-4 py-2 text-xs font-semibold uppercase tracking-[0.25em] text-slate-100 shadow-lg">
                    Cargando vista 3D...
                  </div>
                </div>
              )}
              <div className="absolute inset-0 z-30 pointer-events-none">
                <div className="absolute inset-y-4 right-2 z-50 flex w-full max-w-[315px] flex-col overflow-hidden rounded-xl border border-slate-800 bg-gradient-to-b from-slate-950/80 via-slate-950/60 to-slate-950/40 p-0 shadow-xl max-h-[calc(100vh-120px)]">
              <div className="pointer-events-auto">
                <div className="sticky top-0 z-10 flex items-center justify-between rounded-t-xl border-b border-slate-800 bg-slate-950/90 px-4 py-3 backdrop-blur">
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
                      {mapboxLocationLabel && (
                        <p className="mt-1 text-[0.65rem] text-slate-400">
                          <span className="font-semibold">Ubicación:</span>{" "}
                          {mapboxLocationLabel}
                        </p>
                      )}
                      {mapboxCatalogLabel && (
                        <p className="mt-1 text-[0.65rem] text-slate-400">{mapboxCatalogLabel}</p>
                      )}
                      {mapboxUnitsSummaryLabel && (
                        <p className="mt-2 text-[0.7rem] uppercase tracking-[0.2em] text-slate-400">
                          {mapboxUnitsSummaryLabel}
                        </p>
                      )}
                      <div className="mt-4 space-y-2 text-slate-200">
                        {mapboxKind === "unidad" ? (
                          <>
                            {mapboxTipoLabel && (
                              <div className="flex items-center justify-between text-[0.75rem] uppercase tracking-[0.2em]">
                                <span>Tipo:</span>
                                <span className="font-semibold">{mapboxTipoLabel}</span>
                              </div>
                            )}
                            {mapboxProductoLabel && (
                              <div className="flex items-center justify-between text-[0.75rem] uppercase tracking-[0.2em]">
                                <span>Producto:</span>
                                <span className="font-semibold">{mapboxProductoLabel}</span>
                              </div>
                            )}
                            {mapboxModeloLabel && (
                              <div className="flex items-center justify-between text-[0.75rem] uppercase tracking-[0.2em]">
                                <span>Modelo:</span>
                                <span className="font-semibold">{mapboxModeloLabel}</span>
                              </div>
                            )}
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
                          </>
                        ) : (
                          <>
                            <div className="flex items-center justify-between text-[0.75rem] uppercase tracking-[0.2em]">
                              <span>Valor total:</span>
                              <span className="font-semibold">
                                {mapboxTotalValueLabel ?? "Sin precio"}
                                {mapboxSalesSummary && mapboxSalesSummary.totalValue > 0
                                  ? " · 100%"
                                  : " · 0%"}
                              </span>
                            </div>
                            <div className="flex items-center justify-between text-[0.75rem] uppercase tracking-[0.2em]">
                              <span>Por vender:</span>
                              <span className="font-semibold text-red-400">
                                {mapboxRemainingValueLabel && mapboxRemainingValueLabel !== "Sin precio"
                                  ? `-${mapboxRemainingValueLabel}`
                                  : mapboxRemainingValueLabel ?? "Sin precio"}
                                {mapboxSalesSummary && mapboxSalesSummary.totalValue > 0
                                  ? ` · ${Math.round(
                                      (mapboxSalesSummary.remainingValue / mapboxSalesSummary.totalValue) * 100,
                                    )}%`
                                  : " · 0%"}
                              </span>
                            </div>
                            <div className="flex items-center justify-between text-[0.75rem] uppercase tracking-[0.2em]">
                              <span>Vendido:</span>
                              <span className="font-semibold">
                                {mapboxSoldValueLabel ?? "Sin precio"}
                                {mapboxSalesSummary && mapboxSalesSummary.totalValue > 0
                                  ? ` · ${Math.round(
                                      (mapboxSalesSummary.soldValue / mapboxSalesSummary.totalValue) * 100,
                                    )}%`
                                  : " · 0%"}
                              </span>
                            </div>
                            <div className="flex items-center justify-between text-[0.75rem] uppercase tracking-[0.2em]">
                              <span>Apartado:</span>
                              <span className="font-semibold">
                                {mapboxApartadoValueLabel ?? "Sin precio"}
                                {mapboxSalesSummary && mapboxSalesSummary.totalValue > 0
                                  ? ` · ${Math.round(
                                      (mapboxSalesSummary.apartadoValue / mapboxSalesSummary.totalValue) * 100,
                                    )}%`
                                  : " · 0%"}
                              </span>
                            </div>
                            <div className="flex items-center justify-between text-[0.75rem] uppercase tracking-[0.2em]">
                              <span>Reservado:</span>
                              <span className="font-semibold">
                                {mapboxReservadoValueLabel ?? "Sin precio"}
                                {mapboxSalesSummary && mapboxSalesSummary.totalValue > 0
                                  ? ` · ${Math.round(
                                      (mapboxSalesSummary.reservadoValue / mapboxSalesSummary.totalValue) * 100,
                                    )}%`
                                  : " · 0%"}
                              </span>
                            </div>
                            <div className="flex items-center justify-between text-[0.75rem] uppercase tracking-[0.2em]">
                              <span>Vendidas:</span>
                              <span className="font-semibold">
                                {mapboxSalesSummary
                                  ? `${mapboxSalesSummary.soldUnits}/${mapboxSalesSummary.totalUnits} · ${mapboxSalesSummary.percentSold}%`
                                  : "0/0 · 0%"}
                              </span>
                            </div>
                            <div className="flex items-center justify-between text-[0.75rem] uppercase tracking-[0.2em]">
                              <span>Disponibles:</span>
                              <span className="font-semibold">
                                {mapboxSalesSummary
                                  ? `${mapboxSalesSummary.availableUnits}/${mapboxSalesSummary.totalUnits} · ${mapboxSalesSummary.percentAvailable}%`
                                  : "0/0 · 0%"}
                              </span>
                            </div>
                            {(salesVendorsLoading || salesVendors.length > 0) && (
                              <div className="mt-3 border-t border-slate-800/60 pt-3">
                                <div className="text-[0.65rem] uppercase tracking-[0.2em] text-slate-400">
                                  Vendedores
                                </div>
                                {salesVendorsLoading ? (
                                  <div className="mt-2 text-[0.7rem] text-slate-300">
                                    Cargando vendedores...
                                  </div>
                                ) : (
                                  <div className="mt-2 space-y-2 text-[0.7rem] text-slate-200">
                                    {salesVendors.map((vendor, index) => (
                                      <div
                                        key={vendor?.vendedor_id ?? `vendor-${index}`}
                                        className="flex items-center justify-between gap-2"
                                      >
                                        <span className="truncate">
                                          {vendor?.vendedor_nombre ?? "Sin vendedor"}
                                        </span>
                                        <span className="shrink-0 font-mono text-[0.65rem] text-slate-300">
                                          {(vendor?.ventas ?? 0).toString()} ·{" "}
                                          {formatMoney(Number(vendor?.monto ?? 0))}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                          </>
                        )}
                        {mapboxKind === "unidad" && mapboxProps?.descripcion && (
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
                                      Oportunidades disponibles
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
                                            {contactLabel} · {opportunity.titulo ?? `Oportunidad ${opportunity.id}`}
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
                </div>
              </div>
                </div>
              </div>
            </>
          ) : null}
          {mapboxActive && (
            <div className="absolute bottom-4 left-4 z-40 pointer-events-auto">
              <div className="w-36 rounded-md border border-slate-800/40 bg-slate-950/45 p-2 text-[0.55rem] text-slate-200 shadow-sm backdrop-blur">
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span>Inclinación</span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        className="h-5 w-5 rounded border border-slate-700/60 text-[0.6rem] text-slate-200 hover:bg-slate-800/60"
                        onClick={() => setPitch((prev) => Math.max(0, prev - 5))}
                      >
                        -
                      </button>
                      <span className="w-8 text-center font-mono">{pitch}°</span>
                      <button
                        type="button"
                        className="h-5 w-5 rounded border border-slate-700/60 text-[0.6rem] text-slate-200 hover:bg-slate-800/60"
                        onClick={() => setPitch((prev) => Math.min(80, prev + 5))}
                      >
                        +
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span>Rotación</span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        className="h-5 w-5 rounded border border-slate-700/60 text-[0.6rem] text-slate-200 hover:bg-slate-800/60"
                        onClick={() => setBearing((prev) => Math.max(-180, prev - 10))}
                      >
                        -
                      </button>
                      <span className="w-8 text-center font-mono">{bearing}°</span>
                      <button
                        type="button"
                        className="h-5 w-5 rounded border border-slate-700/60 text-[0.6rem] text-slate-200 hover:bg-slate-800/60"
                        onClick={() => setBearing((prev) => Math.min(180, prev + 10))}
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
