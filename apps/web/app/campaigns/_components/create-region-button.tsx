"use client"

import { PlusIcon } from "@phosphor-icons/react/dist/ssr"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
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
import { createRegionAction } from "@/lib/actions/region/create"
import { regionErrorMessage } from "@/lib/actions/region/error-message"
import type { PickableSet } from "@/lib/db/queries/load-template-set"
import { campaignRegionPath } from "@/lib/paths"
import { guardWriteTransition } from "@/lib/sync/guard-write-transition"

type PickableMap = { shortId: string; name: string }

/** The table Select's "no wandering table" sentinel — Base UI `SelectItem`
 *  values can't be empty, so `""` (unselected `settings.wanderingTableKey`) is
 *  represented in the list by this reserved value. */
const NO_TABLE = "none"

/**
 * "New region" CTA on the campaign manage page (UNN-589). Opens a dialog for the
 * Region name, its **seed Map** (over the DM's Maps) and **Template Set** (over the
 * DM's Sets), plus an optional **wandering** section — a table from the *chosen*
 * Set and how often it fires. Creates the Region (`createRegionAction`) and routes
 * to its detail page, the action-then-redirect shape
 * {@link import("./create-dungeon-button").CreateDungeonButton} uses.
 *
 * The wandering table list is driven by the currently-selected Set: pick a Set and
 * its `tables` populate the table Select; the interval only means anything once a
 * table is designated (D7 — these are authored defaults, stamped onto each
 * expedition at mint). Switching Sets resets the table pick so a stale key from the
 * previous Set can't ride along.
 *
 * A DM with no Maps or no Sets can't bind a Region, so the submit stays disabled
 * with a hint pointing at the Stage — a Region references authored rows rather than
 * minting them inline (contrast the dungeon dialog's inline Map authoring).
 */
export function CreateRegionButton({
  campaignId,
  campaignShortId,
  maps,
  sets,
}: {
  campaignId: string
  campaignShortId: string
  maps: PickableMap[]
  sets: PickableSet[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  const [name, setName] = useState("")
  const [selectedMapShortId, setSelectedMapShortId] = useState("")
  const [selectedSetShortId, setSelectedSetShortId] = useState("")
  const [wanderingTableKey, setWanderingTableKey] = useState(NO_TABLE)
  const [intervalTurns, setIntervalTurns] = useState<1 | 2 | 3 | 6>(6)

  const selectedSet = sets.find((set) => set.shortId === selectedSetShortId)
  const tables = selectedSet?.tables ?? []
  const canBind = maps.length > 0 && sets.length > 0

  function onSelectSet(shortId: string) {
    setSelectedSetShortId(shortId)
    setWanderingTableKey(NO_TABLE)
  }

  function onCreate() {
    const trimmed = name.trim()
    if (!trimmed || !selectedMapShortId || !selectedSetShortId) return

    const hasTable = wanderingTableKey !== NO_TABLE

    startTransition(() =>
      guardWriteTransition(
        async () => {
          const result = await createRegionAction({
            campaignId,
            name: trimmed,
            seedMapShortId: selectedMapShortId,
            templateSetShortId: selectedSetShortId,
            settings: {
              wanderingTableKey: hasTable ? wanderingTableKey : undefined,
              wanderingIntervalTurns: hasTable ? intervalTurns : undefined,
            },
          })
          if (!result.ok) {
            toast.error(regionErrorMessage(result.error))
            return
          }
          setOpen(false)
          router.push(campaignRegionPath(campaignShortId, result.value.shortId))
        },
        () =>
          toast.error(
            "Couldn't create the region. Check the details and retry."
          )
      )
    )
  }

  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        <PlusIcon weight="bold" />
        New region
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New region</DialogTitle>
            <DialogDescription>
              Name the place and bind it to a seed Map and a Template Set. Each
              expedition reshuffles from that seed automatically.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-4">
            <Field>
              <FieldLabel htmlFor="region-name">Name</FieldLabel>
              <Input
                id="region-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={100}
                autoFocus
                placeholder="The Sunken Reaches"
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="region-map">Seed map</FieldLabel>
              {maps.length > 0 ? (
                <Select
                  value={selectedMapShortId}
                  onValueChange={(value) => setSelectedMapShortId(value ?? "")}
                >
                  <SelectTrigger id="region-map">
                    <SelectValue>
                      {maps.find((map) => map.shortId === selectedMapShortId)
                        ?.name ?? (
                        <span className="text-muted-foreground">
                          Choose a map…
                        </span>
                      )}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {maps.map((map) => (
                      <SelectItem key={map.shortId} value={map.shortId}>
                        {map.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Author a Map on the Stage first.
                </p>
              )}
            </Field>

            <Field>
              <FieldLabel htmlFor="region-set">Template set</FieldLabel>
              {sets.length > 0 ? (
                <Select
                  value={selectedSetShortId}
                  onValueChange={(value) => onSelectSet(value ?? "")}
                >
                  <SelectTrigger id="region-set">
                    <SelectValue>
                      {selectedSet?.name ?? (
                        <span className="text-muted-foreground">
                          Choose a set…
                        </span>
                      )}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {sets.map((set) => (
                      <SelectItem key={set.shortId} value={set.shortId}>
                        {set.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Author a Template Set on the Stage first.
                </p>
              )}
            </Field>

            <Field>
              <FieldLabel htmlFor="region-table">
                Wandering table{" "}
                <span className="font-normal text-muted-foreground">
                  (optional)
                </span>
              </FieldLabel>
              <Select
                value={wanderingTableKey}
                onValueChange={(value) =>
                  setWanderingTableKey(value ?? NO_TABLE)
                }
              >
                <SelectTrigger id="region-table" disabled={tables.length === 0}>
                  <SelectValue>
                    {tables.find((table) => table.key === wanderingTableKey)
                      ?.name ?? (
                      <span className="text-muted-foreground">None</span>
                    )}
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

            {wanderingTableKey !== NO_TABLE ? (
              <Field>
                <FieldLabel htmlFor="region-interval">Fires</FieldLabel>
                <Select
                  value={String(intervalTurns)}
                  onValueChange={(value) =>
                    setIntervalTurns(Number(value) as 1 | 2 | 3 | 6)
                  }
                >
                  <SelectTrigger id="region-interval">
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
                      <SelectItem
                        key={option.turns}
                        value={String(option.turns)}
                      >
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            ) : null}
          </div>

          <DialogFooter>
            <Button
              type="button"
              onClick={onCreate}
              disabled={
                isPending ||
                !canBind ||
                !name.trim() ||
                !selectedMapShortId ||
                !selectedSetShortId
              }
            >
              {isPending ? <Spinner /> : null}
              Create region
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
