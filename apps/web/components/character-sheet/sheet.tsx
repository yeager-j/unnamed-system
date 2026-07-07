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
 * The shared frame (design frame `10a`): a split pane under the site header —
 * the ~300px rail and the content column scroll **independently** (nothing
 * floats; the rail is a flat bordered panel), with the tab dock as a
 * full-width bar pinned under both. The active tab is in-memory client state
 * (the sheet always opens on Combat); the dock only shows tabs that have
 * shipped (S2b–d add theirs). Below `lg` the panes stack and the page scrolls
 * as one.
 */
function SheetShell() {
  const { profile, entity, resolved } = useLoadedCharacter()
  const [tab, setTab] = useState<SheetTabKey>("combat")

  const rail = buildRailView(profile, entity, resolved, getArchetype)
  const affinities = buildAffinityStrip(resolved)

  return (
    <main className="flex flex-col lg:h-[calc(100svh-3.5rem)] lg:overflow-hidden">
      <SheetCommandPalette onNavigate={setTab} />
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <SheetRail view={rail} />
        <div className="min-w-0 flex-1 lg:overflow-y-auto">
          {tab === "combat" ? <CombatTab cells={affinities} /> : null}
        </div>
      </div>
      <SheetDock active={tab} onSelect={setTab} />
    </main>
  )
}
