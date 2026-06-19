"use client"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"

import {
  EnemyCatalogPanel,
  type StagedEnemy,
} from "@/components/combat/enemies/enemy-catalog-panel"

import { useStagedEnemies } from "./use-staged-enemies"

/**
 * The dungeon Setup phase's **inline** enemy picker (UNN-467) — the bestiary
 * browse-and-stage in a dialog, so adding enemies never leaves the run console
 * (the standalone `/combat/{shortId}/enemies` route needs a persisted encounter,
 * which Setup deliberately doesn't have). Wraps the shared {@link EnemyCatalogPanel}
 * over an **ephemeral** {@link useStagedEnemies} queue; confirming hands the staged
 * creatures back to the Setup phase (which assigns each a zone), cancelling
 * discards. Nothing is persisted here.
 */
export function DungeonEnemyPickerDialog({
  open,
  onOpenChange,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (staged: StagedEnemy[]) => void
}) {
  const queue = useStagedEnemies()

  function close(next: boolean) {
    if (!next) queue.clear()
    onOpenChange(next)
  }

  function commit() {
    onConfirm(queue.staged)
    queue.clear()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="flex h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl">
        <DialogHeader className="border-b p-4">
          <DialogTitle>Add enemies</DialogTitle>
          <DialogDescription>
            Browse the bestiary and queue creatures for this fight. Place them
            in zones back on the roster.
          </DialogDescription>
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
