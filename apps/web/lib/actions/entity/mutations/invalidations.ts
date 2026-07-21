import "server-only"

import type {
  InvalidationPublicationFailureReporter,
  InvalidationPublisher,
} from "@workspace/headcanon"
import { createAblyInvalidationPublisher } from "@workspace/headcanon/ably/server"

import { realtimeNamespace } from "@/lib/realtime/channels"
import { getAblyRest } from "@/lib/realtime/client"

/**
 * The Headcanon axis-invalidation publisher for the entity executor (UNN-673).
 *
 * Reuses the app's lazy Ably REST client and per-environment namespace (so PR
 * previews that collide on ids can't cross-talk). When `ABLY_API_KEY` is unset
 * `getAblyRest()` returns null and this is a no-op publisher — publication is
 * advisory (own-write cache invalidation + route refresh still reconcile the
 * caller), so its absence never fails an accepted commit.
 */
export const entityInvalidationPublisher: InvalidationPublisher = {
  async publish(eventId, stamp) {
    const rest = getAblyRest()
    if (!rest) return
    await createAblyInvalidationPublisher({
      rest,
      namespace: realtimeNamespace(),
    }).publish(eventId, stamp)
  },
}

/** Records an advisory publication failure without failing the accepted mutation. */
export const reportInvalidationFailure: InvalidationPublicationFailureReporter =
  (failure) => {
    console.error("[headcanon] axis invalidation publish failed", {
      kind: failure.kind,
      eventId: failure.eventId,
    })
  }
