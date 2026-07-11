import Link from "next/link"

import { Badge } from "@workspace/ui/components/badge"

import { ENCOUNTER_STATUS_LABELS } from "@/domain/labels"
import type { EncounterSummary } from "@/lib/db/queries/load-encounter"
import { encounterConsolePath } from "@/lib/paths"

/** Status → badge styling. `live` stands out; `draft`/`ended` are muted. */
const STATUS_VARIANT = {
  draft: "secondary",
  live: "default",
  ended: "outline",
} as const

/**
 * The campaign's encounters on the manage page (UNN-329) — each linking to its DM
 * console (`/campaigns/{c}/encounter/{e}`, UNN-335) with a status badge. The create
 * affordance is the sibling {@link CreateEncounterButton}; this is the list.
 */
export function EncounterList({
  campaignShortId,
  encounters,
}: {
  campaignShortId: string
  encounters: EncounterSummary[]
}) {
  if (encounters.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No encounters yet. Create one to start setting up combat.
      </p>
    )
  }

  return (
    <ul className="flex flex-col gap-2">
      {encounters.map((encounter) => (
        <li key={encounter.id}>
          <Link
            href={encounterConsolePath(campaignShortId, encounter.shortId)}
            className="flex items-center justify-between gap-3 border p-3 transition-colors hover:bg-muted/50"
          >
            <span className="truncate font-medium">{encounter.name}</span>
            <Badge variant={STATUS_VARIANT[encounter.status]}>
              {ENCOUNTER_STATUS_LABELS[encounter.status]}
            </Badge>
          </Link>
        </li>
      ))}
    </ul>
  )
}
