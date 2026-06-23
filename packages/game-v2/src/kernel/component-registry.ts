import type { Archetypes } from "@workspace/game-v2/archetypes/archetypes.schema"
import type { Identity } from "@workspace/game-v2/kernel/identity.schema"
import type {
  AffinityChart,
  AttributeScores,
} from "@workspace/game-v2/kernel/vocab"
import type { Affinities } from "@workspace/game-v2/progression/affinities.schema"
import type { Attributes } from "@workspace/game-v2/progression/attributes.schema"
import type { ManualBonuses } from "@workspace/game-v2/progression/manual-bonuses.schema"
import type { Progression } from "@workspace/game-v2/progression/progression.schema"
import type { ResolvedResources } from "@workspace/game-v2/progression/resolved"
import type {
  ResolvedSkillPool,
  ResolvedVitals,
} from "@workspace/game-v2/vitals/resolved"
import type { SkillPool } from "@workspace/game-v2/vitals/skill-pool.schema"
import type { Vitals } from "@workspace/game-v2/vitals/vitals.schema"

/**
 * The **single source of truth** for the component vocabulary (D16). `Entity`,
 * the capability views (`Has<K>`), and the runtime `guard` all derive from this
 * registry, so adding a capability is one key here and everything follows.
 *
 * ## How the registry grows (the one rule for every domain PR)
 *
 * This interface is the **authoritative grow-point**. Each domain PR adds its
 * component by editing this file: one `type`-only import of the domain's schema
 * type, and one line in the interface. Example, when `vitals` lands:
 *
 * ```ts
 * import type { Vitals } from "@workspace/game-v2/vitals/vitals.schema"
 * export interface ComponentRegistry {
 *   identity: Identity
 *   vitals: Vitals   // ← added by the vitals PR
 * }
 * ```
 *
 * This file, `ports.ts`, and `load-seam.ts` are the **only** kernel files allowed
 * to name a domain shape — the three "knows every component" grow-points (the
 * authored type map here, the catalog lookups in ports, the total Zod schema map
 * in load-seam). They name domain types to declare the registry/port, exactly as
 * v1's `engine/ports.ts` type-imports foundation types. The type-only import is
 * erased, so kernel keeps zero runtime dependency on a domain. The alternative
 * (TS `declare module` augmentation from each domain) was rejected: it hides the
 * registry's true shape, still needs the same type-import to name the component,
 * and risks tree-shaking dropping an augmentation under `sideEffects: false`.
 *
 * PR1 seeds the registry with the universal {@link Identity} component.
 */
export interface ComponentRegistry {
  identity: Identity
  // Derivation base (PR2 — UNN-500). Each derivable capability carries its own
  // `source` (D34); the inputs are their own components (D35/D36).
  attributes: Attributes
  affinities: Affinities
  vitals: Vitals
  skillPool: SkillPool
  progression: Progression
  manualBonuses: ManualBonuses
  archetypes: Archetypes
}

/**
 * The **resolved** read-units `resolve(entity)` emits (D30) — distinct from, and
 * overlapping with, the authored {@link ComponentRegistry}. It holds only
 * *derived* values (effective `attributes`, `vitals {currentHP, maxHP}`,
 * resolved `skills`, …), never authored fields like `damage`, so no authored
 * field smears into a resolved type (F3).
 *
 * Grows the same way the authored registry does — one line per domain that
 * contributes a resolved read-unit. PR2 (UNN-500) adds the derivation base;
 * `resolve` emits only the read-units an entity's capabilities produce.
 */
export interface ResolvedComponentRegistry {
  attributes: AttributeScores
  affinities: AffinityChart
  vitals: ResolvedVitals
  skillPool: ResolvedSkillPool
  resources: ResolvedResources
}
