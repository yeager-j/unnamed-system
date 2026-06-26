import type { useRouter } from "next/navigation"
import { describe, expect, it, vi } from "vitest"

import type { useCharacterWrite } from "@/hooks/use-character"
import type { ViewerRole } from "@/lib/auth/viewer-role"
import type { CharacterRow } from "@/lib/db/schema/character"
import { deriveHydratedCharacter } from "@/lib/game-engine"

import { resolveCommands } from "./registry"
import type { CommandContext } from "./types"

// The registry imports the "use server" actions as callbacks; stub the modules
// so this pure test doesn't pull the Server Action / next-auth chain into the
// node environment. resolveCommands never invokes them.
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

/** A minimal-but-valid finalized Warrior; `prismaCharges` is the only knob the
 *  registry's disabled logic reads, so it's parameterized. */
function makeCharacter(prismaCharges: number) {
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
    level: 1,
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
    sparkLog: [],
    victories: 0,
    currency: 100,
    prismaCharges,
    prismaMaxCharges: 2,
    exhaustion: 0,
    ailments: [],
    battleConditions: null,
    partyComposition: null,
    activeArchetypeId: "arch-1",
    originCharacterArchetypeId: "arch-1",
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
    archetypeRows: [
      {
        id: "arch-1",
        characterId: CHARACTER_ID,
        archetypeKey: "warrior",
        rank: 1,
        inheritanceSlots: [],
        mechanicState: null,
      },
    ],
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

const stubWrite: ReturnType<typeof useCharacterWrite> = {
  write: noop,
  pending: false,
  characterId: CHARACTER_ID,
}

function makeContext(role: ViewerRole, prismaCharges = 2): CommandContext {
  return {
    character: makeCharacter(prismaCharges),
    role,
    setActiveTab: noop,
    surfaces: { openRest: noop, openLevelUp: noop },
    router: stubRouter,
    write: stubWrite,
  }
}

describe("resolveCommands", () => {
  it("gives the owner both navigation and vitals commands", () => {
    const ids = resolveCommands(makeContext("owner")).map((c) => c.id)

    expect(ids).toContain("nav.combat")
    expect(ids).toContain("nav.atlas")
    expect(ids).toContain("vitals.damage")
    expect(ids).toContain("vitals.use-prisma")
  })

  it.each<ViewerRole>(["signed-in-other", "signed-out"])(
    "omits owner-only vitals commands for a %s viewer, keeping navigation",
    (role) => {
      const commands = resolveCommands(makeContext(role))
      const ids = commands.map((c) => c.id)

      expect(ids).toContain("nav.combat")
      expect(ids).toContain("nav.my-characters")
      expect(commands.some((c) => c.group === "Vitals")).toBe(false)
      expect(commands.some((c) => c.requiresOwner)).toBe(false)
    }
  )

  it("disables Use Prisma at 0 charges and enables it otherwise", () => {
    const atZero = resolveCommands(makeContext("owner", 0)).find(
      (c) => c.id === "vitals.use-prisma"
    )
    const withCharges = resolveCommands(makeContext("owner", 2)).find(
      (c) => c.id === "vitals.use-prisma"
    )

    expect(atZero?.disabled).toEqual({ reason: "No Prisma charges" })
    expect(withCharges?.disabled).toBeUndefined()
  })
})
