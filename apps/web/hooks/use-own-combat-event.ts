"use client"

import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { toast } from "sonner"

import { type CombatEvent } from "@workspace/game/foundation"

import { fetchEncounterVersion } from "@/hooks/fetch-encounter-version"
import { useQueuedWrite } from "@/hooks/use-queued-write"
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
 * refetches the fresh overlay (sub-second on realtime, ≤1.5s on the poll).
 *
 * Writes go through the shared {@link useQueuedWrite} primitive (UNN-378): the
 * version token rides its monotonic ref (seeded from the *polled* snapshot
 * version), back-to-back toggles serialize so the second reads the freshly-bumped
 * token, and — critically here — a `stale` from a **concurrent DM event** (which
 * any DM edit triggers, since the snapshot version the player guards against lags
 * the live token) refetches the live encounter version and retries the toggle
 * once. The retry is safe: the Server Action re-reduces the player's
 * own-combatant overlay edit onto the current session, so the DM's change is
 * preserved.
 */
export function useOwnCombatEvent(shortId: string, snapshotVersion: number) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const { enqueue } = useQueuedWrite({
    serverVersion: snapshotVersion,
    refetchVersion: () => fetchEncounterVersion(shortId),
  })

  function dispatch(event: CombatEvent) {
    startTransition(async () => {
      const result = await enqueue((expectedVersion) =>
        applyOwnCombatEvent({ shortId, expectedVersion, event })
      )
      if (!result.ok) {
        toast.error(encounterErrorMessage(result.error))
        return
      }
      // Reconcile the left column's own character data (e.g. a co-edited vital);
      // the overlay itself arrives via the snapshot refetch the ping triggers.
      router.refresh()
    })
  }

  return { dispatch, pending }
}
