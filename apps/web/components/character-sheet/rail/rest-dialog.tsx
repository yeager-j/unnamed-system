"use client"

import { useState } from "react"

import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@workspace/ui/components/dialog"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@workspace/ui/components/toggle-group"

import type { EntityWrite } from "@/domain/entity/commit/write.schema"
import { useEntityWrite } from "@/hooks/use-entity-write"

type RestVariant = "fullRest" | "partialRest" | "respite"

const VARIANT_COPY: Record<
  RestVariant,
  { label: string; description: string }
> = {
  fullRest: {
    label: "Full Rest",
    description:
      "A night's sleep near Prisma facilities: HP, SP, all dice and Prisma charges restored; Exhaustion eases by one.",
  },
  partialRest: {
    label: "Partial Rest",
    description:
      "A few hours' downtime: HP restored; spend Skill Dice, roll them, and recover that much SP.",
  },
  respite: {
    label: "Respite",
    description:
      "A short breather: spend Hit Dice, roll them, and recover that much HP.",
  },
}

/**
 * The Rest control (rulebook 2.5 via the E2 transitions — the prototype's
 * instant restore-to-max became the Full Rest variant of this dialog). One
 * descriptor per confirm; the dice the table rolled are typed in, and an
 * over-spend refusal (`insufficient-*-dice`) surfaces inline rather than
 * silently clamping.
 */
export function RestDialog() {
  const { dispatch, pending } = useEntityWrite()
  const [open, setOpen] = useState(false)
  const [variant, setVariant] = useState<RestVariant>("fullRest")
  const [diceToSpend, setDiceToSpend] = useState("")
  const [rolled, setRolled] = useState("")
  const [refusal, setRefusal] = useState<string | null>(null)

  const needsDice = variant !== "fullRest"
  const spend = Number.parseInt(diceToSpend, 10)
  const rolledAmount = Number.parseInt(rolled, 10)
  const inputsValid =
    !needsDice ||
    (Number.isInteger(spend) &&
      spend >= 0 &&
      Number.isInteger(rolledAmount) &&
      rolledAmount >= 0)

  const reset = () => {
    setDiceToSpend("")
    setRolled("")
    setRefusal(null)
  }

  const write: EntityWrite =
    variant === "fullRest"
      ? { component: "rest", op: "fullRest" }
      : variant === "partialRest"
        ? {
            component: "rest",
            op: "partialRest",
            skillDiceToSpend: spend,
            rolled: rolledAmount,
          }
        : {
            component: "rest",
            op: "respite",
            hitDiceToSpend: spend,
            rolled: rolledAmount,
          }

  const confirm = () => {
    setRefusal(null)
    dispatch(write, {
      onSuccess: () => {
        reset()
        setOpen(false)
      },
      onError: (error) => {
        if (error === "insufficient-skill-dice") {
          setRefusal("Not enough unspent Skill Dice for that.")
          return true
        }
        if (error === "insufficient-hit-dice") {
          setRefusal("Not enough unspent Hit Dice for that.")
          return true
        }
        return false
      },
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) reset()
      }}
    >
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        Rest
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Rest</DialogTitle>
          <DialogDescription>
            {VARIANT_COPY[variant].description}
          </DialogDescription>
        </DialogHeader>

        <ToggleGroup
          value={[variant]}
          onValueChange={(next: string[]) => {
            const selected = next[0]
            if (selected) {
              setVariant(selected as RestVariant)
              reset()
            }
          }}
          className="w-full"
          aria-label="Rest type"
        >
          {(Object.keys(VARIANT_COPY) as RestVariant[]).map((key) => (
            <ToggleGroupItem key={key} value={key} className="flex-1 text-xs">
              {VARIANT_COPY[key].label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>

        {needsDice ? (
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="rest-dice">
                {variant === "partialRest" ? "Skill Dice" : "Hit Dice"} to spend
              </Label>
              <Input
                id="rest-dice"
                type="number"
                min={0}
                inputMode="numeric"
                value={diceToSpend}
                onChange={(event) => setDiceToSpend(event.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="rest-rolled">
                {variant === "partialRest" ? "SP rolled" : "HP rolled"}
              </Label>
              <Input
                id="rest-rolled"
                type="number"
                min={0}
                inputMode="numeric"
                value={rolled}
                onChange={(event) => setRolled(event.target.value)}
              />
            </div>
          </div>
        ) : null}

        {refusal ? (
          <p role="alert" className="text-sm text-destructive">
            {refusal}
          </p>
        ) : null}

        <DialogFooter>
          <Button disabled={pending || !inputsValid} onClick={confirm}>
            {VARIANT_COPY[variant].label}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
