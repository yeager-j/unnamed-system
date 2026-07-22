"use client"

import { createNextPredictedRoot } from "@workspace/headcanon/next/client"

import { dungeonProtocol } from "@/domain/dungeon/commit/protocol"
import { applyDungeonMutationAction } from "@/lib/actions/dungeon/mutations/apply"
import { axisInvalidations } from "@/lib/realtime/axis-invalidations"

/** UNN-688 spike: golden-path form of `use-dungeon-predictions.ts`. */
export const useDungeonPredictionsSpike = createNextPredictedRoot({
  protocol: dungeonProtocol,
  action: applyDungeonMutationAction,
  invalidations: axisInvalidations,
})
