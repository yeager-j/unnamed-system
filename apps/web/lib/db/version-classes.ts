/**
 * The single source of truth for the per-write-class optimistic-concurrency
 * system (UNN-140 / UNN-233).
 *
 * `characters` carries four independent version tokens — `identityVersion`,
 * `vitalsVersion`, `inventoryVersion`, `progressionVersion` — and every owner
 * write is gated on exactly one of them. The system is intentionally **per edit
 * surface, not per table**: which surface bumps which class is a deliberate
 * product decision (e.g. currency lives on the Inventory tab, so it rides
 * `inventoryVersion` despite being a `characters` column).
 *
 * Both layers read {@link EDIT_SURFACE_CLASS}: the client passes a `surface`
 * to `useCharacterWrite` / `useDebouncedAutoSave` and the hook resolves the
 * class from here; each server write wrapper passes `EDIT_SURFACE_CLASS.<surface>`
 * to `bumpCharacterVersionGuarded`. The two encodings are therefore the same
 * value and cannot silently disagree — the failure mode this module exists to
 * remove.
 *
 * Pure (types + one frozen literal, zero runtime deps), so it is safe to import
 * from both client components and server modules — the same way
 * `@/lib/db/schema/character` row types are.
 */

/** The four per-write-class version tokens `characters` (and the `entity` row,
 *  CH4) carry — the runtime tuple, for wire schemas (`z.enum`). */
export const VERSION_CLASSES = [
  "identity",
  "vitals",
  "inventory",
  "progression",
] as const

/** The four per-write-class version tokens (UNN-140). */
export type VersionClass = (typeof VERSION_CLASSES)[number]

/**
 * Identity-class surfaces: creation-time and stable-identity edits that share
 * `identityVersion`. Includes the builder's Virtue *allocation* (rulebook 1.2),
 * which is distinct from the sheet's progression-class Virtue rank-up.
 */
export type IdentitySurface =
  | "name"
  | "pronouns"
  | "portrait"
  | "narrative"
  | "identityTraits"
  | "path"
  | "originArchetype"
  | "activeArchetype"
  | "inheritanceSlots"
  | "builderStep"
  | "knives"
  | "chains"
  | "talents"
  | "virtuesAllocation"
  | "finalize"

/** Vitals-class surfaces: the in-play state on the Combat tab (HP/SP, Battle
 *  Conditions, Ailments, Exhaustion, Prisma, Rest, Archetype mechanics). */
export type VitalsSurface =
  | "pools"
  | "cast"
  | "ailments"
  | "battleConditions"
  | "exhaustion"
  | "prisma"
  | "clearCombatState"
  | "rest"
  | "mechanic"

/** Inventory-class surfaces: the Inventory tab — item rows and the wallet. */
export type InventorySurface = "inventoryItems" | "currency"

/**
 * Progression-class surfaces: Victories, Spark, sheet-side Virtue rank-up, and
 * spending Saved Archetype Ranks in the Lineage Atlas (unlock / rank up). Atlas
 * writes also mutate `characterArchetype` rows, but they ride
 * `progressionVersion` because the contended field is `savedArchetypeRanks` —
 * the progression currency leveling grants — so spend serializes against grant.
 * Same per-surface-not-per-table call as `currency` riding `inventoryVersion`.
 */
export type ProgressionSurface =
  | "victories"
  | "virtueRankUp"
  | "spark"
  | "spendArchetypeRank"

/** Every owner-mode edit surface, grouped by the class it writes. */
export type EditSurface =
  | IdentitySurface
  | VitalsSurface
  | InventorySurface
  | ProgressionSurface

/**
 * Maps each edit surface to the version class it bumps. The grouped-intersection
 * `satisfies` makes this both **exhaustive** (a new surface won't compile without
 * an entry here) and **class-correct** (each surface must map to *its own*
 * group's class — `currency: "vitals"` is a type error), so the assignment is
 * made once and cannot be mis-typed.
 *
 * Level-up is the codebase's one **cross-class** write (it bumps `progression`
 * *and* `vitals` together and carries an `expectedVersions: { progression,
 * vitals }` pair instead of a single token), so it is not a single-class surface
 * and lives outside this map — see `lib/db/writes/leveling.ts`.
 */
export const EDIT_SURFACE_CLASS = {
  // — identity —
  name: "identity",
  pronouns: "identity",
  portrait: "identity",
  narrative: "identity",
  identityTraits: "identity",
  path: "identity",
  originArchetype: "identity",
  activeArchetype: "identity",
  inheritanceSlots: "identity",
  builderStep: "identity",
  knives: "identity",
  chains: "identity",
  talents: "identity",
  /**
   * Builder Virtue *allocation* (rulebook 1.2) is creation-time identity state —
   * distinct from `virtueRankUp` below, which is the progression-class sheet
   * control. Same domain, different surfaces, different classes.
   */
  virtuesAllocation: "identity",
  finalize: "identity",
  // — vitals —
  pools: "vitals",
  cast: "vitals",
  ailments: "vitals",
  battleConditions: "vitals",
  exhaustion: "vitals",
  prisma: "vitals",
  clearCombatState: "vitals",
  rest: "vitals",
  mechanic: "vitals",
  // — inventory —
  inventoryItems: "inventory",
  /**
   * The wallet renders on the Inventory tab, so currency rides `inventoryVersion`
   * for optimistic-frame coherence with the item mutations — even though it is a
   * `characters` column, not an `inventoryItem` row (UNN-223). This is the
   * canonical example of the per-surface-not-per-table rule.
   */
  currency: "inventory",
  // — progression —
  victories: "progression",
  /** Sheet-side Virtue rank-up — progression-class, unlike the builder's
   *  identity-class `virtuesAllocation` above. */
  virtueRankUp: "progression",
  spark: "progression",
  /** Lineage Atlas unlock + rank-up. Spends `savedArchetypeRanks`, so it rides
   *  the same class leveling's grant does. */
  spendArchetypeRank: "progression",
} as const satisfies Record<IdentitySurface, "identity"> &
  Record<VitalsSurface, "vitals"> &
  Record<InventorySurface, "inventory"> &
  Record<ProgressionSurface, "progression">
