"use client"

import { useSyncExternalStore } from "react"

import { Spinner } from "@workspace/ui/components/spinner"

import type { DungeonRosterEntry } from "@/components/dungeon/canvas/types"
import { DungeonExploreBody } from "@/components/dungeon/explore/body"
import { DungeonConsoleShell } from "@/components/dungeon/shell/console-shell"
import type { CharacterSummary } from "@/lib/db/queries/character-list"
import type { DungeonRow } from "@/lib/db/schema/dungeon"
import type { MapInstanceRow } from "@/lib/db/schema/map-instance"

/**
 * The **active** DM run console (UNN-464) — renders the exploration
 * {@link DungeonExploreBody} inside the persistent {@link DungeonConsoleShell}
 * (UNN-488). The combat/setup phases were removed with the v1 combat cutover
 * (UNN-535); dungeon combat returns on engine v2 in PR11d.
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
  campaignShortId: string
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
    <DungeonConsoleShell phase="play">
      <DungeonExploreBody
        dungeon={props.dungeon}
        instance={props.instance}
        roster={props.roster}
        placedCharacters={props.placedCharacters}
        campaignShortId={props.campaignShortId}
      />
    </DungeonConsoleShell>
  )
}
