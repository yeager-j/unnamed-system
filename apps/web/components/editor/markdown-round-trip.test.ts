// @vitest-environment jsdom

import { Editor, type JSONContent } from "@tiptap/core"
import { Placeholder } from "@tiptap/extension-placeholder"
import { Markdown } from "@tiptap/markdown"
import { StarterKit } from "@tiptap/starter-kit"
import { describe, expect, it } from "vitest"

import { ParticipantChip } from "./participant-chip"

/**
 * Sanity checks that the editor's Markdown round-trip preserves the kinds
 * of formatting Step 3 players will actually write — headings, lists,
 * emphasis, links — without lossy transformations. Catches drift between
 * `@tiptap/markdown` and the `react-markdown` renderer's CommonMark
 * expectations early; the extension is still beta as of integration.
 *
 * The **participant chip** cases (UNN-576, D7) pin the `[[kind:id|label]]`
 * token's serialize/parse symmetry — including the tokenizer beating the
 * link tokenizer to the `[` and malformed tokens staying plain text.
 */

function makeEditor(initial: string) {
  return new Editor({
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] } }),
      Markdown,
      Placeholder.configure({ placeholder: "" }),
      ParticipantChip,
    ],
    content: initial,
    contentType: "markdown",
  })
}

/** Collects every participantChip node (depth-first) in the editor's JSON. */
function chipNodes(doc: JSONContent): JSONContent[] {
  const found: JSONContent[] = []
  const walk = (node: JSONContent) => {
    if (node.type === "participantChip") found.push(node)
    node.content?.forEach(walk)
  }
  walk(doc)
  return found
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

describe("participant chip round-trip", () => {
  it("parses a chip token into the node and serializes it back verbatim", () => {
    const source = "The [[npc:n1|Maren the Hollow]] finds them at breakfast."
    const editor = makeEditor(source)
    try {
      const chips = chipNodes(editor.getJSON())
      expect(chips).toHaveLength(1)
      expect(chips[0]!.attrs).toMatchObject({
        kind: "npc",
        id: "n1",
        label: "Maren the Hollow",
      })
      expect(editor.getMarkdown()).toContain("[[npc:n1|Maren the Hollow]]")
    } finally {
      editor.destroy()
    }
  })

  it("round-trips every participant kind", () => {
    const source =
      "[[npc:n1|Maren]] met [[character:c1|Vell]] at [[article:a1|Saltmere]]."
    const editor = makeEditor(source)
    try {
      const out = editor.getMarkdown()
      expect(out).toContain("[[npc:n1|Maren]]")
      expect(out).toContain("[[character:c1|Vell]]")
      expect(out).toContain("[[article:a1|Saltmere]]")
      expect(chipNodes(editor.getJSON())).toHaveLength(3)
    } finally {
      editor.destroy()
    }
  })

  it("is byte-stable across repeated serialize → parse cycles", () => {
    const editor = makeEditor(
      "Meet [[npc:n1|Maren]] in [[article:a1|Saltmere]]."
    )
    try {
      const first = editor.getMarkdown()
      editor.commands.setContent(first, {
        emitUpdate: false,
        contentType: "markdown",
      })
      expect(editor.getMarkdown()).toBe(first)
    } finally {
      editor.destroy()
    }
  })

  it("claims the token ahead of the link tokenizer, next to a real link", () => {
    const source =
      "See [docs](https://tiptap.dev) and [[npc:n1|Maren]] for details."
    const editor = makeEditor(source)
    try {
      const out = editor.getMarkdown()
      expect(out).toContain("[docs](https://tiptap.dev)")
      expect(out).toContain("[[npc:n1|Maren]]")
      expect(chipNodes(editor.getJSON())).toHaveLength(1)
    } finally {
      editor.destroy()
    }
  })

  it("keeps chips inside list items", () => {
    const editor = makeEditor(
      "- Ask [[npc:n1|Maren]]\n- Scout [[article:a1|the vault]]"
    )
    try {
      const out = editor.getMarkdown()
      expect(out).toContain("[[npc:n1|Maren]]")
      expect(out).toContain("[[article:a1|the vault]]")
    } finally {
      editor.destroy()
    }
  })

  it("leaves a hostile label's stray pipe un-tokenized (stays plain text)", () => {
    const editor = makeEditor("A [[npc:n1|Ma|ren]] non-token.")
    try {
      expect(chipNodes(editor.getJSON())).toHaveLength(0)
    } finally {
      editor.destroy()
    }
  })

  it("leaves an unknown kind as plain text", () => {
    const editor = makeEditor("A [[dungeon:d1|The Vault]] non-token.")
    try {
      expect(chipNodes(editor.getJSON())).toHaveLength(0)
      expect(editor.getText()).toContain("dungeon:d1")
    } finally {
      editor.destroy()
    }
  })

  it("leaves a bare [[ opener as plain text", () => {
    const editor = makeEditor("An unfinished [[ opener.")
    try {
      expect(chipNodes(editor.getJSON())).toHaveLength(0)
      expect(editor.getText()).toContain("[[ opener")
    } finally {
      editor.destroy()
    }
  })

  it("sanitizes a hostile label attribute at serialize", () => {
    const editor = makeEditor("")
    try {
      editor.commands.insertContent({
        type: "participantChip",
        attrs: { kind: "npc", id: "n1", label: "Ma|r[e]n" },
      })
      expect(editor.getMarkdown()).toContain("[[npc:n1|Maren]]")
    } finally {
      editor.destroy()
    }
  })
})
