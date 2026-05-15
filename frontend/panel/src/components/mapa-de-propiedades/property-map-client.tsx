"use client";

import nextDynamic from "next/dynamic";

const PropertyMap = nextDynamic(
  () => import("./property-map").then((mod) => mod.PropertyMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-[calc(100svh-9rem)] items-center justify-center rounded-md border border-slate-200 bg-white/60 text-sm text-slate-500">
        Cargando mapa de propiedades...
      </div>
    ),
  },
);

export function PropertyMapClient() {
  return <PropertyMap />;
}
