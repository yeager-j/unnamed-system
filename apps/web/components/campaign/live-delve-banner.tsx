import { CompassIcon } from "@phosphor-icons/react/dist/ssr"
import Link from "next/link"

import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@workspace/ui/components/alert"
import { Button } from "@workspace/ui/components/button"

/**
 * The "Exploration is live" banner on the campaign manage/overview page (UNN-465).
 * Surfaces the campaign's single active delve (UNN-465's one-active-delve rule)
 * with a link that depends on the viewer: the DM jumps to the run console
 * (`/dungeon/{shortId}`), a player to the signed-out-visible fog view
 * (`/c/dungeon/{shortId}`, UNN-466). Mirrors {@link import("./live-encounter-banner").LiveEncounterBanner}.
 */
export function LiveDelveBanner({
  dungeonName,
  dungeonShortId,
  audience,
}: {
  dungeonName: string
  dungeonShortId: string
  audience: "dm" | "player"
}) {
  const href =
    audience === "dm"
      ? `/dungeon/${dungeonShortId}`
      : `/c/dungeon/${dungeonShortId}`
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

  // return (
  //   <div className="flex flex-wrap items-center justify-between gap-3 border border-primary/30 bg-primary/5 p-4">
  //     <div className="flex items-center gap-2">
  //       <CompassIcon weight="fill" className="text-primary" />
  //       <span className="font-medium">Exploration is live — {dungeonName}</span>
  //     </div>
  //     <Button render={<Link href={href} />} nativeButton={false} size="sm">
  //       {cta}
  //     </Button>
  //   </div>
  // )
}
