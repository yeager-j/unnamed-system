"use client"

import { useRouter } from "next/navigation"
import { useOptimistic, useTransition } from "react"
import { toast } from "sonner"

import {
  type CombatEvent,
  type MapInstanceEvent,
} from "@workspace/game/foundation"

import { fetchEncounterVersion } from "@/hooks/fetch-encounter-version"
import { useQueuedWrite } from "@/hooks/use-queued-write"
import { encounterErrorMessage } from "@/lib/actions/encounter/error-message"
import type { EncounterRow } from "@/lib/db/schema/encounter"
import type { MapInstanceRow } from "@/lib/db/schema/map-instance"
import { reduceCombatSession } from "@/lib/game-engine"

import {
  dispatchCombatEvent,
  reduceInstanceOptimistic,
} from "./dispatch-combat-event"

/**
 * The encounter-**setup** owner-mode write surface (UNN-347 / UNN-459): the
 * draft-time sibling of {@link import("./use-combat-console").useCombatConsole}.
 * It drives every roster / zone / placement / engagement edit through the *same*
 * optimistic reducers + `applyCombatEvent` path the live console uses, so the DM
 * never clicks Save — each edit persists per interaction and `useOptimistic`
 * mirrors it instantly.
 *
 * **Dual optimistic state (UNN-459).** The M0 cutover split spatial state onto
 * the Map Instance, so this hook holds **two** optimistic containers and **two**
 * version tokens (one {@link useQueuedWrite} per row), routed by
 * {@link isMapInstanceEvent}:
 * - a non-spatial session event reduces the `session` container and enqueues on
 *   the **encounter** queue (carrying the encounter `expectedVersion`);
 * - a pure spatial event reduces the `instance` container and enqueues on the
 *   **Instance** queue (carrying `expectedInstanceVersion`);
 * - `addCombatant`/`removeCombatant` are the cross-write: they reduce **both**
 *   containers (`reduceCombatSession` + the Instance occupancy reduce) and the
 *   server commits both rows in one txn — so the queued write carries **both**
 *   versions and, on success, advances **both** version refs (the Instance ref by
 *   hand, since the action returns only the encounter version).
 *
 * **Stale-read safety (the UNN-226 trap).** Each `useQueuedWrite` owns its row's
 * version in a monotonic ref and serializes back-to-back dispatches, so a rapid
 * move-then-engage reads the freshly-bumped Instance token its predecessor
 * produced rather than a stale outer-scope `instance` value — the post-state is
 * always the reducer applied to the loaded row server-side, never composed from a
 * closure variable. On success it `router.refresh()`es to re-sync both
 * `useOptimistic` bases; on failure the toast fires while React reverts both
 * optimistic states automatically.
 */
export function useEncounterSetup(
  encounter: Pick<EncounterRow, "id" | "shortId" | "session" | "version">,
  instance: Pick<MapInstanceRow, "state" | "version">
) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [session, applySessionOptimistic] = useOptimistic(
    encounter.session,
    (current, event: CombatEvent) => reduceCombatSession(current, event)
  )
  const [instanceState, applyInstanceOptimistic] = useOptimistic(
    instance.state,
    reduceInstanceOptimistic
  )

  const encounterWrite = useQueuedWrite({
    serverVersion: encounter.version,
    refetchVersion: () => fetchEncounterVersion(encounter.shortId),
  })
  const instanceWrite = useQueuedWrite({ serverVersion: instance.version })

  function dispatch(event: CombatEvent | MapInstanceEvent) {
    startTransition(async () => {
      const result = await dispatchCombatEvent({
        event,
        encounterId: encounter.id,
        applySessionOptimistic,
        applyInstanceOptimistic,
        encounterWrite,
        instanceWrite,
      })
      if (!result.ok) {
        toast.error(encounterErrorMessage(result.error))
        return
      }
      router.refresh()
    })
  }

  return { session, instance: instanceState, isPending, dispatch }
}
