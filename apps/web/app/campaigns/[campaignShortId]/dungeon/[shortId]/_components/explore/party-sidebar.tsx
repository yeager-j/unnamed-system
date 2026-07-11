"use client"

import { CheckIcon, MapPinIcon } from "@phosphor-icons/react/dist/ssr"
import Image from "next/image"

import {
  activeActedCharacterIds,
  deriveDungeonRoster,
  type DungeonState,
  type MapInstanceState,
} from "@workspace/game-v2/spatial"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import {
  SidebarContent,
  SidebarGroup,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@workspace/ui/components/sidebar"
import { cn } from "@workspace/ui/lib/utils"

import type { DungeonRosterEntry } from "@/app/campaigns/[campaignShortId]/dungeon/[shortId]/_components/canvas/types"
import { DungeonSidebarHeader } from "@/app/campaigns/[campaignShortId]/dungeon/[shortId]/_components/shell/sidebar-header"
import type { DungeonRow } from "@/lib/db"
import { avatarSrc } from "@/lib/ui/portrait"

/**
 * The DM run console's party panel (UNN-464 chrome pass) — the Play phase's
 * sidebar contents (header + party rows), portaled into the persistent
 * {@link import("@/app/campaigns/[campaignShortId]/dungeon/[shortId]/_components/shell/console-shell").DungeonConsoleShell}'s shared `<Sidebar>`
 * (UNN-488), which owns the `variant`/`collapsible` config. It replaced the party
 * chips that used to crowd the bottom bar (a 6–8 PC delve needs the vertical room).
 * Each member reads its current Zone; the row menu carries the two per-token
 * turn-loop actions — Mark acted and Move to — that lived in the old chip menus.
 * The shell collapses Play to an avatar rail (`collapsible="icon"`).
 *
 * The top padding clears the floating status panel that overlays the sidebar's
 * top-left corner.
 */
export function DungeonPartySidebar({
  roster,
  instanceState,
  dungeonState,
  dungeon,
  campaignShortId,
  disabled,
  onMarkActed,
  onMoveToken,
}: {
  roster: Record<string, DungeonRosterEntry>
  instanceState: MapInstanceState
  dungeonState: DungeonState
  dungeon: DungeonRow
  campaignShortId: string
  disabled?: boolean
  onMarkActed: (characterId: string) => void
  onMoveToken: (characterId: string, toZoneId: string) => void
}) {
  // Filter to placed characters: post-combat the Instance can still carry enemy
  // tokens (keyed by combatant id, pruned for real in UNN-469), which aren't party
  // members and would otherwise show as "Unknown" rows — the sidebar peer of the
  // canvas's roster-token guard.
  const rosterIds = deriveDungeonRoster(instanceState).filter(
    (characterId) => roster[characterId] !== undefined
  )
  const acted = new Set(activeActedCharacterIds(dungeonState, rosterIds))
  const zones = Object.values(instanceState.geometry.zones)

  return (
    <>
      <DungeonSidebarHeader
        dungeonName={dungeon.name}
        campaignShortId={campaignShortId}
      >
        <div className="flex flex-col">
          <h2 className="font-heading text-base font-semibold group-data-[collapsible=icon]:hidden">
            Party
          </h2>
          <p className="text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
            {rosterIds.length} in the party · {acted.size} of {rosterIds.length}{" "}
            acted
          </p>
        </div>
      </DungeonSidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu className="gap-2">
            {rosterIds.map((characterId) => (
              <PartyRow
                key={characterId}
                name={roster[characterId]?.name ?? "Unknown"}
                portraitUrl={roster[characterId]?.portraitUrl ?? null}
                zoneName={
                  instanceState.geometry.zones[
                    instanceState.occupancy[characterId]?.zoneId ?? ""
                  ]?.name ?? "—"
                }
                currentZoneId={
                  instanceState.occupancy[characterId]?.zoneId ?? ""
                }
                acted={acted.has(characterId)}
                zones={zones}
                disabled={disabled}
                onMarkActed={() => onMarkActed(characterId)}
                onMoveTo={(zoneId) => onMoveToken(characterId, zoneId)}
              />
            ))}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
    </>
  )
}

function PartyRow({
  name,
  portraitUrl,
  zoneName,
  currentZoneId,
  acted,
  zones,
  disabled,
  onMarkActed,
  onMoveTo,
}: {
  name: string
  portraitUrl: string | null
  zoneName: string
  currentZoneId: string
  acted: boolean
  zones: { id: string; name: string }[]
  disabled?: boolean
  onMarkActed: () => void
  onMoveTo: (zoneId: string) => void
}) {
  return (
    <SidebarMenuItem>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <SidebarMenuButton size="lg" disabled={disabled} tooltip={name} />
          }
        >
          <Image
            src={avatarSrc(portraitUrl, name)}
            alt=""
            width={32}
            height={32}
            className={cn(
              "size-8 shrink-0 object-cover",
              acted && "opacity-55"
            )}
          />
          <div className="flex min-w-0 flex-col">
            <span className={cn("truncate font-medium", acted && "opacity-55")}>
              {name}
            </span>
            <span className="flex items-center gap-1 truncate text-muted-foreground">
              <MapPinIcon className="size-3 shrink-0" />
              {zoneName}
            </span>
          </div>
          {acted && (
            <CheckIcon className="ml-auto size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent side="right" align="start">
          <DropdownMenuItem disabled={disabled || acted} onClick={onMarkActed}>
            <CheckIcon />
            {acted ? "Acted this turn" : "Mark acted"}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuLabel>Move to</DropdownMenuLabel>
            {zones.map((zone) => (
              <DropdownMenuItem
                key={zone.id}
                disabled={disabled || zone.id === currentZoneId}
                onClick={() => onMoveTo(zone.id)}
              >
                {zone.id === currentZoneId ? (
                  <CheckIcon />
                ) : (
                  <span className="size-4" />
                )}
                {zone.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </SidebarMenuItem>
  )
}
