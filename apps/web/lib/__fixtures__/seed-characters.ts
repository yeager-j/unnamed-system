import type {
  BattleConditions,
  ManualBonuses,
  PathChoice,
  SparkLog,
} from "../game/character"
import { buildStatComputationCharacter } from "../game/stat-character"
import type { StatComputationCharacter } from "../game/stats"

/**
 * The seed roster, as plain character specs decoupled from persistence. The
 * database seed script (`lib/db/seed.ts`) turns these into rows; the game-engine
 * integration suite feeds the same specs through {@link buildSeedStatCharacter}
 * so seed correctness and the derived-value pipeline are tested against one
 * source of truth. Nothing here imports Drizzle or touches the database.
 *
 * The roster is deliberately stable showcase data: it covers every MVP
 * Archetype, three life stages, Mastery, cross-Archetype Inheritance Slots,
 * combat state, Sparks, Victories, equipment effects, and every Identity field.
 */

interface SeedInheritanceSlot {
  slotIndex: number
  /** Resolved to the sibling `characterArchetype` row's deterministic id. */
  sourceArchetypeKey: string
  skillKey: string
}

interface SeedArchetype {
  archetypeKey: string
  rank: number
  inheritanceSlots?: SeedInheritanceSlot[]
}

interface SeedItem {
  catalogItemKey: string
  equipped: boolean
}

export interface SeedCharacter {
  /** Stable slug; drives every deterministic id and the public shortId. */
  slug: string
  shortId: string
  name: string
  pronouns: string
  level: number
  pathChoice: PathChoice
  activeArchetypeKey: string
  archetypes: SeedArchetype[]
  manualBonuses: ManualBonuses
  ancestryText: string
  backgroundText: string
  backstoryText: string
  dreams: string
  notes: string
  personalityTraits: string[]
  hopes: string[]
  fears: string[]
  secrets: string[]
  knives: { title: string; description: string }[]
  chains: { title: string; description: string }[]
  talents: string[]
  items: SeedItem[]
  victories: number
  virtues: {
    expression: number
    empathy: number
    wisdom: number
    focus: number
  }
  sparkLog: SparkLog
  exhaustion: number
  ailments: string[]
  battleConditions: BattleConditions | null
  /** Spent (below max) when the character should look mid-combat; else full. */
  damage?: {
    hp: number
    sp: number
    hitDiceSpent: number
    skillDiceSpent: number
  }
}

export const SEED_CHARACTERS: SeedCharacter[] = [
  {
    slug: "warrior",
    shortId: "seed-warrior",
    name: "Brann Holt",
    pronouns: "he/him",
    level: 1,
    pathChoice: "health-focused",
    activeArchetypeKey: "warrior",
    archetypes: [{ archetypeKey: "warrior", rank: 1 }],
    manualBonuses: {},
    ancestryText: "Hill-clan stock, raised on the northern marches.",
    backgroundText: "Caravan guard turned sellsword.",
    backstoryText:
      "Brann took up the blade to pay off his family's debt to the salt barons and never put it down.",
    dreams: "To own a quiet inn far from any battlefield.",
    notes: "Newly recruited. Still figuring out the party's pace.",
    personalityTraits: ["Blunt", "Dependable", "Slow to anger"],
    hopes: ["Earn enough to free his sister from indenture"],
    fears: ["Drowning", "Being thought a coward"],
    secrets: ["Cannot actually read the contracts he guards"],
    knives: [
      {
        title: "The Salt Barons",
        description: "They own his family's debt. He owes them nothing else.",
      },
    ],
    chains: [
      {
        title: "Mira, his sister",
        description: "Indentured to the same barons. He fights to buy her out.",
      },
    ],
    talents: ["climb", "lift", "athletics"],
    items: [{ catalogItemKey: "longsword", equipped: true }],
    victories: 0,
    virtues: { expression: 0, empathy: 1, wisdom: 0, focus: 0 },
    sparkLog: [],
    exhaustion: 0,
    ailments: [],
    battleConditions: null,
  },
  {
    slug: "healer",
    shortId: "seed-healer",
    name: "Sister Yune",
    pronouns: "she/her",
    level: 1,
    pathChoice: "skill-focused",
    activeArchetypeKey: "healer",
    archetypes: [{ archetypeKey: "healer", rank: 1 }],
    manualBonuses: {},
    ancestryText: "Temple foundling, lineage unknown.",
    backgroundText: "Cloister-trained field medic.",
    backstoryText:
      "Raised by the Lantern Order, Yune left the cloister to tend the wounded the war left behind.",
    dreams: "To found a free infirmary in the lower city.",
    notes: "Conserving SP until she learns the party's rhythm.",
    personalityTraits: ["Patient", "Quietly stubborn", "Observant"],
    hopes: ["Find the family that left her at the temple gate"],
    fears: ["Losing a patient she could have saved"],
    secrets: ["Doubts the Order's teachings more than she admits"],
    knives: [
      {
        title: "The Lantern Order",
        description: "Raised her, then asked too much of her.",
      },
    ],
    chains: [
      {
        title: "Prior Aldous",
        description: "Her mentor. She still writes to him, unsure why.",
      },
    ],
    talents: ["medicine", "nature", "monsters"],
    items: [],
    victories: 1,
    virtues: { expression: 0, empathy: 2, wisdom: 1, focus: 0 },
    sparkLog: ["empathy"],
    exhaustion: 0,
    ailments: [],
    battleConditions: null,
  },
  {
    slug: "mage",
    shortId: "seed-mage",
    name: "Calliope Vex",
    pronouns: "she/her",
    level: 13,
    pathChoice: "balanced",
    activeArchetypeKey: "mage",
    archetypes: [
      { archetypeKey: "mage", rank: 4 },
      { archetypeKey: "warrior", rank: 2 },
    ],
    manualBonuses: { magic: 1 },
    ancestryText: "Old river-city merchant blood.",
    backgroundText: "Disgraced academy adept.",
    backstoryText:
      "Expelled from the Conservatory for an unsanctioned summoning, Calliope now sells her spellwork to whoever asks no questions.",
    dreams: "To prove the Conservatory wrong and be reinstated with honors.",
    notes:
      "Mid-fight: took a Burn off a trapped door, pushed her offense, dropped her guard.",
    personalityTraits: ["Sharp-tongued", "Proud", "Relentlessly curious"],
    hopes: ["Recover the confiscated grimoire", "Outlive her rivals"],
    fears: ["Mediocrity", "Open flame"],
    secrets: [
      "The summoning that got her expelled actually succeeded",
      "She still hears it sometimes",
    ],
    knives: [
      {
        title: "The Conservatory",
        description: "Cast her out. She will make them invite her back.",
      },
      {
        title: "Magister Orlow",
        description: "Signed the expulsion. Pretends he doesn't remember her.",
      },
    ],
    chains: [
      {
        title: "Her late mentor's grimoire",
        description:
          "Confiscated as evidence. She wants it back more than vindication.",
      },
    ],
    talents: ["arcana", "alchemy", "enchant", "lift"],
    items: [{ catalogItemKey: "runed-cane", equipped: true }],
    victories: 3,
    virtues: { expression: 2, empathy: 1, wisdom: 5, focus: 3 },
    sparkLog: ["wisdom", "focus", "wisdom", "expression"],
    exhaustion: 2,
    ailments: ["burn"],
    battleConditions: {
      attack: { state: "increased", stacks: 1 },
      defense: { state: "decreased", stacks: 1 },
      hitEvasion: { state: "neutral", stacks: 0 },
      charged: false,
      concentrating: true,
    },
    damage: { hp: 22, sp: 35, hitDiceSpent: 4, skillDiceSpent: 9 },
  },
  {
    slug: "knight",
    shortId: "seed-knight",
    name: "Dame Ortensia",
    pronouns: "she/her",
    level: 27,
    pathChoice: "balanced",
    activeArchetypeKey: "knight",
    archetypes: [
      {
        archetypeKey: "knight",
        rank: 5,
        inheritanceSlots: [
          { slotIndex: 0, sourceArchetypeKey: "mage", skillKey: "agi" },
          { slotIndex: 1, sourceArchetypeKey: "warrior", skillKey: "cleave" },
        ],
      },
      { archetypeKey: "warrior", rank: 4 },
      { archetypeKey: "mage", rank: 3 },
    ],
    manualBonuses: { luck: 1 },
    ancestryText: "Cadet branch of a fallen marcher house.",
    backgroundText: "Oathbound knight-errant, last of her order.",
    backstoryText:
      "Ortensia outlived her order at the Siege of Vell. She keeps its vows alone now, carrying three disciplines so no ally falls the way her brothers did.",
    dreams:
      "To see the Order's banner raised honestly again, by someone worthy.",
    notes:
      "Banked 8 Victories — ready to level. Mastered Knight; dabbles in Warrior and Mage.",
    personalityTraits: [
      "Unbending on her word",
      "Gentle with the frightened",
      "Haunted",
    ],
    hopes: [
      "Find one squire worth the Order's oath",
      "Forgive herself for Vell",
    ],
    fears: ["Dying with the Order's debts unpaid", "Becoming what she fights"],
    secrets: [
      "She gave the retreat order at Vell",
      "The relic she guards is a forgery; the real one she lost",
    ],
    knives: [
      {
        title: "The House of Vell",
        description:
          "Let her order die to save its walls. She has not forgiven it.",
      },
      {
        title: "Her own retreat order",
        description: "The word that saved her and damned the rest.",
      },
    ],
    chains: [
      {
        title: "The Order's broken banner",
        description:
          "She carries it folded. She will not fly it until it is earned.",
      },
      {
        title: "Squire Bel",
        description: "Too young, too eager. She trains him and dreads it.",
      },
    ],
    talents: ["lift", "culture", "history", "climb", "athletics", "arcana"],
    items: [
      { catalogItemKey: "bladeturn-mail", equipped: true },
      { catalogItemKey: "runed-cane", equipped: true },
      { catalogItemKey: "zephyr-band", equipped: true },
      { catalogItemKey: "longsword", equipped: false },
    ],
    victories: 8,
    virtues: { expression: 4, empathy: 6, wisdom: 7, focus: 5 },
    sparkLog: ["empathy", "wisdom", "focus", "empathy", "expression"],
    exhaustion: 0,
    ailments: [],
    battleConditions: null,
  },
  {
    slug: "fallen",
    shortId: "seed-fallen",
    name: "Halvard Crowe",
    pronouns: "he/him",
    level: 30,
    pathChoice: "health-focused",
    activeArchetypeKey: "warrior",
    archetypes: [{ archetypeKey: "warrior", rank: 5 }],
    manualBonuses: {},
    ancestryText: "Last of the shield-line of Greyfen.",
    backgroundText: "Warlord turned lone bulwark.",
    backstoryText:
      "Halvard outlived every banner he ever raised. At the Gate of Ash he stood alone so the column could pass; the column passed, and he did not rise.",
    dreams: "To be remembered for the line that held, not the line that broke.",
    notes:
      "Reduced to 0 HP holding the Gate of Ash. Hit/Skill Dice nearly spent, Prisma untouched — he never got the chance.",
    personalityTraits: ["Immovable", "Spare with words", "Last to retreat"],
    hopes: ["That the column reached the pass", "To be buried facing the gate"],
    fears: ["Outliving another banner", "Being remembered as the one who fell"],
    secrets: [
      "He gave the order that cost the first banner",
      "He chose the Gate of Ash to settle that debt",
    ],
    knives: [
      {
        title: "The Gate of Ash",
        description: "Where he chose to stop. It chose back.",
      },
    ],
    chains: [
      {
        title: "The column he covered",
        description: "Faces he never saw again. He counts them still.",
      },
    ],
    talents: ["athletics", "lift", "climb"],
    items: [{ catalogItemKey: "longsword", equipped: true }],
    victories: 0,
    virtues: { expression: 3, empathy: 4, wisdom: 6, focus: 7 },
    sparkLog: [],
    exhaustion: 3,
    ailments: [],
    battleConditions: null,
    damage: { hp: 0, sp: 0, hitDiceSpent: 25, skillDiceSpent: 50 },
  },
]

/**
 * The deterministic id of a character's `characterArchetype` row. Stable across
 * seed re-runs and used to wire Inheritance-Slot cross-references between an
 * Archetype and its sibling rows on the same character.
 */
export function archetypeId(slug: string, archetypeKey: string): string {
  return `seed-arch-${slug}-${archetypeKey}`
}

/**
 * Maps a seed spec onto the pure {@link StatComputationCharacter} the
 * derived-value engine consumes — the exact hydration the database seed and the
 * public sheet both rely on. Inheritance-Slot `sourceArchetypeKey`s are
 * resolved to sibling-row ids via {@link archetypeId} so cross-Archetype
 * inheritance is exercised end to end.
 */
export function buildSeedStatCharacter(
  character: SeedCharacter
): StatComputationCharacter {
  return buildStatComputationCharacter(
    {
      pathChoice: character.pathChoice,
      level: character.level,
      manualBonuses: character.manualBonuses,
      activeCharacterArchetypeId: archetypeId(
        character.slug,
        character.activeArchetypeKey
      ),
    },
    character.archetypes.map((archetype) => ({
      id: archetypeId(character.slug, archetype.archetypeKey),
      archetypeKey: archetype.archetypeKey,
      rank: archetype.rank,
      inheritanceSlots: (archetype.inheritanceSlots ?? []).map((slot) => ({
        slotIndex: slot.slotIndex,
        sourceCharacterArchetypeId: archetypeId(
          character.slug,
          slot.sourceArchetypeKey
        ),
        skillKey: slot.skillKey,
      })),
    })),
    character.items
      .filter((item) => item.equipped)
      .map((item) => item.catalogItemKey)
  )
}
