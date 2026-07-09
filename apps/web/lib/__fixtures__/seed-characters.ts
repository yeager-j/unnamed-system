import type { PartyComposition } from "@workspace/game-v2/combat"
import type { BattleConditions } from "@workspace/game-v2/encounter"
import type { Entity } from "@workspace/game-v2/kernel"
import type { PathChoice } from "@workspace/game-v2/kernel/vocab"
import type {
  Mechanics,
  MechanicState,
} from "@workspace/game-v2/mechanics/mechanics.schema"
import type { ManualBonuses } from "@workspace/game-v2/progression"
import type { TalentKey } from "@workspace/game-v2/talents"
import type { SparkLog } from "@workspace/game-v2/virtues"

/**
 * The seed roster, as plain character specs decoupled from persistence. The
 * database seed (`lib/db/seed-entity.ts`) and the derivation golden master both
 * project these specs into a v2 `entity` through {@link seedCharacterToEntity},
 * so seed rows and pinned fixtures derive from one source of truth. Nothing here
 * imports Drizzle or touches the database.
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
  /**
   * Unspent Saved Archetype Ranks (PRD §7.1). Defaults to 0 — only a fixture
   * that exercises the Lineage Atlas's spend flow (UNN-239) needs a positive
   * value. Always written to the row so a re-seed resets it deterministically.
   */
  savedArchetypeRanks?: number
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

/**
 * Builds a complete {@link SeedCharacter} from a partial override, filling
 * every unspecified field with a sensible default so a fixture declares only
 * what makes it distinct. `slug` and `shortId` are required — they have no safe
 * default (a silent collision would corrupt the seed); everything else is
 * optional.
 *
 * Defaults: name `"Seed Character"`, pronouns `"they/them"`, level 1, balanced
 * path, a single Rank 1 Warrior Archetype with its Perfection counter at D
 * (rank 0), no manual bonuses, blank identity/notes text, all five Step-4
 * Identity sections unwritten (`null`), empty knives/chains/talents/items/
 * sparkLog/ailments, zero virtues/victories/exhaustion, and null battle
 * conditions / party composition. The optional `originArchetypeKey`,
 * `savedArchetypeRanks`, and `damage` fields stay omitted unless overridden.
 *
 * The defaults are rebuilt on every call, so fixtures never share a mutable
 * array or object. `SeedCharacter` is flat, so the shallow merge is correct:
 * a fixture that overrides `archetypes`, `virtues`, or `items` supplies the
 * complete value for that field.
 */
export function makeSeedCharacter(
  overrides: Partial<SeedCharacter> & Pick<SeedCharacter, "slug" | "shortId">
): SeedCharacter {
  const defaults: Omit<SeedCharacter, "slug" | "shortId"> = {
    name: "Seed Character",
    pronouns: "they/them",
    level: 1,
    pathChoice: "balanced",
    activeArchetypeKey: "warrior",
    archetypes: [
      {
        archetypeKey: "warrior",
        rank: 1,
        mechanicState: { kind: "perfection", rank: 0 },
      },
    ],
    manualBonuses: {},
    ancestryText: "",
    backgroundText: "",
    backstoryText: "",
    personalityTraits: null,
    hopes: null,
    dreams: null,
    fears: null,
    secrets: null,
    notes: "",
    knives: [],
    chains: [],
    gainedTalents: [],
    items: [],
    victories: 0,
    virtues: { expression: 0, empathy: 0, wisdom: 0, focus: 0 },
    sparkLog: [],
    exhaustion: 0,
    ailments: [],
    battleConditions: null,
    partyComposition: null,
  }

  return { ...defaults, ...overrides }
}

/** The deterministic id a seed character's `entity` row carries (the S0
 *  shared-id convention — an encounter's durable locator resolves it). */
export function seedEntityId(slug: string): string {
  return `seed-char-${slug}`
}

/** A seed inventory row's deterministic id — stable across re-seeds so the
 *  equipment component (and any pinned snapshot of it) doesn't churn. */
function seedItemId(slug: string, index: number): string {
  return `seed-item-${slug}-${index}`
}

/**
 * Projects a persistence-free {@link SeedCharacter} spec onto a v2 component
 * {@link Entity} — the native successor of the retired v1→v2 projection shim
 * (UNN-562). The database seed (`lib/db/seed-entity.ts`) and the real-catalog
 * derivation guard both build their entity through this one projection, so seed
 * rows and the derivation test derive from a single source of truth.
 *
 * The mapping is direct because `SeedCharacter` already keys its Archetype
 * roster and Inheritance Slots by **Archetype key** (no surrogate-id
 * translation, unlike the old shim). A PC's stat capabilities carry a
 * zeros/neutral/0 `base` (D37) — the real values come from the Archetypes +
 * Level/Path layers. Depletion rides the fixture's optional `damage` (v2 stores
 * signed depletion, not the absolute pools v1 stored).
 */
export function seedCharacterToEntity(character: SeedCharacter): Entity {
  const damage = character.damage
  return {
    id: seedEntityId(character.slug),
    components: {
      identity: { name: character.name },
      presentation: { portraitUrl: undefined },
      level: { value: character.level, victories: character.victories },
      path: { choice: character.pathChoice },
      archetypes: {
        active: character.activeArchetypeKey,
        origin: character.originArchetypeKey ?? character.activeArchetypeKey,
        savedArchetypeRanks: character.savedArchetypeRanks ?? 0,
        roster: character.archetypes.map((archetype) => ({
          key: archetype.archetypeKey,
          rank: archetype.rank,
          inheritanceSlots: (archetype.inheritanceSlots ?? []).map((slot) => ({
            slotIndex: slot.slotIndex,
            sourceArchetypeKey: slot.sourceArchetypeKey,
            skillKey: slot.skillKey,
          })),
        })),
      },
      manualBonuses: character.manualBonuses,
      // v1 persisted one nullable mechanicState per Archetype row; v2 keys the
      // Mechanics component by mechanic kind (D36 — the state's own discriminant,
      // 1:1 with its Archetype, so folding can't collide).
      mechanics: {
        states: Object.fromEntries(
          character.archetypes
            .flatMap((archetype) =>
              archetype.mechanicState ? [archetype.mechanicState] : []
            )
            .map((state) => [state.kind, state])
        ) as Mechanics["states"],
      },
      equipment: {
        items: character.items.map((item, index) => ({
          id: seedItemId(character.slug, index),
          catalogItemKey: item.catalogItemKey,
          equipped: item.equipped,
          quantity: item.quantity ?? 1,
        })),
        currency: 0,
      },
      talents: character.gainedTalents.map((key) => ({ key })),
      // Stat capabilities have a zeros/neutral/0 base (D37); the layers above
      // supply the real values.
      attributes: { base: { strength: 0, magic: 0, agility: 0, luck: 0 } },
      affinities: { base: {} },
      vitals: { base: 0, damage: damage?.hp ?? 0 },
      skillPool: { base: 0, spSpent: damage?.sp ?? 0 },
      resources: {
        hitDiceUsed: damage?.hitDiceSpent ?? 0,
        skillDiceUsed: damage?.skillDiceSpent ?? 0,
        prismaUsed: 0,
      },
      exhaustion: { level: character.exhaustion },
      virtues: { ranks: character.virtues, sparkLog: character.sparkLog },
      narrative: {
        ancestry: character.ancestryText,
        background: character.backgroundText,
        backstory: character.backstoryText,
        personality: character.personalityTraits,
        hopes: character.hopes,
        dreams: character.dreams,
        fears: character.fears,
        secrets: character.secrets,
        knives: character.knives.map((knife) => ({
          title: knife.title,
          description: knife.description,
        })),
        chains: character.chains.map((chain) => ({
          title: chain.title,
          description: chain.description,
        })),
      },
    },
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
      attack: "increased",
      defense: "decreased",
      hitEvasion: "neutral",
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
