import { Progress } from "@workspace/ui/components/progress"
import type { HydratedCharacter } from "@/lib/db/load-character"

/**
 * The read-only Vitals block (PRD §6.1 Vitals + §7.6 Prisma): current/max HP
 * and SP with bars that reflect the ratio, Hit Die and Skill Dice remaining,
 * and Prisma charges. Max values come pre-resolved off the hydrated character
 * (Mastery + equipment already folded in by the engine). No controls; the
 * public sheet never mutates state. Rendered as the right column of the
 * top-of-sheet summary ({@link SheetHeader}), so no card wrapper of its own.
 */
export function Vitals({ character }: { character: HydratedCharacter }) {
  const fallen = character.currentHP <= 0

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-medium">HP</span>
          <span className="text-muted-foreground tabular-nums">
            {fallen ? (
              <span className="mr-2 font-medium text-destructive">Fallen</span>
            ) : null}
            {character.currentHP} / {character.maxHP}
          </span>
        </div>
        <Progress value={percent(character.currentHP, character.maxHP)} />
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-medium">SP</span>
          <span className="text-muted-foreground tabular-nums">
            {character.currentSP} / {character.maxSP}
          </span>
        </div>
        <Progress value={percent(character.currentSP, character.maxSP)} />
      </div>

      <dl className="flex flex-col gap-1.5">
        <Stat
          label="Hit Die"
          value={`${character.hitDiceRemaining} / ${character.maxHitDice}`}
        />
        <Stat
          label="Skill Dice"
          value={`${character.skillDiceRemaining} / ${character.maxSkillDice}`}
        />
        <Stat
          label="Prisma"
          value={`${character.prismaCharges} / ${character.prismaMaxCharges}`}
        />
      </dl>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="font-medium">{label}</dt>
      <dd className="text-muted-foreground tabular-nums">{value}</dd>
    </div>
  )
}

/** A current/max pool as an integer 0–100 percentage for the bar, clamped so a
 * malformed pool can't over- or under-fill it. Zero max ⇒ empty. */
function percent(current: number, max: number): number {
  if (max <= 0) return 0
  const clamped = Math.min(Math.max(current, 0), max)
  return Math.round((clamped / max) * 100)
}
