"use client"

import { useTransition } from "react"
import { toast } from "sonner"

import type { ComponentRegistry } from "@workspace/game-v2/kernel"
import type { ParticipantId } from "@workspace/game-v2/kernel/participant-id.schema"
import { err, type Result } from "@workspace/result"

import type { ConsoleOptimisticAction } from "@/domain/combat/console-optimistic"
import type { CombatEntityWrite } from "@/domain/entity/commit/write.schema"
import { applyEntityWrite } from "@/domain/entity/commit/writers"
import type { ApplyCombatantWriteError } from "@/lib/actions/combat/commit/apply-combatant-write.schema"
import type { CommittedWrite } from "@/lib/actions/combat/commit/stores"
import { combatErrorMessage } from "@/lib/actions/combat/error-message"
import { guardWrite } from "@/lib/sync/guard-write-transition"

import type { WriteLane } from "./write-lanes"

export type DispatchCombatantWrite = (
  participantId: ParticipantId,
  write: CombatEntityWrite
) => Promise<Result<CommittedWrite, ApplyCombatantWriteError> | null>

/**
 * The console's **combatant component-write dispatcher** (UNN-520; UNN-535;
 * slimmed onto lanes in UNN-567). It owns **no** `useOptimistic` of its own:
 * the prediction is pushed into the console's one optimistic container as a
 * `{ kind: "write" }` action, whose reducer applies the Writer patch **to the
 * participant in the current frame** — the structural UNN-226 fix (a
 * post-state never travels in the action, so back-to-back damage clicks sum
 * instead of clobbering).
 *
 * Storage is somebody else's problem: dispatch + token accounting live on the
 * participant's {@link WriteLane} (resolved once by `useCombatantLanes`, the
 * client half of the CD19 router), so this hook is branchless — predict,
 * mirror, `lane.commit(write)`.
 *
 * A Writer **refusal** from the local pre-check short-circuits before any
 * dispatch — programmer-bug tier (the affordance shouldn't have rendered), so
 * it toasts and never hits the network. Every failure toasts here (the one
 * error-copy home), and the result is returned for callers that care.
 */
export function useCombatantWrite({
  laneOf,
  componentsOf,
  applyOptimistic,
}: {
  laneOf: (participantId: ParticipantId) => WriteLane | undefined
  componentsOf: (
    participantId: ParticipantId
  ) => Partial<ComponentRegistry> | undefined
  applyOptimistic: (action: ConsoleOptimisticAction) => void
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
  ): Promise<Result<CommittedWrite, ApplyCombatantWriteError>> => {
    const components = componentsOf(participantId)
    const lane = laneOf(participantId)
    if (components === undefined || lane === undefined) {
      toast.error(combatErrorMessage("participant-not-found"))
      return err("participant-not-found")
    }

    const predicted = applyEntityWrite(components, write)
    if (!predicted.ok) {
      toast.error(combatErrorMessage(predicted.error))
      return predicted
    }

    applyOptimistic({ kind: "write", participantId, write })

    const result = await lane.commit(write)
    if (!result.ok) toast.error(combatErrorMessage(result.error))
    return result
  }

  return { dispatchWrite }
}
