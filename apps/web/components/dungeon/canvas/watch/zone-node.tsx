"use client"

import { type Node, type NodeProps } from "@xyflow/react"

import {
  groupTokensByEngagement,
  type Pool,
  type ZoneEnchantmentBadge,
} from "@workspace/game/engine"
import { type Engagement } from "@workspace/game/foundation"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"

import { EngagedCluster } from "@/components/dungeon/canvas/combat/engaged-cluster"
import { DungeonTokenChip } from "@/components/dungeon/canvas/explore/token-chip"
import { FloatingEdgeHandles } from "@/components/dungeon/canvas/floating-edge-handles"
import { WatchEnemyChip } from "@/components/dungeon/canvas/watch/enemy-chip"
import { ExitChip } from "@/components/dungeon/canvas/watch/exit-chip"
import { EnchantmentBadge } from "@/components/shared/enchantment-badge"

export type WatchZoneToken = {
  characterId: string
  name: string
  portraitUrl: string | null
  /** Current/max HP + SP — the party reads each other's vitals on the map (UNN-489). */
  hp: Pool
  sp: Pool
  /** This token belongs to the signed-in viewer — gets the self-highlight ring. */
  owned: boolean
  /** Melee-lock (UNN-467) — drives the engaged-cluster outline. */
  engagement?: Engagement
}
export type WatchZoneEnemy = {
  id: string
  name: string
  hp: Pool
  /** Melee-lock (UNN-467) — drives the engaged-cluster outline. */
  engagement?: Engagement
}

/** A zone occupant the fog view can group by engagement: the party token or enemy
 *  token, keyed by the combatant id its lock references (a PC's *is* its
 *  `characterId`), so {@link groupTokensByEngagement} clusters across sides. */
type WatchCombatant =
  | {
      id: string
      engagement?: Engagement
      kind: "party"
      token: WatchZoneToken
    }
  | {
      id: string
      engagement?: Engagement
      kind: "enemy"
      enemy: WatchZoneEnemy
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
  enemies: WatchZoneEnemy[]
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
 * far-Zone name/contents). The hidden handles only need to *exist* so React Flow
 * attaches the revealed-connection floating edges; the floating router decides
 * where they meet the border.
 */
export function DungeonWatchZoneNode({
  data,
}: NodeProps<DungeonWatchZoneNode>) {
  const { name, description, tokens, enemies, exits, enchantment } = data

  // Party + enemy tokens as one list so engaged combatants cluster across sides
  // (a PC locked with an enemy). Party first, then enemies — the prior order.
  const combatants: WatchCombatant[] = [
    ...tokens.map(
      (token): WatchCombatant => ({
        id: token.characterId,
        engagement: token.engagement,
        kind: "party",
        token,
      })
    ),
    ...enemies.map(
      (enemy): WatchCombatant => ({
        id: enemy.id,
        engagement: enemy.engagement,
        kind: "enemy",
        enemy,
      })
    ),
  ]

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
                      label={`Engaged: ${group.map(combatantName).join(", ")}`}
                    >
                      {group.map((c) => (
                        <div key={c.id}>
                          <WatchCombatantChip combatant={c} />
                        </div>
                      ))}
                    </EngagedCluster>
                  </li>
                ) : (
                  <li key={group[0]!.id}>
                    <WatchCombatantChip combatant={group[0]!} />
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

function combatantName(combatant: WatchCombatant): string {
  return combatant.kind === "party"
    ? combatant.token.name
    : combatant.enemy.name
}

/** Renders a fog combatant by side: a party token's {@link DungeonTokenChip}
 *  (self-highlighted when owned, with HP/SP bars) or an enemy's redacted
 *  {@link WatchEnemyChip}. */
function WatchCombatantChip({ combatant }: { combatant: WatchCombatant }) {
  if (combatant.kind === "party") {
    return (
      <DungeonTokenChip
        name={combatant.token.name}
        portraitUrl={combatant.token.portraitUrl}
        hp={combatant.token.hp}
        sp={combatant.token.sp}
        owned={combatant.token.owned}
      />
    )
  }
  return <WatchEnemyChip name={combatant.enemy.name} hp={combatant.enemy.hp} />
}
