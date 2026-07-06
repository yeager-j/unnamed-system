import { describe, expect, it } from "vitest"

import {
  emptyNarrative,
  NARRATIVE_TEXT_FIELDS,
  narrativeSchema,
} from "@workspace/game-v2/narrative/narrative.schema"

describe("emptyNarrative", () => {
  it("parses under the schema (text fields are nullable but not optional)", () => {
    expect(narrativeSchema.parse(emptyNarrative())).toEqual(emptyNarrative())
  })

  it("a bare {} does NOT parse — creation must mint from emptyNarrative", () => {
    expect(narrativeSchema.safeParse({}).success).toBe(false)
  })

  it("NARRATIVE_TEXT_FIELDS covers exactly the schema's text keys", () => {
    const schemaKeys = Object.keys(narrativeSchema.shape).filter(
      (key) => key !== "knives" && key !== "chains"
    )
    expect([...NARRATIVE_TEXT_FIELDS].sort()).toEqual(schemaKeys.sort())
  })
})
