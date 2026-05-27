import { describe, expect, it } from "vitest"

import { getMechanic, initialStateFor, MECHANICS } from "./index"

/**
 * Registry sanity checks. Each MVP mechanic is reachable by key and exposes
 * a starting state. Unknown keys lookup safely returns `undefined` so call
 * sites can no-op without try/catch.
 */
describe("mechanic registry", () => {
  it("registers every MVP mechanic exactly once", () => {
    const kinds = MECHANICS.map((m) => m.kind).sort()
    expect(kinds).toEqual(["path-of-dawn", "perfection", "stains", "valor"])
  })

  it("returns undefined for an unknown mechanic kind", () => {
    expect(getMechanic("not-a-mechanic")).toBeUndefined()
    expect(initialStateFor("not-a-mechanic")).toBeUndefined()
  })

  it("returns the matching definition for a known kind", () => {
    expect(getMechanic("perfection")?.displayName).toBe("Perfection")
    expect(getMechanic("valor")?.displayName).toBe("Valor")
  })

  it("produces a kind-tagged initial state via the registry", () => {
    expect(initialStateFor("perfection")).toMatchObject({ kind: "perfection" })
    expect(initialStateFor("stains")).toMatchObject({ kind: "stains" })
  })
})
