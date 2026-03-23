declare module "leaflet" {
  export type LatLngExpression = [number, number];

  export interface FitBoundsOptions {
    paddingTopLeft?: LatLngExpression;
    paddingBottomRight?: LatLngExpression;
    padding?: LatLngExpression;
    maxZoom?: number;
  }

  export interface MapOptions {
    center?: LatLngExpression;
    zoom?: number;
    minZoom?: number;
    maxZoom?: number;
    [key: string]: unknown;
  }

  export interface Layer {
    bindTooltip?: (content: string, options?: { sticky?: boolean }) => void;
  }

  export type Path = Layer;

  export class Map {}
}
