import { syntaxTree } from "@codemirror/language"
import type { EditorState } from "@codemirror/state"
import type { SyntaxNode } from "@lezer/common"

const CODE_NODE_NAMES = new Set(["InlineCode", "FencedCode", "CodeBlock"])

/**
 * Whether a document position sits inside markdown code — an inline span or a
 * fenced/indented block. Editor affordances (chip pills, completion triggers)
 * stay literal there: code means "render exactly what I typed".
 */
export function isPositionInsideCode(
  state: EditorState,
  position: number
): boolean {
  let node: SyntaxNode | null = syntaxTree(state).resolveInner(position, 1)
  while (node !== null) {
    if (CODE_NODE_NAMES.has(node.name)) return true
    node = node.parent
  }
  return false
}
