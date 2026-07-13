import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { CharacterPlacementSection } from "@/app/campaigns/_components/character-placement-section"
import { CreateDungeonButton } from "@/app/campaigns/_components/create-dungeon-button"
import { CreateEncounterButton } from "@/app/campaigns/_components/create-encounter-button"
import { DeleteCampaignButton } from "@/app/campaigns/_components/delete-campaign-button"
import { DungeonList } from "@/app/campaigns/_components/dungeon-list"
import { EncounterList } from "@/app/campaigns/_components/encounter-list"
import { EncounterStatusListener } from "@/app/campaigns/_components/encounter-status-listener"
import { JoinLinkCard } from "@/app/campaigns/_components/join-link-card"
import { LiveDelveBanner } from "@/app/campaigns/_components/live-delve-banner"
import { LiveEncounterBanner } from "@/app/campaigns/_components/live-encounter-banner"
import { RosterList } from "@/app/campaigns/_components/roster-list"
import { activeEncounters } from "@/app/campaigns/[campaignShortId]/_components/active-encounters"
import { DayStructureCard } from "@/app/campaigns/[campaignShortId]/_components/planner/day-structure-card"
import { LineageGatingCard } from "@/app/campaigns/[campaignShortId]/_components/planner/lineage-gating-card"
import { loadCampaignRoster } from "@/lib/db/queries/load-campaign"
import { loadCampaignClock } from "@/lib/db/queries/load-campaign-clock"
import {
  loadActiveDungeonForCampaign,
  loadDungeonsForCampaign,
} from "@/lib/db/queries/load-dungeon"
import {
  loadEncountersForCampaign,
  loadLiveEncounterSummaryForCampaign,
} from "@/lib/db/queries/load-encounter"
import { loadMapsByUserId } from "@/lib/db/queries/load-map"

import { getCampaignForDM } from "../planner-access"

interface PageProps {
  params: Promise<{ campaignShortId: string }>
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { campaignShortId } = await params
  const campaign = await getCampaignForDM(campaignShortId)

  return {
    title: campaign
      ? `Manage · ${campaign.name} — Showtime!`
      : "Campaign not found — Showtime!",
  }
}

/**
 * Manage Campaign at `/campaigns/{shortId}/manage` — the DM manage surface
 * that used to be the campaign root (UNN-329), relocated by the planner
 * restructure (UNN-574 D10) and reachable from the rail's gear. DM-only:
 * members and strangers 404 identically via `getCampaignForDM`. Gains the
 * "Day structure" section — the clock's default-slots template (D1).
 */
export default async function ManageCampaignPage({ params }: PageProps) {
  const { campaignShortId } = await params
  const campaign = await getCampaignForDM(campaignShortId)
  if (!campaign) notFound()

  const [
    roster,
    encounters,
    liveEncounter,
    dungeons,
    activeDungeon,
    maps,
    clock,
  ] = await Promise.all([
    loadCampaignRoster(campaign.id),
    loadEncountersForCampaign(campaign.id),
    loadLiveEncounterSummaryForCampaign(campaign.id),
    loadDungeonsForCampaign(campaign.id),
    loadActiveDungeonForCampaign(campaign.id),
    loadMapsByUserId(campaign.dmUserId),
    loadCampaignClock(campaign.id),
  ])

  const pickableMaps = maps.map(({ shortId, name }) => ({ shortId, name }))

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 p-6">
      <EncounterStatusListener encounters={activeEncounters(encounters)} />
      <header className="flex flex-col gap-1">
        <h1 className="font-heading text-xl font-medium">
          Manage {campaign.name}
        </h1>
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

      <DayStructureCard
        campaignId={campaign.id}
        clock={
          clock
            ? {
                slotTemplate: clock.slotTemplate,
                clockVersion: clock.clockVersion,
              }
            : null
        }
      />

      <LineageGatingCard
        campaignId={campaign.id}
        lineageGating={campaign.lineageGating}
      />

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
        viewerId={campaign.dmUserId}
      />

      <DeleteCampaignButton
        campaignId={campaign.id}
        campaignName={campaign.name}
      />
    </main>
  )
}
