import { Button } from "@workspace/ui/components/button"

/**
 * The Full Rest variant: no dice to spend, just a confirm. Restores HP/SP to
 * max, regains all spent Hit and Skill Dice, clears a level of Exhaustion, and
 * refills Prisma.
 */
export function FullRestForm({
  disabled,
  onSubmit,
}: {
  disabled: boolean
  onSubmit: () => void
}) {
  return (
    <div className="flex flex-col gap-3 pt-3">
      <p className="text-xs/relaxed text-muted-foreground">
        HP and SP restored to max, all spent Hit and Skill Dice regained, one
        level of Exhaustion cleared, Prisma refilled.
      </p>
      <Button onClick={onSubmit} disabled={disabled} className="self-end">
        Take Full Rest
      </Button>
    </div>
  )
}
