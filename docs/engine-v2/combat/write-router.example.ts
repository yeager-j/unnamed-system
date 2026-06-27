/**
 * ILLUSTRATIVE, RUNNABLE sketch of the engine-v2 session write-router (CD18–CD20).
 *
 * Self-contained (stubbed engine + in-memory persistence), runs with no deps:
 *     npx tsx docs/engine-v2/combat/write-router.example.ts
 *
 * v3 of the sketch. Two orthogonal axes, composed by the router:
 *   • WRITER (per component) — the pure step: applyOp + which durable token-class.
 *   • STORE  (per storage home) — the impure step: where the entity lives, how to
 *     persist a patch (its version token + channel + auth). There are exactly TWO stores
 *     (the session blob, an entity row), so the router has ONE branch — pick the store —
 *     and everything else (read → applyOp → commit) is shared. No `home`/`vitalsHome` tag:
 *     the storage home is the stored shape (inline entity vs entityId reference).
 */

/* eslint-disable */

// ─────────────────────────────────────────────────────────────────────────────
// 0. Engine stubs — in reality these live in @workspace/game-v2 (pure, storage-blind)
// ─────────────────────────────────────────────────────────────────────────────

type Result<T, E> = { ok: true; value: T } | { ok: false; error: E }
const ok = <T>(value: T): Result<T, never> => ({ ok: true, value })
const err = <E>(error: E): Result<never, E> => ({ ok: false, error })

type Vitals = { base: number; damage: number } //                      signed depletion (CD6)
type ValorState = { kind: "valor"; value: number }
type Mechanics = { states: { valor?: ValorState } }
type Components = { vitals?: Vitals; mechanics?: Mechanics }
type Entity = { id: string; components: Components }

// PURE ops return PATCHES (Pick<Component, field>), not whole components (CD19).
const applyDamage = (v: Vitals, amount: number): Pick<Vitals, "damage"> => ({
  damage: v.damage + amount,
})
const applyHeal = (v: Vitals, amount: number): Pick<Vitals, "damage"> => ({
  damage: Math.max(0, v.damage - amount),
})
const adjustValor = (s: ValorState, delta: number): ValorState => ({
  ...s,
  value: Math.max(0, s.value + delta),
})
const currentHp = (v: Vitals) => Math.max(0, v.base - v.damage)

// ─────────────────────────────────────────────────────────────────────────────
// 1. The write request — carries NO storage field (serializable descriptor, CD19).
// ─────────────────────────────────────────────────────────────────────────────

type ComponentWrite =
  | { component: "vitals"; op: "damage" | "heal"; amount: number }
  | { component: "mechanics"; mechanic: "valor"; op: "adjust"; delta: number }

// ─────────────────────────────────────────────────────────────────────────────
// 2. How a participant is STORED: inline (ephemeral) OR an entityId reference (durable).
//    The home is the SHAPE — no `home` tag (CD3, tightened).
// ─────────────────────────────────────────────────────────────────────────────

type StoredParticipant =
  | { id: string; entity: Entity } //      ephemeral — lives in the session
  | { id: string; entityId: string } //    durable   — a reference to an entity row
const isInline = (p: StoredParticipant): p is { id: string; entity: Entity } =>
  "entity" in p

// ─────────────────────────────────────────────────────────────────────────────
// 3. WRITER registry (CD19) — the per-COMPONENT pure step. No auth/token/channel here:
//    those are per-HOME, so they live on the Store (§5), not duplicated on every writer.
// ─────────────────────────────────────────────────────────────────────────────

type VersionClass = "vitals" | "inventory"
type WriterDeps = { maxPrisma?: number } // injected resolved context; identical client & server

type CombatantComponentWriter<W extends ComponentWrite> = {
  component: W["component"]
  durableClass: VersionClass // which entity-row token-class the durable store bumps
  applyOp: (
    entity: Entity,
    write: W,
    deps: WriterDeps
  ) => Result<Partial<Components>, string>
}

const vitalsWriter: CombatantComponentWriter<
  Extract<ComponentWrite, { component: "vitals" }>
> = {
  component: "vitals",
  durableClass: "vitals",
  applyOp: (e, w) => {
    const v = e.components.vitals
    if (!v) return err("no-vitals") // capability-presence no-op (e.g. an SP write on a no-SP enemy)
    const patch =
      w.op === "damage" ? applyDamage(v, w.amount) : applyHeal(v, w.amount)
    return ok({ vitals: { ...v, ...patch } })
  },
}

const mechanicsWriter: CombatantComponentWriter<
  Extract<ComponentWrite, { component: "mechanics" }>
> = {
  component: "mechanics",
  durableClass: "vitals",
  applyOp: (e, w) => {
    const state = e.components.mechanics?.states[w.mechanic]
    if (!state) return err("no-mechanic") // capability no-op (this combatant has no Valor)
    const next = w.mechanic === "valor" ? adjustValor(state, w.delta) : state // inner sub-dispatch (two-level)
    return ok({
      mechanics: { states: { ...e.components.mechanics!.states, valor: next } },
    })
  },
}

const COMPONENT_WRITERS = {
  vitals: vitalsWriter,
  mechanics: mechanicsWriter,
} as const
const writerFor = (w: ComponentWrite) =>
  COMPONENT_WRITERS[w.component] as CombatantComponentWriter<any>

// ─────────────────────────────────────────────────────────────────────────────
// 4. In-memory persistence stub. The session IS the locator — no separate map.
// ─────────────────────────────────────────────────────────────────────────────

const session = {
  participants: new Map<string, StoredParticipant>(),
  version: 0,
}
const entityRows = new Map<
  string,
  { entity: Entity; vitalsVersion: number; inventoryVersion: number }
>()

// Structural ephemeral-only (CD19): component-writes are NOT on the generic console wire.
const GENERIC_WIRE_KINDS = new Set([
  "setAilment",
  "endTurn",
  "setSide",
  "adjustCounter",
])
const parseGenericWire = (kind: string): Result<string, string> =>
  GENERIC_WIRE_KINDS.has(kind)
    ? ok(kind)
    : err(`rejected: '${kind}' is router-only, off the generic wire (CD19)`)

// ─────────────────────────────────────────────────────────────────────────────
// 5. STORE — a storage HOME. It owns everything that varies by home: where the entity
//    lives (read), how a patch is persisted (commit → token + channel), and its auth gate.
//    There are exactly two; this is the seam the router's old `if` was hiding.
// ─────────────────────────────────────────────────────────────────────────────

type Envelope = { token: string; value: number; channel: string }
type Store = {
  label: string
  auth: "campaign-dm" | "owner-or-campaign-dm"
  read: () => Entity
  commit: (patch: Partial<Components>) => Envelope
}

const sessionStore = (p: { id: string; entity: Entity }): Store => ({
  label: "session (ephemeral)",
  auth: "campaign-dm",
  read: () => p.entity,
  commit: (patch) => {
    p.entity.components = { ...p.entity.components, ...patch } // the session reducer's pure step
    session.version += 1
    return {
      token: "encounter.version",
      value: session.version,
      channel: "encounter",
    }
  },
})

const entityRowStore = (
  entityId: string,
  versionClass: VersionClass
): Store => {
  const row = entityRows.get(entityId)!
  return {
    label: `entity row (durable, ${versionClass}-class)`,
    auth: "owner-or-campaign-dm",
    read: () => row.entity,
    commit: (patch) => {
      row.entity.components = { ...row.entity.components, ...patch }
      row[`${versionClass}Version`] += 1
      return {
        token: `${versionClass}Version`,
        value: row[`${versionClass}Version`],
        channel: `entity:${entityId}`,
      }
    },
  }
}

// The ONLY place storage home is decided — derived from the stored shape (no tag).
const storeFor = (
  p: StoredParticipant,
  writer: CombatantComponentWriter<any>
): Store =>
  isInline(p)
    ? sessionStore(p)
    : entityRowStore(p.entityId, writer.durableClass)

// ─────────────────────────────────────────────────────────────────────────────
// 6. THE ROUTER — server half. No branch in the body: pick the store, then one shared path.
// ─────────────────────────────────────────────────────────────────────────────

function applyCombatantWriteServer(
  participantId: string,
  write: ComponentWrite,
  deps: WriterDeps = {}
): Result<Envelope, string> {
  const p = session.participants.get(participantId)
  if (!p) return err("unknown-participant")
  const writer = writerFor(write)
  const store = storeFor(p, writer) //                       ← the one branch lives here
  log(`    home: ${store.label} · auth: ${store.auth}`) //   (real life: authorize store.auth here)
  const patch = writer.applyOp(store.read(), write, deps) // shared: the pure op
  if (!patch.ok) return patch
  return ok(store.commit(patch.value)) //                    shared: persist + bump token + envelope
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. THE ROUTER — client half (optimistic). Same composition: a local store + the op.
// ─────────────────────────────────────────────────────────────────────────────

const clientSession = { participants: new Map<string, StoredParticipant>() }
const clientDurable = new Map<string, Entity>() // local copies of durable entities (fetched to render)

const clientStoreFor = (
  participantId: string
): Pick<Store, "read" | "commit"> => {
  const p = clientSession.participants.get(participantId)!
  const entity = isInline(p) ? p.entity : clientDurable.get(p.entityId)!
  return {
    read: () => entity,
    commit: (patch) => (
      (entity.components = { ...entity.components, ...patch }),
      { token: "local", value: 0, channel: "local" }
    ),
  }
}

function applyCombatantWriteClient(
  participantId: string,
  write: ComponentWrite,
  deps: WriterDeps = {}
) {
  const store = clientStoreFor(participantId)
  const predicted = writerFor(write).applyOp(store.read(), write, deps) // SAME registry, SAME op
  if (predicted.ok) {
    store.commit(predicted.value)
    log(`    client: optimistic apply (instant) → ${describe(store.read())}`)
  } else {
    log(`    client: predicted no-op (${predicted.error})`)
  }
  const confirmed = applyCombatantWriteServer(participantId, write, deps) // (real life: a network hop)
  if (confirmed.ok)
    log(
      `    server: ${confirmed.value.channel} committed → ${confirmed.value.token}=${confirmed.value.value}`
    )
  else log(`    server: no-op (${confirmed.error})`)
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. Trace
// ─────────────────────────────────────────────────────────────────────────────

const log = (s: string) => console.log(s)
const describe = (e: Entity) => {
  const parts: string[] = []
  if (e.components.vitals)
    parts.push(
      `hp ${currentHp(e.components.vitals)}/${e.components.vitals.base}`
    )
  if (e.components.mechanics?.states.valor)
    parts.push(`valor ${e.components.mechanics.states.valor.value}`)
  return `${e.id} { ${parts.join(", ")} }`
}

function seed() {
  const goblin: Entity = {
    id: "goblin",
    components: { vitals: { base: 30, damage: 0 } },
  }
  session.participants.set("goblin", { id: "goblin", entity: goblin })
  clientSession.participants.set("goblin", {
    id: "goblin",
    entity: structuredClone(goblin),
  })

  const knight: Entity = {
    id: "knight",
    components: {
      vitals: { base: 40, damage: 0 },
      mechanics: { states: { valor: { kind: "valor", value: 0 } } },
    },
  }
  session.participants.set("knight", { id: "knight", entityId: "char_knight" })
  entityRows.set("char_knight", {
    entity: knight,
    vitalsVersion: 0,
    inventoryVersion: 0,
  })
  clientSession.participants.set("knight", {
    id: "knight",
    entityId: "char_knight",
  })
  clientDurable.set("char_knight", structuredClone(knight))
}

function main() {
  seed()
  log(
    "── one router = WRITER (what) ∘ STORE (where); no branch in the body ──\n"
  )

  log(
    "① damage the goblin 12  →  applyCombatantWrite(goblin, { vitals, damage 12 })"
  )
  applyCombatantWriteClient("goblin", {
    component: "vitals",
    op: "damage",
    amount: 12,
  })

  log(
    "\n② bump the knight's Valor +1  →  applyCombatantWrite(knight, { mechanics, valor +1 })"
  )
  applyCombatantWriteClient("knight", {
    component: "mechanics",
    mechanic: "valor",
    op: "adjust",
    delta: 1,
  })

  log(
    "\n③ damage the knight 8  →  same door, vitals writer, durable store again"
  )
  applyCombatantWriteClient("knight", {
    component: "vitals",
    op: "damage",
    amount: 8,
  })

  log("\n④ capability no-op: bump Valor on the goblin (no mechanic component)")
  applyCombatantWriteClient("goblin", {
    component: "mechanics",
    mechanic: "valor",
    op: "adjust",
    delta: 1,
  })

  log(
    "\n⑤ structural ephemeral-only: a component-write can't ride the generic wire"
  )
  log(
    `    parseGenericWire('damageParticipant') → ${(parseGenericWire("damageParticipant") as any).error}`
  )
  log(
    `    parseGenericWire('setAilment')        → ${parseGenericWire("setAilment").ok ? "accepted (overlay/turn wire)" : "rejected"}`
  )

  log("\n── final stores ──")
  const g = session.participants.get("goblin")!
  log(`  session   v${session.version}: ${describe((g as any).entity)}`)
  log(
    `  entity row vitalsV${entityRows.get("char_knight")!.vitalsVersion}: ${describe(entityRows.get("char_knight")!.entity)}`
  )
}

main()
