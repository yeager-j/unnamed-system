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

import { createMapAction } from "@/lib/actions/create-map"
import { createDungeonAction } from "@/lib/actions/dungeon/create"
import { dungeonConsolePath } from "@/lib/paths"

type PickableMap = { shortId: string; name: string }

/**
 * "New dungeon" CTA on the campaign manage page (UNN-465). Opens a dialog for the
 * delve name + a **Map picker** over the DM's own Maps, creates a `draft` dungeon
 * (minting its Map Instance), and routes to the console (`/campaigns/{c}/dungeon/{d}`)
 * — the action-then-redirect shape {@link import("./create-encounter-button").CreateEncounterButton}
 * uses.
 *
 * The Map picker doubles as inline authoring: **New map** creates an empty Map
 * (`createMapAction`) and selects it without leaving the dialog, so a DM with zero
 * Maps can still build a delve in one flow (the geometry is authored later in the
 * Map editor). Locally-created Maps are appended to the picker so the new pick is
 * visible; both existing and inline-created Maps are referenced by `shortId`.
 */
export function CreateDungeonButton({
  campaignId,
  campaignShortId,
  maps,
}: {
  campaignId: string
  campaignShortId: string
  maps: PickableMap[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [isCreatingMap, startCreateMap] = useTransition()

  const [localMaps, setLocalMaps] = useState<PickableMap[]>(maps)
  const [name, setName] = useState("")
  const [selectedMapShortId, setSelectedMapShortId] = useState("")
  const [newMapMode, setNewMapMode] = useState(maps.length === 0)
  const [newMapName, setNewMapName] = useState("")

  function onCreateMap() {
    const trimmed = newMapName.trim()
    if (!trimmed) return

    startCreateMap(async () => {
      const result = await createMapAction({ name: trimmed })
      if (!result.ok) {
        toast.error("Couldn't create the map. Check the name and try again.")
        return
      }
      setLocalMaps((prev) => [
        { shortId: result.value.shortId, name: trimmed },
        ...prev,
      ])
      setSelectedMapShortId(result.value.shortId)
      setNewMapName("")
      setNewMapMode(false)
    })
  }

  function onCreateDungeon() {
    const trimmed = name.trim()
    if (!trimmed || !selectedMapShortId) return

    startTransition(async () => {
      const result = await createDungeonAction({
        campaignId,
        mapShortId: selectedMapShortId,
        name: trimmed,
      })
      if (!result.ok) {
        toast.error("Couldn't create the dungeon. Check the details and retry.")
        return
      }
      setOpen(false)
      router.push(dungeonConsolePath(campaignShortId, result.value.shortId))
    })
  }

  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        <PlusIcon weight="bold" />
        New dungeon
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New dungeon</DialogTitle>
            <DialogDescription>
              Name the delve and pick the Map it runs on. You&apos;ll build the
              roster and place tokens in the console.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-4">
            <Field>
              <FieldLabel htmlFor="dungeon-name">Name</FieldLabel>
              <Input
                id="dungeon-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={100}
                autoFocus
                placeholder="Descent into the Sunken Crypt"
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="dungeon-map">Map</FieldLabel>
              {newMapMode ? (
                <div className="flex flex-col gap-2">
                  <div className="flex gap-2">
                    <Input
                      id="dungeon-map"
                      value={newMapName}
                      onChange={(event) => setNewMapName(event.target.value)}
                      maxLength={100}
                      placeholder="The Sunken Crypt"
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={onCreateMap}
                      disabled={isCreatingMap || !newMapName.trim()}
                    >
                      {isCreatingMap ? <Spinner /> : null}
                      Create map
                    </Button>
                  </div>
                  {localMaps.length > 0 ? (
                    <button
                      type="button"
                      className="self-start text-sm text-muted-foreground underline-offset-4 hover:underline"
                      onClick={() => setNewMapMode(false)}
                    >
                      Pick an existing map instead
                    </button>
                  ) : null}
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <Select
                    value={selectedMapShortId}
                    onValueChange={(value) =>
                      setSelectedMapShortId(value ?? "")
                    }
                  >
                    <SelectTrigger id="dungeon-map">
                      <SelectValue>
                        {localMaps.find(
                          (map) => map.shortId === selectedMapShortId
                        )?.name ?? (
                          <span className="text-muted-foreground">
                            Choose a map…
                          </span>
                        )}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {localMaps.map((map) => (
                        <SelectItem key={map.shortId} value={map.shortId}>
                          {map.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <button
                    type="button"
                    className="self-start text-sm text-muted-foreground underline-offset-4 hover:underline"
                    onClick={() => setNewMapMode(true)}
                  >
                    + New map
                  </button>
                </div>
              )}
            </Field>
          </div>

          <DialogFooter>
            <Button
              type="button"
              onClick={onCreateDungeon}
              disabled={isPending || !name.trim() || !selectedMapShortId}
            >
              {isPending ? <Spinner /> : null}
              Create dungeon
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
