"use client"

import { ArrowLeftIcon } from "@phosphor-icons/react/dist/ssr"
import Link from "next/link"
import type { ReactNode } from "react"

import { Button } from "@workspace/ui/components/button"
import { Separator } from "@workspace/ui/components/separator"
import { SidebarHeader } from "@workspace/ui/components/sidebar"

/**
 * The run console sidebar's header, shared across the exploration / Setup / combat
 * phases (UNN-488) — a back-to-campaign link + the truncating delve name, an optional
 * `trailing` slot (combat's Round badge), and optional `children` below the separator
 * (the exploration Party count). Portaled into the persistent
 * {@link import("@/app/campaigns/[campaignShortId]/dungeon/[shortId]/_components/shell/console-shell").DungeonConsoleShell} `<Sidebar>`.
 */
export function DungeonSidebarHeader({
  dungeonName,
  campaignShortId,
  trailing,
  children,
}: {
  dungeonName: string
  campaignShortId: string
  trailing?: ReactNode
  children?: ReactNode
}) {
  return (
    <SidebarHeader className="gap-4">
      <div className="flex items-center gap-2">
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Back to campaign"
          nativeButton={false}
          render={<Link href={`/campaigns/${campaignShortId}`} />}
        >
          <ArrowLeftIcon />
        </Button>
        <h1 className="min-w-0 flex-1 truncate font-heading text-base font-semibold">
          {dungeonName}
        </h1>
        {trailing}
      </div>
      <Separator />
      {children}
    </SidebarHeader>
  )
}
