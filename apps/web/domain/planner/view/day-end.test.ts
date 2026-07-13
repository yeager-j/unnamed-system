import { describe, expect, it } from "vitest"

import type { ResolvedParticipant } from "../participant"
import {
  buildDayEndPreSuggests,
  dayEndGlanceLine,
  deadlineCountdown,
} from "./day-end"

const resolved = (
  kind: "npc" | "article",
  id: string,
  label: string
): ResolvedParticipant => ({
  ref: { kind, id },
  label,
  tombstoned: false,
  missing: false,
})

describe("buildDayEndPreSuggests", () => {
  it("shapes beats (first chip primary, rest concerns, tagline draft)", () => {
    const suggests = buildDayEndPreSuggests({
      resolvedBeats: [
        {
          id: "b1",
          title: "The Forged Ledger",
          tagline: "Maren slips out of Saltmere before dawn.",
          chips: [
            resolved("npc", "n1", "Maren the Hollow"),
            resolved("article", "a1", "Saltmere"),
          ],
        },
      ],
      resolvedDelves: [],
      liveDeadlines: [],
    })
    expect(suggests).toEqual([
      {
        id: "beat:b1",
        kind: "beat",
        chipLabel: "The Forged Ledger",
        seed: {
          body: "Maren slips out of Saltmere before dawn.",
          primary: { kind: "npc", id: "n1", label: "Maren the Hollow" },
          concerns: [{ kind: "article", id: "a1", label: "Saltmere" }],
        },
      },
    ])
  })

  it("shapes delves primary-less and deadlines primaried on the article", () => {
    const suggests = buildDayEndPreSuggests({
      resolvedBeats: [],
      resolvedDelves: [{ slotId: "s1", dungeonName: "The Drowned Stair" }],
      liveDeadlines: [{ articleId: "a2", name: "Rise of the Demon Lord" }],
    })
    expect(suggests[0]).toMatchObject({
      id: "delve:s1",
      seed: { body: "The party delved The Drowned Stair.", primary: null },
    })
    expect(suggests[1]).toMatchObject({
      id: "deadline:a2",
      seed: {
        body: "",
        primary: { kind: "article", id: "a2", label: "Rise of the Demon Lord" },
      },
    })
  })

  it("suggests nothing for an uneventful day", () => {
    expect(
      buildDayEndPreSuggests({
        resolvedBeats: [],
        resolvedDelves: [],
        liveDeadlines: [],
      })
    ).toEqual([])
  })
})

describe("dayEndGlanceLine", () => {
  it("pluralizes both halves", () => {
    expect(dayEndGlanceLine(3, 1)).toBe(
      "3 downtime activities recorded · 1 world update logged"
    )
    expect(dayEndGlanceLine(1, 0)).toBe(
      "1 downtime activity recorded · 0 world updates logged"
    )
  })
})

describe("deadlineCountdown", () => {
  const alert = (state: "looming" | "due", daysLeft: number) => ({
    articleId: "a1",
    name: "x",
    state,
    daysLeft,
    excerpt: null,
  })

  it("counts down looming days", () => {
    expect(deadlineCountdown(alert("looming", 3))).toEqual({
      figure: "3",
      label: "days left",
    })
    expect(deadlineCountdown(alert("looming", 1))).toEqual({
      figure: "1",
      label: "day left",
    })
  })

  it("renders due (and overdue — not a fourth state, D5) at zero", () => {
    expect(deadlineCountdown(alert("due", 0))).toEqual({
      figure: "0",
      label: "due now",
    })
    expect(deadlineCountdown(alert("due", -2))).toEqual({
      figure: "0",
      label: "due now",
    })
  })
})
