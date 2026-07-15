"use client"

import { CaretLeftIcon } from "@phosphor-icons/react/dist/ssr"
import Link from "next/link"
import { useSearchParams } from "next/navigation"

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
import { cn } from "@workspace/ui/lib/utils"

import {
  NPC_DOCUMENT_GROUPS,
  NPC_DOCUMENT_MESSAGES,
} from "@/domain/planner/npc-documents"
import type { NarrativeTextField } from "@/domain/vocab"
import { campaignNpcPath, campaignNpcsPath } from "@/lib/paths"

/**
 * An open NPC's **document rail** (UNN-579): the master-detail drill-down
 * content the world shell swaps into its sidebar on NPC detail routes — a
 * back row, the NPC's name, then Overview + the narrative documents
 * (Origins/Identity, one at a time in the pane — the builder's animus
 * experience without a third column). Selection rides `?doc=` so the
 * layout-owned rail and the page-owned editor agree through the URL, and
 * back-button steps retrace documents.
 */
export function WorldDocRail({
  campaignShortId,
  entityId,
  name,
  emptiness,
}: {
  campaignShortId: string
  entityId: string
  name: string
  /** Per-field "holds no prose yet" — mutes the row (the animus placeholder cue). */
  emptiness: Record<NarrativeTextField, boolean>
}) {
  const searchParams = useSearchParams()
  const activeDoc = searchParams.get("doc")
  const detailPath = campaignNpcPath(campaignShortId, entityId)

  return (
    <>
      <SidebarHeader className="gap-2 p-4">
        <SidebarMenuButton
          render={<Link href={campaignNpcsPath(campaignShortId)} />}
          className="text-muted-foreground"
        >
          <CaretLeftIcon className="size-3.5 shrink-0" />
          All NPCs
        </SidebarMenuButton>
        <div className="truncate px-2 font-display text-lg leading-tight font-bold text-foreground">
          {name}
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={activeDoc === null}
                  render={<Link href={detailPath} />}
                >
                  Overview
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        {NPC_DOCUMENT_GROUPS.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel className="uppercase">
              {group.label}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.fields.map((field) => (
                  <SidebarMenuItem key={field}>
                    <SidebarMenuButton
                      isActive={activeDoc === field}
                      render={<Link href={`${detailPath}?doc=${field}`} />}
                    >
                      <span
                        className={cn(
                          emptiness[field] &&
                            activeDoc !== field &&
                            "text-sidebar-foreground/50"
                        )}
                      >
                        {NPC_DOCUMENT_MESSAGES[field].label}
                      </span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
    </>
  )
}
