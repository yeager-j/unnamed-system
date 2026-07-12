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

/**
 * Shared Markdown renderer for free-text content on the public sheet. Wraps
 * `react-markdown` with `remark-gfm` (tables / strikethrough / autolinks / task
 * lists) and the Tailwind Typography `prose` defaults — sized to `prose-sm` so
 * the output matches the surrounding compact card typography, and `prose-invert`
 * for the dark-only theme. `max-w-none` is set because the parent card already
 * constrains width; the default `65ch` would clip inside narrow blocks.
 */
export function Prose({
  children,
  className,
  invert = true,
  components,
}: {
  children: string
  className?: string
  invert?: boolean
  /**
   * Optional react-markdown element overrides — runs *after* sanitize, so a
   * mapping can only narrow what the allowlist already passed (the campaign
   * chip-prose renderer maps fragment links to participant pills).
   */
  components?: Components
}) {
  return (
    <div
      className={cn(
        "prose prose-sm max-w-none",
        // Strip Tailwind Typography's default backtick decorations around
        // inline `<code>` elements (`code::before`/`code::after` set to "`")
        // and replace them with a chip-style highlight — a `currentColor`-
        // tinted background reads as proper inline code in light mode, dark
        // mode, and the inverse-scheme Tooltip surface alike. The mono-font
        // + weight Typography already applies completes the affordance.
        "[&_:not(pre)>code]:before:content-none [&_:not(pre)>code]:after:content-none",
        "[&_:not(pre)>code]:rounded-sm [&_:not(pre)>code]:bg-current/10 [&_:not(pre)>code]:px-1 [&_:not(pre)>code]:py-0.5",
        invert ? "prose-invert" : "",
        className
      )}
    >
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
