"use client"

import { AttributeGrid } from "@/components/shared/attribute-grid"
import { useCharacter } from "@/hooks/use-character"

/**
 * The read-only Attributes block (PRD §6.1 / §7.1): the engine-resolved
 * Strength / Magic / Agility / Luck off the hydrated character (pre-clamped —
 * this never re-does the math). Attributes matter in every encounter context,
 * so they live in the always-visible {@link SheetHeader}. The list itself is the
 * shared {@link AttributeGrid} (also used by the combat drawer); this component
 * just supplies the character's scores. No controls; the public sheet never
 * mutates state.
 */
export function Attributes() {
  const character = useCharacter()
  return <AttributeGrid attributes={character.attributes} />
}
