import type {
  AcceptedStamp,
  MutationEnvelope,
  ProtocolInvocation,
} from "@workspace/headcanon"
import {
  createNextPredictedRoot,
  useRouterRefresh,
} from "@workspace/headcanon/next/client"
import { err, ok, type Result } from "@workspace/result"

import {
  entityProtocol,
  type EntityMutationError,
} from "@/domain/entity/commit/protocol"
import type { EntityWriteAuthRejection } from "@/lib/actions/entity/authorize-write"
import { applyEntityMutationAction } from "@/lib/actions/entity/mutations/apply"
import { createLazyAblyInvalidationAdapter } from "@/lib/realtime/axis-invalidations"

/**
 * The character surfaces' Headcanon root family (P2d — UNN-676): the first
 * `createNextPredictedRoot` consumer. Everything hard lives behind the package —
 * one ordered delivery queue, the private lifecycle ledger, ambiguous-delivery
 * retry with a stable mutation id, replay over every newer canon, accepted-vector
 * canonization, refresh coalescing, stall detection, and Next control-flow
 * preservation (`unstable_rethrow` before an ordinary throw becomes
 * `delivery: "uncertain"`).
 *
 * This module owns only the app's three seams: the protocol, the Server Action
 * door, and the invalidation transport.
 */

type EntityInvocation = ProtocolInvocation<typeof entityProtocol>

/**
 * The door translates authorization rejections to `forbidden()` (a throw), so
 * they can never come back as a returned outcome. The record is exhaustive over
 * {@link EntityWriteAuthRejection} — a new auth rejection member fails this
 * module's typecheck rather than silently leaking into the client error union.
 */
const DOOR_TRANSLATED_REJECTIONS: Record<EntityWriteAuthRejection, true> = {
  unauthorized: true,
  "archetype-hidden": true,
  "archetype-locked": true,
}

function isDoorTranslatedRejection(
  rejection: string
): rejection is EntityWriteAuthRejection {
  return rejection in DOOR_TRANSLATED_REJECTIONS
}

/**
 * Delivers one envelope through the entity door and maps the executor outcome
 * onto the client failure surface:
 *
 * - an accepted terminal outcome returns its stamp (the axis revision vector);
 * - a terminal domain rejection returns typed — the prediction rolls back;
 * - exhausted contention returns `"contention"` — terminal client-side, and safe
 *   because the authority stored no receipt (the user simply retries the edit);
 * - envelope/argument/id-reuse failures throw: they are programmer bugs, and a
 *   loud uncertain-delivery state beats silently eating a protocol defect.
 *
 * A transport throw (network drop, lost response) propagates to the package,
 * which classifies Next control flow first and then holds the envelope as
 * uncertain for honest same-id redelivery.
 */
async function deliverEntityMutation(
  envelope: MutationEnvelope<EntityInvocation>
): Promise<Result<AcceptedStamp, EntityMutationError>> {
  const outcome = await applyEntityMutationAction(envelope)

  if (!outcome.ok) {
    if (outcome.error.code === "contention") return err("contention")
    throw new Error(
      `entity mutation executor refused the envelope: ${outcome.error.code}`
    )
  }

  if (outcome.value.kind === "rejected") {
    const rejection = outcome.value.error
    if (isDoorTranslatedRejection(rejection)) {
      throw new Error(
        `an authorization rejection escaped the door untranslated: ${rejection}`
      )
    }
    return err(rejection)
  }

  return ok(outcome.value.stamp)
}

/**
 * The mounted-root hook `EntityWriteProvider` binds: RSC canon carrier
 * (`useRouterRefresh`, 250 ms acceptance grace) and lazy Ably axis
 * invalidations. Character routes deliberately take no polling fallback —
 * parity with the ping-channel era they replace.
 */
export const useEntityPredictions = createNextPredictedRoot({
  protocol: entityProtocol,
  send: deliverEntityMutation,
  refresh: useRouterRefresh,
  invalidations: createLazyAblyInvalidationAdapter(),
})
