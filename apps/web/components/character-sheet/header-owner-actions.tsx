"use client"

import {
  BedIcon,
  CaretDownIcon,
  HeartIcon,
  LightningIcon,
  TrophyIcon,
} from "@phosphor-icons/react"
import { useOptimistic, useState, useTransition } from "react"
import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"
import { ButtonGroup } from "@workspace/ui/components/button-group"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"

import { dispatchCharacterWriteWithRetry } from "@/hooks/dispatch-character-write"
import { useCharacterTokenRef } from "@/hooks/use-character-token-ref"
import {
  damageAction,
  healAction,
  recoverSPAction,
  spendSPAction,
} from "@/lib/actions/adjust-pools"
import { awardVictoriesAction } from "@/lib/actions/leveling"
import {
  canLevelUp,
  VICTORIES_PER_LEVEL,
  type HydratedCharacter,
} from "@/lib/game/character"

import { AdjustPoolDialog, AdjustPoolPopover } from "./adjust-pool-controls"
import { LevelUpDialog } from "./level-up-dialog"
import { RestDialog } from "./rest-dialog"
import {
  VictoriesDialog,
  VictoriesPopover,
  type VictoriesAmount,
} from "./victories-controls"

/**
 * The header's owner-mode actions affordance (PRD §6.1, UNN-155 / UNN-156 /
 * UNN-157). Orchestrates five controls: Adjust HP and Adjust SP (popover
 * forms in [./adjust-pool-controls.tsx](./adjust-pool-controls.tsx)), Rest
 * (opens [./rest-dialog.tsx](./rest-dialog.tsx)), Victories ± (popover in
 * [./victories-controls.tsx](./victories-controls.tsx)), and the Level-up
 * CTA (opens [./level-up-dialog.tsx](./level-up-dialog.tsx)) that only
 * appears when {@link canLevelUp} is true. Use Prisma lives on the Combat
 * State card now (PRD §7.6) — it isn't part of this affordance.
 *
 * The render forks responsively. On `md+` the controls sit inline as
 * popover / button triggers (matches the Virtues affordance idiom). On
 * narrow viewports they collapse into a single "Actions" dropdown so the
 * header doesn't widen — selecting Adjust HP / Adjust SP / Victories opens
 * a centered Dialog with the same form, Rest / Level up open their feature
 * dialogs directly. Both branches dispatch through the same handlers; only
 * the chrome differs.
 *
 * Two independent write classes share this affordance: HP/SP are
 * vitals-class (one {@link useCharacterTokenRef} on `vitalsVersion` and one
 * optimistic state); Victories ± is progression-class (its own ref + its
 * own optimistic counter). Server `revalidateCharacter` is the source of
 * truth on success; the optimistic state here only covers the in-flight
 * frame and keeps disabled-by-zero correct under rapid clicks.
 */

type Pools = {
  currentHP: number
  currentSP: number
}

type Mutation =
  | { kind: "damage"; amount: number }
  | { kind: "heal"; amount: number }
  | { kind: "spend-sp"; amount: number }
  | { kind: "recover-sp"; amount: number }

function reducePools(
  current: Pools,
  mutation: Mutation,
  maxHP: number,
  maxSP: number
): Pools {
  switch (mutation.kind) {
    case "damage":
      return {
        ...current,
        currentHP: Math.max(0, current.currentHP - mutation.amount),
      }
    case "heal":
      return {
        ...current,
        currentHP: Math.min(maxHP, current.currentHP + mutation.amount),
      }
    case "spend-sp":
      return {
        ...current,
        currentSP: Math.max(0, current.currentSP - mutation.amount),
      }
    case "recover-sp":
      return {
        ...current,
        currentSP: Math.min(maxSP, current.currentSP + mutation.amount),
      }
  }
}

/** The slot a mobile dropdown-menu item routes an "Adjust" choice into. */
type MobileFormMode = "hp" | "sp" | "victories" | null

export function HeaderOwnerActions({
  character,
}: {
  character: HydratedCharacter
}) {
  const versionRef = useCharacterTokenRef(character.vitalsVersion)
  const progressionVersionRef = useCharacterTokenRef(
    character.progressionVersion
  )
  const [pending, startTransition] = useTransition()
  const [victoriesPending, startVictoriesTransition] = useTransition()
  const [mobileForm, setMobileForm] = useState<MobileFormMode>(null)
  const [restOpen, setRestOpen] = useState(false)
  const [levelUpOpen, setLevelUpOpen] = useState(false)
  const [optimisticVictories, applyOptimisticVictories] = useOptimistic(
    character.victories,
    (current: number, delta: number) => Math.max(0, current + delta)
  )
  const levelUpReady = canLevelUp(character)

  const base: Pools = {
    currentHP: character.currentHP,
    currentSP: character.currentSP,
  }
  const [, applyOptimistic] = useOptimistic(
    base,
    (current: Pools, mutation: Mutation): Pools =>
      reducePools(current, mutation, character.maxHP, character.maxSP)
  )

  function dispatch<TError extends string>(
    mutation: Mutation,
    action: (
      expectedVersion: number
    ) => Promise<
      | { ok: true; value: { version: number } }
      | { ok: false; error: TError | "stale" }
    >
  ) {
    startTransition(async () => {
      applyOptimistic(mutation)
      const result = await dispatchCharacterWriteWithRetry({
        characterId: character.id,
        characterClass: "vitals",
        versionRef,
        action,
      })
      if (result.ok) return
      if (result.error === "stale") {
        toast.error("Couldn't sync — refresh to see the latest.")
      } else {
        toast.error("Couldn't save. Try again.")
      }
    })
  }

  function handleDamage(amount: number) {
    dispatch({ kind: "damage", amount }, (expectedVersion) =>
      damageAction({ characterId: character.id, amount, expectedVersion })
    )
  }

  function handleHeal(amount: number) {
    dispatch({ kind: "heal", amount }, (expectedVersion) =>
      healAction({ characterId: character.id, amount, expectedVersion })
    )
  }

  function handleSpendSP(amount: number) {
    dispatch({ kind: "spend-sp", amount }, (expectedVersion) =>
      spendSPAction({ characterId: character.id, amount, expectedVersion })
    )
  }

  function handleRecoverSP(amount: number) {
    dispatch({ kind: "recover-sp", amount }, (expectedVersion) =>
      recoverSPAction({ characterId: character.id, amount, expectedVersion })
    )
  }

  function handleAwardVictories(amount: VictoriesAmount) {
    startVictoriesTransition(async () => {
      applyOptimisticVictories(amount)
      const result = await dispatchCharacterWriteWithRetry({
        characterId: character.id,
        characterClass: "progression",
        versionRef: progressionVersionRef,
        action: (expectedVersion) =>
          awardVictoriesAction({
            characterId: character.id,
            amount,
            expectedVersion,
          }),
      })
      if (result.ok) return
      if (result.error === "stale") {
        toast.error("Couldn't sync — refresh to see the latest.")
      } else {
        toast.error("Couldn't save. Try again.")
      }
    })
  }

  const undoDisabled = victoriesPending || optimisticVictories === 0

  return (
    <>
      {/* Inline affordance: md+ viewports. The row sits in the bottom-left of
          the header card (its own slot under the portrait + identity block),
          so it has the full left-column width to stretch out — labels stay
          on. Mobile collapses into the "Actions" dropdown below. */}
      <ButtonGroup className="hidden md:flex" aria-label="Owner actions">
        <AdjustPoolPopover
          label="Adjust HP"
          icon={<HeartIcon weight="fill" aria-hidden />}
          decrementLabel="Take damage"
          incrementLabel="Heal"
          disabled={pending}
          onDecrement={handleDamage}
          onIncrement={handleHeal}
        />
        <AdjustPoolPopover
          label="Adjust SP"
          icon={<LightningIcon weight="fill" aria-hidden />}
          decrementLabel="Spend SP"
          incrementLabel="Recover SP"
          disabled={pending}
          onDecrement={handleSpendSP}
          onIncrement={handleRecoverSP}
        />
        <Button size="sm" variant="outline" onClick={() => setRestOpen(true)}>
          <BedIcon weight="fill" aria-hidden />
          Rest
        </Button>
        <VictoriesPopover
          victories={optimisticVictories}
          undoDisabled={undoDisabled}
          disabled={victoriesPending}
          onAward={handleAwardVictories}
        />
        {levelUpReady ? (
          <Button
            size="sm"
            variant="default"
            onClick={() => setLevelUpOpen(true)}
          >
            <TrophyIcon weight="fill" aria-hidden />
            Level up
          </Button>
        ) : null}
      </ButtonGroup>

      {/* Collapsed affordance: narrow viewports. */}
      <div className="md:hidden">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button size="sm" variant="outline">
                Actions
                <CaretDownIcon weight="bold" aria-hidden />
              </Button>
            }
          />
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setMobileForm("hp")}>
              <HeartIcon weight="fill" aria-hidden />
              Adjust HP
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setMobileForm("sp")}>
              <LightningIcon weight="fill" aria-hidden />
              Adjust SP
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setRestOpen(true)}>
              <BedIcon weight="fill" aria-hidden />
              Rest
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setMobileForm("victories")}>
              <TrophyIcon weight="fill" aria-hidden />
              Victories ({optimisticVictories}/{VICTORIES_PER_LEVEL})
            </DropdownMenuItem>
            {levelUpReady ? (
              <DropdownMenuItem onClick={() => setLevelUpOpen(true)}>
                <TrophyIcon weight="fill" aria-hidden />
                Level up
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>

        <AdjustPoolDialog
          open={mobileForm === "hp"}
          onOpenChange={(next) => setMobileForm(next ? "hp" : null)}
          title="Adjust HP"
          decrementLabel="Take damage"
          incrementLabel="Heal"
          onDecrement={handleDamage}
          onIncrement={handleHeal}
        />
        <AdjustPoolDialog
          open={mobileForm === "sp"}
          onOpenChange={(next) => setMobileForm(next ? "sp" : null)}
          title="Adjust SP"
          decrementLabel="Spend SP"
          incrementLabel="Recover SP"
          onDecrement={handleSpendSP}
          onIncrement={handleRecoverSP}
        />
        <VictoriesDialog
          open={mobileForm === "victories"}
          onOpenChange={(next) => setMobileForm(next ? "victories" : null)}
          victories={optimisticVictories}
          undoDisabled={undoDisabled}
          disabled={victoriesPending}
          onAward={(amount) => {
            handleAwardVictories(amount)
            setMobileForm(null)
          }}
        />
      </div>

      <RestDialog
        character={character}
        open={restOpen}
        onOpenChange={setRestOpen}
      />
      <LevelUpDialog
        character={character}
        open={levelUpOpen}
        onOpenChange={setLevelUpOpen}
      />
    </>
  )
}
