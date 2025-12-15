"use client"

import type { ComponentProps, CSSProperties, ReactNode } from "react"

import { AppSidebar } from "@/components/AppSidebar"
import { SiteHeader } from "@/components/site-header"
import { ThemeToggle } from "@/components/ThemeToggle"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { cn } from "@/lib/utils"

type AppViewLayoutProps = Omit<ComponentProps<typeof SidebarProvider>, "children"> & {
  /**
   * Texto a mostrar dentro del header principal.
   */
  title?: string
  /**
   * Contenido principal de la vista (cards, tablas, etc).
   */
  children?: ReactNode
  /**
   * Permite sobreescribir el header completo si se necesita algo más complejo.
   */
  header?: ReactNode
  /**
   * Ajusta el layout del contenedor interno.
   */
  contentClassName?: string
  /**
   * Variante del sidebar (hereda las variantes de AppSidebar).
   */
  sidebarVariant?: ComponentProps<typeof AppSidebar>["variant"]
  /**
    * Controla si se muestra el ThemeToggle flotante.
    */
  withThemeToggle?: boolean
}

export function AppViewLayout({
  title = "Panel",
  children,
  header,
  contentClassName,
  sidebarVariant = "inset",
  withThemeToggle = true,
  className,
  style,
  defaultOpen = false,
  ...providerProps
}: AppViewLayoutProps) {
  return (
    <SidebarProvider
      className={cn("min-h-svh", className)}
      style={
        {
          "--sidebar-width": "calc(var(--spacing) * 72)",
          "--header-height": "calc(var(--spacing) * 12)",
          ...style,
        } as CSSProperties
      }
      defaultOpen={defaultOpen}
      {...providerProps}
    >
      <AppSidebar variant={sidebarVariant} />
      <SidebarInset className="flex flex-1 flex-col">
        {header ?? <SiteHeader title={title} />}
        <div className="flex flex-1 flex-col">
          <div className="@container/main flex flex-1 flex-col gap-2">
            <div
              className={cn(
                "flex flex-col gap-4 py-4 md:gap-6 md:py-6",
                contentClassName
              )}
            >
              {children}
            </div>
          </div>
        </div>
      </SidebarInset>
      {withThemeToggle ? <ThemeToggle /> : null}
    </SidebarProvider>
  )
}
