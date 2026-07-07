# `lib/actions/combat/commit/` — the combatant write-router (encounter door)

The **CD19 Writer ∘ Store router** (UNN-520; UNN-551; engine-v2 combat ADR §2.9,
characters ADR §2.4): every per-combatant *component* write (vitals, SP, Prisma,
mechanic state) enters through `applyCombatantWriteAction` as a storage-blind
serializable descriptor (`entityWriteSchema`, `lib/entity/commit/write.schema.ts`)
and is routed to the participant's storage home. The generic event wire
(`../apply-event.ts`) structurally cannot carry these writes (`ComponentWriteEvent`
is excluded from `combatEventSchema`); this module is their only encounter door.

After UNN-551 this is the **encounter address adapter**, not a second write
factory: it resolves `participantId → locator`, then a durable write forwards to
the *same* shared `commitEntityWrite` (`lib/actions/entity/entity-row-store.ts`)
the character surfaces use. Write logic — the Writers, the guard, the durable
semantics — exists once, in `lib/entity/`; this door only supplies the address.

## The one decision

`storeFor` derives the home **from the locator's shape** in the server's own
out-of-band map (`loadEncounterForWrite`): `{ storage: "durable" }` → the shared
native `entityRowStore` (forwards to `commitEntityWrite`); `{ storage: "inline" }`
→ the session blob via `sessionStore`. The wire carries **no storage claim for
routing or auth** — a client cannot route around the decision. Everything past
`storeFor` is branchless.

**Per-arm tokens (UNN-567).** The envelope's two version tokens are each
optional on the wire and required by their own arm: the session arm guards on
`expectedVersion` (refusing `missing-encounter-version` without it), the durable
arm on `expectedCharacterVersion` (refusing `missing-character-version`) — no
token rides as a passenger. Sending a token is the client's belief about the
home made harmless: a wrong belief can only fail closed, never mis-route.

## The deliberate two-auth-gate aggregate (ADR §2.11 "honest cost")

This aggregate intentionally runs **two different auth gates**, one per home:

| Home    | Gate                                                    | Why                                                                 |
| ------- | ------------------------------------------------------- | ------------------------------------------------------------------- |
| session | `requireCampaignDM(row.campaignId)`                     | The DM is the sole session-blob writer (§2.8a).                     |
| durable | `requireOwnerOrCampaignDMForEntity(entityId)` (UNN-297) | A player may write their own PC's vitals; the DM may too (v1 parity). |

Consequences to keep in mind:

- Each gate runs **inside `commit`** — the session arm's directly, the durable
  arm's inside the `commitEntityWrite` it forwards to — not in the action body, so
  the two-step protocol cannot be mis-ordered and each home owns its gate.
- The load (`loadEncounterForWrite`) necessarily precedes auth: the home — and
  therefore *which* gate — is only knowable from the locator map. The generic
  wire keeps its cheaper auth-first ordering; this router cannot.
- The durable gate authorizes against the **entity's own campaign placement**
  (v1's rule), not the encounter's campaign — one gate for the sheet buttons and
  the console, so the two surfaces can never disagree about who may write a PC row.

## One semantic per storage home — resolved (UNN-551)

The interim divergence (durable = v1 absolute-column semantics, ephemeral = v2
signed depletion) is **gone**. The durable arm no longer delegates to the v1
per-field wrappers; it forwards to `commitEntityWrite`, which commits native v2
components on the `entity` row. So **both homes now carry the same semantics** —
signed depletion, over-max HP (negative `damage`), `setMax` as a real write — and
the sheet buttons, the console, and an inline enemy all agree.

## Containment of the router-only constructors

`stores.ts` is the one sanctioned deep-path importer of
`@workspace/game-v2/encounter/session-event` (`toSessionEvent`,
`toMechanicTransitionEvent`, `toUseResourceEvent`) — the **session arm's** event
mint. Enforced in layers: the barrel omission, the generic wire's schema
exclusion, the contract tests, and an apps/web `no-restricted-imports` tripwire
(warning-only under `only-warn`). The durable arm imports none of it — it forwards
to `lib/actions/entity`, which never touches session-event.
