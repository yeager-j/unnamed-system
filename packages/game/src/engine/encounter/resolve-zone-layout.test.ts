import { describe, expect, it } from "vitest"

import {
  groupTokensByEngagement,
  type ZoneToken,
} from "@workspace/game/engine/encounter/resolve-zone-layout"
import { type Engagement } from "@workspace/game/foundation/combat/engagement"

function token(id: string, engagement?: Engagement): ZoneToken {
  return {
    id,
    name: id,
    side: "players",
    isPc: true,
    portraitUrl: null,
    engagement,
  }
}

function engaged(...targetCombatantIds: string[]): Engagement {
  return { status: "engaged", targetCombatantIds }
}

/** Groups reduced to their member ids — the property under test. */
function ids(groups: ZoneToken[][]): string[][] {
  return groups.map((group) => group.map((member) => member.id))
}

describe("groupTokensByEngagement", () => {
  it("returns no groups for an empty zone", () => {
    expect(groupTokensByEngagement([])).toEqual([])
  })

  it("returns every free token as its own singleton, in input order", () => {
    const tokens = [token("a"), token("b", { status: "free" }), token("c")]
    expect(ids(groupTokensByEngagement(tokens))).toEqual([["a"], ["b"], ["c"]])
  })

  it("clusters a mutually engaged pair, leaving others as singletons", () => {
    const tokens = [
      token("a", engaged("b")),
      token("b", engaged("a")),
      token("c"),
    ]
    expect(ids(groupTokensByEngagement(tokens))).toEqual([["a", "b"], ["c"]])
  })

  it("merges a chain (A–B, B–C) into one cluster", () => {
    const tokens = [
      token("a", engaged("b")),
      token("b", engaged("a", "c")),
      token("c", engaged("b")),
    ]
    expect(ids(groupTokensByEngagement(tokens))).toEqual([["a", "b", "c"]])
  })

  it("keeps two disjoint pairs as separate clusters", () => {
    const tokens = [
      token("a", engaged("b")),
      token("b", engaged("a")),
      token("c", engaged("d")),
      token("d", engaged("c")),
    ]
    expect(ids(groupTokensByEngagement(tokens))).toEqual([
      ["a", "b"],
      ["c", "d"],
    ])
  })

  it("treats a token engaged only with an absent partner as a singleton", () => {
    const tokens = [token("a", engaged("ghost")), token("b")]
    expect(ids(groupTokensByEngagement(tokens))).toEqual([["a"], ["b"]])
  })

  it("treats a token with no engagement field (redacted) as a singleton", () => {
    const tokens = [token("a", engaged("b")), token("b", undefined)]
    // 'a' still reaches 'b' through its own edge, so the lock surfaces even when
    // the partner's engagement is redacted; an isolated redacted token is a singleton.
    expect(ids(groupTokensByEngagement(tokens))).toEqual([["a", "b"]])
    expect(ids(groupTokensByEngagement([token("z", undefined)]))).toEqual([
      ["z"],
    ])
  })

  it("ignores a self-link", () => {
    const tokens = [token("a", engaged("a")), token("b")]
    expect(ids(groupTokensByEngagement(tokens))).toEqual([["a"], ["b"]])
  })

  it("orders members within a cluster by input order, regardless of edge direction", () => {
    const tokens = [
      token("c", engaged("a")),
      token("a", engaged("c", "b")),
      token("b", engaged("a")),
    ]
    expect(ids(groupTokensByEngagement(tokens))).toEqual([["c", "a", "b"]])
  })
})
