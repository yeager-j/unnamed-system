"use client"

import { createNextPredictedRoot } from "@workspace/headcanon/next/client"

import { templateSetProtocol } from "@/domain/template-set/commit/protocol"
import { applyTemplateSetMutationAction } from "@/lib/actions/template-set/mutations/apply"
import { axisInvalidations } from "@/lib/realtime/axis-invalidations"

export const useTemplateSetPredictions = createNextPredictedRoot({
  protocol: templateSetProtocol,
  action: applyTemplateSetMutationAction,
  invalidations: axisInvalidations,
})
