import type { Metadata } from "next"
import type { ReactNode } from "react"

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
      "max-image-preview": "none",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
}

export default function AuthLayout({
  children,
}: Readonly<{
  children: ReactNode
}>) {
  return children
}
