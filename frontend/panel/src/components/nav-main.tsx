"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  IconChevronDown,
  IconCirclePlusFilled,
  IconMail,
  type Icon,
} from "@tabler/icons-react"

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
  children?: {
    title: string
    url: string
    icon?: Icon
  }[]
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
            const itemPath = item.url.split("?", 1)[0]
            const isActive = !isPlaceholder && pathname.startsWith(itemPath)
            const childIsActive = item.children?.some((child) => pathname.startsWith(child.url.split("?", 1)[0]))
            const hasChildren = Array.isArray(item.children) && item.children.length > 0

            const content = (
              <>
                {item.icon && <item.icon />}
                <span>{item.title}</span>
              </>
            )

            if (hasChildren) {
              return (
                <SidebarMenuItem key={item.title}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <SidebarMenuButton
                        tooltip={item.title}
                        className="justify-between data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                        isActive={isActive || !!childIsActive}
                      >
                        <div className="flex items-center gap-2">
                          {item.icon && <item.icon />}
                          <span>{item.title}</span>
                        </div>
                        <IconChevronDown className="size-4 shrink-0 opacity-70" />
                      </SidebarMenuButton>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      side="right"
                      align="start"
                      sideOffset={8}
                      className="min-w-52 rounded-lg"
                    >
                      {item.children?.map((child) => (
                        <DropdownMenuItem key={child.title} asChild>
                          <Link href={child.url}>
                            {child.icon ? <child.icon className="mr-2 size-4" /> : null}
                            {child.title}
                          </Link>
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </SidebarMenuItem>
              )
            }

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
