import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { cn } from "@workspace/ui/lib/utils"

/**
 * Shared Markdown renderer for free-text content on the public sheet. Wraps
 * `react-markdown` with `remark-gfm` (tables / strikethrough / autolinks / task
 * lists) and the Tailwind Typography `prose` defaults — sized to `prose-sm` so
 * the output matches the surrounding compact card typography, and inverted
 * automatically under `dark:`. `max-w-none` is set because the parent card
 * already constrains width; the default `65ch` would clip inside narrow blocks.
 */
export function Prose({
  children,
  className,
}: {
  children: string
  className?: string
}) {
  return (
    <div
      className={cn("prose prose-sm max-w-none dark:prose-invert", className)}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  )
}
