import assert from "node:assert/strict";
import test from "node:test";
import {
  buildMunicipioGeoKey,
  createMapboxAscendState,
  createMapboxClosedState,
  createMapboxOpenedState,
  expandBoundsLike,
  getFeatureId,
  inferFeatureKind,
  inferFeatureLayer,
  matchesPropertyFeatureFilters,
} from "./property-map.logic.mjs";

test("filters by nivel, tipo and municipio geo key", () => {
  const feature = {
    properties: {
      nivel: 3,
      tipo_id: "lote",
      estado_cve: "5",
      municipio_cve: "12",
    },
  };

  assert.equal(
    matchesPropertyFeatureFilters(feature, {
      nivelFilter: "3",
      tipoFilter: "lote",
      mapLevel: "municipio",
      selectedMunicipioGeoKey: "05012",
    }),
    true,
  );

  assert.equal(
    matchesPropertyFeatureFilters(feature, {
      nivelFilter: "4",
      tipoFilter: "lote",
      mapLevel: "municipio",
      selectedMunicipioGeoKey: "05012",
    }),
    false,
  );

  assert.equal(
    matchesPropertyFeatureFilters(feature, {
      nivelFilter: "3",
      tipoFilter: "casa",
      mapLevel: "municipio",
      selectedMunicipioGeoKey: "05012",
    }),
    false,
  );
});

test("filters by state when municipio key is absent", () => {
  const feature = { properties: { estado_cve: "5", tipo_id: "lote", nivel: 1 } };

  assert.equal(
    matchesPropertyFeatureFilters(feature, {
      mapLevel: "municipio",
      selectedStateKey: "05",
    }),
    true,
  );

  assert.equal(
    matchesPropertyFeatureFilters(feature, {
      mapLevel: "municipio",
      selectedStateKey: "07",
    }),
    false,
  );
});

test("open, ascend and close mapbox session states", () => {
  const feature = { id: "unit-1", properties: { nombre: "Unidad 101" } };
  const opened = createMapboxOpenedState(feature);

  assert.equal(opened.mapboxActive, true);
  assert.equal(opened.mapboxLoading, true);
  assert.equal(opened.selectedId, "unit-1");
  assert.equal(opened.activeNode, feature);
  assert.deepEqual(opened.parentStack, []);

  const ascended = createMapboxAscendState({
    parentStack: [{ id: "capa-1" }, { id: "dev-1" }],
    activeNode: feature,
    mapboxFeature: feature,
  });

  assert.equal(ascended.parentStack.length, 1);
  assert.equal(ascended.activeNode.id, "dev-1");
  assert.equal(ascended.mapboxFeature.id, "dev-1");

  const closed = createMapboxClosedState();
  assert.equal(closed.mapboxActive, false);
  assert.equal(closed.mapboxLoading, false);
  assert.equal(closed.mapboxFeature, null);
  assert.equal(closed.mapLevel, "pais");
});

test("feature identity and kind inference stay stable", () => {
  assert.equal(getFeatureId({ properties: { __feature_id: 42 } }), "42");
  assert.equal(
    inferFeatureKind({ properties: { tipo: "lote", precio: 1000 } }),
    "unidad",
  );
  assert.equal(
    inferFeatureKind({ properties: { target_type: "capa" } }),
    "capa",
  );
  assert.equal(
    inferFeatureLayer({ layer: "municipio" }),
    "municipio",
  );
  assert.equal(
    buildMunicipioGeoKey({ estado_cve: "5", municipio_cve: "12" }),
    "05012",
  );
});

test("expands map bounds for development navigation limits", () => {
  const bounds = expandBoundsLike({ minLng: 1, minLat: 2, maxLng: 3, maxLat: 4 });
  assert.ok(bounds);
  assert.equal(bounds.length, 2);
  assert.ok(Math.abs(bounds[0][0] - 0.64) < 1e-9);
  assert.ok(Math.abs(bounds[0][1] - 1.64) < 1e-9);
  assert.ok(Math.abs(bounds[1][0] - 3.36) < 1e-9);
  assert.ok(Math.abs(bounds[1][1] - 4.36) < 1e-9);
  assert.equal(expandBoundsLike(null), null);
});
