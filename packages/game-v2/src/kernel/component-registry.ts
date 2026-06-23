import type { Identity } from "@workspace/game-v2/kernel/identity.schema"

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
 * This file (and `ports.ts`) are the **only** kernel files allowed to import a
 * domain shape — they name domain types to declare the registry/port, exactly as
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
}

/**
 * The **resolved** read-units `resolve(entity)` emits (D30) — distinct from, and
 * overlapping with, the authored {@link ComponentRegistry}. It holds only
 * *derived* values (effective `attributes`, `vitals {currentHP, maxHP}`,
 * resolved `skills`, …), never authored fields like `damage`, so no authored
 * field smears into a resolved type (F3).
 *
 * Empty in PR1: the resolve-fold runner and its read-units land with the
 * derivation base (PR2, UNN-500). It grows the same way the authored registry
 * does — one line per domain that contributes a resolved read-unit. Declaring it
 * now lets `entity.ts` bind a `ResolvedEntity` + resolved guard off the same
 * generic core today.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ResolvedComponentRegistry {}
