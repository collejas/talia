import type { Metadata } from "next";
import { GlobalNotificationsProvider } from "@/components/notifications/global-notifications-provider";
import { SessionExpirationProvider } from "@/components/session/session-expiration-provider";
import { resolveOrganizacionId } from "@/lib/settings/org";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tal-IA Panel",
  description: "Panel administrativo de Tal-IA",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const tenantId = await resolveOrganizacionId()
  return (
    <html lang="es">
      <body className="antialiased theme-classic">
        <SessionExpirationProvider>
          <GlobalNotificationsProvider tenantId={tenantId}>{children}</GlobalNotificationsProvider>
        </SessionExpirationProvider>
      </body>
    </html>
  );
}
