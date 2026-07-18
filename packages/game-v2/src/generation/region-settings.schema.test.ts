import { describe, expect, it } from "vitest"

import { regionSettingsSchema } from "./region-settings.schema"

describe("regionSettingsSchema", () => {
  it("parses an empty designation (no wandering default)", () => {
    expect(regionSettingsSchema.parse({})).toEqual({})
  })

  it("parses a designated table + cadence", () => {
    expect(
      regionSettingsSchema.parse({
        wanderingTableKey: "wandering",
        wanderingIntervalTurns: 3,
      })
    ).toEqual({ wanderingTableKey: "wandering", wanderingIntervalTurns: 3 })
  })

  // The boundary decides what "designated" means: a present key is non-empty,
  // so no consumer (the mint's `enabled: key !== undefined` stamp, the
  // table-exists check) ever re-decides an empty string. A crafted payload
  // sending `""` must fail the parse, not mint an expedition with wandering
  // enabled and no table to roll from.
  it("rejects an empty-string table key", () => {
    expect(
      regionSettingsSchema.safeParse({ wanderingTableKey: "" }).success
    ).toBe(false)
  })

  it("rejects an off-enum cadence", () => {
    expect(
      regionSettingsSchema.safeParse({ wanderingIntervalTurns: 4 }).success
    ).toBe(false)
  })
})
