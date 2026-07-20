import { reduceRoster } from "./reduce/roster"
import { reduceStartCombat } from "./reduce/start-combat"
import type { Session } from "./session"
import type { SessionEvent } from "./session-event"
import {
  applyEncounterSessionIntent,
  type EncounterSessionIntent,
} from "./session-intent"
import type { SessionShell } from "./session-shell"

/**
 * The pure combat-**session** reducer (ADR §2.2; CD4) — applies a {@link
 * SessionEvent} to an immutable {@link Session}, returning the next session. It is
 * a **decider**: deterministic, no I/O, no mutation; the impure shell persists the
 * returned session. Each slice uses Immer `produce`, so every untouched path stays
 * **same-ref** and a documented no-op returns the original reference (R24.1).
 *
 * Dispatch is one **grouped exhaustive `switch` over `event.kind` with NO
 * `default`** (R24.2): a new kind added to {@link SessionEvent} without a matching
 * case fails to compile here ("not all code paths return a value") until it is
 * both handled in a slice and routed — the compile-time guarantee the event
 * vocabulary and its dispatch stay in lockstep. *Illegal* events (well-typed but a
 * no-op against the current state, e.g. `endTurn` with no actor) are handled inside
 * their slice. The reducer reads/writes the overlay + (for the vitals arms)
 * `participant.entity.components.{vitals,skillPool}`; it touches **no spatial
 * field** — `mapInstanceId`'s only reader is the `reduceEncounter` root (R24.5).
 *
 * Curried deps-first carried **no catalog dep** (CD4, SUPERSEDE R24.4): under
 * signed depletion the reducer never re-resolves a catalog max, so `getEnemy` is
 * dropped from the signature rather than kept as an empty seam. `newId` is injected
 * at the composition root (R24.3) and reaches only `reduceRoster`'s
 * `addParticipant` id fallback. The component-write (vitals) events arrive only via
 * the write-router; the generic wire (`combatEventSchema`) never yields one (CD19).
 */
export function createReduceSession(newId: () => string) {
  return (session: Session, event: SessionEvent): Session => {
    switch (event.kind) {
      case "startCombat":
        return reduceStartCombat(session, event)

      case "draftCombatant":
        return reduceLegacyIntent(session, {
          ...event,
          expected: observedParticipantFrame(session, event.participantId),
        })

      case "endTurn": {
        const actorId = session.currentActorId
        if (actorId === null) return session
        const actor = session.participants.find(
          (participant) => participant.id === actorId
        )
        if (actor === undefined) return session
        return reduceLegacyIntent(session, {
          kind: "endTurn",
          expected: {
            ...observedFrame(session),
            actorId,
            turnsTakenThisRound: actor.overlay.turnState.turnsTakenThisRound,
          },
        })
      }

      case "advanceRound":
        return reduceLegacyIntent(session, {
          kind: "advanceRound",
          expected: {
            ...observedFrame(session),
            participants: session.participants.map((participant) => ({
              participantId: participant.id,
              turnsTakenThisRound:
                participant.overlay.turnState.turnsTakenThisRound,
            })),
          },
        })
      case "addParticipant":
      case "removeParticipant":
        return reduceRoster(session, event, newId)

      case "setSide":
        return reduceLegacyIntent(session, event)

      case "setRound":
        return reduceLegacyIntent(session, event)

      case "setCurrentActor":
        return reduceLegacyIntent(session, {
          ...event,
          expected: observedFrame(session),
        })

      case "setActed": {
        const participant = session.participants.find(
          (entry) => entry.id === event.participantId
        )
        if (participant === undefined) return session
        return reduceLegacyIntent(session, {
          ...event,
          expected: {
            ...observedFrame(session),
            turnsTakenThisRound:
              participant.overlay.turnState.turnsTakenThisRound,
          },
        })
      }

      case "adjustBattleConditionAxis":
      case "setBattleConditionFlag":
        return reduceLegacyIntent(session, event)

      case "setAilment":
      case "clearAilment":
        return reduceLegacyIntent(session, event)

      case "adjustCounter":
      case "clearCounter":
        return reduceLegacyIntent(session, event)

      case "adjustActionEconomy":
        return reduceLegacyIntent(session, event)
    }
  }
}

function observedFrame(session: Session) {
  return {
    round: session.round,
    currentActorId: session.currentActorId,
  }
}

function observedParticipantFrame(
  session: Session,
  participantId: Session["participants"][number]["id"]
) {
  const participant = session.participants.find(
    (entry) => entry.id === participantId
  )
  return {
    ...observedFrame(session),
    side: participant?.overlay.allegiance.side ?? "players",
    turnsTakenThisRound:
      participant?.overlay.turnState.turnsTakenThisRound ?? 0,
  }
}

/**
 * The legacy total reducer keeps hydrated entities, but delegates migrated
 * session behavior to the shell rules by adapting those entities as inline
 * values for the duration of the pure call. Only scalars and overlays are
 * folded back; entity identity and references stay untouched.
 */
function reduceLegacyIntent(
  session: Session,
  intent: EncounterSessionIntent
): Session {
  const shell: SessionShell = {
    ...session,
    participants: session.participants.map((participant) => ({
      ...participant,
      entity: { storage: "inline", entity: participant.entity },
    })),
  }
  const applied = applyEncounterSessionIntent(shell, intent)
  if (!applied.ok || applied.value === shell) return session
  return {
    ...session,
    round: applied.value.round,
    currentActorId: applied.value.currentActorId,
    participants: session.participants.map((participant) => {
      const projected = applied.value.participants.find(
        (entry) => entry.id === participant.id
      )
      return projected === undefined ||
        projected.overlay === participant.overlay
        ? participant
        : { ...participant, overlay: projected.overlay }
    }),
  }
}
