/**
 * ILLUSTRATIVE, RUNNABLE sketch of the engine-v2 session write-router (CD18–CD20).
 *
 * Self-contained (stubbed engine + in-memory persistence), runs with no deps:
 *     npx tsx docs/engine-v2/combat/write-router.example.ts
 *
 * v2 of the sketch: there is NO `home`/`vitalsHome` tag anywhere. The storage home is
 * DERIVED — a participant is stored in the session EITHER as an inline entity (ephemeral)
 * OR as a reference to a durable row. `isInline(p)` is the whole check. The `entityId`
 * reference (for the durable arm) is the only irreducible datum — and its presence IS the
 * home signal, so there's no separate tag to store.
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
// 1. The write request — carries NO storage field. Mechanic transitions cross as a
//    serializable DESCRIPTOR, never a closure (CD19).
// ─────────────────────────────────────────────────────────────────────────────

type ComponentWrite =
  | { component: "vitals"; op: "damage" | "heal"; amount: number }
  | { component: "mechanics"; mechanic: "valor"; op: "adjust"; delta: number }

// ─────────────────────────────────────────────────────────────────────────────
// 2. How a participant is STORED in the session: inline (ephemeral) OR a reference
//    to a durable row. The home is the SHAPE — there is no `home` tag (CD3, tightened).
// ─────────────────────────────────────────────────────────────────────────────

type StoredParticipant =
  | { id: string; entity: Entity } //      ephemeral — the entity lives in the session
  | { id: string; entityId: string } //    durable   — a reference to an entity row
const isInline = (p: StoredParticipant): p is { id: string; entity: Entity } =>
  "entity" in p

// ─────────────────────────────────────────────────────────────────────────────
// 3. THE REGISTRY (CD19): one CombatantComponentWriter per writable component.
// ─────────────────────────────────────────────────────────────────────────────

type VersionClass = "vitals" | "inventory"
type WriterDeps = { maxPrisma?: number } // injected resolved context; identical client & server

type CombatantComponentWriter<W extends ComponentWrite> = {
  component: W["component"]
  durableClass: VersionClass
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
// 5. THE ROUTER — server half. Home is DERIVED from the stored shape (isInline).
// ─────────────────────────────────────────────────────────────────────────────

type WriteResult = Result<
  { token: string; value: number; channel: string },
  string
>

function applyCombatantWriteServer(
  participantId: string,
  write: ComponentWrite,
  deps: WriterDeps = {}
): WriteResult {
  const p = session.participants.get(participantId)
  if (!p) return err("unknown-participant")
  const writer = writerFor(write)

  if (isInline(p)) {
    // EPHEMERAL ARM — the entity lives right here in the session (→ the reducer's pure step)
    log(`    route: ephemeral (entity is in the session)`)
    const patch = writer.applyOp(p.entity, write, deps)
    if (!patch.ok) return patch
    p.entity.components = { ...p.entity.components, ...patch.value }
    session.version += 1
    return ok({
      token: "encounter.version",
      value: session.version,
      channel: "encounter",
    })
  }

  // DURABLE ARM — follow the reference to the row (→ per-field owner-mode write)
  log(`    route: durable (ref → ${p.entityId})`)
  const row = entityRows.get(p.entityId)!
  const patch = writer.applyOp(row.entity, write, deps)
  if (!patch.ok) return patch
  row.entity.components = { ...row.entity.components, ...patch.value } // SAME pure op, different store
  const cls = writer.durableClass
  row[`${cls}Version`] += 1
  return ok({
    token: `${cls}Version`,
    value: row[`${cls}Version`],
    channel: `entity:${p.entityId}`,
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. THE ROUTER — client half (optimistic). The DM console holds its OWN local session
//    (it must, to run the reducer locally), so it derives home the SAME way — isInline.
// ─────────────────────────────────────────────────────────────────────────────

const clientSession = { participants: new Map<string, StoredParticipant>() }
const clientDurable = new Map<string, Entity>() // local copies of durable entities (fetched to render)

const localEntityFor = (participantId: string): Entity => {
  const p = clientSession.participants.get(participantId)!
  return isInline(p) ? p.entity : clientDurable.get(p.entityId)!
}

function applyCombatantWriteClient(
  participantId: string,
  write: ComponentWrite,
  deps: WriterDeps = {}
) {
  const predicted = writerFor(write).applyOp(
    localEntityFor(participantId),
    write,
    deps
  ) // SAME registry, SAME op
  if (predicted.ok) {
    const e = localEntityFor(participantId)
    e.components = { ...e.components, ...predicted.value }
    log(`    client: optimistic apply (instant) → ${describe(e)}`)
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
// 7. Trace
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
  // EPHEMERAL goblin — stored inline in the session.
  const goblin: Entity = {
    id: "goblin",
    components: { vitals: { base: 30, damage: 0 } },
  }
  session.participants.set("goblin", { id: "goblin", entity: goblin })
  clientSession.participants.set("goblin", {
    id: "goblin",
    entity: structuredClone(goblin),
  })

  // DURABLE knight — stored as a REFERENCE; the entity lives on a row.
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
    "── one router, any component, home DERIVED from the stored shape (no `home` tag) ──\n"
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

  log("\n③ damage the knight 8  →  same door, vitals writer, durable arm again")
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
