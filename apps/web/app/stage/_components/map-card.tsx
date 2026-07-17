import Link from "next/link"

import type { MapRow } from "@/lib/db/schema/map"
import { stageMapPath } from "@/lib/paths"

/**
 * A Map in the My Maps list (UNN-460) — name + zone count, linking to its editor
 * (`/stage/maps/{shortId}`). Mirrors {@link import("@/app/campaigns/_components/campaign-card").CampaignCard}.
 */
export function MapCard({ map }: { map: MapRow }) {
  const zoneCount = Object.keys(map.geometry.zones).length

  return (
    <Link
      href={stageMapPath(map.shortId)}
      className="flex flex-col gap-1 border p-4 transition-colors hover:bg-muted/50"
    >
      <span className="font-medium">{map.name}</span>
      <span className="text-sm text-muted-foreground">
        {zoneCount === 1 ? "1 zone" : `${zoneCount} zones`}
      </span>
    </Link>
  )
}
