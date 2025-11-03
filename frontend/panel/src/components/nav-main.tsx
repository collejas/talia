"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { IconCirclePlusFilled, IconMail, type Icon } from "@tabler/icons-react"

import { Button } from '@/components/ui/button'
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'

type NavItem = {
  title: string
  url: string
  icon?: Icon
}

export function NavMain({ items }: { items: NavItem[] }) {
  const pathname = usePathname()

  return (
    <SidebarGroup>
      <SidebarGroupContent className="flex flex-col gap-2">
        <SidebarMenu>
          <SidebarMenuItem className="flex items-center gap-2">
            <SidebarMenuButton
              tooltip="Quick Create"
              className="min-w-8 bg-primary text-primary-foreground duration-200 ease-linear hover:bg-primary/90 hover:text-primary-foreground active:bg-primary/90 active:text-primary-foreground"
            >
              <IconCirclePlusFilled />
              <span>Quick Create</span>
            </SidebarMenuButton>
            <Button
              size="icon"
              className="size-8 group-data-[collapsible=icon]:opacity-0"
              variant="outline"
            >
              <IconMail />
              <span className="sr-only">Inbox</span>
            </Button>
          </SidebarMenuItem>
        </SidebarMenu>
        <SidebarMenu>
          {items.map((item) => {
            const isPlaceholder = !item.url || item.url === "#"
            const isActive = !isPlaceholder && pathname.startsWith(item.url)

            const content = (
              <>
                {item.icon && <item.icon />}
                <span>{item.title}</span>
              </>
            )

            return (
              <SidebarMenuItem key={item.title}>
                {isPlaceholder ? (
                  <SidebarMenuButton tooltip={item.title}>{content}</SidebarMenuButton>
                ) : (
                  <SidebarMenuButton asChild tooltip={item.title} isActive={isActive}>
                    <Link href={item.url}>{content}</Link>
                  </SidebarMenuButton>
                )}
              </SidebarMenuItem>
            )
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}
