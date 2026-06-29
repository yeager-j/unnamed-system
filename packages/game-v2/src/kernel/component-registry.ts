import type { Affinities } from "@workspace/game-v2/affinities/affinities.schema"
import type { Archetypes } from "@workspace/game-v2/archetypes/archetypes.schema"
import type { ResolvedArchetypes } from "@workspace/game-v2/archetypes/resolved"
import type { Attributes } from "@workspace/game-v2/attributes/attributes.schema"
import type { ResolvedPendingEffects } from "@workspace/game-v2/combat/resolved"
import type { Equipment } from "@workspace/game-v2/items/equipment.schema"
import type { Identity } from "@workspace/game-v2/kernel/identity.schema"
import type { Presentation } from "@workspace/game-v2/kernel/presentation.schema"
import type {
  AffinityChart,
  AttributeScores,
} from "@workspace/game-v2/kernel/vocab"
import type { Mechanics } from "@workspace/game-v2/mechanics/mechanics.schema"
import type { ResolvedActiveMechanic } from "@workspace/game-v2/mechanics/resolved"
import type { Level } from "@workspace/game-v2/progression/level.schema"
import type { ManualBonuses } from "@workspace/game-v2/progression/manual-bonuses.schema"
import type { Path } from "@workspace/game-v2/progression/path.schema"
import type { Exhaustion } from "@workspace/game-v2/resources/exhaustion.schema"
import type {
  ResolvedExhaustion,
  ResolvedResources,
} from "@workspace/game-v2/resources/resolved"
import type { Resources } from "@workspace/game-v2/resources/resources.schema"
import type { ResolvedSkill } from "@workspace/game-v2/skills/resolved"
import type { Skills } from "@workspace/game-v2/skills/skills.schema"
import type { Talents } from "@workspace/game-v2/talents/talents.schema"
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
  // Cosmetic display metadata — `portraitUrl` today (D7/F4: cosmetic only, no kind).
  // Universal like `identity`; `resolve` passes it through so redaction (visibility/)
  // can keep it public to every viewer while dropping stats to opponents (UNN-519).
  presentation: Presentation
  // Derivation base (PR2 — UNN-500). Each derivable capability folds a base + the
  // layers present on the entity (D37); the inputs are their own components (D35/D36).
  attributes: Attributes
  affinities: Affinities
  vitals: Vitals
  skillPool: SkillPool
  // Direct entity-authored skills/talents (UNN-522). Archetype-derived kit and
  // inheritance stay separate consumer/display concerns.
  skills: Skills
  talents: Talents
  // `Level` is universal across combatants (PCs + enemies — Insta-Kill compares it);
  // `Path` (the HP/SP scaling curve) is PC-only. Split from the old `Progression`.
  level: Level
  path: Path
  manualBonuses: ManualBonuses
  archetypes: Archetypes
  // Depletion consumables + exhaustion (PR3 — UNN-501). `Resources` holds the
  // `used` counts (D26); `Exhaustion` is a separate durable level (D27).
  resources: Resources
  exhaustion: Exhaustion
  // Per-mechanic persisted state (PR4 — UNN-502). A capability any entity may carry
  // (D17/D36); `Archetypes.active` selects which is active at resolve time.
  mechanics: Mechanics
  // Inventory + equipped state (PR5 — UNN-503). The one inventory component (D36
  // folded inheritance onto Archetypes). Contributes to resolve via the effects
  // channel + the basic-attack resolver, NOT a fold output — hence no
  // `ResolvedComponentRegistry` entry below.
  equipment: Equipment
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
  identity: Identity
  // Pass-through (authored == effective), like `identity` — gives `portraitUrl` a
  // resolved surface for the redaction fold (UNN-519) to keep public to all viewers.
  presentation: Presentation
  attributes: AttributeScores
  affinities: AffinityChart
  vitals: ResolvedVitals
  skillPool: ResolvedSkillPool
  skills: ResolvedSkill[]
  talents: Talents
  resources: ResolvedResources
  exhaustion: ResolvedExhaustion
  // The archetype roster + active/origin/savedRanks, projected for the sheet (the
  // Atlas / inheritance / display read off the ResolvedEntity, not the authored one).
  // Emitted only when the entity carries an `Archetypes` component (UNN-504 — PR6).
  archetypes: ResolvedArchetypes
  // Contextual delta effects collected by `resolve` (active mechanic now;
  // equipment/passives later) that have no in-fold consumer — folded by the PR7
  // attack-roll/damage resolvers against an attack context (PR4 — UNN-502).
  pendingEffects: ResolvedPendingEffects
  // The entity's active mechanic(s), surfaced by `resolveEntity` (which already
  // computes them for the form-swap + effects fold) so resolved-view consumers (the
  // end-of-turn Frenzy reminder; PR7 resolvers) read them off the view rather than
  // re-walking the authored `Mechanics` component. Emitted only when ≥1 is active;
  // DM-side only (dropped from every watcher, like `pendingEffects`) — UNN-525.
  activeMechanics: ResolvedActiveMechanic[]
}
