import type { Entity } from "@workspace/game-v2/kernel/entity"
import {
  asParticipantId,
  type ParticipantId,
} from "@workspace/game-v2/kernel/participant-id.schema"
import type { CombatSide } from "@workspace/game-v2/kernel/vocab/combat"

import { instantiateEnemy } from "@/domain/game-engine-v2"

/** One staged catalog group to reinforce with: a creature key and how many. */
export interface StagedReinforcement {
  enemyKey: string
  count: number
}

/**
 * The `addParticipant` setup payload for one mid-combat reinforcement — the
 * inline-entity arm the console dispatches (`{ entity }`, so the write mirrors
 * optimistically). Structurally the `{ entity }` arm of the kit's
 * `AddParticipantDispatch["setup"]`; kept engine-tier so the app console never
 * imports `@workspace/game*` at runtime (the tier gate).
 */
export interface ReinforcementSetup {
  id: ParticipantId
  side: CombatSide
  zoneId?: string
  entity: Entity
}

/**
 * Materializes a staged catalog queue into `addParticipant` setups — the
 * client-side materializer for catalog reinforcement events (UNN-493). Each
 * copy mints a fresh participant id (seeding the entity id, so the optimistic
 * mirror and the server agree on the roster key) and deep-copies a full-HP
 * inline entity via the bound {@link instantiateEnemy}. An unknown key yields no
 * entity and is skipped (the catalog UI never offers one). Pass `zoneId` to
 * place every reinforcement in an arrival zone (a placed, paired cross-write);
 * omit it for a theater-of-mind, session-only add.
 *
 * `mintId` is injected so tests can assert stable ids; production uses
 * `crypto.randomUUID`.
 */
export function buildReinforcements(
  entries: StagedReinforcement[],
  zoneId: string | undefined,
  mintId: () => string = () => crypto.randomUUID()
): ReinforcementSetup[] {
  const setups: ReinforcementSetup[] = []
  for (const { enemyKey, count } of entries) {
    for (let copy = 0; copy < count; copy++) {
      const id = asParticipantId(mintId())
      const entity = instantiateEnemy(enemyKey, id)
      if (entity === undefined) continue
      setups.push({
        id,
        side: "enemies",
        entity,
        ...(zoneId ? { zoneId } : {}),
      })
    }
  }
  return setups
}
