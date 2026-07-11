import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
} from "@workspace/ui/components/card"
import { cn } from "@workspace/ui/lib/utils"

import type { WatchCombatant } from "@/domain/combat/view/watch-layout"
import { COMBAT_SIDE_LABELS } from "@/lib/ui/labels"

/**
 * The watch view's **turn tracker** (UNN-322): the round number, who is acting
 * now (name + side), and the full turn order in session order. Acted combatants
 * dim with a ✓; the current actor is ringed. Pure read display. Rendered as a
 * {@link Card} so its border matches the zone cards beside it (the shared Card
 * draws its edge with a ring, not a `border` — mixing the two misaligns by 1px).
 */
export function PlayerTurnOrder({
  round,
  currentActor,
  combatants,
}: {
  round: number
  currentActor: Pick<WatchCombatant, "name" | "side"> | null
  combatants: WatchCombatant[]
}) {
  return (
    <Card size="sm">
      <CardHeader>
        <h2 className="font-heading text-lg font-medium">Round {round}</h2>
        <CardAction className="self-center text-sm text-muted-foreground">
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
        </CardAction>
      </CardHeader>

      <CardContent>
        <ol className="flex flex-wrap gap-1.5">
          {combatants.map((combatant) => (
            <li key={combatant.id}>
              <TurnChip combatant={combatant} />
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  )
}

function TurnChip({ combatant }: { combatant: WatchCombatant }) {
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
