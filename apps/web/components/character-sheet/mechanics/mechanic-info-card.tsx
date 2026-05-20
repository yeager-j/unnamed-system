import { Badge } from "@workspace/ui/components/badge"
import { initialStateFor } from "@/lib/game/mechanics"
import type { ArchetypeMechanic, Archetype } from "@/lib/game/archetypes/schema"
import type { MechanicState } from "@/lib/game/mechanics/schema"
import { summarizeMechanicState } from "./widget-registry"

/**
 * Read-only Archetypes-tab summary for one unlocked Archetype's unique
 * mechanic. Shows the mechanic name, its description, and a compact
 * single-line snapshot of *this Archetype's* current state — so a player
 * scanning the tab can see Warrior is sitting at Perfection rank B even
 * while Knight is the active Archetype.
 */
export function MechanicInfoCard({
  archetype,
  state,
}: {
  archetype: Archetype
  state: MechanicState | null
}) {
  if (!archetype.mechanic) return null
  const mechanic: ArchetypeMechanic = archetype.mechanic
  const concreteState =
    state ?? (initialStateFor(mechanic.kind) as MechanicState | undefined)
  if (!concreteState) return null
  return (
    <section
      aria-label={`${archetype.name} — ${mechanic.displayName}`}
      className="rounded-lg border border-border p-4"
    >
      <header className="mb-2 flex items-baseline justify-between gap-2">
        <h4 className="text-sm font-semibold">{mechanic.displayName}</h4>
        <Badge variant="outline">{summarizeMechanicState(concreteState)}</Badge>
      </header>
      <p className="text-sm text-muted-foreground">{mechanic.description}</p>
    </section>
  )
}
