import { redirect } from "next/navigation";

import { AppViewLayout } from "@/components/layouts/app-view-layout";
import { fetchPermissionContext } from "@/lib/auth/permissions";

import { OpenAiCostsPageClient } from "./page.client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function SettingsOpenAiCostsPage() {
  const context = await fetchPermissionContext();
  const permissions = new Set((context.permisos ?? []).map((permission) => permission.toLowerCase()));
  const allowed = context.es_owner || context.es_admin || permissions.has("reports.view");

  if (!allowed) {
    redirect("/unauthorized");
  }

  return (
    <AppViewLayout title="Settings · Costos OpenAI">
      <OpenAiCostsPageClient />
    </AppViewLayout>
  );
}
