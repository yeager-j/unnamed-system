import { defaultSchema } from "hast-util-sanitize"
import ReactMarkdown from "react-markdown"
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
 * the output matches the surrounding compact card typography, and inverted
 * automatically under `dark:`. `max-w-none` is set because the parent card
 * already constrains width; the default `65ch` would clip inside narrow blocks.
 *
 * Pass `inverted` when rendering inside a surface whose color scheme is the
 * *inverse* of the page — chiefly the shadcn `Tooltip`, which sets
 * `bg-foreground text-background` in *both* light and dark modes. That can't
 * be reconciled with the default `dark:prose-invert` heuristic (which tracks
 * the page), so this mode binds every `--tw-prose-*` color slot directly to
 * the surface's text color (`--color-background`), letting Prose render
 * legibly in light *and* dark.
 */
export function Prose({
  children,
  className,
}: {
  children: string
  className?: string
  serif?: boolean
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
        "prose-invert [&_:not(pre)>code]:rounded-sm [&_:not(pre)>code]:bg-current/10 [&_:not(pre)>code]:px-1 [&_:not(pre)>code]:py-0.5",
        className
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeSanitize, defaultSchema]]}
        urlTransform={safeUrlTransform}
      >
        {children}
      </ReactMarkdown>
    </div>
  )
}

/**
 * Maps every color-bearing `--tw-prose-*` slot to the tooltip-side
 * `--color-background` (set by shadcn's `text-background`) so headings, body
 * copy, links, code, quotes, lists, and rules all read against the inverted
 * surface without color-on-color collisions.
 */
const INVERTED_PROSE_VARS = [
  "[--tw-prose-body:var(--color-background)]",
  "[--tw-prose-headings:var(--color-background)]",
  "[--tw-prose-lead:var(--color-background)]",
  "[--tw-prose-bold:var(--color-background)]",
  "[--tw-prose-links:var(--color-background)]",
  "[--tw-prose-code:var(--color-background)]",
  "[--tw-prose-pre-code:var(--color-background)]",
  "[--tw-prose-quotes:var(--color-background)]",
  "[--tw-prose-quote-borders:var(--color-background)]",
  "[--tw-prose-counters:var(--color-background)]",
  "[--tw-prose-bullets:var(--color-background)]",
  "[--tw-prose-hr:var(--color-background)]",
  "[--tw-prose-captions:var(--color-background)]",
  "[--tw-prose-th-borders:var(--color-background)]",
  "[--tw-prose-td-borders:var(--color-background)]",
].join(" ")
