import { describe, expect, it } from "vitest"

import { createDungeonState } from "@workspace/game-v2/spatial/dungeon.schema"
import { emptyGenerationLedger } from "@workspace/game-v2/spatial/generation-ledger.schema"
import { reduceDungeon } from "@workspace/game-v2/spatial/reduce-dungeon"

import {
  emitSiteDeclaration,
  mintDeclarationEffects,
  scheduledDeclaration,
  siteChecklistItems,
} from "./declarations"
import { templateSetContentSchema } from "./template-set.schema"

const set = templateSetContentSchema.parse({
  templates: {
    hall: { key: "hall", name: "Hall" },
    vault: {
      key: "vault",
      name: "Vault",
      unique: true,
      weight: 0,
      site: {
        appearByDefault: true,
        defaultMinDepth: 3,
        defaultUrgency: "session",
      },
    },
    portal: {
      key: "portal",
      name: "Castle Gate",
      portalMapId: "castle",
    },
    retired: {
      key: "retired",
      unique: true,
      tombstoned: true,
    },
  },
  templateOrder: ["hall", "vault", "portal", "retired"],
})

describe("siteChecklistItems", () => {
  it("derives ordered unique/portal sites with defaults and authored resolution", () => {
    expect(
      siteChecklistItems(set, {
        pages: { p: { id: "p", name: "Page" } },
        zones: {
          a: {
            id: "a",
            name: "Vault B",
            description: "",
            dmNotes: "",
            pageId: "p",
            position: { x: 0, y: 0 },
            templateKey: "vault",
          },
          A: {
            id: "A",
            name: "Vault A",
            description: "",
            dmNotes: "",
            pageId: "p",
            position: { x: 1, y: 0 },
            templateKey: "vault",
          },
        },
        connections: {},
      })
    ).toStrictEqual([
      {
        templateKey: "vault",
        name: "Vault",
        appearByDefault: true,
        defaultMinDepth: 3,
        defaultUrgency: "session",
        unique: true,
        authoredZoneId: "A",
      },
      {
        templateKey: "portal",
        name: "Castle Gate",
        appearByDefault: false,
        defaultMinDepth: 0,
        defaultUrgency: "eventually",
        unique: false,
      },
    ])
  })
})

describe("emitSiteDeclaration", () => {
  it("owns identity, sequence, K, hidden draw, and cursor consumption", () => {
    const ledger = { ...emptyGenerationLedger(), seed: "seed" }
    const emitted = emitSiteDeclaration({
      ledger,
      templateKey: "vault",
      minDepth: 3,
      intent: "session",
      newId: () => "decl-1",
    })
    expect(emitted.ok).toBe(true)
    if (!emitted.ok) return
    expect(emitted.value[0]).toMatchObject({
      kind: "declareSite",
      declaration: {
        id: "decl-1",
        sequence: 0,
        templateKey: "vault",
        minDepth: 3,
        k: 6,
        qualifyingCount: 0,
      },
    })
    const event = emitted.value[0]!
    if (event.kind !== "declareSite") throw new Error("missing declaration")
    expect(event.declaration.secretIndex).toBeGreaterThanOrEqual(1)
    expect(event.declaration.secretIndex).toBeLessThanOrEqual(6)
    expect(emitted.value[1]).toStrictEqual({
      kind: "advanceCursors",
      consumed: { draws: 1 },
    })
  })

  it("rejects an unseeded ledger and duplicate pending template", () => {
    expect(
      emitSiteDeclaration({
        ledger: emptyGenerationLedger(),
        templateKey: "vault",
        minDepth: 0,
        intent: "force-place",
        newId: () => "decl",
      })
    ).toStrictEqual({ ok: false, error: "unseeded-ledger" })

    const state = createDungeonState()
    state.generation.seed = "seed"
    const first = emitSiteDeclaration({
      ledger: state.generation,
      templateKey: "vault",
      minDepth: 0,
      intent: "force-place",
      newId: () => "decl-1",
    })
    if (!first.ok) throw new Error(first.error)
    const next = first.value.reduce(reduceDungeon, state).generation
    expect(
      emitSiteDeclaration({
        ledger: next,
        templateKey: "vault",
        minDepth: 0,
        intent: "force-place",
        newId: () => "decl-2",
      })
    ).toStrictEqual({ ok: false, error: "site-already-pending" })
  })
})

describe("declaration scheduling", () => {
  const ledger = {
    ...emptyGenerationLedger(),
    declarations: [
      {
        id: "ordinary",
        sequence: 0,
        templateKey: "vault",
        minDepth: 2,
        k: 6,
        secretIndex: 1,
        qualifyingCount: 0,
      },
      {
        id: "force-later",
        sequence: 1,
        templateKey: "portal",
        minDepth: 2,
        k: 1,
        secretIndex: 1,
        qualifyingCount: 0,
      },
    ],
  }

  it("gates by depth and gives K=1 force-place priority", () => {
    expect(scheduledDeclaration(ledger, 1)).toBeUndefined()
    expect(scheduledDeclaration(ledger, 2)?.id).toBe("force-later")
  })

  it("increments every eligible declaration but resolves only the minted template", () => {
    expect(mintDeclarationEffects(ledger, 2, "portal")).toStrictEqual([
      { declarationId: "ordinary", incremented: true, resolved: false },
      { declarationId: "force-later", incremented: true, resolved: true },
    ])
  })

  it("lets an explicit early mint resolve below minimum depth without incrementing", () => {
    expect(mintDeclarationEffects(ledger, 1, "vault")).toStrictEqual([
      { declarationId: "ordinary", incremented: false, resolved: true },
    ])
  })
})
