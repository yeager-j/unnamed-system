import { describe, expect, it } from "vitest"

import { parseVersionPing } from "./version-ping"

describe("parseVersionPing", () => {
  it("extracts kind, version, and status from a well-formed tagged ping", () => {
    expect(
      parseVersionPing(
        { kind: "encounter", version: 7, status: "live" },
        "encounter"
      )
    ).toEqual({ kind: "encounter", version: 7, status: "live" })
  })

  it("reads a mapInstance ping (no status)", () => {
    expect(
      parseVersionPing({ kind: "mapInstance", version: 12 }, "encounter")
    ).toEqual({ kind: "mapInstance", version: 12 })
  })

  it("accepts dungeon-layer status strings", () => {
    expect(
      parseVersionPing(
        { kind: "dungeon", version: 3, status: "active" },
        "dungeon"
      )
    ).toEqual({ kind: "dungeon", version: 3, status: "active" })
  })

  it("falls back to the channel's temporal kind for a legacy untagged ping", () => {
    expect(
      parseVersionPing({ version: 5, status: "live" }, "encounter")
    ).toEqual({
      kind: "encounter",
      version: 5,
      status: "live",
    })
    expect(parseVersionPing({ version: 5 }, "dungeon")).toEqual({
      kind: "dungeon",
      version: 5,
    })
  })

  it("falls back for an invalid kind, and drops an invalid status", () => {
    expect(
      parseVersionPing(
        { kind: "bogus", version: 5, status: "imaginary" },
        "encounter"
      )
    ).toEqual({ kind: "encounter", version: 5 })
  })

  it("returns null when version is missing or not a finite number", () => {
    expect(
      parseVersionPing({ kind: "encounter", status: "live" }, "encounter")
    ).toBeNull()
    expect(
      parseVersionPing({ kind: "encounter", version: Number.NaN }, "encounter")
    ).toBeNull()
    expect(parseVersionPing({ version: "7" }, "encounter")).toBeNull()
  })

  it("returns null for non-object payloads", () => {
    expect(parseVersionPing(null, "encounter")).toBeNull()
    expect(parseVersionPing("ping", "encounter")).toBeNull()
    expect(parseVersionPing({}, "encounter")).toBeNull()
  })
})
