"use client"

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { cn } from "@workspace/ui/lib/utils"

/**
 * Vertical offset (px) the story sections sit below the viewport top when a
 * jump or scroll-spy probe resolves them: the 56px `sticky` site header plus
 * breathing room. Shared with {@link ExploreTab}'s `scroll-mt` and scroll-spy
 * so a clicked section lands clear of the header.
 */
export const SHEET_STICKY_OFFSET = 72

export interface JumpNavItem {
  /** The id of the story `<section>` this link targets. */
  id: string
  label: string
  /** A trailing count (Knives / Chains); omitted for uncounted sections. */
  count?: number
}

/**
 * The Explore rail's "On this sheet" nav (UNN-172). Lists the story-column
 * sections with a smooth-scroll jump and highlights the one currently in view
 * (scroll-spy state is owned by {@link ExploreTab} and passed as `active`).
 * It mirrors the page's hash anchors — `href="#id"` keeps it a real link for
 * keyboard and middle-click — but intercepts the click to offset the scroll
 * past the sticky header. Pure presentational: no character reads here.
 */
export function JumpNav({
  items,
  active,
}: {
  items: readonly JumpNavItem[]
  active: string
}) {
  const jumpTo = (id: string) => (event: React.MouseEvent) => {
    const el = document.getElementById(id)
    if (!el) return
    event.preventDefault()
    const top =
      el.getBoundingClientRect().top + window.scrollY - SHEET_STICKY_OFFSET
    window.scrollTo({ top, behavior: "smooth" })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          On this sheet
        </CardTitle>
      </CardHeader>
      <CardContent>
        <nav className="flex flex-col">
          {items.map((item) => {
            const isActive = item.id === active
            return (
              <a
                key={item.id}
                href={`#${item.id}`}
                onClick={jumpTo(item.id)}
                aria-current={isActive ? "true" : undefined}
                className={cn(
                  "flex items-baseline justify-between gap-2 border-t border-border py-1.5 text-[13px] transition-colors first:border-t-0 hover:text-foreground",
                  isActive
                    ? "font-medium text-foreground"
                    : "text-muted-foreground"
                )}
              >
                <span className="relative">
                  {isActive ? (
                    <span aria-hidden className="absolute -left-3 text-primary">
                      ›
                    </span>
                  ) : null}
                  {item.label}
                </span>
                {item.count !== undefined ? (
                  <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
                    {item.count}
                  </span>
                ) : null}
              </a>
            )
          })}
        </nav>
      </CardContent>
    </Card>
  )
}
