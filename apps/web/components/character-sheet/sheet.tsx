"use client"

import { useState } from "react"

import {
  EntityWriteProvider,
  useLoadedCharacter,
} from "@/hooks/use-entity-write"
import type { LoadedCharacter } from "@/lib/character/load"
import { buildAffinityStrip } from "@/lib/character/view/affinity-strip"
import { buildRailView } from "@/lib/character/view/rail-view"
import { getArchetype } from "@/lib/game-engine-v2"

import { CombatTab } from "./combat/combat-tab"
import { SheetCommandPalette } from "./command-palette"
import { SheetRail } from "./rail/rail"
import { SheetDock, type SheetTabKey } from "./tab-dock"

/**
 * The character-sheet client root (S2a — UNN-557): mounts the
 * {@link EntityWriteProvider} over the route-loaded triple, then renders the
 * Showtime! frame — persistent left rail, tabbed content column, bottom tab
 * dock. Interactive by design (CH18): the provider's optimistic frame re-folds
 * `resolveEntity` client-side, so every derived value under this root moves
 * the instant a control dispatches.
 */
export function CharacterSheet({ loaded }: { loaded: LoadedCharacter }) {
  return (
    <EntityWriteProvider loaded={loaded}>
      <SheetShell />
    </EntityWriteProvider>
  )
}

/**
 * The shared frame (design handoff "Layout"): rail ~300px, content column
 * topped by the affinity strip, dock pinned under the content. The active tab
 * is in-memory client state (the sheet always opens on Combat); the dock only
 * shows tabs that have shipped (S2b–d add theirs).
 */
function SheetShell() {
  const { profile, entity, resolved } = useLoadedCharacter()
  const [tab, setTab] = useState<SheetTabKey>("combat")

  const rail = buildRailView(profile, entity, resolved, getArchetype)
  const affinities = buildAffinityStrip(resolved)

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-4 p-4 lg:min-h-0">
      <SheetCommandPalette onNavigate={setTab} />
      <div className="flex flex-1 flex-col gap-4 lg:grid lg:min-h-0 lg:grid-cols-[300px_minmax(0,1fr)]">
        <SheetRail view={rail} />
        <div className="flex min-w-0 flex-col gap-4">
          {tab === "combat" ? <CombatTab cells={affinities} /> : null}
        </div>
      </div>
      <SheetDock active={tab} onSelect={setTab} />
    </main>
  )
}
