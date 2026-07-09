"use client"

import { PlusIcon, SwordIcon, TrashIcon } from "@phosphor-icons/react/dist/ssr"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { buildEnemyCatalogRows } from "@workspace/game-v2/catalog/enemies/catalog-rows"
import type {
  CombatAdvantage,
  CombatSide,
} from "@workspace/game-v2/kernel/vocab/combat"
import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { Label } from "@workspace/ui/components/label"
import {
  RadioGroup,
  RadioGroupItem,
} from "@workspace/ui/components/radio-group"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"

import { SideToggle } from "@/components/combat/controls/side-toggle"
import { startDungeonEncounterAction } from "@/lib/actions/dungeon/start-encounter"
import type { StartDungeonEncounterError } from "@/lib/actions/dungeon/start-encounter.schema"
import {
  COMBAT_ADVANTAGE_SETUP_HINTS,
  COMBAT_ADVANTAGE_SETUP_LABELS,
  COMBAT_FIRST_SIDE_HEADING,
} from "@/lib/ui/labels"

const ADVANTAGE_ORDER: readonly CombatAdvantage[] = [
  "players",
  "neutral",
  "enemies",
]

interface StagedEnemy {
  enemyKey: string
  zoneId: string
  count: number
}

/**
 * The delve's **pre-combat staging** surface (UNN-536) — the client-side twin of
 * the mapless encounter setup, purpose-built for the shared delve Instance. The DM
 * stages enemies onto zones (nothing persists), declares the opening advantage +
 * first side, and Begins — one atomic {@link startDungeonEncounterAction} mints an
 * already-live encounter co-minting the staged enemies onto the existing geometry,
 * with the party's exploration tokens carried into the fight. On success the page
 * re-forks to the combat console.
 */
export function DungeonStartEncounterDialog({
  open,
  onOpenChange,
  dungeonId,
  dungeonName,
  expectedInstanceVersion,
  partyCharacterIds,
  zones,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  dungeonId: string
  dungeonName: string
  expectedInstanceVersion: number
  partyCharacterIds: string[]
  zones: { id: string; name: string }[]
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  // React Compiler keeps these stable by their inputs — no manual memo (matching
  // the sibling explore/body.tsx convention).
  const enemyRows = [...buildEnemyCatalogRows()].sort((a, b) =>
    a.name.localeCompare(b.name)
  )
  const enemyNameByKey = new Map(enemyRows.map((row) => [row.key, row.name]))
  const zoneNameById = new Map(zones.map((zone) => [zone.id, zone.name]))

  const [advantage, setAdvantage] = useState<CombatAdvantage>("neutral")
  const [firstSide, setFirstSide] = useState<CombatSide>("players")
  const [staged, setStaged] = useState<StagedEnemy[]>([])
  const [pickEnemyKey, setPickEnemyKey] = useState<string>("")
  const [pickZoneId, setPickZoneId] = useState<string>(zones[0]?.id ?? "")

  const canAdd = pickEnemyKey !== "" && pickZoneId !== ""

  function addStaged() {
    if (!canAdd) return
    setStaged((prev) => [
      ...prev,
      { enemyKey: pickEnemyKey, zoneId: pickZoneId, count: 1 },
    ])
  }

  function begin() {
    startTransition(async () => {
      const result = await startDungeonEncounterAction({
        dungeonId,
        expectedInstanceVersion,
        name: dungeonName.trim() || "Encounter",
        advantage,
        firstSide: advantage === "neutral" ? firstSide : advantage,
        partyCharacterIds,
        enemies: staged,
      })
      if (!result.ok) {
        toast.error(startEncounterErrorMessage(result.error))
        return
      }
      onOpenChange(false)
      setStaged([])
      router.refresh()
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Start an encounter</DialogTitle>
          <DialogDescription>
            Stage enemies onto zones, then begin. The party fights where it
            stands.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">Enemies</span>
          {staged.length > 0 ? (
            <ul className="flex flex-col gap-1">
              {staged.map((entry, index) => (
                <li
                  key={`${entry.enemyKey}-${entry.zoneId}-${index}`}
                  className="flex items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-sm"
                >
                  <span className="min-w-0 truncate">
                    {entry.count}× {enemyNameByKey.get(entry.enemyKey)} ·{" "}
                    <span className="text-muted-foreground">
                      {zoneNameById.get(entry.zoneId)}
                    </span>
                  </span>
                  <div className="flex items-center gap-1">
                    <Select
                      value={String(entry.count)}
                      onValueChange={(value) =>
                        setStaged((prev) =>
                          prev.map((item, itemIndex) =>
                            itemIndex === index
                              ? { ...item, count: Number(value) }
                              : item
                          )
                        )
                      }
                    >
                      <SelectTrigger size="sm" className="w-16">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Array.from(
                          { length: 20 },
                          (_, count) => count + 1
                        ).map((count) => (
                          <SelectItem key={count} value={String(count)}>
                            {count}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Remove"
                      onClick={() =>
                        setStaged((prev) =>
                          prev.filter((_, itemIndex) => itemIndex !== index)
                        )
                      }
                    >
                      <TrashIcon />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">
              No enemies staged yet.
            </p>
          )}

          <div className="flex items-center gap-2">
            <Select
              value={pickEnemyKey}
              onValueChange={(value) => setPickEnemyKey(value ?? "")}
            >
              <SelectTrigger size="sm" className="flex-1">
                <SelectValue>
                  {(value) =>
                    value
                      ? (enemyNameByKey.get(String(value)) ?? "Choose an enemy")
                      : "Choose an enemy"
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {enemyRows.map((row) => (
                  <SelectItem key={row.key} value={row.key}>
                    {row.name} · Lv {row.level}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={pickZoneId}
              onValueChange={(value) => setPickZoneId(value ?? "")}
            >
              <SelectTrigger size="sm" className="w-36">
                <SelectValue>
                  {(value) =>
                    value ? (zoneNameById.get(String(value)) ?? "Zone") : "Zone"
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {zones.map((zone) => (
                  <SelectItem key={zone.id} value={zone.id}>
                    {zone.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="icon"
              aria-label="Stage enemy"
              onClick={addStaged}
              disabled={!canAdd}
            >
              <PlusIcon />
            </Button>
          </div>
        </div>

        <RadioGroup
          value={advantage}
          onValueChange={(value) => setAdvantage(value as CombatAdvantage)}
          className="gap-2"
        >
          {ADVANTAGE_ORDER.map((option) => (
            <Label
              key={option}
              className="flex items-start gap-3 rounded-md border p-3 has-data-checked:border-foreground has-data-checked:bg-muted/40"
            >
              <RadioGroupItem value={option} className="mt-0.5" />
              <span className="flex flex-col gap-0.5">
                <span className="text-sm font-medium">
                  {COMBAT_ADVANTAGE_SETUP_LABELS[option]}
                </span>
                <span className="text-xs font-normal text-muted-foreground">
                  {COMBAT_ADVANTAGE_SETUP_HINTS[option]}
                </span>
              </span>
            </Label>
          ))}
        </RadioGroup>

        {advantage === "neutral" ? (
          <div className="flex items-center justify-between gap-2 rounded-md border border-dashed p-3">
            <span className="text-sm font-medium">
              {COMBAT_FIRST_SIDE_HEADING}
            </span>
            <SideToggle side={firstSide} onChange={setFirstSide} />
          </div>
        ) : null}

        <DialogFooter>
          <Button className="w-full" onClick={begin} disabled={isPending}>
            <SwordIcon weight="fill" />
            Begin encounter
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Toast copy for a failed start — the delve-scoped codes plus the shared ones. */
function startEncounterErrorMessage(error: StartDungeonEncounterError): string {
  switch (error) {
    case "dungeon-not-found":
      return "This delve no longer exists."
    case "delve-not-active":
      return "This delve isn't active."
    case "campaign-already-has-live-encounter":
      return "This campaign already has a live encounter."
    case "character-not-found":
      return "A party member no longer exists. Reload and try again."
    case "unknown-enemy":
      return "One of the staged enemies isn't in the catalog anymore."
    case "encounter-has-unplaced-combatants":
      return "Every combatant must stand in a zone before combat."
    case "map-instance-not-found":
      return "This delve's map is missing. Reload and try again."
    case "stale":
      return "The map changed elsewhere. Reload and try again."
    case "invalid-input":
    case "locator-missing":
      return "Something looks off with the roster. Reload and try again."
  }
}
