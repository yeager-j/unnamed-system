import type { Entity } from "@workspace/game-v2/kernel/entity"
import type { GameData } from "@workspace/game-v2/kernel/ports"
import type { CombatSide } from "@workspace/game-v2/kernel/vocab/combat"

import { makeParticipant, type Session } from "./session"

/**
 * Where an encounter is **minted** from setup (ADR §2.1; CD3 amended, CD8). This
 * is the **only** place a catalog enemy becomes a combatant: a `{ catalog: key }`
 * setup entry is materialized **once, here**, into a plain inline entity — after
 * which neither `resolve` nor the loader (UNN-516) ever reads the catalog again.
 *
 * The setup vocabulary is **shape-discriminated, not a `kind` tag** — the one
 * place a catalog/storage concept is allowed to surface (the runtime
 * {@link Session} stays storage-blind, F1). A participant's entity arrives either
 * already-built (`{ entity }` — a free-entered enemy/object, or a PC row the impure
 * shell pre-fetched) or as a `{ catalog: key }` the factory resolves. The
 * durable-vs-inline **storage home** is decided downstream by the loader's
 * out-of-band locator map (UNN-516), never by this pure mint.
 */

/** Where a participant's {@link Entity} comes from at mint (setup vocabulary). */
export type ParticipantSource = { entity: Entity } | { catalog: string }

/**
 * One participant as supplied to {@link createSessionFactory}: an optional stable
 * `id` (kept across saves when the setup UI mints it, else `newId`), its `side`,
 * its entity `source`, and `hasActed` (the R1.1 edge — `false` at setup, `true`
 * for a mid-round joiner queued for the next round).
 */
export interface ParticipantSetup {
  id?: string
  side: CombatSide
  hasActed?: boolean
  source: ParticipantSource
}

/**
 * Instantiates a **template** entity into a fresh inline combatant: a copy of the
 * template's authored components under a new `id`, with a **fresh**
 * `vitals: { damage: 0 }` so the instance enters at full HP. Generic over any
 * template — today its only caller is the catalog arm (`getEnemy(key)`), but it
 * bakes in **no** catalog concept (no `catalogRef`, no retained `key`), so the
 * result is indistinguishable from a free-entered inline entity (CD3/CD8 amended).
 *
 * An **absent** template (`getEnemy` returned `undefined` for an unknown key)
 * yields a bare entity with `vitals.base = 0` (not omit, not a nonzero default),
 * reproducing v1 R12.3 max-0 ⇒ R13.2 unknown ⇒ Fallen.
 */
function instantiateInlineEntity(
  template: Entity | undefined,
  id: string
): Entity {
  if (!template) {
    return { id, components: { vitals: { base: 0, damage: 0 } } }
  }
  return {
    id,
    components: {
      ...template.components,
      vitals: { base: template.components.vitals?.base ?? 0, damage: 0 },
    },
  }
}

/**
 * Builds a clean initial {@link Session} from encounter-setup inputs (R1.2): round
 * 1, no current actor, no advantage declared yet (`advantage`/`firstSide` null
 * until `startCombat`), and every participant fresh with a defaulted overlay
 * (R1.1). Curried deps-first (mirrors the rest of the engine); `newId` is injected
 * at the composition root for deterministic tests. A participant's id is its own
 * `setup.id` when supplied, else `newId()`; a catalog-materialized enemy reuses
 * that roster id as its inline `entity.id` (an ephemeral entity has no identity
 * apart from its combatant slot).
 */
export function createSessionFactory(
  deps: Pick<GameData, "getEnemy">,
  newId: () => string
) {
  return (setup: ParticipantSetup[]): Session => ({
    round: 1,
    currentActorId: null,
    advantage: null,
    firstSide: null,
    participants: setup.map((entry) => {
      const id = entry.id ?? newId()
      const entity =
        "catalog" in entry.source
          ? instantiateInlineEntity(deps.getEnemy(entry.source.catalog), id)
          : entry.source.entity
      return makeParticipant(entity, id, {
        side: entry.side,
        hasActed: entry.hasActed,
      })
    }),
  })
}
