import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { CampaignBackLink } from "@/components/combat/campaign-back-link"
import { loadCampaignRowById } from "@/lib/db/queries/load-campaign"

import { getDungeonForDM } from "./dungeon-access"

interface PageProps {
  params: Promise<{ shortId: string }>
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { shortId } = await params
  const result = await getDungeonForDM(shortId)

  return {
    title: result
      ? `${result.dungeon.name} — Unnamed System`
      : "Dungeon not found — Unnamed System",
  }
}

/**
 * The DM dungeon console at `/dungeon/{shortId}` (UNN-462), DM-only. Loads through
 * {@link getDungeonForDM}, which 404s for a non-DM (or non-member) without leaking
 * that the dungeon exists. This ticket ships the route + the load/auth gate; the
 * run console — the React Flow canvas, the turn loop, token placement/movement,
 * and reveal — lands in UNN-463/464, so the body here is a minimal status-aware
 * placeholder.
 */
export default async function DungeonPage({ params }: PageProps) {
  const { shortId } = await params
  const result = await getDungeonForDM(shortId)

  if (!result) notFound()
  const { dungeon } = result

  // getDungeonForDM already authorized the viewer against this campaign, so the
  // row exists; resolve its public shortId for the "← Campaign" back link.
  const campaign = await loadCampaignRowById(dungeon.campaignId)
  const campaignShortId = campaign?.shortId ?? ""

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 p-6">
      {campaignShortId ? (
        <CampaignBackLink campaignShortId={campaignShortId} />
      ) : null}
      <header>
        <h1 className="font-heading text-lg font-medium">{dungeon.name}</h1>
        <p className="text-sm text-muted-foreground capitalize">
          Dungeon · {dungeon.status}
        </p>
      </header>
      <div
        className="rounded-lg border p-8 text-center text-sm text-muted-foreground"
        data-testid="dungeon-console-placeholder"
      >
        The dungeon run console is coming in UNN-463/464.
      </div>
    </main>
  )
}
