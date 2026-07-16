"use client"

import { EyeIcon, FlagIcon } from "@phosphor-icons/react/dist/ssr"
import Link from "next/link"

import { Button } from "@workspace/ui/components/button"
import { Separator } from "@workspace/ui/components/separator"

import { DungeonEndCombatDialog } from "@/app/campaigns/[campaignShortId]/dungeon/[shortId]/_components/combat/end-combat-dialog"
import { CanvasBottomBar } from "@/components/shared/canvas/canvas-bottom-bar"
import { CanvasZoomCluster } from "@/components/shared/canvas/canvas-zoom-cluster"

import { useDungeonCombatCanvas } from "./context"

/**
 * The combat-phase bottom **Panel** (UNN-536) — the combat peer of the
 * exploration {@link import("@/app/campaigns/[campaignShortId]/dungeon/[shortId]/_components/canvas/explore/turn-loop-bar").TurnLoopBar}.
 * Pinned inside React Flow so it can drive the viewport, it holds the static combat
 * verbs: **End turn** (while a combatant is acting), **Player
 * view** (the read-only fog view), **End encounter**, and the shared zoom cluster.
 * Whose-turn drafting lives in the left {@link import("@/app/campaigns/[campaignShortId]/dungeon/[shortId]/_components/combat/sidebar").DungeonCombatSidebar}
 * (moved off the canvas so it stops overlapping the cartouche + roster inspector);
 * all state comes from {@link useDungeonCombatCanvas}.
 */
export function CombatTurnBar() {
  const {
    phase,
    onEndTurn,
    playerViewHref,
    onEndEncounter,
    turnCounter,
    fallenPcNames,
    disabled,
  } = useDungeonCombatCanvas()

  return (
    <CanvasBottomBar>
      <CanvasZoomCluster />

      <Separator orientation="vertical" className="mx-1" />

      <Button
        size="sm"
        variant="outline"
        nativeButton={false}
        render={
          <Link
            href={playerViewHref}
            target="_blank"
            rel="noopener noreferrer"
          />
        }
      >
        <EyeIcon />
        Player view
      </Button>

      <DungeonEndCombatDialog
        turnCounter={turnCounter}
        fallenPcNames={fallenPcNames}
        onConfirm={onEndEncounter}
        disabled={disabled}
      />

      {phase === "active" ? (
        <Button size="sm" onClick={onEndTurn} disabled={disabled}>
          <FlagIcon weight="fill" />
          End turn
        </Button>
      ) : phase === "resolving" ? (
        <Button size="sm" variant="outline" disabled>
          Resolving…
        </Button>
      ) : (
        <Button size="sm" variant="outline" disabled>
          Drafting…
        </Button>
      )}
    </CanvasBottomBar>
  )
}
