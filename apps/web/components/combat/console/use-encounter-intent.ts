"use client"

import { toast } from "sonner"

import type { ManagedMutationError } from "@workspace/replica"
import { err, ok, type Result } from "@workspace/result"

import type { EncounterSessionEvent } from "@/domain/combat/replica/mutations"
import type {
  CombatReplicaRejection,
  CombatWriteDispatchError,
} from "@/domain/combat/replica/rejection"
import type { UseCombatReplicasReturn } from "@/domain/combat/replica/use-combat-replicas"
import { combatErrorMessage } from "@/lib/actions/combat/error-message"
import { guardWrite } from "@/lib/sync/guard-write-transition"

export type DispatchEncounterIntent = (
  event: EncounterSessionEvent,
  options?: { readonly roundComplete?: boolean }
) => Promise<Result<void, CombatWriteDispatchError> | null>

/**
 * The session-intent binding is deliberately smaller than the mutation
 * registry: callers describe one existing combat event while the binding
 * captures precondition evidence from the current Encounter projection,
 * mints the stable named invocation, and owns the receipt policy.
 */
export function useEncounterIntent({
  mutateEncounter,
}: {
  mutateEncounter: UseCombatReplicasReturn["mutateEncounter"]
}): { dispatchIntent: DispatchEncounterIntent } {
  const dispatchIntent: DispatchEncounterIntent = (event, options) =>
    guardWrite(
      () => runIntent(event, options),
      () => toast.error("Couldn't save. Try again.")
    )

  async function runIntent(
    event: EncounterSessionEvent,
    options?: { readonly roundComplete?: boolean }
  ): Promise<Result<void, CombatWriteDispatchError>> {
    const started = mutateEncounter(event, {
      roundComplete: options?.roundComplete ?? false,
    })
    if (!started.ok) return failCurrentState(started.error)

    const local = await started.value.local
    if (!local.ok) return failReceipt(local.error)

    // A replay conflict removes its prediction immediately, but its remote
    // receipt is still the one terminal authority outcome. Waiting here keeps
    // conflict and rejection to one specific toast instead of two competing
    // error paths.
    const remote = await started.value.remote
    if (!remote.ok) return failReceipt(remote.error)
    return ok(undefined)
  }

  function failCurrentState(
    error: CombatWriteDispatchError
  ): Result<never, CombatWriteDispatchError> {
    if (error !== "write-unavailable") {
      toast.error(combatErrorMessage(error))
    }
    return err(error)
  }

  function failReceipt(
    error: ManagedMutationError<CombatReplicaRejection>
  ): Result<never, CombatWriteDispatchError> {
    switch (error.kind) {
      case "refused":
      case "rejected":
        toast.error(combatErrorMessage(error.error))
        return err(error.error)
      case "invalid":
        toast.error(combatErrorMessage("invalid-write"))
        return err("invalid-write")
      case "disposed":
      case "expired":
      case "unavailable":
        return err("write-unavailable")
    }
  }

  return { dispatchIntent }
}
