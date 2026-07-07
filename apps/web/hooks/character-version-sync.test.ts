import type { RefObject } from "react"
import { describe, expect, it } from "vitest"

import type { VersionClass } from "@/lib/db/version-classes"

import {
  forwardPingedVersions,
  parseCharacterPing,
} from "./character-version-sync"

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
