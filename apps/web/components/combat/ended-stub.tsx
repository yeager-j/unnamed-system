import { CampaignBackLink } from "@/components/shared/campaign-back-link"
import type { EncounterRow } from "@/lib/db/schema/encounter"

/**
 * Read-only view for an `ended` encounter (UNN-335). The encounter's combat
 * state was discarded when it ended (ADR Decision 2 — combat state lives on the
 * session, ending throws it away); this is a minimal terminal stub. Any
 * post-combat close-out flow (Spoils, etc.) is a deferred hook.
 */
export function EncounterEndedStub({
  encounter,
  campaignShortId,
}: {
  encounter: EncounterRow
  campaignShortId: string
}) {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 p-6">
      {campaignShortId ? (
        <CampaignBackLink campaignShortId={campaignShortId} />
      ) : null}
      <header>
        <h1 className="font-heading text-lg font-medium">{encounter.name}</h1>
        <p className="text-sm text-muted-foreground">Encounter ended</p>
      </header>
      <div
        className="rounded-lg border p-8 text-center text-sm text-muted-foreground"
        data-testid="combat-ended-stub"
      >
        This encounter has ended.
      </div>
    </main>
  )
}
