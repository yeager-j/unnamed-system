"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"
import { DataSelect } from "@workspace/ui/components/data-select"
import { Field, FieldLabel } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import { Spinner } from "@workspace/ui/components/spinner"

import { WANDERING_INTERVAL_OPTIONS } from "@/domain/labels"
import { regionErrorMessage } from "@/lib/actions/region/error-message"
import { updateRegionSettingsAction } from "@/lib/actions/region/update-settings"
import { guardWriteTransition } from "@/lib/sync/guard-write-transition"

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
    settings.wanderingTableKey ?? ""
  )
  const [intervalTurns, setIntervalTurns] = useState<1 | 2 | 3 | 6>(
    settings.wanderingIntervalTurns ?? 6
  )

  const hasTable = wanderingTableKey !== ""

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
        {/* Disabled only when there is nothing to choose AND nothing to clear:
            a designation whose table the author has since deleted must keep this
            control (and its "None") reachable, or the stale key becomes
            unsaveable with no UI path out. `selectTriggerLabel` names the missing
            table honestly rather than falling back to "None" while the form would
            still submit the stale key. */}
        <DataSelect
          id="region-settings-table"
          disabled={tables.length === 0 && !hasTable}
          nullOption={{ label: "None" }}
          options={tables}
          optionValue={(table) => table.key}
          optionLabel={(table) => table.name}
          value={wanderingTableKey}
          onValueChange={setWanderingTableKey}
          selectTriggerLabel={(table, value) =>
            value === "" ? (
              <span className="text-muted-foreground">None</span>
            ) : table ? (
              table.name
            ) : (
              <span className="text-destructive">
                {value} (missing from the set)
              </span>
            )
          }
        />
      </Field>

      {hasTable ? (
        <Field>
          <FieldLabel htmlFor="region-settings-interval">Fires</FieldLabel>
          <DataSelect
            id="region-settings-interval"
            options={WANDERING_INTERVAL_OPTIONS}
            optionValue={(option) => String(option.turns)}
            optionLabel={(option) => option.label}
            value={String(intervalTurns)}
            onValueChange={(value) =>
              setIntervalTurns(Number(value) as 1 | 2 | 3 | 6)
            }
          />
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
