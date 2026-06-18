"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"
import { Label } from "@workspace/ui/components/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { Spinner } from "@workspace/ui/components/spinner"

import { CampaignBackLink } from "@/components/combat/campaign-back-link"
import { startDelveAction } from "@/lib/actions/dungeon/delve-start"
import { dungeonErrorMessage } from "@/lib/actions/dungeon/error-message"
import type { CharacterSummary } from "@/lib/db/queries/character-list"
import type { DungeonRow } from "@/lib/db/schema/dungeon"
import type { MapInstanceRow } from "@/lib/db/schema/map-instance"

/** A starting Zone the prep view offers, from the source Map template. */
export interface PrepZone {
  id: string
  name: string
}

/**
 * The **draft** prep console (UNN-464): the DM stages where each placed character
 * starts, then **Start delve** snapshots the Map's geometry into the Instance,
 * commits the staged tokens, and flips `draft → active` ({@link startDelveAction},
 * one `guardMany`). Zones come from the source template (the Instance is still
 * blank until start). An empty template surfaces an author-your-map dead-end
 * rather than a runnable-but-empty delve.
 */
export function DungeonPrep({
  dungeon,
  instance,
  placedCharacters,
  zones,
  campaignShortId,
}: {
  dungeon: DungeonRow
  instance: MapInstanceRow
  placedCharacters: CharacterSummary[]
  zones: PrepZone[]
  campaignShortId: string
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [placements, setPlacements] = useState<Record<string, string>>({})

  function start() {
    startTransition(async () => {
      const list = Object.entries(placements)
        .filter(([, zoneId]) => zoneId !== "")
        .map(([characterId, zoneId]) => ({ characterId, zoneId }))
      const result = await startDelveAction({
        dungeonId: dungeon.id,
        expectedVersion: dungeon.version,
        expectedInstanceVersion: instance.version,
        placements: list,
      })
      if (!result.ok) {
        toast.error(dungeonErrorMessage(result.error))
        return
      }
      router.refresh()
    })
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 p-6">
      {campaignShortId ? (
        <CampaignBackLink campaignShortId={campaignShortId} />
      ) : null}
      <header>
        <h1 className="font-heading text-lg font-medium">{dungeon.name}</h1>
        <p className="text-sm text-muted-foreground">Delve · prep</p>
      </header>

      {zones.length === 0 ? (
        <div className="rounded-lg border p-8 text-center text-sm text-muted-foreground">
          This dungeon&apos;s map has no zones yet. Author it on{" "}
          <span className="font-medium">My Maps</span>, then create a new delve
          from it.
        </div>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            Place the party&apos;s starting zones, then start the delve. A
            partial party is fine — leave anyone out you don&apos;t need yet.
          </p>

          {placedCharacters.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No characters are placed in this campaign yet.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {placedCharacters.map((character) => (
                <li
                  key={character.id}
                  className="flex items-center justify-between gap-3 rounded-md border px-3 py-2"
                >
                  <span className="min-w-0 truncate text-sm font-medium">
                    {character.name}
                  </span>
                  <Label className="sr-only" htmlFor={`zone-${character.id}`}>
                    Starting zone for {character.name}
                  </Label>
                  <Select
                    value={placements[character.id] ?? ""}
                    onValueChange={(value) =>
                      setPlacements((current) => ({
                        ...current,
                        [character.id]: value ?? "",
                      }))
                    }
                    disabled={isPending}
                  >
                    <SelectTrigger
                      size="sm"
                      id={`zone-${character.id}`}
                      className="w-48"
                    >
                      <SelectValue placeholder="Not in this delve" />
                    </SelectTrigger>
                    <SelectContent>
                      {zones.map((zone) => (
                        <SelectItem key={zone.id} value={zone.id}>
                          {zone.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </li>
              ))}
            </ul>
          )}

          <Button onClick={start} disabled={isPending} className="self-start">
            {isPending && <Spinner />}
            Start delve
          </Button>
        </>
      )}
    </main>
  )
}
