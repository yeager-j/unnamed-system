"use client"

import { useSyncExternalStore } from "react"

import {
  type InitiativeStats,
  type PcCombatantDetail,
} from "@workspace/game/engine"
import { Spinner } from "@workspace/ui/components/spinner"

import type { CharacterSummary } from "@/lib/db/queries/character-list"
import type { DungeonRow } from "@/lib/db/schema/dungeon"
import type { EncounterRow } from "@/lib/db/schema/encounter"
import type { MapInstanceRow } from "@/lib/db/schema/map-instance"

import type { DungeonRosterEntry } from "./canvas/dungeon-canvas"
import { DungeonCombatBody } from "./dungeon-combat-body"
import { DungeonExploreBody } from "./dungeon-explore-body"

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
 * Instance renders the {@link DungeonCombatBody} (the fight), otherwise the
 * {@link DungeonExploreBody} (exploration + its ephemeral Setup morph). They stay
 * two components — not one merged body — because each owns a **different**
 * optimistic hook (`useCombatConsole` vs `useDungeonConsole`) and the rules of
 * hooks forbid conditionally calling one or the other.
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

  if (!mounted) {
    return (
      <main className="flex flex-1 items-center justify-center p-6">
        <Spinner />
      </main>
    )
  }

  if (props.combat) {
    return (
      <DungeonCombatBody
        dungeon={props.dungeon}
        encounter={props.combat.encounter}
        instance={props.instance}
        campaignShortId={props.campaignShortId}
        pcDetailById={props.combat.pcDetailById}
        pcShortIdById={props.combat.pcShortIdById}
      />
    )
  }

  return (
    <DungeonExploreBody
      dungeon={props.dungeon}
      instance={props.instance}
      roster={props.roster}
      placedCharacters={props.placedCharacters}
      pcStatsById={props.pcStatsById}
      campaignShortId={props.campaignShortId}
    />
  )
}
