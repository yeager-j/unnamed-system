import type { ReactNode } from "react"

import { cn } from "@workspace/ui/lib/utils"

/**
 * A named slot in the encounter setup shell (UNN-335). The shell is the
 * real, load-bearing frame; each panel *body* is its own downstream ticket, so
 * these render as labelled dashed placeholders until their feature lands. The
 * `ticket` is shown so the slot's owner is legible at a glance.
 *
 * Slots:
 *  - Import PCs — UNN-298
 *  - Add enemies — UNN-299
 *  - Sides — UNN-300
 *  - Zones — UNN-301
 */
export function SetupPanelStub({
  title,
  ticket,
  children,
  className,
}: {
  title: string
  ticket: string
  children?: ReactNode
  className?: string
}) {
  return (
    <section
      className={cn(
        "flex flex-col gap-3 rounded-lg border border-dashed p-4",
        className
      )}
    >
      <header className="flex items-center justify-between gap-2">
        <h2 className="font-heading text-sm font-medium">{title}</h2>
        <span className="text-xs text-muted-foreground">{ticket}</span>
      </header>
      <p className="text-sm text-muted-foreground">
        Placeholder — built in {ticket}.
      </p>
      {children}
    </section>
  )
}
