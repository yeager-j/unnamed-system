import Link from "next/link"

import type { CampaignRow } from "@/lib/db/schema/campaign"

/**
 * A campaign in the My Campaigns lists (UNN-329) — name, optional description,
 * linking to its manage/overview page. Role-agnostic: the page groups these into
 * "Running" vs "Playing in"; the card itself just renders the row.
 */
export function CampaignCard({ campaign }: { campaign: CampaignRow }) {
  return (
    <Link
      href={`/campaigns/${campaign.shortId}`}
      className="flex flex-col gap-1 border p-4 transition-colors hover:bg-muted/50"
    >
      <span className="font-medium">{campaign.name}</span>
      {campaign.description ? (
        <span className="line-clamp-2 text-sm text-muted-foreground">
          {campaign.description}
        </span>
      ) : null}
    </Link>
  )
}
