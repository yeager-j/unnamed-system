"use client"

import {
  CaretDownIcon,
  FlaskIcon,
  HeartIcon,
  LightningIcon,
} from "@phosphor-icons/react"
import { useOptimistic, useState, useTransition } from "react"
import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"
import { ButtonGroup } from "@workspace/ui/components/button-group"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"

import { dispatchCharacterWriteWithRetry } from "@/hooks/dispatch-character-write"
import { useCharacterTokenRef } from "@/hooks/use-character-token-ref"
import {
  consumePrismaAction,
  damageAction,
  healAction,
  recoverSPAction,
  spendSPAction,
} from "@/lib/actions/adjust-pools"
import type { HydratedCharacter } from "@/lib/game/character"

/**
 * The header's owner-mode actions affordance (PRD §6.1 / §7.6, UNN-155).
 * Damage and Heal share an "Adjust HP" form (one amount input + two action
 * buttons) and Spend/Recover SP share an "Adjust SP" form so the row stays
 * narrow as siblings (Rest, Level-up) join it. "Use Prisma (n)" is a
 * one-click decrement; the player adjusts HP manually for the MVP per PRD
 * §7.6.
 *
 * The render forks responsively. On `md+` the three controls sit inline as
 * popover triggers (matches the Virtues affordance idiom). On narrow
 * viewports they collapse into a single "Actions" dropdown so the header
 * doesn't widen — selecting Adjust HP or Adjust SP opens a centered Dialog
 * with the same form, Use Prisma fires directly from the menu. Both
 * branches dispatch through the same handlers; only the chrome differs.
 *
 * All five writes are vitals-class, so they share one
 * {@link useCharacterTokenRef} on `vitalsVersion` and one optimistic state
 * keyed by `(currentHP, currentSP, prismaCharges)`. The Vitals card itself
 * still re-renders via `revalidateCharacter`; the optimistic state here
 * keeps the Prisma label accurate between dispatch and revalidate and
 * disables the disabled-by-zero path correctly under rapid clicks.
 */

type Pools = {
  currentHP: number
  currentSP: number
  prismaCharges: number
}

type Mutation =
  | { kind: "damage"; amount: number }
  | { kind: "heal"; amount: number }
  | { kind: "spend-sp"; amount: number }
  | { kind: "recover-sp"; amount: number }
  | { kind: "use-prisma" }

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
    case "use-prisma":
      return {
        ...current,
        prismaCharges: Math.max(0, current.prismaCharges - 1),
      }
  }
}

/** The slot a mobile dropdown-menu item routes an "Adjust" choice into. */
type MobileFormMode = "hp" | "sp" | null

export function HeaderOwnerActions({
  character,
}: {
  character: HydratedCharacter
}) {
  const versionRef = useCharacterTokenRef(character.vitalsVersion)
  const [pending, startTransition] = useTransition()
  const [mobileForm, setMobileForm] = useState<MobileFormMode>(null)

  const base: Pools = {
    currentHP: character.currentHP,
    currentSP: character.currentSP,
    prismaCharges: character.prismaCharges,
  }
  const [pools, applyOptimistic] = useOptimistic(
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

  function handleUsePrisma() {
    dispatch({ kind: "use-prisma" }, (expectedVersion) =>
      consumePrismaAction({ characterId: character.id, expectedVersion })
    )
  }

  const prismaLabel = `Use Prisma (${pools.prismaCharges})`
  const prismaDisabled = pending || pools.prismaCharges === 0

  return (
    <>
      {/* Inline affordance: md+ viewports. */}
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
        <Button
          size="sm"
          variant="outline"
          disabled={prismaDisabled}
          onClick={handleUsePrisma}
        >
          <FlaskIcon weight="fill" aria-hidden />
          {prismaLabel}
        </Button>
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
            <DropdownMenuItem
              disabled={prismaDisabled}
              onClick={handleUsePrisma}
            >
              <FlaskIcon weight="fill" aria-hidden />
              {prismaLabel}
            </DropdownMenuItem>
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
      </div>
    </>
  )
}

function AdjustPoolForm({
  inputId,
  decrementLabel,
  incrementLabel,
  onDecrement,
  onIncrement,
  onAfterSubmit,
}: {
  inputId: string
  decrementLabel: string
  incrementLabel: string
  onDecrement: (amount: number) => void
  onIncrement: (amount: number) => void
  onAfterSubmit: () => void
}) {
  const [amount, setAmount] = useState("1")

  function submit(handler: (amount: number) => void) {
    const parsed = Number.parseInt(amount, 10)
    if (!Number.isFinite(parsed) || parsed <= 0) return
    handler(parsed)
    setAmount("1")
    onAfterSubmit()
  }

  return (
    <div className="flex flex-col gap-3">
      <Label htmlFor={inputId} className="text-xs">
        Amount
      </Label>
      <Input
        id={inputId}
        type="number"
        inputMode="numeric"
        min={1}
        value={amount}
        onChange={(event) => setAmount(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault()
            submit(onDecrement)
          }
        }}
        autoFocus
      />
      <div className="grid grid-cols-2 gap-1.5">
        <Button
          size="sm"
          variant="destructive"
          onClick={() => submit(onDecrement)}
        >
          {decrementLabel}
        </Button>
        <Button size="sm" onClick={() => submit(onIncrement)}>
          {incrementLabel}
        </Button>
      </div>
    </div>
  )
}

function AdjustPoolPopover({
  label,
  icon,
  decrementLabel,
  incrementLabel,
  disabled,
  onDecrement,
  onIncrement,
}: {
  label: string
  icon: React.ReactNode
  decrementLabel: string
  incrementLabel: string
  disabled: boolean
  onDecrement: (amount: number) => void
  onIncrement: (amount: number) => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            size="sm"
            variant="outline"
            disabled={disabled}
            aria-label={label}
          >
            {icon}
            {label}
          </Button>
        }
      />
      <PopoverContent align="end" sideOffset={6} className="w-60">
        <AdjustPoolForm
          inputId={`${label}-amount`}
          decrementLabel={decrementLabel}
          incrementLabel={incrementLabel}
          onDecrement={onDecrement}
          onIncrement={onIncrement}
          onAfterSubmit={() => setOpen(false)}
        />
      </PopoverContent>
    </Popover>
  )
}

function AdjustPoolDialog({
  open,
  onOpenChange,
  title,
  decrementLabel,
  incrementLabel,
  onDecrement,
  onIncrement,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  decrementLabel: string
  incrementLabel: string
  onDecrement: (amount: number) => void
  onIncrement: (amount: number) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="sr-only">
            Enter an amount, then choose {decrementLabel} or {incrementLabel}.
          </DialogDescription>
        </DialogHeader>
        <AdjustPoolForm
          inputId={`${title}-mobile-amount`}
          decrementLabel={decrementLabel}
          incrementLabel={incrementLabel}
          onDecrement={onDecrement}
          onIncrement={onIncrement}
          onAfterSubmit={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  )
}
