import { EyeIcon, MagnifyingGlassIcon } from "@phosphor-icons/react"

/**
 * Thief — Thief's Insight rendering. The mechanic has no per-character state
 * (Tells are per-enemy and tracked at the table, not in the app), so the
 * Combat-tab widget is a static, read-only reminder of the two things the
 * player drives turn to turn: the Study action and the per-Tell Attack Roll
 * bonus. The full rules live on the Archetypes-tab mechanic card.
 */
export function ThiefsInsightWidget() {
  return (
    <ul className="flex flex-col gap-2 text-sm text-muted-foreground">
      <li className="flex items-start gap-2">
        <MagnifyingGlassIcon className="mt-0.5 shrink-0" aria-hidden />
        <span>
          <span className="font-medium text-foreground">Study</span> (Standard
          Action): learn one Tell from a target in your Zone, up to your Thief
          Rank.
        </span>
      </li>
      <li className="flex items-start gap-2">
        <EyeIcon className="mt-0.5 shrink-0" aria-hidden />
        <span>
          <span className="font-medium text-foreground">+1</span> to Attack
          Rolls per Tell on the target; at 2 Tells the DM reveals a Weakness.
          Tells are tracked at the table.
        </span>
      </li>
    </ul>
  )
}
