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
import type { BondConfirmEntry } from "@/app/campaigns/[campaignShortId]/_components/planner/bond-confirm"
import { HiddenInMode } from "@/app/campaigns/[campaignShortId]/_components/planner/capture-mode-gate"
import type { WorkspaceActivity } from "@/app/campaigns/[campaignShortId]/_components/planner/downtime-workspace"
import { FirstRunChecklist } from "@/app/campaigns/[campaignShortId]/_components/planner/first-run-checklist"
import { RosterPanel } from "@/app/campaigns/[campaignShortId]/_components/planner/roster-panel"
import type {
  RunnableDungeon,
  ShelfBeat,
} from "@/app/campaigns/[campaignShortId]/_components/planner/run-menus"
import { Runner } from "@/app/campaigns/[campaignShortId]/_components/planner/runner"
import { RunnerSelectionProvider } from "@/app/campaigns/[campaignShortId]/_components/planner/runner-selection"
import type { UnAdvanceUnbind } from "@/app/campaigns/[campaignShortId]/_components/planner/un-advance-confirm"
import { bondEligibility } from "@/domain/planner/bond"
import { extractChipRefs, stripChipTokens } from "@/domain/planner/chip"
import { isFrozenDay } from "@/domain/planner/clock"
import { dayEndReadiness } from "@/domain/planner/day-end"
import { dayProgress, type DaySlotFacts } from "@/domain/planner/day-progress"
import {
  foldResolvedParticipants,
  type ParticipantRef,
  type ResolvedParticipant,
} from "@/domain/planner/participant"
import { seasonOf } from "@/domain/planner/season"
import {
  buildDayEndPreSuggests,
  type DayEndDeadlineAlert,
} from "@/domain/planner/view/day-end"
import { buildLinkerOptions } from "@/domain/planner/view/linker"
import { buildRosterView } from "@/domain/planner/view/roster"
import { buildRunnerSlotViews } from "@/domain/planner/view/runner"
import {
  buildTimelineDayViews,
  type TimelineUpdateInput,
} from "@/domain/planner/view/timeline"
import { auth } from "@/lib/auth"
import { loadPlacedCharactersForCampaign } from "@/lib/db/queries/character-list"
import {
  isCampaignMember,
  loadCampaignByShortId,
} from "@/lib/db/queries/load-campaign"
import {
  loadClaimsForSlots,
  loadSeasons,
  loadSlotsForDay,
} from "@/lib/db/queries/load-campaign-clock"
import {
  loadBeatsForSlots,
  loadFloatingBeats,
} from "@/lib/db/queries/load-campaign-notes"
import {
  loadActivitiesForSlots,
  loadBondActivityTuples,
  loadLastActivityPerCharacter,
  loadResolvedMarkers,
  loadWorldUpdatesForDay,
  type LoadedActivity,
} from "@/lib/db/queries/load-campaign-updates"
import {
  loadCampaignArticles,
  loadCampaignNpcs,
  loadDatedArticles,
} from "@/lib/db/queries/load-campaign-world"
import { loadDungeonsForCampaign } from "@/lib/db/queries/load-dungeon"
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

  const [
    beats,
    claims,
    floatingBeats,
    dungeons,
    activities,
    lastByCharacter,
    glances,
    npcs,
    articles,
    datedArticles,
    markers,
    worldToday,
  ] = await Promise.all([
    loadBeatsForSlots(slotIds),
    loadClaimsForSlots(slotIds),
    loadFloatingBeats(campaign.id),
    loadDungeonsForCampaign(campaign.id),
    loadActivitiesForSlots(campaign.id, slotIds),
    loadLastActivityPerCharacter(campaign.id),
    loadRosterGlance(placedCharacters.map((character) => character.id)),
    loadCampaignNpcs(campaign.id),
    loadCampaignArticles(campaign.id),
    loadDatedArticles(campaign.id),
    loadResolvedMarkers(campaign.id),
    clock
      ? loadWorldUpdatesForDay(campaign.id, clock.currentDay)
      : Promise.resolve([]),
  ])

  // The bond confirms (UNN-581, D8): derived progress — distinct PC-days of
  // Collaborator activity concerning each Lineage-holding NPC since its tier
  // last changed — folded to the eligible set both confirm surfaces render.
  // Independent of the Atlas-gating toggle: the bond is narrative state.
  const gateNpcs = npcs.filter((npc) => npc.lineageKey !== null)
  const bondTuples = await loadBondActivityTuples(
    campaign.id,
    gateNpcs.map((npc) => npc.entityId)
  )
  const npcNameById = new Map(
    gateNpcs.map((npc) => [npc.entityId, npc.entity.name])
  )
  const bondConfirms: BondConfirmEntry[] = bondEligibility(gateNpcs, bondTuples)
    .filter((eligibility) => eligibility.eligible)
    .map((eligibility) => ({
      npcId: eligibility.npcId,
      name: npcNameById.get(eligibility.npcId) ?? "an NPC",
      currentTier: eligibility.currentTier,
      nextTier: eligibility.nextTier,
    }))

  // The advance gate's advisory pre-warn (D1/D5): the unresolved deadlines,
  // handed to the runner so End-the-day and Skip can name their blockers
  // before the server's in-transaction check refuses for real.
  const resolvedArticleIds = new Set(markers.map((marker) => marker.articleId))
  const unresolvedDatedArticles = datedArticles.filter(
    (article) =>
      article.datedKind === "deadline" && !resolvedArticleIds.has(article.id)
  )
  const unresolvedDeadlines = unresolvedDatedArticles.map((article) => ({
    id: article.id,
    name: article.name,
    datedDay: article.datedDay!,
  }))

  // One campaign-scoped lookup covers every chip/concern label on the page:
  // the story cards' beat chips, the recorded entries' concern chips, and
  // the Day-End feed's primaries, concerns, and ⚑ anchors.
  const beatChipRefs = new Map(
    beats.map((beat) => [beat.id, extractChipRefs(beat.body)])
  )
  const allRefs: ParticipantRef[] = [
    ...[...beatChipRefs.values()].flat(),
    ...activities.flatMap((activity) => activity.concerns),
    ...[...lastByCharacter.values()].flatMap((activity) => activity.concerns),
    ...activities.map(
      (activity): ParticipantRef => ({
        kind: "character",
        id: activity.characterId,
      })
    ),
    ...worldToday.flatMap((update): ParticipantRef[] => [
      ...(update.primary ? [update.primary] : []),
      ...update.concerns,
      ...(update.resolvesArticleId
        ? [{ kind: "article" as const, id: update.resolvesArticleId }]
        : []),
    ]),
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
  const claimsBySlot = new Map(claims.map((claim) => [claim.slotId, claim]))
  const slotViews = buildRunnerSlotViews({
    slots,
    beatsBySlot,
    claimsBySlot,
    rosterSize: placedCharacters.length,
    recordedBySlot: countRecordedBySlot(activities),
  })

  // The prepped shelf: the return affordance renders only while the origin
  // slot is open (beat-free + claim-free) and its day not past (D1).
  const shelf: ShelfBeat[] = floatingBeats.map((beat) => ({
    id: beat.id,
    title: beat.title,
    returnTo:
      clock !== null &&
      beat.deferredFrom !== null &&
      !beat.deferredFrom.occupied &&
      !isFrozenDay(beat.deferredFrom.day, clock.currentDay)
        ? {
            slotId: beat.deferredFrom.slotId,
            day: beat.deferredFrom.day,
            label: beat.deferredFrom.label,
          }
        : null,
  }))
  const runnableDungeons: RunnableDungeon[] = dungeons.map((dungeon) => ({
    id: dungeon.id,
    name: dungeon.name,
  }))

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

  const dayFacts: DaySlotFacts = {
    slotIds,
    occupancy: {
      storyBeatSlotIds: new Set(beatsBySlot.keys()),
      dungeonClaimSlotIds: new Set(claimsBySlot.keys()),
    },
    resolvedSlotIds: new Set([
      ...[...beatsBySlot.entries()]
        .filter(([, beat]) => beat.resolvedAt !== null)
        .map(([slotId]) => slotId),
      ...claims
        .filter((claim) => claim.resolvedAt !== null)
        .map((claim) => claim.slotId),
    ]),
    rosterSize: placedCharacters.length,
    recordedBySlot: countRecordedBySlot(activities),
  }
  const progress = clock ? dayProgress(dayFacts) : null
  const readiness = dayEndReadiness(dayFacts)

  // Day-End Capture (UNN-580): today's feed interleaves the slotted
  // activities with the day's world updates in authored order — one day
  // group through the shared timeline shaping.
  const loggedTodayInputs: (TimelineUpdateInput & { authoredAt: Date })[] =
    clock === null
      ? []
      : [
          ...activities.map((activity) => ({
            id: activity.id,
            day: clock.currentDay,
            body: activity.body,
            category: activity.category,
            primary: {
              kind: "character" as const,
              id: activity.characterId,
            },
            concerns: activity.concerns,
            isWorld: false,
            resolvesArticleId: null,
            authoredAt: activity.authoredAt,
          })),
          ...worldToday.map((update) => ({
            id: update.id,
            day: clock.currentDay,
            body: update.body,
            category: update.category,
            primary: update.primary,
            concerns: update.concerns,
            isWorld: true,
            resolvesArticleId: update.resolvesArticleId,
            authoredAt: update.authoredAt,
          })),
        ].sort((a, b) => a.authoredAt.getTime() - b.authoredAt.getTime())

  const preSuggests = buildDayEndPreSuggests({
    resolvedBeats: beats
      .filter((beat) => beat.resolvedAt !== null)
      .map((beat) => ({
        id: beat.id,
        title: beat.title,
        tagline: beat.tagline,
        chips: resolve(beatChipRefs.get(beat.id) ?? []),
      })),
    resolvedDelves: claims
      .filter((claim) => claim.resolvedAt !== null)
      .map((claim) => ({ slotId: claim.slotId, dungeonName: claim.name })),
    liveDeadlines: unresolvedDeadlines.map((deadline) => ({
      articleId: deadline.id,
      name: deadline.name,
    })),
  })

  const deadlineAlerts: DayEndDeadlineAlert[] =
    clock === null
      ? []
      : unresolvedDatedArticles.map((article) => {
          const excerpt = stripChipTokens(article.body).trim()
          return {
            articleId: article.id,
            name: article.name,
            state:
              article.datedDay! <= clock.currentDay
                ? ("due" as const)
                : ("looming" as const),
            daysLeft: article.datedDay! - clock.currentDay,
            excerpt: excerpt === "" ? null : excerpt.slice(0, 180),
          }
        })

  // The un-advance confirm's enumeration (advisory; the server's scoped
  // unbind stays authoritative): the current day's ⚑ markers, named.
  const articleNameById = new Map(
    articles.map((article) => [article.id, article.name])
  )
  const unAdvanceUnbinds: UnAdvanceUnbind[] =
    clock === null
      ? []
      : markers
          .filter((marker) => marker.day === clock.currentDay)
          .map((marker) => ({
            articleId: marker.articleId,
            name: articleNameById.get(marker.articleId) ?? "a deleted deadline",
          }))

  return (
    <RunnerSelectionProvider
      slots={slotViews.map(({ id, kind }) => ({ id, kind }))}
    >
      <SidebarProvider className="min-h-0 flex-1 bg-sidebar">
        <HiddenInMode mode="day-end">
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
        </HiddenInMode>
        <SidebarInset className="m-2 ml-0 min-w-0 rounded-xl shadow-sm">
          {clock ? (
            <Runner
              campaignId={campaign.id}
              campaignShortId={campaign.shortId}
              currentDay={clock.currentDay}
              clockVersion={clock.clockVersion}
              storyTier={clock.storyTier}
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
              readiness={readiness}
              shelf={shelf}
              dungeons={runnableDungeons}
              unresolvedDeadlines={unresolvedDeadlines}
              dayEnd={{
                glance: {
                  downtimeCount: activities.length,
                  worldCount: worldToday.length,
                },
                loggedToday: buildTimelineDayViews(loggedTodayInputs, hits),
                preSuggests,
                alerts: deadlineAlerts,
                storyTierNudge:
                  markers.some((marker) => marker.day === clock.currentDay) &&
                  clock.storyTier < 4
                    ? {
                        current: clock.storyTier,
                        next: clock.storyTier + 1,
                      }
                    : null,
              }}
              unAdvanceUnbinds={unAdvanceUnbinds}
              bondConfirms={bondConfirms}
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
