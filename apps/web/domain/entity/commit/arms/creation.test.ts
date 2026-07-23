import { describe, expect, it } from "vitest"

import {
  creationArchetypesWriter,
  narrativeWriter,
  pathWriter,
  talentsWriter,
  virtuesWriter,
} from "./creation"

describe("pathWriter", () => {
  it("creates the path component from a draft", () => {
    expect(
      pathWriter.applyOp(
        {},
        { component: "path", op: "setChoice", choice: "balanced" }
      )
    ).toEqual({ ok: true, value: { path: { choice: "balanced" } } })
  })
})

describe("archetypesWriter", () => {
  it("keeps archetype writes in the progression class", () => {
    expect(creationArchetypesWriter.durableClass).toBe("progression")
  })
})

describe("talentsWriter", () => {
  it("keeps talent add idempotent", () => {
    expect(
      talentsWriter.applyOp(
        { talents: [{ key: "chef" }] },
        { component: "talents", op: "add", key: "chef" }
      )
    ).toEqual({ ok: true, value: { talents: [{ key: "chef" }] } })
  })
})

describe("virtuesWriter", () => {
  it("keeps virtues in the progression class", () => {
    expect(virtuesWriter.durableClass).toBe("progression")
  })
})

describe("narrativeWriter", () => {
  it("canonicalizes an empty text field to null", () => {
    expect(
      narrativeWriter.applyOp(
        {},
        { component: "narrative", op: "setField", field: "hopes", value: "" }
      )
    ).toEqual({
      ok: true,
      value: { narrative: expect.objectContaining({ hopes: null }) },
    })
  })
})
