"use client"

import { SwordIcon } from "@phosphor-icons/react/dist/ssr"
import { type Node, type NodeProps } from "@xyflow/react"

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"

import { FloatingEdgeHandles } from "@/components/dungeon/canvas/floating-edge-handles"
import { TokenChip } from "@/components/dungeon/canvas/token-chip"
import { EngagedCluster } from "@/components/dungeon/canvas/watch/engaged-cluster"
import { ExitChip } from "@/components/dungeon/canvas/watch/exit-chip"
import { EnchantmentBadge } from "@/components/shared/enchantment-badge"
import { groupTokensByEngagement } from "@/lib/combat/view/engagement-groups"
import type { WatchCombatant } from "@/lib/combat/view/watch-layout"
import type { ZoneEnchantmentBadge } from "@/lib/combat/view/zone-enchantment-badge"

import type { WatchZoneExit } from "./zone-node"

/** One combatant on the watch battlefield — a redacted {@link WatchCombatant}
 *  plus whether the token belongs to the signed-in viewer (the gold self-tint). */
export interface WatchCombatToken {
  combatant: WatchCombatant
  owned: boolean
}

export type WatchCombatZoneData = {
  name: string
  description: string
  tokens: WatchCombatToken[]
  exits: WatchZoneExit[]
  /** The Zone's active Bard Enchantment badge, when one sits here. */
  enchantment?: ZoneEnchantmentBadge
}
export type DungeonWatchCombatZoneNode = Node<
  WatchCombatZoneData,
  "fogCombatZone"
>

/**
 * A revealed Zone on the player fog view **while a fight runs on the delve**
 * (UNN-604) — the same card as the exploration
 * {@link import("./zone-node").DungeonWatchZoneNode} (name, description,
 * Enchantment badge, known-exit silhouettes) with the party tokens replaced by
 * the **redacted combatants** standing here: side-tinted chips (the viewer's
 * own gold), the acting combatant ringed, and melee-locked tokens grouped in
 * dashed Engaged clusters. Read-only — no drawer, no move affordances; the
 * combat data is the C3 join the watch canvas performs (board from the dungeon
 * snapshot, pieces from the encounter snapshot).
 */
export function DungeonWatchCombatZoneNode({
  data,
}: NodeProps<DungeonWatchCombatZoneNode>) {
  const { name, description, tokens, exits, enchantment } = data

  const clusterable = tokens.map((token) => ({
    id: token.combatant.id,
    engagement: token.combatant.engagement,
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

          {clusterable.length > 0 ? (
            <ul className="flex flex-wrap gap-1.5">
              {groupTokensByEngagement(clusterable).map((group) =>
                group.length > 1 ? (
                  <li key={group.map((entry) => entry.id).join("|")}>
                    <EngagedCluster
                      label={`Engaged: ${group
                        .map((entry) => entry.token.combatant.name)
                        .join(", ")}`}
                    >
                      {group.map((entry) => (
                        <div key={entry.id}>
                          <WatchCombatTokenChip token={entry.token} />
                        </div>
                      ))}
                    </EngagedCluster>
                  </li>
                ) : (
                  <li key={group[0]!.id}>
                    <WatchCombatTokenChip token={group[0]!.token} />
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

/** A redacted combatant's chip: side tint (gold when owned), the acting ring +
 *  filled sword on the current actor, vital bars iff the pools survived
 *  redaction (a dropped key ⇒ no bar, never a `0/0` lie). */
function WatchCombatTokenChip({ token }: { token: WatchCombatToken }) {
  const { combatant, owned } = token
  return (
    <TokenChip
      side={combatant.side}
      name={combatant.name}
      portraitUrl={combatant.portraitUrl}
      hp={combatant.hp}
      sp={combatant.sp}
      owned={owned}
      acting={combatant.isCurrent}
      trailing={
        combatant.isCurrent ? (
          <SwordIcon weight="fill" className="size-3 shrink-0" aria-hidden />
        ) : null
      }
    />
  )
}
