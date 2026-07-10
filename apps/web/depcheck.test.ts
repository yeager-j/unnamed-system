import { describe, expect, it } from "vitest"

import { reconcileAllowlist, scanSource, shouldGateFile } from "./depcheck.mjs"

const GAME = "@workspace/game-v2"

describe("web dependency check", () => {
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
    ].join("\n")

    expect(scanSource("components/example.tsx", source)).toEqual([])
  })

  it("exempts only co-located route access loaders", () => {
    expect(shouldGateFile("app/combat/[shortId]/encounter-access.ts")).toBe(
      false
    )
    expect(shouldGateFile("app/combat/[shortId]/page.tsx")).toBe(true)
    expect(shouldGateFile("components/encounter-access.ts")).toBe(true)
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
