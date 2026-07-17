import { describe, expect, it } from "vitest"

// @ts-expect-error — depcheck.mjs is a plain JS gate script with no type declarations.
import { scanManifest, scanSource } from "../depcheck.mjs"

describe("result dependency gate", () => {
  it("rejects an engine import as a negative control", () => {
    const specifier = ["@workspace", "game-v2", "kernel"].join("/")
    const violations = scanSource(
      "index.ts",
      `import { Entity } from "${specifier}"`
    )

    expect(violations).toEqual([
      expect.objectContaining({
        file: "index.ts",
        line: 1,
        specifier,
      }),
    ])
  })

  it("allows relative imports and ignores imports in comments", () => {
    const source = [
      `import { local } from "./local"`,
      `// import { Entity } from "@workspace/game-v2/kernel"`,
    ].join("\n")

    expect(scanSource("index.ts", source)).toEqual([])
  })

  it("rejects every runtime dependency field", () => {
    expect(
      scanManifest({
        dependencies: { react: "latest" },
        peerDependencies: { typescript: "latest" },
        optionalDependencies: { zod: "latest" },
        devDependencies: { vitest: "latest" },
      })
    ).toEqual([
      { field: "dependencies", dependency: "react" },
      { field: "peerDependencies", dependency: "typescript" },
      { field: "optionalDependencies", dependency: "zod" },
    ])
  })
})
