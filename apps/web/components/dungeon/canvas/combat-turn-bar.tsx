"use client"

import { EyeIcon, FlagIcon, UserPlusIcon } from "@phosphor-icons/react/dist/ssr"
import Link from "next/link"

import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Separator } from "@workspace/ui/components/separator"

import { EndCombatDialog } from "@/components/combat/end-combat-dialog"
import { CanvasBottomBar } from "@/components/shared/canvas/canvas-bottom-bar"
import { CanvasZoomCluster } from "@/components/shared/canvas/canvas-zoom-cluster"

import { useDungeonCombatCanvas } from "./dungeon-combat-canvas-context"

/**
 * The combat-phase bottom **Panel** (UNN-467) — the combat peer of the
 * exploration {@link import("./turn-loop-bar").TurnLoopBar}. Pinned inside React
 * Flow so it can drive the viewport, it holds the static combat verbs (the
 * ticket's bottom toolbar): the Round badge, **End turn** (while a combatant is
 * acting), **Add combatant** (mid-fight reinforcement), **Player view** (the
 * read-only fog view), **End encounter**, and the shared zoom cluster. Whose-turn
 * drafting lives in the top {@link import("./combat-spine-panel").CombatSpinePanel};
 * all state comes from {@link useDungeonCombatCanvas}.
 */
export function CombatTurnBar() {
  const {
    round,
    phase,
    onEndTurn,
    onAddCombatant,
    playerViewHref,
    onEndEncounter,
    fallenPcNames,
    disabled,
  } = useDungeonCombatCanvas()

  return (
    <CanvasBottomBar>
      <Badge variant="outline" className="font-serif tabular-nums">
        Round {round}
      </Badge>

      {phase === "active" ? (
        <Button size="sm" onClick={onEndTurn} disabled={disabled}>
          <FlagIcon weight="fill" />
          End turn
        </Button>
      ) : phase === "resolving" ? (
        <Button size="sm" variant="outline" disabled>
          Resolving…
        </Button>
      ) : null}

      <Separator orientation="vertical" className="mx-1" />

      <Button
        size="sm"
        variant="outline"
        onClick={onAddCombatant}
        disabled={disabled}
      >
        <UserPlusIcon weight="bold" />
        Add combatant
      </Button>

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

      <EndCombatDialog
        fallenPcNames={fallenPcNames}
        onConfirm={onEndEncounter}
        disabled={disabled}
      />

      <Separator orientation="vertical" className="mx-1" />

      <CanvasZoomCluster />
    </CanvasBottomBar>
  )
}
