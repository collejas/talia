import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Google busqueda · Prospección",
}

export const dynamic = "force-dynamic"
export const revalidate = 0

export { default } from "./page.client"
