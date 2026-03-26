import { redirect } from "next/navigation";

import { AppViewLayout } from "@/components/layouts/app-view-layout";
import { fetchPermissionContext } from "@/lib/auth/permissions";

import { InboxMetricsOwnerClient } from "./page.client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function InboxMetricsPage() {
  const context = await fetchPermissionContext();
  if (!context.es_owner) {
    redirect("/unauthorized");
  }

  return (
    <AppViewLayout
      title="Settings · Inbox Metrics"
      withThemeToggle={false}
      contentClassName="px-0"
    >
      <InboxMetricsOwnerClient />
    </AppViewLayout>
  );
}
