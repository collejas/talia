import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Productos y servicios",
}

export default function SettingsProductosLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}
