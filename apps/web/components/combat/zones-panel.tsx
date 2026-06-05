"use client"

import { MapPinIcon, PlusIcon, TrashIcon } from "@phosphor-icons/react/dist/ssr"
import { useState, type KeyboardEvent } from "react"

import { Button } from "@workspace/ui/components/button"
import { Checkbox } from "@workspace/ui/components/checkbox"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"

import type { CombatSession, ZoneGraphEvent } from "@/lib/game/encounter"

/**
 * The encounter-setup **Zones** panel (UNN-301): the DM authors the encounter's
 * named zones and their adjacency. It owns no zone shape of its own — every edit
 * is emitted as a UNN-313 {@link ZoneGraphEvent} (`addZone` / `renameZone` /
 * `removeZone` / `setZoneAdjacency`) through `onZoneEvent`, which the setup shell
 * routes to `applyCombatEvent` (the same path the rest of combat uses). Zones are
 * server-owned: the shell re-reads them after each event, so this panel renders
 * straight from the persisted `zones`/`adjacency` props.
 *
 * An encounter with no zones runs unzoned (theater-of-mind) — the empty state
 * says so. Adjacency is undirected; each zone's neighbor popover toggles the edge
 * both ways via a single `setZoneAdjacency`.
 */
export function ZonesPanel({
  zones,
  adjacency,
  onZoneEvent,
  disabled,
}: {
  zones: CombatSession["zones"]
  adjacency: CombatSession["adjacency"]
  onZoneEvent: (event: ZoneGraphEvent) => void
  disabled?: boolean
}) {
  const [newName, setNewName] = useState("")
  const zoneList = Object.values(zones)

  function addZone() {
    const name = newName.trim()
    if (name === "") return
    onZoneEvent({ kind: "addZone", name })
    setNewName("")
  }

  function onAddKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault()
      addZone()
    }
  }

  function commitRename(zoneId: string, currentName: string, next: string) {
    const name = next.trim()
    if (name === "" || name === currentName) return
    onZoneEvent({ kind: "renameZone", zoneId, name })
  }

  return (
    <section className="flex flex-col gap-3 rounded-lg border p-4 sm:col-span-2">
      <header className="flex items-center justify-between gap-2">
        <h2 className="font-heading text-sm font-medium">Zones</h2>
        <span className="text-xs text-muted-foreground">
          {zoneList.length === 0
            ? "Optional"
            : `${zoneList.length} ${zoneList.length === 1 ? "zone" : "zones"}`}
        </span>
      </header>

      <div className="flex items-center gap-2">
        <Input
          value={newName}
          onChange={(event) => setNewName(event.target.value)}
          onKeyDown={onAddKeyDown}
          placeholder="Zone name (e.g. Courtyard)"
          aria-label="New zone name"
          disabled={disabled}
        />
        <Button
          variant="outline"
          onClick={addZone}
          disabled={disabled || newName.trim() === ""}
        >
          <PlusIcon weight="bold" />
          Add
        </Button>
      </div>

      {zoneList.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No zones — this encounter runs unzoned (theater-of-mind). Add zones to
          place combatants on a map.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {zoneList.map((zone) => {
            const neighborNames = (adjacency[zone.id] ?? [])
              .map((id) => zones[id]?.name)
              .filter((name) => name !== undefined)
            return (
              <li
                key={zone.id}
                className="flex flex-col gap-1 rounded-md border px-2 py-1.5"
              >
                <div className="flex items-center gap-2">
                  <Input
                    key={`${zone.id}:${zone.name}`}
                    defaultValue={zone.name}
                    aria-label={`Rename ${zone.name}`}
                    disabled={disabled}
                    className="h-8 border-transparent px-2 hover:border-input focus:border-input"
                    onBlur={(event) =>
                      commitRename(zone.id, zone.name, event.target.value)
                    }
                    onKeyDown={(event) => {
                      if (event.key === "Enter") event.currentTarget.blur()
                    }}
                  />
                  <NeighborsControl
                    zone={zone}
                    allZones={zoneList}
                    neighbors={adjacency[zone.id] ?? []}
                    onZoneEvent={onZoneEvent}
                    disabled={disabled}
                  />
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`Remove ${zone.name}`}
                    disabled={disabled}
                    onClick={() =>
                      onZoneEvent({ kind: "removeZone", zoneId: zone.id })
                    }
                  >
                    <TrashIcon />
                  </Button>
                </div>
                <p className="px-2 text-xs text-muted-foreground">
                  {neighborNames.length > 0
                    ? `Borders ${neighborNames.join(", ")}`
                    : "No borders"}
                </p>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

function NeighborsControl({
  zone,
  allZones,
  neighbors,
  onZoneEvent,
  disabled,
}: {
  zone: CombatSession["zones"][string]
  allZones: CombatSession["zones"][string][]
  neighbors: string[]
  onZoneEvent: (event: ZoneGraphEvent) => void
  disabled?: boolean
}) {
  const others = allZones.filter((candidate) => candidate.id !== zone.id)

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            disabled={disabled || others.length === 0}
            aria-label={`Edit borders of ${zone.name}`}
          />
        }
      >
        <MapPinIcon weight="bold" />
        Borders
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56 p-2">
        <p className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
          Adjacent to
        </p>
        <ul className="flex flex-col">
          {others.map((other) => {
            const adjacent = neighbors.includes(other.id)
            return (
              <li key={other.id}>
                <Label className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-muted/60">
                  <Checkbox
                    checked={adjacent}
                    onCheckedChange={() =>
                      onZoneEvent({
                        kind: "setZoneAdjacency",
                        zoneIdA: zone.id,
                        zoneIdB: other.id,
                        adjacent: !adjacent,
                      })
                    }
                  />
                  <span className="truncate">{other.name}</span>
                </Label>
              </li>
            )
          })}
        </ul>
      </PopoverContent>
    </Popover>
  )
}
