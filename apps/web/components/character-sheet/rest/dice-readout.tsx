/**
 * The Hit / Skill Dice pool readout shown at the top of the Rest dialog. Hit
 * and Skill Dice surface only here and in Level-up (the IA decided in
 * UNN-154), so the dialog leads with the player's current pools and die sizes
 * before offering a variant to spend them on.
 */
export function DiceReadout({
  hitDiceRemaining,
  maxHitDice,
  hitDie,
  skillDiceRemaining,
  maxSkillDice,
  skillDie,
}: {
  hitDiceRemaining: number
  maxHitDice: number
  hitDie: number
  skillDiceRemaining: number
  maxSkillDice: number
  skillDie: number
}) {
  return (
    <dl className="grid grid-cols-2 gap-4 border border-border bg-muted/30 p-3 text-xs">
      <div className="flex flex-col gap-0.5">
        <dt className="text-muted-foreground">Hit Dice · d{hitDie}</dt>
        <dd className="font-medium tabular-nums">
          {hitDiceRemaining} / {maxHitDice}
        </dd>
      </div>
      <div className="flex flex-col gap-0.5">
        <dt className="text-muted-foreground">Skill Dice · d{skillDie}</dt>
        <dd className="font-medium tabular-nums">
          {skillDiceRemaining} / {maxSkillDice}
        </dd>
      </div>
    </dl>
  )
}
