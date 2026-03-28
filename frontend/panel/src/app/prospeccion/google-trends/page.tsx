import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { callCrmApi } from "@/lib/api/crm";

import GoogleTrendsClientPage from "./page.client";

export const metadata: Metadata = {
  title: "Google Trends · Prospección",
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

const ALLOWED_TENANT_ID = "00000000-0000-0000-0000-000000000001";

type PermissionContext = {
  organizacion_id?: string;
  es_admin?: boolean;
  es_owner?: boolean;
};

export default async function GoogleTrendsPage() {
  const permissions = await callCrmApi<PermissionContext>("/crm/me/permissions", {
    withUserToken: true,
  });
  if (!permissions.ok) {
    redirect("/unauthorized");
  }

  const context = permissions.data ?? {};
  const isPrivileged = Boolean(context.es_admin || context.es_owner);
  const organizacionId = typeof context.organizacion_id === "string" ? context.organizacion_id : null;
  if (!isPrivileged || organizacionId !== ALLOWED_TENANT_ID) {
    redirect("/unauthorized");
  }

  return <GoogleTrendsClientPage />;
}
