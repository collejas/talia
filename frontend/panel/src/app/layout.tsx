import type { Metadata } from "next";
import { GlobalNotificationsProvider } from "@/components/notifications/global-notifications-provider";
import { SessionExpirationProvider } from "@/components/session/session-expiration-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tal-IA Panel",
  description: "Panel administrativo de Tal-IA",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className="antialiased theme-classic">
        <SessionExpirationProvider>
          <GlobalNotificationsProvider>{children}</GlobalNotificationsProvider>
        </SessionExpirationProvider>
      </body>
    </html>
  );
}
