import { describe, expect, it } from "vitest"

import { lintTemplateSet, type LintRule, type LintVocab } from "./lint"
import { templateSetContentSchema } from "./template-set.schema"

/** Parses a partial blob into a full {@link TemplateSetContent} (defaults fill). */
const content = (partial: unknown) => templateSetContentSchema.parse(partial)

const vocab = (over: Partial<LintVocab> = {}): LintVocab => ({
  enemyKeys: over.enemyKeys ?? new Set(),
  itemKeys: over.itemKeys ?? new Set(),
  mapIds: over.mapIds,
})

/** A vocab that resolves nothing — every catalog/world reference dangles. */
const HOSTILE_VOCAB: LintVocab = {
  enemyKeys: new Set(),
  itemKeys: new Set(),
  mapIds: new Set(),
}

const rulesOf = (findings: { rule: LintRule }[]): LintRule[] =>
  findings.map((f) => f.rule)

const has = (findings: { rule: LintRule }[], rule: LintRule): boolean =>
  rulesOf(findings).includes(rule)

describe("lintTemplateSet — unmintable-template", () => {
  it("fires for a template with no legal partner", () => {
    const findings = lintTemplateSet(
      content({
        templates: {
          a: { key: "a", unique: true, tags: ["x"], accepts: ["y"] },
        },
      }),
      vocab()
    )
    expect(has(findings, "unmintable-template")).toBe(true)
    const finding = findings.find((f) => f.rule === "unmintable-template")!
    expect(finding.target).toEqual({ kind: "template", key: "a" })
  })

  it("is clean when a two-way-legal partner exists", () => {
    const findings = lintTemplateSet(
      content({
        templates: {
          a: { key: "a", tags: ["x"], accepts: ["y"] },
          b: { key: "b", tags: ["y"], accepts: ["x"] },
        },
      }),
      vocab()
    )
    expect(has(findings, "unmintable-template")).toBe(false)
  })

  it("lets a non-unique template partner itself", () => {
    const findings = lintTemplateSet(
      content({
        templates: { a: { key: "a", tags: ["x"], accepts: ["x"] } },
      }),
      vocab()
    )
    expect(has(findings, "unmintable-template")).toBe(false)
  })

  it("forbids a unique template from partnering itself", () => {
    const findings = lintTemplateSet(
      content({
        templates: {
          a: { key: "a", unique: true, tags: ["x"], accepts: ["x"] },
        },
      }),
      vocab()
    )
    expect(has(findings, "unmintable-template")).toBe(true)
  })

  it("skips a tombstoned template as subject and excludes it as partner", () => {
    const findings = lintTemplateSet(
      content({
        templates: {
          live: { key: "live", tags: ["x"], accepts: ["y"] },
          dead: {
            key: "dead",
            tombstoned: true,
            tags: ["y"],
            accepts: ["x"],
          },
        },
      }),
      vocab()
    )
    // `dead` is skipped as a subject (no finding for it) but its exclusion as a
    // partner leaves `live` with no legal neighbour.
    const unmintable = findings.filter((f) => f.rule === "unmintable-template")
    expect(unmintable.map((f) => f.target.key)).toEqual(["live"])
  })
})

describe("lintTemplateSet — connector rules", () => {
  const room = { tags: ["room"], accepts: ["room"] }

  it("fires missing-connector when none is designated", () => {
    const findings = lintTemplateSet(
      content({ templates: { c: { key: "c", ...room } } }),
      vocab()
    )
    const finding = findings.find((f) => f.rule === "missing-connector")!
    expect(finding.target).toEqual({ kind: "set" })
  })

  it("fires missing-connector when the designated key is dangling", () => {
    const findings = lintTemplateSet(
      content({
        templates: { c: { key: "c", ...room } },
        connectorTemplateKey: "ghost",
      }),
      vocab()
    )
    expect(has(findings, "missing-connector")).toBe(true)
  })

  it("fires missing-connector when the connector is tombstoned", () => {
    const findings = lintTemplateSet(
      content({
        templates: { c: { key: "c", ...room, tombstoned: true } },
        connectorTemplateKey: "c",
      }),
      vocab()
    )
    expect(has(findings, "missing-connector")).toBe(true)
  })

  it("is clean with a valid, universal connector", () => {
    const findings = lintTemplateSet(
      content({
        templates: {
          c: { key: "c", ...room },
          a: { key: "a", ...room },
        },
        connectorTemplateKey: "c",
      }),
      vocab()
    )
    expect(has(findings, "missing-connector")).toBe(false)
    expect(has(findings, "non-universal-connector")).toBe(false)
  })

  it("fires non-universal-connector for a template the connector can't partner", () => {
    const findings = lintTemplateSet(
      content({
        templates: {
          c: { key: "c", ...room },
          odd: { key: "odd", tags: ["odd"], accepts: ["odd"] },
        },
        connectorTemplateKey: "c",
      }),
      vocab()
    )
    const finding = findings.find((f) => f.rule === "non-universal-connector")!
    expect(finding.target).toEqual({ kind: "template", key: "odd" })
  })

  it("ignores tombstoned templates when checking connector universality", () => {
    const findings = lintTemplateSet(
      content({
        templates: {
          c: { key: "c", ...room },
          odd: {
            key: "odd",
            tombstoned: true,
            tags: ["odd"],
            accepts: ["odd"],
          },
        },
        connectorTemplateKey: "c",
      }),
      vocab()
    )
    expect(has(findings, "non-universal-connector")).toBe(false)
  })
})

describe("lintTemplateSet — reference rules", () => {
  it("fires dangling-table-ref for a contentRoll to a missing table", () => {
    const findings = lintTemplateSet(
      content({
        templates: {
          a: {
            key: "a",
            tags: ["x"],
            accepts: ["x"],
            contentRolls: [{ chance: 0.5, tableKey: "nope" }],
          },
        },
      }),
      vocab()
    )
    const finding = findings.find((f) => f.rule === "dangling-table-ref")!
    expect(finding.target).toEqual({ kind: "template", key: "a" })
  })

  it("is clean when the contentRoll table exists", () => {
    const findings = lintTemplateSet(
      content({
        templates: {
          a: {
            key: "a",
            tags: ["x"],
            accepts: ["x"],
            contentRolls: [{ chance: 0.5, tableKey: "loot" }],
          },
        },
        tables: { loot: { key: "loot" } },
      }),
      vocab()
    )
    expect(has(findings, "dangling-table-ref")).toBe(false)
  })

  it("fires unresolvable enemy/item refs against a hostile vocab and is clean when resolvable", () => {
    const blob = content({
      tables: {
        loot: {
          key: "loot",
          rows: [
            {
              weight: 1,
              entries: [
                { kind: "enemy", enemyKey: "goblin", count: 2 },
                { kind: "item", itemKey: "potion" },
                { kind: "text", text: "a corpse" },
              ],
            },
          ],
        },
      },
    })

    const hostile = lintTemplateSet(blob, HOSTILE_VOCAB)
    expect(has(hostile, "unresolvable-enemy-ref")).toBe(true)
    expect(has(hostile, "unresolvable-item-ref")).toBe(true)
    const enemyFinding = hostile.find(
      (f) => f.rule === "unresolvable-enemy-ref"
    )!
    expect(enemyFinding.target).toEqual({ kind: "table", key: "loot" })

    const resolvable = lintTemplateSet(
      blob,
      vocab({
        enemyKeys: new Set(["goblin"]),
        itemKeys: new Set(["potion"]),
      })
    )
    expect(has(resolvable, "unresolvable-enemy-ref")).toBe(false)
    expect(has(resolvable, "unresolvable-item-ref")).toBe(false)
  })

  it("fires unresolvable-portal-ref only when mapIds is provided", () => {
    const blob = content({
      templates: {
        p: { key: "p", tags: ["x"], accepts: ["x"], portalMapId: "map-9" },
      },
    })

    // No mapIds → portal check is skipped entirely.
    expect(
      has(
        lintTemplateSet(blob, vocab({ mapIds: undefined })),
        "unresolvable-portal-ref"
      )
    ).toBe(false)

    // mapIds without the target → fires.
    expect(
      has(
        lintTemplateSet(blob, vocab({ mapIds: new Set(["other"]) })),
        "unresolvable-portal-ref"
      )
    ).toBe(true)

    // mapIds with the target → clean.
    expect(
      has(
        lintTemplateSet(blob, vocab({ mapIds: new Set(["map-9"]) })),
        "unresolvable-portal-ref"
      )
    ).toBe(false)
  })
})

describe("lintTemplateSet — site-missing-declaration-defaults", () => {
  it("fires for a unique template with no site block", () => {
    const findings = lintTemplateSet(
      content({
        templates: {
          a: { key: "a", unique: true, tags: ["x"], accepts: ["x"] },
        },
      }),
      vocab()
    )
    expect(has(findings, "site-missing-declaration-defaults")).toBe(true)
  })

  it("fires for a portal template with no site block", () => {
    const findings = lintTemplateSet(
      content({
        templates: {
          a: { key: "a", tags: ["x"], accepts: ["x"], portalMapId: "m" },
        },
      }),
      vocab({ mapIds: new Set(["m"]) })
    )
    expect(has(findings, "site-missing-declaration-defaults")).toBe(true)
  })

  it("is clean when the site block is present", () => {
    const findings = lintTemplateSet(
      content({
        templates: {
          a: {
            key: "a",
            unique: true,
            tags: ["x"],
            accepts: ["x"],
            site: { appearByDefault: true, defaultMinDepth: 3 },
          },
        },
      }),
      vocab()
    )
    expect(has(findings, "site-missing-declaration-defaults")).toBe(false)
  })
})
