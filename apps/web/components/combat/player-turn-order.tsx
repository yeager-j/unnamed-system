import {
  type PlayerCurrentActor,
  type PlayerVisibleCombatant,
} from "@workspace/game/engine"
import { cn } from "@workspace/ui/lib/utils"

import { COMBAT_SIDE_LABELS } from "@/lib/ui/labels"

/**
 * The watch view's **turn tracker** (UNN-322): the round number, who is acting
 * now (name + side), and the full turn order in session order. Acted combatants
 * dim with a ✓; the current actor is ringed. Pure read display.
 */
export function PlayerTurnOrder({
  round,
  currentActor,
  combatants,
}: {
  round: number
  currentActor: PlayerCurrentActor | null
  combatants: PlayerVisibleCombatant[]
}) {
  return (
    <section className="flex flex-col gap-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="font-heading text-lg font-medium">Round {round}</h2>
        <p className="text-sm text-muted-foreground">
          {currentActor ? (
            <>
              Now acting:{" "}
              <span className="font-medium text-foreground">
                {currentActor.name}
              </span>{" "}
              · {COMBAT_SIDE_LABELS[currentActor.side]}
            </>
          ) : (
            "Between turns"
          )}
        </p>
      </div>

      <ol className="flex flex-wrap gap-1.5">
        {combatants.map((combatant) => (
          <li key={combatant.id}>
            <TurnChip combatant={combatant} />
          </li>
        ))}
      </ol>
    </section>
  )
}

function TurnChip({ combatant }: { combatant: PlayerVisibleCombatant }) {
  const ring =
    combatant.side === "players"
      ? "ring-1 ring-primary/40"
      : "ring-1 ring-destructive/40"

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border bg-background px-2 py-1 text-xs",
        ring,
        combatant.isCurrent && "ring-2 ring-primary",
        combatant.hasActed && "opacity-50"
      )}
    >
      <span className="truncate font-medium">{combatant.name}</span>
      {combatant.hasActed ? (
        <span aria-label="has acted" className="text-muted-foreground">
          ✓
        </span>
      ) : null}
    </span>
  )
}
