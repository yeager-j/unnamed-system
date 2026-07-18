import { describe, expect, it } from "vitest"

import type { Accepted } from "./protocol"
import {
  createCausalAcceptanceGate,
  createPullGenerationGate,
  type CausalRelationship,
} from "./transport"

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

  it("emits the recovery read unless it is provably stale", async () => {
    const { gate, emitted } = build(() =>
      accepted(5, "unknown", 42, "recovered")
    )
    gate.offer(accepted(0, "unknown", 1))
    await new Promise((resolve) => setTimeout(resolve, 0))
    // The recovery result classifies "unknown" again, but a recovery read is
    // the authority's current observation — emitting it is what terminates
    // recovery instead of looping.
    expect(emitted.map((a) => a.value)).toEqual(["recovered"])
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
