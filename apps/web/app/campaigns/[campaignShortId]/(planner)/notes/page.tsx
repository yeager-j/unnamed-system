import type { Metadata } from "next"
import { notFound } from "next/navigation"

import type { BeatEditorBeat } from "@/app/campaigns/[campaignShortId]/_components/notes/beat-editor"
import { NotesShell } from "@/app/campaigns/[campaignShortId]/_components/notes/notes-shell"
import { seasonOf } from "@/domain/planner/season"
import { buildLinkerOptions } from "@/domain/planner/view/linker"
import { buildSchedulePickerDays } from "@/domain/planner/view/schedule-picker"
import { loadPlacedCharactersForCampaign } from "@/lib/db/queries/character-list"
import { loadSeasons } from "@/lib/db/queries/load-campaign-clock"
import {
  loadBeat,
  loadNotesTree,
  loadUpcomingSlots,
  type LoadedBeat,
} from "@/lib/db/queries/load-campaign-notes"
import {
  loadCampaignArticles,
  loadCampaignNpcs,
} from "@/lib/db/queries/load-campaign-world"
import { loadDungeonsForCampaign } from "@/lib/db/queries/load-dungeon"
import { loadEncountersForCampaign } from "@/lib/db/queries/load-encounter"

import { getCampaignClock, getCampaignForDM } from "../planner-access"

interface PageProps {
  params: Promise<{ campaignShortId: string }>
  searchParams: Promise<{ beat?: string }>
}

export const metadata: Metadata = { title: "Session Notes — Showtime!" }

/**
 * Session Notes (UNN-576, handoff Screen 3, DM-only like every nested
 * planner route): the folder tree + beat editor. The page loads everything
 * the shell needs in parallel — the tree, the `?beat=` selection, the
 * world-web linker options for chips, and the schedule picker's upcoming
 * slots — and the client shell owns selection + the no-revalidate title
 * mirror.
 */
export default async function NotesPage({ params, searchParams }: PageProps) {
  const [{ campaignShortId }, { beat: beatParam }] = await Promise.all([
    params,
    searchParams,
  ])
  const campaign = await getCampaignForDM(campaignShortId)
  if (!campaign) notFound()

  const [
    clock,
    tree,
    npcs,
    articles,
    characters,
    encounters,
    dungeons,
    selected,
  ] = await Promise.all([
    getCampaignClock(campaign.id),
    loadNotesTree(campaign.id),
    loadCampaignNpcs(campaign.id),
    loadCampaignArticles(campaign.id),
    loadPlacedCharactersForCampaign(campaign.id),
    loadEncountersForCampaign(campaign.id),
    loadDungeonsForCampaign(campaign.id),
    beatParam === undefined
      ? Promise.resolve(null)
      : loadBeat(campaign.id, beatParam),
  ])
  const [upcomingSlots, seasons] = clock
    ? await Promise.all([
        loadUpcomingSlots(campaign.id, clock.currentDay),
        loadSeasons(campaign.id),
      ])
    : [[], []]
  const seasonLabel = clock ? seasonOf(seasons, clock.currentDay) : null

  return (
    <NotesShell
      campaignId={campaign.id}
      campaignShortId={campaign.shortId}
      campaignName={campaign.name}
      dayLine={
        clock
          ? `Day ${clock.currentDay}${seasonLabel ? ` · ${seasonLabel}` : ""}`
          : null
      }
      sessions={tree.sessions.map(({ id, name }) => ({ id, name }))}
      beats={tree.beats}
      selectedBeat={selected ? editorBeatOf(selected, tree) : null}
      linkerOptions={buildLinkerOptions({
        npcs,
        articles,
        characters,
        encounters,
        dungeons,
      })}
      scheduleDays={buildSchedulePickerDays(upcomingSlots)}
      clockStarted={clock !== null}
    />
  )
}

function editorBeatOf(
  loaded: LoadedBeat,
  tree: Awaited<ReturnType<typeof loadNotesTree>>
): BeatEditorBeat {
  const { beat, scheduledSlot } = loaded
  return {
    id: beat.id,
    title: beat.title,
    tagline: beat.tagline,
    body: beat.body,
    sessionName:
      tree.sessions.find((session) => session.id === beat.sessionId)?.name ??
      null,
    schedule:
      scheduledSlot !== null
        ? {
            kind: "scheduled",
            slotId: scheduledSlot.id,
            label: `Day ${scheduledSlot.day} · ${scheduledSlot.label}`,
          }
        : beat.floating
          ? { kind: "floating" }
          : { kind: "none" },
  }
}
