# `lib/actions/combat/commit/` — the combatant write-router

The **CD19 Writer ∘ Store router** (UNN-520; engine-v2 combat ADR §2.9): every
per-combatant *component* write (vitals, SP, Prisma, mechanic state) enters
through `applyCombatantWriteAction` as a storage-blind serializable descriptor
(`lib/combat/commit/write.schema.ts`) and is routed to the participant's
storage home. The generic event wire (`../apply-event.ts`) structurally cannot
carry these writes (`ComponentWriteEvent` is excluded from
`combatEventSchema`); this module is their only door.

## The one decision

`storeFor` derives the home **from the locator's shape** in the server's own
out-of-band map (`loadEncounterForWrite`): `{ storage: "durable" }` → the
character row via `entityRowStore`; `{ storage: "inline" }` → the session blob
via `sessionStore`. The wire carries **no storage claim** — a client cannot
route around the decision. Everything past `storeFor` is branchless.

## The deliberate two-auth-gate aggregate (ADR §2.11 "honest cost")

This aggregate intentionally runs **two different auth gates**, one per home:

| Home    | Gate                                            | Why                                                                 |
| ------- | ----------------------------------------------- | ------------------------------------------------------------------- |
| session | `requireCampaignDM(row.campaignId)`             | The DM is the sole session-blob writer (§2.8a).                      |
| durable | `requireOwnerOrCampaignDM(characterId)` (UNN-297) | A player may write their own PC's vitals; the DM may too (v1 parity). |

Consequences to keep in mind:

- The gate runs **inside `commit`** (its first step), not in the action body —
  the two-step protocol cannot be mis-ordered, and each home owns its gate.
- The load (`loadEncounterForWrite`) necessarily precedes auth: the home — and
  therefore *which* gate — is only knowable from the locator map. The generic
  wire keeps its cheaper auth-first ordering; this router cannot.
- The durable gate authorizes against the **character's own campaign
  placement** (v1's rule), not the encounter's campaign — one gate for the
  sheet buttons and the console, so the two surfaces can never disagree about
  who may write a PC row.

## Interim semantic rule: one semantic per storage home

Until the v2 entity table lands (UNN-511/PR12), the two homes deliberately
carry **different write semantics**:

- **Durable (PC rows): v1 semantics.** The per-field wrappers
  (`writes/adjust-pools.ts`, `writes/mechanic-state.ts`) keep absolute
  `currentHP`/`currentSP` columns, v1 clamps (no over-max HP), the
  active-mechanic constraint (`wrong-mechanic`), and the row's own
  `prismaCharges`. `setMax` is refused (`unsupported-durable-write`) — a PC's
  max derives from the engine. The sheet's own buttons and the console
  therefore agree on every PC row.
- **Ephemeral (inline participants): v2 semantics.** Signed depletion via the
  session reducer — over-max HP (negative `damage`) works, over-spend keeps
  the true magnitude, Prisma is `prismaUsed` depletion (currently always
  refused with `no-prisma-max`: the resolved cap isn't derivable yet).

The divergence (e.g. over-max HP works on an inline enemy, not a PC row) is
**deliberate and dies at PR12** — do not "fix" one side to match the other.

## Containment of the router-only constructors

`stores.ts` is the one sanctioned deep-path importer of
`@workspace/game-v2/encounter/session-event` (`toSessionEvent`,
`toMechanicTransitionEvent`, `toUseResourceEvent`). Enforced in layers: the
barrel omission, the generic wire's schema exclusion, the contract tests, and
an apps/web `no-restricted-imports` tripwire (warning-only under `only-warn`).
