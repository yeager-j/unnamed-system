import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"

import { cn } from "@workspace/ui/lib/utils"

/**
 * Markdown renderer tuned for Skill `description` / `effect` strings inside
 * the dense SkillCard popover and equivalent surfaces (intrinsic weapon
 * attack card, future row variants).
 *
 * Wraps `react-markdown` with `remark-gfm` (strikethrough, autolinks, task
 * lists) and the Tailwind Typography `prose` defaults. Margins are stripped
 * (`prose-p:my-0`) and list spacing is tightened so the output sits flush
 * next to badges and stat grids without growing the popover.
 *
 * XSS-safe by construction: `react-markdown` does not render raw HTML
 * without an explicit `rehype-raw` plugin, so authored game-data strings —
 * and any future user-authored catalog entries — pass through as text only.
 */
export function SkillText({
  children,
  className,
}: {
  children: string
  className?: string
}) {
  return (
    <div
      className={cn(
        "prose prose-sm max-w-none text-sm leading-relaxed prose-invert dark:prose-invert prose-p:my-0 prose-p:leading-relaxed prose-code:rounded prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:before:content-none prose-code:after:content-none prose-ol:my-1 prose-ol:pl-5 prose-ul:my-1 prose-ul:pl-5 prose-li:my-0",
        className
      )}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  )
}
