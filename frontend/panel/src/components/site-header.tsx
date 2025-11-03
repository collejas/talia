import Image from 'next/image'

import { Separator } from '@/components/ui/separator'
import { SidebarTrigger } from '@/components/ui/sidebar'

export function SiteHeader() {
  return (
    <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
      <div className="flex w-full items-center gap-3 px-4 lg:px-6">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="data-[orientation=vertical]:h-4" />
        <div className="ml-auto flex items-center gap-3 text-base font-semibold">
          <Image
            src="/assets/logos/Logo8.png"
            alt="Tal-IA"
            width={32}
            height={32}
            className="rounded-lg border border-border/40 bg-surface-alt p-1"
          />
          <span>Tal-IA</span>
        </div>
      </div>
    </header>
  )
}
