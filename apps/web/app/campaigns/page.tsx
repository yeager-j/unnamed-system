import type { Metadata } from "next"

import { CampaignCard } from "@/components/campaign/campaign-card"
import { CreateCampaignButton } from "@/components/campaign/create-campaign-button"
import { SignedOutLanding } from "@/components/my-characters/signed-out-landing"
import { auth } from "@/lib/auth"
import {
  loadCampaignsByDmUserId,
  loadCampaignsForMember,
} from "@/lib/db/queries/load-campaign"

export const metadata: Metadata = {
  title: "My Campaigns — Showtime!",
}

/**
 * My Campaigns (UNN-329): the campaigns the signed-in viewer **runs** as DM
 * ("Running") and the ones they **play in** as a member ("Playing in"), kept in
 * separate sections, with a Create CTA. Replaces the thin DM-only `/campaigns`
 * entry from UNN-335. Signed-out viewers get the sign-in panel — campaigns are
 * not public (the read-only surface is the per-campaign overview at
 * `/campaigns/{shortId}` for members, and the watch view for live combat).
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

  const [running, playing] = await Promise.all([
    loadCampaignsByDmUserId(session.user.id),
    loadCampaignsForMember(session.user.id),
  ])

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-heading text-lg font-medium">My Campaigns</h1>
        <CreateCampaignButton />
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">Running</h2>
        {running.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            You don&apos;t run any campaigns yet. Create one to invite players.
          </p>
        ) : (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {running.map((campaign) => (
              <li key={campaign.id}>
                <CampaignCard campaign={campaign} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">
          Playing in
        </h2>
        {playing.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            You haven&apos;t joined any campaigns. Ask your DM for an invite
            link.
          </p>
        ) : (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {playing.map((campaign) => (
              <li key={campaign.id}>
                <CampaignCard campaign={campaign} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}
