import Image from "next/image"

import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@workspace/ui/components/item"

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
 * actions are the split button (Open + the disabled action menu).
 */
export function CharacterCard({ character }: CharacterCardProps) {
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
        <ItemTitle>{character.name}</ItemTitle>
        <ItemDescription>
          Level {character.level} ·{" "}
          {archetypeDisplayName(character.activeArchetypeKey)}
        </ItemDescription>
      </ItemContent>
      <ItemActions>
        <CharacterCardActions
          characterId={character.id}
          shortId={character.shortId}
          name={character.name}
        />
      </ItemActions>
    </Item>
  )
}

/**
 * The character's uploaded portrait, or a Vercel-hosted SVG avatar
 * deterministically derived from the character's name as a fallback. The
 * fallback service keeps unportraited rosters visually varied without
 * shipping placeholder art.
 */
function portraitSrc(character: CharacterSummary): string {
  if (character.portraitUrl) return character.portraitUrl
  return `https://avatar.vercel.sh/${encodeURIComponent(character.name)}`
}
