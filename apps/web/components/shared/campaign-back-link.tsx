import { CaretLeftIcon } from "@phosphor-icons/react/dist/ssr"
import Link from "next/link"

/**
 * A subtle "← Campaign" back link to the encounter's campaign page
 * (`/campaigns/{shortId}`), shared by the DM console views and the player watch
 * view so every encounter surface can navigate back to its campaign. The
 * campaign page is role-conditional (DM manage / member overview / else 404),
 * so a signed-out watcher who follows it lands on that page's own gate.
 */
export function CampaignBackLink({
  campaignShortId,
}: {
  campaignShortId: string
}) {
  return (
    <Link
      href={`/campaigns/${campaignShortId}`}
      className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
    >
      <CaretLeftIcon weight="bold" className="size-4" />
      Campaign
    </Link>
  )
}
