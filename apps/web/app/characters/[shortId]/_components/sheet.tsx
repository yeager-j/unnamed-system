"use client"

import { useState } from "react"

import type { CharacterMount } from "@/domain/character/load"
import { buildAffinityStrip } from "@/domain/character/view/affinity-strip"
import { buildRailView } from "@/domain/character/view/rail-view"
import {
  EntityWriteProvider,
  useLoadedCharacter,
} from "@/domain/entity/use-entity-write"

import { ArchetypesTab } from "./archetypes/archetypes-tab"
import { CombatTab } from "./combat/combat-tab"
import { SheetCommandPalette } from "./command-palette"
import { ExploreTab } from "./explore/explore-tab"
import { InventoryTab } from "./inventory/inventory-tab"
import { JournalTab } from "./journal/journal-tab"
import { SheetRail } from "./rail/rail"
import { SheetDock, type SheetTabKey } from "./tab-dock"

/**
 * The character-sheet client root (S2a — UNN-557): mounts the
 * {@link EntityWriteProvider} over the route's `{ profile, canon }` mount, then
 * renders the Showtime! frame — persistent left rail, tabbed content column,
 * bottom tab dock. Interactive by design (CH18): the predicted frame re-folds
 * `resolveEntity` through the registered mutation predictors, so every derived
 * value under this root moves the instant a control dispatches.
 */
export function CharacterSheet({ character }: { character: CharacterMount }) {
  return (
    <EntityWriteProvider profile={character.profile} canon={character.canon}>
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

  const rail = buildRailView(profile, entity, resolved)
  const affinities = buildAffinityStrip(resolved)

  return (
    <main className="flex flex-col lg:h-[calc(100svh-3.5rem)] lg:overflow-hidden">
      <SheetCommandPalette onNavigate={setTab} />
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <SheetRail view={rail} />
        <div className="min-w-0 flex-1 lg:overflow-y-auto">
          {tab === "combat" ? <CombatTab cells={affinities} /> : null}
          {tab === "explore" ? <ExploreTab /> : null}
          {tab === "journal" ? <JournalTab /> : null}
          {tab === "inventory" ? <InventoryTab /> : null}
          {tab === "archetypes" ? <ArchetypesTab /> : null}
        </div>
      </div>
      <SheetDock active={tab} onSelect={setTab} />
    </main>
  )
}
