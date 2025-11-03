"use client"

import Image from 'next/image'
import * as React from "react"
import {
  IconChartBar,
  IconDatabase,
  IconFileWord,
  IconFolder,
  IconHelp,
  IconListDetails,
  IconReport,
  IconSearch,
  IconSettings,
  IconUsers,
  IconCalendar,
  IconMessageCircle,
} from "@tabler/icons-react"

import { NavDocuments } from '@/components/nav-documents'
import { NavMain } from '@/components/nav-main'
import { NavSecondary } from '@/components/nav-secondary'
import { NavUser } from '@/components/nav-user'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'

const data = {
  user: {
    name: "Soporte técnico",
    email: "administracion@tal-ia.mx",
    avatar: "/assets/logos/Logo8.png",
  },
  navMain: [
    { title: "Dashboard", url: "/dashboard", icon: IconChartBar },
    { title: "Embudo", url: "#", icon: IconListDetails },
    { title: "Leads", url: "#", icon: IconUsers },
    { title: "Agenda", url: "#", icon: IconCalendar },
    { title: "Visitas", url: "#", icon: IconMessageCircle },
    { title: "Proyectos", url: "#", icon: IconFolder },
  ],
  documents: [
    { name: "Data Library", url: "#", icon: IconDatabase },
    { name: "Reports", url: "#", icon: IconReport },
    { name: "Templates", url: "#", icon: IconFileWord },
  ],
  navSecondary: [
    { title: "Settings", url: "#", icon: IconSettings },
    { title: "Get Help", url: "#", icon: IconHelp },
    { title: "Search", url: "#", icon: IconSearch },
  ],
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild className="data-[slot=sidebar-menu-button]:!p-1.5">
              <a href="#" className="flex items-center gap-3">
                <Image
                  src="/assets/logos/Logo8.png"
                  alt="Tal-IA"
                  width={36}
                  height={36}
                  className="rounded-lg border border-border/50 bg-surface-alt p-1"
                />
                <span className="text-base font-semibold">Tal-IA</span>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={data.navMain} />
        <NavDocuments items={data.documents} />
        <NavSecondary items={data.navSecondary} className="mt-auto" />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={data.user} />
      </SidebarFooter>
    </Sidebar>
  )
}
