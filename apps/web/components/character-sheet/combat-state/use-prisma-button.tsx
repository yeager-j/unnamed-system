"use client"

import { FlaskIcon } from "@phosphor-icons/react"

import { Button } from "@workspace/ui/components/button"

import { useCharacter, useCharacterWrite } from "@/hooks/use-character"
import { consumePrismaAction } from "@/lib/actions/adjust-pools"

/**
 * The "Use" button on the Combat State Prisma row (UNN-157 follow-up). Spends
 * one Prisma charge through the shared optimistic write path; the decrement
 * re-derives the whole sheet via {@link reduceCharacter}'s `usePrisma` branch.
 */
export function UsePrismaButton() {
  const { prismaCharges } = useCharacter()
  const { pending, write, characterId } = useCharacterWrite()

  return (
    <Button
      size="xs"
      variant="outline"
      disabled={pending || prismaCharges === 0}
      onClick={() =>
        write({
          edit: { kind: "usePrisma" },
          characterClass: "vitals",
          action: (expectedVersion) =>
            consumePrismaAction({ characterId, expectedVersion }),
        })
      }
    >
      <FlaskIcon weight="fill" aria-hidden />
      Use
    </Button>
  )
}
