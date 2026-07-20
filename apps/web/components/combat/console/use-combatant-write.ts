"use client"

import { toast } from "sonner"

import type { ParticipantId } from "@workspace/game-v2/kernel/participant-id.schema"
import type { ManagedMutationError } from "@workspace/replica"
import { err, ok, type Result } from "@workspace/result"

import type {
  CombatReplicaRejection,
  CombatWriteDispatchError,
} from "@/domain/combat/replica/rejection"
import type { CombatWriteHandle } from "@/domain/combat/replica/use-combat-replicas"
import type { CombatEntityWrite } from "@/domain/entity/commit/write.schema"
import { combatErrorMessage } from "@/lib/actions/combat/error-message"
import { guardWrite } from "@/lib/sync/guard-write-transition"

export type { CombatWriteDispatchError } from "@/domain/combat/replica/rejection"

export type DispatchCombatantWrite = (
  participantId: ParticipantId,
  write: CombatEntityWrite
) => Promise<Result<void, CombatWriteDispatchError> | null>

/**
 * The console's **combatant component-write dispatcher** (UNN-520; UNN-535;
 * UNN-567; rebound as a thin binding over `replica.mutate` in UNN-646). It
 * owns **no** optimistic container: `handle.mutate(write)` synchronously
 * predicts into the Replica projection that the combat model renders.
 *
 * Storage is somebody else's problem: the participant's
 * {@link CombatWriteHandle} (resolved once by `useCombatReplicas`, the app's
 * ownership decision point) hides which replica the write rides, so this
 * hook is branchless — `handle.mutate(write)`. The replica
 * owns ordering, delivery, dedup, retry, and rebase; the container stays the
 * event frame for roster/turn/overlay/spatial optimism only (UNN-653).
 *
 * A Writer/schema refusal comes from the Replica's `local` receipt, so there
 * is no second projection or precheck to disagree with. Every failure toasts
 * here (the one error-copy home) except the quiet `write-unavailable` arm.
 */
export function useCombatantWrite({
  handleOf,
  onRemoteVersion,
}: {
  handleOf: (participantId: ParticipantId) => CombatWriteHandle | undefined
  /** Fed the inline door's committed encounter version (`Remote`), so the
   *  surviving command-queue token stays fresh across the two protocols
   *  sharing the encounter row. */
  onRemoteVersion?: (version: number) => void
}): { dispatchWrite: DispatchCombatantWrite } {
  const dispatchWrite: DispatchCombatantWrite = (participantId, write) =>
    guardWrite(
      () => runWrite(participantId, write),
      () => toast.error("Couldn't save. Try again.")
    )

  const runWrite = async (
    participantId: ParticipantId,
    write: CombatEntityWrite
  ): Promise<Result<void, CombatWriteDispatchError>> => {
    const handle = handleOf(participantId)
    if (handle === undefined) {
      toast.error(combatErrorMessage("participant-not-found"))
      return err("participant-not-found")
    }

    const receipt = handle.mutate(write)
    const local = await receipt.local
    if (!local.ok) return failed(local.error)

    const remote = await receipt.remote
    if (!remote.ok) return failed(remote.error)

    if (remote.value !== undefined) onRemoteVersion?.(remote.value.version)
    return ok(undefined)
  }

  const failed = (
    error: ManagedMutationError<CombatReplicaRejection>
  ): Result<never, CombatWriteDispatchError> => {
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

  return { dispatchWrite }
}
