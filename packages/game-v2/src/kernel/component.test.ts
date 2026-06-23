import { describe, expect, it } from "vitest"

import { makeGuard, type EntityG } from "@workspace/game-v2/kernel/component"

/**
 * A throwaway registry local to this test (D16). Exercising the guard against a
 * fixture rather than the real {@link ComponentRegistry} keeps the narrowing
 * proof independent of which components PR1 happens to ship, and lets us assert
 * multi-key narrowing without needing two real components.
 */
type FixtureRegistry = {
  a: { x: number }
  b: { y: string }
  c: { z: boolean }
}

const guard = makeGuard<FixtureRegistry>()

const withA: EntityG<FixtureRegistry> = { id: "1", components: { a: { x: 7 } } }
const withAB: EntityG<FixtureRegistry> = {
  id: "2",
  components: { a: { x: 7 }, b: { y: "hi" } },
}

describe("makeGuard", () => {
  it("narrows on a single key and unlocks the component", () => {
    if (guard("a")(withA)) {
      // Inside the guard, `a` is required — this access type-checks (the proof
      // that the predicate narrows; a plain `=> boolean` wrapper would not, D16).
      expect(withA.components.a.x).toBe(7)
    } else {
      throw new Error("expected withA to pass guard('a')")
    }
  })

  it("returns false when the single key is absent", () => {
    expect(guard("b")(withA)).toBe(false)
  })

  it("narrows once on multiple keys", () => {
    if (guard("a", "b")(withAB)) {
      // Both components are required inside a single multi-key narrowing.
      expect(withAB.components.a.x).toBe(7)
      expect(withAB.components.b.y).toBe("hi")
    } else {
      throw new Error("expected withAB to pass guard('a','b')")
    }
  })

  it("returns false when any one of the multiple keys is absent", () => {
    expect(guard("a", "b")(withA)).toBe(false)
    expect(guard("a", "c")(withAB)).toBe(false)
  })

  it("is empty-key vacuously true (narrows to no keys)", () => {
    expect(guard()(withA)).toBe(true)
  })
})

describe("guard narrowing (type-level, validated by tsc)", () => {
  it("leaves a component possibly-undefined until guarded", () => {
    // A compile-time proof: before narrowing, `a` is possibly undefined, so
    // reaching into it is a type error. Kept in a never-invoked function so tsc
    // validates the `@ts-expect-error` without the unsafe access running.
    function _proof(e: EntityG<FixtureRegistry>) {
      // @ts-expect-error — `a` may be undefined before the guard narrows it.
      return e.components.a.x
    }
    expect(typeof _proof).toBe("function")
  })
})
