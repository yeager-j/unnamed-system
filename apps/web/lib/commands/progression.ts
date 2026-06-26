import {
  canLevelUp,
  MAX_LEVEL,
  SPARK_LOG_CAPACITY,
  VICTORIES_PER_LEVEL,
} from "@workspace/game/engine"
import { VIRTUE_KEYS } from "@workspace/game/foundation"

import { setActiveArchetypeAction } from "@/lib/actions/active-archetype"
import { addSparkAction } from "@/lib/actions/character-spark"
import { awardVictoriesAction } from "@/lib/actions/leveling"
import { archetypeSwitcherGroups } from "@/lib/game-engine"
import { LINEAGE_LABELS, TIER_LABELS, VIRTUE_LABELS } from "@/lib/ui/labels"

import type { Command, CommandContext, SubmenuItem } from "./types"

/**
 * The second batch of owner-mode palette commands (UNN-281), group "Progress"
 * (plus the three Rest variants under "Vitals"). None opens a new write path:
 * Award Victory / Spark / Switch Archetype dispatch the *existing* Server
 * Actions through {@link CommandContext.write}, and Rest / Level-up open the
 * *existing* dialogs via {@link CommandContext.surfaces}.
 *
 * Multi-choice actions (Spark's Virtue, Victory's amount, the Archetype to
 * switch to) are palette **submenus** — selecting the parent swaps the list to
 * its child items, which the palette input then filters (the cmdk "pages"
 * idiom). Submenu parents carry broad keywords so a child term ("heroic",
 * "wisdom") still surfaces the parent at the root.
 *
 * A generator (not constants) so every disabled state and submenu list
 * re-derives from the live character on each open.
 */
export function progressionCommands(ctx: CommandContext): Command[] {
  return [
    ...restCommands,
    levelUpCommand(ctx),
    awardVictoryCommand,
    sparkCommand(ctx),
    switchArchetypeCommand(ctx),
  ]
}

/** Full / Partial / Respite, each opening the Rest dialog preselected. */
const restCommands: Command[] = (
  [
    { mode: "full", label: "Full Rest" },
    { mode: "partial", label: "Partial Rest" },
    { mode: "respite", label: "Respite" },
  ] as const
).map(({ mode, label }) => ({
  id: `rest.${mode}`,
  label,
  group: "Vitals",
  requiresOwner: true,
  keywords: ["rest", "recover", "heal", "hp", "sp", "dice"],
  run: (ctx) => ctx.surfaces.openRest(mode),
}))

function levelUpCommand(ctx: CommandContext): Command {
  const { victories } = ctx.character
  const shortfall = VICTORIES_PER_LEVEL - victories
  const disabled = !canLevelUp(ctx.character)
    ? ctx.character.level >= MAX_LEVEL
      ? { reason: "At max level" }
      : {
          reason: `Need ${shortfall} more ${
            shortfall === 1 ? "Victory" : "Victories"
          }`,
        }
    : undefined

  return {
    id: "progress.level-up",
    label: "Level up",
    description: `${victories}/${VICTORIES_PER_LEVEL} Victories`,
    group: "Progress",
    requiresOwner: true,
    keywords: ["level", "advance", "rank"],
    disabled,
    run: (ctx) => ctx.surfaces.openLevelUp(),
  }
}

const awardVictoryCommand: Command = {
  id: "progress.award-victory",
  label: "Award Victory",
  group: "Progress",
  requiresOwner: true,
  keywords: ["victory", "heroic", "award", "win", "undo"],
  submenu: {
    placeholder: "Award Victories…",
    sections: (ctx) => [
      {
        items: [
          awardVictoryItem(ctx, "standard", "Standard Victory", "+1", 1),
          awardVictoryItem(ctx, "heroic", "Heroic Victory", "+2", 2),
          {
            id: "award-victory.undo",
            label: "Undo last Victory",
            description: "−1",
            disabled:
              ctx.character.victories === 0
                ? { reason: "No Victories to undo" }
                : undefined,
            run: (ctx) => writeVictories(ctx, -1),
          },
        ],
      },
    ],
  },
}

function awardVictoryItem(
  _ctx: CommandContext,
  key: string,
  label: string,
  description: string,
  amount: 1 | 2
): SubmenuItem {
  return {
    id: `award-victory.${key}`,
    label,
    description,
    run: (ctx) => writeVictories(ctx, amount),
  }
}

function writeVictories(ctx: CommandContext, amount: 1 | 2 | -1): void {
  ctx.write.write({
    edit: { kind: "victories", delta: amount },
    surface: "victories",
    action: (expectedVersion) =>
      awardVictoriesAction({
        characterId: ctx.character.id,
        amount,
        expectedVersion,
      }),
  })
}

function sparkCommand(ctx: CommandContext): Command {
  const logFull = ctx.character.sparkLog.length >= SPARK_LOG_CAPACITY
  return {
    id: "progress.spark",
    label: "+1 Spark",
    description: `${ctx.character.sparkLog.length}/${SPARK_LOG_CAPACITY} Sparks`,
    group: "Progress",
    requiresOwner: true,
    keywords: [
      "spark",
      "virtue",
      ...VIRTUE_KEYS.map((key) => VIRTUE_LABELS[key]),
    ],
    disabled: logFull
      ? { reason: "Spark log full — rank up a Virtue" }
      : undefined,
    submenu: {
      placeholder: "Tag the Spark with a Virtue…",
      sections: () => [
        {
          items: VIRTUE_KEYS.map((virtue) => ({
            id: `spark.${virtue}`,
            label: VIRTUE_LABELS[virtue],
            run: (ctx: CommandContext) =>
              ctx.write.write({
                edit: { kind: "addSpark", virtue },
                surface: "spark",
                action: (expectedVersion) =>
                  addSparkAction({
                    characterId: ctx.character.id,
                    virtue,
                    expectedVersion,
                  }),
                messages: {
                  stale:
                    "Someone else updated this character — refresh to see the latest.",
                  error: "Couldn't add Spark. Try again.",
                },
              }),
          })),
        },
      ],
    },
  }
}

function switchArchetypeCommand(ctx: CommandContext): Command {
  const groups = archetypeSwitcherGroups(ctx.character)
  const optionCount = groups.reduce(
    (total, group) => total + group.options.length,
    0
  )

  return {
    id: "progress.switch-archetype",
    label: "Switch Active Archetype",
    group: "Progress",
    requiresOwner: true,
    keywords: ["archetype", "switch", "active", "lineage"],
    disabled:
      optionCount < 2 ? { reason: "Only one Archetype unlocked" } : undefined,
    submenu: {
      placeholder: "Switch to an Archetype…",
      emptyLabel: "No Archetype found.",
      sections: (ctx) =>
        archetypeSwitcherGroups(ctx.character).map((group) => ({
          heading: LINEAGE_LABELS[group.lineage],
          items: group.options.map((option) => {
            const isActive = option.id === ctx.character.activeArchetypeId
            return {
              id: `switch-archetype.${option.id}`,
              label: option.name,
              description: `${TIER_LABELS[option.tier]} · Rank ${option.rank}/5${
                isActive ? " · Active" : ""
              }`,
              disabled: isActive ? { reason: "Active" } : undefined,
              run: (ctx: CommandContext) =>
                ctx.write.write({
                  edit: {
                    kind: "switchActiveArchetype",
                    characterArchetypeId: option.id,
                  },
                  surface: "activeArchetype",
                  action: (expectedVersion) =>
                    setActiveArchetypeAction({
                      characterId: ctx.character.id,
                      characterArchetypeId: option.id,
                      expectedVersion,
                    }),
                  messages: {
                    stale: "Couldn't sync — refresh to see the latest.",
                    error: "Couldn't switch Archetype. Try again.",
                  },
                }),
            }
          }),
        })),
    },
  }
}
