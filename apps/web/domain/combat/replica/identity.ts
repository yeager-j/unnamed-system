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
 *
 * The `encounter:` group (UNN-655, superseding `combat-session:`) is the
 * storage-native encounter root's family in the `encounterReplicaClient`
 * ledger — one family per encounter row; the old prefix's rows TTL out.
 */
export function mintCombatEntityIdentity(entityId: string): ClientIdentity {
  return {
    clientGroupId: `combat-entity:${entityId}`,
    clientId: crypto.randomUUID(),
  }
}

export function mintEncounterIdentity(encounterId: string): ClientIdentity {
  return {
    clientGroupId: `encounter:${encounterId}`,
    clientId: crypto.randomUUID(),
  }
}
