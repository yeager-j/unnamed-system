import { describe, expect, it } from "vitest"

import type {
  CharacterChainRow,
  CharacterKnifeRow,
} from "@/lib/db/load-character"

import {
  buildDocumentGroups,
  DEFAULT_DOCUMENT_REF,
  refsEqual,
  resolveDocumentContent,
  type DocumentRef,
} from "./documents"

const knifeRow = (overrides: Partial<CharacterKnifeRow> = {}) =>
  ({
    id: "k1",
    characterId: "c1",
    title: "Mira",
    description: null,
    order: 0,
    ...overrides,
  }) as CharacterKnifeRow

const chainRow = (overrides: Partial<CharacterChainRow> = {}) =>
  ({
    id: "ch1",
    characterId: "c1",
    title: "The court",
    description: null,
    order: 0,
    ...overrides,
  }) as CharacterChainRow

describe("buildDocumentGroups", () => {
  it("returns the four groups in fixed Movement-3 order", () => {
    const groups = buildDocumentGroups({ knives: [], chains: [] })
    expect(groups.map((g) => g.kind)).toEqual([
      "backstory",
      "knives",
      "chains",
      "identity",
    ])
  })

  it("renders Backstory as a single non-editable entry", () => {
    const [backstory] = buildDocumentGroups({ knives: [], chains: [] })
    expect(backstory).toBeDefined()
    expect(backstory!.canAdd).toBe(false)
    expect(backstory!.canRemove).toBe(false)
    expect(backstory!.entries).toEqual([
      { kind: "backstory", id: "backstory", label: "Backstory" },
    ])
  })

  it("renders Knives entries with each row's title as label", () => {
    const groups = buildDocumentGroups({
      knives: [
        knifeRow({ id: "k1", title: "Mira" }),
        knifeRow({ id: "k2", title: "The cellar" }),
      ],
      chains: [],
    })
    const knives = groups.find((g) => g.kind === "knives")!
    expect(knives.canAdd).toBe(true)
    expect(knives.canRemove).toBe(true)
    expect(knives.entries).toEqual([
      { kind: "knife", id: "k1", label: "Mira" },
      { kind: "knife", id: "k2", label: "The cellar" },
    ])
  })

  it("renders Chains entries the same way Knives are rendered", () => {
    const groups = buildDocumentGroups({
      knives: [],
      chains: [chainRow({ id: "ch1", title: "The court" })],
    })
    const chains = groups.find((g) => g.kind === "chains")!
    expect(chains.canAdd).toBe(true)
    expect(chains.entries).toEqual([
      { kind: "chain", id: "ch1", label: "The court" },
    ])
  })

  it("renders Identity Traits in the canonical five-row order with their labels", () => {
    const groups = buildDocumentGroups({ knives: [], chains: [] })
    const identity = groups.find((g) => g.kind === "identity")!
    expect(identity.canAdd).toBe(false)
    expect(identity.canRemove).toBe(false)
    expect(identity.entries).toEqual([
      { kind: "identity", id: "personality", label: "Personality Traits" },
      { kind: "identity", id: "hope", label: "Hopes" },
      { kind: "identity", id: "dream", label: "Dreams" },
      { kind: "identity", id: "fear", label: "Fears" },
      { kind: "identity", id: "secret", label: "Secrets" },
    ])
  })
})

describe("resolveDocumentContent", () => {
  const source = {
    backstoryText: "Born in the cellar.",
    knives: [knifeRow({ id: "k1", title: "Mira", description: "My sister." })],
    chains: [chainRow({ id: "ch1", title: "Court", description: null })],
    personalityTraits: "Blunt",
    hopes: null,
    dreams: null,
    fears: null,
    secrets: "I can't read.",
  }

  it("resolves Backstory to the column text", () => {
    const ref: DocumentRef = {
      kind: "backstory",
      id: "backstory",
      label: "Backstory",
    }
    expect(resolveDocumentContent(ref, source)).toEqual({
      ref,
      body: "Born in the cellar.",
      title: null,
    })
  })

  it("returns empty body for unset Backstory", () => {
    const ref: DocumentRef = {
      kind: "backstory",
      id: "backstory",
      label: "Backstory",
    }
    expect(
      resolveDocumentContent(ref, { ...source, backstoryText: null })
    ).toEqual({ ref, body: "", title: null })
  })

  it("resolves a Knife to its title + description", () => {
    const ref: DocumentRef = { kind: "knife", id: "k1", label: "Mira" }
    expect(resolveDocumentContent(ref, source)).toEqual({
      ref,
      body: "My sister.",
      title: "Mira",
    })
  })

  it("returns null when the Knife id no longer exists", () => {
    const ref: DocumentRef = { kind: "knife", id: "gone", label: "Gone" }
    expect(resolveDocumentContent(ref, source)).toBeNull()
  })

  it("resolves Identity Traits via the canonical column mapping", () => {
    const personality: DocumentRef = {
      kind: "identity",
      id: "personality",
      label: "Personality Traits",
    }
    expect(resolveDocumentContent(personality, source)).toEqual({
      ref: personality,
      body: "Blunt",
      title: null,
    })

    const secret: DocumentRef = {
      kind: "identity",
      id: "secret",
      label: "Secrets",
    }
    expect(resolveDocumentContent(secret, source)).toEqual({
      ref: secret,
      body: "I can't read.",
      title: null,
    })

    const hope: DocumentRef = { kind: "identity", id: "hope", label: "Hopes" }
    expect(resolveDocumentContent(hope, source)).toEqual({
      ref: hope,
      body: "",
      title: null,
    })
  })
})

describe("refsEqual", () => {
  it("matches refs of the same kind + id", () => {
    expect(
      refsEqual(
        { kind: "knife", id: "k1", label: "A" },
        { kind: "knife", id: "k1", label: "renamed" }
      )
    ).toBe(true)
  })

  it("rejects refs that differ on kind or id", () => {
    expect(
      refsEqual(
        { kind: "knife", id: "k1", label: "A" },
        { kind: "chain", id: "k1", label: "A" }
      )
    ).toBe(false)
    expect(
      refsEqual(
        { kind: "knife", id: "k1", label: "A" },
        { kind: "knife", id: "k2", label: "A" }
      )
    ).toBe(false)
  })

  it("treats DEFAULT_DOCUMENT_REF as Backstory", () => {
    expect(DEFAULT_DOCUMENT_REF.kind).toBe("backstory")
  })
})
