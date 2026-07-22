"use client"

import { toast } from "sonner"

import type { ParticipantId } from "@workspace/game-v2/kernel/participant-id.schema"

import {
  combatWrite,
  type CombatWriteRefusal,
} from "@/domain/combat/commit/protocol"
import { useCombatPredictions } from "@/domain/combat/use-combat-predictions"
import type { CombatEntityWrite } from "@/domain/entity/commit/write.schema"
import { combatErrorMessage } from "@/lib/actions/combat/error-message"

export type DispatchCombatantWrite = (
  participantId: ParticipantId,
  write: CombatEntityWrite
) => void

export function useCombatantWrite({
  encounterId,
  root,
}: {
  encounterId: string
  root: ReturnType<typeof useCombatPredictions>
}): { dispatchWrite: DispatchCombatantWrite; pending: boolean } {
  const surface = (error: CombatWriteRefusal): void => {
    toast.error(combatErrorMessage(error))
  }

  const dispatchWrite: DispatchCombatantWrite = (participantId, write) => {
    const result = root.mutate(
      combatWrite({ encounterId, participantId, write })
    )
    if (!result.ok) {
      surface(result.error)
      return
    }

    void result.value.accepted.then((accepted) => {
      if (accepted.ok) return
      if (
        accepted.error.kind === "domain" ||
        accepted.error.kind === "replay-refused"
      ) {
        surface(accepted.error.error)
      }
    })
  }

  return { dispatchWrite, pending: root.status.pending > 0 }
}
