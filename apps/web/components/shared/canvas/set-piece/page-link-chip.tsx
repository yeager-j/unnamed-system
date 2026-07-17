"use client"

import { ArrowBendUpRightIcon } from "@phosphor-icons/react/dist/ssr"

import { cn } from "@workspace/ui/lib/utils"

/**
 * The chip's own structural view of a cross-page link — deliberately *not* the
 * engine's `CrossPageLink` (components/** is hard-gated from engine imports);
 * the engine shape satisfies this by structure wherever the canvas passes it in.
 */
export interface PageLinkView {
  connectionId: string
  zoneId: string
  farZoneId: string
  farZoneName: string
  farPageId: string
  farPageName: string
  /** The connection's authored flags — present on DM-side links (the editor's
   *  chip menu reads them); the watch's links omit them. */
  hidden?: boolean
  locked?: boolean
}

/** The chip's shell classes — shared with the editor's dropdown-trigger variant
 *  so both render identically. */
export const pageLinkChipClass =
  "nodrag inline-flex max-w-full items-center gap-1 rounded-full border bg-background/80 px-2 py-0.5 text-xs text-muted-foreground shadow-sm transition-colors hover:border-ring hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"

/** The chip's inner content (icon · far zone · far page · count badge). */
export function PageLinkChipLabel({
  link,
  count,
}: {
  link: PageLinkView
  count?: number
}) {
  return (
    <>
      <ArrowBendUpRightIcon className="size-3 shrink-0" aria-hidden />
      <span className="truncate">
        {link.farZoneName}
        <span className="text-muted-foreground/70"> · {link.farPageName}</span>
      </span>
      {count !== undefined && count > 0 ? (
        <span className="ml-0.5 rounded-full bg-primary/10 px-1.5 font-medium text-foreground tabular-nums">
          {count}
        </span>
      ) : null}
    </>
  )
}

/**
 * The "leads to ⇢" chip (UNN-586, D3) — a cross-page connection's presence on its
 * on-page endpoint. Cross-page connections draw no edge (two pages are two
 * coordinate spaces), so the chip *is* the connection: clicking it navigates to
 * the far page and focuses the linked Zone — the same affordance the console and
 * watch use to follow a portal. `count` (optional) badges live combatants/
 * occupants standing in the far Zone, so a split fight stays loud (combat WP6).
 *
 * Presentation-only: the host supplies the navigate callback; the chip never
 * touches geometry. `stopPropagation` keeps React Flow's node selection from
 * swallowing the click.
 */
export function PageLinkChip({
  link,
  count,
  onNavigate,
  className,
}: {
  link: PageLinkView
  count?: number
  onNavigate: (pageId: string, focusZoneId: string) => void
  className?: string
}) {
  return (
    <button
      type="button"
      aria-label={`Leads to ${link.farZoneName} on ${link.farPageName}`}
      onClick={(event) => {
        event.stopPropagation()
        onNavigate(link.farPageId, link.farZoneId)
      }}
      className={cn(pageLinkChipClass, className)}
    >
      <PageLinkChipLabel link={link} count={count} />
    </button>
  )
}

/** The chip row a zone card's `pageLinks` slot renders — one chip per cross-page
 *  link, wrapping under the card's content. */
export function PageLinkChips({
  links,
  counts,
  onNavigate,
}: {
  links: PageLinkView[]
  /** Optional far-zone occupant/combatant counts keyed by far zone id. */
  counts?: Record<string, number>
  onNavigate: (pageId: string, focusZoneId: string) => void
}) {
  if (links.length === 0) return null
  return (
    <ul className="flex flex-wrap gap-1">
      {links.map((link) => (
        <li key={`${link.connectionId}:${link.zoneId}`} className="min-w-0">
          <PageLinkChip
            link={link}
            count={counts?.[link.farZoneId]}
            onNavigate={onNavigate}
          />
        </li>
      ))}
    </ul>
  )
}
