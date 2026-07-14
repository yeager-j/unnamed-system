// @vitest-environment jsdom

import { markdown } from "@codemirror/lang-markdown"
import { EditorState } from "@codemirror/state"
import { EditorView } from "@codemirror/view"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { ParticipantPreview } from "@/domain/planner/participant-preview"

import { embedBlocks } from "./embed-blocks"

const ENCOUNTER_PREVIEW: ParticipantPreview = {
  ref: { kind: "encounter", id: "e1" },
  name: "Goblin Ambush",
  tombstoned: false,
  portraitUrl: null,
  sublabel: "Live",
  summary: null,
  detail: "3 participants",
  shortId: "enc12345",
  enemies: null,
}

const EMBED_DOC = "before\n\n![[encounter:e1|Stored Ambush]]\n\nafter"

const views: EditorView[] = []

afterEach(() => {
  for (const view of views.splice(0)) view.destroy()
  document.body.replaceChildren()
})

function mount(
  doc: string,
  input?: {
    selection?: number
    navigate?: (href: string) => void
    loadPreview?: (ref: unknown) => Promise<ParticipantPreview | null>
  }
) {
  const navigate = input?.navigate ?? vi.fn()
  const loadPreview = input?.loadPreview ?? vi.fn(async () => ENCOUNTER_PREVIEW)
  const host = document.createElement("div")
  document.body.append(host)
  const view = new EditorView({
    parent: host,
    state: EditorState.create({
      doc,
      selection: { anchor: input?.selection ?? 0 },
      extensions: [
        markdown(),
        embedBlocks({ campaignShortId: "camp1234", navigate, loadPreview }),
      ],
    }),
  })
  views.push(view)
  return { host, view, navigate, loadPreview }
}

function cardOf(host: HTMLElement): HTMLElement {
  const card = host.querySelector<HTMLElement>(".cm-embed-card")
  expect(card).not.toBeNull()
  return card!
}

describe("embedBlocks (UNN-624)", () => {
  it("renders a block card for a whole-line embed token and hides the raw token", () => {
    const { host, view } = mount(EMBED_DOC)
    const card = cardOf(host)
    expect(card.dataset.embedKind).toBe("encounter")
    expect(host.textContent).not.toContain("![[")
    expect(view.state.doc.toString()).toBe(EMBED_DOC)
  })

  it("fills the card from the preview loader", async () => {
    const { host } = mount(EMBED_DOC)
    await vi.waitFor(() => {
      const card = cardOf(host)
      expect(card.dataset.embedState).toBe("ready")
      expect(card.textContent).toContain("Goblin Ambush")
      expect(card.textContent).toContain("Live · 3 participants")
    })
  })

  it("reveals the raw token on the active line, card still below", () => {
    const { host } = mount(EMBED_DOC, {
      selection: EMBED_DOC.indexOf("encounter"),
    })
    expect(host.textContent).toContain("![[encounter:e1|Stored Ambush]]")
    expect(host.querySelector(".cm-embed-card")).not.toBeNull()
  })

  it("navigates to the target console on click", async () => {
    const navigate = vi.fn()
    const { host } = mount(EMBED_DOC, { navigate })
    await vi.waitFor(() => {
      expect(cardOf(host).dataset.embedState).toBe("ready")
    })
    cardOf(host).dispatchEvent(new MouseEvent("click", { bubbles: true }))
    expect(navigate).toHaveBeenCalledWith(
      "/campaigns/camp1234/encounter/enc12345"
    )
  })

  it("shows the missing state for a preview miss", async () => {
    const { host } = mount(EMBED_DOC, { loadPreview: async () => null })
    await vi.waitFor(() => {
      const card = cardOf(host)
      expect(card.dataset.embedState).toBe("missing")
      expect(card.textContent).toContain("Stored Ambush")
      expect(card.textContent).toContain("Not found")
    })
  })

  it("does not embed mid-paragraph tokens or non-embeddable kinds", () => {
    const midLine = mount("run ![[encounter:e1|X]] tonight")
    expect(midLine.host.querySelector(".cm-embed-card")).toBeNull()

    const npc = mount("![[npc:n1|Maren]]")
    expect(npc.host.querySelector(".cm-embed-card")).toBeNull()
  })

  it("leaves tokens inside code fences alone", () => {
    const { host } = mount("```\n![[encounter:e1|X]]\n```")
    expect(host.querySelector(".cm-embed-card")).toBeNull()
  })
})
