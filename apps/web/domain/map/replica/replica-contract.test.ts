import { describe, expect, it } from "vitest"
import { z } from "zod/v4"

import { emptyMapInstance, reduceMapInstance } from "@workspace/game-v2/spatial"
import {
  createReplica,
  defineMutation,
  defineMutations,
  type InvocationOf,
} from "@workspace/replica"
import {
  createInMemoryAuthority,
  REPLICA_CONTRACT_LAW_NAMES,
  verifyReplicaContract,
  type ReplicaContractContext,
} from "@workspace/replica/testing"

import {
  applyMapInstanceIntent,
  applyPreconditionedMapInstanceIntent,
  prepareMapInstanceInvocation,
  type MapInstanceInvocation,
  type MapInstanceReplicaRejection,
  type MapInstanceReplicaState,
} from "./mutations"

const identity = {
  clientGroupId: "map-instance:mi-1",
  clientId: "client-1",
}
const retryBudget = 3

const appendZoneName = defineMutation({
  name: "map.contract.append-zone-name",
  args: z.object({ zoneId: z.string(), suffix: z.string() }),
  apply(root: MapInstanceReplicaState, { zoneId, suffix }) {
    const zone = root.state.geometry.zones[zoneId]
    if (!zone) return { ok: false as const, error: "zone-not-found" as const }
    return {
      ok: true as const,
      value: {
        ...root,
        state: {
          ...root.state,
          geometry: {
            ...root.state.geometry,
            zones: {
              ...root.state.geometry.zones,
              [zoneId]: { ...zone, name: zone.name + suffix },
            },
          },
        },
      },
    }
  },
})

type ContractInvocation =
  | MapInstanceInvocation
  | InvocationOf<typeof appendZoneName>

const contractMutations = defineMutations([
  applyMapInstanceIntent,
  applyPreconditionedMapInstanceIntent,
  appendZoneName,
])

function initialState(): MapInstanceReplicaState {
  const empty = emptyMapInstance()
  const withA = reduceMapInstance(() => "unused")(empty, {
    kind: "editGeometry",
    event: {
      kind: "addZone",
      id: "a",
      pageId: "default",
      position: { x: 0, y: 0 },
    },
  })
  return { state: withA, status: "open" }
}

type Context = ReplicaContractContext<
  MapInstanceReplicaState,
  ContractInvocation,
  MapInstanceReplicaRejection,
  void
>

function createContext(): Context {
  const initial = initialState()
  const authority = createInMemoryAuthority({
    mutations: contractMutations,
    initial,
  })
  const handle = authority.transport(identity)
  const replica = createReplica({
    identity,
    initial: { value: initial, through: 0, cursor: 0 },
    mutations: contractMutations,
    transport: handle.transport,
    delivery: { retryBudget },
  })
  return {
    replica,
    registry: contractMutations,
    identity,
    retryBudget,
    fixtures: {
      writes: [
        appendZoneName({ zoneId: "a", suffix: "-one" }),
        appendZoneName({ zoneId: "a", suffix: "-two" }),
      ],
      refused: prepareMapInstanceInvocation(initial.state, {
        kind: "renameZone",
        zoneId: "missing",
        name: "Nowhere",
      }),
      external: prepareMapInstanceInvocation(
        initial.state,
        { kind: "addZone", name: "External" },
        () => "external-zone"
      ),
      conflicting: {
        pending: prepareMapInstanceInvocation(initial.state, {
          kind: "placeCombatant",
          tokenKey: "pc-1",
          zoneId: "a",
        }),
        external: prepareMapInstanceInvocation(initial.state, {
          kind: "placeCombatant",
          tokenKey: "pc-1",
          zoneId: "a",
        }),
      },
      vetoError: "invalid-write",
    },
    controls: {
      read: authority.read,
      publish: authority.publish,
      recover: () => {
        authority.publish()
        handle.alive()
      },
      commitExternal: authority.commitExternal,
      deliver: authority.deliver,
      deliveries: authority.deliveries,
      executions: authority.executions,
      vetoNext: authority.vetoNext,
      failNextPush: authority.failNextPush,
      dropNextResult: authority.dropNextResult,
      pause: authority.pause,
      flush: authority.flush,
      resume: authority.resume,
      forgetClient: () => authority.forgetClient(identity),
    },
  }
}

describe("Map Instance Replica contract", () => {
  const laws = verifyReplicaContract({ create: createContext })

  it("covers the full law set", () => {
    expect(laws.map(({ name }) => name)).toEqual([
      ...REPLICA_CONTRACT_LAW_NAMES,
    ])
  })

  for (const law of laws) {
    it(law.name, () => law.run())
  }
})
