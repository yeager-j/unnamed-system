"use client"

import { useRouter } from "next/navigation"
import { useEffect, useRef, useTransition } from "react"
import { toast } from "sonner"

import { type CombatEvent } from "@workspace/game/foundation"

import { encounterErrorMessage } from "@/lib/actions/encounter/error-message"
import { applyOwnCombatEvent } from "@/lib/actions/encounter/own-events"

/**
 * The **player's** combat-event write surface for the watch view — the narrow,
 * owner-scoped analog of the DM console's `useCombatConsole`. It dispatches one
 * session-overlay {@link CombatEvent} (an ailment / battle-condition edit on the
 * player's *own* combatant) through {@link applyOwnCombatEvent}, version-guarded.
 *
 * No `useOptimistic`: the player holds only the redacted snapshot, not the full
 * session the reducer needs, so the edit isn't mirrored locally. Instead the
 * action publishes an encounter ping on success, and `useEncounterSnapshot`
 * refetches the fresh overlay (sub-second on realtime, ≤1.5s on the poll). The
 * version token rides a **ref synced forward from the snapshot prop** (the same
 * primitive `useCombatConsole`/the sheet use): a rapid second toggle reads the
 * freshly-bumped token instead of a stale render frame, so it isn't spuriously
 * rejected as `stale` before the refetch lands.
 */
export function useOwnCombatEvent(shortId: string, snapshotVersion: number) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const versionRef = useRef(snapshotVersion)
  useEffect(() => {
    if (snapshotVersion > versionRef.current) {
      versionRef.current = snapshotVersion
    }
  }, [snapshotVersion])

  function dispatch(event: CombatEvent) {
    startTransition(async () => {
      const result = await applyOwnCombatEvent({
        shortId,
        expectedVersion: versionRef.current,
        event,
      })
      if (!result.ok) {
        toast.error(encounterErrorMessage(result.error))
        return
      }
      versionRef.current = result.value.version
      // Reconcile the left column's own character data (e.g. a co-edited vital);
      // the overlay itself arrives via the snapshot refetch the ping triggers.
      router.refresh()
    })
  }

  return { dispatch, pending }
}
