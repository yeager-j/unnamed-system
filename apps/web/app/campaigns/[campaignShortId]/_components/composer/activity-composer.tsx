"use client"

import {
  ArrowCounterClockwiseIcon,
  CheckIcon,
  HammerIcon,
  MedalIcon,
  PlusIcon,
  SparkleIcon,
  TagIcon,
  UsersThreeIcon,
  XIcon,
} from "@phosphor-icons/react/dist/ssr"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"
import { Checkbox } from "@workspace/ui/components/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"
import { Textarea } from "@workspace/ui/components/textarea"
import { cn } from "@workspace/ui/lib/utils"

import { PARTICIPANT_KIND_ICONS } from "@/components/shared/participant-kind-icons"
import {
  ACTIVITY_CATEGORY_DESCRIPTIONS,
  ACTIVITY_CATEGORY_LABELS,
} from "@/domain/labels"
import type { ParticipantRef } from "@/domain/planner/participant"
import type { LinkerOption } from "@/domain/planner/view/linker"
import {
  editActivityAction,
  recordActivityAction,
} from "@/lib/actions/campaign-updates/activity"
import type { UpdateCategory } from "@/lib/db/schema/campaign-updates"
import { guardWriteTransition } from "@/lib/sync/guard-write-transition"

import { ParticipantLinker } from "../world/participant-linker"

const ACTIVITY_ERROR_COPY: Record<string, string> = {
  "not-current-day":
    "The clock has moved — this slot isn't today anymore. Refresh.",
  "already-recorded": "That character already recorded this slot.",
  "slot-not-found": "That slot no longer exists — refresh the page.",
  "update-not-found": "That entry is gone — refresh the page.",
  "clock-not-found": "The clock is gone — refresh the page.",
  "invalid-ref": "One of the linked participants no longer exists.",
  "invalid-input": "Couldn't save — that input doesn't look right.",
}

/** The categories the dropdown offers — Idle records via the one-click mark, not here. */
const PICKABLE_CATEGORIES = [
  "virtue",
  "talent",
  "practical",
  "collaborator",
] as const

const CATEGORY_ICONS: Record<
  (typeof PICKABLE_CATEGORIES)[number],
  React.ComponentType<{ className?: string }>
> = {
  virtue: SparkleIcon,
  talent: MedalIcon,
  practical: HammerIcon,
  collaborator: UsersThreeIcon,
}

/** A recorded entry's editable content, seeding the composer's edit mode. */
export interface ComposerEditTarget {
  updateId: string
  body: string
  category: UpdateCategory
  concerns: ParticipantRef[]
}

/** The composer's repeat-last seed: the character's previous entry. */
export interface ComposerLastActivity {
  body: string
  category: UpdateCategory
  concerns: ParticipantRef[]
}

/**
 * The **activity composer** (handoff "the core primitive"; D10 mounts it in
 * four places across the phases — the downtime workspace is the first):
 * prose, a category, and linked concerns, recorded as one `campaignUpdate`
 * row. Carries §2's copy affordances: category pre-fill from the character's
 * previous entry, "repeat last activity", and "copy to other characters"
 * (one row each, D3). Editing reuses the same surface over the same row.
 */
export function ActivityComposer({
  campaignId,
  slotId,
  slotLabel,
  characterId,
  characterName,
  linkerOptions,
  otherCharacters,
  lastActivity,
  edit,
  onDone,
}: {
  campaignId: string
  slotId: string
  slotLabel: string
  characterId: string
  characterName: string
  linkerOptions: LinkerOption[]
  /** Roster minus this character — the copy-to-others targets. */
  otherCharacters: { id: string; name: string }[]
  lastActivity: ComposerLastActivity | null
  /** When set, the composer edits this entry instead of recording a new one. */
  edit?: ComposerEditTarget
  /** Called after a successful record/edit (and on edit-cancel). */
  onDone?: () => void
}) {
  const [body, setBody] = useState(edit?.body ?? "")
  const [category, setCategory] = useState<UpdateCategory | null>(
    edit?.category ?? lastActivity?.category ?? null
  )
  const [concerns, setConcerns] = useState<ParticipantRef[]>(
    edit?.concerns ?? []
  )
  const [copyIds, setCopyIds] = useState<Set<string>>(new Set())
  const [isPending, startTransition] = useTransition()

  const canSubmit = body.trim() !== "" && category !== null

  const submit = () => {
    if (!canSubmit) return
    startTransition(() =>
      guardWriteTransition(
        async () => {
          const content = {
            body: body.trim(),
            category: category!,
            concerns: concerns.map(({ kind, id }) => ({ kind, id })),
          }
          if (edit) {
            const result = await editActivityAction({
              campaignId,
              updateId: edit.updateId,
              ...content,
            })
            if (!result.ok) {
              toast.error(
                ACTIVITY_ERROR_COPY[result.error] ?? "Couldn't save. Try again."
              )
              return
            }
          } else {
            const result = await recordActivityAction({
              campaignId,
              slotId,
              characterId,
              alsoCharacterIds: [...copyIds],
              ...content,
            })
            if (!result.ok) {
              toast.error(
                ACTIVITY_ERROR_COPY[result.error] ??
                  "Couldn't record. Try again."
              )
              return
            }
            if (result.value.skippedCharacterIds.length > 0) {
              toast.info(
                `Skipped ${result.value.skippedCharacterIds.length} — already recorded.`
              )
            }
          }
          setBody("")
          setConcerns([])
          setCategory(null)
          setCopyIds(new Set())
          onDone?.()
        },
        () => toast.error("Couldn't record. Try again.")
      )
    )
  }

  const repeatLast = () => {
    if (!lastActivity) return
    setBody(lastActivity.body)
    setCategory(lastActivity.category)
    setConcerns(lastActivity.concerns)
  }

  const addConcern = (ref: ParticipantRef) =>
    setConcerns((current) =>
      current.some((c) => c.kind === ref.kind && c.id === ref.id)
        ? current
        : [...current, ref]
    )

  return (
    <div className="rounded-lg border bg-input/30 transition-colors focus-within:border-ring focus-within:ring-1 focus-within:ring-ring/50">
      <div className="flex items-center justify-between px-3 pt-2">
        <span className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
          {edit ? `Editing · ${slotLabel}` : slotLabel}
        </span>
        {!edit && lastActivity ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-xs text-muted-foreground"
            onClick={repeatLast}
          >
            <ArrowCounterClockwiseIcon className="size-3.5" />
            Repeat last activity
          </Button>
        ) : null}
      </div>
      <Textarea
        value={body}
        onChange={(event) => setBody(event.target.value)}
        placeholder={`What did ${characterName} do?`}
        aria-label={`${characterName}'s activity`}
        className="min-h-21 resize-none rounded-none border-0 bg-transparent shadow-none focus-visible:ring-0 dark:bg-transparent"
      />
      <div className="flex flex-wrap items-center gap-1.5 px-2 pb-2">
        <ParticipantLinker
          campaignId={campaignId}
          options={linkerOptions}
          trigger={
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Link a concern"
              className="text-muted-foreground"
            >
              <PlusIcon />
            </Button>
          }
          onPick={addConcern}
        />
        {concerns.map((ref) => {
          const Icon = PARTICIPANT_KIND_ICONS[ref.kind]
          return (
            <span
              key={`${ref.kind}:${ref.id}`}
              className={cn(
                "inline-flex items-center gap-1 rounded-full py-0.5 pr-1 pl-2 text-xs font-medium",
                ref.kind === "npc"
                  ? "bg-primary/16 text-primary-text"
                  : "bg-muted/55 text-foreground"
              )}
            >
              <Icon aria-hidden className="size-3 shrink-0" />
              {ref.label ?? ref.id}
              <button
                type="button"
                aria-label={`Remove ${ref.label ?? "concern"}`}
                className="rounded-full p-0.5 hover:bg-foreground/10"
                onClick={() =>
                  setConcerns((current) =>
                    current.filter(
                      (c) => !(c.kind === ref.kind && c.id === ref.id)
                    )
                  )
                }
              >
                <XIcon className="size-3" />
              </button>
            </span>
          )
        })}
        <div className="ml-auto flex items-center gap-1.5">
          {!edit && otherCharacters.length > 0 ? (
            <CopyToOthers
              otherCharacters={otherCharacters}
              copyIds={copyIds}
              onChange={setCopyIds}
            />
          ) : null}
          <CategoryPicker category={category} onPick={setCategory} />
          <Button
            size="icon"
            aria-label={edit ? "Save changes" : "Record activity"}
            disabled={!canSubmit && !isPending}
            onClick={submit}
          >
            <CheckIcon />
          </Button>
        </div>
      </div>
    </div>
  )
}

function CategoryPicker({
  category,
  onPick,
}: {
  category: UpdateCategory | null
  onPick: (category: UpdateCategory) => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant={category === null ? "outline" : "secondary"}
            size="sm"
          />
        }
      >
        <TagIcon className="size-4" />
        {category === null
          ? "Activity type"
          : ACTIVITY_CATEGORY_LABELS[category]}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="top" className="min-w-72">
        <div className="px-2 py-1.5 font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
          What is this activity?
        </div>
        {PICKABLE_CATEGORIES.map((key) => {
          const Icon = CATEGORY_ICONS[key]
          return (
            <DropdownMenuItem key={key} onClick={() => onPick(key)}>
              <Icon className="size-4" />
              <span className="font-medium">
                {ACTIVITY_CATEGORY_LABELS[key]}
              </span>
              <span className="ml-auto text-xs text-muted-foreground">
                {ACTIVITY_CATEGORY_DESCRIPTIONS[key]}
              </span>
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function CopyToOthers({
  otherCharacters,
  copyIds,
  onChange,
}: {
  otherCharacters: { id: string; name: string }[]
  copyIds: Set<string>
  onChange: (next: Set<string>) => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant={copyIds.size > 0 ? "secondary" : "ghost"}
            size="sm"
            className="text-xs"
          />
        }
      >
        <UsersThreeIcon className="size-4" />
        {copyIds.size > 0 ? `Copy to ${copyIds.size}` : "Copy to others"}
      </PopoverTrigger>
      <PopoverContent align="end" side="top" className="w-60 p-2">
        <p className="px-1 pb-2 text-xs text-muted-foreground">
          Record this same entry for other characters too.
        </p>
        <div className="flex flex-col gap-1">
          {otherCharacters.map((character) => (
            <label
              key={character.id}
              className="flex items-center gap-2 rounded-sm px-1.5 py-1 text-sm hover:bg-accent"
            >
              <Checkbox
                checked={copyIds.has(character.id)}
                onCheckedChange={(checked) => {
                  const next = new Set(copyIds)
                  if (checked === true) next.add(character.id)
                  else next.delete(character.id)
                  onChange(next)
                }}
              />
              <span className="truncate">{character.name}</span>
            </label>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
