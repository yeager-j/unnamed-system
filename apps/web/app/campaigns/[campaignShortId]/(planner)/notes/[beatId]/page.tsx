import type { Metadata } from "next"
import { notFound } from "next/navigation"

import {
  BeatEditor,
  type BeatEditorBeat,
} from "@/app/campaigns/[campaignShortId]/_components/notes/beat-editor"
import {
  activePeriod,
  groupPeriodsByKind,
  resolveDayLabel,
  type PeriodMarker,
} from "@/domain/planner/period"
import { buildLinkerOptions } from "@/domain/planner/view/linker"
import { buildSchedulePickerDays } from "@/domain/planner/view/schedule-picker"
import { loadPlacedCharactersForCampaign } from "@/lib/db/queries/character-list"
import { loadPeriods } from "@/lib/db/queries/load-campaign-clock"
import { loadCampaignFolders } from "@/lib/db/queries/load-campaign-folders"
import {
  loadBeat,
  loadUpcomingSlots,
  type LoadedBeat,
} from "@/lib/db/queries/load-campaign-notes"
import {
  loadCampaignArticles,
  loadCampaignNpcs,
} from "@/lib/db/queries/load-campaign-world"
import { loadDungeonsForCampaign } from "@/lib/db/queries/load-dungeon"
import { loadEncountersForCampaign } from "@/lib/db/queries/load-encounter"

import { getCampaignClock, getCampaignForDM } from "../../planner-access"

interface PageProps {
  params: Promise<{ campaignShortId: string; beatId: string }>
}

export const metadata: Metadata = { title: "Beat — Showtime!" }

/**
 * The beat detail page (UNN-576's editor, routed in UNN-617): loads the beat
 * plus what the editor needs around it — the world-web linker options for
 * chips and the schedule picker's upcoming slots. The tree lives in the
 * layout, so a beat switch re-renders only this inset.
 */
export default async function BeatPage({ params }: PageProps) {
  const { campaignShortId, beatId } = await params
  const campaign = await getCampaignForDM(campaignShortId)
  if (!campaign) notFound()

  const loaded = await loadBeat(campaign.id, beatId)
  if (!loaded) notFound()

  const [clock, folders, npcs, articles, characters, encounters, dungeons] =
    await Promise.all([
      getCampaignClock(campaign.id),
      loadCampaignFolders(campaign.id, "session"),
      loadCampaignNpcs(campaign.id),
      loadCampaignArticles(campaign.id),
      loadPlacedCharactersForCampaign(campaign.id),
      loadEncountersForCampaign(campaign.id),
      loadDungeonsForCampaign(campaign.id),
    ])
  const [upcomingSlots, periods] = clock
    ? await Promise.all([
        loadUpcomingSlots(campaign.id, clock.currentDay),
        loadPeriods(campaign.id),
      ])
    : [[], []]
  const { month: months } = groupPeriodsByKind(periods)

  const folderName =
    folders.find((folder) => folder.id === loaded.beat.folderId)?.name ?? null

  return (
    <BeatEditor
      key={loaded.beat.id}
      campaignId={campaign.id}
      campaignShortId={campaign.shortId}
      beat={editorBeatOf(loaded, folderName, months)}
      linkerOptions={buildLinkerOptions({
        npcs,
        articles,
        characters,
        encounters,
        dungeons,
      })}
      scheduleDays={buildSchedulePickerDays(upcomingSlots, months)}
      clockStarted={clock !== null}
    />
  )
}

function editorBeatOf(
  loaded: LoadedBeat,
  folderName: string | null,
  months: readonly PeriodMarker[]
): BeatEditorBeat {
  const { beat, scheduledSlot } = loaded
  return {
    id: beat.id,
    title: beat.title,
    tagline: beat.tagline,
    body: beat.body,
    folderName,
    schedule:
      scheduledSlot !== null
        ? {
            kind: "scheduled",
            slotId: scheduledSlot.id,
            label: `${resolveDayLabel(
              scheduledSlot.day,
              activePeriod(months, scheduledSlot.day)
            )} · ${scheduledSlot.label}`,
          }
        : beat.floating
          ? { kind: "floating" }
          : { kind: "none" },
  }
}
