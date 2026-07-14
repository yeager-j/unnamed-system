// @vitest-environment jsdom

import {
  acceptCompletion,
  autocompletion,
  currentCompletions,
  setSelectedCompletion,
  startCompletion,
  type Completion,
} from "@codemirror/autocomplete"
import { markdown } from "@codemirror/lang-markdown"
import { EditorState } from "@codemirror/state"
import { EditorView } from "@codemirror/view"
import { afterEach, describe, expect, it, vi } from "vitest"

import { SLASH_INLINE_SECTION, slashCommandSource } from "./slash-commands"

Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
  value: () => {},
})
Object.defineProperties(Range.prototype, {
  getBoundingClientRect: {
    value: () => new DOMRect(0, 0, 1, 16),
  },
  getClientRects: {
    value: () => [new DOMRect(0, 0, 1, 16)] as unknown as DOMRectList,
  },
})

const views: EditorView[] = []

afterEach(() => {
  for (const view of views.splice(0)) view.destroy()
  document.body.replaceChildren()
})

function mount(
  doc: string,
  input?: { selection?: number; extraItems?: readonly Completion[] }
) {
  const host = document.createElement("div")
  document.body.append(host)
  const view = new EditorView({
    parent: host,
    state: EditorState.create({
      doc,
      selection: { anchor: input?.selection ?? doc.length },
      extensions: [
        markdown(),
        autocompletion({
          activateOnTyping: true,
          icons: false,
          override: [slashCommandSource({ extraItems: input?.extraItems })],
        }),
      ],
    }),
  })
  views.push(view)
  return view
}

async function completionsOf(view: EditorView) {
  startCompletion(view)
  await vi.waitFor(() => {
    expect(currentCompletions(view.state).length).toBeGreaterThan(0)
  })
  return currentCompletions(view.state)
}

async function chooseCompletion(view: EditorView, label: string) {
  const completions = await completionsOf(view)
  const index = completions.findIndex(
    (completion) => completion.label === label
  )
  expect(index).toBeGreaterThanOrEqual(0)
  view.dispatch({ effects: setSelectedCompletion(index) })
  await new Promise((resolve) => window.setTimeout(resolve, 80))
  expect(acceptCompletion(view)).toBe(true)
}

async function expectNoCompletions(view: EditorView) {
  startCompletion(view)
  await new Promise((resolve) => window.setTimeout(resolve, 0))
  expect(currentCompletions(view.state)).toHaveLength(0)
}

describe("slash command insertions", () => {
  it.each([
    ["Heading 1", "# "],
    ["Heading 2", "## "],
    ["Heading 3", "### "],
    ["Heading 4", "#### "],
    ["Bulleted list", "- "],
    ["Numbered list", "1. "],
    ["Quote", "> "],
    ["Divider", "---\n"],
  ])("replaces the trigger with %s markdown", async (label, inserted) => {
    const view = mount("/")

    await chooseCompletion(view, label)

    expect(view.state.doc.toString()).toBe(inserted)
    expect(view.state.selection.main.head).toBe(inserted.length)
  })

  it("inserts a code block with the caret between the fences", async () => {
    const view = mount("/")

    await chooseCompletion(view, "Code block")

    expect(view.state.doc.toString()).toBe("```\n\n```")
    expect(view.state.selection.main.head).toBe("```\n".length)
  })

  it("inserts a table skeleton with the caret in the first header cell", async () => {
    const view = mount("/")

    await chooseCompletion(view, "Table")

    expect(view.state.doc.toString()).toBe(
      "| Column | Column |\n| --- | --- |\n|  |  |\n"
    )
    expect(view.state.selection.main.head).toBe("| ".length)
  })

  it.each([
    ["Divider", "A paragraph\n\n---\n"],
    ["Table", "A paragraph\n\n| Column | Column |\n| --- | --- |\n|  |  |\n"],
    ["Bulleted list", "A paragraph\n\n- "],
    ["Numbered list", "A paragraph\n\n1. "],
  ])(
    "%s separates itself from a preceding paragraph with a blank line",
    async (label, expected) => {
      const view = mount("A paragraph\n/")

      await chooseCompletion(view, label)

      expect(view.state.doc.toString()).toBe(expected)
    }
  )

  it("does not double a blank line that is already there", async () => {
    const view = mount("A paragraph\n\n/")

    await chooseCompletion(view, "Divider")

    expect(view.state.doc.toString()).toBe("A paragraph\n\n---\n")
  })

  it("interrupts a paragraph directly for headings", async () => {
    const view = mount("A paragraph\n/")

    await chooseCompletion(view, "Heading 1")

    expect(view.state.doc.toString()).toBe("A paragraph\n# ")
  })
})

describe("slash command gating", () => {
  it("stays literal mid-line", async () => {
    await expectNoCompletions(mount("weight is 3/4"))
  })

  it("stays literal after mid-line whitespace", async () => {
    await expectNoCompletions(mount("hello /he"))
  })

  it("stays literal inside inline code", async () => {
    const doc = "`/he`"
    await expectNoCompletions(mount(doc, { selection: doc.indexOf("e") + 1 }))
  })

  it("stays literal inside a fenced code block", async () => {
    const doc = "```md\n/he\n```"
    await expectNoCompletions(mount(doc, { selection: doc.indexOf("e") + 1 }))
  })
})

describe("slash command filtering and grouping", () => {
  it("shows every block item for a bare slash", async () => {
    const completions = await completionsOf(mount("/"))

    expect(completions.map((completion) => completion.label)).toEqual([
      "Heading 1",
      "Heading 2",
      "Heading 3",
      "Heading 4",
      "Bulleted list",
      "Numbered list",
      "Quote",
      "Code block",
      "Divider",
      "Table",
    ])
  })

  it("narrows by label word prefix", async () => {
    const completions = await completionsOf(mount("/head"))

    expect(completions.map((completion) => completion.label)).toEqual([
      "Heading 1",
      "Heading 2",
      "Heading 3",
      "Heading 4",
    ])
  })

  it("matches keywords CM6's fuzzy filter would drop", async () => {
    const completions = await completionsOf(mount("/hr"))

    expect(completions.map((completion) => completion.label)).toEqual([
      "Divider",
    ])
  })

  it("closes when nothing matches", async () => {
    await expectNoCompletions(mount("/zzz"))
  })

  it("appends extra items under the Inline section, filtered by label", async () => {
    const extra: Completion = {
      label: "Link a participant",
      section: SLASH_INLINE_SECTION,
      apply: () => {},
    }

    const all = await completionsOf(mount("/", { extraItems: [extra] }))
    expect(all.at(-1)?.label).toBe("Link a participant")
    expect(all.at(-1)?.section).toBe(SLASH_INLINE_SECTION)

    const narrowed = await completionsOf(
      mount("/link", { extraItems: [extra] })
    )
    expect(narrowed.map((completion) => completion.label)).toEqual([
      "Link a participant",
    ])
  })
})
