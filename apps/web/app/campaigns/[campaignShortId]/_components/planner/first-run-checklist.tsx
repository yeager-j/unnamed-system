"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { cn } from "@workspace/ui/lib/utils"

import { Sparkle } from "@/components/shared/celestial"
import { startClockAction } from "@/lib/actions/campaign-clock/start"

/**
 * The Day Runner's pre-clock empty state (UNN-574 D10): the three-step
 * first-run checklist. Step one — "Start the clock" — is live, with the
 * starting-day input for a table adopting a mid-flight campaign; steps two
 * and three name what's coming so the empty planner reads as a path, not a
 * dead end. On success the `revalidatePath` refresh swaps this for the
 * runner.
 */
export function FirstRunChecklist({ campaignId }: { campaignId: string }) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [startingDay, setStartingDay] = useState("1")

  const startTheClock = () => {
    const day = Number.parseInt(startingDay, 10)
    if (!Number.isInteger(day) || day < 1) {
      toast.error("The starting day needs to be a whole number, 1 or higher.")
      return
    }
    startTransition(async () => {
      const result = await startClockAction({ campaignId, startingDay: day })
      if (!result.ok) {
        if (result.error === "clock-exists") {
          router.refresh()
          return
        }
        toast.error("Couldn't start the clock — try again.")
      }
    })
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-1 items-start justify-center p-6 pt-12 md:pt-20">
        <div className="flex w-full max-w-md flex-col gap-8">
          <div className="flex flex-col items-center gap-3 text-center">
            <Sparkle className="size-8 text-gold" />
            <h1 className="font-display text-3xl text-foreground">
              Set the stage
            </h1>
            <p className="text-sm text-balance text-muted-foreground">
              The planner runs on the campaign clock — numbered in-game days,
              each with time slots for scenes and downtime. Three steps and
              you&apos;re running days.
            </p>
          </div>

          <ol className="flex flex-col gap-3">
            <ChecklistStep
              step={1}
              title="Start the clock"
              description="Mint the first day. Already mid-campaign? Start at whatever day your table is on."
              active
            >
              <div className="flex items-end gap-2">
                <div className="grid flex-1 gap-1.5">
                  <Label htmlFor="starting-day">Starting day</Label>
                  <Input
                    id="starting-day"
                    type="number"
                    min={1}
                    value={startingDay}
                    onChange={(event) => setStartingDay(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") startTheClock()
                    }}
                  />
                </div>
                <Button onClick={startTheClock}>Start the clock</Button>
              </div>
            </ChecklistStep>
            <ChecklistStep
              step={2}
              title="Add your first beats"
              description="Prep the scenes you plan to run in Session Notes — the notebook on the rail."
            />
            <ChecklistStep
              step={3}
              title="Mint the NPCs you already know"
              description="The people and threats of your world, linkable everywhere — the mask on the rail."
            />
          </ol>
        </div>
      </div>
    </div>
  )
}

function ChecklistStep({
  step,
  title,
  description,
  active = false,
  children,
}: {
  step: number
  title: string
  description: string
  active?: boolean
  children?: React.ReactNode
}) {
  return (
    <li
      className={cn(
        "flex flex-col gap-3 rounded-lg border bg-card p-4",
        active ? "border-primary/50" : "opacity-60"
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "flex size-6 shrink-0 items-center justify-center rounded-full font-mono text-xs",
            active
              ? "bg-primary text-primary-foreground"
              : "border text-muted-foreground"
          )}
        >
          {step}
        </span>
        <div className="grid gap-0.5">
          <span className="font-medium text-foreground">{title}</span>
          <span className="text-sm text-muted-foreground">{description}</span>
        </div>
      </div>
      {children}
    </li>
  )
}
