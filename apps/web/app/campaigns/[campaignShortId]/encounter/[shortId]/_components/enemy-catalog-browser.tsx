"use client"

import {
  ArrowLeftIcon,
  SkullIcon,
  UsersIcon,
} from "@phosphor-icons/react/dist/ssr"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { toast } from "sonner"

import { getEnemy } from "@workspace/game-v2/catalog/enemies"
import { Separator } from "@workspace/ui/components/separator"

import { useEncounterEnemyQueue } from "@/app/campaigns/[campaignShortId]/encounter/[shortId]/_hooks/use-encounter-enemy-queue"
import { EnemyCatalogPanel } from "@/components/combat/enemies/enemy-catalog-panel"
import { EnemyQueueRail } from "@/components/combat/enemies/enemy-queue-rail"
import { addCatalogEnemiesAction } from "@/lib/actions/combat/add-participants"
import { combatErrorMessage } from "@/lib/actions/combat/error-message"
import { encounterConsolePath } from "@/lib/paths"
import { guardWriteTransition } from "@/lib/sync/guard-write-transition"

/**
 * The catalog browse-and-add surface (UNN-346), committing onto engine v2
 * (UNN-535): a three-column master-detail over the bestiary plus a local
 * staging queue. The DM queues creatures (count per kind) and commits them
 * through {@link addCatalogEnemiesAction}, which materializes each key into a
 * fresh **inline entity** server-side — adds land unplaced on the enemies side
 * (add-then-place), so the commit is a session-only write and carries no
 * Instance token. The queue is localStorage-backed (a reload never loses it).
 */
function enemyName(enemyKey: string): string {
  return getEnemy(enemyKey)?.components.identity?.name ?? enemyKey
}

export function EnemyCatalogBrowser({
  encounterId,
  shortId,
  campaignShortId,
  encounterName,
  expectedVersion,
  committedPlayers,
  committedEnemies,
}: {
  encounterId: string
  shortId: string
  campaignShortId: string
  encounterName: string
  expectedVersion: number
  committedPlayers: number
  committedEnemies: number
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const queue = useEncounterEnemyQueue(encounterId)

  const backHref = encounterConsolePath(campaignShortId, shortId)

  function returnToSetup() {
    queue.clear()
    router.push(backHref)
  }

  function commit() {
    startTransition(() =>
      guardWriteTransition(
        async () => {
          const saved = await addCatalogEnemiesAction({
            encounterId,
            expectedVersion,
            enemies: queue.queue.map((entry) => ({
              enemyKey: entry.enemyKey,
              count: entry.count,
            })),
          })

          if (!saved.ok) {
            toast.error(combatErrorMessage(saved.error))
            return
          }

          queue.clear()
          toast.success(
            `Added ${queue.totalCount} ${queue.totalCount === 1 ? "enemy" : "enemies"} to the encounter.`
          )
          router.push(backHref)
        },
        () => toast.error("Couldn't add the enemies. Try again.")
      )
    )
  }

  return (
    <main className="flex flex-col lg:h-[calc(100svh-3.5rem)] lg:overflow-hidden">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b px-6 py-4">
        <div className="min-w-0">
          <Link
            href={backHref}
            className="mb-1 flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeftIcon aria-hidden /> Back to setup
          </Link>
          <h1 className="font-heading text-2xl font-medium">
            Add enemies from catalog
          </h1>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            Browse the bestiary and queue creatures for this encounter. Pick a
            count to add several of a kind — they join as numbered combatants.
          </p>
        </div>
        <div className="flex items-center gap-6 border px-4 py-2.5">
          <div>
            <p className="text-xs tracking-wide text-muted-foreground uppercase">
              Encounter
            </p>
            <p className="font-heading text-sm font-medium">{encounterName}</p>
          </div>

          <Separator orientation="vertical" />

          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <UsersIcon className="size-4" /> {committedPlayers}
            </span>
            <span className="flex items-center gap-1">
              <SkullIcon className="size-4" /> {committedEnemies}
            </span>
          </div>
        </div>
      </header>

      <EnemyCatalogPanel
        onAdd={queue.add}
        rail={
          <EnemyQueueRail
            items={queue.queue.map((entry) => ({
              id: entry.enemyKey,
              name: enemyName(entry.enemyKey),
              count: entry.count,
            }))}
            totalCount={queue.totalCount}
            isPending={isPending}
            onIncrement={(key) => queue.add(key)}
            onDecrement={(key) => {
              const entry = queue.queue.find((item) => item.enemyKey === key)
              queue.setCount(key, (entry?.count ?? 0) - 1)
            }}
            onRemove={queue.remove}
            onCommit={commit}
            onCancel={returnToSetup}
          />
        }
      />
    </main>
  )
}
