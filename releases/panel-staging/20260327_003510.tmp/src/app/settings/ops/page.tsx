import { redirect } from "next/navigation";

import { AppViewLayout } from "@/components/layouts/app-view-layout";
import { fetchPermissionContext } from "@/lib/auth/permissions";

import { OpsHighDemandClient } from "./page.client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function SettingsOpsPage() {
  const context = await fetchPermissionContext();
  if (!context.es_owner) {
    redirect("/unauthorized");
  }

  return (
    <AppViewLayout title="Settings · Ops Alta Demanda" withThemeToggle={false}>
      <OpsHighDemandClient />
    </AppViewLayout>
  );
}
