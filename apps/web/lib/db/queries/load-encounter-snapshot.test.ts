import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  makeParticipant,
  type LoadedSession,
  type Session,
  type StoredEntityLocator,
} from "@workspace/game-v2/encounter"
import type { Entity } from "@workspace/game-v2/kernel/entity"
import {
  asParticipantId,
  type ParticipantId,
} from "@workspace/game-v2/kernel/participant-id.schema"
import type { MapInstanceState } from "@workspace/game-v2/spatial"
import { revisionAt } from "@workspace/headcanon"
import { err, ok } from "@workspace/result"

import { encounterAxis, entityAxisFor, mapInstanceAxis } from "@/lib/db/axes"
import type { LoadedEncounterForSnapshot } from "@/lib/db/queries/load-encounter-session"
import type { EncounterRow } from "@/lib/db/schema/encounter"

import { getEncounterSnapshot } from "./load-encounter-snapshot"

// The query composes four impure seams — the v2 snapshot loader, the campaign
// row, the v2 Map-Instance row, and the session (via `deriveViewer`) — around
// the REAL engine (`resolveSession` + `projectEncounterSnapshot`) and the real
// viewer mint + version fold. Stub only the seams: the point of these tests is
// that the composition redacts per relationship off the one policy table
// (UNN-530 AC), which a stubbed projector could not prove.
vi.mock("server-only", () => ({}))
vi.mock("@/lib/db/client", () => ({
  db: {
    transaction: (run: (tx: object) => unknown) => run({}),
  },
}))

const auth = vi.fn()
const isCampaignMember = vi.fn()
const loadCampaignRowById = vi.fn()
const loadEncounterForSnapshot = vi.fn()
const loadMapInstanceById = vi.fn()

vi.mock("@/lib/auth/index", () => ({ auth: () => auth() }))
vi.mock("@/lib/db/queries/load-campaign", () => ({
  loadCampaignRowById: (id: string) => loadCampaignRowById(id),
  isCampaignMember: (campaignId: string, userId: string) =>
    isCampaignMember(campaignId, userId),
}))
vi.mock("@/lib/db/queries/load-encounter-session", () => ({
  loadEncounterForSnapshot: (shortId: string) =>
    loadEncounterForSnapshot(shortId),
}))
vi.mock("@/lib/db/queries/map-instance", () => ({
  loadMapInstanceById: (id: string) => loadMapInstanceById(id),
}))

const DM_ID = "user-dm"
const OWNER_ID = "user-owner"
const CAMPAIGN_ID = "campaign-1"
const MAP_INSTANCE_ID = "map-1"
const SHORT_ID = "enc1"

const OWNED_PC = asParticipantId("c-owned")
const ALLY_PC = asParticipantId("c-ally")
const GOBLIN = asParticipantId("c-goblin")

/** Full stat block so the drop rows have something real to leak. */
function statComponents(name: string): Entity["components"] {
  return {
    identity: { name },
    attributes: { base: { strength: 14, magic: 8, agility: 10, luck: 6 } },
    affinities: { base: { fire: "weak" } },
    vitals: { base: 20, damage: 5 },
  }
}

/** Two durable PCs (viewer-owned + teammate-owned) and one inline goblin. */
function makeSession(): Session {
  return {
    round: 2,
    currentActorId: OWNED_PC,
    advantage: null,
    firstSide: null,
    participants: [
      makeParticipant(
        { id: "char-owned", components: statComponents("Iris") },
        OWNED_PC,
        { side: "players" }
      ),
      makeParticipant(
        { id: "char-ally", components: statComponents("Bramble") },
        ALLY_PC,
        { side: "players" }
      ),
      makeParticipant(
        { id: "goblin-1", components: statComponents("Goblin") },
        GOBLIN,
        { side: "enemies" }
      ),
    ],
  }
}

function makeLocators(): Map<ParticipantId, StoredEntityLocator> {
  return new Map<ParticipantId, StoredEntityLocator>([
    [OWNED_PC, { storage: "durable", entityId: "char-owned" }],
    [ALLY_PC, { storage: "durable", entityId: "char-ally" }],
    [
      GOBLIN,
      {
        storage: "inline",
        entity: { id: "goblin-1", components: statComponents("Goblin") },
      },
    ],
  ])
}

function makeInstanceState(): MapInstanceState {
  return {
    geometry: {
      pages: { default: { id: "default", name: "Page 1" } },
      zones: {
        z: {
          id: "z",
          name: "Zone",
          description: "",
          dmNotes: "",
          position: { x: 0, y: 0 },
          pageId: "default",
        },
      },
      connections: {},
    },
    occupancy: {
      [OWNED_PC]: { zoneId: "z", engagement: { status: "free" } },
      [ALLY_PC]: { zoneId: "z", engagement: { status: "free" } },
      [GOBLIN]: { zoneId: "z", engagement: { status: "free" } },
    },
    enchantment: null,
    reveal: {
      revealedZoneIds: [],
      revealedConnectionIds: [],
      unlockedConnectionIds: [],
    },
    generation: { zones: {}, stubs: {}, connections: {}, grafts: {} },
    lastMovedTokenKey: null,
  }
}

const DURABLE_VERSIONS = new Map([
  ["char-owned", 4],
  ["char-ally", 9],
])

function makeLoaded(): LoadedEncounterForSnapshot {
  const row = {
    id: "enc-row-1",
    campaignId: CAMPAIGN_ID,
    shortId: SHORT_ID,
    name: "Warehouse Ambush",
    status: "live",
    mapInstanceId: MAP_INSTANCE_ID,
    version: 2,
  } as EncounterRow
  const loaded: LoadedSession = {
    session: makeSession(),
    locators: makeLocators(),
  }
  return {
    row,
    loaded,
    durableVersions: new Map(DURABLE_VERSIONS),
    durableRevisions: new Map([
      ["char-owned", { identity: 1, vitals: 4, inventory: 2, progression: 3 }],
      ["char-ally", { identity: 5, vitals: 9, inventory: 6, progression: 7 }],
    ]),
    durableOwners: new Map([
      ["char-owned", OWNER_ID],
      ["char-ally", "user-teammate"],
    ]),
  }
}

const signedInAs = (userId: string | null) =>
  auth.mockResolvedValue(userId ? { user: { id: userId } } : null)

async function snapshotFor(userId: string | null) {
  signedInAs(userId)
  const result = await getEncounterSnapshot(SHORT_ID)
  if (!result.ok) throw new Error(`unexpected error: ${result.error}`)
  return { snapshot: result.value.canon.value, canon: result.value.canon }
}

function combatant(
  snapshot: Awaited<ReturnType<typeof snapshotFor>>["snapshot"],
  id: ParticipantId
) {
  const found = snapshot.combatants.find((c) => c.id === id)
  if (!found) throw new Error(`combatant ${id} missing from snapshot`)
  return found
}

beforeEach(() => {
  vi.clearAllMocks()
  loadEncounterForSnapshot.mockResolvedValue(ok(makeLoaded()))
  loadCampaignRowById.mockResolvedValue({
    id: CAMPAIGN_ID,
    shortId: "camp1",
    dmUserId: DM_ID,
  })
  loadMapInstanceById.mockResolvedValue({
    id: MAP_INSTANCE_ID,
    state: makeInstanceState(),
    version: 5,
  })
  isCampaignMember.mockResolvedValue(false)
})

describe("getEncounterSnapshot — per-relationship redaction (UNN-530 AC)", () => {
  it("DM sees every combatant's attributes/affinities", async () => {
    const { snapshot } = await snapshotFor(DM_ID)

    for (const id of [OWNED_PC, ALLY_PC, GOBLIN]) {
      const c = combatant(snapshot, id).components
      expect("attributes" in c).toBe(true)
      expect("affinities" in c).toBe(true)
    }
  })

  it("owner sees own + ally stats; the opponent's are structurally dropped", async () => {
    const { snapshot } = await snapshotFor(OWNER_ID)

    expect("attributes" in combatant(snapshot, OWNED_PC).components).toBe(true)
    expect("attributes" in combatant(snapshot, ALLY_PC).components).toBe(true)

    const goblin = combatant(snapshot, GOBLIN).components
    expect("attributes" in goblin).toBe(false)
    expect("affinities" in goblin).toBe(false)
  })

  it("SECURITY: an opponent's dropped components carry no key on the wire — absent, never null", async () => {
    const { snapshot } = await snapshotFor(OWNER_ID)
    const goblin = combatant(snapshot, GOBLIN).components

    expect(Object.keys(goblin)).not.toContain("attributes")
    expect(Object.keys(goblin)).not.toContain("affinities")
    // Public rows survive alongside the drop.
    expect(goblin.identity?.name).toBe("Goblin")
    expect(goblin.vitals).toBeDefined()
  })

  it("a signed-out spectator gets no one's attributes/affinities", async () => {
    const { snapshot } = await snapshotFor(null)

    for (const id of [OWNED_PC, ALLY_PC, GOBLIN]) {
      const c = combatant(snapshot, id).components
      expect("attributes" in c).toBe(false)
      expect("affinities" in c).toBe(false)
      expect(c.identity).toBeDefined()
    }
  })

  it("a campaign member whose PC sat out still reads the party as allies", async () => {
    isCampaignMember.mockResolvedValue(true)
    const { snapshot } = await snapshotFor("user-benched-member")

    expect("attributes" in combatant(snapshot, OWNED_PC).components).toBe(true)
    expect("attributes" in combatant(snapshot, GOBLIN).components).toBe(false)
  })
})

describe("getEncounterSnapshot — observed canon", () => {
  it("carries the whitelisted envelope fields and roster-id combatants", async () => {
    const { snapshot } = await snapshotFor(null)

    expect(snapshot).toMatchObject({
      status: "live",
      name: "Warehouse Ambush",
      campaignShortId: "camp1",
      version: 2,
      round: 2,
    })
    expect(snapshot.currentActor).toMatchObject({
      id: OWNED_PC,
      name: "Iris",
      side: "players",
    })
    expect(snapshot.combatants.map((c) => c.id)).toEqual([
      OWNED_PC,
      ALLY_PC,
      GOBLIN,
    ])
  })

  it("observes the encounter, instance, and every durable participant axis", async () => {
    const { canon } = await snapshotFor(null)

    expect(revisionAt(canon.revisions, encounterAxis("enc-row-1"))).toBe(2)
    expect(revisionAt(canon.revisions, mapInstanceAxis(MAP_INSTANCE_ID))).toBe(
      5
    )
    expect(
      revisionAt(canon.revisions, entityAxisFor.identity("char-owned"))
    ).toBe(1)
    expect(
      revisionAt(canon.revisions, entityAxisFor.vitals("char-owned"))
    ).toBe(4)
    expect(
      revisionAt(canon.revisions, entityAxisFor.inventory("char-ally"))
    ).toBe(6)
    expect(
      revisionAt(canon.revisions, entityAxisFor.progression("char-ally"))
    ).toBe(7)
  })

  it("passes the loader's error through untouched", async () => {
    loadEncounterForSnapshot.mockResolvedValue(err("encounter-not-found"))
    signedInAs(null)

    expect(await getEncounterSnapshot(SHORT_ID)).toEqual(
      err("encounter-not-found")
    )
  })

  it("surfaces a missing Map-Instance as a data-integrity error", async () => {
    loadMapInstanceById.mockResolvedValue(null)
    signedInAs(null)

    expect(await getEncounterSnapshot(SHORT_ID)).toEqual(
      err("map-instance-not-found")
    )
  })
})

describe("getEncounterSnapshot — campaign pairing (UNN-608)", () => {
  it("404s when the watch URL's campaign does not own the encounter", async () => {
    // The campaign row's shortId is "camp1"; a watch URL naming a different
    // campaign must not resolve this globally-unique encounter shortId.
    signedInAs(null)

    expect(await getEncounterSnapshot(SHORT_ID, "wrong-camp")).toEqual(
      err("encounter-not-found")
    )
  })

  it("resolves when the watch URL's campaign matches", async () => {
    signedInAs(DM_ID)

    const result = await getEncounterSnapshot(SHORT_ID, "camp1")
    expect(result.ok).toBe(true)
  })

  it("allows an unpaired shortId read when no campaign frames it", async () => {
    signedInAs(null)

    const result = await getEncounterSnapshot(SHORT_ID)
    expect(result.ok).toBe(true)
  })
})
