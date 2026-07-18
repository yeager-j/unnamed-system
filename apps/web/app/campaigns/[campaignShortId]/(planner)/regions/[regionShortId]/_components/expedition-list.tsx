import Link from "next/link"

import { Badge } from "@workspace/ui/components/badge"

import { DUNGEON_STATUS_LABELS } from "@/domain/labels"
import type { ExpeditionSummary } from "@/lib/db/queries/load-region"
import { dungeonConsolePath, dungeonWatchPath } from "@/lib/paths"

/** Status → badge styling, shared with the campaign dungeons list: `active`
 *  stands out, `draft`/`done` are muted. */
const STATUS_VARIANT = {
  draft: "secondary",
  active: "default",
  done: "outline",
} as const

/**
 * A Region's expedition history on its detail page (UNN-589) — each run linking to
 * its DM console (`/campaigns/{c}/dungeon/{d}`) with a status badge and mint date.
 * The single `active` run also exposes a Watch shortcut to its live player view;
 * the stable, expedition-independent link is the sibling
 * {@link import("./region-watch-link").RegionWatchLink}. Mirrors the campaign
 * {@link import("@/app/campaigns/_components/dungeon-list").DungeonList}.
 */
export function ExpeditionList({
  campaignShortId,
  expeditions,
  activeShortId,
}: {
  campaignShortId: string
  expeditions: ExpeditionSummary[]
  activeShortId: string | null
}) {
  if (expeditions.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No expeditions yet. Start one to run this region.
      </p>
    )
  }

  return (
    <ul className="flex flex-col gap-2">
      {expeditions.map((expedition) => (
        <li
          key={expedition.id}
          className="flex items-center justify-between gap-3 border p-3"
        >
          <Link
            href={dungeonConsolePath(campaignShortId, expedition.shortId)}
            className="flex min-w-0 flex-1 items-center gap-3 transition-colors hover:text-foreground/80"
          >
            <span className="truncate font-medium">{expedition.name}</span>
            <span className="shrink-0 text-xs text-muted-foreground">
              {expedition.createdAt.toLocaleDateString(undefined, {
                year: "numeric",
                month: "short",
                day: "numeric",
              })}
            </span>
          </Link>
          <div className="flex shrink-0 items-center gap-2">
            {expedition.shortId === activeShortId ? (
              <Link
                href={dungeonWatchPath(campaignShortId, expedition.shortId)}
                className="text-sm text-muted-foreground underline-offset-4 hover:underline"
              >
                Watch
              </Link>
            ) : null}
            <Badge variant={STATUS_VARIANT[expedition.status]}>
              {DUNGEON_STATUS_LABELS[expedition.status]}
            </Badge>
          </div>
        </li>
      ))}
    </ul>
  )
}
