"use client"

import { EyeIcon, FlagIcon } from "@phosphor-icons/react/dist/ssr"
import Link from "next/link"

import { type PcCombatantDetail } from "@workspace/game/engine"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"

import { CombatantDrawer } from "@/components/combat/combatant-drawer"
import { CombatantRail } from "@/components/combat/combatant-rail"
import { EndCombatDialog } from "@/components/combat/end-combat-dialog"
import { EndOfTurnModal } from "@/components/combat/end-of-turn-modal"
import { TurnOrderStrip } from "@/components/combat/turn-order-strip"
import { useCombatConsole } from "@/components/combat/use-combat-console"
import { ZoneEnchantmentControl } from "@/components/combat/zone-enchantment-control"
import { CampaignBackLink } from "@/components/shared/campaign-back-link"
import { RealtimeChannelListener } from "@/hooks/use-realtime-channel"
import type { EncounterRow } from "@/lib/db/schema/encounter"
import type { MapInstanceRow } from "@/lib/db/schema/map-instance"
import {
  COMBAT_ADVANTAGE_START_LABELS,
  COMBAT_DRAFT_HEADINGS,
  COMBAT_DRAFT_SUBTITLE,
  COMBAT_TURN_SUBTITLES,
} from "@/lib/ui/labels"

import { ZoneLayout } from "./zone-layout"

/**
 * The live DM combat console (UNN-344) — the post-`startCombat` turn-driving
 * surface, replacing the Phase-4 stub. It wires the done engine to the DM: the
 * derived turn-order selectors and the `endTurn` / `draftCombatant` /
 * `advanceRound` events, all through `applyCombatEvent` (no new write path).
 *
 * The view derivation (turn order, roster, zone layout, phase, the selected
 * combatant, end-of-turn obligations) lives in {@link useCombatConsole}, shared
 * with the dungeon combat body so the two can't drift; this component is the
 * standalone console's chrome (header, battlefield layout) only.
 *
 * The phase is **derived from the session** (ADR Decision 8) plus one
 * client-only modal flag for the end-of-turn beat:
 * - no current actor → **drafting** (opening pick or a fresh round);
 * - current actor, not acted → **active turn**;
 * - current actor, acted, modal open → **resolving** (End turn pressed);
 * - current actor, acted, modal closed → **drafting** the next actor.
 *
 * Below the spine sits the combatant **rail** (UNN-345) and the **battlefield**
 * zone layout (UNN-314, read-only; movement is UNN-315); tapping a rail row opens
 * the per-combatant **detail drawer** (UNN-345).
 */
export function CombatConsole({
  encounter,
  instance,
  campaignShortId,
  pcDetailById,
  pcShortIdById,
}: {
  encounter: EncounterRow
  instance: MapInstanceRow
  campaignShortId: string
  pcDetailById: Record<string, PcCombatantDetail>
  /** Each PC combatant's public shortId — the realtime channel key (UNN-373). */
  pcShortIdById: Record<string, string>
}) {
  const {
    session,
    isPending,
    dispatch,
    endEncounter,
    pcVitalsVersions,
    onPcPing,
    view,
    currentActor,
    roster,
    layout,
    fallenPcNames,
    obligations,
    phase,
    pcChannelIds,
    selectedDetail,
    selectCombatant,
    endOfTurnOpen,
    closeEndOfTurn,
    onEndTurn,
    onDraft,
    onAdvanceRound,
  } = useCombatConsole(encounter, instance, pcDetailById, pcShortIdById)

  const advantageLabel = session.advantage
    ? COMBAT_ADVANTAGE_START_LABELS[session.advantage]
    : null

  return (
    <main className="flex w-full flex-1 flex-col gap-4 p-4 sm:p-6">
      {pcChannelIds.map(({ characterId, shortId }) => (
        <RealtimeChannelListener
          key={shortId}
          domain="character"
          shortId={shortId}
          onPing={(data) => onPcPing(characterId, data)}
        />
      ))}
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
            nativeButton={false}
            render={
              <Link
                href={`/c/encounter/${encounter.shortId}`}
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

          {session.combatants.length > 0 ? (
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

      {session.combatants.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No combatants in this encounter.
        </p>
      ) : (
        <div className="flex flex-1 flex-col gap-6 md:flex-row">
          <CombatantRail roster={roster} onSelect={selectCombatant} />
          <ZoneLayout
            view={layout}
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

      <EndOfTurnModal
        actorId={currentActor?.id ?? ""}
        actorName={currentActor?.name ?? ""}
        obligations={obligations}
        open={endOfTurnOpen}
        onCombatEvent={dispatch}
        isPending={isPending}
        onDone={closeEndOfTurn}
      />

      <CombatantDrawer
        detail={selectedDetail}
        onClose={() => selectCombatant(null)}
        onCombatEvent={dispatch}
        pcVitalsVersions={pcVitalsVersions}
      />
    </main>
  )
}
