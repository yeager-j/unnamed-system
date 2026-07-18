"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"
import { Field, FieldLabel } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { Spinner } from "@workspace/ui/components/spinner"

import { WANDERING_INTERVAL_OPTIONS } from "@/domain/labels"
import { regionErrorMessage } from "@/lib/actions/region/error-message"
import { updateRegionSettingsAction } from "@/lib/actions/region/update-settings"
import { guardWriteTransition } from "@/lib/sync/guard-write-transition"

/** The table Select's "no wandering table" sentinel — Base UI `SelectItem` values
 *  can't be empty, so absent `settings.wanderingTableKey` shows as this value. */
const NO_TABLE = "none"

/** The authored settings this form edits — the plain projection of the Region's
 *  `settings` blob (the app tier is gated against engine types). */
type RegionSettingsProp = {
  wanderingTableKey?: string
  wanderingIntervalTurns?: 1 | 2 | 3 | 6
}

/**
 * The Region's authored-settings form on its detail page (UNN-589 D7) — its name
 * and its wandering-monster default (which table, and how often). These are
 * **defaults** stamped onto each expedition at mint; a running expedition keeps the
 * values it started with, so this is a plain form-state-plus-Save surface, **not**
 * an autosave one. The seed Map + Template Set bindings are fixed at create (a
 * rebind would orphan the folds), so they aren't editable here.
 *
 * Save round-trips the single `version` optimistic token; a `stale` result (someone
 * else edited the Region) toasts and `router.refresh()`es to pull the latest rather
 * than clobbering it. Every other refusal maps through {@link regionErrorMessage}.
 */
export function RegionSettingsForm({
  regionId,
  version,
  name: initialName,
  settings,
  tables,
}: {
  regionId: string
  version: number
  name: string
  settings: RegionSettingsProp
  tables: { key: string; name: string }[]
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const [name, setName] = useState(initialName)
  const [wanderingTableKey, setWanderingTableKey] = useState(
    settings.wanderingTableKey ?? NO_TABLE
  )
  const [intervalTurns, setIntervalTurns] = useState<1 | 2 | 3 | 6>(
    settings.wanderingIntervalTurns ?? 6
  )

  const hasTable = wanderingTableKey !== NO_TABLE

  function onSave() {
    const trimmed = name.trim()
    if (!trimmed) return

    startTransition(() =>
      guardWriteTransition(
        async () => {
          const result = await updateRegionSettingsAction({
            regionId,
            expectedVersion: version,
            name: trimmed,
            settings: {
              wanderingTableKey: hasTable ? wanderingTableKey : undefined,
              wanderingIntervalTurns: hasTable ? intervalTurns : undefined,
            },
          })
          if (result.ok) {
            toast.success("Region settings saved.")
            return
          }
          toast.error(regionErrorMessage(result.error))
          if (result.error === "stale") router.refresh()
        },
        () => toast.error("Couldn't save the settings. Try again.")
      )
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <Field>
        <FieldLabel htmlFor="region-settings-name">Name</FieldLabel>
        <Input
          id="region-settings-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={100}
        />
      </Field>

      <Field>
        <FieldLabel htmlFor="region-settings-table">Wandering table</FieldLabel>
        <Select
          value={wanderingTableKey}
          onValueChange={(value) => setWanderingTableKey(value ?? NO_TABLE)}
        >
          <SelectTrigger
            id="region-settings-table"
            disabled={tables.length === 0}
          >
            <SelectValue>
              {tables.find((table) => table.key === wanderingTableKey)
                ?.name ?? <span className="text-muted-foreground">None</span>}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_TABLE}>None</SelectItem>
            {tables.map((table) => (
              <SelectItem key={table.key} value={table.key}>
                {table.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      {hasTable ? (
        <Field>
          <FieldLabel htmlFor="region-settings-interval">Fires</FieldLabel>
          <Select
            value={String(intervalTurns)}
            onValueChange={(value) =>
              setIntervalTurns(Number(value) as 1 | 2 | 3 | 6)
            }
          >
            <SelectTrigger id="region-settings-interval">
              <SelectValue>
                {
                  WANDERING_INTERVAL_OPTIONS.find(
                    (option) => option.turns === intervalTurns
                  )?.label
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {WANDERING_INTERVAL_OPTIONS.map((option) => (
                <SelectItem key={option.turns} value={String(option.turns)}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      ) : null}

      <Button
        type="button"
        className="self-start"
        onClick={onSave}
        disabled={isPending || !name.trim()}
      >
        {isPending ? <Spinner /> : null}
        Save
      </Button>
    </div>
  )
}
