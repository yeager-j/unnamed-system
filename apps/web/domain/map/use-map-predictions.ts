"use client"

import { createNextPredictedRoot } from "@workspace/headcanon/next/client"

import { mapProtocol } from "@/domain/map/commit/protocol"
import { applyMapMutationAction } from "@/lib/actions/map/mutations/apply"
import { axisInvalidations } from "@/lib/realtime/axis-invalidations"

export const useMapPredictions = createNextPredictedRoot({
  protocol: mapProtocol,
  action: applyMapMutationAction,
  invalidations: axisInvalidations,
})
