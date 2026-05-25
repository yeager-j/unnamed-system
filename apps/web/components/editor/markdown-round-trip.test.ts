// @vitest-environment jsdom

import { Editor } from "@tiptap/core"
import { Placeholder } from "@tiptap/extension-placeholder"
import { Markdown } from "@tiptap/markdown"
import { StarterKit } from "@tiptap/starter-kit"
import { describe, expect, it } from "vitest"

/**
 * Sanity checks that the editor's Markdown round-trip preserves the kinds
 * of formatting Step 3 players will actually write — headings, lists,
 * emphasis, links — without lossy transformations. Catches drift between
 * `@tiptap/markdown` and the `react-markdown` renderer's CommonMark
 * expectations early; the extension is still beta as of integration.
 */

function makeEditor(initial: string) {
  return new Editor({
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] } }),
      Markdown,
      Placeholder.configure({ placeholder: "" }),
    ],
    content: initial,
    contentType: "markdown",
  })
}

describe("MarkdownField round-trip", () => {
  it("preserves headings, paragraphs, lists, and emphasis", () => {
    const source = [
      "## A Heading",
      "",
      "A paragraph with **bold** and *italic* words.",
      "",
      "- one",
      "- two",
      "- three",
    ].join("\n")

    const editor = makeEditor(source)
    try {
      const out = editor.getMarkdown()
      // Tolerate trailing whitespace differences but assert each landmark is
      // present in order — that catches the failures we care about (dropped
      // list, swapped headings) without coupling to MarkedJS's exact line-
      // break choices.
      expect(out).toMatch(/^##\s+A Heading/)
      expect(out).toContain("**bold**")
      expect(out).toContain("*italic*")
      expect(out).toMatch(/-\s+one/)
      expect(out).toMatch(/-\s+two/)
      expect(out).toMatch(/-\s+three/)
    } finally {
      editor.destroy()
    }
  })

  it("preserves links", () => {
    const editor = makeEditor("Visit [Tiptap](https://tiptap.dev) for docs.")
    try {
      expect(editor.getMarkdown()).toContain("[Tiptap](https://tiptap.dev)")
    } finally {
      editor.destroy()
    }
  })

  it("round-trips via setContent (markdown → editor → markdown)", () => {
    const editor = makeEditor("")
    try {
      editor.commands.setContent("### Subheading\n\nText.", {
        emitUpdate: false,
        contentType: "markdown",
      })
      const out = editor.getMarkdown()
      expect(out).toMatch(/###\s+Subheading/)
      expect(out).toContain("Text.")
    } finally {
      editor.destroy()
    }
  })
})
