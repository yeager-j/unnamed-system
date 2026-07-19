import { describe, expect, it } from "vitest"

import type { Accepted } from "./protocol"
import {
  classifyPushDoorRefusal,
  createCausalAcceptanceGate,
  createPullGenerationGate,
  type CausalRelationship,
} from "./transport"

describe("classifyPushDoorRefusal", () => {
  const INVALID_WRITE = "invalid-write"

  /**
   * The governing rule: `rejected` is terminal and consumes the local
   * mutation ID, so it may only ever describe a refusal the authority
   * RECORDED against the client's watermark. These two tables split the
   * taxonomy on exactly that question.
   */
  it("maps recorded refusals to terminal rejections", () => {
    expect(
      classifyPushDoorRefusal({ kind: "rejected", error: "no" }, INVALID_WRITE)
    ).toEqual({ kind: "rejected", error: "no" })
    expect(
      classifyPushDoorRefusal({ kind: "invalid", issues: [] }, INVALID_WRITE)
    ).toEqual({ kind: "rejected", error: INVALID_WRITE })
    expect(
      classifyPushDoorRefusal(
        { kind: "unknown-mutation", name: "nope" },
        INVALID_WRITE
      )
    ).toEqual({ kind: "rejected", error: INVALID_WRITE })
  })

  it("never reports an UNRECORDED failure as rejected", () => {
    // `invalid-input` is returned by the door BEFORE the processor opens a
    // transaction, so no dedup outcome exists. Calling it `rejected` would
    // advance the replica past an ID the authority's watermark never saw,
    // and the next delivery would be a gap that wedges the stream.
    expect(classifyPushDoorRefusal("invalid-input", INVALID_WRITE)).toEqual({
      kind: "unknown-client",
    })
  })

  it("collapses every stream-dead refusal into unknown-client", () => {
    const dead = [
      { kind: "unknown-client", received: 4 },
      { kind: "gap", expected: 2, received: 7 },
      { kind: "outcome-unavailable", mutationId: 3 },
    ] as const
    for (const refusal of dead) {
      expect(classifyPushDoorRefusal(refusal, INVALID_WRITE)).toEqual({
        kind: "unknown-client",
      })
    }
  })
})

describe("createPullGenerationGate", () => {
  it("lets only the latest generation publish", () => {
    const gate = createPullGenerationGate()
    const first = gate.begin()
    const second = gate.begin()
    const published: string[] = []

    expect(first.publish(() => published.push("first"))).toBe(false)
    expect(second.publish(() => published.push("second"))).toBe(true)
    expect(published).toEqual(["second"])
  })

  it("aborts superseded generations", () => {
    const gate = createPullGenerationGate()
    const first = gate.begin()
    expect(first.signal.aborted).toBe(false)
    gate.begin()
    expect(first.signal.aborted).toBe(true)
  })

  it("cancel aborts without starting a new generation", () => {
    const gate = createPullGenerationGate()
    const pull = gate.begin()
    gate.cancel()
    expect(pull.signal.aborted).toBe(true)
    expect(pull.publish(() => undefined)).toBe(false)
  })
})

describe("createCausalAcceptanceGate", () => {
  type Cursor = { readonly relation: CausalRelationship; readonly id: number }

  function accepted(
    through: number,
    relation: CausalRelationship,
    id: number,
    value = `v${id}`
  ): Accepted<string, Cursor> {
    return { value, through, cursor: { relation, id } }
  }

  function build(recoverResult?: () => Accepted<string, Cursor>) {
    const emitted: Accepted<string, Cursor>[] = []
    let recoveries = 0
    const gate = createCausalAcceptanceGate<string, Cursor>({
      initial: accepted(0, "same", 0, "initial"),
      // The incoming cursor names the relationship the classifier should
      // report, letting each table row script its own comparison.
      classify: (_previous, incoming) => incoming.relation,
      recover: () => {
        recoveries += 1
        return Promise.resolve(
          recoverResult?.() ?? accepted(5, "fresh", 99, "recovered")
        )
      },
      emit: (value) => {
        emitted.push(value)
      },
    })
    return { gate, emitted, recoveries: () => recoveries }
  }

  const table: Array<{
    name: string
    incoming: Accepted<string, Cursor>
    expect: "emit" | "drop" | "recover"
  }> = [
    {
      name: "stale cursor, older watermark drops",
      incoming: accepted(0, "stale", 1),
      expect: "drop",
    },
    {
      name: "stale cursor, newer watermark is incomparable and recovers",
      incoming: accepted(2, "stale", 2),
      expect: "recover",
    },
    {
      name: "same cursor, same watermark is a duplicate",
      incoming: accepted(0, "same", 3),
      expect: "drop",
    },
    {
      name: "same cursor, newer watermark emits (terminal rejection visibility)",
      incoming: accepted(1, "same", 4),
      expect: "emit",
    },
    {
      name: "same cursor, older watermark drops",
      incoming: accepted(-1, "same", 5),
      expect: "drop",
    },
    {
      name: "fresh cursor, equal watermark emits",
      incoming: accepted(0, "fresh", 6),
      expect: "emit",
    },
    {
      name: "fresh cursor, newer watermark emits",
      incoming: accepted(3, "fresh", 7),
      expect: "emit",
    },
    {
      name: "fresh cursor, regressing watermark recovers",
      incoming: accepted(-1, "fresh", 8),
      expect: "recover",
    },
    {
      name: "unknown relationship recovers",
      incoming: accepted(0, "unknown", 9),
      expect: "recover",
    },
  ]

  for (const row of table) {
    it(row.name, async () => {
      const { gate, emitted, recoveries } = build()
      gate.offer(row.incoming)
      await Promise.resolve()
      if (row.expect === "emit") {
        expect(emitted).toEqual([row.incoming])
        expect(recoveries()).toBe(0)
      } else if (row.expect === "drop") {
        expect(emitted).toEqual([])
        expect(recoveries()).toBe(0)
      } else {
        expect(recoveries()).toBe(1)
      }
      gate.dispose()
    })
  }

  it("emits a provably fresh recovery read", async () => {
    const { gate, emitted } = build(() => accepted(5, "fresh", 42, "recovered"))
    gate.offer(accepted(0, "unknown", 1))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(emitted.map((a) => a.value)).toEqual(["recovered"])
    gate.dispose()
  })

  it("drops an incomparable recovery read when the last emission has not moved", async () => {
    // Two consistent observations of one serialized authority are always
    // comparable; incomparability against an unchanged last means the source
    // served an inconsistent read, and re-reading cannot fix it.
    const { gate, emitted, recoveries } = build(() =>
      accepted(5, "unknown", 42, "recovered")
    )
    gate.offer(accepted(0, "unknown", 1))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(emitted).toEqual([])
    expect(recoveries()).toBe(1)
    gate.dispose()
  })

  it("re-reads a recovery result that raced a fresher emission", async () => {
    // Codex P1 (PR #382): while a recovery read is in flight, a fresh accept
    // may advance `last`; the stale in-flight result must trigger a re-read,
    // never be emitted over the newer base.
    const results = [
      accepted(1, "stale", 50, "raced"),
      accepted(2, "fresh", 51, "final"),
    ]
    const { gate, emitted, recoveries } = build(() => {
      const next = results.shift()
      if (!next) throw new Error("unexpected extra recovery")
      return next
    })
    gate.offer(accepted(0, "unknown", 1))
    gate.offer(accepted(0, "fresh", 2, "newer"))
    await new Promise((resolve) => setTimeout(resolve, 0))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(emitted.map((a) => a.value)).toEqual(["newer", "final"])
    expect(recoveries()).toBe(2)
    gate.dispose()
  })

  it("coalesces recovery triggers while one is in flight", async () => {
    const { gate, recoveries } = build()
    gate.offer(accepted(0, "unknown", 1))
    gate.offer(accepted(0, "unknown", 2))
    gate.offer(accepted(0, "unknown", 3))
    await new Promise((resolve) => setTimeout(resolve, 0))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(recoveries()).toBe(2)
    gate.dispose()
  })

  it("stops emitting after dispose", async () => {
    const { gate, emitted } = build()
    gate.dispose()
    gate.offer(accepted(3, "fresh", 1))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(emitted).toEqual([])
  })
})
