"use client"

import { useRouter } from "next/navigation"
import { useEffect, useOptimistic, useRef, useTransition } from "react"
import { toast } from "sonner"

import { type CombatEvent } from "@workspace/game/foundation"

import { encounterErrorMessage } from "@/lib/actions/encounter/error-message"
import { applyCombatEvent } from "@/lib/actions/encounter/events"
import type { EncounterRow } from "@/lib/db/schema/encounter"
import { reduceCombatSession } from "@/lib/game-engine"

/**
 * The encounter-**setup** owner-mode write surface (UNN-347): the draft-time
 * sibling of {@link import("./use-combat-console").useCombatConsole}. It drives
 * every roster / zone / placement / engagement edit through the *same* optimistic
 * `reduceCombatSession` + `applyCombatEvent` path the live console uses, so the DM
 * never clicks Save — each edit persists per interaction and `useOptimistic`
 * mirrors it instantly. Setup is single-DM draft authoring, so unlike the console
 * this carries no realtime subscription or PC-vitals ping machinery.
 *
 * The `version` token lives in a **ref synced from the server prop** (the same
 * primitive the console and the sheet use) so a rapid follow-up — add a
 * combatant, then immediately place or engage it — reads the freshly-bumped token
 * synchronously instead of a stale render frame. On success it `router.refresh()`es
 * (load-bearing: it re-syncs `useOptimistic`'s base after the transition commits,
 * so the persisted edit doesn't vanish); on failure the toast fires while React
 * reverts the optimistic state automatically.
 */
export function useEncounterSetup(
  encounter: Pick<EncounterRow, "id" | "session" | "version">
) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [session, applyOptimistic] = useOptimistic(
    encounter.session,
    (current, event: CombatEvent) => reduceCombatSession(current, event)
  )

  const versionRef = useRef(encounter.version)
  useEffect(() => {
    versionRef.current = encounter.version
  }, [encounter.version])

  function dispatch(event: CombatEvent) {
    startTransition(async () => {
      applyOptimistic(event)
      const result = await applyCombatEvent({
        encounterId: encounter.id,
        expectedVersion: versionRef.current,
        event,
      })
      if (!result.ok) {
        toast.error(encounterErrorMessage(result.error))
        return
      }
      versionRef.current = result.value.version
      router.refresh()
    })
  }

  return { session, isPending, dispatch }
}
