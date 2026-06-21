import { FALLEN_RECOVER_REMINDER } from "@/lib/ui/labels"

/**
 * The non-blocking "Fallen PCs recover to 1 HP" reminder shown in an end-combat
 * confirm (UNN-320). The tracker never writes a character row, so each player
 * sets it on their own sheet (ADR *Cross-aggregate writes*) — the list is
 * display-only. Renders nothing when no PC is Fallen. Shared by the standalone
 * {@link import("./end-combat").EndCombatDialog} and the dungeon
 * {@link import("@/components/dungeon/combat/end-combat-dialog").DungeonEndCombatDialog}.
 */
export function FallenRecoverReminder({ names }: { names: string[] }) {
  if (names.length === 0) return null

  return (
    <div className="rounded-md border border-dashed p-3 text-sm">
      <p className="text-muted-foreground">{FALLEN_RECOVER_REMINDER}</p>
      <p className="mt-1 font-medium">{names.join(", ")}</p>
    </div>
  )
}
