"use client"

import { FlaskIcon } from "@phosphor-icons/react"
import { useOptimistic, useTransition } from "react"
import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"

import { dispatchCharacterWriteWithRetry } from "@/hooks/dispatch-character-write"
import { useCharacterTokenRef } from "@/hooks/use-character-token-ref"
import { consumePrismaAction } from "@/lib/actions/adjust-pools"

/**
 * The "Use" button on the Combat State Prisma row (UNN-157 follow-up). Same
 * vitals-class dispatch the header owner-actions used to host, narrowed to a
 * single action so the version ref and optimistic decrement live next to the
 * sole consumer of this state — Combat State is the readout's home now (PRD
 * §7.6).
 */
export function UsePrismaButton({
  characterId,
  prismaCharges,
  vitalsVersion,
}: {
  characterId: string
  prismaCharges: number
  vitalsVersion: number
}) {
  const versionRef = useCharacterTokenRef(vitalsVersion)
  const [pending, startTransition] = useTransition()
  const [optimisticCharges, applyOptimistic] = useOptimistic(
    prismaCharges,
    (current: number) => Math.max(0, current - 1)
  )

  const disabled = pending || optimisticCharges === 0

  function handleClick() {
    startTransition(async () => {
      applyOptimistic(undefined)
      const result = await dispatchCharacterWriteWithRetry({
        characterId,
        characterClass: "vitals",
        versionRef,
        action: (expectedVersion) =>
          consumePrismaAction({ characterId, expectedVersion }),
      })
      if (result.ok) return
      if (result.error === "stale") {
        toast.error("Couldn't sync — refresh to see the latest.")
      } else {
        toast.error("Couldn't save. Try again.")
      }
    })
  }

  return (
    <Button
      size="xs"
      variant="outline"
      disabled={disabled}
      onClick={handleClick}
    >
      <FlaskIcon weight="fill" aria-hidden />
      Use
    </Button>
  )
}
