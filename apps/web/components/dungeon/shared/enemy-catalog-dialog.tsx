"use client"

import type { ReactNode } from "react"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"

import { EnemyCatalogPanel } from "@/components/combat/enemies/enemy-catalog-panel"
import { useStagedEnemies } from "@/components/dungeon/shared/use-staged-enemies"

/**
 * The shared shell for the dungeon's two enemy-catalog dialogs (UNN-467) — the Setup
 * picker and the mid-fight add-combatant dialog. A sized, headered {@link Dialog}
 * wrapping the bestiary {@link EnemyCatalogPanel} over the caller's ephemeral
 * {@link useStagedEnemies} queue. The caller owns the queue, its `onOpenChange` (which
 * clears the queue on close), and the commit; `headerChildren` carries any extra
 * header control (the add-combatant zone picker).
 */
export function EnemyCatalogDialog({
  open,
  onOpenChange,
  title,
  description,
  headerChildren,
  queue,
  onCommit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  headerChildren?: ReactNode
  queue: ReturnType<typeof useStagedEnemies>
  onCommit: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl">
        <DialogHeader className="border-b p-4">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
          {headerChildren}
        </DialogHeader>
        <EnemyCatalogPanel
          queue={queue.staged}
          isPending={false}
          onAdd={queue.add}
          onIncrement={queue.add}
          onDecrement={queue.decrement}
          onRemove={queue.remove}
          onCommit={onCommit}
          onCancel={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  )
}
