import type { useRouter } from "next/navigation"
import { describe, expect, it, vi } from "vitest"

import type {
  CharacterArchetypeRow,
  VirtueKey,
} from "@workspace/game/foundation"

import type { useCharacterWrite } from "@/hooks/use-character"
import type { ViewerRole } from "@/lib/auth/viewer-role"
import type { CharacterRow } from "@/lib/db/schema/character"
import { deriveHydratedCharacter } from "@/lib/game-engine"

import { progressionCommands } from "./progression"
import { resolveCommands } from "./registry"
import type { Command, CommandContext } from "./types"

// The registry + progression module import the "use server" actions as
// callbacks; stub them so this pure test never pulls the next-auth chain into
// node. The commands' run handlers are exercised through the write spy, which
// never invokes the (mocked) action callback.
vi.mock("@/lib/actions/adjust-pools", () => ({
  damageAction: vi.fn(),
  healAction: vi.fn(),
  spendSPAction: vi.fn(),
  recoverSPAction: vi.fn(),
  consumePrismaAction: vi.fn(),
}))
vi.mock("@/lib/actions/leveling", () => ({ awardVictoriesAction: vi.fn() }))
vi.mock("@/lib/actions/character-spark", () => ({ addSparkAction: vi.fn() }))
vi.mock("@/lib/actions/active-archetype", () => ({
  setActiveArchetypeAction: vi.fn(),
}))

const CHARACTER_ID = "char-1"

const WARRIOR_ROW: CharacterArchetypeRow = {
  id: "arch-warrior",
  characterId: CHARACTER_ID,
  archetypeKey: "warrior",
  rank: 1,
  inheritanceSlots: [],
  mechanicState: null,
}

const MAGE_ROW: CharacterArchetypeRow = {
  id: "arch-mage",
  characterId: CHARACTER_ID,
  archetypeKey: "mage",
  rank: 1,
  inheritanceSlots: [],
  mechanicState: null,
}

interface CharacterOverrides {
  victories?: number
  level?: number
  sparkLog?: VirtueKey[]
  archetypeRows?: CharacterArchetypeRow[]
}

function makeCharacter({
  victories = 0,
  level = 1,
  sparkLog = [],
  archetypeRows = [WARRIOR_ROW],
}: CharacterOverrides = {}) {
  const row: CharacterRow = {
    id: CHARACTER_ID,
    shortId: "char-1-short",
    ownerId: "user-1",
    campaignId: null,
    status: "finalized",
    builderStep: 0,
    name: "Test Character",
    pronouns: "they/them",
    portraitUrl: null,
    level,
    pathChoice: "balanced",
    currentHP: 20,
    currentSP: 20,
    hitDiceRemaining: 0,
    skillDiceRemaining: 0,
    manualBonuses: {},
    virtueExpression: 0,
    virtueEmpathy: 0,
    virtueWisdom: 0,
    virtueFocus: 0,
    sparkLog,
    victories,
    currency: 100,
    prismaCharges: 2,
    prismaMaxCharges: 2,
    exhaustion: 0,
    ailments: [],
    battleConditions: null,
    partyComposition: null,
    activeArchetypeId: "arch-warrior",
    originCharacterArchetypeId: "arch-warrior",
    savedArchetypeRanks: 0,
    ancestryText: null,
    backgroundText: null,
    backstoryText: null,
    personalityTraits: null,
    hopes: null,
    dreams: null,
    fears: null,
    secrets: null,
    gainedTalents: [],
    notes: null,
    identityVersion: 0,
    vitalsVersion: 0,
    inventoryVersion: 0,
    progressionVersion: 0,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  }

  return deriveHydratedCharacter({
    row,
    archetypeRows,
    inventoryRows: [],
    knives: [],
    chains: [],
  })
}

const noop = () => {}

const stubRouter: ReturnType<typeof useRouter> = {
  push: noop,
  replace: noop,
  back: noop,
  forward: noop,
  refresh: noop,
  prefetch: noop,
}

function makeContext(
  overrides: CharacterOverrides & {
    role?: ViewerRole
    write?: ReturnType<typeof useCharacterWrite>["write"]
    openRest?: (mode: "full" | "partial" | "respite") => void
    openLevelUp?: () => void
  } = {}
): CommandContext {
  const {
    role = "owner",
    write = vi.fn(),
    openRest,
    openLevelUp,
    ...rest
  } = overrides
  return {
    character: makeCharacter(rest),
    role,
    setActiveTab: noop,
    surfaces: { openRest: openRest ?? noop, openLevelUp: openLevelUp ?? noop },
    router: stubRouter,
    write: { write, pending: false, characterId: CHARACTER_ID },
  }
}

function find(ctx: CommandContext, id: string): Command | undefined {
  return progressionCommands(ctx).find((command) => command.id === id)
}

describe("progressionCommands — gating", () => {
  it("exposes the UNN-281 commands to the owner", () => {
    const ids = resolveCommands(makeContext()).map((c) => c.id)

    expect(ids).toEqual(
      expect.arrayContaining([
        "rest.full",
        "rest.partial",
        "rest.respite",
        "progress.level-up",
        "progress.award-victory",
        "progress.spark",
        "progress.switch-archetype",
      ])
    )
  })

  it.each<ViewerRole>(["signed-in-other", "signed-out"])(
    "hides every UNN-281 command from a %s viewer",
    (role) => {
      const ids = resolveCommands(makeContext({ role })).map((c) => c.id)

      expect(ids.some((id) => id.startsWith("progress."))).toBe(false)
      expect(ids.some((id) => id.startsWith("rest."))).toBe(false)
    }
  )
})

describe("progressionCommands — Level up", () => {
  it("disables Level up below the Victory threshold, with a reason", () => {
    const command = find(makeContext({ victories: 5 }), "progress.level-up")
    expect(command?.disabled).toEqual({ reason: "Need 2 more Victories" })
  })

  it("enables Level up at the threshold", () => {
    const command = find(makeContext({ victories: 7 }), "progress.level-up")
    expect(command?.disabled).toBeUndefined()
  })

  it("opens the Level-up dialog via the surfaces context", () => {
    const openLevelUp = vi.fn()
    const ctx = makeContext({ victories: 7, openLevelUp })
    find(ctx, "progress.level-up")?.run?.(ctx)
    expect(openLevelUp).toHaveBeenCalledOnce()
  })
})

describe("progressionCommands — Rest", () => {
  it("opens the Rest dialog preselected to the variant's mode", () => {
    const openRest = vi.fn()
    const ctx = makeContext({ openRest })
    find(ctx, "rest.respite")?.run?.(ctx)
    expect(openRest).toHaveBeenCalledWith("respite")
  })
})

describe("progressionCommands — Award Victory submenu", () => {
  it("offers Standard / Heroic / Undo, disabling Undo at 0 Victories", () => {
    const ctx = makeContext({ victories: 0 })
    const items = find(ctx, "progress.award-victory")?.submenu?.sections(
      ctx
    )?.[0]?.items

    expect(items?.map((item) => item.id)).toEqual([
      "award-victory.standard",
      "award-victory.heroic",
      "award-victory.undo",
    ])
    expect(items?.find((i) => i.id === "award-victory.undo")?.disabled).toEqual(
      {
        reason: "No Victories to undo",
      }
    )
  })

  it("dispatches a +1 victories edit when Standard is selected", () => {
    const write = vi.fn()
    const ctx = makeContext({ write })
    const standard = find(ctx, "progress.award-victory")
      ?.submenu?.sections(ctx)?.[0]
      ?.items.find((item) => item.id === "award-victory.standard")

    standard?.run(ctx)

    expect(write).toHaveBeenCalledWith(
      expect.objectContaining({
        edit: { kind: "victories", delta: 1 },
        surface: "victories",
      })
    )
  })
})

describe("progressionCommands — Spark submenu", () => {
  it("disables +1 Spark when the log is full", () => {
    const fullLog = Array.from({ length: 7 }, () => "focus" as VirtueKey)
    const command = find(makeContext({ sparkLog: fullLog }), "progress.spark")
    expect(command?.disabled).toEqual({
      reason: "Spark log full — rank up a Virtue",
    })
  })

  it("dispatches an addSpark edit for the chosen Virtue", () => {
    const write = vi.fn()
    const ctx = makeContext({ write })
    const empathy = find(ctx, "progress.spark")
      ?.submenu?.sections(ctx)?.[0]
      ?.items.find((item) => item.id === "spark.empathy")

    empathy?.run(ctx)

    expect(write).toHaveBeenCalledWith(
      expect.objectContaining({
        edit: { kind: "addSpark", virtue: "empathy" },
        surface: "spark",
      })
    )
  })
})

describe("progressionCommands — Switch Active Archetype submenu", () => {
  it("disables the switch with one unlocked Archetype", () => {
    const command = find(makeContext(), "progress.switch-archetype")
    expect(command?.disabled).toEqual({ reason: "Only one Archetype unlocked" })
  })

  it("enables the switch and groups options by Lineage with 2+ Archetypes", () => {
    const ctx = makeContext({ archetypeRows: [WARRIOR_ROW, MAGE_ROW] })
    const command = find(ctx, "progress.switch-archetype")

    expect(command?.disabled).toBeUndefined()
    const sections = command?.submenu?.sections(ctx) ?? []
    expect(sections).toHaveLength(2)
    const allItems = sections.flatMap((section) => section.items)
    expect(allItems).toHaveLength(2)
    // The active Archetype is marked non-selectable.
    expect(
      allItems.find((item) => item.id === "switch-archetype.arch-warrior")
        ?.disabled
    ).toEqual({ reason: "Active" })
  })

  it("dispatches a switch edit for the selected Archetype", () => {
    const write = vi.fn()
    const ctx = makeContext({
      write,
      archetypeRows: [WARRIOR_ROW, MAGE_ROW],
    })
    const mage = find(ctx, "progress.switch-archetype")
      ?.submenu?.sections(ctx)
      .flatMap((section) => section.items)
      .find((item) => item.id === "switch-archetype.arch-mage")

    mage?.run(ctx)

    expect(write).toHaveBeenCalledWith(
      expect.objectContaining({
        edit: {
          kind: "switchActiveArchetype",
          characterArchetypeId: "arch-mage",
        },
        surface: "activeArchetype",
      })
    )
  })
})
