"use client"

import { ArrowSquareOutIcon, LockIcon } from "@phosphor-icons/react/dist/ssr"
import { type Node, type NodeProps } from "@xyflow/react"

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"

import { DungeonTokenChip } from "./dungeon-token-chip"
import { FloatingEdgeHandles } from "./floating-edge-handles"

export type FogZoneToken = {
  characterId: string
  name: string
  portraitUrl: string | null
  /** This token belongs to the signed-in viewer — gets the self-highlight ring. */
  owned: boolean
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
  const { name, description, tokens, exits } = data

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

          {tokens.length > 0 ? (
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
