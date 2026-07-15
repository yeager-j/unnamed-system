"use client"

import {
  ArrowUpRightIcon,
  MoonIcon,
  SparkleIcon,
} from "@phosphor-icons/react/dist/ssr"
import Link from "next/link"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@workspace/ui/components/avatar"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { initials } from "@workspace/ui/lib/initials"
import { cn } from "@workspace/ui/lib/utils"

import { ACTIVITY_CATEGORY_LABELS } from "@/domain/labels"
import type { ParticipantRef } from "@/domain/planner/participant"
import type { RosterGlanceView } from "@/domain/planner/view/glance"
import type { LinkerOption } from "@/domain/planner/view/linker"
import type { RosterRowView } from "@/domain/planner/view/roster"
import {
  deleteActivityAction,
  recordActivityAction,
} from "@/lib/actions/campaign-updates/activity"
import type { UpdateCategory } from "@/lib/db/schema/campaign-updates"
import { characterPath } from "@/lib/paths"

import {
  ActivityComposer,
  type ComposerLastActivity,
} from "../composer/activity-composer"
import { UpdateEntryCard } from "../composer/update-entry-card"
import {
  BondConfirmCard,
  BondProgressHint,
  type BondProgressEntry,
} from "./bond-confirm"
import { useRunnerSelection } from "./runner-selection"

/** A recorded entry, serialized for the workspace (concern labels pre-resolved). */
export interface WorkspaceActivity {
  id: string
  slotId: string
  characterId: string
  body: string
  category: UpdateCategory | null
  concerns: (ParticipantRef & { label: string })[]
}

/**
 * The **downtime resolution workspace** (handoff `.charcard`): the selected
 * character's card — header with the sheet link, the Virtues/Talents glance
 * off the resolve fold, and this slot's recorded entry or the composer.
 * Hub-and-spoke: characters resolve in any order via the roster; the
 * one-click **Idle** mark covers quiet evenings (PRD FR-2).
 */
export function DowntimeWorkspace({
  campaignId,
  slot,
  roster,
  glances,
  activities,
  lastActivityByCharacter,
  linkerOptions,
  bondProgress,
}: {
  campaignId: string
  slot: { id: string; label: string }
  roster: RosterRowView[]
  glances: Record<string, RosterGlanceView>
  activities: WorkspaceActivity[]
  lastActivityByCharacter: Record<string, ComposerLastActivity>
  linkerOptions: LinkerOption[]
  /** Per-NPC bond progress — the inline confirm + counted hint (UNN-581, D8). */
  bondProgress: BondProgressEntry[]
}) {
  const { selectedCharacterId } = useRunnerSelection()
  const [notYetNpcIds, setNotYetNpcIds] = useState<ReadonlySet<string>>(
    new Set()
  )
  const character =
    roster.find((row) => row.id === selectedCharacterId) ?? roster[0] ?? null

  if (character === null) {
    return (
      <p className="mx-auto max-w-md py-10 text-center text-sm text-muted-foreground">
        No characters placed yet — players place theirs from their sheet, or you
        can from Manage.
      </p>
    )
  }

  const glance = glances[character.id]
  const entry =
    activities.find(
      (activity) =>
        activity.characterId === character.id && activity.slotId === slot.id
    ) ?? null

  const entryBonds =
    entry?.category === "collaborator"
      ? bondProgress.filter((bond) =>
          entry.concerns.some(
            (concern) => concern.kind === "npc" && concern.id === bond.npcId
          )
        )
      : []

  return (
    <div className="mx-auto w-full max-w-2xl rounded-[calc(var(--radius)+4px)] border bg-card">
      <header className="flex items-center gap-3 border-b p-5">
        <Avatar className="size-11 rounded-md">
          {character.portraitUrl ? (
            <AvatarImage src={character.portraitUrl} alt="" />
          ) : null}
          <AvatarFallback className="rounded-md">
            {initials(character.name)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-display text-2xl font-bold text-foreground">
            {character.name}
          </h2>
          <p className="text-xs text-muted-foreground">{character.subtitle}</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="shrink-0 text-muted-foreground"
          render={<Link href={characterPath(character.shortId)} />}
          nativeButton={false}
        >
          Open character sheet
          <ArrowUpRightIcon />
        </Button>
      </header>

      {glance ? <GlanceStrip glance={glance} /> : null}

      <div className="flex flex-col gap-4 p-5">
        {entry ? (
          <>
            <RecordedEntry
              campaignId={campaignId}
              slotLabel={slot.label}
              entry={entry}
              linkerOptions={linkerOptions}
            />
            {entryBonds.map((bond) =>
              bond.eligible ? (
                notYetNpcIds.has(bond.npcId) ? null : (
                  <BondConfirmCard
                    key={bond.npcId}
                    campaignId={campaignId}
                    confirm={bond}
                    onNotYet={() =>
                      setNotYetNpcIds(
                        (current) => new Set([...current, bond.npcId])
                      )
                    }
                  />
                )
              ) : (
                <BondProgressHint key={bond.npcId} entry={bond} />
              )
            )}
          </>
        ) : (
          <>
            <ActivityComposer
              campaignId={campaignId}
              target={{
                kind: "slot",
                slotId: slot.id,
                slotLabel: slot.label,
                characterId: character.id,
                characterName: character.name,
                otherCharacters: roster
                  .filter((row) => row.id !== character.id)
                  .map((row) => ({ id: row.id, name: row.name })),
                lastActivity: lastActivityByCharacter[character.id] ?? null,
              }}
              linkerOptions={linkerOptions}
            />
            <IdleMark
              campaignId={campaignId}
              slotId={slot.id}
              characterId={character.id}
              characterName={character.name}
            />
          </>
        )}
      </div>
    </div>
  )
}

/** The handoff `.vitals` strip: Virtues + Sparks on the left, Talents on the right. */
function GlanceStrip({ glance }: { glance: RosterGlanceView }) {
  return (
    <div className="grid gap-4 border-b p-5 sm:grid-cols-[1fr_auto]">
      <div className="min-w-0">
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
            Virtues
          </span>
          <span className="inline-flex items-center gap-1 font-mono text-xs text-gold">
            <SparkleIcon className="size-3.5" />
            Sparks {glance.sparks.current} / {glance.sparks.capacity}
          </span>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 md:grid-cols-4">
          {glance.virtues.map((virtue) => (
            <div key={virtue.key} className="min-w-0">
              <div className="flex items-baseline justify-between gap-1 text-xs">
                <span className="truncate">{virtue.label}</span>
                <span className="font-mono text-muted-foreground">
                  {virtue.rank}
                </span>
              </div>
              <div className="mt-1 flex gap-0.5">
                {Array.from({ length: virtue.max }, (_, index) => (
                  <span
                    key={index}
                    className={cn(
                      "h-1.5 flex-1 rounded-full",
                      index < virtue.rank ? "bg-gold" : "bg-muted/60"
                    )}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="min-w-0 sm:max-w-52 sm:border-l sm:pl-4">
        <span className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
          Talents
        </span>
        <div className="mt-2 flex flex-wrap gap-1">
          {glance.talents.length === 0 ? (
            <span className="text-xs text-muted-foreground">None yet</span>
          ) : (
            glance.talents.map((talent) => (
              <Badge key={talent} variant="outline" className="text-xs">
                {talent}
              </Badge>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

function RecordedEntry({
  campaignId,
  slotLabel,
  entry,
  linkerOptions,
}: {
  campaignId: string
  slotLabel: string
  entry: WorkspaceActivity
  linkerOptions: LinkerOption[]
}) {
  const [editing, setEditing] = useState(false)
  const [, startTransition] = useTransition()

  if (editing && entry.category !== null) {
    return (
      <ActivityComposer
        campaignId={campaignId}
        target={{
          kind: "slot",
          slotId: entry.slotId,
          slotLabel,
          characterId: entry.characterId,
          characterName: "",
          otherCharacters: [],
          lastActivity: null,
        }}
        linkerOptions={linkerOptions}
        edit={{
          updateId: entry.id,
          body: entry.body,
          category: entry.category,
          concerns: entry.concerns,
        }}
        onDone={() => setEditing(false)}
      />
    )
  }

  const remove = () =>
    startTransition(async () => {
      const result = await deleteActivityAction({
        campaignId,
        updateId: entry.id,
      })
      if (!result.ok) toast.error("Couldn't delete the entry. Try again.")
    })

  return (
    <UpdateEntryCard
      badgeLabel={
        entry.category
          ? `${slotLabel} · ${ACTIVITY_CATEGORY_LABELS[entry.category]}`
          : slotLabel
      }
      body={entry.body}
      isIdle={entry.category === "idle"}
      pills={entry.concerns.map((concern) => ({
        kind: concern.kind,
        id: concern.id,
        label: concern.label,
      }))}
      onEdit={() => setEditing(true)}
      onDelete={remove}
    />
  )
}

function IdleMark({
  campaignId,
  slotId,
  characterId,
  characterName,
}: {
  campaignId: string
  slotId: string
  characterId: string
  characterName: string
}) {
  const [, startTransition] = useTransition()

  const markIdle = () =>
    startTransition(async () => {
      const result = await recordActivityAction({
        campaignId,
        slotId,
        characterId,
        body: "",
        category: "idle",
        concerns: [],
        alsoCharacterIds: [],
      })
      if (!result.ok) toast.error("Couldn't mark idle. Try again.")
    })

  return (
    <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
      <span>Quiet evening?</span>
      <Button variant="ghost" size="sm" className="text-xs" onClick={markIdle}>
        <MoonIcon className="size-3.5" />
        Mark {characterName} idle
      </Button>
    </div>
  )
}
