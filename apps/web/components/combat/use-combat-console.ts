"use client"

import { useRouter } from "next/navigation"
import { useEffect, useOptimistic, useRef, useTransition } from "react"
import { toast } from "sonner"

import { endEncounterAction } from "@/lib/actions/encounter/end"
import { encounterErrorMessage } from "@/lib/actions/encounter/error-message"
import { applyCombatEvent } from "@/lib/actions/encounter/events"
import {
  reduceCombatSession,
  type CombatEvent,
  type CombatSession,
} from "@/lib/game/encounter"

/**
 * The live DM console's owner-mode write surface (UNN-344) — the encounter
 * analog of `useInventoryEditor`. It mirrors the **same** `reduceCombatSession`
 * the server runs optimistically (`useOptimistic`), so the frame the DM sees is
 * structurally identical to what `applyCombatEvent` will persist; on success it
 * `router.refresh()`es to reconcile the real session (and any PC HP the page
 * re-reads), and on failure the toast fires while React reverts the optimistic
 * state automatically (ADR Decision 4; the optimistic-toggle pattern in
 * `lib/actions/README.md`).
 *
 * The version token lives in a **ref synced to the server prop**, not `useState`
 * — the same primitive the sheet's `useCharacterTokenRef` uses. A rapid
 * follow-up tap (draft → end turn before the first write's state commits) reads
 * the freshly-bumped token synchronously from `versionRef.current` instead of a
 * stale render frame, so the second event isn't spuriously rejected as `stale`;
 * the prop-sync effect absorbs the version `router.refresh()` brings back. The DM
 * is the encounter's sole writer, so a genuinely stale token is rare and surfaces
 * as a toast.
 */
export function useCombatConsole(
  encounterId: string,
  persistedSession: CombatSession,
  persistedVersion: number
) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [session, applyOptimistic] = useOptimistic(
    persistedSession,
    (current, event: CombatEvent) => reduceCombatSession(current, event)
  )

  const versionRef = useRef(persistedVersion)
  useEffect(() => {
    versionRef.current = persistedVersion
  }, [persistedVersion])

  function dispatch(event: CombatEvent) {
    startTransition(async () => {
      applyOptimistic(event)
      const result = await applyCombatEvent({
        encounterId,
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

  /**
   * Ends the encounter (UNN-320): a terminal `status` flip, not a session edit,
   * so it goes straight through {@link endEncounterAction} (guarded on the live
   * `versionRef`) rather than the optimistic reduce path. On success
   * `router.refresh()` re-forks the page to the ended stub.
   */
  function endEncounter() {
    startTransition(async () => {
      const result = await endEncounterAction({
        encounterId,
        expectedVersion: versionRef.current,
      })
      if (!result.ok) {
        toast.error(encounterErrorMessage(result.error))
        return
      }
      versionRef.current = result.value.version
      router.refresh()
    })
  }

  return { session, isPending, dispatch, endEncounter }
}
