"use client"

import { LockIcon, PlusIcon, XIcon } from "@phosphor-icons/react"
import { useMemo, useState } from "react"

import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Input } from "@workspace/ui/components/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"

import { OwnerOnly, useViewerRole } from "@/components/shell/viewer-role"
import { useCharacter, useCharacterWrite } from "@/hooks/use-character"
import {
  addGainedTalentAction,
  removeGainedTalentAction,
} from "@/lib/actions/character-talents"
import { getArchetype } from "@/lib/game/archetypes"
import { getTalent, TALENT_KEYS, type TalentKey } from "@/lib/game/character"

const labelFor = (key: TalentKey): string => getTalent(key)?.name ?? key

const compareLabel = (a: TalentKey, b: TalentKey) =>
  labelFor(a).localeCompare(labelFor(b))

/**
 * Talents block on the Explore tab (PRD §6.1 / §5.3, UNN-222). Owners can
 * add any canonical Talent at any time (no downtime gating — that happens
 * at the table) and remove anything they explicitly added; Talents granted
 * by the active Archetype are marked inherited and stay locked. Non-owners
 * (and signed-out viewers) see the same chip grid without the controls.
 *
 * Writes flow through the identity-class retry pipeline. Optimistic state
 * is held over `gainedTalents` so a click updates the chip list before the
 * server round-trip; the surrounding `OwnerOnly` only governs *whether*
 * controls render — `requireOwner` is the canonical authorization gate.
 */
export function Talents() {
  const role = useViewerRole()
  const character = useCharacter()
  const { pending, write, characterId } = useCharacterWrite()
  const optimisticGained = character.gainedTalents

  const inheritedKeys = useMemo<TalentKey[]>(() => {
    const archetype = character.activeArchetypeKey
      ? getArchetype(character.activeArchetypeKey)
      : null
    return archetype?.talents ?? []
  }, [character.activeArchetypeKey])

  const inheritedSet = useMemo(() => new Set(inheritedKeys), [inheritedKeys])
  const gainedSorted = useMemo(
    () => [...optimisticGained].sort(compareLabel),
    [optimisticGained]
  )
  const inheritedSorted = useMemo(
    () => [...inheritedKeys].sort(compareLabel),
    [inheritedKeys]
  )

  const knownSet = useMemo(
    () => new Set<TalentKey>([...inheritedKeys, ...optimisticGained]),
    [inheritedKeys, optimisticGained]
  )
  const remainingTalents = useMemo(
    () => TALENT_KEYS.filter((key) => !knownSet.has(key)).sort(compareLabel),
    [knownSet]
  )

  function handleAdd(talentKey: TalentKey) {
    write({
      edit: { kind: "talentAdd", talentKey },
      characterClass: "identity",
      action: (expectedVersion) =>
        addGainedTalentAction({ characterId, talentKey, expectedVersion }),
      messages: {
        stale:
          "Someone else updated this character — refresh to see the latest.",
        error: "Couldn't add Talent. Try again.",
      },
      // Cross-tab race: the talent is already gained — the next prop sync
      // reflects it, so there's nothing to surface.
      onError: (error) => error === "duplicate-talent",
    })
  }

  function handleRemove(talentKey: TalentKey) {
    write({
      edit: { kind: "talentRemove", talentKey },
      characterClass: "identity",
      action: (expectedVersion) =>
        removeGainedTalentAction({ characterId, talentKey, expectedVersion }),
      messages: { error: "Couldn't remove Talent. Try again." },
    })
  }

  const allKeys = [...inheritedSorted, ...gainedSorted]
  const isOwner = role === "owner"

  return (
    <Card>
      <CardHeader>
        <CardTitle>Talents</CardTitle>
        <OwnerOnly>
          <CardAction>
            <AddTalentPopover
              remainingTalents={remainingTalents}
              disabled={pending}
              onPick={handleAdd}
            />
          </CardAction>
        </OwnerOnly>
      </CardHeader>
      <CardContent>
        {allKeys.length === 0 ? (
          <p className="text-sm text-muted-foreground">None recorded.</p>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {allKeys.map((key) => {
              const inherited = inheritedSet.has(key)
              return (
                <li key={key}>
                  <TalentChip
                    label={labelFor(key)}
                    inherited={inherited}
                    removable={isOwner && !inherited}
                    disabled={pending}
                    onRemove={() => handleRemove(key)}
                  />
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

function TalentChip({
  label,
  inherited,
  removable,
  disabled,
  onRemove,
}: {
  label: string
  inherited: boolean
  removable: boolean
  disabled: boolean
  onRemove: () => void
}) {
  return (
    <Badge
      variant="secondary"
      className="gap-1 py-1 pr-1.5 pl-2 text-xs font-normal"
    >
      {inherited ? (
        <LockIcon weight="bold" className="size-3 opacity-60" aria-hidden />
      ) : null}
      <span>{label}</span>
      {removable ? (
        <button
          type="button"
          onClick={onRemove}
          disabled={disabled}
          aria-label={`Remove ${label}`}
          className="ml-0.5 inline-flex size-4 items-center justify-center rounded-none opacity-60 hover:opacity-100 disabled:pointer-events-none disabled:opacity-40"
        >
          <XIcon weight="bold" className="size-3" aria-hidden />
        </button>
      ) : null}
    </Badge>
  )
}

function AddTalentPopover({
  remainingTalents,
  disabled,
  onPick,
}: {
  remainingTalents: TalentKey[]
  disabled: boolean
  onPick: (key: TalentKey) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return remainingTalents
    return remainingTalents.filter((key) =>
      labelFor(key).toLowerCase().includes(needle)
    )
  }, [query, remainingTalents])

  const noneLeft = remainingTalents.length === 0

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setQuery("")
      }}
    >
      <PopoverTrigger
        render={
          <Button
            size="sm"
            variant="outline"
            disabled={disabled || noneLeft}
            aria-label="Add Talent"
          >
            <PlusIcon weight="bold" aria-hidden />
            Add Talent
          </Button>
        }
      />
      <PopoverContent align="end" sideOffset={6} className="w-64 p-0">
        <div className="flex flex-col">
          <div className="border-b border-border p-2">
            <Input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search Talents…"
              className="h-8"
            />
          </div>
          <ul className="max-h-64 overflow-y-auto">
            {filtered.length === 0 ? (
              <li className="px-3 py-4 text-center text-xs text-muted-foreground">
                No matching Talents.
              </li>
            ) : (
              filtered.map((key) => (
                <li key={key}>
                  <button
                    type="button"
                    onClick={() => {
                      onPick(key)
                      setOpen(false)
                      setQuery("")
                    }}
                    className="flex w-full items-center px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground"
                  >
                    {labelFor(key)}
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      </PopoverContent>
    </Popover>
  )
}
