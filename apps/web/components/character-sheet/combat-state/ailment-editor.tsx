"use client"

import { PencilSimpleIcon, PlusIcon } from "@phosphor-icons/react"

import { Button } from "@workspace/ui/components/button"
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@workspace/ui/components/popover"
import { Separator } from "@workspace/ui/components/separator"
import { Toggle } from "@workspace/ui/components/toggle"

import { useViewerRole } from "@/components/shell/viewer-role"
import { useCharacter, useCharacterWrite } from "@/hooks/use-character"
import { setAilmentsAction } from "@/lib/actions/combat-state"
import { AILMENTS, getAilment } from "@/lib/game/combat"

import { AilmentEntries, AilmentList } from "./ailment-list"

const DOWNED_KEY = "downed"

/**
 * Pure helpers for the "one non-Downed ailment + optional Downed" UI
 * convention. The server schema is intentionally permissive (state.ts:122-129)
 * — these helpers shape the array the picker writes back so the typical
 * convention stays one click away while custom combinations remain possible
 * by editing through the data model directly.
 */
function withDownedToggled(
  ailments: readonly string[],
  downed: boolean
): string[] {
  const others = ailments.filter((key) => key !== DOWNED_KEY)
  return downed ? [DOWNED_KEY, ...others] : others
}

function withNonDownedSelection(
  ailments: readonly string[],
  next: string | null
): string[] {
  const downed = ailments.includes(DOWNED_KEY)
  const base = downed ? [DOWNED_KEY] : []
  return next ? [...base, next] : base
}

/**
 * The Ailment readout on the Combat State card. In public mode this is a
 * straight pass-through to {@link AilmentList}. In owner mode the readout
 * becomes a popover trigger that opens an editor (Downed pinned at top, the
 * 11 other ailments as a single-select list below). Reuses the same vitals-
 * class optimistic-write plumbing as the other Combat State editors.
 */
export function AilmentEditor() {
  const role = useViewerRole()
  const { ailments } = useCharacter()
  if (role !== "owner") return <AilmentList ailmentKeys={ailments} />

  return <OwnerAilmentEditor />
}

function OwnerAilmentEditor() {
  const { ailments: optimisticAilments } = useCharacter()
  const { pending, write, characterId } = useCharacterWrite()

  function dispatch(next: string[]) {
    write({
      edit: { kind: "ailments", ailments: next },
      surface: "ailments",
      action: (expectedVersion) =>
        setAilmentsAction({ characterId, ailments: next, expectedVersion }),
    })
  }

  const downed = optimisticAilments.includes(DOWNED_KEY)
  const nonDowned = optimisticAilments.find((key) => key !== DOWNED_KEY) ?? null
  const isEmpty = optimisticAilments.length === 0

  return (
    <div className="col-span-2 flex flex-col gap-1.5">
      <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        Ailment
      </p>
      <Popover>
        <PopoverTrigger
          render={
            <button
              type="button"
              disabled={pending}
              aria-label={isEmpty ? "Set ailment" : "Edit ailments"}
              className="group/ailment-trigger -my-1 -ml-2 flex items-center justify-between gap-2 rounded-none px-2 py-1 text-left transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none disabled:opacity-50"
            />
          }
        >
          {isEmpty ? (
            <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
              <PlusIcon weight="bold" aria-hidden className="size-3.5" />
              Set ailment
            </span>
          ) : (
            <div className="flex-1">
              <AilmentEntries ailmentKeys={optimisticAilments} />
            </div>
          )}
          {!isEmpty ? (
            <PencilSimpleIcon
              aria-hidden
              className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/ailment-trigger:opacity-100 group-focus-visible/ailment-trigger:opacity-100"
            />
          ) : null}
        </PopoverTrigger>
        <PopoverContent
          align="start"
          sideOffset={6}
          className="w-72 gap-0 p-0"
          initialFocus={false}
        >
          <PopoverHeader className="gap-1 p-3 pb-2">
            <PopoverTitle>Ailment</PopoverTitle>
            <PopoverDescription>
              One at a time. Downed stacks with another.
            </PopoverDescription>
          </PopoverHeader>
          <div className="flex flex-col gap-0.5 px-2 pb-1">
            <DownedRow
              downed={downed}
              disabled={pending}
              onToggle={(next) =>
                dispatch(withDownedToggled(optimisticAilments, next))
              }
            />
          </div>
          <Separator />
          <div className="flex max-h-72 flex-col gap-0.5 overflow-y-auto px-2 py-1">
            {AILMENTS.filter((ailment) => ailment.key !== DOWNED_KEY).map(
              (ailment) => {
                const selected = nonDowned === ailment.key
                return (
                  <AilmentRow
                    key={ailment.key}
                    label={ailment.name}
                    description={ailment.description}
                    selected={selected}
                    disabled={pending}
                    onToggle={(next) =>
                      dispatch(
                        withNonDownedSelection(
                          optimisticAilments,
                          next ? ailment.key : null
                        )
                      )
                    }
                  />
                )
              }
            )}
          </div>
          {!isEmpty ? (
            <>
              <Separator />
              <div className="p-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start"
                  disabled={pending}
                  onClick={() => dispatch([])}
                >
                  Clear ailments
                </Button>
              </div>
            </>
          ) : null}
        </PopoverContent>
      </Popover>
    </div>
  )
}

function DownedRow({
  downed,
  disabled,
  onToggle,
}: {
  downed: boolean
  disabled: boolean
  onToggle: (next: boolean) => void
}) {
  const canonical = getAilment(DOWNED_KEY)
  return (
    <Toggle
      pressed={downed}
      disabled={disabled}
      onPressedChange={onToggle}
      className="h-auto w-full justify-start px-2 py-2 text-left"
    >
      <span className="flex flex-1 flex-col gap-0.5">
        <span className="text-xs font-medium">
          {canonical?.name ?? "Downed"}
        </span>
        {canonical ? (
          <span className="text-xs whitespace-normal text-muted-foreground">
            {canonical.description}
          </span>
        ) : null}
      </span>
    </Toggle>
  )
}

function AilmentRow({
  label,
  description,
  selected,
  disabled,
  onToggle,
}: {
  label: string
  description: string
  selected: boolean
  disabled: boolean
  onToggle: (next: boolean) => void
}) {
  return (
    <Toggle
      pressed={selected}
      disabled={disabled}
      onPressedChange={onToggle}
      className="h-auto w-full justify-start px-2 py-1.5 text-left"
    >
      <span className="flex flex-1 flex-col gap-0.5">
        <span className="text-xs font-medium">{label}</span>
        <span className="text-xs whitespace-normal text-muted-foreground">
          {description}
        </span>
      </span>
    </Toggle>
  )
}
