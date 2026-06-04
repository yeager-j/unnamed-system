import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { cache } from "react"

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@workspace/ui/components/avatar"

import { CreateEncounterButton } from "@/components/campaign/create-encounter-button"
import { EncounterList } from "@/components/campaign/encounter-list"
import { JoinLinkCard } from "@/components/campaign/join-link-card"
import { LiveEncounterBanner } from "@/components/campaign/live-encounter-banner"
import { RosterList } from "@/components/campaign/roster-list"
import { auth } from "@/lib/auth"
import {
  isCampaignMember,
  loadCampaignByShortId,
  loadCampaignRoster,
} from "@/lib/db/queries/load-campaign"
import {
  loadEncountersForCampaign,
  loadLiveEncounterForCampaign,
} from "@/lib/db/queries/load-encounter"
import type { CampaignRow } from "@/lib/db/schema/campaign"
import { initials } from "@/lib/ui/initials"

interface PageProps {
  params: Promise<{ shortId: string }>
}

/** Per-request memoized campaign lookup so `generateMetadata` and the page share
 *  one read. */
const getCampaign = cache(
  async (shortId: string): Promise<CampaignRow | null> =>
    loadCampaignByShortId(shortId)
)

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { shortId } = await params
  const campaign = await getCampaign(shortId)

  return {
    title: campaign
      ? `${campaign.name} — Unnamed System`
      : "Campaign not found — Unnamed System",
  }
}

/**
 * The campaign manage/overview page at `/campaigns/{shortId}` (UNN-329), rendered
 * role-conditionally:
 *
 * - **DM** (`viewer === campaign.dmUserId`): the full manage surface — invite
 *   link (copy/regenerate), roster (with remove), encounters (with create), and a
 *   live-combat banner.
 * - **Member**: a read-only overview — name, members, and a watch link if combat
 *   is live. No invite link, no controls.
 * - **Neither**: `notFound()`, so a stranger with the URL can't tell the campaign
 *   exists (the shareable surface is the `/join/{token}` link, not this page).
 */
export default async function CampaignPage({ params }: PageProps) {
  const { shortId } = await params
  const campaign = await getCampaign(shortId)
  if (!campaign) notFound()

  const session = await auth()
  const viewerId = session?.user?.id

  if (viewerId === campaign.dmUserId) {
    return <DmManageView campaign={campaign} />
  }

  if (viewerId && (await isCampaignMember(campaign.id, viewerId))) {
    return <MemberOverview campaign={campaign} />
  }

  notFound()
}

async function DmManageView({ campaign }: { campaign: CampaignRow }) {
  const [roster, encounters, liveEncounter] = await Promise.all([
    loadCampaignRoster(campaign.id),
    loadEncountersForCampaign(campaign.id),
    loadLiveEncounterForCampaign(campaign.id),
  ])

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 p-6">
      <header className="flex flex-col gap-1">
        <h1 className="font-heading text-xl font-medium">{campaign.name}</h1>
        {campaign.description ? (
          <p className="text-sm text-muted-foreground">
            {campaign.description}
          </p>
        ) : null}
      </header>

      {liveEncounter ? (
        <LiveEncounterBanner
          encounterName={liveEncounter.name}
          encounterShortId={liveEncounter.shortId}
          audience="dm"
        />
      ) : null}

      <JoinLinkCard campaignId={campaign.id} joinToken={campaign.joinToken} />

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">Players</h2>
        <RosterList campaignId={campaign.id} roster={roster} />
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-medium text-muted-foreground">
            Encounters
          </h2>
          <CreateEncounterButton campaignId={campaign.id} />
        </div>
        <EncounterList encounters={encounters} />
      </section>
    </main>
  )
}

async function MemberOverview({ campaign }: { campaign: CampaignRow }) {
  const [roster, liveEncounter] = await Promise.all([
    loadCampaignRoster(campaign.id),
    loadLiveEncounterForCampaign(campaign.id),
  ])

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 p-6">
      <header className="flex flex-col gap-1">
        <h1 className="font-heading text-xl font-medium">{campaign.name}</h1>
        {campaign.description ? (
          <p className="text-sm text-muted-foreground">
            {campaign.description}
          </p>
        ) : null}
      </header>

      {liveEncounter ? (
        <LiveEncounterBanner
          encounterName={liveEncounter.name}
          encounterShortId={liveEncounter.shortId}
          audience="player"
        />
      ) : null}

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">Players</h2>
        <ul className="flex flex-col gap-2">
          {roster.map(({ member }) => {
            const displayName = member.name ?? member.email
            return (
              <li key={member.id} className="flex items-center gap-3">
                <Avatar className="size-8">
                  {member.image ? (
                    <AvatarImage src={member.image} alt="" />
                  ) : null}
                  <AvatarFallback>{initials(displayName)}</AvatarFallback>
                </Avatar>
                <span className="truncate">{displayName}</span>
              </li>
            )
          })}
        </ul>
      </section>
    </main>
  )
}
