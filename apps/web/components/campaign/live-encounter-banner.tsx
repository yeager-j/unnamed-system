import { SwordIcon } from "@phosphor-icons/react/dist/ssr"
import Link from "next/link"

import { Button } from "@workspace/ui/components/button"

/**
 * The "Combat is live" banner on the campaign manage/overview page (UNN-329).
 * Surfaces the campaign's single live encounter (UNN-302) with a link that
 * depends on the viewer: the DM jumps to the console (`/combat/{shortId}`), a
 * player to the signed-out-visible watch view (`/c/encounter/{shortId}`, rendered
 * by UNN-334). This component only wires the navigation; it doesn't render combat.
 */
export function LiveEncounterBanner({
  encounterName,
  encounterShortId,
  audience,
}: {
  encounterName: string
  encounterShortId: string
  audience: "dm" | "player"
}) {
  const href =
    audience === "dm"
      ? `/combat/${encounterShortId}`
      : `/c/encounter/${encounterShortId}`
  const cta = audience === "dm" ? "Open console" : "Watch combat"

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border border-primary/30 bg-primary/5 p-4">
      <div className="flex items-center gap-2">
        <SwordIcon weight="fill" className="text-primary" />
        <span className="font-medium">Combat is live — {encounterName}</span>
      </div>
      <Button render={<Link href={href} />} nativeButton={false} size="sm">
        {cta}
      </Button>
    </div>
  )
}
