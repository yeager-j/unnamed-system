import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { Badge } from "@workspace/ui/components/badge"

import { loadMapRowById } from "@/lib/db/queries/load-map"
import {
  loadActiveExpeditionForRegion,
  loadExpeditionsForRegion,
  loadRegionByShortId,
  regionHasExpeditions,
} from "@/lib/db/queries/load-region"
import {
  loadTemplateSetRowById,
  projectSetForPicker,
} from "@/lib/db/queries/load-template-set"
import { regionWatchPath } from "@/lib/paths"

import { getCampaignForDM } from "../../planner-access"
import { ExpeditionList } from "./_components/expedition-list"
import { NewExpeditionButton } from "./_components/new-expedition-button"
import { RegionDangerZone } from "./_components/region-danger-zone"
import { RegionSettingsForm } from "./_components/region-settings-form"
import { RegionWatchLink } from "./_components/region-watch-link"

interface PageProps {
  params: Promise<{ campaignShortId: string; regionShortId: string }>
}

/**
 * Resolves the Region for the current viewer **as its campaign's DM**, or `null`
 * when the Region is missing, belongs to another campaign, or the viewer isn't
 * that campaign's DM — the detail page's single access boundary. Mirrors the
 * dungeon watch page's campaign-pairing 404: a Region shortId probed under the
 * wrong campaign resolves to the same nothing as an unknown one, so it can't be
 * used to confirm a Region's existence across campaigns.
 */
async function resolveRegionForDM(
  campaignShortId: string,
  regionShortId: string
) {
  const campaign = await getCampaignForDM(campaignShortId)
  if (!campaign) return null

  const region = await loadRegionByShortId(regionShortId)
  if (!region || region.campaignId !== campaign.id) return null

  return { campaign, region }
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { campaignShortId, regionShortId } = await params
  const resolved = await resolveRegionForDM(campaignShortId, regionShortId)

  return {
    title: resolved
      ? `${resolved.region.name} — Region — Showtime!`
      : "Region not found — Showtime!",
  }
}

/**
 * A Region's DM detail page at `/campaigns/{c}/regions/{r}` (UNN-589) — the
 * Region's expedition history, its authored wandering settings, and a danger
 * zone. DM-only like every `(planner)` surface: a member or stranger 404s
 * identically via {@link resolveRegionForDM}.
 *
 * A Region binds a **seed Map** + **Template Set** at create (both fixed here — a
 * rebind would orphan the knowledge folds, D5); this page displays their names and
 * lets the DM edit only the authored defaults. The stable watch link is the one
 * URL players keep across expeditions ({@link regionWatchPath}); the redirect
 * behind it resolves to the current run.
 */
export default async function RegionDetailPage({ params }: PageProps) {
  const { campaignShortId, regionShortId } = await params
  const resolved = await resolveRegionForDM(campaignShortId, regionShortId)
  if (!resolved) notFound()

  const { campaign, region } = resolved

  const [seedMap, templateSet, expeditions, activeExpedition, hasExpeditions] =
    await Promise.all([
      loadMapRowById(region.seedMapId),
      loadTemplateSetRowById(region.templateSetId),
      loadExpeditionsForRegion(region.id),
      loadActiveExpeditionForRegion(region.id),
      regionHasExpeditions(region.id),
    ])

  const tables = templateSet ? projectSetForPicker(templateSet).tables : []
  const isArchived = region.archivedAt !== null

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 p-6">
      <header className="flex flex-col gap-1">
        <div className="flex items-center gap-3">
          <h1 className="font-heading text-xl font-medium">{region.name}</h1>
          {isArchived ? <Badge variant="outline">Archived</Badge> : null}
        </div>
        <p className="text-sm text-muted-foreground">
          {seedMap?.name ?? "Unknown map"} ·{" "}
          {templateSet?.name ?? "Unknown set"}
        </p>
      </header>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-medium text-muted-foreground">
            Expeditions
          </h2>
          <NewExpeditionButton
            campaignShortId={campaign.shortId}
            regionId={region.id}
            regionName={region.name}
            isArchived={isArchived}
          />
        </div>
        <ExpeditionList
          campaignShortId={campaign.shortId}
          expeditions={expeditions}
          activeShortId={activeExpedition?.shortId ?? null}
        />
        <RegionWatchLink
          watchPath={regionWatchPath(campaign.shortId, region.shortId)}
        />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">Settings</h2>
        <RegionSettingsForm
          regionId={region.id}
          version={region.version}
          name={region.name}
          settings={region.settings}
          tables={tables}
        />
      </section>

      <RegionDangerZone
        campaignShortId={campaign.shortId}
        regionId={region.id}
        regionName={region.name}
        version={region.version}
        isArchived={isArchived}
        hasExpeditions={hasExpeditions}
      />
    </main>
  )
}
