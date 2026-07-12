import { MoonStarsIcon } from "@phosphor-icons/react/dist/ssr"
import Link from "next/link"

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@workspace/ui/components/avatar"
import {
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@workspace/ui/components/sidebar"
import { initials } from "@workspace/ui/lib/initials"

import type { RosterRowView } from "@/domain/planner/view/roster"
import { characterPath } from "@/lib/paths"

/**
 * The Day Runner's sidebar panel (handoff §"Downtime resolution workspace"):
 * the day pill + campaign name up top, then the placed characters. Phase 1
 * renders the roster as sheet links; the per-slot resolution pips and "The
 * day" progress footer arrive with recorded activities (phase 3). A server
 * component — the shell portals it into the panel slot client-side.
 */
export function RosterPanel({
  campaignName,
  dayLine,
  roster,
}: {
  campaignName: string
  dayLine: string | null
  roster: RosterRowView[]
}) {
  return (
    <>
      <SidebarHeader className="gap-2 p-4">
        {dayLine ? (
          <div className="flex items-center gap-1.5 self-start rounded-full border px-2.5 py-0.5 font-mono text-xs text-muted-foreground">
            <MoonStarsIcon className="size-3.5 text-gold" />
            {dayLine}
          </div>
        ) : null}
        <div className="font-display text-lg leading-tight text-foreground">
          {campaignName}
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>
            Placed characters · {roster.length}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            {roster.length === 0 ? (
              <p className="px-2 py-1 text-sm text-muted-foreground">
                No characters placed yet — players place theirs from their
                sheet, or you can from Manage.
              </p>
            ) : (
              <SidebarMenu>
                {roster.map((row) => (
                  <SidebarMenuItem key={row.id}>
                    <SidebarMenuButton
                      size="lg"
                      render={<Link href={characterPath(row.shortId)} />}
                    >
                      <Avatar className="size-8 rounded-md">
                        {row.portraitUrl ? (
                          <AvatarImage src={row.portraitUrl} alt="" />
                        ) : null}
                        <AvatarFallback className="rounded-md">
                          {initials(row.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="grid flex-1 text-left leading-tight">
                        <span className="truncate font-medium">{row.name}</span>
                        <span className="truncate text-xs text-muted-foreground">
                          {row.subtitle}
                        </span>
                      </div>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            )}
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </>
  )
}
