import type { LatLngExpression } from "leaflet"

declare namespace L {
  class Marker {
    constructor(latLng: LatLngExpression)
    getLatLng(): { lat: number; lng: number }
  }
}

declare module "leaflet" {
  interface Map {
    setView(latLng: LatLngExpression, zoom?: number, options?: ZoomPanOptions): this
  }

  interface TileLayerOptions {
    attribution?: string
  }

  interface CircleOptions {
    radius?: number
  }

  interface CircleMarkerOptions {
    radius?: number
  }

  interface TooltipOptions {
    direction?: string
  }
}
