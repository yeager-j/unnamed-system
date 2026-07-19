import type { ReplicaEvent } from "@workspace/replica"

/**
 * The client half of combat-replica observability, the combat sibling of
 * `domain/entity/replica/events.ts` — same policy: routine mutation traffic
 * stays quiet; recovery, replay, and expiry anomalies warn with names, ids,
 * and counts only — never mutation arguments or rejection payloads. The
 * `root` tag distinguishes the durable and encounter streams.
 */
export function logCombatReplicaEvent(
  root: "durable" | "encounter",
  event: ReplicaEvent
): void {
  switch (event.kind) {
    case "retried":
    case "conflict":
    case "expired":
      console.warn(`[combat-replica-client:${root}]`, JSON.stringify(event))
      return
    case "snapshot":
      if (event.replayed > 0) {
        console.warn(`[combat-replica-client:${root}]`, JSON.stringify(event))
      }
      return
    default:
      return
  }
}
