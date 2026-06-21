"use client"

import { useTransition } from "react"
import { toast } from "sonner"

import { getPathDice } from "@workspace/game/engine"
import { type HydratedCharacter } from "@workspace/game/foundation"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@workspace/ui/components/tabs"

import { dispatchCharacterWriteWithRetry } from "@/hooks/dispatch-character-write"
import { useMonotonicVersionRef } from "@/hooks/use-monotonic-version-ref"
import {
  fullRestAction,
  partialRestAction,
  respiteAction,
} from "@/lib/actions/rest"

import { DiceReadout } from "./rest/dice-readout"
import { FullRestForm } from "./rest/full-rest-form"
import { PartialRestForm } from "./rest/partial-rest-form"
import { RespiteForm } from "./rest/respite-form"

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
 * client forms so Submit is disabled before the round-trip, but the server
 * still rejects a tampered payload.
 *
 * This root owns only the dialog chrome and dispatch wiring; the dice readout
 * and the three rest variants live in `./rest/`.
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
  const versionRef = useMonotonicVersionRef(character.vitalsVersion)
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
        surface: "rest",
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
            <FullRestForm disabled={pending} onSubmit={handleFullRest} />
          </TabsContent>

          <TabsContent value="partial">
            <PartialRestForm
              skillDie={dice.skillDie}
              skillDiceRemaining={character.skillDiceRemaining}
              disabled={pending}
              onSubmit={handlePartialRest}
            />
          </TabsContent>

          <TabsContent value="respite">
            <RespiteForm
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
