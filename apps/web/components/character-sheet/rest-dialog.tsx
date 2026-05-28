"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@workspace/ui/components/tabs"

import { dispatchCharacterWriteWithRetry } from "@/hooks/dispatch-character-write"
import { useCharacterTokenRef } from "@/hooks/use-character-token-ref"
import {
  fullRestAction,
  partialRestAction,
  respiteAction,
} from "@/lib/actions/rest"
import { getPathDice, type HydratedCharacter } from "@/lib/game/character"

/**
 * The header-launched Rest dialog (PRD §7.3, UNN-156). Three encounter-time
 * recoveries — Full / Partial / Respite — live behind one trigger because
 * they all mutate the always-visible HP/SP and Dice pools; tabs let the
 * player pick the variant their situation supports without leaving the
 * header. Hit and Skill Dice are surfaced *inside* this dialog (the only
 * place they surface — they exist only for Rest and Level-up per the IA
 * decided in UNN-154).
 *
 * The app never rolls. Partial Rest spends Skill Dice and adds the
 * player-entered SP roll; Respite spends Hit Dice and adds the player-
 * entered HP roll. The die size next to each spend input is the path's
 * published die ({@link getPathDice}) so the player knows what to roll
 * externally. Engine guards (`insufficient-*-dice`) are mirrored by the
 * client form so Submit is disabled before the round-trip, but the server
 * still rejects a tampered payload.
 */

export function RestDialog({
  character,
  open,
  onOpenChange,
}: {
  character: HydratedCharacter
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const versionRef = useCharacterTokenRef(character.vitalsVersion)
  const [pending, startTransition] = useTransition()
  const dice = getPathDice(character.pathChoice)

  function close() {
    onOpenChange(false)
  }

  function dispatch<TError extends string>(
    action: (
      expectedVersion: number
    ) => Promise<
      | { ok: true; value: { version: number } }
      | { ok: false; error: TError | "stale" }
    >,
    insufficientDiceMessage?: string
  ) {
    startTransition(async () => {
      const result = await dispatchCharacterWriteWithRetry({
        characterId: character.id,
        characterClass: "vitals",
        versionRef,
        action,
      })
      if (result.ok) {
        close()
        return
      }
      if (result.error === "stale") {
        toast.error("Couldn't sync — refresh to see the latest.")
      } else if (
        result.error === "insufficient-skill-dice" ||
        result.error === "insufficient-hit-dice"
      ) {
        toast.error(
          insufficientDiceMessage ?? "You don't have that many Dice to spend."
        )
      } else {
        toast.error("Couldn't save. Try again.")
      }
    })
  }

  function handleFullRest() {
    dispatch((expectedVersion) =>
      fullRestAction({ characterId: character.id, expectedVersion })
    )
  }

  function handlePartialRest(skillDiceSpent: number, spRecovered: number) {
    dispatch(
      (expectedVersion) =>
        partialRestAction({
          characterId: character.id,
          skillDiceSpent,
          spRecovered,
          expectedVersion,
        }),
      "You don't have that many Skill Dice to spend."
    )
  }

  function handleRespite(hitDiceSpent: number, hpRecovered: number) {
    dispatch(
      (expectedVersion) =>
        respiteAction({
          characterId: character.id,
          hitDiceSpent,
          hpRecovered,
          expectedVersion,
        }),
      "You don't have that many Hit Dice to spend."
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Rest</DialogTitle>
          <DialogDescription>
            Recover HP and SP between encounters. The app never rolls — enter
            your dice results below.
          </DialogDescription>
        </DialogHeader>

        <DiceReadout
          hitDiceRemaining={character.hitDiceRemaining}
          maxHitDice={character.maxHitDice}
          hitDie={dice.hitDie}
          skillDiceRemaining={character.skillDiceRemaining}
          maxSkillDice={character.maxSkillDice}
          skillDie={dice.skillDie}
        />

        <Tabs defaultValue="full">
          <TabsList>
            <TabsTrigger value="full">Full</TabsTrigger>
            <TabsTrigger value="partial">Partial</TabsTrigger>
            <TabsTrigger value="respite">Respite</TabsTrigger>
          </TabsList>

          <TabsContent value="full">
            <FullRestPanel disabled={pending} onSubmit={handleFullRest} />
          </TabsContent>

          <TabsContent value="partial">
            <PartialRestPanel
              skillDie={dice.skillDie}
              skillDiceRemaining={character.skillDiceRemaining}
              disabled={pending}
              onSubmit={handlePartialRest}
            />
          </TabsContent>

          <TabsContent value="respite">
            <RespitePanel
              hitDie={dice.hitDie}
              hitDiceRemaining={character.hitDiceRemaining}
              disabled={pending}
              onSubmit={handleRespite}
            />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}

function DiceReadout({
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

function FullRestPanel({
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

function PartialRestPanel({
  skillDie,
  skillDiceRemaining,
  disabled,
  onSubmit,
}: {
  skillDie: number
  skillDiceRemaining: number
  disabled: boolean
  onSubmit: (skillDiceSpent: number, spRecovered: number) => void
}) {
  const [diceSpent, setDiceSpent] = useState("0")
  const [spRecovered, setSpRecovered] = useState("0")

  const diceSpentParsed = Number.parseInt(diceSpent, 10)
  const spRecoveredParsed = Number.parseInt(spRecovered, 10)
  const diceInvalid =
    !Number.isFinite(diceSpentParsed) ||
    diceSpentParsed < 0 ||
    diceSpentParsed > skillDiceRemaining
  const spInvalid = !Number.isFinite(spRecoveredParsed) || spRecoveredParsed < 0

  function submit() {
    if (diceInvalid || spInvalid) return
    onSubmit(diceSpentParsed, spRecoveredParsed)
  }

  return (
    <div className="flex flex-col gap-3 pt-3">
      <p className="text-xs/relaxed text-muted-foreground">
        HP restored to max. Roll any number of unspent Skill Dice (d{skillDie})
        and add the total to SP. Dice spent are not regained until a Full Rest.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="partial-skill-dice" className="text-xs">
            Skill Dice to spend
          </Label>
          <Input
            id="partial-skill-dice"
            type="number"
            inputMode="numeric"
            min={0}
            max={skillDiceRemaining}
            value={diceSpent}
            onChange={(event) => setDiceSpent(event.target.value)}
            aria-invalid={diceInvalid || undefined}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="partial-sp-recovered" className="text-xs">
            SP recovered
          </Label>
          <Input
            id="partial-sp-recovered"
            type="number"
            inputMode="numeric"
            min={0}
            value={spRecovered}
            onChange={(event) => setSpRecovered(event.target.value)}
            aria-invalid={spInvalid || undefined}
          />
        </div>
      </div>
      <Button
        onClick={submit}
        disabled={disabled || diceInvalid || spInvalid}
        className="self-end"
      >
        Take Partial Rest
      </Button>
    </div>
  )
}

function RespitePanel({
  hitDie,
  hitDiceRemaining,
  disabled,
  onSubmit,
}: {
  hitDie: number
  hitDiceRemaining: number
  disabled: boolean
  onSubmit: (hitDiceSpent: number, hpRecovered: number) => void
}) {
  const [diceSpent, setDiceSpent] = useState("0")
  const [hpRecovered, setHpRecovered] = useState("0")

  const diceSpentParsed = Number.parseInt(diceSpent, 10)
  const hpRecoveredParsed = Number.parseInt(hpRecovered, 10)
  const diceInvalid =
    !Number.isFinite(diceSpentParsed) ||
    diceSpentParsed < 0 ||
    diceSpentParsed > hitDiceRemaining
  const hpInvalid = !Number.isFinite(hpRecoveredParsed) || hpRecoveredParsed < 0

  function submit() {
    if (diceInvalid || hpInvalid) return
    onSubmit(diceSpentParsed, hpRecoveredParsed)
  }

  return (
    <div className="flex flex-col gap-3 pt-3">
      <p className="text-xs/relaxed text-muted-foreground">
        A brief pause. Roll any number of unspent Hit Dice (d{hitDie}) and add
        the total to HP. SP is not restored. Dice spent are not regained until a
        Full Rest.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="respite-hit-dice" className="text-xs">
            Hit Dice to spend
          </Label>
          <Input
            id="respite-hit-dice"
            type="number"
            inputMode="numeric"
            min={0}
            max={hitDiceRemaining}
            value={diceSpent}
            onChange={(event) => setDiceSpent(event.target.value)}
            aria-invalid={diceInvalid || undefined}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="respite-hp-recovered" className="text-xs">
            HP recovered
          </Label>
          <Input
            id="respite-hp-recovered"
            type="number"
            inputMode="numeric"
            min={0}
            value={hpRecovered}
            onChange={(event) => setHpRecovered(event.target.value)}
            aria-invalid={hpInvalid || undefined}
          />
        </div>
      </div>
      <Button
        onClick={submit}
        disabled={disabled || diceInvalid || hpInvalid}
        className="self-end"
      >
        Take Respite
      </Button>
    </div>
  )
}
