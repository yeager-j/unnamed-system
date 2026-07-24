"use client"

import { CheckCircleIcon, MapPinIcon } from "@phosphor-icons/react/dist/ssr"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"

import type { Canon } from "@workspace/headcanon"
import { Button } from "@workspace/ui/components/button"
import { Checkbox } from "@workspace/ui/components/checkbox"
import { DataSelect } from "@workspace/ui/components/data-select"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Spinner } from "@workspace/ui/components/spinner"
import { cn } from "@workspace/ui/lib/utils"

import { CampaignBackLink } from "@/components/shared/campaign-back-link"
import type {
  DungeonClientView,
  DungeonSiteTemplate,
  DungeonSiteUrgency,
} from "@/domain/dungeon/client-state"
import {
  dungeonCommand,
  type DungeonCanonValue,
} from "@/domain/dungeon/commit/protocol"
import { useDungeonPredictions } from "@/domain/dungeon/use-dungeon-predictions"
import { dungeonErrorMessage } from "@/lib/actions/dungeon/error-message"
import type { CharacterSummary } from "@/lib/db/queries/character-list"

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
  sites,
  campaignShortId,
}: {
  dungeon: DungeonClientView
  canon: Canon<DungeonCanonValue>
  placedCharacters: CharacterSummary[]
  zones: PrepZone[]
  sites: ReadonlyArray<DungeonSiteTemplate>
  campaignShortId: string
}) {
  const router = useRouter()
  const root = useDungeonPredictions({ canon })
  const isPending = root.status.pending > 0
  const [placements, setPlacements] = useState<Record<string, string>>({})
  const [siteSelections, setSiteSelections] = useState<
    Record<string, { minDepth: number; urgency: DungeonSiteUrgency }>
  >(() =>
    Object.fromEntries(
      sites
        .filter(
          (site) => site.appearByDefault || site.authoredZoneId !== undefined
        )
        .map((site) => [
          site.templateKey,
          {
            minDepth: site.defaultMinDepth,
            urgency: site.defaultUrgency,
          },
        ])
    )
  )
  const runNoun = dungeon.regionId !== null ? "expedition" : "delve"

  function start() {
    const list = Object.entries(placements)
      .filter(([, zoneId]) => zoneId !== "")
      .map(([characterId, zoneId]) => ({ characterId, zoneId }))
    const result = root.mutate(
      dungeonCommand({
        dungeonId: dungeon.id,
        command: {
          kind: "start",
          placements: list,
          siteDeclarations: sites.flatMap((site) => {
            const selection = siteSelections[site.templateKey]
            return selection === undefined
              ? []
              : [
                  {
                    templateKey: site.templateKey,
                    minDepth: selection.minDepth,
                    urgency: selection.urgency,
                  },
                ]
          }),
        },
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

          {dungeon.regionId !== null && sites.length > 0 ? (
            <section className="flex flex-col gap-3 rounded-lg border p-4">
              <div>
                <h2 className="font-heading text-base font-medium">
                  Expedition sites
                </h2>
                <p className="text-sm text-muted-foreground">
                  Choose which sites the Haze must place in this expedition.
                </p>
              </div>
              <ul className="flex flex-col gap-2">
                {sites.map((site) => {
                  const selection = siteSelections[site.templateKey]
                  const selected = selection !== undefined
                  const authored = site.authoredZoneId !== undefined
                  const checkboxId = `site-${site.templateKey}`
                  return (
                    <li
                      key={site.templateKey}
                      className="grid min-h-24 gap-4 rounded-md border px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                    >
                      <label
                        htmlFor={checkboxId}
                        className={cn(
                          "flex min-h-11 min-w-0 items-center gap-3 text-sm",
                          isPending || authored
                            ? "cursor-not-allowed"
                            : "cursor-pointer"
                        )}
                      >
                        <Checkbox
                          id={checkboxId}
                          checked={selected}
                          disabled={isPending || authored}
                          onCheckedChange={(checked) =>
                            setSiteSelections((current) => {
                              if (checked === true) {
                                return {
                                  ...current,
                                  [site.templateKey]: {
                                    minDepth: site.defaultMinDepth,
                                    urgency: site.defaultUrgency,
                                  },
                                }
                              }
                              const next = { ...current }
                              delete next[site.templateKey]
                              return next
                            })
                          }
                        />
                        <span className="flex min-w-0 flex-col gap-1">
                          <span className="truncate font-medium">
                            {site.name}
                          </span>
                          {site.discovered || authored ? (
                            <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                              {site.discovered ? (
                                <span className="inline-flex items-center gap-1">
                                  <CheckCircleIcon
                                    aria-hidden
                                    className="size-3.5 shrink-0"
                                  />
                                  Discovered previously
                                </span>
                              ) : null}
                              {authored ? (
                                <span className="inline-flex items-center gap-1">
                                  <MapPinIcon
                                    aria-hidden
                                    className="size-3.5 shrink-0"
                                  />
                                  Already on map
                                </span>
                              ) : null}
                            </span>
                          ) : null}
                        </span>
                      </label>
                      {selected ? (
                        <div className="grid w-full grid-cols-[7rem_10rem] gap-3 sm:w-auto sm:justify-self-end">
                          <label className="grid gap-1 text-xs text-muted-foreground">
                            Minimum depth
                            <Input
                              type="number"
                              min={0}
                              value={selection.minDepth}
                              disabled={isPending || authored}
                              className="h-8 w-full tabular-nums"
                              onChange={(event) => {
                                const minDepth = Number(event.target.value)
                                if (!Number.isFinite(minDepth)) return
                                setSiteSelections((current) => ({
                                  ...current,
                                  [site.templateKey]: {
                                    ...selection,
                                    minDepth: Math.max(0, Math.round(minDepth)),
                                  },
                                }))
                              }}
                            />
                          </label>
                          <label className="grid gap-1 text-xs text-muted-foreground">
                            Urgency
                            <DataSelect
                              size="sm"
                              align="end"
                              className="w-full"
                              disabled={isPending || authored}
                              options={[
                                {
                                  value: "session" as const,
                                  label: "This session",
                                },
                                {
                                  value: "eventually" as const,
                                  label: "Eventually",
                                },
                              ]}
                              optionValue={(option) => option.value}
                              optionLabel={(option) => option.label}
                              value={selection.urgency}
                              onValueChange={(urgency) =>
                                setSiteSelections((current) => ({
                                  ...current,
                                  [site.templateKey]: {
                                    ...selection,
                                    urgency: urgency as DungeonSiteUrgency,
                                  },
                                }))
                              }
                            />
                          </label>
                        </div>
                      ) : null}
                    </li>
                  )
                })}
              </ul>
            </section>
          ) : null}

          <Button onClick={start} disabled={isPending} className="self-start">
            {isPending && <Spinner />}
            Start {runNoun}
          </Button>
        </>
      )}
    </main>
  )
}
