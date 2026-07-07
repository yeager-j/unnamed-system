import type { RefObject } from "react"
import { describe, expect, it } from "vitest"

import type { VersionClass } from "@/lib/db/version-classes"

import {
  forwardPingedVersions,
  parseCharacterPing,
} from "./character-version-sync"

describe("parseCharacterPing", () => {
  it("extracts the versions map from a well-formed ping of the expected kind", () => {
    expect(
      parseCharacterPing({ kind: "entity", versions: { vitals: 6 } }, "entity")
    ).toEqual({ vitals: 6 })
    expect(
      parseCharacterPing(
        { kind: "character", versions: { vitals: 6 } },
        "character"
      )
    ).toEqual({ vitals: 6 })
  })

  it("drops a ping from the other row family — its counters are not ours", () => {
    expect(
      parseCharacterPing(
        { kind: "character", versions: { progression: 40 } },
        "entity"
      )
    ).toBeNull()
    expect(
      parseCharacterPing(
        { kind: "entity", versions: { vitals: 6 } },
        "character"
      )
    ).toBeNull()
  })

  it("drops an untagged legacy ping for family-filtered consumers (ambiguous)", () => {
    expect(parseCharacterPing({ versions: { vitals: 6 } }, "entity")).toBeNull()
  })

  it('accepts any family (and untagged) for kind "any" — refresh-only consumers', () => {
    expect(
      parseCharacterPing({ kind: "character", versions: { vitals: 6 } }, "any")
    ).toEqual({ vitals: 6 })
    expect(
      parseCharacterPing({ kind: "entity", versions: { vitals: 6 } }, "any")
    ).toEqual({ vitals: 6 })
    expect(parseCharacterPing({ versions: { vitals: 6 } }, "any")).toEqual({
      vitals: 6,
    })
  })

  it("returns null for malformed payloads", () => {
    expect(parseCharacterPing(null, "any")).toBeNull()
    expect(parseCharacterPing("ping", "any")).toBeNull()
    expect(parseCharacterPing({}, "any")).toBeNull()
    expect(parseCharacterPing({ versions: "vitals" }, "any")).toBeNull()
  })
})

describe("forwardPingedVersions", () => {
  function refs(): Record<VersionClass, RefObject<number>> {
    return {
      identity: { current: 3 },
      vitals: { current: 5 },
      inventory: { current: 1 },
      progression: { current: 2 },
    }
  }

  it("bumps a strictly fresher class and reports it", () => {
    const tokens = refs()
    expect(forwardPingedVersions(tokens, { vitals: 6 })).toBe(true)
    expect(tokens.vitals.current).toBe(6)
  })

  it("treats an equal or lower version as an echo — no bump, no refresh", () => {
    const tokens = refs()
    expect(forwardPingedVersions(tokens, { vitals: 5 })).toBe(false)
    expect(forwardPingedVersions(tokens, { vitals: 4 })).toBe(false)
    expect(tokens.vitals.current).toBe(5)
  })

  it("reports fresher when any one class of a multi-class ping advances", () => {
    const tokens = refs()
    expect(forwardPingedVersions(tokens, { vitals: 5, identity: 4 })).toBe(true)
    expect(tokens.identity.current).toBe(4)
    expect(tokens.vitals.current).toBe(5)
  })

  it("ignores foreign keys and non-finite values", () => {
    const tokens = refs()
    const junk = {
      bogus: 99,
      vitals: Number.NaN,
      identity: Number.POSITIVE_INFINITY,
      inventory: "7",
    } as unknown as Partial<Record<VersionClass, number>>
    expect(forwardPingedVersions(tokens, junk)).toBe(false)
    expect(tokens).toEqual(refs())
  })
})
