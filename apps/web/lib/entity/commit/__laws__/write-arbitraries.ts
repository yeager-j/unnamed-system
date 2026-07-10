import fc from "fast-check"

import {
  arbitraryEntity,
  type ComponentKey,
} from "@workspace/game-v2/__fixtures__/arbitraries/entity"
import { record } from "@workspace/game-v2/__fixtures__/arbitraries/record"
import { arbitrarySlug } from "@workspace/game-v2/__fixtures__/arbitraries/vocab"
import { isInheritableSkill } from "@workspace/game-v2/archetypes/inheritance"
import type { Entity } from "@workspace/game-v2/kernel/entity"
import { PATH_CHOICES, VIRTUE_KEYS } from "@workspace/game-v2/kernel/vocab"
import { STAIN_ELEMENTS } from "@workspace/game-v2/mechanics/mage/stains"
import { NARRATIVE_TEXT_FIELDS } from "@workspace/game-v2/narrative"
import { MAX_EXHAUSTION_LEVEL } from "@workspace/game-v2/resources/exhaustion.schema"
import { SPARK_LOG_CAPACITY } from "@workspace/game-v2/virtues/virtues.schema"

import {
  MAX_POOL_AMOUNT,
  type EntityWrite,
} from "@/lib/entity/commit/write.schema"
import { getArchetype } from "@/lib/game-engine-v2"
import { canonicalize } from "@/lib/game-v2/__fixtures__/entity-row"

import { APP_VOCAB } from "./app-catalog"

/**
 * **The crux of the isomorphism law.** A write descriptor drawn blind from the
 * schema almost always refuses — `equip` names an item the entity doesn't own,
 * `rankUp` fires on a half-empty Spark log — and a property where every write
 * refuses holds vacuously while proving nothing. So each family's writes are
 * generated **as a function of the entity they will be applied to**.
 *
 * Refusals are still generated, deliberately and in the minority: a refusal must
 * be symmetric (client refuses ⟺ server refuses) and must change nothing, which is
 * half of what the law asserts. The suite's non-vacuity check pins the ratio.
 */
export type WriteFamily = EntityWrite["component"]

const currencyAmount = fc.integer({ min: 1, max: 60 })
const listName = fc.constantFrom("knives" as const, "chains" as const)

/** Draws from `pool`, falling back to a free slug — which the Writer will refuse. */
function fromEntity<T>(
  pool: readonly T[],
  fallback: fc.Arbitrary<T>
): fc.Arbitrary<T> {
  return pool.length > 0 ? fc.constantFrom(...pool) : fallback
}

/** An index that addresses `length` entries, sometimes one past the end. */
function indexInto(length: number): fc.Arbitrary<number> {
  return fc.integer({ min: 0, max: Math.max(0, length) })
}

const arbitraryTransition = {
  perfection: fc.oneof(
    record({
      op: fc.constant("adjust" as const),
      delta: fc.integer({ min: -3, max: 3 }),
    }),
    record({ op: fc.constant("reset" as const) })
  ),
  valor: record({
    op: fc.constant("adjust" as const),
    delta: fc.integer({ min: -3, max: 3 }),
  }),
  "path-of-dawn": record({
    op: fc.constant("setMode" as const),
    value: fc.boolean(),
  }),
  "path-of-dusk": record({
    op: fc.constant("setMode" as const),
    value: fc.boolean(),
  }),
  stains: fc.oneof(
    record({
      op: fc.constant("setSlot" as const),
      slotIndex: fc.integer({ min: 0, max: 3 }),
      element: fc.option(fc.constantFrom(...STAIN_ELEMENTS), { nil: null }),
    }),
    record({ op: fc.constant("clear" as const) })
  ),
  frenzy: fc.oneof(
    record({
      op: fc.constant("adjustPain" as const),
      delta: fc.integer({ min: -3, max: 3 }),
    }),
    record({ op: fc.constant("setFrenzyMode" as const), value: fc.boolean() })
  ),
}

/**
 * The mechanics that ship a write surface. The three display-only mechanics
 * (Thief's Insight, Elemental Larceny, Enchantment) are rejected by the descriptor
 * schema itself, so they are not valid `EntityWrite`s to generate.
 */
const WRITABLE_MECHANICS = Object.keys(
  arbitraryTransition
) as (keyof typeof arbitraryTransition)[]

/** Every `(source, skill)` pair the inheritance gate would accept for `owner`. */
function inheritableSlotFills(
  entity: Entity,
  ownerKey: string
): { sourceArchetypeKey: string; skillKey: string }[] {
  const roster = entity.components.archetypes?.roster ?? []
  return roster.flatMap((entry) => {
    if (entry.key === ownerKey) return []
    const source = getArchetype(entry.key)
    if (source === undefined) return []
    return source.skills
      .filter((reference) =>
        isInheritableSkill(source, entry.rank, reference.skill)
      )
      .map((reference) => ({
        sourceArchetypeKey: entry.key,
        skillKey: reference.skill,
      }))
  })
}

function arbitraryArchetypesWrite(entity: Entity): fc.Arbitrary<EntityWrite> {
  const roster = entity.components.archetypes?.roster ?? []
  const rosterKeys = roster.map((entry) => entry.key)
  const archetypeKey = fromEntity(rosterKeys, arbitrarySlug)

  // `sourceArchetypeKey` and `skillKey` must be drawn together — they name one
  // inherited Skill. Two independent `.map`s off the same arbitrary would draw
  // twice and pair a source with another source's Skill.
  const setSlot = archetypeKey.chain((ownerKey) => {
    const fills = inheritableSlotFills(entity, ownerKey)
    const cleared = fc.constant(null)
    const target =
      fills.length > 0 ? fc.oneof(cleared, fc.constantFrom(...fills)) : cleared
    return target.chain((fill) =>
      record({
        component: fc.constant("archetypes" as const),
        op: fc.constant("setInheritanceSlot" as const),
        archetypeKey: fc.constant(ownerKey),
        slotIndex: indexInto(getArchetype(ownerKey)?.inheritanceSlots ?? 0),
        sourceArchetypeKey: fc.constant(fill?.sourceArchetypeKey ?? null),
        skillKey: fc.constant(fill?.skillKey ?? null),
      })
    )
  })

  return fc.oneof(
    record({
      component: fc.constant("archetypes" as const),
      op: fc.constant("setOrigin" as const),
      archetypeKey: fc.constantFrom(...APP_VOCAB.archetypeKeys),
    }),
    record({
      component: fc.constant("archetypes" as const),
      op: fc.constant("setActive" as const),
      archetypeKey,
    }),
    setSlot,
    record({
      component: fc.constant("archetypes" as const),
      op: fc.constant("spendArchetypeRank" as const),
      archetypeKey: fc.oneof(
        archetypeKey,
        fc.constantFrom(...APP_VOCAB.archetypeKeys)
      ),
    })
  )
}

function arbitraryEquipmentWrite(entity: Entity): fc.Arbitrary<EntityWrite> {
  const itemIds = (entity.components.equipment?.items ?? []).map(
    (item) => item.id
  )
  const itemId = fromEntity(itemIds, arbitrarySlug)
  return fc.oneof(
    record({
      component: fc.constant("equipment" as const),
      op: fc.constantFrom(
        "equip" as const,
        "unequip" as const,
        "remove" as const
      ),
      itemId,
    }),
    record({
      component: fc.constant("equipment" as const),
      op: fc.constant("add" as const),
      catalogItemKey: fc.constantFrom(...APP_VOCAB.itemKeys),
      quantity: fc.integer({ min: 1, max: 5 }),
      idSeed: fc.string({
        unit: fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz0123456789"),
        minLength: 8,
        maxLength: 16,
      }),
    }),
    record({
      component: fc.constant("equipment" as const),
      op: fc.constant("setQuantity" as const),
      itemId,
      quantity: fc.integer({ min: 0, max: 9 }),
    }),
    record({
      component: fc.constant("equipment" as const),
      op: fc.constantFrom("addCurrency" as const, "removeCurrency" as const),
      amount: currencyAmount,
    })
  )
}

function arbitraryNarrativeWrite(entity: Entity): fc.Arbitrary<EntityWrite> {
  const narrative = entity.components.narrative
  const prose = fc.string({ maxLength: 30 })
  return fc.oneof(
    record({
      component: fc.constant("narrative" as const),
      op: fc.constant("setField" as const),
      field: fc.constantFrom(...NARRATIVE_TEXT_FIELDS),
      value: prose,
    }),
    record({
      component: fc.constant("narrative" as const),
      op: fc.constant("addListEntry" as const),
      list: listName,
    }),
    listName.chain((list) =>
      record({
        component: fc.constant("narrative" as const),
        op: fc.constant("removeListEntry" as const),
        list: fc.constant(list),
        index: indexInto((narrative?.[list] ?? []).length),
      })
    ),
    listName.chain((list) =>
      record({
        component: fc.constant("narrative" as const),
        op: fc.constant("setListEntry" as const),
        list: fc.constant(list),
        index: indexInto((narrative?.[list] ?? []).length),
        field: fc.constantFrom("title" as const, "description" as const),
        value: prose,
      })
    )
  )
}

/**
 * The pools arm draws its **whole wire domain**, not a comfortable slice: an
 * unbounded `amount` was the one place a wire-valid write could push
 * `vitals.damage` past the safe-integer range its load schema enforces, bricking
 * the row. Quantifying over exactly what the door admits is what keeps
 * `MAX_POOL_AMOUNT` honest.
 */
function arbitraryPoolWrite(
  component: "vitals" | "skillPool"
): fc.Arbitrary<EntityWrite> {
  return record({
    component: fc.constant(component),
    op: fc.constantFrom("damage" as const, "heal" as const, "setMax" as const),
    amount: fc.integer({ min: 1, max: MAX_POOL_AMOUNT }),
  })
}

function arbitraryRestWrite(): fc.Arbitrary<EntityWrite> {
  const spend = fc.integer({ min: 0, max: 6 })
  const rolled = fc.integer({ min: 0, max: 30 })
  return fc.oneof(
    record({
      component: fc.constant("rest" as const),
      op: fc.constant("fullRest" as const),
    }),
    record({
      component: fc.constant("rest" as const),
      op: fc.constant("partialRest" as const),
      skillDiceToSpend: spend,
      rolled,
    }),
    record({
      component: fc.constant("rest" as const),
      op: fc.constant("respite" as const),
      hitDiceToSpend: spend,
      rolled,
    })
  )
}

function arbitraryVirtuesWrite(entity: Entity): fc.Arbitrary<EntityWrite> {
  const logged = entity.components.virtues?.sparkLog ?? []
  const virtueRank = fc.integer({ min: 0, max: 2 })
  return fc.oneof(
    record({
      component: fc.constant("virtues" as const),
      op: fc.constant("setAllocation" as const),
      ranks: record({
        expression: virtueRank,
        empathy: virtueRank,
        wisdom: virtueRank,
        focus: virtueRank,
      }),
    }),
    record({
      component: fc.constant("virtues" as const),
      op: fc.constant("addSpark" as const),
      virtue: fc.constantFrom(...VIRTUE_KEYS),
    }),
    record({
      component: fc.constant("virtues" as const),
      op: fc.constant("rankUp" as const),
      virtue: fromEntity(logged, fc.constantFrom(...VIRTUE_KEYS)),
    })
  )
}

function arbitraryTalentsWrite(entity: Entity): fc.Arbitrary<EntityWrite> {
  const owned = (entity.components.talents ?? []).map((talent) => talent.key)
  return fc.oneof(
    record({
      component: fc.constant("talents" as const),
      op: fc.constant("setGained" as const),
      keys: fc.uniqueArray(fc.constantFrom(...APP_VOCAB.talentKeys), {
        maxLength: 4,
      }),
    }),
    record({
      component: fc.constant("talents" as const),
      op: fc.constant("add" as const),
      key: fc.constantFrom(...APP_VOCAB.talentKeys),
    }),
    record({
      component: fc.constant("talents" as const),
      op: fc.constant("remove" as const),
      key: fromEntity(owned, fc.constantFrom(...APP_VOCAB.talentKeys)),
    })
  )
}

function arbitraryMechanicsWrite(entity: Entity): fc.Arbitrary<EntityWrite> {
  const owned = Object.keys(entity.components.mechanics?.states ?? {}).filter(
    (kind): kind is keyof typeof arbitraryTransition =>
      kind in arbitraryTransition
  )
  const mechanic = fromEntity(
    owned,
    fc.constantFrom(...WRITABLE_MECHANICS)
  ).chain((kind) => fc.tuple(fc.constant(kind), arbitraryTransition[kind]))
  return mechanic.map(([kind, transition]) => ({
    component: "mechanics",
    mechanic: kind,
    transition,
  }))
}

/**
 * One write arbitrary per family, each aimed at the entity it will be applied to.
 * Total over the family union, so a new write family cannot land without a
 * generator — and therefore cannot land without the isomorphism law covering it.
 */
const WRITE_ARBITRARIES: {
  [K in WriteFamily]: (entity: Entity) => fc.Arbitrary<EntityWrite>
} = {
  vitals: () => arbitraryPoolWrite("vitals"),
  skillPool: () => arbitraryPoolWrite("skillPool"),
  resources: () =>
    record({
      component: fc.constant("resources" as const),
      op: fc.constant("usePrisma" as const),
    }),
  mechanics: arbitraryMechanicsWrite,
  rest: arbitraryRestWrite,
  exhaustion: () =>
    record({
      component: fc.constant("exhaustion" as const),
      op: fc.constant("setLevel" as const),
      level: fc.integer({ min: 0, max: MAX_EXHAUSTION_LEVEL }),
    }),
  level: () =>
    record({
      component: fc.constant("level" as const),
      op: fc.constantFrom(
        "awardVictory" as const,
        "removeVictory" as const,
        "levelUp" as const
      ),
    }),
  path: () =>
    record({
      component: fc.constant("path" as const),
      op: fc.constant("setChoice" as const),
      choice: fc.constantFrom(...PATH_CHOICES),
    }),
  archetypes: arbitraryArchetypesWrite,
  talents: arbitraryTalentsWrite,
  virtues: arbitraryVirtuesWrite,
  narrative: arbitraryNarrativeWrite,
  equipment: arbitraryEquipmentWrite,
}

export const WRITE_FAMILIES = Object.keys(WRITE_ARBITRARIES) as WriteFamily[]

export function arbitraryWriteFor(
  entity: Entity,
  family: WriteFamily
): fc.Arbitrary<EntityWrite> {
  return WRITE_ARBITRARIES[family](entity)
}

/**
 * The components each family needs before it can do anything but refuse
 * `capability-missing`. Entities still carry an arbitrary subset of everything
 * else, so the fold around the write stays quantified.
 */
const REQUIRED_COMPONENTS: Record<WriteFamily, ComponentKey[]> = {
  vitals: ["vitals"],
  skillPool: ["skillPool"],
  resources: ["resources"],
  mechanics: ["mechanics"],
  rest: ["vitals", "skillPool", "resources", "exhaustion", "level"],
  exhaustion: ["exhaustion"],
  level: ["level", "archetypes"],
  path: [],
  archetypes: ["archetypes"],
  talents: ["talents"],
  virtues: ["virtues"],
  narrative: ["narrative"],
  equipment: ["equipment"],
}

/**
 * `rankUp` is legal only at a Spark log of **exactly** capacity, which a uniform
 * generator reaches about one time in eight. Half the virtues entities are topped
 * up so the rank-up transition is exercised rather than merely refused.
 */
function withFullSparkLog(entity: Entity): Entity {
  const virtues = entity.components.virtues
  if (virtues === undefined) return entity
  const sparkLog = [...virtues.sparkLog]
  while (sparkLog.length < SPARK_LOG_CAPACITY) sparkLog.push("expression")
  return {
    ...entity,
    components: { ...entity.components, virtues: { ...virtues, sparkLog } },
  }
}

/** An entity shaped for `family`, canonicalized the way a database read would be. */
export function arbitraryEntityFor(family: WriteFamily): fc.Arbitrary<Entity> {
  const base = arbitraryEntity({
    vocab: APP_VOCAB,
    require: REQUIRED_COMPONENTS[family],
  })
  const shaped =
    family === "virtues"
      ? base.chain((entity) =>
          fc.boolean().map((full) => (full ? withFullSparkLog(entity) : entity))
        )
      : base
  return shaped.map(canonicalize)
}
