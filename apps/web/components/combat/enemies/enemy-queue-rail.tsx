import {
  CheckIcon,
  MinusIcon,
  PlusIcon,
  SkullIcon,
  TrayIcon,
  XIcon,
} from "@phosphor-icons/react/dist/ssr"

import { Button } from "@workspace/ui/components/button"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@workspace/ui/components/empty"
import { Spinner } from "@workspace/ui/components/spinner"

import { EnemyAvatar } from "./enemy-statblock-card"

/** One queued creature as the rail renders it — its display name and staged count. */
export interface QueuedEnemyItem {
  enemyKey: string
  name: string
  count: number
}

/**
 * The "Queued enemies" staging rail (UNN-346): the local cart the DM builds
 * before committing. Shows each queued creature with a quantity stepper +
 * remove, the running total, and the commit / cancel actions. The queue is
 * local + localStorage-backed (see `useEncounterEnemyQueue`); only "Add to
 * encounter" writes to the DB.
 */
export function EnemyQueueRail({
  items,
  totalCount,
  isPending,
  onIncrement,
  onDecrement,
  onRemove,
  onCommit,
  onCancel,
}: {
  items: QueuedEnemyItem[]
  totalCount: number
  isPending: boolean
  onIncrement: (enemyKey: string) => void
  onDecrement: (enemyKey: string) => void
  onRemove: (enemyKey: string) => void
  onCommit: () => void
  onCancel: () => void
}) {
  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-2 border-b px-4 py-3">
        <SkullIcon className="size-4" />
        <h2 className="font-heading text-sm font-medium">Queued enemies</h2>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {items.length === 0 ? (
          <Empty className="h-full">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <TrayIcon />
              </EmptyMedia>
              <EmptyTitle>Nothing queued yet.</EmptyTitle>
              <EmptyDescription>
                Add creatures and they&apos;ll collect here, ready to drop into
                the encounter.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ul className="flex flex-col gap-2">
            {items.map((item) => (
              <li
                key={item.enemyKey}
                className="flex items-center gap-2.5 border px-2.5 py-2"
              >
                <EnemyAvatar name={item.name} />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {item.name}
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`Remove one ${item.name}`}
                    onClick={() => onDecrement(item.enemyKey)}
                  >
                    <MinusIcon weight="bold" />
                  </Button>
                  <span className="w-5 text-center text-sm tabular-nums">
                    {item.count}
                  </span>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`Add one ${item.name}`}
                    onClick={() => onIncrement(item.enemyKey)}
                  >
                    <PlusIcon weight="bold" />
                  </Button>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`Remove ${item.name} from queue`}
                    onClick={() => onRemove(item.enemyKey)}
                  >
                    <XIcon />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <footer className="border-t p-4">
        <div className="mb-3 flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Total enemies</span>
          <span className="font-medium tabular-nums">{totalCount}</span>
        </div>
        <Button
          className="w-full"
          onClick={onCommit}
          disabled={totalCount === 0 || isPending}
        >
          {isPending ? <Spinner /> : <CheckIcon weight="bold" />}
          Add to encounter
        </Button>
        <Button
          variant="ghost"
          className="mt-1 w-full"
          onClick={onCancel}
          disabled={isPending}
        >
          Cancel
        </Button>
      </footer>
    </div>
  )
}
