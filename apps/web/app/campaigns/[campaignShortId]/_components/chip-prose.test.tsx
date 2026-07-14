// @vitest-environment jsdom

import { render } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import type { ResolvedParticipant } from "@/domain/planner/participant"

import { ChipProse } from "./chip-prose"

// The preview hook's module pulls the auth stack in through its Server Action
// import; these renders never fetch (no provider in scope), so stub it out.
vi.mock("@/lib/actions/campaign-world/participant-preview", () => ({
  getParticipantPreviewAction: vi.fn(async () => ({
    ok: false,
    error: "not-found",
  })),
}))

const ENCOUNTER: ResolvedParticipant = {
  ref: { kind: "encounter", id: "e1", label: "Goblin Ambush" },
  label: "Goblin Ambush",
  tombstoned: false,
  missing: false,
}

const NPC: ResolvedParticipant = {
  ref: { kind: "npc", id: "n1", label: "Maren" },
  label: "Maren",
  tombstoned: false,
  missing: false,
}

describe("ChipProse embeds (UNN-624)", () => {
  it("renders a whole-line embed token as the block card, outside any <p>", () => {
    const { container } = render(
      <ChipProse participants={[ENCOUNTER]}>
        {"Before.\n\n![[encounter:e1|Goblin Ambush]]\n\nAfter."}
      </ChipProse>
    )
    expect(container.textContent).toContain("Goblin Ambush")
    // The sole-child paragraph unwraps — the card must not sit inside a <p>.
    for (const paragraph of container.querySelectorAll("p")) {
      expect(paragraph.textContent).not.toContain("Goblin Ambush")
    }
    // And no raw markdown image leaks through.
    expect(container.querySelector("img")).toBeNull()
  })

  it("degrades a mid-paragraph embed token to a literal bang + inline pill", () => {
    const { container } = render(
      <ChipProse participants={[ENCOUNTER]}>
        {"Run ![[encounter:e1|Goblin Ambush]] tonight."}
      </ChipProse>
    )
    expect(container.textContent).toContain("!")
    expect(container.textContent).toContain("Goblin Ambush")
    expect(container.querySelector("img")).toBeNull()
  })

  it("never mis-parses an embed token into a markdown image via the chip rewrite (ordering regression)", () => {
    // A whole-line NPC embed: not an embeddable kind, so it must fall back to
    // bang + pill — with the chip rewrite alone it would become ![Maren](#chip:…).
    const { container } = render(
      <ChipProse participants={[NPC]}>{"![[npc:n1|Maren]]"}</ChipProse>
    )
    expect(container.querySelector("img")).toBeNull()
    expect(container.textContent).toContain("!")
    expect(container.textContent).toContain("Maren")
  })

  it("still renders inline chip tokens as pills", () => {
    const { container } = render(
      <ChipProse participants={[NPC]}>{"Meet [[npc:n1|Maren]]."}</ChipProse>
    )
    expect(container.textContent).toContain("Maren")
    expect(container.textContent).not.toContain("[[")
  })
})
