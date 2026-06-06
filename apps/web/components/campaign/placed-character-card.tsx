import Image from "next/image"

import { archetypeDisplayName } from "@workspace/game/archetypes"
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@workspace/ui/components/item"

import type { OwnedPlacementCharacter } from "@/lib/db/queries/character-list"

import { RemovePlacementButton } from "./remove-placement-button"

/**
 * One placed-character tile in the campaign placement grid (UNN-328): portrait,
 * name, level + active Archetype, and a remove control. Mirrors the My Characters
 * card's `Item` shape so a placed roster reads consistently with the home grid.
 */
export function PlacedCharacterCard({
  character,
}: {
  character: OwnedPlacementCharacter
}) {
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
        <RemovePlacementButton
          characterId={character.id}
          characterName={character.name}
        />
      </ItemActions>
    </Item>
  )
}

/** The uploaded portrait, or a deterministic avatar fallback derived from the
 *  name (same scheme as the My Characters card). */
function portraitSrc(character: OwnedPlacementCharacter): string {
  if (character.portraitUrl) return character.portraitUrl
  const seed = character.name.trim() || character.shortId
  return `https://avatar.vercel.sh/${encodeURIComponent(seed)}`
}
