"use client"

import { useSyncExternalStore } from "react"

import type { ParticipantId } from "@workspace/game-v2/kernel/participant-id.schema"
import { Spinner } from "@workspace/ui/components/spinner"

import type { EncounterForDM } from "@/app/combat/[shortId]/encounter-access"
import type { DungeonRosterEntry } from "@/components/dungeon/canvas/types"
import { DungeonCombatBody } from "@/components/dungeon/combat/body"
import { DungeonExploreBody } from "@/components/dungeon/explore/body"
import { DungeonConsoleShell } from "@/components/dungeon/shell/console-shell"
import type { CombatantSheetSlice } from "@/lib/combat/view/detail-view"
import type { CharacterSummary } from "@/lib/db/queries/character-list"
import type { DungeonRow } from "@/lib/db/schema/dungeon"
import type { MapInstanceRow } from "@/lib/db/schema/map-instance"

/**
 * The **active** DM run console (UNN-464), rendering one of two bodies inside the
 * persistent {@link DungeonConsoleShell} (UNN-488): exploration
 * ({@link DungeonExploreBody}) or, when a live encounter runs on the delve's
 * Instance, combat ({@link DungeonCombatBody}, engine v2 — UNN-536). The
 * combat-vs-explore distinction is decided **once at the page loader** and arrives
 * resolved as `mode`; this component only picks the body + the shell `phase`, so
 * the width-bearing shell stays mounted across the fork and the `--sidebar-width`
 * change eases.
 *
 * Rendered **client-only** (after mount): a heavily-interactive, auth-gated DM
 * tool with no SEO value, and the React Flow canvas needs a measured DOM — so SSR
 * buys nothing and only risks a `useId` hydration mismatch.
 */
export type DungeonRunMode =
  | {
      kind: "explore"
      instance: MapInstanceRow
      roster: Record<string, DungeonRosterEntry>
      placedCharacters: CharacterSummary[]
    }
  | {
      kind: "combat"
      data: EncounterForDM
      combatantSheetSliceById: Record<ParticipantId, CombatantSheetSlice>
    }

export function DungeonRunConsole({
  dungeon,
  campaignShortId,
  mode,
}: {
  dungeon: DungeonRow
  campaignShortId: string
  mode: DungeonRunMode
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

  return (
    <DungeonConsoleShell phase={mode.kind === "combat" ? "combat" : "play"}>
      {mode.kind === "combat" ? (
        <DungeonCombatBody
          dungeon={dungeon}
          data={mode.data}
          combatantSheetSliceById={mode.combatantSheetSliceById}
          campaignShortId={campaignShortId}
        />
      ) : (
        <DungeonExploreBody
          dungeon={dungeon}
          instance={mode.instance}
          roster={mode.roster}
          placedCharacters={mode.placedCharacters}
          campaignShortId={campaignShortId}
        />
      )}
    </DungeonConsoleShell>
  )
}
