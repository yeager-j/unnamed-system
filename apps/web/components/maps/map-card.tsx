import Link from "next/link"

import type { MapRow } from "@/lib/db/schema/map"

/**
 * A Map in the My Maps list (UNN-460) — name + zone count, linking to its editor
 * (`/maps/{shortId}`). Mirrors {@link import("@/components/campaign/campaign-card").CampaignCard}.
 */
export function MapCard({ map }: { map: MapRow }) {
  const zoneCount = Object.keys(map.geometry.zones).length

  return (
    <Link
      href={`/maps/${map.shortId}`}
      className="flex flex-col gap-1 border p-4 transition-colors hover:bg-muted/50"
    >
      <span className="font-medium">{map.name}</span>
      <span className="text-sm text-muted-foreground">
        {zoneCount === 1 ? "1 zone" : `${zoneCount} zones`}
      </span>
    </Link>
  )
}
