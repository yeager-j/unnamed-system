import {
  buildStatComputationCharacter,
  type BattleConditions,
  type ManualBonuses,
  type PartyComposition,
  type PathChoice,
  type SparkLog,
  type StatComputationCharacter,
  type TalentKey,
} from "../game/character"
import type { MechanicState } from "../game/mechanics"

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
  /** Persisted mechanic state for this Archetype's unique mechanic. Optional
   *  on the spec; null in the DB and post-Effect state when omitted. */
  mechanicState?: MechanicState
}

interface SeedItem {
  catalogItemKey: string
  equipped: boolean
  /** Stacked quantity; defaults to 1 when omitted. */
  quantity?: number
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
  /**
   * The permanent **Origin** Archetype (rulebook 1.3). Defaults to
   * {@link activeArchetypeKey} when omitted — correct for every current seed
   * and every E2E fixture, where Origin coincides with the active Archetype —
   * so only a showcase row whose Origin diverges from its active Archetype
   * needs to set this explicitly. Must name one of {@link archetypes}.
   */
  originArchetypeKey?: string
  archetypes: SeedArchetype[]
  manualBonuses: ManualBonuses
  ancestryText: string
  backgroundText: string
  backstoryText: string
  /**
   * Step-4 Identity sections (UNN-208). Each is one Markdown blob; multi-
   * entry sections use a `- ` list at the source. `null` for unwritten.
   */
  personalityTraits: string | null
  hopes: string | null
  dreams: string | null
  fears: string | null
  secrets: string | null
  notes: string
  knives: { title: string; description: string }[]
  chains: { title: string; description: string }[]
  /**
   * Background- and downtime-gained Talents only. Active-Archetype Talents
   * are added at hydration by `resolveTalents` — do not duplicate them here.
   */
  gainedTalents: TalentKey[]
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
  partyComposition: PartyComposition | null
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
    originArchetypeKey: "warrior",
    archetypes: [
      {
        archetypeKey: "warrior",
        rank: 1,
        mechanicState: { kind: "perfection", rank: 3 },
      },
    ],
    manualBonuses: {},
    ancestryText: "Hill-clan stock, raised on the northern marches.",
    backgroundText: "Caravan guard turned sellsword.",
    backstoryText:
      "Brann took up the blade to pay off his family's debt to the salt barons and never put it down.",
    personalityTraits: "- Blunt\n- Dependable\n- Slow to anger",
    hopes: "- Earn enough to free his sister from indenture",
    dreams: "To own a quiet inn far from any battlefield.",
    fears: "- Drowning\n- Being thought a coward",
    secrets: "- Cannot actually read the contracts he guards",
    notes: "Newly recruited. Still figuring out the party's pace.",
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
    gainedTalents: [],
    items: [{ catalogItemKey: "longsword", equipped: true }],
    victories: 0,
    virtues: { expression: 0, empathy: 1, wisdom: 0, focus: 0 },
    sparkLog: [],
    exhaustion: 0,
    ailments: [],
    battleConditions: null,
    partyComposition: null,
  },
  {
    slug: "healer",
    shortId: "seed-healer",
    name: "Sister Yune",
    pronouns: "she/her",
    level: 1,
    pathChoice: "skill-focused",
    activeArchetypeKey: "healer",
    originArchetypeKey: "healer",
    archetypes: [
      {
        archetypeKey: "healer",
        rank: 1,
        mechanicState: {
          kind: "path-of-dawn",
          dawnMode: true,
        },
      },
    ],
    manualBonuses: {},
    ancestryText: "Temple foundling, lineage unknown.",
    backgroundText: "Cloister-trained field medic.",
    backstoryText:
      "Raised by the Lantern Order, Yune left the cloister to tend the wounded the war left behind.",
    personalityTraits: "- Patient\n- Quietly stubborn\n- Observant",
    hopes: "- Find the family that left her at the temple gate",
    dreams: "To found a free infirmary in the lower city.",
    fears: "- Losing a patient she could have saved",
    secrets: "- Doubts the Order's teachings more than she admits",
    notes: "Conserving SP until she learns the party's rhythm.",
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
    gainedTalents: [],
    items: [],
    victories: 1,
    virtues: { expression: 0, empathy: 2, wisdom: 1, focus: 0 },
    sparkLog: ["empathy"],
    exhaustion: 0,
    ailments: [],
    battleConditions: null,
    partyComposition: null,
  },
  {
    slug: "mage",
    shortId: "seed-mage",
    name: "Calliope Vex",
    pronouns: "she/her",
    level: 13,
    pathChoice: "balanced",
    activeArchetypeKey: "mage",
    originArchetypeKey: "mage",
    archetypes: [
      {
        archetypeKey: "mage",
        rank: 5,
        mechanicState: {
          kind: "stains",
          tokens: ["fire", "ice", null, null],
        },
      },
      {
        archetypeKey: "warrior",
        rank: 2,
        mechanicState: { kind: "perfection", rank: 1 },
      },
    ],
    manualBonuses: { magic: 1 },
    ancestryText: "Old river-city merchant blood.",
    backgroundText: "Disgraced academy adept.",
    backstoryText:
      "Expelled from the Conservatory for an unsanctioned summoning, Calliope now sells her spellwork to whoever asks no questions.",
    personalityTraits: "- Sharp-tongued\n- Proud\n- Relentlessly curious",
    hopes: "- Recover the confiscated grimoire\n- Outlive her rivals",
    dreams: "To prove the Conservatory wrong and be reinstated with honors.",
    fears: "- Mediocrity\n- Open flame",
    secrets:
      "- The summoning that got her expelled actually succeeded\n- She still hears it sometimes",
    notes:
      "Mid-fight: took a Burn off a trapped door, pushed her offense, dropped her guard.",
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
    gainedTalents: ["lift"],
    items: [
      { catalogItemKey: "runed-cane", equipped: true },
      { catalogItemKey: "shadow-charm", equipped: true },
      { catalogItemKey: "warlock-pact", equipped: true },
      { catalogItemKey: "soul-drop", equipped: false, quantity: 7 },
    ],
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
    partyComposition: { mage: 2, warlock: 1 },
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
    originArchetypeKey: "knight",
    archetypes: [
      {
        archetypeKey: "knight",
        rank: 5,
        inheritanceSlots: [
          { slotIndex: 0, sourceArchetypeKey: "mage", skillKey: "agi" },
          { slotIndex: 1, sourceArchetypeKey: "warrior", skillKey: "cleave" },
        ],
        mechanicState: { kind: "valor", value: 3 },
      },
      {
        archetypeKey: "warrior",
        rank: 4,
        mechanicState: { kind: "perfection", rank: 2 },
      },
      {
        archetypeKey: "mage",
        rank: 3,
        mechanicState: {
          kind: "stains",
          tokens: ["light", null, null, null],
        },
      },
    ],
    manualBonuses: { luck: 1 },
    ancestryText: "Cadet branch of a fallen marcher house.",
    backgroundText: "Oathbound knight-errant, last of her order.",
    backstoryText:
      "Ortensia outlived her order at the Siege of Vell. She keeps its vows alone now, carrying three disciplines so no ally falls the way her brothers did.",
    personalityTraits:
      "- Unbending on her word\n- Gentle with the frightened\n- Haunted",
    hopes:
      "- Find one squire worth the Order's oath\n- Forgive herself for Vell",
    dreams:
      "To see the Order's banner raised honestly again, by someone worthy.",
    fears: "- Dying with the Order's debts unpaid\n- Becoming what she fights",
    secrets:
      "- She gave the retreat order at Vell\n- The relic she guards is a forgery; the real one she lost",
    notes:
      "Banked 8 Victories — ready to level. Mastered Knight; dabbles in Warrior and Mage.",
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
    gainedTalents: ["climb", "athletics", "arcana"],
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
    partyComposition: null,
  },
  {
    slug: "fallen",
    shortId: "seed-fallen",
    name: "Halvard Crowe",
    pronouns: "he/him",
    level: 30,
    pathChoice: "health-focused",
    activeArchetypeKey: "warrior",
    originArchetypeKey: "warrior",
    archetypes: [
      {
        archetypeKey: "warrior",
        rank: 5,
        mechanicState: { kind: "perfection", rank: 4 },
      },
    ],
    manualBonuses: {},
    ancestryText: "Last of the shield-line of Greyfen.",
    backgroundText: "Warlord turned lone bulwark.",
    backstoryText:
      "Halvard outlived every banner he ever raised. At the Gate of Ash he stood alone so the column could pass; the column passed, and he did not rise.",
    personalityTraits: "- Immovable\n- Spare with words\n- Last to retreat",
    hopes: "- That the column reached the pass\n- To be buried facing the gate",
    dreams: "To be remembered for the line that held, not the line that broke.",
    fears: "- Outliving another banner\n- Being remembered as the one who fell",
    secrets:
      "- He gave the order that cost the first banner\n- He chose the Gate of Ash to settle that debt",
    notes:
      "Reduced to 0 HP holding the Gate of Ash. Hit/Skill Dice nearly spent, Prisma untouched — he never got the chance.",
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
    gainedTalents: [],
    items: [{ catalogItemKey: "longsword", equipped: true }],
    victories: 0,
    virtues: { expression: 3, empathy: 4, wisdom: 6, focus: 7 },
    sparkLog: [],
    exhaustion: 3,
    ailments: [],
    battleConditions: null,
    partyComposition: null,
    damage: { hp: 0, sp: 0, hitDiceSpent: 25, skillDiceSpent: 50 },
  },
  {
    slug: "scribe",
    shortId: "seed-scribe",
    name: "Isolde Maren",
    pronouns: "she/her",
    level: 7,
    pathChoice: "balanced",
    activeArchetypeKey: "mage",
    originArchetypeKey: "mage",
    archetypes: [
      {
        archetypeKey: "mage",
        rank: 2,
        mechanicState: {
          kind: "stains",
          tokens: ["ice", null, null, null],
        },
      },
      {
        archetypeKey: "healer",
        rank: 1,
        mechanicState: {
          kind: "path-of-dawn",
          dawnMode: false,
        },
      },
    ],
    manualBonuses: {},
    ancestryText:
      "Born to a line of **lantern-keepers** on the *Cinderwatch coast* — a clan that lights the cliffside beacons every dusk so ships do not founder. They are quiet people, and *they read everything*.",
    backgroundText:
      "Trained as an **archivist** at the Conservatory's outer cloister, then took to the road when the cloister's catalogue stopped including books she had personally returned. She keeps **three commonplace books**:\n\n1. *Field* — observations, sketches, names.\n2. *Ledger* — debts owed and owing.\n3. *Cipher* — the things she does not write plainly.",
    backstoryText:
      'Isolde left the Conservatory the night she found a `restricted-access` ledger entry with her own name inside it. She has been **walking ever since**, copying what she can, burning what she must.\n\n> *"A book is the only honest witness. It does not flinch and it does not forget."* — marginalia in her Field book, attributed to no one.\n\nShe takes contracts from anyone who needs ~~mercenaries~~ **researchers**, and she always — *always* — leaves with a transcript.',
    personalityTraits:
      "- **Methodical** to the point of slowness — she will read the *footnotes*.\n- Quietly *funny*, in marginalia and rarely out loud.\n- Trusts **ink** more than people; trusts *people who keep receipts* most of all.",
    hopes:
      "- To find the **author** of the marginalia in her Field book.\n- To publish — *under her own name* — the Concordance the cloister suppressed.",
    dreams:
      "To assemble a *complete* **Cinderwatch Concordance** before the Conservatory rewrites it — and one day walk back into the outer cloister carrying the book they took.",
    fears:
      "- That her **Cipher** book will be read by someone who can decode it.\n- That she has already met the person who crossed out the three names.",
    secrets:
      "- She **copied** a forbidden chapter of the Concordance before leaving; it is sewn into the lining of her coat.\n- She suspects *Prior Aldous* — Sister Yune's mentor — knows what happened to volume **III**, and has not asked him yet because she is *afraid of the answer*.",
    notes:
      "Active research threads:\n\n- **Stain residue** in coastal beacon-oil — *anomalous*, possibly Conservatory provenance.\n- The ~~missing~~ misfiled Cinderwatch Concordance, vol. **III**.\n- Three names in the cloister ledger, all crossed out, none explained.\n\n| Lead | Status | Next step |\n| --- | --- | --- |\n| Beacon-oil | Sampling | Compare to vault stock |\n| Concordance III | Cold | Press Prior Aldous |\n| Crossed names | Open | Identify before they hear |\n\n> Reminder: **never** carry the cipher book and the field book in the same satchel.",
    knives: [
      {
        title: "The Conservatory",
        description:
          "They took the book. They took the **name on the spine**. They have not asked for either back.\n\n- Outer cloister: complicit by silence.\n- Inner cloister: complicit by *signature*.\n- Whoever crossed out the three names: complicit by **deed**.",
      },
      {
        title: "Whoever crossed out the three names",
        description:
          "Three entries in the ledger, three lines through them, *no explanation*.\n\n> She does not yet know if they are dead, exiled, or simply **unwritten**. She intends to find out.",
      },
    ],
    chains: [
      {
        title: "Master Vellum, her teacher",
        description:
          "The only archivist who told her *which* shelves to avoid — and **why**. She writes to him every new moon.\n\n- He taught her to **read margins first**.\n- He gave her the Cipher book.\n- He has not written back in *seventy-three days*.",
      },
      {
        title: "The unnamed copyist (marginalia)",
        description:
          "Whoever annotated her Field book before she ever owned it. *Same hand, three colors of ink, four languages.*\n\nShe is not sure she wants to meet them — only that she **must**.",
      },
    ],
    gainedTalents: ["history", "investigate", "culture", "sense"],
    items: [],
    victories: 2,
    virtues: { expression: 1, empathy: 2, wisdom: 3, focus: 2 },
    sparkLog: ["wisdom", "wisdom", "focus"],
    exhaustion: 0,
    ailments: [],
    battleConditions: null,
    partyComposition: null,
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
      mechanicState: archetype.mechanicState ?? null,
    })),
    character.items
      .filter((item) => item.equipped)
      .map((item) => item.catalogItemKey)
  )
}
