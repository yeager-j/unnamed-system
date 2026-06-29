import { describe, expect, it } from "vitest"

// @ts-expect-error — depcheck.mjs is a plain JS gate script with no type decls.
import { scanSource } from "../../depcheck.mjs"

/**
 * Built by substitution so the literal `from "@workspace/game"` never appears in
 * this file's source — otherwise the real gate (which scans every `src/**` `.ts`,
 * this test included) would flag its own fixtures. The interpolated value reaches
 * `scanSource` at runtime all the same.
 */
const V1 = "@workspace/game"

describe("depcheck gate (scanSource)", () => {
  it("catches a single-line forbidden import", () => {
    const violations = scanSource(
      "vitals/x.ts",
      `import { Foo } from "${V1}"\n`
    )
    expect(violations).toHaveLength(1)
    expect(violations[0].specifier).toBe(V1)
  })

  it("catches a multi-line / Prettier-wrapped grouped import (the headline evasion)", () => {
    const source = [
      "import {",
      "  HydratedCharacter,",
      "  CombatantRef,",
      "  Statblock,",
      `} from "${V1}"`,
      "",
    ].join("\n")
    const violations = scanSource("vitals/x.ts", source)
    expect(violations).toHaveLength(1)
    expect(violations[0].specifier).toBe(V1)
    expect(violations[0].line).toBe(1)
  })

  it("catches a re-export and a subpath import", () => {
    expect(
      scanSource("x.ts", `export { Foo } from "${V1}/foundation"`)
    ).toHaveLength(1)
    expect(scanSource("x.ts", `import("${V1}/data")`)).toHaveLength(1)
  })

  it("ignores the package's own @workspace/game-v2 imports", () => {
    const source = `import { Entity } from "@workspace/game-v2/kernel/entity"\n`
    expect(scanSource("vitals/x.ts", source)).toHaveLength(0)
  })

  it("does not flag a forbidden specifier that only appears in a comment", () => {
    const source = [
      "/**",
      ` * Historically this re-exported from "${V1}".`,
      " */",
      `// import { Foo } from "${V1}"`,
      "export const x = 1",
      "",
    ].join("\n")
    expect(scanSource("x.ts", source)).toHaveLength(0)
  })

  it("flags a catalog value-import from a logic file but allows it in composition.ts", () => {
    const catalogImport = `import { gameData } from "@workspace/game-v2/catalog"\n`
    expect(scanSource("vitals/x.ts", catalogImport)).toHaveLength(1)
    expect(scanSource("composition.ts", catalogImport)).toHaveLength(0)
    expect(scanSource("catalog/index.ts", catalogImport)).toHaveLength(0)
  })

  it("forbids spatial → encounter/combat/visibility — the one-way seam (SD2)", () => {
    expect(
      scanSource(
        "spatial/reduce-map-instance.ts",
        `import { Engagement } from "@workspace/game-v2/encounter/instance"\n`
      )
    ).toHaveLength(1)
    expect(
      scanSource(
        "spatial/selectors.ts",
        `import { resolveAttack } from "@workspace/game-v2/combat"\n`
      )
    ).toHaveLength(1)
    expect(
      scanSource(
        "spatial/reveal.ts",
        `import { redact } from "@workspace/game-v2/visibility/snapshot"\n`
      )
    ).toHaveLength(1)
  })

  it("allows spatial → kernel + mechanics (down the gradient)", () => {
    expect(
      scanSource(
        "spatial/map-instance.schema.ts",
        `import { zoneEnchantmentSchema } from "@workspace/game-v2/mechanics/zone-enchantment.schema"\n`
      )
    ).toHaveLength(0)
    expect(
      scanSource(
        "spatial/map-instance.schema.ts",
        `import { engagementSchema } from "@workspace/game-v2/kernel/vocab/engagement"\n`
      )
    ).toHaveLength(0)
  })

  it("allows encounter → spatial — the seam is asymmetric (one-way)", () => {
    expect(
      scanSource(
        "encounter/reduce-encounter.ts",
        `import { reduceMapInstance } from "@workspace/game-v2/spatial"\n`
      )
    ).toHaveLength(0)
  })

  it("forbids spatial → sealed domains via relative traversal (the intra-package escape hatch)", () => {
    expect(
      scanSource(
        "spatial/reduce-map-instance.ts",
        `import { Engagement } from "../encounter/instance"\n`
      )
    ).toHaveLength(1)
    expect(
      scanSource(
        "spatial/sub/deep.ts",
        `import { x } from "../../combat/attack-roll"\n`
      )
    ).toHaveLength(1)
  })

  it("allows spatial's own relative imports + relative down-gradient to mechanics", () => {
    expect(
      scanSource(
        "spatial/map-instance.schema.ts",
        `import { mapGeometrySchema } from "./geometry.schema"\n`
      )
    ).toHaveLength(0)
    expect(
      scanSource(
        "spatial/foo.ts",
        `import { zoneEnchantmentSchema } from "../mechanics/zone-enchantment.schema"\n`
      )
    ).toHaveLength(0)
  })
})
