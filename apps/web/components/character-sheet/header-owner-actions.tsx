"use client"

import {
  BedIcon,
  CaretDownIcon,
  HeartIcon,
  LightningIcon,
  TrophyIcon,
} from "@phosphor-icons/react"
import { useState } from "react"

import { canLevelUp, VICTORIES_PER_LEVEL } from "@workspace/game/engine"
import { Button } from "@workspace/ui/components/button"
import { ButtonGroup } from "@workspace/ui/components/button-group"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"

import {
  AdjustPoolDialog,
  AdjustPoolPopover,
} from "@/components/shared/adjust-pool-controls"
import { useCharacter, useCharacterWrite } from "@/hooks/use-character"
import {
  damageAction,
  healAction,
  recoverSPAction,
  spendSPAction,
} from "@/lib/actions/adjust-pools"
import { awardVictoriesAction } from "@/lib/actions/leveling"

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
 * forms in [@/components/shared/adjust-pool-controls.tsx](../shared/adjust-pool-controls.tsx)), Rest
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
 * Two independent write classes share this affordance: HP/SP are vitals-class
 * (a `pools`-surface {@link useCharacterWrite}, riding the provider's shared
 * `vitals` token); Victories ± is progression-class (its own
 * {@link useCharacterWrite} on the `progression` token). Each keeps its own
 * `pending` so a Victories click doesn't disable Adjust HP. Server
 * `revalidateCharacter` is the source of truth on success; the optimistic state
 * here only covers the in-flight frame and keeps disabled-by-zero correct under
 * rapid clicks.
 */

/** The slot a mobile dropdown-menu item routes an "Adjust" choice into. */
type MobileFormMode = "hp" | "sp" | "victories" | null

export function HeaderOwnerActions() {
  const character = useCharacter()
  // Two write surfaces so HP/SP (vitals) and Victories (progression) keep
  // independent `pending` — a Victories click shouldn't disable Adjust HP.
  const pools = useCharacterWrite()
  const victories = useCharacterWrite()
  const [mobileForm, setMobileForm] = useState<MobileFormMode>(null)
  const [restOpen, setRestOpen] = useState(false)
  const [levelUpOpen, setLevelUpOpen] = useState(false)
  const levelUpReady = canLevelUp(character)
  const optimisticVictories = character.victories

  function handleDamage(amount: number) {
    pools.write({
      edit: { kind: "damage", amount },
      surface: "pools",
      action: (expectedVersion) =>
        damageAction({ characterId: character.id, amount, expectedVersion }),
    })
  }

  function handleHeal(amount: number) {
    pools.write({
      edit: { kind: "heal", amount },
      surface: "pools",
      action: (expectedVersion) =>
        healAction({ characterId: character.id, amount, expectedVersion }),
    })
  }

  function handleSpendSP(amount: number) {
    pools.write({
      edit: { kind: "spendSP", amount },
      surface: "pools",
      action: (expectedVersion) =>
        spendSPAction({ characterId: character.id, amount, expectedVersion }),
    })
  }

  function handleRecoverSP(amount: number) {
    pools.write({
      edit: { kind: "recoverSP", amount },
      surface: "pools",
      action: (expectedVersion) =>
        recoverSPAction({ characterId: character.id, amount, expectedVersion }),
    })
  }

  function handleAwardVictories(amount: VictoriesAmount) {
    victories.write({
      edit: { kind: "victories", delta: amount },
      surface: "victories",
      action: (expectedVersion) =>
        awardVictoriesAction({
          characterId: character.id,
          amount,
          expectedVersion,
        }),
    })
  }

  const pending = pools.pending
  const victoriesPending = victories.pending
  const undoDisabled = optimisticVictories === 0

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
          busy={pending}
          onDecrement={handleDamage}
          onIncrement={handleHeal}
        />
        <AdjustPoolPopover
          label="Adjust SP"
          icon={<LightningIcon weight="fill" aria-hidden />}
          decrementLabel="Spend SP"
          incrementLabel="Recover SP"
          busy={pending}
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
          busy={victoriesPending}
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
          busy={victoriesPending}
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
