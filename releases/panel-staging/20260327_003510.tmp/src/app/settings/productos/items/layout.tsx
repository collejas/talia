import type { Metadata } from "next"
import type { ReactNode } from "react"

export const metadata: Metadata = {
  title: "Productos y servicios · Items",
}

export default function SettingsProductosItemsLayout({
  children,
}: {
  children: ReactNode
}) {
  return <>{children}</>
}
