import { describe, expect, it } from "vitest"

import { parseCharacterPing } from "./character-version-sync"

describe("parseCharacterPing", () => {
  it("extracts the versions map from a well-formed ping", () => {
    expect(parseCharacterPing({ versions: { vitals: 6 } })).toEqual({
      vitals: 6,
    })
  })

  it("returns null for malformed payloads", () => {
    expect(parseCharacterPing(null)).toBeNull()
    expect(parseCharacterPing("ping")).toBeNull()
    expect(parseCharacterPing({})).toBeNull()
    expect(parseCharacterPing({ versions: "vitals" })).toBeNull()
  })
})
