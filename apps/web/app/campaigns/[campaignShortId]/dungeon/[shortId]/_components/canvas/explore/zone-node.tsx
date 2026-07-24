"use client"

import {
  EyeIcon,
  EyeSlashIcon,
  NoteIcon,
  UsersThreeIcon,
} from "@phosphor-icons/react/dist/ssr"
import { NodeToolbar, Position, type Node, type NodeProps } from "@xyflow/react"
import { useState } from "react"

import type { MapZone } from "@workspace/game-v2/spatial"
import { Button } from "@workspace/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { Separator } from "@workspace/ui/components/separator"

import type { DungeonPageLink } from "@/app/campaigns/[campaignShortId]/dungeon/[shortId]/_components/canvas/build-nodes"
import { useDungeonCanvas } from "@/app/campaigns/[campaignShortId]/dungeon/[shortId]/_components/canvas/explore/context"
import { FloatingEdgeHandles } from "@/app/campaigns/[campaignShortId]/dungeon/[shortId]/_components/canvas/floating-edge-handles"
import { useConnectionHighlight } from "@/components/shared/canvas/hovered-connection-context"
import { OccupantToken } from "@/components/shared/canvas/set-piece/occupant-chips"
import { PageLinkChips } from "@/components/shared/canvas/set-piece/page-link-chip"
import { ZoneSetPiece } from "@/components/shared/canvas/set-piece/zone-set-piece"
import { exploreZoneView } from "@/domain/dungeon/view/set-piece-view"
import { type Pool } from "@/domain/pool"

export type DungeonZoneToken = {
  characterId: string
  name: string
  portraitUrl: string | null
  /** Current/max vitals for the token's health bars (UNN-489); absent ⇒ no bars. */
  hp?: Pool
  sp?: Pool
}
export type DungeonZoneData = {
  zone: MapZone
  revealed: boolean
  tokens: DungeonZoneToken[]
  /** "Leads to ⇢" chips for this Zone's cross-page connections (UNN-586), with
   *  far-zone party counts so a split party stays loud. */
  crossPageLinks: DungeonPageLink[]
  /** Generated provenance ⇒ the retract context-menu affordance shows
   *  (UNN-642). Visibility only; the server re-checks every precondition. */
  retractable: boolean
}
export type DungeonZoneNode = Node<DungeonZoneData, "dungeonZone">

/**
 * A Zone on the run console (UNN-464) — the play counterpart of the template
 * `ZoneNode`, now a thin wrapper over the shared {@link ZoneSetPiece} tiered card
 * (Dungeon Visual Overhaul §D3). It builds the zone's view from the occupancy
 * frame (party tokens; the DM console has no owned-gold) and hands the card its
 * Closeup roster; reveal state rides the card's visible glyph + `aria-describedby`,
 * never the name-only label. Selecting it reveals a {@link NodeToolbar} whose
 * actions (reveal/hide, Move party here, open the Zone details sheet) dispatch
 * through {@link useDungeonCanvas}.
 */
export function DungeonZoneNode({
  data,
  selected,
}: NodeProps<DungeonZoneNode>) {
  const {
    revealZone,
    hideZone,
    moveParty,
    openDetails,
    onInspect,
    hopFor,
    isParty,
    navigateToPage,
    retractZone,
    queueForcePlace,
    siteTemplates,
    isExpedition,
    disabled,
    canQueueSite,
  } = useDungeonCanvas()
  const { zone, revealed, tokens, crossPageLinks, retractable } = data
  const view = exploreZoneView({
    zone,
    revealed,
    tokens,
    party: isParty(zone.id),
    hop: hopFor(zone.id),
  })
  const partnerHighlighted = useConnectionHighlight(zone.id)
  // Retract is context-menu-only (UNN-642, D8: no hot-path accident) — never a
  // toolbar button, and no confirm dialog: retract *is* the undo.
  const [menuOpen, setMenuOpen] = useState(false)

  const setPiece = (
    <ZoneSetPiece
      view={view}
      selected={selected}
      partnerHighlighted={partnerHighlighted}
      className="cursor-pointer"
      onOpenRoster={() => onInspect(zone.id)}
      handles={<FloatingEdgeHandles />}
      pageLinks={
        crossPageLinks.length > 0 ? (
          <PageLinkChips
            links={crossPageLinks}
            counts={Object.fromEntries(
              crossPageLinks.map((link) => [link.farZoneId, link.count])
            )}
            onNavigate={navigateToPage}
          />
        ) : undefined
      }
      toolbar={
        <NodeToolbar
          isVisible={selected}
          position={Position.Top}
          // The toolbar is a React child of the node, so a click on any of its
          // buttons bubbles (through React Flow's portal) to `onNodeClick` — which
          // for an occupied zone opens the inspector and clears the details-sheet
          // selection, swallowing "Zone details". Stop it here so a toolbar click is
          // never also a zone click (§D3; the card's "Open roster" does the same).
          onClick={(event) => event.stopPropagation()}
          className="flex items-center gap-1 rounded-none border bg-popover p-1 shadow-md"
        >
          <Button
            size="sm"
            variant={revealed ? "secondary" : "ghost"}
            aria-pressed={revealed}
            onClick={() => (revealed ? hideZone(zone.id) : revealZone(zone.id))}
          >
            {revealed ? <EyeIcon /> : <EyeSlashIcon />}
            {revealed ? "Revealed" : "Reveal to players"}
          </Button>
          <Separator orientation="vertical" className="mx-0.5 h-5" />
          <Button size="sm" variant="ghost" onClick={() => moveParty(zone.id)}>
            <UsersThreeIcon />
            Move party here
          </Button>
          <Separator orientation="vertical" className="mx-0.5 h-5" />
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="Zone details"
            onClick={() => openDetails(zone.id)}
          >
            <NoteIcon />
          </Button>
        </NodeToolbar>
      }
      closeupRoster={
        view.occupants.length > 0 ? (
          <ul className="flex flex-wrap gap-1.5">
            {view.occupants.map((occupant) => (
              <li key={occupant.key}>
                <OccupantToken occupant={occupant} />
              </li>
            ))}
          </ul>
        ) : undefined
      }
    />
  )

  if (!retractable && (!isExpedition || siteTemplates.length === 0)) {
    return setPiece
  }

  return (
    <div
      className="relative h-full w-full"
      onContextMenu={(event) => {
        event.preventDefault()
        event.stopPropagation()
        setMenuOpen(true)
      }}
    >
      {setPiece}
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        {/* Positioning anchor only — the wrapper's onContextMenu opens the
            menu (the stub-ghost node documents the same idiom).
            `nativeButton={false}` because the render element is a <span>. */}
        <DropdownMenuTrigger
          nativeButton={false}
          render={
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0"
            />
          }
        />
        <DropdownMenuContent align="start">
          <DropdownMenuGroup>
            {isExpedition && siteTemplates.length > 0 ? (
              <DropdownMenuSub>
                <DropdownMenuSubTrigger disabled={disabled || !canQueueSite}>
                  Queue site…
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="max-h-72 overflow-y-auto">
                  <DropdownMenuGroup>
                    {siteTemplates.map((site) => {
                      const unavailableReason = site.pending
                        ? "Already queued"
                        : site.spent
                          ? "Already on map"
                          : undefined
                      if (unavailableReason !== undefined) {
                        return (
                          <DropdownMenuItem key={site.key} disabled>
                            {site.name}
                            <DropdownMenuShortcut className="tracking-normal">
                              {unavailableReason}
                            </DropdownMenuShortcut>
                          </DropdownMenuItem>
                        )
                      }
                      return (
                        <DropdownMenuSub key={site.key}>
                          <DropdownMenuSubTrigger>
                            {site.name}
                          </DropdownMenuSubTrigger>
                          <DropdownMenuSubContent>
                            <DropdownMenuGroup>
                              <DropdownMenuItem
                                onClick={() => queueForcePlace(site.key, 0)}
                              >
                                Next qualifying expansion
                              </DropdownMenuItem>
                              {site.defaultMinDepth > 0 ? (
                                <DropdownMenuItem
                                  onClick={() =>
                                    queueForcePlace(
                                      site.key,
                                      site.defaultMinDepth
                                    )
                                  }
                                >
                                  Next at depth {site.defaultMinDepth}
                                </DropdownMenuItem>
                              ) : null}
                            </DropdownMenuGroup>
                          </DropdownMenuSubContent>
                        </DropdownMenuSub>
                      )
                    })}
                  </DropdownMenuGroup>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            ) : null}
          </DropdownMenuGroup>
          {retractable && isExpedition && siteTemplates.length > 0 ? (
            <DropdownMenuSeparator />
          ) : null}
          {/* No pending gate: retract is non-optimistic with a benign no-op
              on a raced double-fire, so a gate would only re-add the wait
              (2026-07-23 lesson). */}
          {retractable ? (
            <DropdownMenuGroup>
              <DropdownMenuItem
                variant="destructive"
                onClick={() => retractZone(zone.id)}
              >
                Retract room
              </DropdownMenuItem>
            </DropdownMenuGroup>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
