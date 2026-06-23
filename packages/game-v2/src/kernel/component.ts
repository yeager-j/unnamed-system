/**
 * The generic component-entity core (D1, D16). This module is the **dependency
 * sink's sink**: it imports nothing, not even the component registry. Every shape
 * here is parameterized over a registry type `R`, so the same machinery serves
 * both the authored {@link import("./component-registry").ComponentRegistry} and
 * the derived {@link import("./component-registry").ResolvedComponentRegistry}
 * once `entity.ts` binds them.
 *
 * Keeping the core registry-agnostic is what lets `kernel/` own `Entity`/`Has`/
 * `guard` while never importing a domain folder (which defines the component
 * shapes): the registry is grown by editing one kernel file, and this generic
 * core is reused, not re-specialized, per registry.
 */

/**
 * An entity is an id plus a bag of named components. Storage is
 * `Partial<R>` — any capability may be absent (D3) — and presence is the runtime
 * discriminator the {@link guard} narrows on.
 */
export type EntityG<R> = { id: string; components: Partial<R> }

/**
 * An entity statically known to carry the components keyed by `K`: those keys
 * become **required** (and so non-optional to read) while the rest stay partial.
 * The structural intersection a system writes its signature against (D16).
 */
export type HasG<R, K extends keyof R> = EntityG<R> & {
  components: Pick<R, K>
}

/**
 * Builds a capability {@link guard} bound to a registry `R`. The returned guard
 * is **multi-key and predicate-preserving** (D16): it takes a tuple of component
 * keys and narrows an `EntityG<R>` to `HasG<R, K>` in one step.
 *
 * Two things this factory gets right that a hand-written guard does not (D16):
 *  1. **The predicate survives.** A plain wrapper `(e) => keys.every(...)` infers
 *     `=> boolean`; TS does not re-derive a type predicate from a body. Because
 *     the factory's return *type* is `(e) => e is HasG<R, K>`, every guard it
 *     mints carries its predicate, so call sites actually narrow.
 *  2. **One narrowing for many keys.** `makeGuard<R>()("a", "b")` narrows to
 *     `HasG<R, "a" | "b">` directly, instead of chaining single-key `&&`s.
 *
 * TS does not verify a predicate body, so the `every(...)` check is trusted — but
 * it and `HasG<R, K>` derive from the same `K`, concentrating that trust in one
 * line. Presence is all the guard checks; **shape is validated once at the load
 * seam** (Zod per component), so presence-guarding downstream is sound (F6).
 */
export function makeGuard<R>() {
  return <K extends keyof R>(...keys: K[]) =>
    (e: EntityG<R>): e is HasG<R, K> =>
      keys.every((key) => e.components[key] !== undefined)
}
