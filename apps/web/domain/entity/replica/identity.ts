import type { ClientIdentity } from "@workspace/replica"

/**
 * Mints the client identity for one entity replica (UNN-645): the group names
 * the entity's replica family, the client one ordered producer within it —
 * one per (tab × replica instance), because the authority's ordering
 * invariant is per client and delivery is not serialized across entities.
 *
 * Fresh per instance, deliberately: the pending log is memory-only, so
 * resuming a previous identity after reload buys nothing — a new client
 * starts at `through` from its personalized snapshot and owes the ledger no
 * history. Abandoned identities' dedup rows are reclaimed by the push door's
 * TTL sweep; an identity that outlives the sweep is refused `unknown-client`
 * and rebuilt through this same mint.
 */
export function mintEntityClientIdentity(entityId: string): ClientIdentity {
  return {
    clientGroupId: `entity:${entityId}`,
    clientId: crypto.randomUUID(),
  }
}
