"use client"

import { EyeIcon, FlagIcon } from "@phosphor-icons/react/dist/ssr"
import Link from "next/link"

import type { ParticipantId } from "@workspace/game-v2/kernel/participant-id.schema"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"

import type { EncounterForDM } from "@/app/combat/[shortId]/encounter-access"
import { useCombatConsole } from "@/components/combat/console/use-combat-console"
import { ZoneEnchantmentControl } from "@/components/combat/controls/zone-enchantment"
import { EndCombatDialog } from "@/components/combat/dialogs/end-combat"
import { EndOfTurnModal } from "@/components/combat/dialogs/end-of-turn-modal"
import { CombatantDrawer } from "@/components/combat/drawer/combatant-drawer"
import { CombatantRail } from "@/components/combat/rail/combatant-rail"
import { TurnOrderStrip } from "@/components/combat/turn-order-strip"
import { CampaignBackLink } from "@/components/shared/campaign-back-link"
import { RealtimeChannelListener } from "@/hooks/use-realtime-channel"
import type { DurableHydration } from "@/lib/combat/view/detail-view"
import {
  COMBAT_ADVANTAGE_START_LABELS,
  COMBAT_DRAFT_HEADINGS,
  COMBAT_DRAFT_SUBTITLE,
  COMBAT_TURN_SUBTITLES,
} from "@/lib/ui/labels"

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
  durableHydrationById,
  campaignShortId,
}: {
  data: EncounterForDM
  durableHydrationById: Record<ParticipantId, DurableHydration>
  campaignShortId: string
}) {
  const {
    session,
    isPending,
    dispatch,
    dispatchWrite,
    endEncounter,
    onPcPing,
    view,
    currentActor,
    roster,
    zoneLayout,
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
  } = useCombatConsole(data, durableHydrationById)

  const { encounter } = data
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
            void dispatchWrite(
              currentActor.id,
              {
                component: "vitals",
                op: apply.delta < 0 ? "damage" : "heal",
                amount: Math.abs(apply.delta),
              },
              {}
            )
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
