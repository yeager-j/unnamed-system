"use client"

import { EyeIcon, FlagIcon } from "@phosphor-icons/react/dist/ssr"
import Link from "next/link"
import { useState } from "react"

import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"

import type { EncounterRow } from "@/lib/db/schema/encounter"
import {
  buildConsoleView,
  buildRosterView,
  combatantDetail,
  type PcCombatantDetail,
} from "@/lib/game/encounter"
import {
  COMBAT_ADVANTAGE_START_LABELS,
  COMBAT_DRAFT_HEADINGS,
  COMBAT_DRAFT_SUBTITLE,
  COMBAT_TURN_SUBTITLES,
} from "@/lib/ui/labels"

import { CombatantDrawer } from "./combatant-drawer"
import { CombatantRail } from "./combatant-rail"
import { EndOfTurnModal } from "./end-of-turn-modal"
import { TurnOrderStrip, type ConsolePhase } from "./turn-order-strip"
import { useCombatConsole } from "./use-combat-console"

/**
 * The live DM combat console (UNN-344) — the post-`startCombat` turn-driving
 * surface, replacing the Phase-4 stub. It wires the done engine to the DM: the
 * derived turn-order selectors and the `endTurn` / `draftCombatant` /
 * `advanceRound` events, all through `applyCombatEvent` (no new write path).
 *
 * The phase is **derived from the session** (ADR Decision 8) plus one
 * client-only `modalOpen` flag for the end-of-turn beat:
 * - no current actor → **drafting** (opening pick or a fresh round);
 * - current actor, not acted → **active turn**;
 * - current actor, acted, modal open → **resolving** (End turn pressed);
 * - current actor, acted, modal closed → **drafting** the next actor.
 *
 * Below the spine sits the combatant **rail** (UNN-345) and the battlefield
 * placeholder (the zone map is UNN-314); tapping a rail row opens the
 * per-combatant **detail drawer** (UNN-345).
 */
export function CombatConsole({
  encounter,
  pcDetailById,
}: {
  encounter: EncounterRow
  pcDetailById: Record<string, PcCombatantDetail>
}) {
  const { session, isPending, dispatch } = useCombatConsole(
    encounter.id,
    encounter.session,
    encounter.version
  )
  const [modalOpen, setModalOpen] = useState(false)
  const [selectedCombatantId, setSelectedCombatantId] = useState<string | null>(
    null
  )

  const view = buildConsoleView(session, pcDetailById)
  const { currentActor } = view
  const roster = buildRosterView(session, pcDetailById)
  const selectedDetail =
    selectedCombatantId !== null
      ? combatantDetail(session, selectedCombatantId, pcDetailById)
      : null

  const phase: ConsolePhase =
    currentActor === null
      ? "drafting"
      : !currentActor.hasActed
        ? "active"
        : modalOpen
          ? "resolving"
          : "drafting"

  const advantageLabel = session.advantage
    ? COMBAT_ADVANTAGE_START_LABELS[session.advantage]
    : null

  function onEndTurn() {
    dispatch({ kind: "endTurn" })
    setModalOpen(true)
  }

  function onDraft(combatantId: string) {
    dispatch({ kind: "draftCombatant", combatantId })
  }

  function onAdvanceRound() {
    dispatch({ kind: "advanceRound" })
  }

  return (
    <main className="flex w-full flex-1 flex-col gap-4 p-4 sm:p-6">
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
          <CombatantRail roster={roster} onSelect={setSelectedCombatantId} />
          <div
            className="flex flex-1 items-center justify-center rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground"
            data-testid="combat-console-battlefield-placeholder"
          >
            Battlefield — Zones &amp; engagement (UNN-314).
          </div>
        </div>
      )}

      <EndOfTurnModal
        actorName={currentActor?.name ?? ""}
        open={modalOpen && phase === "resolving"}
        onDone={() => setModalOpen(false)}
      />

      <CombatantDrawer
        detail={selectedDetail}
        onClose={() => setSelectedCombatantId(null)}
      />
    </main>
  )
}
