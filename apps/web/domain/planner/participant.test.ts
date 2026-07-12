import { describe, expect, it } from "vitest"

import {
  foldResolvedParticipants,
  type ParticipantHit,
  type ParticipantHitsByKind,
} from "./participant"

function hitsByKind(
  hits: Partial<
    Record<"article" | "npc" | "character", [string, ParticipantHit][]>
  >
): ParticipantHitsByKind {
  return {
    article: new Map(hits.article ?? []),
    npc: new Map(hits.npc ?? []),
    character: new Map(hits.character ?? []),
  }
}

describe("foldResolvedParticipants", () => {
  it("resolves a live hit to its current name", () => {
    const resolved = foldResolvedParticipants(
      [{ kind: "npc", id: "n1", label: "Old Name" }],
      hitsByKind({
        npc: [["n1", { name: "Maren the Hollow", deletedAt: null }]],
      })
    )
    expect(resolved).toEqual([
      {
        ref: { kind: "npc", id: "n1", label: "Old Name" },
        label: "Maren the Hollow",
        tombstoned: false,
        missing: false,
      },
    ])
  })

  it("marks a tombstoned hit while keeping its name (history survives its subjects)", () => {
    const resolved = foldResolvedParticipants(
      [{ kind: "article", id: "a1" }],
      hitsByKind({
        article: [
          ["a1", { name: "Saltmere", deletedAt: new Date("2026-07-01") }],
        ],
      })
    )
    expect(resolved[0]).toMatchObject({
      label: "Saltmere",
      tombstoned: true,
      missing: false,
    })
  })

  it("falls back to the captured label on a lookup miss", () => {
    const resolved = foldResolvedParticipants(
      [{ kind: "character", id: "c1", label: "Bram" }],
      hitsByKind({})
    )
    expect(resolved[0]).toMatchObject({
      label: "Bram",
      tombstoned: false,
      missing: true,
    })
  })

  it("falls back to the kind's generic label on a miss with no captured label", () => {
    const resolved = foldResolvedParticipants(
      [
        { kind: "article", id: "a1" },
        { kind: "npc", id: "n1" },
        { kind: "character", id: "c1" },
      ],
      hitsByKind({})
    )
    expect(resolved.map((r) => r.label)).toEqual([
      "Unknown article",
      "Unknown NPC",
      "Unknown character",
    ])
  })

  it("does not cross kinds: an id hit under another kind stays a miss", () => {
    const resolved = foldResolvedParticipants(
      [{ kind: "npc", id: "shared-id" }],
      hitsByKind({
        article: [["shared-id", { name: "An Article", deletedAt: null }]],
      })
    )
    expect(resolved[0]).toMatchObject({ missing: true, label: "Unknown NPC" })
  })

  it("resolves nothing to nothing", () => {
    expect(foldResolvedParticipants([], hitsByKind({}))).toEqual([])
  })
})
