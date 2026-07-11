import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { cache } from "react"

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@workspace/ui/components/avatar"

import { CharacterPlacementSection } from "@/app/campaigns/_components/character-placement-section"
import { CreateDungeonButton } from "@/app/campaigns/_components/create-dungeon-button"
import { CreateEncounterButton } from "@/app/campaigns/_components/create-encounter-button"
import { DeleteCampaignButton } from "@/app/campaigns/_components/delete-campaign-button"
import { DungeonList } from "@/app/campaigns/_components/dungeon-list"
import { EncounterList } from "@/app/campaigns/_components/encounter-list"
import { EncounterStatusListener } from "@/app/campaigns/_components/encounter-status-listener"
import { JoinLinkCard } from "@/app/campaigns/_components/join-link-card"
import { LeaveCampaignButton } from "@/app/campaigns/_components/leave-campaign-button"
import { LiveDelveBanner } from "@/app/campaigns/_components/live-delve-banner"
import { LiveEncounterBanner } from "@/app/campaigns/_components/live-encounter-banner"
import { RosterList } from "@/app/campaigns/_components/roster-list"
import { auth } from "@/lib/auth"
import {
  isCampaignMember,
  loadCampaignByShortId,
  loadCampaignRoster,
} from "@/lib/db/queries/load-campaign"
import {
  loadActiveDungeonForCampaign,
  loadDungeonsForCampaign,
} from "@/lib/db/queries/load-dungeon"
import {
  loadEncountersForCampaign,
  loadLiveEncounterSummaryForCampaign,
  type EncounterSummary,
} from "@/lib/db/queries/load-encounter"
import { loadMapsByUserId } from "@/lib/db/queries/load-map"
import type { CampaignRow } from "@/lib/db/schema/campaign"
import { initials } from "@/lib/ui/initials"

interface PageProps {
  params: Promise<{ campaignShortId: string }>
}

/**
 * The live-banner listener's subscribe set: every **non-ended** encounter,
 * drafts included — a draft going live is exactly the transition the banner
 * must hear without a reload (UNN-373).
 */
function activeEncounters(encounters: EncounterSummary[]) {
  return encounters
    .filter((encounter) => encounter.status !== "ended")
    .map(({ shortId, status }) => ({ shortId, status }))
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
  const { campaignShortId } = await params
  const campaign = await getCampaign(campaignShortId)

  return {
    title: campaign
      ? `${campaign.name} — Showtime!`
      : "Campaign not found — Showtime!",
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
  const { campaignShortId } = await params
  const campaign = await getCampaign(campaignShortId)
  if (!campaign) notFound()

  const session = await auth()
  const viewerId = session?.user?.id
  if (!viewerId) notFound()

  if (viewerId === campaign.dmUserId) {
    return <DmManageView campaign={campaign} viewerId={viewerId} />
  }

  if (await isCampaignMember(campaign.id, viewerId)) {
    return <MemberOverview campaign={campaign} viewerId={viewerId} />
  }

  notFound()
}

async function DmManageView({
  campaign,
  viewerId,
}: {
  campaign: CampaignRow
  viewerId: string
}) {
  const [roster, encounters, liveEncounter, dungeons, activeDungeon, maps] =
    await Promise.all([
      loadCampaignRoster(campaign.id),
      loadEncountersForCampaign(campaign.id),
      loadLiveEncounterSummaryForCampaign(campaign.id),
      loadDungeonsForCampaign(campaign.id),
      loadActiveDungeonForCampaign(campaign.id),
      loadMapsByUserId(viewerId),
    ])

  const pickableMaps = maps.map(({ shortId, name }) => ({ shortId, name }))

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 p-6">
      <EncounterStatusListener encounters={activeEncounters(encounters)} />
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
          campaignShortId={campaign.shortId}
          encounterName={liveEncounter.name}
          encounterShortId={liveEncounter.shortId}
          audience="dm"
        />
      ) : null}

      {activeDungeon ? (
        <LiveDelveBanner
          campaignShortId={campaign.shortId}
          dungeonName={activeDungeon.name}
          dungeonShortId={activeDungeon.shortId}
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
          <CreateEncounterButton
            campaignId={campaign.id}
            campaignShortId={campaign.shortId}
          />
        </div>
        <EncounterList
          campaignShortId={campaign.shortId}
          encounters={encounters}
        />
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-medium text-muted-foreground">
            Dungeons
          </h2>
          <CreateDungeonButton
            campaignId={campaign.id}
            campaignShortId={campaign.shortId}
            maps={pickableMaps}
          />
        </div>
        <DungeonList campaignShortId={campaign.shortId} dungeons={dungeons} />
      </section>

      <CharacterPlacementSection
        campaignId={campaign.id}
        campaignName={campaign.name}
        viewerId={viewerId}
      />

      <DeleteCampaignButton
        campaignId={campaign.id}
        campaignName={campaign.name}
      />
    </main>
  )
}

async function MemberOverview({
  campaign,
  viewerId,
}: {
  campaign: CampaignRow
  viewerId: string
}) {
  const [roster, encounters, liveEncounter, activeDungeon] = await Promise.all([
    loadCampaignRoster(campaign.id),
    loadEncountersForCampaign(campaign.id),
    loadLiveEncounterSummaryForCampaign(campaign.id),
    loadActiveDungeonForCampaign(campaign.id),
  ])

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 p-6">
      <EncounterStatusListener encounters={activeEncounters(encounters)} />
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
          campaignShortId={campaign.shortId}
          encounterName={liveEncounter.name}
          encounterShortId={liveEncounter.shortId}
          audience="player"
        />
      ) : null}

      {activeDungeon ? (
        <LiveDelveBanner
          campaignShortId={campaign.shortId}
          dungeonName={activeDungeon.name}
          dungeonShortId={activeDungeon.shortId}
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

      <CharacterPlacementSection
        campaignId={campaign.id}
        campaignName={campaign.name}
        viewerId={viewerId}
      />

      <LeaveCampaignButton
        campaignId={campaign.id}
        campaignName={campaign.name}
      />
    </main>
  )
}
