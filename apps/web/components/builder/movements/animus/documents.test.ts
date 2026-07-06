import { describe, expect, it } from "vitest"

import { emptyNarrative, type Narrative } from "@workspace/game-v2/narrative"

import {
  buildDocumentGroups,
  DEFAULT_DOCUMENT_REF,
  refsEqual,
  resolveDocumentContent,
  type DocumentRef,
} from "./documents"

function narrative(overrides: Partial<Narrative> = {}): Narrative {
  return { ...emptyNarrative(), ...overrides }
}

describe("buildDocumentGroups", () => {
  it("returns the four groups in fixed Movement-3 order", () => {
    const groups = buildDocumentGroups(narrative())
    expect(groups.map((g) => g.kind)).toEqual([
      "backstory",
      "knives",
      "chains",
      "identity",
    ])
  })

  it("renders Backstory as a single non-editable entry", () => {
    const [backstory] = buildDocumentGroups(narrative())
    expect(backstory).toBeDefined()
    expect(backstory!.canAdd).toBe(false)
    expect(backstory!.canRemove).toBe(false)
    expect(backstory!.entries).toEqual([
      { kind: "backstory", id: "backstory", label: "Backstory" },
    ])
  })

  it("renders Knives entries index-addressed with each beat's title as label", () => {
    const groups = buildDocumentGroups(
      narrative({
        knives: [
          { title: "Mira", description: null },
          { title: "", description: "unnamed" },
        ],
      })
    )
    const knives = groups.find((g) => g.kind === "knives")!
    expect(knives.canAdd).toBe(true)
    expect(knives.canRemove).toBe(true)
    expect(knives.entries).toEqual([
      { kind: "knife", id: "0", label: "Mira" },
      { kind: "knife", id: "1", label: "" },
    ])
  })

  it("tolerates an absent narrative component (fresh pre-mint frame)", () => {
    const groups = buildDocumentGroups(undefined)
    expect(groups.find((g) => g.kind === "knives")!.entries).toEqual([])
    expect(groups.find((g) => g.kind === "chains")!.entries).toEqual([])
  })

  it("renders the five Identity Trait rows with canonical labels", () => {
    const identity = buildDocumentGroups(narrative()).find(
      (g) => g.kind === "identity"
    )!
    expect(identity.entries.map((e) => e.id)).toEqual([
      "personality",
      "hopes",
      "dreams",
      "fears",
      "secrets",
    ])
  })
})

describe("resolveDocumentContent", () => {
  const source = narrative({
    backstory: "Forged in the pit.",
    hopes: "- Free my sister",
    knives: [{ title: "Mira", description: "my sister" }],
    chains: [{ title: "The court", description: null }],
  })

  it("resolves Backstory from the narrative field", () => {
    expect(resolveDocumentContent(DEFAULT_DOCUMENT_REF, source)).toEqual({
      ref: DEFAULT_DOCUMENT_REF,
      body: "Forged in the pit.",
      title: null,
    })
  })

  it("resolves a Knife by index with its editable title", () => {
    const ref: DocumentRef = { kind: "knife", id: "0", label: "Mira" }
    expect(resolveDocumentContent(ref, source)).toEqual({
      ref,
      body: "my sister",
      title: "Mira",
    })
  })

  it("resolves a Chain's null description to an empty body", () => {
    const ref: DocumentRef = { kind: "chain", id: "0", label: "The court" }
    expect(resolveDocumentContent(ref, source)).toEqual({
      ref,
      body: "",
      title: "The court",
    })
  })

  it("returns null for an index no longer in the list (just removed)", () => {
    const ref: DocumentRef = { kind: "knife", id: "3", label: "gone" }
    expect(resolveDocumentContent(ref, source)).toBeNull()
  })

  it("resolves an Identity Trait from its narrative field", () => {
    const ref: DocumentRef = { kind: "identity", id: "hopes", label: "Hopes" }
    expect(resolveDocumentContent(ref, source)).toEqual({
      ref,
      body: "- Free my sister",
      title: null,
    })
  })
})

describe("refsEqual", () => {
  it("compares kind + id", () => {
    expect(
      refsEqual(
        { kind: "knife", id: "0", label: "A" },
        { kind: "knife", id: "0", label: "B" }
      )
    ).toBe(true)
    expect(
      refsEqual(
        { kind: "knife", id: "0", label: "A" },
        { kind: "chain", id: "0", label: "A" }
      )
    ).toBe(false)
  })
})
