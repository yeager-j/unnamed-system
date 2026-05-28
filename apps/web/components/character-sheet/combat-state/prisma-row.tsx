import { OwnerOnly } from "@/components/shell/viewer-role"

import { UsePrismaButton } from "./use-prisma-button"

/**
 * The Prisma readout on the Combat State card (PRD §7.6, UNN-157 follow-up).
 * Persistent charge count visible to everyone — Prisma's "consumable, not a
 * summary statistic" rationale (former §7.6) only argued against putting it
 * in the always-visible at-a-glance header; surfacing it next to other
 * encounter-time state (Ailment, Exhaustion) is consistent with the rest of
 * this card. The owner-only Use action lives inline so the player can spend a
 * charge without leaving the tab they're already playing on.
 */
export function PrismaRow({
  characterId,
  prismaCharges,
  vitalsVersion,
}: {
  characterId: string
  prismaCharges: number
  vitalsVersion: number
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        Prisma
      </p>
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium tabular-nums">
          {prismaCharges} {prismaCharges === 1 ? "Charge" : "Charges"}
        </span>
        <OwnerOnly>
          <UsePrismaButton
            characterId={characterId}
            prismaCharges={prismaCharges}
            vitalsVersion={vitalsVersion}
          />
        </OwnerOnly>
      </div>
    </div>
  )
}
