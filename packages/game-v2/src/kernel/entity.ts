import {
  makeGuard,
  type EntityG,
  type HasG,
} from "@workspace/game-v2/kernel/component"
import type {
  ComponentRegistry,
  ResolvedComponentRegistry,
} from "@workspace/game-v2/kernel/component-registry"

/**
 * The app-facing entity types and guards, produced by binding the generic core
 * ({@link makeGuard}, {@link EntityG}, {@link HasG}) to the two concrete
 * registries. This is the seam the generic core exists for: the registries grow
 * (one line per domain PR), this binding never changes.
 */

/** An authored/stored entity — a bag of {@link ComponentRegistry} components. */
export type Entity = EntityG<ComponentRegistry>

/** An entity statically known to carry the authored components keyed by `K`. */
export type Has<K extends keyof ComponentRegistry> = HasG<ComponentRegistry, K>

/**
 * The capability {@link makeGuard guard} over authored components (D16):
 * `guard("identity", "vitals")` narrows an {@link Entity} to
 * `Has<"identity" | "vitals">` in one step, carrying its type predicate.
 */
export const guard = makeGuard<ComponentRegistry>()

/** A resolved entity — the derived read-units `resolve` emits (D30). */
export type ResolvedEntity = EntityG<ResolvedComponentRegistry>

/** A resolved entity statically known to carry the read-units keyed by `K`. */
export type ResolvedHas<K extends keyof ResolvedComponentRegistry> = HasG<
  ResolvedComponentRegistry,
  K
>

/** The capability guard over resolved read-units, mirroring {@link guard}. */
export const resolvedGuard = makeGuard<ResolvedComponentRegistry>()
