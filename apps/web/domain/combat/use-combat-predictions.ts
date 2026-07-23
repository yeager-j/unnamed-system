"use client"

import { createNextPredictedRoot } from "@workspace/headcanon/next/client"

import { combatProtocol } from "@/domain/combat/commit/protocol"
import { applyCombatMutationAction } from "@/lib/actions/combat/mutations/apply"
import { axisInvalidations } from "@/lib/realtime/axis-invalidations"
import { mutationRecoveryToasts } from "@/lib/sync/mutation-recovery-toasts"

export const useCombatPredictions = createNextPredictedRoot({
  protocol: combatProtocol,
  action: applyCombatMutationAction,
  invalidations: axisInvalidations,
  recoveryListeners: mutationRecoveryToasts({
    scope: "combat",
    messages: {
      delivery: "Connection lost mid-save — your combat change is kept.",
      freshness: "Couldn't confirm the latest combat changes.",
      conflict: "A combat change was rolled back because the roster changed.",
    },
  }),
})
