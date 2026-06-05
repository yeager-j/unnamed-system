import { ItemGroup } from "@workspace/ui/components/item"

import { CreateCharacterButton } from "@/components/my-characters/create-character-button"
import { loadOwnedFinalizedCharactersWithPlacement } from "@/lib/db/queries/character-list"

import { AddCharacterDialog } from "./add-character-dialog"
import { PlacedCharacterCard } from "./placed-character-card"

/**
 * The "Your characters" section on the campaign page (UNN-328): the viewer's own
 * characters placed **in this campaign** as a card grid, plus an "Add character"
 * dialog to place / move another of their characters in. Placement is the owner
 * action that consents to the DM's in-combat vitals writes (ADR Decision 9), so
 * only the viewer's own characters appear here.
 *
 * When the viewer has no finalized character at all, a "Create a character" CTA
 * into the builder (the join-first journey — join with zero characters, build
 * one, come back and place it).
 */
export async function CharacterPlacementSection({
  campaignId,
  campaignName,
  viewerId,
}: {
  campaignId: string
  campaignName: string
  viewerId: string
}) {
  const characters = await loadOwnedFinalizedCharactersWithPlacement(viewerId)

  if (characters.length === 0) {
    return (
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">
          Your characters
        </h2>
        <div className="flex flex-col items-start gap-3 border p-4">
          <p className="text-sm text-muted-foreground">
            You don&apos;t have a finalized character yet. Create one, then add
            it here so the DM can run it in combat.
          </p>
          <CreateCharacterButton />
        </div>
      </section>
    )
  }

  const placedHere = characters.filter((c) => c.campaignId === campaignId)
  const available = characters.filter((c) => c.campaignId !== campaignId)

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">
          Your characters
        </h2>
        <AddCharacterDialog
          campaignId={campaignId}
          campaignName={campaignName}
          available={available}
        />
      </div>

      {placedHere.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          You haven&apos;t added a character to this campaign yet.
        </p>
      ) : (
        <ItemGroup className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {placedHere.map((character) => (
            <PlacedCharacterCard key={character.id} character={character} />
          ))}
        </ItemGroup>
      )}
    </section>
  )
}
