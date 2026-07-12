import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { cache } from "react"

import {
  Sidebar,
  SidebarInset,
  SidebarProvider,
} from "@workspace/ui/components/sidebar"

import type { ComposerLastActivity } from "@/app/campaigns/[campaignShortId]/_components/composer/activity-composer"
import { MemberOverview } from "@/app/campaigns/[campaignShortId]/_components/member-overview"
import type { WorkspaceActivity } from "@/app/campaigns/[campaignShortId]/_components/planner/downtime-workspace"
import { FirstRunChecklist } from "@/app/campaigns/[campaignShortId]/_components/planner/first-run-checklist"
import { RosterPanel } from "@/app/campaigns/[campaignShortId]/_components/planner/roster-panel"
import { Runner } from "@/app/campaigns/[campaignShortId]/_components/planner/runner"
import { RunnerSelectionProvider } from "@/app/campaigns/[campaignShortId]/_components/planner/runner-selection"
import { extractChipRefs } from "@/domain/planner/chip"
import { dayProgress } from "@/domain/planner/day-progress"
import {
  foldResolvedParticipants,
  type ParticipantRef,
  type ResolvedParticipant,
} from "@/domain/planner/participant"
import { seasonOf } from "@/domain/planner/season"
import { buildLinkerOptions } from "@/domain/planner/view/linker"
import { buildRosterView } from "@/domain/planner/view/roster"
import { buildRunnerSlotViews } from "@/domain/planner/view/runner"
import { auth } from "@/lib/auth"
import { loadPlacedCharactersForCampaign } from "@/lib/db/queries/character-list"
import {
  isCampaignMember,
  loadCampaignByShortId,
} from "@/lib/db/queries/load-campaign"
import {
  loadSeasons,
  loadSlotsForDay,
} from "@/lib/db/queries/load-campaign-clock"
import { loadBeatsForSlots } from "@/lib/db/queries/load-campaign-notes"
import {
  loadActivitiesForSlots,
  loadLastActivityPerCharacter,
  type LoadedActivity,
} from "@/lib/db/queries/load-campaign-updates"
import {
  loadCampaignArticles,
  loadCampaignNpcs,
} from "@/lib/db/queries/load-campaign-world"
import { loadParticipantHits } from "@/lib/db/queries/load-participants"
import { loadRosterGlance } from "@/lib/db/queries/load-roster-glance"
import type { CampaignRow } from "@/lib/db/schema/campaign"

import { getCampaignClock, getCampaignForDM } from "./planner-access"

interface PageProps {
  params: Promise<{ campaignShortId: string }>
}

/** Per-request memoized campaign lookup so `generateMetadata` and the member
 *  branch share one read (the DM branch rides `getCampaignForDM`'s cache). */
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
 * The campaign root at `/campaigns/{shortId}` — **the one viewer fork**
 * (UNN-574 D10):
 *
 * - **DM** → the Day Runner (inside the planner shell the group layout
 *   mounted): the first-run checklist until the clock starts, then the
 *   day-running surface. The old manage content relocated to `manage/`,
 *   reachable from the rail's gear.
 * - **Member** → the same read-only overview as before the restructure.
 * - **Stranger** → `notFound()`, so the URL doesn't leak that the campaign
 *   exists (the shareable surface is the `/join/{token}` link).
 */
export default async function CampaignPage({ params }: PageProps) {
  const { campaignShortId } = await params

  const dmCampaign = await getCampaignForDM(campaignShortId)
  if (dmCampaign) return <DayRunnerRoot campaign={dmCampaign} />

  const campaign = await getCampaign(campaignShortId)
  if (!campaign) notFound()

  const session = await auth()
  const viewerId = session?.user?.id
  if (!viewerId) notFound()

  if (await isCampaignMember(campaign.id, viewerId)) {
    return <MemberOverview campaign={campaign} viewerId={viewerId} />
  }

  notFound()
}

/**
 * The DM's Day Runner: the one planner surface with its own sidebar — the
 * placed-characters roster, built by the page itself (the layout only
 * provides the rail). Pinned open by design: `collapsible="none"` renders it
 * in flow (sticky under the global header) with no trigger, no ⌘B, and no
 * mobile sheet — the planner is desktop-first; mobile comes later. The inset
 * card look is applied to the content explicitly, since the stock styling
 * only fires for the fixed `variant="inset"` sidebar. Body is the first-run
 * checklist until the clock starts, then the runner.
 */
async function DayRunnerRoot({ campaign }: { campaign: CampaignRow }) {
  const [clock, placedCharacters] = await Promise.all([
    getCampaignClock(campaign.id),
    loadPlacedCharactersForCampaign(campaign.id),
  ])
  const [slots, seasons] = clock
    ? await Promise.all([
        loadSlotsForDay(campaign.id, clock.currentDay),
        loadSeasons(campaign.id),
      ])
    : [[], []]
  const seasonLabel = clock ? seasonOf(seasons, clock.currentDay) : null
  const slotIds = slots.map((slot) => slot.id)

  const [beats, activities, lastByCharacter, glances, npcs, articles] =
    await Promise.all([
      loadBeatsForSlots(slotIds),
      loadActivitiesForSlots(campaign.id, slotIds),
      loadLastActivityPerCharacter(campaign.id),
      loadRosterGlance(placedCharacters.map((character) => character.id)),
      loadCampaignNpcs(campaign.id),
      loadCampaignArticles(campaign.id),
    ])

  // One campaign-scoped lookup covers every chip/concern label on the page:
  // the story cards' beat chips and the recorded entries' concern chips.
  const beatChipRefs = new Map(
    beats.map((beat) => [beat.id, extractChipRefs(beat.body)])
  )
  const allRefs: ParticipantRef[] = [
    ...[...beatChipRefs.values()].flat(),
    ...activities.flatMap((activity) => activity.concerns),
    ...[...lastByCharacter.values()].flatMap((activity) => activity.concerns),
  ]
  const hits = await loadParticipantHits(campaign.id, allRefs)
  const resolve = (refs: readonly ParticipantRef[]): ResolvedParticipant[] =>
    foldResolvedParticipants(refs, hits)
  const labeledConcerns = (activity: LoadedActivity) =>
    resolve(activity.concerns).map((participant) => ({
      ...participant.ref,
      label: participant.label,
    }))

  const beatsBySlot = new Map(
    beats
      .filter((beat) => beat.scheduledSlotId !== null)
      .map((beat) => [beat.scheduledSlotId!, beat])
  )
  const slotViews = buildRunnerSlotViews({
    slots,
    beatsBySlot,
    rosterSize: placedCharacters.length,
    recordedBySlot: countRecordedBySlot(activities),
  })

  const workspaceActivities: WorkspaceActivity[] = activities.map(
    (activity) => ({
      id: activity.id,
      slotId: activity.slotId,
      characterId: activity.characterId,
      body: activity.body,
      category: activity.category,
      concerns: labeledConcerns(activity),
    })
  )
  const lastActivityByCharacter: Record<string, ComposerLastActivity> = {}
  for (const [characterId, activity] of lastByCharacter) {
    if (activity.category === "idle" || activity.category === null) continue
    lastActivityByCharacter[characterId] = {
      body: activity.body,
      category: activity.category,
      concerns: labeledConcerns(activity),
    }
  }

  const downtimeSlotIds = slotViews
    .filter((slot) => slot.kind === "downtime")
    .map((slot) => slot.id)
  const recordedByCharacter = new Map<string, Set<string>>()
  for (const activity of activities) {
    const set = recordedByCharacter.get(activity.characterId) ?? new Set()
    set.add(activity.slotId)
    recordedByCharacter.set(activity.characterId, set)
  }
  const pipsByCharacter = Object.fromEntries(
    placedCharacters.map((character) => [
      character.id,
      downtimeSlotIds.map(
        (slotId) => recordedByCharacter.get(character.id)?.has(slotId) ?? false
      ),
    ])
  )

  const progress = clock
    ? dayProgress({
        slotIds,
        occupancy: { storyBeatSlotIds: new Set(beatsBySlot.keys()) },
        resolvedBeatSlotIds: new Set(
          [...beatsBySlot.entries()]
            .filter(([, beat]) => beat.resolvedAt !== null)
            .map(([slotId]) => slotId)
        ),
        rosterSize: placedCharacters.length,
        recordedBySlot: countRecordedBySlot(activities),
      })
    : null

  return (
    <RunnerSelectionProvider
      slots={slotViews.map(({ id, kind }) => ({ id, kind }))}
    >
      <SidebarProvider className="min-h-0 flex-1 bg-sidebar">
        <Sidebar
          collapsible="none"
          className="sticky top-14 h-[calc(100svh-3.5rem)] shrink-0"
        >
          <RosterPanel
            campaignName={campaign.name}
            dayLine={
              clock
                ? `Day ${clock.currentDay}${seasonLabel ? ` · ${seasonLabel}` : ""}`
                : null
            }
            roster={buildRosterView(placedCharacters)}
            pipsByCharacter={pipsByCharacter}
            progress={progress}
          />
        </Sidebar>
        <SidebarInset className="m-2 ml-0 min-w-0 rounded-xl shadow-sm">
          {clock ? (
            <Runner
              campaignId={campaign.id}
              campaignShortId={campaign.shortId}
              currentDay={clock.currentDay}
              clockVersion={clock.clockVersion}
              seasonLabel={seasonLabel}
              slots={slotViews}
              beatParticipants={Object.fromEntries(
                [...beatChipRefs.entries()].map(([beatId, refs]) => [
                  beatId,
                  resolve(refs),
                ])
              )}
              workspace={{
                roster: buildRosterView(placedCharacters),
                glances: Object.fromEntries(glances),
                activities: workspaceActivities,
                lastActivityByCharacter,
                linkerOptions: buildLinkerOptions({
                  npcs,
                  articles,
                  characters: placedCharacters,
                }),
              }}
            />
          ) : (
            <FirstRunChecklist campaignId={campaign.id} />
          )}
        </SidebarInset>
      </SidebarProvider>
    </RunnerSelectionProvider>
  )
}

/** Distinct recorded characters per slot (activities are unique per slot × character). */
function countRecordedBySlot(
  activities: readonly { slotId: string }[]
): Map<string, number> {
  const counts = new Map<string, number>()
  for (const activity of activities) {
    counts.set(activity.slotId, (counts.get(activity.slotId) ?? 0) + 1)
  }
  return counts
}
