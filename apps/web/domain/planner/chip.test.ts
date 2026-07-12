import { describe, expect, it } from "vitest"

import {
  extractChipRefs,
  parseChipToken,
  sanitizeChipLabel,
  serializeChipToken,
} from "./chip"

describe("sanitizeChipLabel", () => {
  it("strips the grammar-breaking characters", () => {
    expect(sanitizeChipLabel("Maren | the [Hollow]")).toBe("Maren  the Hollow")
  })

  it("trims whitespace", () => {
    expect(sanitizeChipLabel("  Saltmere  ")).toBe("Saltmere")
  })
})

describe("serializeChipToken", () => {
  it("emits the [[kind:id|label]] token", () => {
    expect(serializeChipToken({ kind: "npc", id: "n1", label: "Maren" })).toBe(
      "[[npc:n1|Maren]]"
    )
  })

  it("sanitizes hostile labels at serialize (byte-determinism)", () => {
    expect(
      serializeChipToken({ kind: "npc", id: "n1", label: "a|b[c]d" })
    ).toBe("[[npc:n1|abcd]]")
  })

  it("serializes a missing label as empty", () => {
    expect(serializeChipToken({ kind: "article", id: "a1" })).toBe(
      "[[article:a1|]]"
    )
  })
})

describe("parseChipToken", () => {
  it("round-trips serialize → parse", () => {
    const ref = { kind: "character" as const, id: "c9", label: "Vell" }
    expect(parseChipToken(serializeChipToken(ref))).toEqual(ref)
  })

  it("parses an empty label", () => {
    expect(parseChipToken("[[npc:n1|]]")).toEqual({
      kind: "npc",
      id: "n1",
      label: "",
    })
  })

  it("rejects an unknown kind", () => {
    expect(parseChipToken("[[dungeon:d1|The Vault]]")).toBeNull()
  })

  it("rejects a missing label separator", () => {
    expect(parseChipToken("[[npc:n1]]")).toBeNull()
  })

  it("rejects a blank id", () => {
    expect(parseChipToken("[[npc: |Maren]]")).toBeNull()
  })

  it("rejects nested brackets and stray pipes", () => {
    expect(parseChipToken("[[npc:n1|Ma|ren]]")).toBeNull()
    expect(parseChipToken("[[npc:n1|Ma[ren]]")).toBeNull()
    expect(parseChipToken("[[npc:[n1]|Maren]]")).toBeNull()
  })

  it("rejects surrounding junk (must be the exact token)", () => {
    expect(parseChipToken("x[[npc:n1|Maren]]")).toBeNull()
    expect(parseChipToken("[[npc:n1|Maren]]y")).toBeNull()
  })
})

describe("extractChipRefs", () => {
  it("extracts every distinct (kind, id) pair without labels", () => {
    const body =
      "Cold open. [[npc:n1|The Queen]] finds them in [[article:a1|Saltmere]] " +
      "before [[npc:n2|Castellan]] arrives."
    expect(extractChipRefs(body)).toEqual([
      { kind: "npc", id: "n1" },
      { kind: "article", id: "a1" },
      { kind: "npc", id: "n2" },
    ])
  })

  it("dedups repeated mentions", () => {
    const body = "[[npc:n1|The Queen]] then again [[npc:n1|Her Majesty]]"
    expect(extractChipRefs(body)).toEqual([{ kind: "npc", id: "n1" }])
  })

  it("ignores malformed tokens and unknown kinds", () => {
    const body =
      "a bare [[ opener, [[dungeon:d1|nope]], [[npc:n1]] and [[npc:n2|ok]]"
    expect(extractChipRefs(body)).toEqual([{ kind: "npc", id: "n2" }])
  })

  it("returns empty for chip-free prose", () => {
    expect(extractChipRefs("Just [markdown](https://a.dev) and [[")).toEqual([])
  })
})
