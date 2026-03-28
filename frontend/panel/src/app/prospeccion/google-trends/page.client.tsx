"use client";

import { ProspeccionViewLayout } from "@/components/layouts/prospeccion-view-layout";

import { GoogleTrendsView } from "./google-trends-view";

export default function GoogleTrendsClientPage() {
  return (
    <ProspeccionViewLayout title="Prospección · Google Trends">
      <GoogleTrendsView />
    </ProspeccionViewLayout>
  );
}
