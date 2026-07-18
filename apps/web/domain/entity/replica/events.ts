import type { ReplicaEvent } from "@workspace/replica"

/**
 * The client half of entity-replica observability (UNN-649). Routine mutation
 * traffic stays quiet; recovery, replay, and expiry anomalies use the same
 * structured warn shape as the authority processor. Replica events contain
 * names, ids, and counts only — never mutation arguments or rejection payloads.
 */
export function logEntityReplicaEvent(event: ReplicaEvent): void {
  switch (event.kind) {
    case "retried":
    case "conflict":
    case "expired":
      console.warn("[entity-replica-client]", JSON.stringify(event))
      return
    case "snapshot":
      if (event.replayed > 0) {
        console.warn("[entity-replica-client]", JSON.stringify(event))
      }
      return
    default:
      return
  }
}
