/**
 * The **composite snapshot version** (UNN-530; combat ADR §2.6/CD12) — one fold
 * over every version token a v2 encounter snapshot reads through:
 * `encounter.version` (the session blob), `mapInstance.version` (spatial state),
 * and each durable participant's character `vitalsVersion` (the entity-version
 * dimension the v2 loader surfaces as `durableVersions`). Any constituent bump
 * changes the fold, so the client's stale-retry is a single equality compare —
 * it never learns which dimension moved, only that the snapshot it holds is old.
 *
 * Neutral (client + server): the server folds it into the snapshot result; the
 * client only compares the opaque string.
 */

export interface SnapshotVersionInputs {
  encounterVersion: number
  instanceVersion: number
  /** Each durable participant's character `vitalsVersion`, keyed by entity id. */
  durableVersions: ReadonlyMap<string, number>
}

/**
 * **Injective for arbitrary entity ids** (UNN-602, "total encoding"): the fold
 * is the JSON of the canonical tuple `[encounter, instance, sortedDurables]`,
 * so JSON string escaping — not any assumption about the id alphabet — keeps
 * distinct states distinct. (The previous delimiter-joined shape was injective
 * only because nanoid/UUID ids happen to exclude `,`/`:`/`.`.)
 *
 * Deterministic: durable entries are sorted by entity id — by code unit, not
 * `localeCompare`, whose collation can tie distinct ids and leak Map insertion
 * order into the fold — so two loads of the same state fold identically. Both
 * laws are quantified in `__laws__/snapshot-version.laws.test.ts`. The string
 * is **opaque to consumers** — compare for equality, never parse.
 */
export function foldSnapshotVersion(inputs: SnapshotVersionInputs): string {
  const durable = [...inputs.durableVersions.entries()].sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0
  )

  return JSON.stringify([
    inputs.encounterVersion,
    inputs.instanceVersion,
    durable,
  ])
}
