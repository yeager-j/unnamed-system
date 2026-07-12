import { describe, expect, it } from "vitest"

import { blockingDeadlines, deadlineState } from "./deadline"

const demon = { id: "demon", name: "Rise of the Demon Lord", datedDay: 17 }
const siege = { id: "siege", name: "Siege of Saltmere", datedDay: 18 }

const none: ReadonlySet<string> = new Set()

describe("deadlineState", () => {
  it("is looming before the due day", () => {
    expect(deadlineState(demon, 16, none)).toBe("looming")
  })

  it("is due on the due day", () => {
    expect(deadlineState(demon, 17, none)).toBe("due")
  })

  it("renders overdue as due — never a fourth state", () => {
    expect(deadlineState(demon, 20, none)).toBe("due")
  })

  it("is resolved whenever a marker binds it, regardless of the day", () => {
    expect(deadlineState(demon, 10, new Set(["demon"]))).toBe("resolved")
    expect(deadlineState(demon, 20, new Set(["demon"]))).toBe("resolved")
  })
})

describe("blockingDeadlines", () => {
  it("blocks arriving on the due day — the bound is ≤, not <", () => {
    expect(blockingDeadlines([demon], 17, none)).toEqual([demon])
  })

  it("does not block while the deadline is still ahead", () => {
    expect(blockingDeadlines([demon], 16, none)).toEqual([])
  })

  it("blocks a skip whose interval contains the due day", () => {
    expect(blockingDeadlines([demon], 20, none)).toEqual([demon])
  })

  it("blocks the next advance for an overdue-unresolved deadline", () => {
    expect(blockingDeadlines([demon], 19, none)).toEqual([demon])
  })

  it("never blocks on a resolved deadline", () => {
    expect(blockingDeadlines([demon, siege], 20, new Set(["demon"]))).toEqual([
      siege,
    ])
    expect(
      blockingDeadlines([demon, siege], 20, new Set(["demon", "siege"]))
    ).toEqual([])
  })

  it("collects every concurrent blocker", () => {
    expect(blockingDeadlines([demon, siege], 18, none)).toEqual([demon, siege])
  })

  it("is empty with no deadlines", () => {
    expect(blockingDeadlines([], 99, none)).toEqual([])
  })
})
