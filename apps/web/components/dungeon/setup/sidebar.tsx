"use client"

import { SkullIcon, XIcon } from "@phosphor-icons/react/dist/ssr"

import { Button } from "@workspace/ui/components/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { SidebarContent, SidebarGroup } from "@workspace/ui/components/sidebar"

import { ImportPcsPanel } from "@/components/combat/setup/import-pcs-panel"
import { DungeonSidebarHeader } from "@/components/dungeon/shell/sidebar-header"
import type { CharacterSummary } from "@/lib/db/queries/character-list"

/** One staged enemy group as the Setup sidebar renders it. */
export interface SetupEnemyRow {
  tmpId: string
  enemyKey: string
  name: string
  count: number
  zoneId: string
}

/**
 * The run console's left panel during **Setup** (UNN-467) — the Party panel
 * morphed to **Set up encounter**, portaled into the persistent
 * {@link import("@/components/dungeon/shell/console-shell").DungeonConsoleShell}'s shared `<Sidebar>`
 * (UNN-488). A Players section (the delve party, each toggleable in/out of the
 * fight via the shared {@link ImportPcsPanel}) and an Enemies section (the staged
 * catalog picks, each with a zone placement + remove, plus the "Add enemies" button
 * that opens the inline picker). All state is the Setup orchestrator's; this panel
 * is presentation + callbacks.
 */
export function DungeonSetupSidebar({
  dungeonName,
  campaignShortId,
  partyCandidates,
  includedIds,
  onTogglePc,
  enemies,
  zones,
  onAddEnemies,
  onSetEnemyZone,
  onRemoveEnemy,
  disabled,
}: {
  dungeonName: string
  campaignShortId: string
  partyCandidates: CharacterSummary[]
  includedIds: ReadonlySet<string>
  onTogglePc: (characterId: string) => void
  enemies: SetupEnemyRow[]
  zones: { id: string; name: string }[]
  onAddEnemies: () => void
  onSetEnemyZone: (tmpId: string, zoneId: string) => void
  onRemoveEnemy: (tmpId: string) => void
  disabled?: boolean
}) {
  return (
    <>
      <DungeonSidebarHeader
        dungeonName={dungeonName}
        campaignShortId={campaignShortId}
      >
        <div className="flex flex-col">
          <h2 className="font-heading text-base font-semibold">
            Set up encounter
          </h2>
          <p className="text-xs text-muted-foreground">
            Pick who fights, then begin.
          </p>
        </div>
      </DungeonSidebarHeader>

      <SidebarContent className="gap-4 p-2">
        <SidebarGroup className="gap-2">
          <ImportPcsPanel
            placedCharacters={partyCandidates}
            addedCharacterIds={includedIds}
            onToggle={onTogglePc}
          />
        </SidebarGroup>

        <SidebarGroup className="gap-2">
          <section className="flex flex-col gap-3 rounded-lg border p-4">
            <header className="flex items-center justify-between gap-2">
              <h2 className="font-heading text-sm font-medium">Enemies</h2>
              <Button size="sm" variant="outline" onClick={onAddEnemies}>
                <SkullIcon weight="bold" />
                Add enemies
              </Button>
            </header>

            {enemies.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No enemies yet — add at least one to begin.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {enemies.map((enemy) => (
                  <li
                    key={enemy.tmpId}
                    className="flex flex-col gap-1.5 border p-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate text-sm font-medium">
                        {enemy.name}
                        {enemy.count > 1 ? ` ×${enemy.count}` : ""}
                      </span>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label={`Remove ${enemy.name}`}
                        onClick={() => onRemoveEnemy(enemy.tmpId)}
                      >
                        <XIcon />
                      </Button>
                    </div>
                    <Select
                      value={enemy.zoneId}
                      onValueChange={(value) =>
                        onSetEnemyZone(enemy.tmpId, value ?? "")
                      }
                      disabled={disabled || zones.length === 0}
                    >
                      <SelectTrigger size="sm" className="w-full">
                        <SelectValue placeholder="Place in a zone…">
                          {zones.find((zone) => zone.id === enemy.zoneId)
                            ?.name ?? "Place in a zone…"}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {zones.map((zone) => (
                          <SelectItem key={zone.id} value={zone.id}>
                            {zone.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </SidebarGroup>
      </SidebarContent>
    </>
  )
}
