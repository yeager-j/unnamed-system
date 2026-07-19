import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { arbitraryEntity } from "@workspace/game-v2/__fixtures__/arbitraries/entity"
import { record } from "@workspace/game-v2/__fixtures__/arbitraries/record"
import { arbitrarySlug } from "@workspace/game-v2/__fixtures__/arbitraries/vocab"
import type { StoredSession } from "@workspace/game-v2/encounter/locator"
import type { OverlayComponents } from "@workspace/game-v2/encounter/overlay"
import {
  loadSessionShell,
  serializeSessionShell,
  type SessionShell,
  type ShellEntity,
} from "@workspace/game-v2/encounter/session-shell"
import {
  AILMENT_KEYS,
  BATTLE_CONDITION_STATES,
} from "@workspace/game-v2/encounter/vocab"
import {
  asParticipantId,
  type ParticipantId,
} from "@workspace/game-v2/kernel/participant-id.schema"
import {
  COMBAT_ADVANTAGES,
  COMBAT_SIDES,
} from "@workspace/game-v2/kernel/vocab/combat"
import { ok } from "@workspace/result"

/**
 * **The shell round-trip laws.** A per-encounter-row replica root serves a
 * {@link SessionShell} and its authority writes one back; the two directions
 * must be exact inverses or an accepted snapshot would silently rewrite the
 * blob it claims to reflect (defaults injected, homes lost, keys dropped).
 *
 * The quantifier ranges over **shell space** — values already fixed points of
 * the load schemas (the arbitraries' standing discipline) — because that is the
 * honest domain: an arbitrary junk blob is *supposed* to normalize or refuse,
 * and the example tests pin those refusals.
 */

/** A positive count, small enough to shrink readably. */
const positiveCount = fc.integer({ min: 1, max: 9 })

/** A parsed overlay — every key present (the schemas' `.default({})` fixed point). */
const arbitraryOverlay: fc.Arbitrary<OverlayComponents> = record({
  allegiance: record({ side: fc.constantFrom(...COMBAT_SIDES) }),
  turnState: record({
    movesUsed: fc.nat({ max: 4 }),
    standardsUsed: fc.nat({ max: 4 }),
    reactionsUsed: fc.nat({ max: 4 }),
    turnsTakenThisRound: fc.nat({ max: 4 }),
  }),
  ailments: fc.array(fc.constantFrom(...AILMENT_KEYS), { maxLength: 3 }),
  battleConditions: record({
    attack: fc.constantFrom(...BATTLE_CONDITION_STATES),
    defense: fc.constantFrom(...BATTLE_CONDITION_STATES),
    hitEvasion: fc.constantFrom(...BATTLE_CONDITION_STATES),
    charged: fc.boolean(),
    concentrating: fc.boolean(),
  }),
  conditionDurations: record(
    {
      attack: positiveCount,
      defense: positiveCount,
      hitEvasion: positiveCount,
    },
    { requiredKeys: [] }
  ),
  counters: record(
    { lumina: positiveCount, tells: positiveCount },
    { requiredKeys: [] }
  ),
})

const arbitraryParticipantId: fc.Arbitrary<ParticipantId> =
  arbitrarySlug.map(asParticipantId)

const arbitraryShellEntity: fc.Arbitrary<ShellEntity> = fc.oneof(
  record({
    storage: fc.constant("durable" as const),
    entityId: arbitrarySlug,
  }),
  record({
    storage: fc.constant("inline" as const),
    entity: arbitraryEntity(),
  })
)

const arbitraryParticipantShell = record({
  id: arbitraryParticipantId,
  entity: arbitraryShellEntity,
  overlay: arbitraryOverlay,
})

function arbitrarySessionShell(options: {
  requireDurable: boolean
}): fc.Arbitrary<SessionShell> {
  const participants = options.requireDurable
    ? fc
        .tuple(
          record({
            id: arbitraryParticipantId,
            entity: record({
              storage: fc.constant("durable" as const),
              entityId: arbitrarySlug,
            }),
            overlay: arbitraryOverlay,
          }),
          fc.array(arbitraryParticipantShell, { maxLength: 3 })
        )
        .map(([durable, rest]) => [durable, ...rest])
    : fc.array(arbitraryParticipantShell, { maxLength: 4 })

  return record(
    {
      round: fc.integer({ min: 1, max: 50 }),
      currentActorId: fc.option(arbitraryParticipantId, { nil: null }),
      advantage: fc.option(fc.constantFrom(...COMBAT_ADVANTAGES), {
        nil: null,
      }),
      firstSide: fc.option(fc.constantFrom(...COMBAT_SIDES), { nil: null }),
      mapInstanceId: arbitrarySlug,
      participants,
    },
    {
      requiredKeys: [
        "round",
        "currentActorId",
        "advantage",
        "firstSide",
        "participants",
      ],
    }
  )
}

/** `load ∘ serialize ≡ id`, parameterized so the negative control can break it. */
function roundTripLaw(
  serialize: (shell: SessionShell) => StoredSession,
  options: { requireDurable: boolean }
) {
  return fc.property(arbitrarySessionShell(options), (shell) => {
    expect(loadSessionShell(serialize(shell))).toStrictEqual(ok(shell))
  })
}

describe("session shell round-trip", () => {
  it("load ∘ serialize ≡ id over arbitrary shells", () => {
    fc.assert(roundTripLaw(serializeSessionShell, { requireDurable: false }))
  })

  it("serialize ∘ load ≡ id over stored fixed points", () => {
    fc.assert(
      fc.property(arbitrarySessionShell({ requireDurable: false }), (shell) => {
        const stored = serializeSessionShell(shell)
        const reloaded = loadSessionShell(stored)
        if (!reloaded.ok) {
          throw new Error("a serialized shell must reload")
        }
        expect(serializeSessionShell(reloaded.value)).toStrictEqual(stored)
      })
    )
  })

  it("fails for a serialize that loses a durable home (negative control)", () => {
    // The exact corruption `saveSession`'s fail-closed arm exists to prevent:
    // a durable participant written inline. The shell makes the honest path
    // structurally total, so the law must be what still catches home loss.
    const homeLosingSerialize = (shell: SessionShell): StoredSession => {
      const stored = serializeSessionShell(shell)
      return {
        ...stored,
        participants: stored.participants.map((participant) =>
          participant.locator.storage === "durable"
            ? {
                ...participant,
                locator: {
                  storage: "inline",
                  entity: { id: participant.locator.entityId, components: {} },
                },
              }
            : participant
        ),
      }
    }

    const result = fc.check(
      roundTripLaw(homeLosingSerialize, { requireDurable: true })
    )

    expect(result.failed).toBe(true)
    const [shell] = result.counterexample ?? []
    if (shell === undefined) {
      throw new Error("a failing property must report a counterexample")
    }
    expect(
      shell.participants.some((entry) => entry.entity.storage === "durable")
    ).toBe(true)
  })
})
