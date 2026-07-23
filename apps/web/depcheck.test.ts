import { describe, expect, it } from "vitest"

import {
  classifyTier,
  deriveModeledVersionFields,
  importClauseIsTypeOnly,
  privateIsolationViolation,
  reconcileAllowlist,
  resolveSpecifier,
  scanDomainPurity,
  scanModeledVersionBumps,
  scanSource,
  scanTierViolations,
  scanVersionWriterImports,
  shouldGateFile,
  tierDirectionViolation,
} from "./depcheck.mjs"

const GAME = "@workspace/game-v2"

describe("web dependency check", () => {
  it("derives modeled columns from the VersionClass authority", () => {
    expect(
      deriveModeledVersionFields(`
        export const VERSION_CLASSES = ["identity", "vitals"] as const
      `)
    ).toEqual(["identityVersion", "vitalsVersion"])
  })

  it("catches a deliberate raw modeled version bump (negative control)", () => {
    const source =
      "await db.update(entity).set({ identityVersion: sql`${entity.identityVersion} + 1` })"

    expect(scanModeledVersionBumps("lib/actions/raw-bump.ts", source)).toEqual([
      {
        file: "lib/actions/raw-bump.ts",
        line: 1,
        field: "identityVersion",
      },
    ])
  })

  it("ignores modeled version names in comments", () => {
    expect(
      scanModeledVersionBumps(
        "lib/actions/example.ts",
        "// identityVersion: sql`${entity.identityVersion} + 1`"
      )
    ).toEqual([])
  })

  it("finds imports that cross the stamped entity-version write seam", () => {
    expect(
      scanVersionWriterImports(
        "lib/actions/example.ts",
        'import { advanceEntityAxisGuarded } from "./entity/version-guard"'
      )
    ).toEqual([
      {
        file: "lib/actions/example.ts",
        line: 1,
        specifier: "./entity/version-guard",
      },
    ])
  })

  it("detects every supported engine import form", () => {
    const source = [
      `import type { Entity } from "${GAME}/kernel/entity"`,
      `export { resolve } from "${GAME}/resolve"`,
      `import "${GAME}/setup"`,
      `const dynamic = import("${GAME}/spatial")`,
      `const required = require("@workspace/game/engine")`,
    ].join("\n")

    expect(scanSource("components/example.tsx", source)).toHaveLength(5)
  })

  it("detects a multiline static import", () => {
    const source = [
      "import {",
      "  Entity,",
      "  ResolvedEntity,",
      `} from "${GAME}/kernel/entity"`,
    ].join("\n")

    expect(scanSource("hooks/example.ts", source)).toEqual([
      {
        file: "hooks/example.ts",
        line: 1,
        specifier: `${GAME}/kernel/entity`,
      },
    ])
  })

  it("ignores comments and unrelated workspace packages", () => {
    const source = [
      `// import { Entity } from "${GAME}/kernel/entity"`,
      `/** import("${GAME}/spatial") */`,
      'import { Button } from "@workspace/ui/components/button"',
      'import { type Result } from "@workspace/result"',
    ].join("\n")

    expect(scanSource("components/example.tsx", source)).toEqual([])
  })

  it("exempts only co-located route access loaders", () => {
    expect(
      shouldGateFile(
        "app/campaigns/[campaignShortId]/dungeon/[shortId]/dungeon-access.ts"
      )
    ).toBe(false)
    expect(
      shouldGateFile(
        "app/campaigns/[campaignShortId]/dungeon/[shortId]/page.tsx"
      )
    ).toBe(true)
    expect(shouldGateFile("components/dungeon-access.ts")).toBe(true)
  })

  it("reports new and stale allowlist entries", () => {
    expect(
      reconcileAllowlist(
        ["components/current.tsx", "hooks/new.ts"],
        ["components/current.tsx", "hooks/stale.ts"]
      )
    ).toMatchObject({
      newViolations: ["hooks/new.ts"],
      staleEntries: ["hooks/stale.ts"],
    })
  })

  it("reports duplicate and unsorted allowlist entries", () => {
    expect(
      reconcileAllowlist(
        ["components/a.tsx", "hooks/b.ts"],
        ["hooks/b.ts", "components/a.tsx", "hooks/b.ts"]
      )
    ).toMatchObject({
      duplicateEntries: ["hooks/b.ts"],
      isSorted: false,
    })
  })
})

describe("tier gate", () => {
  it("classifies the four tiers and treats everything else as ungated", () => {
    expect(classifyTier("app/characters/[shortId]/page.tsx")).toBe("app")
    expect(classifyTier("components/shared/prose.tsx")).toBe("components")
    expect(classifyTier("domain/combat/participant-meta.ts")).toBe("domain")
    expect(classifyTier("lib/db/client.ts")).toBe("lib")
    expect(classifyTier("e2e/join.spec.ts")).toBeNull()
    expect(classifyTier("vitest.config.ts")).toBeNull()
  })

  it("resolves alias + relative specifiers and ignores external packages", () => {
    expect(
      resolveSpecifier("components/shared/x.tsx", "@/domain/combat/y")
    ).toBe("domain/combat/y")
    expect(resolveSpecifier("lib/db/a/b.ts", "../c/d")).toBe("lib/db/c/d")
    expect(
      resolveSpecifier("app/page.tsx", "@workspace/game-v2/resolve")
    ).toBeNull()
    expect(resolveSpecifier("app/page.tsx", "react")).toBeNull()
  })

  it("flags upward imports and allows same-tier / downward ones", () => {
    // kit → app (upward): forbidden
    expect(
      tierDirectionViolation(
        "components/combat/x.tsx",
        "app/characters/[shortId]/_components/y"
      )
    ).toBe(true)
    // lib → domain: peers, allowed
    expect(tierDirectionViolation("lib/actions/x.ts", "domain/combat/y")).toBe(
      false
    )
    // domain → lib: peers, allowed
    expect(tierDirectionViolation("domain/combat/x.ts", "lib/db/y")).toBe(false)
    // domain → components (upward into presentation): forbidden
    expect(
      tierDirectionViolation("domain/combat/x.ts", "components/shared/y")
    ).toBe(true)
    // app → components (downward): allowed
    expect(tierDirectionViolation("app/page.tsx", "components/shared/y")).toBe(
      false
    )
  })

  it("enforces the private-folder ancestry rule", () => {
    const dungeonComponent =
      "app/campaigns/[campaignShortId]/dungeon/[shortId]/_components/combat/body.tsx"
    // a sibling feature reaching into dungeon's _components: forbidden
    expect(
      privateIsolationViolation(
        "app/campaigns/[campaignShortId]/encounter/[shortId]/_components/x.tsx",
        dungeonComponent
      )
    ).toBe(true)
    // a shared parent's _components: allowed for a descendant feature
    expect(
      privateIsolationViolation(
        "app/campaigns/[campaignShortId]/dungeon/[shortId]/page.tsx",
        "app/campaigns/_components/campaign-card.tsx"
      )
    ).toBe(false)
    // within the same private folder: allowed
    expect(
      privateIsolationViolation(
        "app/campaigns/[campaignShortId]/dungeon/[shortId]/_components/watch.tsx",
        dungeonComponent
      )
    ).toBe(false)
  })

  it("catches a deliberate cross-feature import (scanTierViolations)", () => {
    const source = `import { X } from "@/app/campaigns/[campaignShortId]/dungeon/[shortId]/_components/combat/body"`
    const found = scanTierViolations(
      "app/campaigns/[campaignShortId]/encounter/[shortId]/_components/y.tsx",
      source
    )
    expect(found).toHaveLength(1)
    expect(found[0]).toMatchObject({ kind: "isolation" })
  })

  it("catches a deliberate upward tier import (scanTierViolations)", () => {
    const source = `import { X } from "@/app/characters/[shortId]/page"`
    const found = scanTierViolations("lib/db/x.ts", source)
    expect(found).toHaveLength(1)
    expect(found[0]).toMatchObject({ kind: "direction" })
  })

  it("stays silent on legal downward + peer imports", () => {
    const source = [
      `import { a } from "@/domain/combat/view/roster-view"`,
      `import { b } from "@/lib/db/client"`,
      `import { c } from "@/components/shared/prose"`,
    ].join("\n")
    expect(
      scanTierViolations("app/characters/[shortId]/page.tsx", source)
    ).toEqual([])
  })
})

describe("domain purity", () => {
  const pureView = "domain/combat/view/roster-view.ts"

  it("distinguishes type-only from runtime import clauses", () => {
    expect(importClauseIsTypeOnly(" type { X } ")).toBe(true) // import type { X }
    expect(importClauseIsTypeOnly(" { type X } ")).toBe(true) // all inline-type → elided
    expect(importClauseIsTypeOnly(" { type X, y } ")).toBe(false) // y is a value
    expect(importClauseIsTypeOnly(" { X } ")).toBe(false)
    expect(importClauseIsTypeOnly(" Foo ")).toBe(false) // default value
    expect(importClauseIsTypeOnly(" Foo, { type X } ")).toBe(false) // default value + inline type
  })

  it("flags a pure view file runtime-importing lib", () => {
    const found = scanDomainPurity(
      pureView,
      `import { loadThing } from "@/lib/db/queries/thing"`
    )
    expect(found).toHaveLength(1)
    expect(found[0]).toMatchObject({ kind: "purity" })
  })

  it("exempts import type and inline-type-only", () => {
    const source = [
      `import type { Row } from "@/lib/db/schema/thing"`,
      `import { type Only } from "@/lib/db/schema/other"`,
    ].join("\n")
    expect(scanDomainPurity(pureView, source)).toEqual([])
  })

  it("counts a mixed import with any value specifier", () => {
    const found = scanDomainPurity(
      pureView,
      `import { type Row, loadThing } from "@/lib/db/queries/thing"`
    )
    expect(found).toHaveLength(1)
  })

  it("exempts marked-impure files (use-*, load-*, bare load) and non-domain files", () => {
    const libImport = `import { x } from "@/lib/db/client"`
    expect(
      scanDomainPurity("domain/character/use-character-root.ts", libImport)
    ).toEqual([])
    expect(
      scanDomainPurity("domain/combat/load-encounter-for-dm.ts", libImport)
    ).toEqual([])
    expect(scanDomainPurity("domain/character/load.ts", libImport)).toEqual([])
    expect(
      scanDomainPurity("domain/combat/view/roster-view.test.ts", libImport)
    ).toEqual([])
    // not a domain file — the rule doesn't apply
    expect(
      scanDomainPurity("app/characters/[shortId]/page.tsx", libImport)
    ).toEqual([])
  })

  it("flags a side-effect and a dynamic lib import from a pure file", () => {
    expect(
      scanDomainPurity(pureView, `import "@/lib/db/side-effect"`)
    ).toHaveLength(1)
    expect(
      scanDomainPurity(pureView, `const m = import("@/lib/db/queries/thing")`)
    ).toHaveLength(1)
  })
})
