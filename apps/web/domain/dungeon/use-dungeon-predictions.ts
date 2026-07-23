"use client"

import { createNextPredictedRoot } from "@workspace/headcanon/next/client"

import { dungeonProtocol } from "@/domain/dungeon/commit/protocol"
import { applyDungeonMutationAction } from "@/lib/actions/dungeon/mutations/apply"
import { axisInvalidations } from "@/lib/realtime/axis-invalidations"
import { mutationRecoveryToasts } from "@/lib/sync/mutation-recovery-toasts"

export const useDungeonPredictions = createNextPredictedRoot({
  protocol: dungeonProtocol,
  action: applyDungeonMutationAction,
  invalidations: axisInvalidations,
  recoveryListeners: mutationRecoveryToasts({
    scope: "dungeon",
    messages: {
      delivery: "Connection lost mid-save — your dungeon change is kept.",
      freshness: "Couldn't confirm the latest dungeon changes.",
      conflict: "A dungeon change was rolled back because the delve changed.",
    },
  }),
})
