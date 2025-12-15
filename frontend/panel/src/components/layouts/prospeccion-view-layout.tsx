import type { ReactNode } from "react"

import { AppViewLayout } from "./app-view-layout"

type ProspeccionViewLayoutProps = {
  title: string
  children: ReactNode
}

export function ProspeccionViewLayout({ title, children }: ProspeccionViewLayoutProps) {
  return (
    <AppViewLayout title={title}>
      <div className="space-y-4 px-4 pb-10 pt-4 md:px-6 lg:px-8">
        {children}
      </div>
    </AppViewLayout>
  )
}
