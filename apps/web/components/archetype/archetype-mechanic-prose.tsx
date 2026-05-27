import { Separator } from "@workspace/ui/components/separator"

import { Prose } from "@/components/shared/prose"
import type { Archetype } from "@/lib/game/archetypes"
import { getMechanic } from "@/lib/game/mechanics"

/**
 * Optional per-Archetype unique-mechanic prose block — name + description.
 * Returns `null` when the Archetype declares no mechanic so the surrounding
 * separator and section vanish along with it.
 */
export function ArchetypeMechanicProse({
  archetype,
}: {
  archetype: Archetype
}) {
  const mechanic = archetype.mechanic ? getMechanic(archetype.mechanic) : null
  if (!mechanic) return null
  return (
    <>
      <Separator />
      <section className="flex flex-col gap-1">
        <h3 className="text-sm font-semibold">{mechanic.displayName}</h3>
        <Prose>{mechanic.description}</Prose>
      </section>
    </>
  )
}
