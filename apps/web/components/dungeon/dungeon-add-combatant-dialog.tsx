"use client"

import { useState } from "react"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { Label } from "@workspace/ui/components/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"

import { EnemyCatalogPanel } from "@/components/combat/enemies/enemy-catalog-panel"

import { useStagedEnemies } from "./use-staged-enemies"

/**
 * The **mid-fight add-combatant** dialog (UNN-467, AC4) — pulls reinforcements
 * into the live encounter. The DM browses the bestiary (shared
 * {@link EnemyCatalogPanel}, ephemeral queue), picks the Zone they arrive in, and
 * confirms; each staged creature is committed as a `catalog-enemy` combatant via
 * `onAdd` (the combat body dispatches an `addCombatant` event per creature, the
 * existing roster cross-write that places its token). Monster markers that would
 * let the DM tap a pre-placed token are M5 — until then reinforcements come from
 * the catalog.
 */
export function DungeonAddCombatantDialog({
  open,
  onOpenChange,
  zones,
  onAdd,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  zones: { id: string; name: string }[]
  onAdd: (enemyKey: string, zoneId: string) => void
}) {
  const queue = useStagedEnemies()
  const [zoneId, setZoneId] = useState<string>("")
  const targetZoneId = zoneId || (zones[0]?.id ?? "")

  function close(next: boolean) {
    if (!next) queue.clear()
    onOpenChange(next)
  }

  function commit() {
    if (targetZoneId === "") return
    for (const entry of queue.staged) {
      for (let i = 0; i < entry.count; i += 1) {
        onAdd(entry.enemyKey, targetZoneId)
      }
    }
    queue.clear()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="flex h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl">
        <DialogHeader className="border-b p-4">
          <DialogTitle>Add a combatant</DialogTitle>
          <DialogDescription>
            Pull reinforcements into the fight. They enter combat already acted
            — queued for the next round.
          </DialogDescription>
          <div className="flex items-center gap-2 pt-1">
            <Label htmlFor="add-combatant-zone" className="text-sm">
              Arrives in
            </Label>
            <Select
              value={targetZoneId}
              onValueChange={(value) => setZoneId(value ?? "")}
              disabled={zones.length === 0}
            >
              <SelectTrigger id="add-combatant-zone" className="w-56">
                <SelectValue placeholder="Pick a zone">
                  {zones.find((zone) => zone.id === targetZoneId)?.name ??
                    "Pick a zone"}
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
          </div>
        </DialogHeader>
        <EnemyCatalogPanel
          queue={queue.staged}
          isPending={false}
          onAdd={queue.add}
          onIncrement={queue.add}
          onDecrement={queue.decrement}
          onRemove={queue.remove}
          onCommit={commit}
          onCancel={() => close(false)}
        />
      </DialogContent>
    </Dialog>
  )
}
