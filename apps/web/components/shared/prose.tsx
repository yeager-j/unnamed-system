import { defaultSchema } from "hast-util-sanitize"
import ReactMarkdown, { type Components } from "react-markdown"
import rehypeSanitize from "rehype-sanitize"
import remarkGfm from "remark-gfm"

import { cn } from "@workspace/ui/lib/utils"

/**
 * Three-layer defense for rendering player-authored Markdown (ADR-001):
 *
 * 1. `react-markdown` escapes embedded HTML by default (no `rehype-raw`), so a
 *    literal `<script>` shows up as text.
 * 2. `rehype-sanitize` runs an allowlist over the produced HAST tree as
 *    belt-and-braces, in case a future plugin (or upstream library bug)
 *    relaxes step 1.
 * 3. `urlTransform` strips `javascript:`, `data:`, and other non-web schemes
 *    so a crafted `[click](javascript:...)` link becomes inert.
 */
const SAFE_URL_SCHEMES = /^(https?:|mailto:|\/|#)/
const safeUrlTransform = (url: string): string =>
  SAFE_URL_SCHEMES.test(url) ? url : ""

/** Typeset rhythm presets, keyed by {@link Prose}'s `mode`. */
const TYPESET_MODE = {
  compact: "typeset-compact",
  normal: "typeset-normal",
  spacious: "typeset-spacious",
} as const

/**
 * Shared Markdown renderer for free-text content on the public sheet. Wraps
 * `react-markdown` with `remark-gfm` (tables / strikethrough / autolinks / task
 * lists) and shadcn **Typeset** — a theme-token-aware styling system we own
 * (`packages/ui/src/styles/typeset.css`). `mode` selects a reading-rhythm
 * preset; the default `normal` matches the retired `prose-sm` sizing. Typeset
 * follows its container's width and adopts the surrounding surface's color, so
 * the same markup reads on dark cards and the inverse Tooltip surface alike —
 * no `max-width` and no dark-mode invert flag needed.
 */
export function Prose({
  children,
  className,
  mode = "normal",
  components,
}: {
  children: string
  className?: string
  /** Reading-rhythm preset (default `normal`). */
  mode?: keyof typeof TYPESET_MODE
  /**
   * Optional react-markdown element overrides — runs *after* sanitize, so a
   * mapping can only narrow what the allowlist already passed (the campaign
   * chip-prose renderer maps fragment links to participant pills).
   */
  components?: Components
}) {
  return (
    <div className={cn("typeset", TYPESET_MODE[mode], className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeSanitize, defaultSchema]]}
        urlTransform={safeUrlTransform}
        components={components}
      >
        {children}
      </ReactMarkdown>
    </div>
  )
}
