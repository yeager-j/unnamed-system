import { SwordIcon } from "@phosphor-icons/react/dist/ssr"
import Link from "next/link"

import { Alert, AlertAction, AlertTitle } from "@workspace/ui/components/alert"
import { Button } from "@workspace/ui/components/button"

import { encounterConsolePath, encounterWatchPath } from "@/lib/paths"

/**
 * The "Combat is live" banner on the campaign manage/overview page (UNN-329).
 * Surfaces the campaign's single live encounter (UNN-302) with a link that
 * depends on the viewer: the DM jumps to the console
 * (`/campaigns/{c}/encounter/{e}`), a player to the signed-out-visible watch view
 * (`/campaigns/{c}/encounter/{e}/watch`, rendered by UNN-334). This component only
 * wires the navigation; it doesn't render combat.
 */
export function LiveEncounterBanner({
  campaignShortId,
  encounterName,
  encounterShortId,
  audience,
}: {
  campaignShortId: string
  encounterName: string
  encounterShortId: string
  audience: "dm" | "player"
}) {
  const href =
    audience === "dm"
      ? encounterConsolePath(campaignShortId, encounterShortId)
      : encounterWatchPath(campaignShortId, encounterShortId)
  const cta = audience === "dm" ? "Open console" : "Watch combat"

  return (
    <Alert variant="primary">
      <SwordIcon />
      <AlertTitle>Combat is live — {encounterName}</AlertTitle>
      <AlertAction>
        <Button render={<Link href={href} />} nativeButton={false} size="sm">
          {cta}
        </Button>
      </AlertAction>
    </Alert>
  )
}
