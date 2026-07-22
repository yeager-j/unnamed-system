"use client"

import { useEffect, useRef, useState } from "react"
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

const DELIVERY_TOAST_ID = "combat-delivery-uncertain"
const FRESHNESS_TOAST_ID = "combat-refresh-stalled"

export function useCombatantWrite({
  encounterId,
  root,
}: {
  encounterId: string
  root: ReturnType<typeof useCombatPredictions>
}): { dispatchWrite: DispatchCombatantWrite; pending: boolean } {
  const [inflight, setInflight] = useState(0)

  useEffect(() => {
    if (root.status.delivery === "uncertain") {
      toast.error("Connection lost mid-save — your combat change is kept.", {
        id: DELIVERY_TOAST_ID,
        duration: Infinity,
        action: { label: "Retry", onClick: root.retryDelivery },
      })
    } else {
      toast.dismiss(DELIVERY_TOAST_ID)
    }
  }, [root.status.delivery, root.retryDelivery])

  useEffect(() => {
    if (root.status.freshness === "stalled") {
      toast.error("Couldn't confirm the latest combat changes.", {
        id: FRESHNESS_TOAST_ID,
        duration: Infinity,
        action: { label: "Refresh", onClick: root.retryRefresh },
      })
    } else {
      toast.dismiss(FRESHNESS_TOAST_ID)
    }
  }, [root.status.freshness, root.retryRefresh])

  const surfacedConflicts = useRef(0)
  useEffect(() => {
    if (root.conflicts.length > surfacedConflicts.current) {
      surfacedConflicts.current = root.conflicts.length
      toast.error("A combat change was rolled back because the roster changed.")
    }
  }, [root.conflicts])

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

    setInflight((count) => count + 1)
    void result.value.accepted.then((accepted) => {
      setInflight((count) => count - 1)
      if (accepted.ok) return
      if (
        accepted.error.kind === "domain" ||
        accepted.error.kind === "replay-refused"
      ) {
        surface(accepted.error.error)
      }
    })
  }

  return { dispatchWrite, pending: inflight > 0 }
}
