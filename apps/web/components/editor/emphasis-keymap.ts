import { syntaxTree } from "@codemirror/language"
import {
  EditorSelection,
  Prec,
  type ChangeSpec,
  type EditorState,
  type TransactionSpec,
} from "@codemirror/state"
import { keymap, type Command } from "@codemirror/view"

/**
 * Cmd/Ctrl+B and Cmd/Ctrl+I toggle **bold** / *italic* — the one thing
 * TipTap's StarterKit shipped for free that the vendored CM6 editor doesn't.
 *
 * A **real** toggle, not a blind wrap: because the editor already parses the
 * markdown for live preview, the command reads the syntax tree. If the
 * selection sits inside an enclosing `StrongEmphasis` (`**…**`) or `Emphasis`
 * (`*…*`) node, it strips that node's delimiter marks (un-bolds / un-italics);
 * otherwise it wraps the selection — or, when the selection is empty, inserts
 * the pair and drops the caret between them, ready to type. Reading the tree
 * (rather than peeking at raw characters) is what keeps `*italic*` toggling
 * distinct from the `*` runs inside `**bold**`.
 */
export function emphasisEdit(
  state: EditorState,
  nodeName: string,
  marker: string
): TransactionSpec {
  const len = marker.length
  const tree = syntaxTree(state)
  const changes: ChangeSpec[] = []

  const nextRanges = state.selection.ranges.map((range) => {
    const enclosing = enclosingMark(tree, nodeName, range.from, range.to)
    if (enclosing) {
      // Unwrap: drop the leading + trailing delimiter marks. Both are `len`
      // wide, so everything after the opener slides left by `len`.
      changes.push(
        { from: enclosing.open, to: enclosing.open + len, insert: "" },
        { from: enclosing.close, to: enclosing.close + len, insert: "" }
      )
      return EditorSelection.range(range.from - len, range.to - len)
    }
    // Wrap the selection (empty or not); the caret/selection lands on the inner
    // text so the next keystroke goes inside the emphasis.
    changes.push(
      { from: range.from, insert: marker },
      { from: range.to, insert: marker }
    )
    return EditorSelection.range(range.from + len, range.to + len)
  })

  return {
    changes,
    selection: EditorSelection.create(nextRanges, state.selection.mainIndex),
    userEvent: "input",
    scrollIntoView: true,
  }
}

function toggleEmphasis(nodeName: string, marker: string): Command {
  return (view) => {
    view.dispatch(view.state.update(emphasisEdit(view.state, nodeName, marker)))
    return true
  }
}

/** The nearest `nodeName` node fully containing `[from, to]`, with its two delimiter offsets. */
function enclosingMark(
  tree: ReturnType<typeof syntaxTree>,
  nodeName: string,
  from: number,
  to: number
): { open: number; close: number } | null {
  for (
    let node: ReturnType<typeof tree.resolveInner> | null = tree.resolveInner(
      from,
      1
    );
    node;
    node = node.parent
  ) {
    if (node.name !== nodeName || node.from > from || node.to < to) continue
    const marks: number[] = []
    for (let child = node.firstChild; child; child = child.nextSibling) {
      if (child.name === "EmphasisMark") marks.push(child.from)
    }
    const open = marks[0]
    const close = marks[marks.length - 1]
    return open !== undefined && close !== undefined && open !== close
      ? { open, close }
      : null
  }
  return null
}

/**
 * The emphasis-toggle keymap, at high precedence so `Mod-b` / `Mod-i` win over
 * any browser default before the base keymap sees them.
 */
export const emphasisKeymap = Prec.high(
  keymap.of([
    { key: "Mod-b", run: toggleEmphasis("StrongEmphasis", "**") },
    { key: "Mod-i", run: toggleEmphasis("Emphasis", "*") },
  ])
)
