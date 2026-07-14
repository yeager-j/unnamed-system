import { markdown } from "@codemirror/lang-markdown"
import { EditorSelection, EditorState } from "@codemirror/state"
import { describe, expect, it } from "vitest"

import { emphasisEdit } from "./emphasis-keymap"

const BOLD = ["StrongEmphasis", "**"] as const
const ITALIC = ["Emphasis", "*"] as const

/** Apply the toggle to `doc` with a `[from, to]` selection; return the new doc + selection. */
function apply(
  doc: string,
  from: number,
  to: number,
  [nodeName, marker]: readonly [string, string]
): { doc: string; selection: [number, number] } {
  const state = EditorState.create({
    doc,
    selection: EditorSelection.single(from, to),
    extensions: [markdown()],
  })
  const next = state.update(emphasisEdit(state, nodeName, marker)).state
  return {
    doc: next.doc.toString(),
    selection: [next.selection.main.from, next.selection.main.to],
  }
}

describe("emphasisEdit", () => {
  it("wraps a selection in bold and keeps the inner text selected", () => {
    expect(apply("word", 0, 4, BOLD)).toEqual({
      doc: "**word**",
      selection: [2, 6],
    })
  })

  it("wraps a selection in italic", () => {
    expect(apply("word", 0, 4, ITALIC)).toEqual({
      doc: "*word*",
      selection: [1, 5],
    })
  })

  it("toggles bold off when the selection is already bold", () => {
    expect(apply("**word**", 2, 6, BOLD)).toEqual({
      doc: "word",
      selection: [0, 4],
    })
  })

  it("toggles italic off when the selection is already italic", () => {
    expect(apply("*word*", 1, 5, ITALIC)).toEqual({
      doc: "word",
      selection: [0, 4],
    })
  })

  it("adds bold around italic rather than stripping an italic star", () => {
    // The `*` runs inside `**bold**` must not be mistaken for `*italic*`, and
    // vice-versa — this is why the toggle reads the tree, not raw characters.
    expect(apply("*word*", 1, 5, BOLD)).toEqual({
      doc: "***word***",
      selection: [3, 7],
    })
  })

  it("adds italic around bold rather than stripping a bold star", () => {
    expect(apply("**word**", 2, 6, ITALIC)).toEqual({
      doc: "***word***",
      selection: [3, 7],
    })
  })

  it("inserts the pair and drops the caret between them on an empty selection", () => {
    expect(apply("", 0, 0, BOLD)).toEqual({ doc: "****", selection: [2, 2] })
  })
})
