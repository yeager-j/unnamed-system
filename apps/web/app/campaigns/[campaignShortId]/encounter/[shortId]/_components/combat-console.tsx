"use client"

import { EyeIcon, FlagIcon, UserPlusIcon } from "@phosphor-icons/react/dist/ssr"
import Link from "next/link"
import { useState } from "react"

import type { ParticipantId } from "@workspace/game-v2/kernel/participant-id.schema"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { DataSelect } from "@workspace/ui/components/data-select"

import { useEncounterEnemyQueue } from "@/app/campaigns/[campaignShortId]/encounter/[shortId]/_hooks/use-encounter-enemy-queue"
import { useCombatConsole } from "@/components/combat/console/use-combat-console"
import { useCombatSelection } from "@/components/combat/console/use-combat-selection"
import { ZoneEnchantmentControl } from "@/components/combat/controls/zone-enchantment"
import { EndCombatDialog } from "@/components/combat/dialogs/end-combat"
import { EndOfTurnModal } from "@/components/combat/dialogs/end-of-turn-modal"
import { CombatantDrawer } from "@/components/combat/drawer/combatant-drawer"
import { EnemyCatalogDialog } from "@/components/combat/enemies/enemy-catalog-dialog"
import { CombatantRail } from "@/components/combat/rail/combatant-rail"
import { TurnOrderStrip } from "@/components/combat/turn-order-strip"
import { CampaignBackLink } from "@/components/shared/campaign-back-link"
import type { EncounterForDM } from "@/domain/combat/load-encounter-for-dm"
import { buildReinforcements } from "@/domain/combat/reinforcements"
import type { CombatantSheetSlice } from "@/domain/combat/sheet-slice"
import { enemyDisplayName } from "@/domain/combat/view/enemy-catalog-view"
import {
  COMBAT_ADVANTAGE_START_LABELS,
  COMBAT_DRAFT_HEADINGS,
  COMBAT_DRAFT_SUBTITLE,
  COMBAT_TURN_SUBTITLES,
} from "@/domain/labels"
import { encounterWatchPath } from "@/lib/paths"

import { ZoneLayout } from "./zone-layout"

/**
 * The live DM combat console (UNN-344), on engine v2 (UNN-535) — the
 * post-`startCombat` turn-driving surface. The view derivation (turn order,
 * roster, battlefield layout, phase, selected combatant, end-of-turn
 * obligations) lives in {@link useCombatConsole}; this component is the
 * mapless console's chrome.
 *
 * The battlefield is the same {@link ZoneLayout} card grid the watch renders
 * (token chips, adjacency footers, Enchantment badges, the unplaced overflow),
 * shaped from the optimistic frame by `buildConsoleZoneLayout` — the DM
 * additionally gets the per-zone Enchantment menu via `zoneAction`.
 */
export function CombatConsole({
  data,
  combatantSheetSliceById,
  campaignShortId,
}: {
  data: EncounterForDM
  combatantSheetSliceById: Record<ParticipantId, CombatantSheetSlice>
  campaignShortId: string
}) {
  const {
    session,
    instance,
    resolved,
    isPending,
    dispatch,
    dispatchSequence,
    dispatchWrite,
    endEncounter,
    view,
    currentActor,
    roster,
    zoneLayout,
    fallenPcNames,
    obligations,
    onDraft,
    onAdvanceRound,
  } = useCombatConsole(data)

  const {
    phase,
    selectedDetail,
    selectCombatant,
    endOfTurnOpen,
    closeEndOfTurn,
    onEndTurn,
  } = useCombatSelection({
    session,
    resolved,
    instance,
    participantMeta: data.participantMeta,
    combatantSheetSliceById,
    currentActor,
    dispatch,
  })

  const { encounter } = data
  const advantageLabel = session.advantage
    ? COMBAT_ADVANTAGE_START_LABELS[session.advantage]
    : null

  const [addOpen, setAddOpen] = useState(false)
  const queue = useEncounterEnemyQueue(encounter.id)
  const [arrivalZoneId, setArrivalZoneId] = useState(
    () => zoneLayout.zones[0]?.id
  )

  function addReinforcements() {
    const zoneId = zoneLayout.hasZones ? arrivalZoneId : undefined
    dispatchSequence(
      buildReinforcements(queue.queue, zoneId).map((setup) => ({
        kind: "addParticipant",
        setup,
      }))
    )
    queue.clear()
    setAddOpen(false)
  }

  return (
    <main className="flex w-full flex-1 flex-col gap-4 p-4 sm:p-6">
      {campaignShortId ? (
        <CampaignBackLink campaignShortId={campaignShortId} />
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Combat · <span className="text-foreground">{encounter.name}</span>
        </p>
        <div className="flex items-center gap-2">
          <Badge variant="outline">Round {session.round}</Badge>
          {advantageLabel ? (
            <Badge variant="secondary">{advantageLabel}</Badge>
          ) : null}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAddOpen(true)}
            disabled={isPending}
          >
            <UserPlusIcon />
            Add combatant
          </Button>
          <Button
            variant="outline"
            size="sm"
            nativeButton={false}
            render={
              <Link
                href={encounterWatchPath(campaignShortId, encounter.shortId)}
                target="_blank"
                rel="noopener noreferrer"
              />
            }
          >
            <EyeIcon />
            Player view
          </Button>
          <EndCombatDialog
            fallenPcNames={fallenPcNames}
            onConfirm={endEncounter}
            disabled={isPending}
          />
        </div>
      </div>

      <EnemyCatalogDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        items={queue.queue.map((entry) => ({
          id: entry.enemyKey,
          name: enemyDisplayName(entry.enemyKey),
          count: entry.count,
        }))}
        totalCount={queue.totalCount}
        isPending={isPending}
        zonePicker={
          zoneLayout.hasZones ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Arrive in</span>
              <DataSelect
                size="sm"
                className="flex-1"
                aria-label="Arrival zone"
                placeholder="Zone"
                options={zoneLayout.zones}
                optionValue={(zone) => zone.id}
                optionLabel={(zone) => zone.name}
                value={arrivalZoneId ?? ""}
                onValueChange={(next) =>
                  setArrivalZoneId(next || arrivalZoneId)
                }
              />
            </div>
          ) : undefined
        }
        onAdd={queue.add}
        onIncrement={(key) => queue.add(key)}
        onDecrement={(key) => {
          const entry = queue.queue.find((item) => item.enemyKey === key)
          queue.setCount(key, (entry?.count ?? 0) - 1)
        }}
        onRemove={queue.remove}
        onCommit={addReinforcements}
      />

      <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3 border-b pb-4">
        <div className="flex min-w-0 flex-col gap-2">
          {phase === "drafting" ? (
            <>
              <h1 className="font-heading text-lg font-medium">
                {COMBAT_DRAFT_HEADINGS[view.draftingSide]}
              </h1>
              <p className="text-sm text-muted-foreground">
                {COMBAT_DRAFT_SUBTITLE}
              </p>
            </>
          ) : (
            <>
              <h1 className="font-heading text-lg font-medium">
                Now acting: {currentActor?.name}
              </h1>
              <p className="text-sm text-muted-foreground">
                {phase === "resolving"
                  ? "Resolving end-of-turn checks…"
                  : currentActor
                    ? COMBAT_TURN_SUBTITLES[currentActor.side]
                    : null}
              </p>
            </>
          )}

          {session.participants.length > 0 ? (
            <TurnOrderStrip
              rows={view.rows}
              phase={phase}
              round={session.round}
              roundComplete={view.roundComplete}
              isPending={isPending}
              onDraft={onDraft}
              onAdvanceRound={onAdvanceRound}
            />
          ) : null}
        </div>

        <div className="shrink-0">
          {phase === "active" ? (
            <Button onClick={onEndTurn} disabled={isPending}>
              <FlagIcon weight="fill" />
              End turn
            </Button>
          ) : phase === "resolving" ? (
            <Button variant="outline" disabled>
              Resolving…
            </Button>
          ) : (
            <Badge variant="outline" className="h-9 px-3">
              Tap who&apos;s up
            </Badge>
          )}
        </div>
      </header>

      {session.participants.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No combatants in this encounter.
        </p>
      ) : (
        <div className="flex flex-1 flex-col gap-6 md:flex-row">
          <CombatantRail roster={roster} onSelect={selectCombatant} />
          <ZoneLayout
            view={zoneLayout}
            zoneAction={(zone) => (
              <ZoneEnchantmentControl
                zoneId={zone.id}
                zoneName={zone.name}
                enchantment={zone.enchantment}
                onCombatEvent={dispatch}
                disabled={isPending}
              />
            )}
          />
        </div>
      )}

      {currentActor ? (
        <EndOfTurnModal
          actorId={currentActor.id}
          actorName={currentActor.name}
          obligations={obligations}
          open={endOfTurnOpen}
          onCombatEvent={dispatch}
          onApplyHp={(apply) =>
            void dispatchWrite(currentActor.id, {
              component: "vitals",
              op: apply.delta < 0 ? "damage" : "heal",
              amount: Math.abs(apply.delta),
            })
          }
          isPending={isPending}
          onDone={closeEndOfTurn}
        />
      ) : null}

      <CombatantDrawer
        detail={selectedDetail}
        onClose={() => selectCombatant(null)}
        onCombatEvent={dispatch}
        dispatchWrite={dispatchWrite}
      />
    </main>
  )
}
