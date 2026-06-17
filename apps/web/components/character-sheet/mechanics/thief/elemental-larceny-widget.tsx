import {
  CrosshairIcon,
  EyeIcon,
  MagnifyingGlassIcon,
} from "@phosphor-icons/react"

/**
 * Elemental Thief — Elemental Larceny rendering. Like Thief's Insight the
 * mechanic has no per-character state (Tells and planted Weaknesses are tracked
 * at the table), so the Combat-tab widget is a static, read-only reminder of the
 * three things the player drives turn to turn: Study, the per-Tell Attack Roll
 * bonus, and Mark. The full rules live on the Archetypes-tab mechanic card.
 */
export function ElementalLarcenyWidget() {
  return (
    <ul className="flex flex-col gap-2 text-sm text-muted-foreground">
      <li className="flex items-start gap-2">
        <MagnifyingGlassIcon className="mt-0.5 shrink-0" aria-hidden />
        <span>
          <span className="font-medium text-foreground">Study</span> (Standard
          Action): learn one Tell from a target in your Zone, up to your Rank.
        </span>
      </li>
      <li className="flex items-start gap-2">
        <EyeIcon className="mt-0.5 shrink-0" aria-hidden />
        <span>
          <span className="font-medium text-foreground">+1</span> to Attack
          Rolls per Tell on the target; at 2 Tells the DM reveals a Weakness.
        </span>
      </li>
      <li className="flex items-start gap-2">
        <CrosshairIcon className="mt-0.5 shrink-0" aria-hidden />
        <span>
          <span className="font-medium text-foreground">Mark</span> (Standard
          Action): spend 2 Tells to plant a Weakness to an element of your
          choice. Tracked at the table.
        </span>
      </li>
    </ul>
  )
}
