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
 * Drafts (UNN-204) appear in the same grid but with a "Draft" badge, an
 * `"Untitled character"` fallback when the name field is still empty, an
 * `"In progress · Step N of 5"` subtitle, and a primary CTA that routes
 * back into the builder instead of opening the public sheet.
 */
export function CharacterCard({ character }: CharacterCardProps) {
  const isDraft = character.status === "draft"
  const href = isDraft
    ? `/builder/${character.shortId}/${slugForStepIndex(character.builderStep)}`
    : `/c/${character.shortId}`
  const primaryLabel = isDraft ? "Resume building" : "Open"

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
          {character.name}
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
          href={href}
          primaryLabel={primaryLabel}
        />
      </ItemActions>
    </Item>
  )
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
 * placeholder art.
 */
function portraitSrc(character: CharacterSummary): string {
  if (character.portraitUrl) return character.portraitUrl
  return `https://avatar.vercel.sh/${encodeURIComponent(character.name)}`
}
