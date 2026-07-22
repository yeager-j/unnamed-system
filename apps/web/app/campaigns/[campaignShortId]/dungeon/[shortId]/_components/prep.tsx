"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"

import type { Canon } from "@workspace/headcanon"
import { Button } from "@workspace/ui/components/button"
import { DataSelect } from "@workspace/ui/components/data-select"
import { Label } from "@workspace/ui/components/label"
import { Spinner } from "@workspace/ui/components/spinner"

import { CampaignBackLink } from "@/components/shared/campaign-back-link"
import {
  dungeonCommand,
  type DungeonCanonValue,
} from "@/domain/dungeon/commit/protocol"
import { useDungeonPredictions } from "@/domain/dungeon/use-dungeon-predictions"
import { dungeonErrorMessage } from "@/lib/actions/dungeon/error-message"
import type { CharacterSummary } from "@/lib/db/queries/character-list"
import type { DungeonRow } from "@/lib/db/schema/dungeon"

/** A starting Zone the prep view offers, from the source Map template. */
export interface PrepZone {
  id: string
  name: string
  /** The page grouping the zone picker renders under (UNN-586). */
  pageId: string
  pageName: string
}

/**
 * The **draft** prep console (UNN-464): the DM stages where each placed character
 * starts, then **Start delve** snapshots the Map's geometry into the Instance,
 * commits the staged tokens, and flips `draft → active` through one
 * `dungeon.command` transaction. Zones come from the source template (the Instance is still
 * blank until start). An empty template surfaces an author-your-map dead-end
 * rather than a runnable-but-empty delve.
 */
export function DungeonPrep({
  dungeon,
  canon,
  placedCharacters,
  zones,
  campaignShortId,
}: {
  dungeon: DungeonRow
  canon: Canon<DungeonCanonValue>
  placedCharacters: CharacterSummary[]
  zones: PrepZone[]
  campaignShortId: string
}) {
  const router = useRouter()
  const root = useDungeonPredictions({ canon })
  const isPending = root.status.pending > 0
  const [placements, setPlacements] = useState<Record<string, string>>({})
  const runNoun = dungeon.regionId !== null ? "expedition" : "delve"

  function start() {
    const list = Object.entries(placements)
      .filter(([, zoneId]) => zoneId !== "")
      .map(([characterId, zoneId]) => ({ characterId, zoneId }))
    const result = root.mutate(
      dungeonCommand({
        dungeonId: dungeon.id,
        command: { kind: "start", placements: list },
      })
    )
    if (!result.ok) {
      toast.error(dungeonErrorMessage(result.error))
      return
    }
    void result.value.accepted.then((accepted) => {
      if (accepted.ok) {
        router.refresh()
        return
      }
      if (
        accepted.error.kind === "domain" ||
        accepted.error.kind === "replay-refused"
      ) {
        toast.error(dungeonErrorMessage(accepted.error.error))
      }
    })
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 p-6">
      {campaignShortId ? (
        <CampaignBackLink campaignShortId={campaignShortId} />
      ) : null}
      <header>
        <h1 className="font-heading text-lg font-medium">{dungeon.name}</h1>
        <p className="text-sm text-muted-foreground">
          {runNoun === "expedition" ? "Expedition" : "Delve"} · prep
        </p>
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
            Place the party&apos;s starting zones, then start the {runNoun}. A
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
                  <DataSelect
                    size="sm"
                    id={`zone-${character.id}`}
                    className="w-48"
                    placeholder="Not in this delve"
                    disabled={isPending}
                    options={zones}
                    optionValue={(zone) => zone.id}
                    optionLabel={(zone) => zone.name}
                    optionGroup={(zone) => ({
                      key: zone.pageId,
                      label: zone.pageName,
                    })}
                    value={placements[character.id] ?? ""}
                    onValueChange={(value) =>
                      setPlacements((current) => ({
                        ...current,
                        [character.id]: value,
                      }))
                    }
                  />
                </li>
              ))}
            </ul>
          )}

          <Button onClick={start} disabled={isPending} className="self-start">
            {isPending && <Spinner />}
            Start {runNoun}
          </Button>
        </>
      )}
    </main>
  )
}
