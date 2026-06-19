"use client"

import { ArrowSquareOutIcon, LockIcon } from "@phosphor-icons/react/dist/ssr"
import { type Node, type NodeProps } from "@xyflow/react"

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"

import { initials } from "@/lib/ui/initials"

import { DungeonTokenChip } from "./dungeon-token-chip"
import { FloatingEdgeHandles } from "./floating-edge-handles"

export type FogZoneToken = {
  characterId: string
  name: string
  portraitUrl: string | null
  /** This token belongs to the signed-in viewer — gets the self-highlight ring. */
  owned: boolean
}
export type FogZoneEnemy = {
  id: string
  name: string
  hp: { current: number; max: number }
}
export type FogZoneExit = {
  /** The connection id (stable React key); the far Zone is undiscovered. */
  id: string
  locked: boolean
}
export type FogZoneData = {
  name: string
  description: string
  tokens: FogZoneToken[]
  enemies: FogZoneEnemy[]
  exits: FogZoneExit[]
}
export type DungeonFogZoneNode = Node<FogZoneData, "fogZone">

/**
 * A revealed Zone on the **player fog view** (UNN-466) — the read-only,
 * fully-redacted counterpart of the DM run console's
 * {@link import("./dungeon-zone-node").DungeonZoneNode}. It carries no reveal/move
 * toolbar (players don't act on the map); it shows what the redacted snapshot
 * permits: the Zone name, its player-facing description, the party tokens standing
 * in it (the viewer's own self-highlighted), and a footer of **known-exit
 * silhouettes** — one chip per exit leading somewhere undiscovered, encoding only
 * *that* an exit exists and whether it's locked (no far-Zone name/contents). The
 * hidden handles only need to *exist* so React Flow attaches the revealed-connection
 * floating edges; the floating router decides where they meet the border.
 */
export function DungeonFogZoneNode({ data }: NodeProps<DungeonFogZoneNode>) {
  const { name, description, tokens, enemies, exits } = data

  return (
    <>
      <FloatingEdgeHandles />

      <Card
        size="sm"
        aria-label={`Zone: ${name}`}
        className="min-h-40 w-86 shadow-sm"
      >
        <CardHeader>
          <CardTitle className="text-base">
            <span className="truncate">{name}</span>
          </CardTitle>
        </CardHeader>

        <CardContent className="flex flex-col gap-3">
          {description ? (
            <p className="text-sm text-muted-foreground">{description}</p>
          ) : null}

          {tokens.length > 0 || enemies.length > 0 ? (
            <ul className="flex flex-wrap gap-1.5">
              {tokens.map((token) => (
                <li key={token.characterId}>
                  <DungeonTokenChip
                    name={token.name}
                    portraitUrl={token.portraitUrl}
                    owned={token.owned}
                  />
                </li>
              ))}
              {enemies.map((enemy) => (
                <li key={enemy.id}>
                  <FogEnemyChip name={enemy.name} hp={enemy.hp} />
                </li>
              ))}
            </ul>
          ) : null}

          {exits.length > 0 ? (
            <ul className="flex flex-wrap gap-1.5">
              {exits.map((exit) => (
                <li key={exit.id}>
                  <ExitChip locked={exit.locked} />
                </li>
              ))}
            </ul>
          ) : null}
        </CardContent>
      </Card>
    </>
  )
}

/**
 * An **enemy** token on the player battlefield (UNN-467) — the redacted combat
 * peer of {@link DungeonTokenChip}. Side-tinted destructive-red (initials, never a
 * portrait) with a thin HP bar; the snapshot carries HP only, so attributes and
 * affinities can't be shown here (the combat-watch redaction, UNN-324).
 */
function FogEnemyChip({
  name,
  hp,
}: {
  name: string
  hp: { current: number; max: number }
}) {
  const pct =
    hp.max > 0 ? Math.max(0, Math.min(100, (hp.current / hp.max) * 100)) : 0
  return (
    <span className="inline-flex max-w-[10rem] flex-col gap-1 border border-red-700 bg-red-100 px-1.5 py-1 dark:border-red-400 dark:bg-red-950">
      <span className="flex items-center gap-1.5">
        <span
          aria-hidden
          className="flex size-5 shrink-0 items-center justify-center bg-red-200 text-[9px] font-semibold text-red-900 dark:bg-red-900 dark:text-red-100"
        >
          {initials(name, "?")}
        </span>
        <span className="truncate text-xs font-medium text-red-950 dark:text-red-100">
          {name}
        </span>
      </span>
      <span
        role="img"
        aria-label={`${hp.current} of ${hp.max} HP`}
        className="h-1 w-full bg-red-200 dark:bg-red-900"
      >
        <span
          className="block h-full bg-red-600 dark:bg-red-400"
          style={{ width: `${pct}%` }}
        />
      </span>
    </span>
  )
}

/**
 * A known-exit silhouette chip — *that* a passage leaves this Zone toward somewhere
 * undiscovered, and whether it's locked. Non-color-encoded (glyph + text) per the
 * canvas a11y baseline; carries no far-Zone information.
 */
function ExitChip({ locked }: { locked: boolean }) {
  return (
    <span className="inline-flex items-center gap-1 border border-dashed border-muted-foreground/60 px-1.5 py-0.5 text-[11px] text-muted-foreground">
      {locked ? (
        <LockIcon className="size-3 shrink-0" aria-hidden />
      ) : (
        <ArrowSquareOutIcon className="size-3 shrink-0" aria-hidden />
      )}
      {locked ? "Locked exit" : "Unexplored exit"}
    </span>
  )
}
