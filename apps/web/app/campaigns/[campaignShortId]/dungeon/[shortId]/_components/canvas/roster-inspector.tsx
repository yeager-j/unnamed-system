"use client"

import { XIcon } from "@phosphor-icons/react/dist/ssr"
import { Panel } from "@xyflow/react"
import type { ReactNode } from "react"

import { Button } from "@workspace/ui/components/button"
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@workspace/ui/components/drawer"
import { useIsMobile } from "@workspace/ui/hooks/use-mobile"

import { EngagedCluster } from "@/app/campaigns/[campaignShortId]/dungeon/[shortId]/_components/canvas/watch/engaged-cluster"
import { MotifGlyph } from "@/components/shared/canvas/set-piece/motif-icons"
import {
  clustersOf,
  OccupantToken,
} from "@/components/shared/canvas/set-piece/occupant-chips"
import type {
  SetPieceOccupant,
  ZoneSetPieceView,
} from "@/domain/map/view/set-piece-view"

/**
 * The **roster inspector** (Dungeon Visual Overhaul §D7) — the crowded-zone
 * escape hatch. A token's size is fixed in *screen* space and a zone's footprint
 * in *world* space, so a small room can't grow slots for a 4v4 by zooming (§D2);
 * the inspector holds the full roster, budgeting space by **combatant count, not
 * room size**, so 8–10 tokens read cleanly at any footprint. It preserves the
 * engagement partition (clusters first) exactly like the card.
 *
 * It is **non-modal** by design: opened by clicking any occupied zone (or a
 * crowded card's "Open roster ▸"), it must coexist with live canvas interaction —
 * you keep zooming, panning, and re-targeting it. So it renders as a React Flow
 * {@link Panel} (desktop; the same primitive the turn bar uses — pointer-events
 * live, no overlay, no focus trap) or a non-modal bottom {@link Drawer}
 * (`modal={false}`, mobile). Its open/target state (`inspectId`) is owned by the
 * phase body, independent of the camera and of RF selection.
 *
 * Token behavior varies by surface (combat opens the detail drawer; explore is
 * read-only), so each surface passes `renderToken` — the same treatment its card
 * uses — and the inspector stays surface-agnostic.
 */
export function RosterInspector({
  view,
  onClose,
  renderToken = (occupant) => <OccupantToken occupant={occupant} />,
}: {
  /** The inspected zone's view, or `null` when nothing is inspected. */
  view: ZoneSetPieceView | null
  /** Clears `inspectId` — the close `×` / drawer dismiss. Nothing else moves. */
  onClose: () => void
  /** Renders one occupant token (defaults to the read-only chip). */
  renderToken?: (occupant: SetPieceOccupant) => ReactNode
}) {
  const isMobile = useIsMobile()
  if (view === null) return null

  if (isMobile) {
    return (
      <Drawer
        open
        modal={false}
        onOpenChange={(open) => {
          if (!open) onClose()
        }}
      >
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle className="flex items-center gap-2">
              <MotifGlyph
                motif={view.motif}
                className="size-5 shrink-0 text-muted-foreground"
              />
              {view.name}
            </DrawerTitle>
          </DrawerHeader>
          <div className="overflow-y-auto px-4 pb-6">
            <RosterContents view={view} renderToken={renderToken} />
          </div>
        </DrawerContent>
      </Drawer>
    )
  }

  return (
    <Panel
      position="top-right"
      className="flex max-h-[calc(100%-2rem)] w-96 flex-col gap-3 rounded-xl border bg-card/80 p-3 shadow-lg backdrop-blur-xl motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-right-4"
    >
      <div className="flex items-center gap-2">
        <MotifGlyph
          motif={view.motif}
          className="size-5 shrink-0 text-muted-foreground"
        />
        <span className="min-w-0 flex-1 truncate text-base font-semibold">
          {view.name}
        </span>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Close roster"
          onClick={onClose}
        >
          <XIcon />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <RosterContents view={view} renderToken={renderToken} />
      </div>
    </Panel>
  )
}

/**
 * The inspector's body, shared by the desktop Panel and the mobile Drawer: the
 * uppercase summary line + the count-budgeted token grid, engagement clusters
 * first (mirroring the Closeup card via the shared {@link clustersOf}).
 */
function RosterContents({
  view,
  renderToken,
}: {
  view: ZoneSetPieceView
  renderToken: (occupant: SetPieceOccupant) => ReactNode
}) {
  return (
    <div className="flex flex-col gap-2">
      {view.summary ? (
        <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {view.summary}
        </span>
      ) : null}
      <ul className="flex flex-wrap gap-1.5">
        {clustersOf(view.occupants).map((cluster) =>
          cluster.length > 1 ? (
            <li key={cluster.map((o) => o.key).join("|")}>
              <EngagedCluster
                label={`Engaged: ${cluster.map((o) => o.name).join(", ")}`}
              >
                {cluster.map((occupant) => (
                  <div key={occupant.key}>{renderToken(occupant)}</div>
                ))}
              </EngagedCluster>
            </li>
          ) : (
            <li key={cluster[0]!.key}>{renderToken(cluster[0]!)}</li>
          )
        )}
      </ul>
    </div>
  )
}
