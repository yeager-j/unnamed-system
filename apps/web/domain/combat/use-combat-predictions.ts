"use client"

import {
  createNextMutationSender,
  createNextPredictedRoot,
  useRouterRefresh,
} from "@workspace/headcanon/next/client"

import { combatProtocol } from "@/domain/combat/commit/protocol"
import { applyCombatMutationAction } from "@/lib/actions/combat/mutations/apply"
import { axisInvalidations } from "@/lib/realtime/axis-invalidations"

export const useCombatPredictions = createNextPredictedRoot({
  protocol: combatProtocol,
  send: createNextMutationSender<typeof combatProtocol>(
    applyCombatMutationAction
  ),
  refresh: useRouterRefresh,
  invalidations: axisInvalidations,
})
