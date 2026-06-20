"use client"

import { type StagedEnemy } from "@/components/combat/enemies/enemy-catalog-panel"

import { EnemyCatalogDialog } from "./enemy-catalog-dialog"
import { useStagedEnemies } from "./use-staged-enemies"

/**
 * The dungeon Setup phase's **inline** enemy picker (UNN-467) — the bestiary
 * browse-and-stage in a dialog, so adding enemies never leaves the run console
 * (the standalone `/combat/{shortId}/enemies` route needs a persisted encounter,
 * which Setup deliberately doesn't have). Wraps the shared {@link EnemyCatalogDialog}
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
    <EnemyCatalogDialog
      open={open}
      onOpenChange={close}
      title="Add enemies"
      description="Browse the bestiary and queue creatures for this fight. Place them in zones back on the roster."
      queue={queue}
      onCommit={commit}
    />
  )
}
