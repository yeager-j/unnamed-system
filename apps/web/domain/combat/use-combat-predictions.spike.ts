"use client"

import { createNextPredictedRoot } from "@workspace/headcanon/next/client"

import { combatProtocol } from "@/domain/combat/commit/protocol"
import { applyCombatMutationAction } from "@/lib/actions/combat/mutations/apply"
import { axisInvalidations } from "@/lib/realtime/axis-invalidations"

/** UNN-688 spike: golden-path form of `use-combat-predictions.ts`. */
export const useCombatPredictionsSpike = createNextPredictedRoot({
  protocol: combatProtocol,
  action: applyCombatMutationAction,
  invalidations: axisInvalidations,
})
