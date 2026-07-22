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
import type { EncounterState } from "@workspace/game-v2/encounter"
import type { Canon } from "@workspace/headcanon"
import { Separator } from "@workspace/ui/components/separator"

import { useEncounterEnemyQueue } from "@/app/campaigns/[campaignShortId]/encounter/[shortId]/_hooks/use-encounter-enemy-queue"
import { dispatchCombatEvent } from "@/components/combat/console/dispatch-event"
import { useCombatFeedback } from "@/components/combat/console/use-combat-feedback"
import { EnemyCatalogPanel } from "@/components/combat/enemies/enemy-catalog-panel"
import { EnemyQueueRail } from "@/components/combat/enemies/enemy-queue-rail"
import { buildReinforcements } from "@/domain/combat/reinforcements"
import { useCombatPredictions } from "@/domain/combat/use-combat-predictions"
import { encounterConsolePath } from "@/lib/paths"

/**
 * The catalog browse-and-add surface (UNN-346), committing onto engine v2
 * (UNN-535): a three-column master-detail over the bestiary plus a local
 * staging queue. The DM queues creatures (count per kind) and commits them
 * as `combat.event` mutations after materializing each key into a fresh inline
 * entity. Adds land unplaced on the enemies side (add-then-place), so each
 * accepted event advances only the encounter axis. The queue is
 * localStorage-backed (a reload never loses it).
 */
function enemyName(enemyKey: string): string {
  return getEnemy(enemyKey)?.components.identity?.name ?? enemyKey
}

export function EnemyCatalogBrowser({
  encounterId,
  shortId,
  campaignShortId,
  encounterName,
  canon,
  committedPlayers,
  committedEnemies,
}: {
  encounterId: string
  shortId: string
  campaignShortId: string
  encounterName: string
  canon: Canon<EncounterState>
  committedPlayers: number
  committedEnemies: number
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const queue = useEncounterEnemyQueue(encounterId)
  const root = useCombatPredictions({ canon })
  useCombatFeedback(root)

  const backHref = encounterConsolePath(campaignShortId, shortId)

  function returnToSetup() {
    queue.clear()
    router.push(backHref)
  }

  function commit() {
    startTransition(async () => {
      const setups = buildReinforcements(queue.queue, undefined)
      for (const setup of setups) {
        const receipt = dispatchCombatEvent({
          encounterId,
          event: { kind: "addParticipant", setup },
          root,
        })
        if (!receipt) return
        const accepted = await receipt.accepted
        if (!accepted.ok) return
      }

      queue.clear()
      toast.success(
        `Added ${queue.totalCount} ${queue.totalCount === 1 ? "enemy" : "enemies"} to the encounter.`
      )
      router.push(backHref)
    })
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
            isPending={isPending || root.status.pending > 0}
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
