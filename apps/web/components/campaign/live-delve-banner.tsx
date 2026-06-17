import { CompassIcon } from "@phosphor-icons/react/dist/ssr"
import Link from "next/link"

import { Button } from "@workspace/ui/components/button"

/**
 * The "Exploration is live" banner on the campaign manage page (UNN-465). Surfaces
 * the campaign's single active delve (UNN-465's one-active-delve rule) with a link
 * to the DM console (`/dungeon/{shortId}`). The player-facing fog view
 * (`/c/dungeon/{shortId}`) and its member-side banner land in M3, so this is
 * DM-only for now — mirroring {@link import("./live-encounter-banner").LiveEncounterBanner}.
 */
export function LiveDelveBanner({
  dungeonName,
  dungeonShortId,
}: {
  dungeonName: string
  dungeonShortId: string
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border border-primary/30 bg-primary/5 p-4">
      <div className="flex items-center gap-2">
        <CompassIcon weight="fill" className="text-primary" />
        <span className="font-medium">Exploration is live — {dungeonName}</span>
      </div>
      <Button
        render={<Link href={`/dungeon/${dungeonShortId}`} />}
        nativeButton={false}
        size="sm"
      >
        Open console
      </Button>
    </div>
  )
}
