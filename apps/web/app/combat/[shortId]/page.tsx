import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { cache } from "react"

import { CombatConsoleStub } from "@/components/combat/console-stub"
import { EncounterSetup } from "@/components/combat/encounter-setup"
import { EncounterEndedStub } from "@/components/combat/ended-stub"
import { auth } from "@/lib/auth"
import { loadCampaignRowById } from "@/lib/db/queries/load-campaign"
import { loadEncounterRowByShortId } from "@/lib/db/queries/load-encounter"
import type { EncounterRow } from "@/lib/db/schema/encounter"

interface PageProps {
  params: Promise<{ shortId: string }>
}

/**
 * Resolves the encounter for the current viewer, or `null` if it is missing or
 * the viewer is not its campaign's DM. The DM console is DM-only, and we return
 * the *same* nothing for "not found" and "not your campaign" so the route 404s
 * either way without leaking that an encounter exists (the AC's 404 cases). The
 * signed-out player watch view is a separate `shortId` route (UNN-322).
 *
 * Per-request memoized so `generateMetadata` and the page resolve once.
 */
const getEncounterForDM = cache(
  async (shortId: string): Promise<EncounterRow | null> => {
    const session = await auth()
    const viewerId = session?.user?.id
    if (!viewerId) return null

    const encounter = await loadEncounterRowByShortId(shortId)
    if (!encounter) return null

    const campaign = await loadCampaignRowById(encounter.campaignId)
    if (!campaign || campaign.dmUserId !== viewerId) return null

    return encounter
  }
)

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { shortId } = await params
  const encounter = await getEncounterForDM(shortId)

  return {
    title: encounter
      ? `${encounter.name} — Unnamed System`
      : "Encounter not found — Unnamed System",
  }
}

/**
 * The DM combat console at `/combat/{shortId}` (UNN-335). The **status fork** is
 * this ticket's deliverable: a `draft` encounter renders the setup shell, a
 * `live` one the combat console, and an `ended` one a read-only terminal view.
 * Only the setup shell's frame is load-bearing here; the three branch bodies are
 * stubbed by their own downstream tickets.
 */
export default async function CombatPage({ params }: PageProps) {
  const { shortId } = await params
  const encounter = await getEncounterForDM(shortId)

  if (!encounter) notFound()

  switch (encounter.status) {
    case "draft":
      return <EncounterSetup encounter={encounter} />
    case "live":
      return <CombatConsoleStub encounter={encounter} />
    case "ended":
      return <EncounterEndedStub encounter={encounter} />
  }
}
