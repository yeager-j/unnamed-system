import { describe, expect, it } from "vitest"

import type { ParticipantHitsByKind, ParticipantRef } from "../participant"
import {
  buildEntityTimelineView,
  refCountLine,
  type EntityTimelineUpdateInput,
} from "./world-detail"

const SELF: ParticipantRef = { kind: "npc", id: "npc-1" }

const HITS: ParticipantHitsByKind = {
  npc: new Map([["npc-2", { name: "Maren", deletedAt: null }]]),
  article: new Map([
    ["art-1", { name: "The Old Keep", deletedAt: new Date() }],
  ]),
  character: new Map(),
}

function update(
  id: string,
  day: number,
  overrides: Partial<EntityTimelineUpdateInput> = {}
): EntityTimelineUpdateInput {
  return {
    id,
    day,
    body: `Update ${id}`,
    category: null,
    primary: SELF,
    concerns: [],
    ...overrides,
  }
}

describe("buildEntityTimelineView", () => {
  it("groups consecutive same-day entries under one day heading", () => {
    const days = buildEntityTimelineView(
      [update("u1", 3), update("u2", 3), update("u3", 5)],
      SELF,
      HITS
    )
    expect(days.map((d) => d.day)).toEqual([3, 5])
    expect(days[0]!.entries.map((e) => e.id)).toEqual(["u1", "u2"])
  })

  it("marks primary vs concerned and elides the page's own entity", () => {
    const days = buildEntityTimelineView(
      [
        update("u1", 1, { concerns: [{ kind: "npc", id: "npc-2" }] }),
        update("u2", 1, {
          primary: { kind: "npc", id: "npc-2" },
          concerns: [SELF],
        }),
      ],
      SELF,
      HITS
    )
    const [first, second] = days[0]!.entries
    expect(first!.isPrimary).toBe(true)
    expect(first!.others.map((o) => o.label)).toEqual(["Maren"])
    expect(second!.isPrimary).toBe(false)
    expect(second!.others.map((o) => o.label)).toEqual(["Maren"])
  })

  it("keeps world updates (null primary) and resolves tombstones muted", () => {
    const days = buildEntityTimelineView(
      [
        update("u1", 2, {
          primary: null,
          concerns: [SELF, { kind: "article", id: "art-1" }],
        }),
      ],
      SELF,
      HITS
    )
    const entry = days[0]!.entries[0]!
    expect(entry.isPrimary).toBe(false)
    expect(entry.others).toEqual([
      expect.objectContaining({ label: "The Old Keep", tombstoned: true }),
    ])
  })
})

describe("refCountLine", () => {
  it("says nowhere-yet when clean", () => {
    expect(refCountLine({ relations: 0, updates: 0, beatMentions: 0 })).toBe(
      "Referenced nowhere yet."
    )
  })

  it("pluralizes and joins the non-zero parts", () => {
    expect(refCountLine({ relations: 1, updates: 0, beatMentions: 0 })).toBe(
      "Referenced by 1 relation."
    )
    expect(refCountLine({ relations: 2, updates: 0, beatMentions: 1 })).toBe(
      "Referenced by 2 relations and 1 beat."
    )
    expect(refCountLine({ relations: 2, updates: 3, beatMentions: 1 })).toBe(
      "Referenced by 2 relations, 3 updates, and 1 beat."
    )
  })
})
