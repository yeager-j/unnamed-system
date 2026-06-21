"use client"

import { useState, useSyncExternalStore } from "react"

import {
  type InitiativeStats,
  type PcCombatantDetail,
} from "@workspace/game/engine"
import { Spinner } from "@workspace/ui/components/spinner"

import type { DungeonRosterEntry } from "@/components/dungeon/canvas/types"
import { DungeonCombatBody } from "@/components/dungeon/combat/body"
import { DungeonExploreBody } from "@/components/dungeon/explore/body"
import { DungeonEncounterSetup } from "@/components/dungeon/setup/body"
import { DungeonConsoleShell } from "@/components/dungeon/shell/console-shell"
import type { CharacterSummary } from "@/lib/db/queries/character-list"
import type { DungeonRow } from "@/lib/db/schema/dungeon"
import type { EncounterRow } from "@/lib/db/schema/encounter"
import type { MapInstanceRow } from "@/lib/db/schema/map-instance"

/** The live encounter on this delve's Instance + its hydrated combat data — present
 *  only while a fight is running (the console's combat phase, UNN-467). */
export interface DungeonCombatData {
  encounter: EncounterRow
  pcDetailById: Record<string, PcCombatantDetail>
  pcShortIdById: Record<string, string>
}

/**
 * The **active** DM run console (UNN-464 / UNN-467) — a thin orchestrator that
 * **forks by mode** over the same Map Instance: a live encounter on the delve's
 * Instance renders the {@link DungeonCombatBody} (the fight), the Play bar's "Start
 * an encounter" morphs into the {@link DungeonEncounterSetup} picker, otherwise the
 * {@link DungeonExploreBody} (exploration). They stay separate components — not one
 * merged body — because each owns a **different** optimistic hook (`useCombatConsole`
 * vs `useDungeonConsole`) and the rules of hooks forbid conditionally calling one or
 * the other.
 *
 * All three phases render **inside one persistent {@link DungeonConsoleShell}**
 * (UNN-488) so the single `<Sidebar>` element stays mounted across the fork — that's
 * what lets the `--sidebar-width` 16rem ↔ 22rem change ease instead of snapping on a
 * remount. `inSetup` is lifted here (not inside the explore body) so the shell sees
 * all three phases. Every branch returns `<DungeonConsoleShell>` at the same
 * top-level position, so React reconciles it in place across `router.refresh()`.
 *
 * Rendered **client-only** (after mount): a heavily-interactive, auth-gated DM
 * tool with no SEO value, and the React Flow canvas needs a measured DOM — so SSR
 * buys nothing and only risks a `useId` hydration mismatch.
 */
export function DungeonRunConsole(props: {
  dungeon: DungeonRow
  instance: MapInstanceRow
  roster: Record<string, DungeonRosterEntry>
  placedCharacters: CharacterSummary[]
  pcStatsById: Record<string, InitiativeStats>
  campaignShortId: string
  combat: DungeonCombatData | null
}) {
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  )

  const [inSetup, setInSetup] = useState(false)

  // Setup is left behind the moment the fight goes live. Because `inSetup` now
  // lives here (so the persistent shell sees all three phases) it would otherwise
  // outlive the combat round-trip and drop the DM back into the stale picker when
  // the encounter ends — so clear it as combat becomes active (render-phase "reset
  // state on prop change" pattern). Ending combat then falls through to Play.
  const [combatActive, setCombatActive] = useState(Boolean(props.combat))
  if (Boolean(props.combat) !== combatActive) {
    setCombatActive(Boolean(props.combat))
    if (props.combat) setInSetup(false)
  }

  if (!mounted) {
    return (
      <main className="flex flex-1 items-center justify-center p-6">
        <Spinner />
      </main>
    )
  }

  if (props.combat) {
    return (
      <DungeonConsoleShell phase="combat">
        <DungeonCombatBody
          dungeon={props.dungeon}
          encounter={props.combat.encounter}
          instance={props.instance}
          campaignShortId={props.campaignShortId}
          pcDetailById={props.combat.pcDetailById}
          pcShortIdById={props.combat.pcShortIdById}
        />
      </DungeonConsoleShell>
    )
  }

  if (inSetup) {
    return (
      <DungeonConsoleShell phase="setup">
        <DungeonEncounterSetup
          dungeon={props.dungeon}
          instance={props.instance}
          placedCharacters={props.placedCharacters}
          pcStatsById={props.pcStatsById}
          campaignShortId={props.campaignShortId}
          onCancel={() => setInSetup(false)}
        />
      </DungeonConsoleShell>
    )
  }

  return (
    <DungeonConsoleShell phase="play">
      <DungeonExploreBody
        dungeon={props.dungeon}
        instance={props.instance}
        roster={props.roster}
        placedCharacters={props.placedCharacters}
        campaignShortId={props.campaignShortId}
        onStartEncounter={() => setInSetup(true)}
      />
    </DungeonConsoleShell>
  )
}
