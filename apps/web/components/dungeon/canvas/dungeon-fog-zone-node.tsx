"use client"

import { ArrowSquareOutIcon, LockIcon } from "@phosphor-icons/react/dist/ssr"
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

import { EnchantmentBadge } from "@/components/combat/enchantment-badge"
import { VitalBar } from "@/components/combat/vital-bar"

import { DungeonTokenChip } from "./dungeon-token-chip"
import { EngagedCluster } from "./engaged-cluster"
import { FloatingEdgeHandles } from "./floating-edge-handles"
import { TokenGlyph } from "./token-glyph"

export type FogZoneToken = {
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
export type FogZoneEnemy = {
  id: string
  name: string
  hp: Pool
  /** Melee-lock (UNN-467) — drives the engaged-cluster outline. */
  engagement?: Engagement
}

/** A zone occupant the fog view can group by engagement: the party token or enemy
 *  token, keyed by the combatant id its lock references (a PC's *is* its
 *  `characterId`), so {@link groupTokensByEngagement} clusters across sides. */
type FogCombatant =
  | { id: string; engagement?: Engagement; kind: "party"; token: FogZoneToken }
  | { id: string; engagement?: Engagement; kind: "enemy"; enemy: FogZoneEnemy }
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
  /** The Zone's active Bard Enchantment badge, when one sits here (UNN-489). */
  enchantment?: ZoneEnchantmentBadge
}
export type DungeonFogZoneNode = Node<FogZoneData, "fogZone">

/**
 * A revealed Zone on the **player fog view** (UNN-466) — the read-only,
 * fully-redacted counterpart of the DM run console's
 * {@link import("./dungeon-zone-node").DungeonZoneNode}. It carries no reveal/move
 * toolbar (players don't act on the map); it shows what the redacted snapshot
 * permits: the Zone name, its player-facing description, the party tokens standing
 * in it (the viewer's own self-highlighted), its active Enchantment badge, and a
 * footer of **known-exit silhouettes** — one chip per exit leading somewhere
 * undiscovered, encoding only *that* an exit exists and whether it's locked (no
 * far-Zone name/contents). The hidden handles only need to *exist* so React Flow
 * attaches the revealed-connection floating edges; the floating router decides
 * where they meet the border.
 */
export function DungeonFogZoneNode({ data }: NodeProps<DungeonFogZoneNode>) {
  const { name, description, tokens, enemies, exits, enchantment } = data

  // Party + enemy tokens as one list so engaged combatants cluster across sides
  // (a PC locked with an enemy). Party first, then enemies — the prior order.
  const combatants: FogCombatant[] = [
    ...tokens.map(
      (token): FogCombatant => ({
        id: token.characterId,
        engagement: token.engagement,
        kind: "party",
        token,
      })
    ),
    ...enemies.map(
      (enemy): FogCombatant => ({
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
                          <FogCombatantChip combatant={c} />
                        </div>
                      ))}
                    </EngagedCluster>
                  </li>
                ) : (
                  <li key={group[0]!.id}>
                    <FogCombatantChip combatant={group[0]!} />
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

function combatantName(combatant: FogCombatant): string {
  return combatant.kind === "party"
    ? combatant.token.name
    : combatant.enemy.name
}

/** Renders a fog combatant by side: a party token's {@link DungeonTokenChip}
 *  (self-highlighted when owned, with HP/SP bars) or an enemy's redacted
 *  {@link FogEnemyChip}. */
function FogCombatantChip({ combatant }: { combatant: FogCombatant }) {
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
  return <FogEnemyChip name={combatant.enemy.name} hp={combatant.enemy.hp} />
}

/**
 * An **enemy** token on the player battlefield (UNN-467) — the redacted combat
 * peer of {@link DungeonTokenChip}. Side-tinted destructive-red (initials, never a
 * portrait) with a thin {@link VitalBar} HP bar; the snapshot carries HP only, so
 * attributes and affinities can't be shown here (the combat-watch redaction,
 * UNN-324) and there is no SP bar.
 */
function FogEnemyChip({ name, hp }: { name: string; hp: Pool }) {
  return (
    <span className="inline-flex max-w-[10rem] flex-col gap-1 border border-red-700 bg-red-100 px-1.5 py-1 dark:border-red-400 dark:bg-red-950">
      <span className="flex items-center gap-1.5">
        <TokenGlyph
          name={name}
          portraitUrl={null}
          initialsClassName="bg-red-200 text-red-900 dark:bg-red-900 dark:text-red-100"
        />
        <span className="truncate text-xs font-medium text-red-950 dark:text-red-100">
          {name}
        </span>
      </span>
      <VitalBar current={hp.current} max={hp.max} kind="hp" />
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
