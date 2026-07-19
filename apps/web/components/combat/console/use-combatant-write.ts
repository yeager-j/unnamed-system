"use client"

import { useTransition } from "react"
import { toast } from "sonner"

import type { ComponentRegistry } from "@workspace/game-v2/kernel"
import type { ParticipantId } from "@workspace/game-v2/kernel/participant-id.schema"
import type { MutationError } from "@workspace/replica"
import { err, ok, type Result } from "@workspace/result"

import type { ConsoleOptimisticAction } from "@/domain/combat/console-optimistic"
import type {
  CombatReplicaRejection,
  CombatWriteDispatchError,
} from "@/domain/combat/replica/rejection"
import type { CombatWriteHandle } from "@/domain/combat/replica/use-combat-replicas"
import type { CombatEntityWrite } from "@/domain/entity/commit/write.schema"
import { applyEntityWrite } from "@/domain/entity/commit/writers"
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
 * owns **no** `useOptimistic` of its own: the prediction is pushed into the
 * console's one optimistic container as a `{ kind: "write" }` action, whose
 * reducer applies the Writer patch **to the participant in the current
 * frame** — the structural UNN-226 fix (a post-state never travels in the
 * action, so back-to-back damage clicks sum instead of clobbering).
 *
 * Storage is somebody else's problem: the participant's
 * {@link CombatWriteHandle} (resolved once by `useCombatReplicas`, the app's
 * ownership decision point) hides which replica the write rides, so this
 * hook is branchless — predict, mirror, `handle.mutate(write)`. The replica
 * owns ordering, delivery, dedup, retry, and rebase; the container stays the
 * render frame (Open Q5 — convergence deliberately deferred).
 *
 * **The transition holds until `remote` settles**, deliberately: the
 * console's frame is the un-converged `useOptimistic` container, so the
 * predicted entry must stay mounted until the push response's revalidated
 * RSC payload has advanced the base (the UNN-567 anti-flash-revert shape).
 * A parked replica (retry exhaustion) keeps its transitions pending — the
 * prediction stays mounted, and delivery resumes on the next liveness
 * evidence rather than reverting a write the authority may still commit.
 *
 * A Writer **refusal** from the local pre-check short-circuits before any
 * dispatch — judged against the frame the DM sees (not the replica base):
 * programmer-bug tier, toasts, never hits the network. Every failure toasts
 * here (the one error-copy home) except the quiet `write-unavailable` arm.
 */
export function useCombatantWrite({
  handleOf,
  componentsOf,
  applyOptimistic,
  onRemoteVersion,
}: {
  handleOf: (participantId: ParticipantId) => CombatWriteHandle | undefined
  componentsOf: (
    participantId: ParticipantId
  ) => Partial<ComponentRegistry> | undefined
  applyOptimistic: (action: ConsoleOptimisticAction) => void
  /** Fed the inline door's committed encounter version (`Remote`), so the
   *  surviving event-queue token stays fresh across the two protocols
   *  sharing the encounter row. */
  onRemoteVersion?: (version: number) => void
}): { dispatchWrite: DispatchCombatantWrite } {
  const [, startTransition] = useTransition()

  // The whole dispatch runs as one async transition owned HERE — the mirror
  // (`applyOptimistic`) targets the console's `useOptimistic` container, and an
  // optimistic update outside a transition both warns and reverts immediately
  // instead of holding until the action settles. Drawer controls call
  // `dispatchWrite` bare, so the hook can't rely on callers wrapping it. The
  // resolve-inside-transition shape keeps the caller-visible Promise<Result>.
  const dispatchWrite: DispatchCombatantWrite = (participantId, write) =>
    new Promise((resolve) => {
      startTransition(async () => {
        resolve(
          await guardWrite(
            () => runWrite(participantId, write),
            () => toast.error("Couldn't save. Try again.")
          )
        )
      })
    })

  const runWrite = async (
    participantId: ParticipantId,
    write: CombatEntityWrite
  ): Promise<Result<void, CombatWriteDispatchError>> => {
    const components = componentsOf(participantId)
    const handle = handleOf(participantId)
    if (components === undefined || handle === undefined) {
      toast.error(combatErrorMessage("participant-not-found"))
      return err("participant-not-found")
    }

    const predicted = applyEntityWrite(components, write)
    if (!predicted.ok) {
      toast.error(combatErrorMessage(predicted.error))
      return predicted
    }

    applyOptimistic({ kind: "write", participantId, write })

    const receipt = handle.mutate(write)
    const local = await receipt.local
    if (!local.ok) return failed(local.error)

    const remote = await receipt.remote
    if (!remote.ok) return failed(remote.error)

    if (remote.value !== undefined) onRemoteVersion?.(remote.value.version)
    return ok(undefined)
  }

  const failed = (
    error: MutationError<CombatReplicaRejection>
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
        return err("write-unavailable")
    }
  }

  return { dispatchWrite }
}
