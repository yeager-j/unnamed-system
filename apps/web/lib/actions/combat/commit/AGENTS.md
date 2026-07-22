# `lib/actions/combat/commit/` — reducer-event translation

Combat component writes now enter through the registered
`showtime.combat.v1` command in `../mutations/`. The command reloads the
authoritative encounter locator inside each authority attempt, applies the
home-specific authorization policy, and then commits inline state or composes
the shared durable `commitEntityWrite` Store.

This folder retains one deliberately narrow responsibility:
`mint-session-write-event.ts` translates a validated inline component intent
into the engine session reducer's router-only event. It is the sole sanctioned
deep-path importer of `@workspace/game-v2/encounter/session-event`; the barrel
omission and `no-restricted-imports` tripwire keep those constructors out of the
client protocol and durable Store.

The mutation wire carries only `encounterId`, `participantId`, and `write`—no
storage home, version, axis, actor, or character locator claim. Receipt
execution, denial translation, accepted-stamp finalization, invalidation, and
refresh belong to the registered package action.
