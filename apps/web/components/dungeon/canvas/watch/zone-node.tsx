"use client"

import { type Node, type NodeProps } from "@xyflow/react"

import type { Engagement } from "@workspace/game-v2/kernel/vocab/engagement"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"

import { DungeonTokenChip } from "@/components/dungeon/canvas/explore/token-chip"
import { FloatingEdgeHandles } from "@/components/dungeon/canvas/floating-edge-handles"
import { EngagedCluster } from "@/components/dungeon/canvas/watch/engaged-cluster"
import { ExitChip } from "@/components/dungeon/canvas/watch/exit-chip"
import { EnchantmentBadge } from "@/components/shared/enchantment-badge"
import { groupTokensByEngagement } from "@/domain/combat/view/engagement-groups"
import type { Pool } from "@/domain/combat/view/pool"
import type { ZoneEnchantmentBadge } from "@/domain/combat/view/zone-enchantment-badge"

export type WatchZoneToken = {
  characterId: string
  name: string
  portraitUrl: string | null
  /** Current/max HP + SP — the party reads each other's vitals on the map (UNN-489). */
  hp: Pool
  sp: Pool
  /** This token belongs to the signed-in viewer — gets the gold self-tint. */
  owned: boolean
  /** Melee-lock (UNN-467) — drives the engaged-cluster outline. Keyed by
   *  `characterId` (a PC's combatant id *is* its `characterId`), so
   *  {@link groupTokensByEngagement} can cluster party tokens. */
  engagement?: Engagement
}
export type WatchZoneExit = {
  /** The connection id (stable React key); the far Zone is undiscovered. */
  id: string
  locked: boolean
}
export type WatchZoneData = {
  name: string
  description: string
  tokens: WatchZoneToken[]
  exits: WatchZoneExit[]
  /** The Zone's active Bard Enchantment badge, when one sits here (UNN-489). */
  enchantment?: ZoneEnchantmentBadge
}
export type DungeonWatchZoneNode = Node<WatchZoneData, "fogZone">

/**
 * A revealed Zone on the **player fog view** (UNN-466) — the read-only,
 * fully-redacted counterpart of the DM run console's
 * {@link import("@/components/dungeon/canvas/explore/zone-node").DungeonZoneNode}. It carries no reveal/move
 * toolbar (players don't act on the map); it shows what the redacted snapshot
 * permits: the Zone name, its player-facing description, the party tokens standing
 * in it (the viewer's own self-highlighted), its active Enchantment badge, and a
 * footer of **known-exit silhouettes** — one chip per exit leading somewhere
 * undiscovered, encoding only *that* an exit exists and whether it's locked (no
 * far-Zone name/contents). Enemies never appear here: during a live fight the
 * board swaps to the {@link import("./combat-zone-node").DungeonWatchCombatZoneNode},
 * whose pieces come from the fogged combat snapshot (UNN-604) — the exploration
 * snapshot's tokens are always roster PCs. The hidden handles only need to *exist*
 * so React Flow attaches the revealed-connection floating edges; the floating
 * router decides where they meet the border.
 */
export function DungeonWatchZoneNode({
  data,
}: NodeProps<DungeonWatchZoneNode>) {
  const { name, description, tokens, exits, enchantment } = data

  const combatants = tokens.map((token) => ({
    id: token.characterId,
    engagement: token.engagement,
    token,
  }))

  return (
    <>
      <FloatingEdgeHandles />

      <Card
        size="sm"
        aria-label={`Zone: ${name}`}
        className="min-h-40 w-86 shadow-sm"
      >
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-2 text-base">
            <span className="truncate">{name}</span>
            {enchantment ? (
              // React Flow sets `pointer-events: none` on this read-only
              // (non-selectable) fog node, which would swallow the badge's hover
              // and kill its tooltip — re-enable events for the badge alone.
              <span className="pointer-events-auto">
                <EnchantmentBadge enchantment={enchantment} />
              </span>
            ) : null}
          </CardTitle>
        </CardHeader>

        <CardContent className="flex flex-col gap-3">
          {description ? (
            <p className="text-sm text-muted-foreground">{description}</p>
          ) : null}

          {combatants.length > 0 ? (
            <ul className="flex flex-wrap gap-1.5">
              {groupTokensByEngagement(combatants).map((group) =>
                group.length > 1 ? (
                  <li key={group.map((c) => c.id).join("|")}>
                    <EngagedCluster
                      label={`Engaged: ${group.map((c) => c.token.name).join(", ")}`}
                    >
                      {group.map((c) => (
                        <div key={c.id}>
                          <WatchTokenChip token={c.token} />
                        </div>
                      ))}
                    </EngagedCluster>
                  </li>
                ) : (
                  <li key={group[0]!.id}>
                    <WatchTokenChip token={group[0]!.token} />
                  </li>
                )
              )}
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

/** A party token's {@link DungeonTokenChip}, self-highlighted when owned. */
function WatchTokenChip({ token }: { token: WatchZoneToken }) {
  return (
    <DungeonTokenChip
      name={token.name}
      portraitUrl={token.portraitUrl}
      hp={token.hp}
      sp={token.sp}
      owned={token.owned}
    />
  )
}
