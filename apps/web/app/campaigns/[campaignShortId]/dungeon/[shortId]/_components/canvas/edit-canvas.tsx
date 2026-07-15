"use client"

import dynamic from "next/dynamic"

import type {
  MapGeometryEvent,
  MapInstanceState,
} from "@workspace/game-v2/spatial"
import { Spinner } from "@workspace/ui/components/spinner"

import { tokensByZone } from "@/app/campaigns/[campaignShortId]/dungeon/[shortId]/_components/canvas/build-nodes"
import {
  DungeonModeToggle,
  type DungeonConsoleMode,
} from "@/app/campaigns/[campaignShortId]/dungeon/[shortId]/_components/canvas/mode-toggle"
import { type DungeonRosterEntry } from "@/app/campaigns/[campaignShortId]/dungeon/[shortId]/_components/canvas/types"
import {
  readViewport,
  writeViewport,
} from "@/app/campaigns/[campaignShortId]/dungeon/[shortId]/_components/canvas/viewport-store"
import { partyOccupants } from "@/domain/dungeon/view/set-piece-view"

// MapCanvas is a React Flow island that measures the DOM, so it renders
// client-only — lazy-loaded the same way the play/combat DungeonCanvas is.
const MapCanvas = dynamic(
  () =>
    import("@/components/shared/canvas/map-canvas").then(
      (module) => module.MapCanvas
    ),
  {
    ssr: false,
    loading: () => (
      <div className="flex size-full items-center justify-center">
        <Spinner />
      </div>
    ),
  }
)

/**
 * The run console's **Edit-mode** board (UNN-486) — the Map builder pointed at the
 * live Map Instance's geometry. It reuses the shared {@link MapCanvas} (the same
 * surface the Map-template editor uses) so "Edit = the builder", and routes every
 * geometry edit out as a discrete {@link MapGeometryEvent} the explore body wraps
 * in an `editGeometry` Instance event (version-guarded like every other write).
 *
 * It feeds the live party into each Zone's tiered card via `zoneOccupants` (so the
 * DM sees occupancy at every zoom while editing) and marks occupied Zones as
 * **locked** — their delete affordance is disabled, since deleting an occupied Zone
 * is blocked (the DM relocates the party in Play mode first). The lock set covers
 * **all** occupancy (matching the engine's `editGeometry` block, which inspects every
 * token), while the occupant chips render only roster members. Both track the live
 * optimistic Instance — a realtime ping or refresh updates them mid-session.
 *
 * It shares the dungeon's React Flow viewport store (keyed by `persistKey`) with the
 * Play board's {@link import("@/app/campaigns/[campaignShortId]/dungeon/[shortId]/_components/canvas/canvas").DungeonCanvas}, so toggling Edit ⇄
 * Play keeps zoom/pan steady (the same trick that smooths Play ↔ Combat), and hosts
 * the {@link DungeonModeToggle} in the canvas's bottom bar.
 */
export function DungeonEditCanvas({
  instance,
  roster,
  onGeometryEvent,
  mode,
  onModeChange,
  persistKey,
}: {
  instance: MapInstanceState
  roster: Record<string, DungeonRosterEntry>
  onGeometryEvent: (event: MapGeometryEvent) => void
  mode: DungeonConsoleMode
  onModeChange: (mode: DungeonConsoleMode) => void
  /** Shared viewport-store key (the dungeon `shortId`) — keeps zoom/pan in lockstep
   *  with the Play board across the toggle. */
  persistKey?: string
}) {
  const byZone = tokensByZone(instance, roster)
  // All occupancy, not just `byZone` (roster-only) — a Zone held by a leftover
  // enemy token from a just-ended fight is still delete-blocked by the engine, so
  // the affordance must reflect that (no enabled Delete that silently no-ops).
  const lockedZoneIds = new Set(
    Object.values(instance.occupancy).map((token) => token.zoneId)
  )

  return (
    <MapCanvas
      geometry={instance.geometry}
      interactivity="edit"
      onGeometryEvent={onGeometryEvent}
      lockedZoneIds={lockedZoneIds}
      defaultViewport={persistKey ? readViewport(persistKey) : undefined}
      onMoveEnd={
        persistKey
          ? (_, viewport) => writeViewport(persistKey, viewport)
          : undefined
      }
      bottomBarLeading={
        <DungeonModeToggle mode={mode} onModeChange={onModeChange} />
      }
      zoneOccupants={(zoneId) => partyOccupants(byZone[zoneId] ?? [])}
    />
  )
}
