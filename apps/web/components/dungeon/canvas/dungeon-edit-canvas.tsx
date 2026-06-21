"use client"

import dynamic from "next/dynamic"
import { useMemo } from "react"

import type {
  MapGeometryEvent,
  MapInstanceState,
} from "@workspace/game/foundation"
import { Spinner } from "@workspace/ui/components/spinner"

import { tokensByZone } from "./build-dungeon-nodes"
import { type DungeonRosterEntry } from "./dungeon-canvas-types"
import {
  DungeonModeToggle,
  type DungeonConsoleMode,
} from "./dungeon-mode-toggle"
import { DungeonTokenChip } from "./dungeon-token-chip"
import { readViewport, writeViewport } from "./viewport-store"

// MapCanvas is a React Flow island that measures the DOM, so it renders
// client-only — lazy-loaded the same way the play/combat DungeonCanvas is.
const MapCanvas = dynamic(
  () =>
    import("@/components/maps/canvas/map-canvas").then(
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
 * It draws each party member as a Zone overlay chip (so the DM sees occupancy while
 * editing) and marks occupied Zones as **locked** — their delete affordance is
 * disabled, since deleting an occupied Zone is blocked (the DM relocates the party
 * in Play mode first). Occupancy is a static snapshot for the Edit session: the DM
 * is the sole geometry writer and doesn't move tokens here.
 *
 * It shares the dungeon's React Flow viewport store (keyed by `persistKey`) with the
 * Play board's {@link import("./dungeon-canvas").DungeonCanvas}, so toggling Edit ⇄
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
  const byZone = useMemo(
    () => tokensByZone(instance, roster),
    [instance, roster]
  )
  const lockedZoneIds = useMemo(() => new Set(Object.keys(byZone)), [byZone])

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
      renderZoneOverlay={(zoneId) => {
        const tokens = byZone[zoneId]
        if (!tokens || tokens.length === 0) return null
        return tokens.map((token) => (
          <DungeonTokenChip
            key={token.characterId}
            name={token.name}
            portraitUrl={token.portraitUrl}
            hp={token.hp}
            sp={token.sp}
          />
        ))
      }}
    />
  )
}
