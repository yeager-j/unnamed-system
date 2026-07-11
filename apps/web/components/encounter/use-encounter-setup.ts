"use client"

import { useRouter } from "next/navigation"
import { useOptimistic, useTransition } from "react"
import { toast } from "sonner"

import type { EncounterState } from "@workspace/game-v2/encounter"

import type { EncounterForDM } from "@/app/combat/[shortId]/encounter-access"
import {
  dispatchCombatEvent,
  type ConsoleDispatchEvent,
} from "@/components/combat/console/dispatch-event"
import {
  reduceConsoleOptimistic,
  type ConsoleOptimisticAction,
} from "@/domain/combat/console-optimistic"
import { fetchEncounterVersion } from "@/hooks/fetch-encounter-version"
import { fetchInstanceVersion } from "@/hooks/fetch-instance-version"
import { useQueuedWrite } from "@/hooks/use-queued-write"
import { combatErrorMessage } from "@/lib/actions/combat/error-message"

/**
 * The encounter-**setup** owner-mode write surface (UNN-347), on engine v2
 * (UNN-535): the draft-time sibling of
 * {@link import("@/components/combat/console/use-combat-console").useCombatConsole}.
 * Every roster / zone / placement / engagement edit drives through the *same*
 * optimistic container ({@link reduceConsoleOptimistic} over
 * `{ session, mapInstance }`) and the same {@link dispatchCombatEvent} routing
 * onto `applyCombatEventAction` — no Save button; each edit persists per
 * interaction and the optimistic frame mirrors it instantly.
 *
 * Two {@link useQueuedWrite} version queues (encounter row / Instance row),
 * each with its own one-shot stale-retry refetch, exactly the console's
 * protocol — the ~30 shared lines are duplicated deliberately rather than
 * forced into a common hook (the console adds realtime + write-router wiring
 * this surface never grows).
 */
export function useEncounterSetup(data: EncounterForDM) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const [state, applyOptimistic] = useOptimistic<
    EncounterState,
    ConsoleOptimisticAction
  >(
    { session: data.session, mapInstance: data.instance.state },
    reduceConsoleOptimistic
  )

  const encounterWrite = useQueuedWrite({
    serverVersion: data.encounter.version,
    refetchVersion: () => fetchEncounterVersion(data.encounter.shortId),
  })
  const instanceWrite = useQueuedWrite({
    serverVersion: data.instance.version,
    refetchVersion: () => fetchInstanceVersion(data.encounter.shortId),
  })

  function dispatch(event: ConsoleDispatchEvent) {
    startTransition(async () => {
      const result = await dispatchCombatEvent({
        event,
        encounterId: data.encounter.id,
        applyOptimistic,
        encounterWrite,
        instanceWrite,
      })
      if (!result.ok) {
        toast.error(combatErrorMessage(result.error))
        return
      }
      router.refresh()
    })
  }

  return { state, isPending, dispatch }
}
