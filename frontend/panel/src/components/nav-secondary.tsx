"use client"

import Link from "next/link"
import * as React from "react"
import { IconChevronDown, type Icon } from "@tabler/icons-react"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"

type SecondaryItem = {
  title: string
  url?: string
  icon: Icon
  children?: {
    title: string
    url: string
    icon?: Icon
  }[]
}

export function NavSecondary({
  items,
  ...props
}: {
  items: SecondaryItem[]
} & React.ComponentPropsWithoutRef<typeof SidebarGroup>) {
  return (
    <SidebarGroup {...props}>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => {
            const hasChildren = Array.isArray(item.children) && item.children.length > 0

            if (hasChildren) {
              return (
                <SidebarMenuItem key={item.title}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <SidebarMenuButton className="justify-between data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground">
                        <div className="flex items-center gap-2">
                          <item.icon />
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

            const content = (
              <>
                <item.icon />
                <span>{item.title}</span>
              </>
            )

            return (
              <SidebarMenuItem key={item.title}>
                {item.url && item.url !== "#" ? (
                  <SidebarMenuButton asChild>
                    <Link href={item.url}>{content}</Link>
                  </SidebarMenuButton>
                ) : (
                  <SidebarMenuButton>{content}</SidebarMenuButton>
                )}
              </SidebarMenuItem>
            )
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}
