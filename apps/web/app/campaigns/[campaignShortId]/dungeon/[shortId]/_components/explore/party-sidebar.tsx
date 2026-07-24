"use client"

import {
  CheckIcon,
  CopyIcon,
  DotsThreeIcon,
  MapPinIcon,
  PencilSimpleIcon,
  PlusIcon,
  TrashIcon,
} from "@phosphor-icons/react/dist/ssr"
import Image from "next/image"
import { useState } from "react"

import {
  activeActedCharacterIds,
  deriveDungeonRoster,
  orderedPages,
  pageDeleteImpact,
  type MapGeometryEvent,
  type MapInstanceState,
  type MapPage,
} from "@workspace/game-v2/spatial"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@workspace/ui/components/alert-dialog"
import { Button } from "@workspace/ui/components/button"
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
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@workspace/ui/components/sidebar"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@workspace/ui/components/tabs"
import { avatarSrc } from "@workspace/ui/lib/portrait"
import { cn } from "@workspace/ui/lib/utils"

import type { DungeonRosterEntry } from "@/app/campaigns/[campaignShortId]/dungeon/[shortId]/_components/canvas/types"
import { AddToDelveDialog } from "@/app/campaigns/[campaignShortId]/dungeon/[shortId]/_components/explore/add-to-delve-dialog"
import { DungeonSidebarHeader } from "@/app/campaigns/[campaignShortId]/dungeon/[shortId]/_components/shell/sidebar-header"
import { RenamePageDialog } from "@/components/shared/canvas/canvas-page-tabs"
import type {
  DungeonClientState,
  DungeonClientView,
} from "@/domain/dungeon/client-state"
import {
  groupZonesByPage,
  type PageZoneGroup,
} from "@/domain/map/view/page-groups"

/**
 * The DM run console's sidebar contents for the Play phase (UNN-464 chrome pass;
 * tabbed in UNN-586) — portaled into the persistent
 * {@link import("@/app/campaigns/[campaignShortId]/dungeon/[shortId]/_components/shell/console-shell").DungeonConsoleShell}'s shared `<Sidebar>`
 * (UNN-488), which owns the `variant`/`collapsible` config. Two tabs:
 *
 * - **Players** — the party rows (member + current Zone + the two per-token
 *   turn-loop actions, Mark acted and a page-grouped Move to), plus the
 *   add-to-delve group. The shell collapses Play to an avatar rail.
 * - **Pages** — the console's page switcher + page CRUD (UNN-586): a "New Page"
 *   CTA, one row per page (name + zone count; clicking switches the board), and
 *   a per-page menu (Rename / Duplicate / Delete). Delete cascades behind a
 *   confirm carrying the impact counts, and is disabled while any of the page's
 *   Zones is occupied (the engine refuses that edit — no enabled dead buttons)
 *   or when it's the last page. All CRUD dispatches `editGeometry` events
 *   through the console's optimistic write lane.
 */
export function DungeonPartySidebar({
  roster,
  instanceState,
  dungeonState,
  dungeon,
  campaignShortId,
  absentCharacters,
  disabled,
  onMarkActed,
  onMoveToken,
  onPlaceToken,
  activePageId,
  onSelectPage,
  onGeometryEvent,
}: {
  roster: Record<string, DungeonRosterEntry>
  instanceState: MapInstanceState
  dungeonState: DungeonClientState
  dungeon: DungeonClientView
  campaignShortId: string
  absentCharacters: { id: string; name: string }[]
  disabled?: boolean
  onMarkActed: (characterId: string) => void
  onMoveToken: (characterId: string, toZoneId: string) => void
  onPlaceToken: (characterId: string, zoneId: string) => void
  activePageId: string
  onSelectPage: (pageId: string) => void
  onGeometryEvent: (event: MapGeometryEvent) => void
}) {
  // Filter to placed characters: post-combat the Instance can still carry enemy
  // tokens (keyed by combatant id, pruned for real in UNN-469), which aren't party
  // members and would otherwise show as "Unknown" rows — the sidebar peer of the
  // canvas's roster-token guard.
  const rosterIds = deriveDungeonRoster(instanceState).filter(
    (characterId) => roster[characterId] !== undefined
  )
  const acted = new Set(activeActedCharacterIds(dungeonState, rosterIds))
  const zoneGroups = groupZonesByPage(instanceState.geometry)

  return (
    <Tabs defaultValue="players" className="flex min-h-0 flex-1 flex-col">
      <DungeonSidebarHeader
        dungeonName={dungeon.name}
        campaignShortId={campaignShortId}
      >
        <div className="flex flex-col gap-2 group-data-[collapsible=icon]:hidden">
          <TabsList className="w-full">
            <TabsTrigger value="players" className="flex-1">
              Players
            </TabsTrigger>
            <TabsTrigger value="pages" className="flex-1">
              Pages
            </TabsTrigger>
          </TabsList>
          <p className="text-xs text-muted-foreground">
            {rosterIds.length} in the party · {acted.size} of {rosterIds.length}{" "}
            acted
          </p>
        </div>
      </DungeonSidebarHeader>

      <TabsContent value="players" className="flex min-h-0 flex-1 flex-col">
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
                  zoneGroups={zoneGroups}
                  disabled={disabled}
                  onMarkActed={() => onMarkActed(characterId)}
                  onMoveTo={(zoneId) => onMoveToken(characterId, zoneId)}
                />
              ))}
            </SidebarMenu>
          </SidebarGroup>

          {absentCharacters.length > 0 && (
            <SidebarGroup>
              <SidebarMenu>
                <AddToDelveDialog
                  absentCharacters={absentCharacters}
                  zoneGroups={zoneGroups}
                  disabled={disabled}
                  onPlace={onPlaceToken}
                />
              </SidebarMenu>
            </SidebarGroup>
          )}
        </SidebarContent>
      </TabsContent>

      <TabsContent value="pages" className="flex min-h-0 flex-1 flex-col">
        <PagesTab
          instanceState={instanceState}
          activePageId={activePageId}
          disabled={disabled}
          onSelectPage={onSelectPage}
          onGeometryEvent={onGeometryEvent}
        />
      </TabsContent>
    </Tabs>
  )
}

/** The Pages tab (UNN-586) — the console's page switcher + CRUD list. */
function PagesTab({
  instanceState,
  activePageId,
  disabled,
  onSelectPage,
  onGeometryEvent,
}: {
  instanceState: MapInstanceState
  activePageId: string
  disabled?: boolean
  onSelectPage: (pageId: string) => void
  onGeometryEvent: (event: MapGeometryEvent) => void
}) {
  const geometry = instanceState.geometry
  const pages = orderedPages(geometry)
  const [renaming, setRenaming] = useState<MapPage | null>(null)
  const [pendingDelete, setPendingDelete] = useState<MapPage | null>(null)

  const zoneCountFor = (pageId: string) =>
    Object.values(geometry.zones).filter((zone) => zone.pageId === pageId)
      .length
  // The engine refuses deleting a page any occupancy token stands in — mirror it
  // on the affordance (an enabled Delete that silently no-ops misleads).
  const occupiedPageIds = new Set(
    Object.values(instanceState.occupancy)
      .map((token) => geometry.zones[token.zoneId]?.pageId)
      .filter((pageId): pageId is string => pageId !== undefined)
  )

  function handleAddPage() {
    const id = crypto.randomUUID()
    onGeometryEvent({ kind: "addPage", id })
    onSelectPage(id)
  }

  function handleDuplicate(page: MapPage) {
    const newPageId = crypto.randomUUID()
    // Caller-minted id maps — the event replays deterministically through the
    // server's re-reduce, so the reducer never mints (UNN-586).
    const zoneIdMap = Object.fromEntries(
      Object.values(geometry.zones)
        .filter((zone) => zone.pageId === page.id)
        .map((zone) => [zone.id, crypto.randomUUID()])
    )
    const connectionIdMap = Object.fromEntries(
      Object.values(geometry.connections)
        .filter(
          (conn) =>
            geometry.zones[conn.fromZoneId]?.pageId === page.id &&
            geometry.zones[conn.toZoneId]?.pageId === page.id
        )
        .map((conn) => [conn.id, crypto.randomUUID()])
    )
    onGeometryEvent({
      kind: "duplicatePage",
      sourcePageId: page.id,
      newPageId,
      zoneIdMap,
      connectionIdMap,
    })
    onSelectPage(newPageId)
  }

  const deleteImpact = pendingDelete
    ? pageDeleteImpact(geometry, pendingDelete.id)
    : null

  return (
    <SidebarContent>
      <SidebarGroup>
        <Button
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={handleAddPage}
        >
          <PlusIcon />
          New Page
        </Button>
      </SidebarGroup>
      <SidebarGroup>
        <SidebarMenu>
          {pages.map((page) => {
            const active = page.id === activePageId
            const occupied = occupiedPageIds.has(page.id)
            const zoneCount = zoneCountFor(page.id)
            return (
              <SidebarMenuItem key={page.id}>
                <SidebarMenuButton
                  isActive={active}
                  onClick={() => onSelectPage(page.id)}
                >
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {page.name}
                  </span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {zoneCount} {zoneCount === 1 ? "zone" : "zones"}
                  </span>
                </SidebarMenuButton>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <SidebarMenuAction
                        aria-label={`Page actions for ${page.name}`}
                        showOnHover
                      />
                    }
                  >
                    <DotsThreeIcon weight="bold" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent side="right" align="start">
                    <DropdownMenuItem
                      disabled={disabled}
                      onClick={() => setRenaming(page)}
                    >
                      <PencilSimpleIcon />
                      Rename
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={disabled}
                      onClick={() => handleDuplicate(page)}
                    >
                      <CopyIcon />
                      Duplicate
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      variant="destructive"
                      disabled={disabled || occupied || pages.length <= 1}
                      onClick={() => setPendingDelete(page)}
                    >
                      <TrashIcon />
                      {occupied
                        ? "Delete (occupied)"
                        : pages.length <= 1
                          ? "Delete (last page)"
                          : "Delete"}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </SidebarMenuItem>
            )
          })}
        </SidebarMenu>
      </SidebarGroup>

      <RenamePageDialog
        page={renaming}
        onClose={() => setRenaming(null)}
        onRename={(pageId, name) =>
          onGeometryEvent({ kind: "renamePage", pageId, name })
        }
      />

      {/* Mount-on-open: this sidebar is SSR'd, and a closed Base UI overlay
          still consumes a useId slot server-side
          ([[2026-07-11-ssr-closed-overlay-desyncs-ids]]). */}
      {pendingDelete !== null && (
        <AlertDialog
          open
          onOpenChange={(open) => {
            if (!open) setPendingDelete(null)
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Delete {pendingDelete ? `“${pendingDelete.name}”` : "this page"}
                ?
              </AlertDialogTitle>
              <AlertDialogDescription>
                {deleteImpact
                  ? `This removes the page with its ${deleteImpact.zoneCount} ${
                      deleteImpact.zoneCount === 1 ? "zone" : "zones"
                    } and ${deleteImpact.intraConnectionCount} ${
                      deleteImpact.intraConnectionCount === 1
                        ? "connection"
                        : "connections"
                    }${
                      deleteImpact.severedCrossPageCount > 0
                        ? ` (${deleteImpact.severedCrossPageCount} cross-page ${
                            deleteImpact.severedCrossPageCount === 1
                              ? "link"
                              : "links"
                          } from other pages will also be removed)`
                        : ""
                    }.`
                  : "This removes the page."}{" "}
                This can&apos;t be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                onClick={() => {
                  if (pendingDelete) {
                    onGeometryEvent({
                      kind: "deletePage",
                      pageId: pendingDelete.id,
                    })
                  }
                  setPendingDelete(null)
                }}
              >
                Delete page
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </SidebarContent>
  )
}

function PartyRow({
  name,
  portraitUrl,
  zoneName,
  currentZoneId,
  acted,
  zoneGroups,
  disabled,
  onMarkActed,
  onMoveTo,
}: {
  name: string
  portraitUrl: string | null
  zoneName: string
  currentZoneId: string
  acted: boolean
  zoneGroups: PageZoneGroup[]
  disabled?: boolean
  onMarkActed: () => void
  onMoveTo: (zoneId: string) => void
}) {
  // Page headings only when the map actually has multiple pages — a one-page
  // dungeon's menu stays label-free (UNN-586).
  const showPageLabels = zoneGroups.length > 1
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
            {zoneGroups.map((group) => (
              <DropdownMenuGroup key={group.pageId}>
                {showPageLabels && group.zones.length > 0 && (
                  <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                    {group.pageName}
                  </DropdownMenuLabel>
                )}
                {group.zones.map((zone) => (
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
            ))}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </SidebarMenuItem>
  )
}
