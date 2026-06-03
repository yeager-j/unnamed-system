import type { Metadata } from "next"

import { NewEncounterButton } from "@/components/combat/new-encounter-button"
import { SignedOutLanding } from "@/components/my-characters/signed-out-landing"
import { auth } from "@/lib/auth"
import { loadCampaignsByDmUserId } from "@/lib/db/queries/load-campaign"

export const metadata: Metadata = {
  title: "Campaigns — Unnamed System",
}

/**
 * A deliberately thin entry for creating encounters (UNN-335): the campaigns the
 * signed-in viewer runs as DM, each with a "New encounter" button. It exists
 * only so the create → setup-shell → Start flow has a real, clickable entry
 * point before the full My Campaigns / manage page (UNN-329, Phase 6) lands and
 * replaces it.
 */
export default async function CampaignsPage() {
  const session = await auth()

  if (!session?.user?.id) {
    return (
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 p-6">
        <SignedOutLanding />
      </main>
    )
  }

  const campaigns = await loadCampaignsByDmUserId(session.user.id)

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-heading text-lg font-medium">Campaigns</h1>
      </header>

      {campaigns.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          You don&apos;t run any campaigns yet.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {campaigns.map((campaign) => (
            <li
              key={campaign.id}
              className="flex items-center justify-between gap-3 rounded-lg border p-4"
            >
              <span className="font-medium">{campaign.name}</span>
              <NewEncounterButton campaignId={campaign.id} />
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
