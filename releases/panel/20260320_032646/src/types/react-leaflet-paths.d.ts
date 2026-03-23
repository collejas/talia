declare module "react-leaflet" {
  export { MapContainer, type MapContainerProps } from "react-leaflet/MapContainer";
  export { Marker, type MarkerProps } from "react-leaflet/Marker";
  export { TileLayer, type TileLayerProps } from "react-leaflet/TileLayer";
  export { Tooltip, type TooltipProps } from "react-leaflet/Tooltip";
  export { Circle, type CircleProps } from "react-leaflet/Circle";
  export { CircleMarker, type CircleMarkerProps } from "react-leaflet/CircleMarker";
  export { GeoJSON, type GeoJSONProps } from "react-leaflet/GeoJSON";
  export { FeatureGroup, type FeatureGroupProps } from "react-leaflet/FeatureGroup";
  export { useMap, useMapEvent, useMapEvents } from "react-leaflet/hooks";
}

declare module "react-leaflet/MapContainer" {
  export { MapContainer, type MapContainerProps } from "react-leaflet";
}

declare module "react-leaflet/Marker" {
  export { Marker, type MarkerProps } from "react-leaflet";
}

declare module "react-leaflet/TileLayer" {
  export { TileLayer, type TileLayerProps } from "react-leaflet";
}

declare module "react-leaflet/Tooltip" {
  export { Tooltip, type TooltipProps } from "react-leaflet";
}

declare module "react-leaflet/Circle" {
  export { Circle, type CircleProps } from "react-leaflet";
}

declare module "react-leaflet/CircleMarker" {
  export { CircleMarker, type CircleMarkerProps } from "react-leaflet";
}

declare module "react-leaflet/hooks" {
  export { useMap, useMapEvent, useMapEvents } from "react-leaflet";
}
