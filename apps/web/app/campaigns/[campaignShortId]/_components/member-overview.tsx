import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@workspace/ui/components/avatar"
import { initials } from "@workspace/ui/lib/initials"

import { CharacterPlacementSection } from "@/app/campaigns/_components/character-placement-section"
import { EncounterStatusListener } from "@/app/campaigns/_components/encounter-status-listener"
import { LeaveCampaignButton } from "@/app/campaigns/_components/leave-campaign-button"
import { LiveDelveBanner } from "@/app/campaigns/_components/live-delve-banner"
import { LiveEncounterBanner } from "@/app/campaigns/_components/live-encounter-banner"
import { loadCampaignRoster } from "@/lib/db/queries/load-campaign"
import { loadActiveDungeonForCampaign } from "@/lib/db/queries/load-dungeon"
import {
  loadEncountersForCampaign,
  loadLiveEncounterSummaryForCampaign,
} from "@/lib/db/queries/load-encounter"
import type { CampaignRow } from "@/lib/db/schema/campaign"

import { activeEncounters } from "./active-encounters"

/**
 * The campaign page as a **member** sees it (UNN-329): a read-only overview —
 * name, players, live-combat/delve links, their own placement, and leave. The
 * planner restructure (UNN-574) left this untouched: the root URL forks per
 * viewer, and members keep exactly this view while the DM's side became the
 * Day Runner.
 */
export async function MemberOverview({
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
