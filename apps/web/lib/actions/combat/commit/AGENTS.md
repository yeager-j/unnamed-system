# `lib/actions/combat/commit/` — the session-event mint

What remains of the classic combatant write-router after UNN-646 moved
per-combatant component writes onto the combat replica doors
(`../replica/` — see `lib/actions/AGENTS.md`): the router itself
(`applyCombatantWriteAction`, `stores.ts`, the per-arm token envelope) was
deleted with its client machinery, and the shared durable Store
(`commitEntityWrite`) retired with its last caller.

## Containment of the router-only constructors

`mint-session-event.ts` is the one sanctioned deep-path importer of
`@workspace/game-v2/encounter/session-event` (`toSessionEvent`,
`toMechanicTransitionEvent`, `toUseResourceEvent`) — the single decision
point from write vocabulary (`CombatEntityWrite`) to reducer-event
vocabulary, now consumed by the combat replica's session processor
(`../replica/session-processor.ts`). It stays in this directory because the
import fence's exemption covers `combat/commit/**`; the containment layers —
the engine barrel omission, the generic wire's schema exclusion
(`ComponentWriteEvent` stays out of `combatEventSchema`), and the apps/web
`no-restricted-imports` tripwire — are unchanged (UNN-520, CD19).

The history this directory carried (the CD19 Writer ∘ Store router, the
two-auth-gate aggregate, per-arm tokens, UNN-567's revalidation) lives on in
the replica doors' docs and in git.
