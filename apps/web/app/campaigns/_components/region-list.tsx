import Link from "next/link"

import type { RegionSummary } from "@/lib/db/queries/load-region"
import { campaignRegionPath } from "@/lib/paths"

/**
 * The campaign's Regions on the manage page (UNN-589) — each linking to its DM
 * detail page (`/campaigns/{c}/regions/{r}`) with the seed Map name as a muted
 * subtitle. The create affordance is the sibling
 * {@link import("./create-region-button").CreateRegionButton}; this is the list.
 * Mirrors {@link import("./dungeon-list").DungeonList}.
 */
export function RegionList({
  campaignShortId,
  regions,
}: {
  campaignShortId: string
  regions: RegionSummary[]
}) {
  if (regions.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No regions yet. Create one to run procedural expeditions from a seed
        map.
      </p>
    )
  }

  return (
    <ul className="flex flex-col gap-2">
      {regions.map((region) => (
        <li key={region.id}>
          <Link
            href={campaignRegionPath(campaignShortId, region.shortId)}
            className="flex items-center justify-between gap-3 border p-3 transition-colors hover:bg-muted/50"
          >
            <span className="truncate font-medium">{region.name}</span>
            <span className="shrink-0 truncate text-sm text-muted-foreground">
              {region.seedMapName}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}
