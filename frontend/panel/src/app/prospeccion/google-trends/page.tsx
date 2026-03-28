import type { Metadata } from "next";

import GoogleTrendsClientPage from "./page.client";

export const metadata: Metadata = {
  title: "Google Trends · Prospección",
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function GoogleTrendsPage() {
  return <GoogleTrendsClientPage />;
}
