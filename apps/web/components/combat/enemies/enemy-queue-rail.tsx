import {
  CheckIcon,
  MinusIcon,
  PlusIcon,
  SkullIcon,
  TrayIcon,
  XIcon,
} from "@phosphor-icons/react/dist/ssr"
import type { ReactNode } from "react"

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

/**
 * One queued group as the rail renders it. `id` is the group's identity — the
 * enemy key alone for the mapless queue, enemy × zone for the delve's — so the
 * steppers address a group, not a creature. `detail` is an optional second line
 * (the delve's zone `Select`); `qualifier` names the same distinction in prose,
 * because a `Select` can't live inside an accessible name and two groups of one
 * creature would otherwise share the label "Add one Goblin".
 */
export interface QueuedEnemyItem {
  id: string
  name: string
  count: number
  qualifier?: string
  detail?: ReactNode
}

/** No per-group ceiling: the mapless commit (`addCatalogEnemiesAction`) takes any
 *  positive count, so its stepper never disables. */
const UNCAPPED = Number.POSITIVE_INFINITY

/**
 * The "Queued enemies" staging rail (UNN-346): the local cart the DM builds
 * before committing. Shows each queued group with a quantity stepper + remove,
 * the running total, and the commit / cancel actions. The queue itself is the
 * caller's (localStorage-backed — `useEncounterEnemyQueue` for the mapless
 * encounter, `useDungeonEnemyQueue` for the delve); only committing writes.
 *
 * `headerAccessory` and `children` are the two consumer slots (UNN-541): the
 * delve hangs its "drop into" zone select off the header and its advantage /
 * first-side controls above the commit button, so both surfaces share one cart.
 * `maxCount` is the per-group ceiling its commit's wire enforces, if any — the
 * steppers disable there rather than letting the DM build a batch that Begin
 * would reject.
 */
export function EnemyQueueRail({
  items,
  totalCount,
  isPending,
  commitLabel = "Add to encounter",
  maxCount = UNCAPPED,
  headerAccessory,
  children,
  onIncrement,
  onDecrement,
  onRemove,
  onCommit,
  onCancel,
}: {
  items: QueuedEnemyItem[]
  totalCount: number
  isPending: boolean
  commitLabel?: string
  maxCount?: number
  headerAccessory?: ReactNode
  children?: ReactNode
  onIncrement: (id: string) => void
  onDecrement: (id: string) => void
  onRemove: (id: string) => void
  onCommit: () => void
  onCancel: () => void
}) {
  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-col gap-3 border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <SkullIcon className="size-4" />
          <h2 className="font-heading text-sm font-medium">Queued enemies</h2>
        </div>
        {headerAccessory}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {items.length === 0 ? (
          <Empty className="min-h-full">
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
              <QueuedEnemyRow
                key={item.id}
                item={item}
                atMax={item.count >= maxCount}
                onIncrement={() => onIncrement(item.id)}
                onDecrement={() => onDecrement(item.id)}
                onRemove={() => onRemove(item.id)}
              />
            ))}
          </ul>
        )}
      </div>

      <footer className="border-t p-4">
        {children}
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
          {commitLabel}
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

function QueuedEnemyRow({
  item,
  atMax,
  onIncrement,
  onDecrement,
  onRemove,
}: {
  item: QueuedEnemyItem
  atMax: boolean
  onIncrement: () => void
  onDecrement: () => void
  onRemove: () => void
}) {
  const label = item.qualifier ? `${item.name} in ${item.qualifier}` : item.name

  return (
    <li className="flex flex-col gap-2 border px-2.5 py-2">
      <div className="flex items-center gap-2.5">
        <EnemyAvatar name={item.name} />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          {item.name}
        </span>
        <div className="flex items-center gap-1">
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={`Remove one ${label}`}
            onClick={onDecrement}
          >
            <MinusIcon weight="bold" />
          </Button>
          <span className="w-5 text-center text-sm tabular-nums">
            {item.count}
          </span>
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={`Add one ${label}`}
            disabled={atMax}
            onClick={onIncrement}
          >
            <PlusIcon weight="bold" />
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={`Remove ${label} from queue`}
            onClick={onRemove}
          >
            <XIcon />
          </Button>
        </div>
      </div>
      {item.detail}
    </li>
  )
}
