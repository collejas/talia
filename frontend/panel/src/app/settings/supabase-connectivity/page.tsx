import { AppViewLayout } from "@/components/layouts/app-view-layout";

import { SupabaseConnectivityClient } from "./page.client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function SupabaseConnectivityPage() {
  return (
    <AppViewLayout title="Settings · Supabase Connectivity" withThemeToggle={false}>
      <SupabaseConnectivityClient />
    </AppViewLayout>
  );
}
