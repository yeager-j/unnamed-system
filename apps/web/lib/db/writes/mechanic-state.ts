import { eq } from "drizzle-orm"

import { err, ok, type Result } from "@workspace/game/foundation/result"
import {
  initialStateFor,
  mechanicStateSchema,
  type MechanicKind,
  type MechanicState,
} from "@workspace/game/mechanics"

import { db } from "@/lib/db/client"
import { characterExists } from "@/lib/db/queries/load-character"
import { characterArchetypes, characters } from "@/lib/db/schema/character"
import { EDIT_SURFACE_CLASS } from "@/lib/db/version-classes"

import { bumpCharacterVersionGuarded } from "./version-guard"

/**
 * The shared persistence primitive every per-Archetype mechanic write
 * composes through (UNN-227 and the dozens of per-Archetype mechanics that
 * follow). `mechanicState` lives on `characterArchetypes`, but the write is
 * gated on `characters.vitalsVersion` — mechanic state is encounter-time,
 * same conceptual bucket as ailments / battle conditions / exhaustion, so
 * the four existing per-write-class tokens stay at four.
 *
 * The single transaction:
 * 1. SELECT the active `characterArchetype` (id + `mechanicState`).
 * 2. Coerce `null` → `initialStateFor(kind)`; surface `"wrong-mechanic"` if
 *    the active Archetype's mechanic kind no longer matches `kind` (the
 *    player switched Archetypes between page render and the click; the
 *    client should re-fetch).
 * 3. Run the pure `transition`; re-validate via {@link mechanicStateSchema}.
 * 4. Conditionally bump `characters.vitalsVersion` first (the inventory
 *    pattern — the row lock either blocks a concurrent writer or causes
 *    our WHERE to miss with no child rows touched).
 * 5. UPDATE the `characterArchetype` row's `mechanicState`.
 */

export type MechanicPersistenceError =
  | "character-not-found"
  | "no-active-archetype"
  | "wrong-mechanic"
  | "stale"

export interface MechanicWriteSuccess<K extends MechanicKind> {
  value: Extract<MechanicState, { kind: K }>
  version: number
}

type StateOf<K extends MechanicKind> = Extract<MechanicState, { kind: K }>

export async function applyMechanicStateForCharacter<K extends MechanicKind>(
  characterId: string,
  kind: K,
  transition: (state: StateOf<K>) => StateOf<K>,
  expectedVitalsVersion: number
): Promise<Result<MechanicWriteSuccess<K>, MechanicPersistenceError>> {
  return db.transaction(async (tx) => {
    const [activeRow] = await tx
      .select({
        archetypeId: characterArchetypes.id,
        mechanicState: characterArchetypes.mechanicState,
        archetypeKey: characterArchetypes.archetypeKey,
      })
      .from(characters)
      .innerJoin(
        characterArchetypes,
        eq(characterArchetypes.id, characters.activeArchetypeId)
      )
      .where(eq(characters.id, characterId))
      .limit(1)

    if (!activeRow) {
      return (await characterExists(characterId, tx))
        ? err("no-active-archetype")
        : err("character-not-found")
    }

    const fallback = initialStateFor(kind)
    if (!fallback || fallback.kind !== kind) {
      return err("wrong-mechanic")
    }

    const current = (activeRow.mechanicState ?? fallback) as MechanicState
    if (current.kind !== kind) return err("wrong-mechanic")

    const next = transition(current as StateOf<K>)
    const validated = mechanicStateSchema.parse(next) as StateOf<K>

    const bumped = await bumpCharacterVersionGuarded(
      tx,
      characterId,
      EDIT_SURFACE_CLASS.mechanic,
      expectedVitalsVersion
    )
    if (!bumped.ok) return bumped

    await tx
      .update(characterArchetypes)
      .set({ mechanicState: validated })
      .where(eq(characterArchetypes.id, activeRow.archetypeId))

    return ok({ value: validated, version: bumped.value.version })
  })
}
