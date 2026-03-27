declare module "geojson" {
  export type Geometry = {
    type: string;
    coordinates?: unknown;
    [key: string]: unknown;
  };

  export type Feature = {
    type: "Feature";
    geometry: Geometry | null;
    properties?: Record<string, unknown>;
  };

  export type FeatureCollection = {
    type: "FeatureCollection";
    features: Feature[];
  };

  export type GeoJSON = Geometry | Feature | FeatureCollection;
}
