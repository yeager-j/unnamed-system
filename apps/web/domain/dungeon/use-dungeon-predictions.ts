"use client"

import {
  createNextMutationSender,
  createNextPredictedRoot,
  useRouterRefresh,
} from "@workspace/headcanon/next/client"

import { dungeonProtocol } from "@/domain/dungeon/commit/protocol"
import { applyDungeonMutationAction } from "@/lib/actions/dungeon/mutations/apply"
import { axisInvalidations } from "@/lib/realtime/axis-invalidations"

export const useDungeonPredictions = createNextPredictedRoot({
  protocol: dungeonProtocol,
  send: createNextMutationSender<typeof dungeonProtocol>(
    applyDungeonMutationAction
  ),
  refresh: useRouterRefresh,
  invalidations: axisInvalidations,
})
