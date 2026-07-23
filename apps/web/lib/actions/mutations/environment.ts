import "server-only"

import type {
  InvalidationPublicationFailureReporter,
  InvalidationPublisher,
} from "@workspace/headcanon"
import { createAblyInvalidationPublisher } from "@workspace/headcanon/ably/server"
import {
  createDrizzleMutationAuthority,
  type DrizzleMutationTx,
} from "@workspace/headcanon/drizzle"
import type {
  bindMutation,
  MutationCommand,
} from "@workspace/headcanon/next/server"

import { requireActor, type Actor } from "@/lib/auth/actor"
import { getDb } from "@/lib/db/client"
import { realtimeNamespace } from "@/lib/realtime/channels"
import { getAblyRest } from "@/lib/realtime/client"

type ShowtimeMutation = Parameters<typeof bindMutation>[0]
type ShowtimeDatabase = ReturnType<typeof getDb>

export type ShowtimeMutationCommand<
  Mutation extends ShowtimeMutation,
  Projection,
  Evidence,
> = MutationCommand<
  Mutation,
  Actor,
  ShowtimeDatabase,
  DrizzleMutationTx<ShowtimeDatabase>,
  Projection,
  Evidence
>

interface ShowtimeMutationEnvironmentOptions {
  readonly isContentionError?: (error: unknown) => boolean
}

const showtimeMutationInvalidations: InvalidationPublisher = {
  async publish(eventId, stamp) {
    const rest = getAblyRest()
    if (!rest) return
    await createAblyInvalidationPublisher({
      rest,
      namespace: realtimeNamespace(),
    }).publish(eventId, stamp)
  },
}

const reportInvalidationFailure: InvalidationPublicationFailureReporter = (
  failure
) => {
  console.error("[headcanon] axis invalidation publish failed", {
    kind: failure.kind,
    eventId: failure.eventId,
  })
}

/**
 * The stable Showtime policy shared by every Headcanon mutation root.
 *
 * Invalidation publication remains advisory: an accepted mutation still
 * refreshes its invoking route when Ably is unavailable or publication fails.
 */
export function showtimeMutationEnvironment(
  options: ShowtimeMutationEnvironmentOptions = {}
) {
  return {
    actor: requireActor,
    authority: createDrizzleMutationAuthority({
      db: getDb(),
      scope: (actor: Actor) => actor.userId,
      isContentionError: options.isContentionError,
    }),
    invalidations: showtimeMutationInvalidations,
    reportInvalidationFailure,
  }
}
