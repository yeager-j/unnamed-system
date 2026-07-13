"use client"

import {
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { Textarea } from "@workspace/ui/components/textarea"

import { ParticipantPill } from "@/components/shared/participant-pill"
import { ACTIVITY_CATEGORY_LABELS } from "@/domain/labels"
import type { ParticipantRef } from "@/domain/planner/participant"
import type { LinkerOption } from "@/domain/planner/view/linker"
import { authorWorldUpdateAction } from "@/lib/actions/campaign-updates/world-update"
import type { UpdateCategory } from "@/lib/db/schema/campaign-updates"
import { guardWriteTransition } from "@/lib/sync/guard-write-transition"

import { ParticipantLinker } from "../world/participant-linker"

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

/**
 * The **world-update composer** (UNN-579; D10's entity-page mount — Day-End
 * and the Chronicle mount the same thing in phase 7): a slot-less update
 * primaried on the page's entity, stamped on the clock's `currentDay` the
 * moment it's captured. Lean sibling of `ActivityComposer` — no slot, no
 * copy affordances, the primary is fixed and displayed, category optional.
 */
export function WorldUpdateComposer({
  campaignId,
  primary,
  primaryLabel,
  currentDay,
  linkerOptions,
}: {
  campaignId: string
  primary: ParticipantRef
  primaryLabel: string
  currentDay: number
  linkerOptions: LinkerOption[]
}) {
  const [body, setBody] = useState("")
  const [category, setCategory] = useState<UpdateCategory | null>(null)
  const [concerns, setConcerns] = useState<ParticipantRef[]>([])
  const [isPending, startTransition] = useTransition()

  const addConcern = (ref: ParticipantRef) =>
    setConcerns((current) =>
      current.some((c) => c.kind === ref.kind && c.id === ref.id) ||
      (ref.kind === primary.kind && ref.id === primary.id)
        ? current
        : [...current, ref]
    )

  const submit = () =>
    startTransition(() =>
      guardWriteTransition(
        async () => {
          const result = await authorWorldUpdateAction({
            campaignId,
            primary: { kind: primary.kind, id: primary.id },
            body,
            category,
            concerns: concerns.map(({ kind, id }) => ({ kind, id })),
          })
          if (!result.ok) {
            toast.error("Couldn't record the update. Try again.")
            return
          }
          setBody("")
          setCategory(null)
          setConcerns([])
        },
        () => toast.error("Couldn't record the update. Try again.")
      )
    )

  return (
    <div className="flex flex-col gap-2 rounded-lg border p-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>Record an update about</span>
        <ParticipantPill kind={primary.kind} label={primaryLabel} />
        <span className="ml-auto font-mono">Day {currentDay}</span>
      </div>
      <Textarea
        value={body}
        onChange={(event) => setBody(event.target.value)}
        placeholder="What just happened, while it's fresh…"
        rows={2}
      />
      <div className="flex flex-wrap items-center gap-1.5">
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="outline" size="sm" />}>
            <TagIcon />
            {category === null
              ? "Category"
              : ACTIVITY_CATEGORY_LABELS[category]}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {PICKABLE_CATEGORIES.map((option) => {
              const Icon = CATEGORY_ICONS[option]
              return (
                <DropdownMenuItem
                  key={option}
                  onClick={() => setCategory(option)}
                >
                  <Icon className="size-4" />
                  {ACTIVITY_CATEGORY_LABELS[option]}
                </DropdownMenuItem>
              )
            })}
            {category !== null ? (
              <DropdownMenuItem onClick={() => setCategory(null)}>
                <XIcon className="size-4" />
                No category
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
        <ParticipantLinker
          campaignId={campaignId}
          options={linkerOptions}
          trigger={
            <Button variant="outline" size="sm" aria-label="Link a participant">
              <PlusIcon />
              Concerns
            </Button>
          }
          onPick={addConcern}
        />
        {concerns.map((concern) => (
          <button
            key={`${concern.kind}:${concern.id}`}
            type="button"
            aria-label={`Remove ${concern.label ?? "participant"}`}
            onClick={() =>
              setConcerns((current) =>
                current.filter(
                  (c) => !(c.kind === concern.kind && c.id === concern.id)
                )
              )
            }
          >
            <ParticipantPill
              kind={concern.kind}
              label={concern.label ?? ""}
              className="hover:opacity-70"
            />
          </button>
        ))}
        <Button
          size="sm"
          className="ml-auto"
          disabled={body.trim() === "" || isPending}
          onClick={submit}
        >
          Record
        </Button>
      </div>
    </div>
  )
}
