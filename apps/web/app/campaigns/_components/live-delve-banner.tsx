import { CompassIcon } from "@phosphor-icons/react/dist/ssr"
import Link from "next/link"

import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@workspace/ui/components/alert"
import { Button } from "@workspace/ui/components/button"

import { dungeonConsolePath, dungeonWatchPath } from "@/lib/paths"

/**
 * The "Exploration is live" banner on the campaign manage/overview page (UNN-465).
 * Surfaces the campaign's single active delve (UNN-465's one-active-delve rule)
 * with a link that depends on the viewer: the DM jumps to the run console
 * (`/campaigns/{c}/dungeon/{d}`), a player to the signed-out-visible fog view
 * (`/campaigns/{c}/dungeon/{d}/watch`, UNN-466). Mirrors {@link import("./live-encounter-banner").LiveEncounterBanner}.
 */
export function LiveDelveBanner({
  campaignShortId,
  dungeonName,
  dungeonShortId,
  audience,
}: {
  campaignShortId: string
  dungeonName: string
  dungeonShortId: string
  audience: "dm" | "player"
}) {
  const href =
    audience === "dm"
      ? dungeonConsolePath(campaignShortId, dungeonShortId)
      : dungeonWatchPath(campaignShortId, dungeonShortId)
  const cta = audience === "dm" ? "Open console" : "Join delve"

  return (
    <Alert variant="primary">
      <CompassIcon />
      <AlertTitle>Exploration is live</AlertTitle>
      <AlertDescription>
        Your party is currently exploring <strong>{dungeonName}</strong>.
      </AlertDescription>
      <AlertAction>
        <Button render={<Link href={href} />} nativeButton={false} size="sm">
          {cta}
        </Button>
      </AlertAction>
    </Alert>
  )
}
