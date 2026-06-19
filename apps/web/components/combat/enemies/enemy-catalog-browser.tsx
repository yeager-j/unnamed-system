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

import { type CombatantSetup } from "@workspace/game/foundation"
import { Separator } from "@workspace/ui/components/separator"

import { useEncounterEnemyQueue } from "@/hooks/use-encounter-enemy-queue"
import { encounterErrorMessage } from "@/lib/actions/encounter/error-message"
import { addSetupCombatantsAction } from "@/lib/actions/encounter/setup"

import { EnemyCatalogPanel } from "./enemy-catalog-panel"

/**
 * The catalog browse-and-add surface (UNN-346): a three-column master-detail
 * over the bestiary plus a local staging queue. The DM searches/filters the
 * master list, inspects a statblock, queues creatures (count per kind), and
 * commits them as `catalog-enemy` combatants on the **enemies** side via the
 * existing setup save path. The queue is localStorage-backed (so a reload never
 * loses it); "Add to encounter" appends to the persisted roster and returns to
 * setup, "Cancel" discards and returns. Side assignment (UNN-300) and zone
 * placement (UNN-301) come later — adds land unplaced on the enemies side.
 */
export function EnemyCatalogBrowser({
  encounterId,
  shortId,
  encounterName,
  expectedVersion,
  expectedInstanceVersion,
  existingCombatants,
}: {
  encounterId: string
  shortId: string
  encounterName: string
  expectedVersion: number
  expectedInstanceVersion: number
  existingCombatants: CombatantSetup[]
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const queue = useEncounterEnemyQueue(encounterId)

  const committedPlayers = existingCombatants.filter(
    (combatant) => combatant.side === "players"
  ).length
  const committedEnemies = existingCombatants.filter(
    (combatant) => combatant.side === "enemies"
  ).length

  const backHref = `/combat/${shortId}`

  function returnToSetup() {
    queue.clear()
    router.push(backHref)
  }

  function commit() {
    startTransition(async () => {
      const newCombatants: CombatantSetup[] = queue.queue.flatMap((entry) =>
        Array.from({ length: entry.count }, () => ({
          side: "enemies" as const,
          ref: { kind: "catalog-enemy" as const, enemyKey: entry.enemyKey },
          zoneId: "",
        }))
      )

      const saved = await addSetupCombatantsAction({
        encounterId,
        expectedVersion,
        expectedInstanceVersion,
        combatants: newCombatants,
      })

      if (!saved.ok) {
        toast.error(encounterErrorMessage(saved.error))
        return
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
        queue={queue.queue}
        isPending={isPending}
        onAdd={queue.add}
        onIncrement={(key) => queue.add(key)}
        onDecrement={(key) => {
          const entry = queue.queue.find((item) => item.enemyKey === key)
          queue.setCount(key, (entry?.count ?? 0) - 1)
        }}
        onRemove={queue.remove}
        onCommit={commit}
        onCancel={returnToSetup}
      />
    </main>
  )
}
