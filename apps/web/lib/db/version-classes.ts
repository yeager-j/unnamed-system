/**
 * The four per-write-class version tokens (UNN-140 / UNN-233) — the single
 * vocabulary for the per-write-class optimistic-concurrency system.
 *
 * The `entity` row (CH4) carries four independent version columns —
 * `identityVersion`, `vitalsVersion`, `inventoryVersion`, `progressionVersion` —
 * and every guarded write bumps exactly one of them. The system is intentionally
 * **per edit surface, not per table**: which surface bumps which class is a
 * deliberate product decision (e.g. currency lives on the Inventory tab, so it
 * rides `inventoryVersion`). The surface→class map now lives on the v2 Writers /
 * entity actions (`lib/entity/commit`, `lib/actions/entity/version-guard`); this
 * module owns only the class vocabulary those layers key off.
 *
 * Pure (a type + one frozen tuple, zero runtime deps), so it is safe to import
 * from both client components and server modules.
 */

/** The four per-write-class version tokens the `entity` row carries — the
 *  runtime tuple, for wire schemas (`z.enum`). */
export const VERSION_CLASSES = [
  "identity",
  "vitals",
  "inventory",
  "progression",
] as const

/** The four per-write-class version tokens (UNN-140). */
export type VersionClass = (typeof VERSION_CLASSES)[number]
