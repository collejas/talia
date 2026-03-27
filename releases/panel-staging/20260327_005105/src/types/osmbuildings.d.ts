import type { FeatureCollection } from "geojson";
import type { Map } from "leaflet";

type OSMBuildingsOptions = {
  position?: "bottomright" | "topleft" | "topright" | "bottomleft";
  minZoom?: number;
  maxZoom?: number;
};

type OSMBuildingsInstance = {
  show: () => void;
  hide: () => void;
  setData: (data: FeatureCollection) => void;
};

type OSMBuildingsConstructor = new (
  map: Map,
  options?: OSMBuildingsOptions,
) => OSMBuildingsInstance;

declare module "osmbuildings/dist/OSMBuildings-Leaflet.js" {
  const OSMBuildings: OSMBuildingsConstructor;
  export default OSMBuildings;
}
