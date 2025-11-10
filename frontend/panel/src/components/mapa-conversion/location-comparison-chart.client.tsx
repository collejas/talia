"use client";

import dynamic from "next/dynamic";

import type { LocationComparisonChartProps } from "./location-comparison-chart";

const DynamicLocationComparisonChart = dynamic(
  () =>
    import("./location-comparison-chart").then(
      (module) => module.LocationComparisonChart,
    ),
  { ssr: false },
);

export function LocationComparisonChartClient(props: LocationComparisonChartProps) {
  return <DynamicLocationComparisonChart {...props} />;
}
