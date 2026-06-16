"use client"

import { useRouter } from "next/navigation"
import { useOptimistic, useTransition } from "react"
import { toast } from "sonner"

import { type CombatEvent } from "@workspace/game/foundation"

import { fetchEncounterVersion } from "@/hooks/fetch-encounter-version"
import { useQueuedWrite } from "@/hooks/use-queued-write"
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
 * Writes go through the shared {@link useQueuedWrite} primitive (UNN-378) — the
 * same one the live console uses — so a rapid follow-up (add a combatant, then
 * immediately place or engage it) serializes behind the in-flight write and reads
 * the freshly-bumped token its predecessor produced instead of a stale render
 * frame, and a genuine cross-writer `stale` refetches + retries once. On success
 * it `router.refresh()`es (load-bearing: it re-syncs `useOptimistic`'s base after
 * the transition commits, so the persisted edit doesn't vanish); on failure the
 * toast fires while React reverts the optimistic state automatically.
 */
export function useEncounterSetup(
  encounter: Pick<EncounterRow, "id" | "shortId" | "session" | "version">
) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [session, applyOptimistic] = useOptimistic(
    encounter.session,
    (current, event: CombatEvent) => reduceCombatSession(current, event)
  )

  const { enqueue } = useQueuedWrite({
    serverVersion: encounter.version,
    refetchVersion: () => fetchEncounterVersion(encounter.shortId),
  })

  function dispatch(event: CombatEvent) {
    startTransition(async () => {
      applyOptimistic(event)
      const result = await enqueue((expectedVersion) =>
        applyCombatEvent({ encounterId: encounter.id, expectedVersion, event })
      )
      if (!result.ok) {
        toast.error(encounterErrorMessage(result.error))
        return
      }
      router.refresh()
    })
  }

  return { session, isPending, dispatch }
}
