import Link from "next/link"

import { Badge } from "@workspace/ui/components/badge"

import { DUNGEON_STATUS_LABELS } from "@/domain/labels"
import type { DungeonSummary } from "@/lib/db/queries/load-dungeon"
import { dungeonConsolePath } from "@/lib/paths"

/** Status → badge styling. `active` stands out; `draft`/`done` are muted. */
const STATUS_VARIANT = {
  draft: "secondary",
  active: "default",
  done: "outline",
} as const

/**
 * The campaign's dungeons on the manage page (UNN-465) — each linking to its DM
 * console (`/campaigns/{c}/dungeon/{d}`, UNN-462) with a status badge. The create
 * affordance is the sibling {@link import("./create-dungeon-button").CreateDungeonButton};
 * this is the list. Mirrors {@link import("./encounter-list").EncounterList}.
 */
export function DungeonList({
  campaignShortId,
  dungeons,
}: {
  campaignShortId: string
  dungeons: DungeonSummary[]
}) {
  if (dungeons.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No dungeons yet. Create one to start building a delve.
      </p>
    )
  }

  return (
    <ul className="flex flex-col gap-2">
      {dungeons.map((dungeon) => (
        <li key={dungeon.id}>
          <Link
            href={dungeonConsolePath(campaignShortId, dungeon.shortId)}
            className="flex items-center justify-between gap-3 border p-3 transition-colors hover:bg-muted/50"
          >
            <span className="truncate font-medium">{dungeon.name}</span>
            <Badge variant={STATUS_VARIANT[dungeon.status]}>
              {DUNGEON_STATUS_LABELS[dungeon.status]}
            </Badge>
          </Link>
        </li>
      ))}
    </ul>
  )
}
