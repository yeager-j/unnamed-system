import { useSyncExternalStore } from "react"

import type { Replica, ReplicaSnapshot } from "./index"
import type { MutationInvocation } from "./mutations"

/**
 * The application owns where a replica instance lives (typically a
 * domain-specific context) and must not recreate it during render; the
 * runtime that creates it also owns `dispose`.
 */
export function useReplica<State, ApplyError>(
  replica: Replica<State, MutationInvocation, ApplyError, unknown>
): ReplicaSnapshot<State, ApplyError> {
  return useSyncExternalStore(
    replica.subscribe,
    replica.getSnapshot,
    replica.getSnapshot
  )
}
