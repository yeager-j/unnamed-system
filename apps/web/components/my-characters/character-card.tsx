import Image from "next/image"

import { Badge } from "@workspace/ui/components/badge"
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@workspace/ui/components/item"

import {
  BUILDER_STEPS,
  slugForStepIndex,
} from "@/components/builder/builder-steps"
import type { CharacterSummary } from "@/lib/db/character-list"
import { archetypeDisplayName } from "@/lib/game/archetypes"

import { CharacterCardActions } from "./character-card-actions"

interface CharacterCardProps {
  character: CharacterSummary
}

/**
 * One tile in the My Characters grid. Renders as an `Item` row so the portrait
 * sits beside the name + level rather than dominating a tall card — a roster
 * of rows with the at-a-glance details right next to the face. Trailing
 * actions are the split button (Open + the action menu).
 *
 * Drafts (UNN-204) appear in the same grid with a "Draft" badge, an
 * `"In progress · Step N of M"` subtitle, and a primary CTA that routes
 * back into the builder instead of opening the public sheet. A draft whose
 * name field is empty (per ADR-002 name-last) renders as "New draft" with
 * a generic avatar seed — a follow-on ticket will synthesize a richer label
 * (e.g. "Stains Mage draft") from the picked Path + Origin.
 */
export function CharacterCard({ character }: CharacterCardProps) {
  const isDraft = character.status === "draft"
  const href = isDraft
    ? `/builder/${character.shortId}/${slugForStepIndex(character.builderStep)}`
    : `/c/${character.shortId}`
  const primaryLabel = isDraft ? "Resume" : "Open"
  const displayName = displayNameFor(character)

  return (
    <Item variant="outline">
      <ItemMedia variant="image">
        <Image
          width={64}
          height={64}
          className="object-cover"
          src={portraitSrc(character)}
          alt=""
        />
      </ItemMedia>
      <ItemContent>
        <ItemTitle className="flex items-center gap-2">
          {displayName}
          {isDraft ? (
            <Badge variant="secondary" className="uppercase">
              Draft
            </Badge>
          ) : null}
        </ItemTitle>
        <ItemDescription>{describe(character)}</ItemDescription>
      </ItemContent>
      <ItemActions>
        <CharacterCardActions
          characterId={character.id}
          name={character.name}
          displayName={displayName}
          href={href}
          primaryLabel={primaryLabel}
        />
      </ItemActions>
    </Item>
  )
}

/**
 * What to render for the character's title. Finalized characters always have
 * a name; drafts may be empty (ADR-002 name-last) and fall back to "New
 * draft" until the player names them in Movement 4.
 */
function displayNameFor(character: CharacterSummary): string {
  const trimmed = character.name.trim()
  if (trimmed.length > 0) return trimmed
  return "New draft"
}

function describe(character: CharacterSummary): string {
  if (character.status === "draft") {
    const stepNumber = Math.min(character.builderStep + 1, BUILDER_STEPS.length)
    return `In progress · Step ${stepNumber} of ${BUILDER_STEPS.length}`
  }
  return `Level ${character.level} · ${archetypeDisplayName(character.activeArchetypeKey)}`
}

/**
 * The character's uploaded portrait, or a Vercel-hosted SVG avatar
 * deterministically derived from the name as a fallback. The fallback
 * service keeps unportraited rosters visually varied without shipping
 * placeholder art. Empty-name drafts seed the avatar with the `shortId` so
 * every draft still gets a stable, unique gradient.
 */
function portraitSrc(character: CharacterSummary): string {
  if (character.portraitUrl) return character.portraitUrl
  const seed = character.name.trim() || character.shortId
  return `https://avatar.vercel.sh/${encodeURIComponent(seed)}`
}
