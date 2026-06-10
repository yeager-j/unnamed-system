import { describe, expect, it } from "vitest"

import { parseEncounterPing } from "./encounter-ping"

describe("parseEncounterPing", () => {
  it("extracts version and status from a well-formed ping", () => {
    expect(parseEncounterPing({ version: 7, status: "live" })).toEqual({
      version: 7,
      status: "live",
    })
  })

  it("keeps the fields that survive their type checks", () => {
    expect(parseEncounterPing({ version: 7, status: "imaginary" })).toEqual({
      version: 7,
    })
    expect(
      parseEncounterPing({ version: Number.NaN, status: "ended" })
    ).toEqual({ status: "ended" })
  })

  it("returns null for malformed payloads", () => {
    expect(parseEncounterPing(null)).toBeNull()
    expect(parseEncounterPing("ping")).toBeNull()
    expect(parseEncounterPing({})).toBeNull()
    expect(parseEncounterPing({ version: "7", status: 3 })).toBeNull()
  })
})
