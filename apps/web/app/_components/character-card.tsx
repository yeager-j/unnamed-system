import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@workspace/ui/components/avatar"
import { Badge } from "@workspace/ui/components/badge"
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardMedia,
  CardTitle,
} from "@workspace/ui/components/card"
import { initials } from "@workspace/ui/lib/initials"
import { avatarSrc } from "@workspace/ui/lib/portrait"

import {
  BUILDER_STEPS,
  slugForStepIndex,
} from "@/domain/character/builder-steps"
import { getArchetype } from "@/domain/game-engine-v2"
import { LINEAGE_LABELS } from "@/domain/labels"
import type { CharacterSummary } from "@/lib/db/queries/character-list"
import { characterBuilderPath, characterPath } from "@/lib/paths"

import { CharacterCardActions } from "./character-card-actions"

interface CharacterCardProps {
  character: CharacterSummary
}

/**
 * One tile in the My Characters grid (S3 — UNN-561): a {@link Card} with the
 * portrait as a leading {@link CardMedia} avatar beside the name + at-a-glance
 * details, and the Open/Resume split button anchored in the footer.
 *
 * Drafts (UNN-204) share the grid with a "Draft" badge, an
 * `"In progress · Step N of M"` subtitle, and a primary CTA that routes back
 * into the builder rather than the public sheet. A draft whose name is empty
 * (ADR-002 name-last) renders as "New draft" with a generic avatar seed until
 * the player names them in Movement 4.
 */
export function CharacterCard({ character }: CharacterCardProps) {
  const isDraft = character.status === "draft"
  const href = isDraft
    ? characterBuilderPath(
        character.shortId,
        slugForStepIndex(character.builderStep)
      )
    : characterPath(character.shortId)
  const primaryLabel = isDraft ? "Resume" : "Open"
  const displayName = displayNameFor(character)

  return (
    <Card size="sm" className="h-full justify-between">
      <CardHeader>
        <CardMedia>
          <Avatar size="lg">
            <AvatarImage
              src={avatarSrc(
                character.portraitUrl,
                character.name.trim() || character.shortId
              )}
              alt=""
            />
            <AvatarFallback>{initials(displayName)}</AvatarFallback>
          </Avatar>
        </CardMedia>
        <CardTitle className="flex items-center gap-2">
          {displayName}
          {isDraft ? (
            <Badge variant="secondary" className="font-normal">
              Draft
            </Badge>
          ) : null}
        </CardTitle>
        <CardDescription>{describe(character)}</CardDescription>
      </CardHeader>
      <CardFooter>
        <CharacterCardActions
          characterId={character.id}
          name={character.name}
          displayName={displayName}
          href={href}
          primaryLabel={primaryLabel}
        />
      </CardFooter>
    </Card>
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

/**
 * The at-a-glance subtitle: a draft's progress through the builder, or a
 * finalized character's level and active Archetype Lineage.
 */
function describe(character: CharacterSummary): string {
  if (character.status === "draft") {
    const stepNumber = Math.min(character.builderStep + 1, BUILDER_STEPS.length)
    return `In progress · Step ${stepNumber} of ${BUILDER_STEPS.length}`
  }
  const archetype = character.activeArchetypeKey
    ? getArchetype(character.activeArchetypeKey)
    : undefined
  const lineage = archetype ? LINEAGE_LABELS[archetype.lineage] : "Adventurer"
  return `Level ${character.level} · ${lineage}`
}
