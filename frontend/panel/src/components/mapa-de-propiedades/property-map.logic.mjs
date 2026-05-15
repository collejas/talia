export function padNumeric(value, length) {
  if (value == null) {
    return "".padStart(length, "0");
  }
  const cleaned = `${value}`.replace(/\D/g, "");
  return cleaned.padStart(length, "0");
}

export function buildMunicipioGeoKey(properties) {
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

export function expandBoundsLike(bounds, paddingRatio = 0.18, minPadding = 0.01) {
  if (!bounds || typeof bounds !== "object") return null;
  const minLng = Number(bounds.minLng);
  const minLat = Number(bounds.minLat);
  const maxLng = Number(bounds.maxLng);
  const maxLat = Number(bounds.maxLat);
  if (![minLng, minLat, maxLng, maxLat].every((value) => Number.isFinite(value))) {
    return null;
  }
  const width = Math.max(maxLng - minLng, minPadding);
  const height = Math.max(maxLat - minLat, minPadding);
  const padLng = Math.max(width * paddingRatio, minPadding);
  const padLat = Math.max(height * paddingRatio, minPadding);
  const clampLng = (value) => Math.max(-180, Math.min(180, value));
  const clampLat = (value) => Math.max(-85, Math.min(85, value));
  return [
    [clampLng(minLng - padLng), clampLat(minLat - padLat)],
    [clampLng(maxLng + padLng), clampLat(maxLat + padLat)],
  ];
}

export function getFeatureId(feature) {
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

export function inferFeatureKind(feature) {
  const props = feature?.properties ?? {};
  const rawTipo = (props.target_type ?? props.tipo ?? "").toString().toLowerCase();
  const normalized = rawTipo.trim();
  if (["desarrollo", "mix", "capa", "unidad"].includes(normalized)) {
    return normalized;
  }

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

  if (props.unidad != null || props.tipo_id != null || props.precio != null || props.area_m2 != null) {
    return "unidad";
  }
  if (props.nivel != null || props.capa_nombre != null || props.altura != null) return "capa";
  if (props.desarrollo_tipo || props.desarrollo_status) return "desarrollo";
  return "unknown";
}

export function inferFeatureLayer(feature) {
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

export function matchesPropertyFeatureFilters(feature, filters = {}) {
  const {
    nivelFilter = "",
    tipoFilter = "",
    mapLevel = "pais",
    selectedMunicipioGeoKey = null,
    selectedStateKey = null,
    buildFeatureMunicipioGeoKey = buildMunicipioGeoKey,
  } = filters;

  const props = feature?.properties ?? {};
  if (nivelFilter) {
    const levelValue = props?.nivel;
    if (String(levelValue) !== nivelFilter) {
      return false;
    }
  }
  if (tipoFilter && props?.tipo_id) {
    if (props.tipo_id !== tipoFilter) {
      return false;
    }
  }
  if (mapLevel === "municipio") {
    if (selectedMunicipioGeoKey) {
      const featureGeoKey = buildFeatureMunicipioGeoKey(props);
      if (!featureGeoKey || featureGeoKey !== selectedMunicipioGeoKey) {
        return false;
      }
    } else if (selectedStateKey) {
      const featureStateKey = padNumeric(
        props.estado_cve ?? props.cve_ent ?? props.cve_entidad ?? "",
        2,
      );
      const selectedStateNormalized = padNumeric(selectedStateKey, 2);
      if (!featureStateKey || featureStateKey !== selectedStateNormalized) {
        return false;
      }
    }
  }
  return true;
}

export function createMapboxOpenedState(feature) {
  return {
    selectedId: String(feature?.id ?? ""),
    activeMarkerFeature: feature,
    mapboxFeature: feature,
    mapboxActive: true,
    mapboxLoading: true,
    activeNode: feature,
    parentStack: [],
  };
}

export function createMapboxClosedState() {
  return {
    mapboxActive: false,
    mapboxLoading: false,
    mapboxFeature: null,
    activeNode: null,
    parentStack: [],
    leafletActiveNode: null,
    leafletParentStack: [],
    hoveredRegionKey: null,
    activeMarkerFeature: null,
    selectedCountryKey: null,
    selectedStateKey: null,
    selectedMunicipioKey: null,
    selectedMunicipioGeoKey: null,
    mapLevel: "pais",
  };
}

export function createMapboxAscendState(currentState = {}) {
  const nextStack = Array.isArray(currentState.parentStack) ? [...currentState.parentStack] : [];
  const parent = nextStack.pop() ?? null;
  return {
    ...currentState,
    parentStack: nextStack,
    activeNode: parent,
    mapboxFeature: parent,
  };
}
