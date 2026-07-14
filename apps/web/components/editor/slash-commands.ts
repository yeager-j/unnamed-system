import {
  pickedCompletion,
  type Completion,
  type CompletionSection,
  type CompletionSource,
} from "@codemirror/autocomplete"
import type { EditorState } from "@codemirror/state"
import {
  CodeIcon,
  ListBulletsIcon,
  ListNumbersIcon,
  MinusIcon,
  QuotesIcon,
  TableIcon,
  TextHFourIcon,
  TextHOneIcon,
  TextHThreeIcon,
  TextHTwoIcon,
  type Icon,
} from "@phosphor-icons/react"

import { registerCompletionPresentation } from "./completion-presentation"
import { isPositionInsideCode } from "./markdown-code-context"

const BASIC_BLOCKS_SECTION: CompletionSection = {
  name: "Basic blocks",
  rank: 0,
}

/** The section extra (caller-supplied) slash items render under, after the blocks. */
export const SLASH_INLINE_SECTION: CompletionSection = {
  name: "Inline",
  rank: 1,
}

const TABLE_INSERT = "| Column | Column |\n| --- | --- |\n|  |  |\n"

interface SlashItem {
  completion: Completion
  keywords: readonly string[]
}

interface BlockSpec {
  label: string
  icon: Icon
  insert: string
  /** Caret offset into `insert` after applying; defaults to its end. */
  cursorOffset?: number
  /**
   * Blocks CommonMark won't let interrupt a paragraph — a bare `---` even
   * setext-headings the line above — get a blank line prepended when the
   * previous line has content.
   */
  needsLeadingBlankLine?: boolean
}

function blockCompletion(spec: BlockSpec): Completion {
  const completion: Completion = {
    label: spec.label,
    section: BASIC_BLOCKS_SECTION,
    apply: (view, applied, from, to) => {
      const prefix =
        spec.needsLeadingBlankLine && !previousLineIsBlank(view.state, from)
          ? "\n"
          : ""
      const insert = prefix + spec.insert
      view.dispatch({
        changes: { from, to, insert },
        selection: {
          anchor:
            from + prefix.length + (spec.cursorOffset ?? spec.insert.length),
        },
        annotations: pickedCompletion.of(applied),
      })
    },
  }
  registerCompletionPresentation(completion, { icon: spec.icon })
  return completion
}

const SLASH_ITEMS: readonly SlashItem[] = [
  {
    keywords: ["h1"],
    completion: blockCompletion({
      label: "Heading 1",
      icon: TextHOneIcon,
      insert: "# ",
    }),
  },
  {
    keywords: ["h2"],
    completion: blockCompletion({
      label: "Heading 2",
      icon: TextHTwoIcon,
      insert: "## ",
    }),
  },
  {
    keywords: ["h3"],
    completion: blockCompletion({
      label: "Heading 3",
      icon: TextHThreeIcon,
      insert: "### ",
    }),
  },
  {
    keywords: ["h4"],
    completion: blockCompletion({
      label: "Heading 4",
      icon: TextHFourIcon,
      insert: "#### ",
    }),
  },
  {
    keywords: ["ul", "unordered"],
    completion: blockCompletion({
      label: "Bulleted list",
      icon: ListBulletsIcon,
      insert: "- ",
      needsLeadingBlankLine: true,
    }),
  },
  {
    keywords: ["ol", "ordered"],
    completion: blockCompletion({
      label: "Numbered list",
      icon: ListNumbersIcon,
      insert: "1. ",
      needsLeadingBlankLine: true,
    }),
  },
  {
    keywords: ["blockquote"],
    completion: blockCompletion({
      label: "Quote",
      icon: QuotesIcon,
      insert: "> ",
    }),
  },
  {
    keywords: ["fence"],
    completion: blockCompletion({
      label: "Code block",
      icon: CodeIcon,
      insert: "```\n\n```",
      cursorOffset: "```\n".length,
    }),
  },
  {
    keywords: ["hr", "rule", "separator"],
    completion: blockCompletion({
      label: "Divider",
      icon: MinusIcon,
      insert: "---\n",
      needsLeadingBlankLine: true,
    }),
  },
  {
    keywords: ["grid"],
    completion: blockCompletion({
      label: "Table",
      icon: TableIcon,
      insert: TABLE_INSERT,
      cursorOffset: "| ".length,
      needsLeadingBlankLine: true,
    }),
  },
]

/**
 * The `/` completion source (UNN-623): Notion-style markdown block insertion.
 * Feature-agnostic — items insert literal CommonMark text, so there is no
 * serializer to gate; a document-shaped surface adds domain rows (chip linking)
 * via `extraItems`, rendered under {@link SLASH_INLINE_SECTION}.
 *
 * The list opens only when the `/` starts its line (mid-line and in-code
 * slashes stay literal), which guarantees every block insertion lands at a
 * valid block position. The result sets `filter: false`: keyword matches like
 * `/hr` → Divider would be dropped by CM6's own fuzzy re-filter otherwise, and
 * with the range covering the `/`, `apply` replaces exactly the typed trigger.
 *
 * Must be registered in the editor's single `autocompletion({ override })`
 * owner — a second `autocompletion()` call throws at editor creation.
 */
export function slashCommandSource(config?: {
  extraItems?: readonly Completion[]
}): CompletionSource {
  const extraItems = config?.extraItems ?? []
  return (context) => {
    const match = context.matchBefore(/\/[\w-]*$/)
    if (match === null) return null
    if (match.from !== context.state.doc.lineAt(context.pos).from) return null
    if (isPositionInsideCode(context.state, match.from)) return null

    const query = match.text.slice(1).toLowerCase()
    const options = [
      ...SLASH_ITEMS.filter((item) => slashItemMatches(item, query)).map(
        (item) => item.completion
      ),
      ...extraItems.filter((completion) =>
        labelMatches(completion.label, query)
      ),
    ]
    if (options.length === 0) return null

    return { from: match.from, to: context.pos, options, filter: false }
  }
}

function slashItemMatches(item: SlashItem, query: string): boolean {
  return (
    labelMatches(item.completion.label, query) ||
    item.keywords.some((keyword) => keyword.startsWith(query))
  )
}

function labelMatches(label: string, query: string): boolean {
  return label
    .toLowerCase()
    .split(/\s+/)
    .some((word) => word.startsWith(query))
}

function previousLineIsBlank(state: EditorState, position: number): boolean {
  const line = state.doc.lineAt(position)
  if (line.number === 1) return true
  return state.doc.line(line.number - 1).text.trim() === ""
}
