"use client"

import { createNextPredictedRoot } from "@workspace/headcanon/next/client"

import { entityProtocol } from "@/domain/entity/commit/protocol"
import { applyEntityMutationAction } from "@/lib/actions/entity/mutations/apply"
import { axisInvalidations } from "@/lib/realtime/axis-invalidations"

/**
 * UNN-688 spike: the golden-path form of `use-entity-predictions.ts`. The three
 * options are exactly the app's three seams — protocol, Server Action, and
 * invalidation transport; the sender adapter and App Router refresh carrier
 * are implied by the `action` form. Delete or promote with the spike outcome.
 */
export const useEntityPredictionsSpike = createNextPredictedRoot({
  protocol: entityProtocol,
  action: applyEntityMutationAction,
  invalidations: axisInvalidations,
})
