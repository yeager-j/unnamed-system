"use client"

import { FlagBannerIcon } from "@phosphor-icons/react/dist/ssr"
import Link from "next/link"
import { useState } from "react"

import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"

import { ACTIVITY_CATEGORY_LABELS } from "@/domain/labels"
import {
  blockingDeadlines,
  type DatedDeadline,
} from "@/domain/planner/deadline"
import type { RosterRowView } from "@/domain/planner/view/roster"
import { campaignCalendarPath } from "@/lib/paths"

const NO_RESOLVED: ReadonlySet<string> = new Set()

/** The montage's pickable categories — Idle is what *skipping* a character already says. */
const MONTAGE_CATEGORIES = [
  "virtue",
  "talent",
  "practical",
  "collaborator",
] as const

type MontageCategory = (typeof MONTAGE_CATEGORIES)[number]

/** One montage entry as the skip wire carries it (the advance schema's shape). */
export interface SkipMontageEntry {
  characterId: string
  body: string
  category: MontageCategory
}

/**
 * The time-skip dialog (D1): days + the optional **montage pass** — one
 * free-text entry per character for the skipped stretch, landing as a
 * categorized update on the arrival day, so a skip doesn't erase the
 * downtime pillar. Blank rows simply don't ride along; skipping with every
 * row blank is legal. The advance gate previews reactively: a landing day at
 * or past an unresolved deadline shows the blockers and holds the skip (the
 * server re-checks in the transaction regardless).
 */
export function SkipDialog({
  currentDay,
  deadlines,
  roster,
  campaignShortId,
  onOpenChange,
  onSkip,
}: {
  currentDay: number
  deadlines: DatedDeadline[]
  roster: RosterRowView[]
  campaignShortId: string
  onOpenChange: (open: boolean) => void
  onSkip: (days: number, montage: SkipMontageEntry[]) => void
}) {
  const [skipDays, setSkipDays] = useState("3")
  const [drafts, setDrafts] = useState<
    Record<string, { body: string; category: MontageCategory }>
  >({})

  const days = Number.parseInt(skipDays, 10)
  const validDays = Number.isInteger(days) && days >= 1
  const blockers = validDays
    ? blockingDeadlines(deadlines, currentDay + days, NO_RESOLVED)
    : []

  const draftFor = (characterId: string) =>
    drafts[characterId] ?? { body: "", category: "practical" as const }
  const patchDraft = (
    characterId: string,
    patch: Partial<{ body: string; category: MontageCategory }>
  ) =>
    setDrafts((current) => ({
      ...current,
      [characterId]: { ...draftFor(characterId), ...patch },
    }))

  const submit = () => {
    if (!validDays || blockers.length > 0) return
    const montage: SkipMontageEntry[] = roster
      .map((character) => ({
        characterId: character.id,
        ...draftFor(character.id),
      }))
      .filter((entry) => entry.body.trim() !== "")
      .map((entry) => ({ ...entry, body: entry.body.trim() }))
    onSkip(days, montage)
    onOpenChange(false)
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Skip ahead</DialogTitle>
          <DialogDescription>
            Advances the clock several days at once and sets up slots for every
            day skipped.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <Label htmlFor="skip-days">Days</Label>
          <Input
            id="skip-days"
            type="number"
            min={1}
            max={365}
            value={skipDays}
            onChange={(event) => setSkipDays(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") submit()
            }}
          />
          {validDays ? (
            <p className="text-sm text-muted-foreground">
              Lands on Day {currentDay + days}.
            </p>
          ) : null}
        </div>
        {blockers.length > 0 ? (
          <div className="grid gap-1.5 rounded-md border border-destructive/45 bg-destructive/10 p-3">
            <p className="text-sm font-medium text-destructive">
              Time can&apos;t skip past an unresolved deadline:
            </p>
            {blockers.map((deadline) => (
              <p
                key={deadline.id}
                className="flex items-center gap-2 text-sm text-destructive"
              >
                <FlagBannerIcon weight="fill" className="size-3.5 shrink-0" />
                <span className="min-w-0 truncate">{deadline.name}</span>
                <span className="ml-auto shrink-0 font-mono text-xs tabular-nums">
                  Day {deadline.datedDay}
                </span>
              </p>
            ))}
            <Button
              variant="outline"
              size="sm"
              className="mt-1 justify-self-start"
              render={<Link href={campaignCalendarPath(campaignShortId)} />}
              nativeButton={false}
            >
              Resolve on the Calendar
            </Button>
          </div>
        ) : null}
        {roster.length > 0 && blockers.length === 0 ? (
          <div className="grid gap-2">
            <Label>
              Montage{" "}
              <span className="font-normal text-muted-foreground">
                — what did they do with{" "}
                {validDays
                  ? days === 1
                    ? "the day"
                    : `these ${days} days`
                  : "the time"}
                ? (optional)
              </span>
            </Label>
            <div className="grid gap-1.5">
              {roster.map((character) => {
                const draft = draftFor(character.id)
                return (
                  <div key={character.id} className="flex items-center gap-1.5">
                    <span className="w-24 shrink-0 truncate text-sm font-medium">
                      {character.name}
                    </span>
                    <Select
                      value={draft.category}
                      onValueChange={(category) =>
                        patchDraft(character.id, {
                          category: category as MontageCategory,
                        })
                      }
                    >
                      <SelectTrigger
                        size="sm"
                        className="w-32 shrink-0"
                        aria-label={`${character.name}'s montage category`}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {MONTAGE_CATEGORIES.map((category) => (
                          <SelectItem key={category} value={category}>
                            {ACTIVITY_CATEGORY_LABELS[category]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      value={draft.body}
                      placeholder="Kept watch on the road north…"
                      onChange={(event) =>
                        patchDraft(character.id, { body: event.target.value })
                      }
                    />
                  </div>
                )
              })}
            </div>
          </div>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={blockers.length > 0}>
            Skip ahead
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
