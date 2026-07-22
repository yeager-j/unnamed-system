import { createNextPredictedRoot } from "@workspace/headcanon/next/client"

import { entityProtocol } from "@/domain/entity/commit/protocol"
import { applyEntityMutationAction } from "@/lib/actions/entity/mutations/apply"
import { axisInvalidations } from "@/lib/realtime/axis-invalidations"

/**
 * The character surfaces' Headcanon root family (P2d — UNN-676): the first
 * `createNextPredictedRoot` consumer. Everything hard lives behind the package —
 * one ordered delivery queue, the private lifecycle ledger, ambiguous-delivery
 * retry with a stable mutation id, replay over every newer canon, accepted-vector
 * canonization, refresh coalescing, stall detection, and Next control-flow
 * preservation (`unstable_rethrow` before an ordinary throw becomes
 * `delivery: "uncertain"`).
 *
 * This module owns only the app's three seams: the protocol, the Server Action,
 * and the invalidation transport.
 */

/**
 * The mounted-root hook `EntityWriteProvider` binds the generated action to
 * the default App Router canon carrier (250 ms acceptance grace) and lazy Ably
 * axis invalidations. Character routes deliberately take no polling fallback —
 * parity with the ping-channel era they replace.
 */
export const useEntityPredictions = createNextPredictedRoot({
  protocol: entityProtocol,
  action: applyEntityMutationAction,
  invalidations: axisInvalidations,
})
