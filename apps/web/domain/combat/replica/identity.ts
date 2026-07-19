import type { ClientIdentity } from "@workspace/replica"

/**
 * Mints the client identities for the combat replicas (UNN-646), the combat
 * siblings of `domain/entity/replica/identity.ts` — same rules: the group
 * names one root's replica family, the client one ordered producer within it,
 * fresh per (tab × replica instance) because the pending log is memory-only.
 * Abandoned identities' ledger rows are reclaimed by the doors' TTL sweeps.
 *
 * The `combat-entity:` prefix keeps a durable combat client distinguishable
 * from the owner sheet's `entity:` group in the shared `replicaClient` ledger
 * while pinning to the same entity row — one entity, two replica families,
 * each an independent ordered stream.
 */
export function mintCombatEntityIdentity(entityId: string): ClientIdentity {
  return {
    clientGroupId: `combat-entity:${entityId}`,
    clientId: crypto.randomUUID(),
  }
}

export function mintCombatSessionIdentity(encounterId: string): ClientIdentity {
  return {
    clientGroupId: `combat-session:${encounterId}`,
    clientId: crypto.randomUUID(),
  }
}
