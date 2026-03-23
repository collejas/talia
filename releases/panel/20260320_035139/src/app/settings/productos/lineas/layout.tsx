import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Líneas de negocio",
};

export default function LineasLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
