import { describe, expect, it } from "vitest"

import { parsePlayerCharacterStatus } from "./character-lifecycle-ping"

describe("parsePlayerCharacterStatus", () => {
  it("extracts a lifecycle fact from an entity-family ping", () => {
    expect(
      parsePlayerCharacterStatus({
        kind: "entity",
        versions: { identity: 4 },
        status: "finalized",
      })
    ).toBe("finalized")
  })

  it("drops malformed and cross-family lifecycle facts", () => {
    expect(
      parsePlayerCharacterStatus({ kind: "character", status: "finalized" })
    ).toBeNull()
    expect(
      parsePlayerCharacterStatus({ kind: "entity", status: "deleted" })
    ).toBeNull()
    expect(parsePlayerCharacterStatus(null)).toBeNull()
  })
})
