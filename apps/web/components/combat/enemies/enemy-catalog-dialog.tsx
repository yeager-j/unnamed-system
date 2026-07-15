import type { ReactNode } from "react"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"

import { EnemyCatalogPanel } from "./enemy-catalog-panel"
import { EnemyQueueRail, type QueuedEnemyItem } from "./enemy-queue-rail"

/**
 * The shared **mid-combat add** surface (UNN-493): a route-agnostic dialog
 * hosting the kit's three-column {@link EnemyCatalogPanel} + {@link EnemyQueueRail}
 * so a live combat console can pull catalog reinforcements without leaving the
 * fight. It composes only kit pieces and stays **queue-blind** — the caller owns
 * the staging queue (its localStorage home, its identity) and passes the shaped
 * rows + mutators + commit structurally, exactly as the browse/staging routes do.
 *
 * `zonePicker` rides the rail's `headerAccessory` slot (the same slot the delve's
 * pre-combat staging uses): the caller renders an arrival-zone `Select` there
 * when the encounter has zones, and nothing when it's theater-of-mind. Closing
 * without committing keeps the cart (localStorage); committing is the caller's to
 * clear.
 */
export function EnemyCatalogDialog({
  open,
  onOpenChange,
  title = "Add combatants",
  description = "Browse the bestiary and drop reinforcements into the fight. They join as new combatants without ending the round.",
  items,
  totalCount,
  isPending,
  commitLabel = "Add to combat",
  zonePicker,
  onAdd,
  onIncrement,
  onDecrement,
  onRemove,
  onCommit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title?: string
  description?: string
  items: QueuedEnemyItem[]
  totalCount: number
  isPending: boolean
  commitLabel?: string
  zonePicker?: ReactNode
  onAdd: (enemyKey: string) => void
  onIncrement: (id: string) => void
  onDecrement: (id: string) => void
  onRemove: (id: string) => void
  onCommit: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[85svh] w-full max-w-[calc(100%-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl">
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle className="text-lg">{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col">
          <EnemyCatalogPanel
            onAdd={onAdd}
            rail={
              <EnemyQueueRail
                items={items}
                totalCount={totalCount}
                isPending={isPending}
                commitLabel={commitLabel}
                headerAccessory={zonePicker}
                onIncrement={onIncrement}
                onDecrement={onDecrement}
                onRemove={onRemove}
                onCommit={onCommit}
                onCancel={() => onOpenChange(false)}
              />
            }
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}
