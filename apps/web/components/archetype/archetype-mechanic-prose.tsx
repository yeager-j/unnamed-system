import { type Archetype } from "@workspace/game-v2/archetypes/archetype"
import { getMechanic } from "@workspace/game-v2/mechanics"
import { Separator } from "@workspace/ui/components/separator"

import { Prose } from "@/components/shared/prose"

/** The structural slice this widget reads — both engines' catalog Archetypes
 *  satisfy it (the mechanic-kind unions are re-declared identically, D32; the
 *  prose itself resolves through the registry). */
type MechanicSlice = Pick<Archetype, "mechanic">

/**
 * Optional per-Archetype unique-mechanic prose block — name + description.
 * Returns `null` when the Archetype declares no mechanic so the surrounding
 * separator and section vanish along with it.
 */
export function ArchetypeMechanicProse({
  archetype,
}: {
  archetype: MechanicSlice
}) {
  const mechanic = archetype.mechanic ? getMechanic(archetype.mechanic) : null
  if (!mechanic) return null
  return (
    <>
      <Separator />
      <section className="flex flex-col gap-1">
        <h3 className="font-display text-lg font-semibold">
          {mechanic.displayName}
        </h3>
        <Prose>{mechanic.description}</Prose>
      </section>
    </>
  )
}
