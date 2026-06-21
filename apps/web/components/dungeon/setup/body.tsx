"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { getEnemy } from "@workspace/game/data"
import { compareInitiative, type InitiativeStats } from "@workspace/game/engine"
import { SidebarInset } from "@workspace/ui/components/sidebar"

import { StartCombatDialog } from "@/components/combat/dialogs/start-combat"
import { type StagedEnemy } from "@/components/combat/enemies/enemy-catalog-panel"
import { DungeonCanvas } from "@/components/dungeon/canvas/canvas"
import { SetupBar } from "@/components/dungeon/canvas/setup/bar"
import { DungeonSetupCanvasProvider } from "@/components/dungeon/canvas/setup/context"
import {
  buildSetupCombatants,
  buildSetupTokensByZone,
} from "@/components/dungeon/setup/board"
import { DungeonEnemyPickerDialog } from "@/components/dungeon/setup/enemy-picker-dialog"
import {
  DungeonSetupSidebar,
  type SetupEnemyRow,
} from "@/components/dungeon/setup/sidebar"
import { DungeonSidebarSlot } from "@/components/dungeon/shell/console-shell"
import { dungeonErrorMessage } from "@/lib/actions/dungeon/error-message"
import { startDungeonEncounterAction } from "@/lib/actions/encounter/start-dungeon-encounter"
import type { CharacterSummary } from "@/lib/db/queries/character-list"
import type { DungeonRow } from "@/lib/db/schema/dungeon"
import type { MapInstanceRow } from "@/lib/db/schema/map-instance"
import { resolveCatalogEnemyStatblocks } from "@/lib/game-engine"

/**
 * The run console's **Setup** phase (UNN-467) — the spatially-scoped combatant
 * picker that morphs the same shell as exploration. The party pre-fills (every
 * delve PC, toggle in/out by tapping its panel row or map token), the DM adds
 * enemies through the inline catalog picker and places each in a Zone, then
 * **Begin** hands off to the existing advantage / first-side dialog and commits
 * the fight as an already-live encounter on the delve's Instance
 * ({@link startDungeonEncounterAction}). All staging is **ephemeral** — Cancel
 * returns to exploration with nothing written.
 */
export function DungeonEncounterSetup({
  dungeon,
  instance,
  placedCharacters,
  pcStatsById,
  campaignShortId,
  onCancel,
}: {
  dungeon: Pick<DungeonRow, "id" | "shortId" | "name" | "mapInstanceId">
  instance: Pick<MapInstanceRow, "state" | "version">
  placedCharacters: CharacterSummary[]
  pcStatsById: Record<string, InitiativeStats>
  campaignShortId: string
  onCancel: () => void
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  // The party = the delve roster: placed characters with a token on the Instance.
  const partyCandidates = placedCharacters.filter(
    (character) => instance.state.occupancy[character.id] !== undefined
  )

  const [includedIds, setIncludedIds] = useState<Set<string>>(
    () => new Set(partyCandidates.map((character) => character.id))
  )
  const [enemies, setEnemies] = useState<SetupEnemyRow[]>([])
  const [pickerOpen, setPickerOpen] = useState(false)
  const [advantageOpen, setAdvantageOpen] = useState(false)

  const zones = Object.values(instance.state.geometry.zones).map((zone) => ({
    id: zone.id,
    name: zone.name,
  }))

  function togglePc(characterId: string) {
    setIncludedIds((prev) => {
      const next = new Set(prev)
      if (next.has(characterId)) next.delete(characterId)
      else next.add(characterId)
      return next
    })
  }

  function addStagedEnemies(staged: StagedEnemy[]) {
    setEnemies((prev) => [
      ...prev,
      ...staged.map((entry) => ({
        tmpId: crypto.randomUUID(),
        enemyKey: entry.enemyKey,
        name: getEnemy(entry.enemyKey)?.name ?? entry.enemyKey,
        count: entry.count,
        zoneId: zones.length === 1 ? zones[0]!.id : "",
      })),
    ])
  }

  const enemyCount = enemies.reduce((sum, enemy) => sum + enemy.count, 0)
  const canBegin =
    enemyCount > 0 && enemies.every((enemy) => enemy.zoneId !== "")

  const setups = buildSetupCombatants(
    includedIds,
    enemies,
    instance.state.occupancy
  )

  const comparison = compareInitiative(
    setups,
    pcStatsById,
    resolveCatalogEnemyStatblocks(setups)
  )

  const tokensByZone = buildSetupTokensByZone(
    partyCandidates,
    enemies,
    includedIds,
    instance.state.occupancy
  )

  // React Compiler keeps this referentially stable across renders where
  // `tokensByZone` is unchanged, so the canvas's node-sync effect doesn't re-derive
  // — no manual memo (matching dungeon-explore-body / dungeon-combat-body).
  const canvasMode = { kind: "setup" as const, tokensByZone }

  function begin(
    advantage: Parameters<typeof startDungeonEncounterAction>[0]["advantage"],
    firstSide: Parameters<typeof startDungeonEncounterAction>[0]["firstSide"]
  ) {
    startTransition(async () => {
      const result = await startDungeonEncounterAction({
        dungeonId: dungeon.id,
        expectedInstanceVersion: instance.version,
        name: `${dungeon.name} — combat`,
        advantage,
        firstSide,
        partyCharacterIds: [...includedIds],
        enemies: enemies.map((enemy) => ({
          enemyKey: enemy.enemyKey,
          zoneId: enemy.zoneId,
          count: enemy.count,
        })),
      })
      if (!result.ok) {
        toast.error(dungeonErrorMessage(result.error))
        return
      }
      setAdvantageOpen(false)
      router.refresh()
    })
  }

  return (
    <>
      <DungeonSidebarSlot>
        <DungeonSetupSidebar
          dungeonName={dungeon.name}
          campaignShortId={campaignShortId}
          partyCandidates={partyCandidates}
          includedIds={includedIds}
          onTogglePc={togglePc}
          enemies={enemies}
          zones={zones}
          onAddEnemies={() => setPickerOpen(true)}
          onSetEnemyZone={(tmpId, zoneId) =>
            setEnemies((prev) =>
              prev.map((enemy) =>
                enemy.tmpId === tmpId ? { ...enemy, zoneId } : enemy
              )
            )
          }
          onRemoveEnemy={(tmpId) =>
            setEnemies((prev) => prev.filter((enemy) => enemy.tmpId !== tmpId))
          }
          disabled={isPending}
        />
      </DungeonSidebarSlot>

      <SidebarInset className="relative">
        <DungeonSetupCanvasProvider
          value={{
            isIncluded: (characterId) => includedIds.has(characterId),
            onTogglePc: togglePc,
            beginCount: enemyCount,
            canBegin,
            onBegin: () => setAdvantageOpen(true),
            onCancel,
            disabled: isPending,
          }}
        >
          <div className="absolute inset-0">
            <DungeonCanvas
              instance={instance.state}
              mode={canvasMode}
              persistKey={dungeon.shortId}
              bar={<SetupBar />}
            />
          </div>
        </DungeonSetupCanvasProvider>
      </SidebarInset>

      <DungeonEnemyPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onConfirm={addStagedEnemies}
      />

      <StartCombatDialog
        comparison={comparison}
        onStart={begin}
        disabled={isPending}
        open={advantageOpen}
        onOpenChange={setAdvantageOpen}
      />
    </>
  )
}
