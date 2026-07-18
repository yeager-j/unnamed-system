import { describe, expect, it } from "vitest"

// @ts-expect-error — depcheck.mjs is a plain JS gate script with no type declarations.
import { scanManifest, scanSource } from "../depcheck.mjs"

describe("replica dependency gate", () => {
  it("rejects an engine import as a negative control", () => {
    const specifier = ["@workspace", "game-v2", "kernel"].join("/")
    const violations = scanSource(
      "index.ts",
      `import { Entity } from "${specifier}"`
    )

    expect(violations).toEqual([
      expect.objectContaining({ file: "index.ts", line: 1, specifier }),
    ])
  })

  it("allows @workspace/result everywhere and react only in react.ts", () => {
    const resultImport = `import { ok } from "@workspace/result"`
    const reactImport = `import { useSyncExternalStore } from "react"`

    expect(scanSource("index.ts", resultImport)).toEqual([])
    expect(scanSource("react.ts", reactImport)).toEqual([])
    expect(scanSource("index.ts", reactImport)).toEqual([
      expect.objectContaining({ specifier: "react" }),
    ])
    expect(scanSource("server.ts", `import next from "next"`)).toEqual([
      expect.objectContaining({ specifier: "next" }),
    ])
  })

  it("rejects manifest dependencies outside the declared boundary", () => {
    expect(
      scanManifest({
        dependencies: { "@workspace/result": "*", zod: "^3" },
        peerDependencies: { react: "^19", ably: "^2" },
        optionalDependencies: { immer: "^11" },
        devDependencies: { vitest: "^4" },
      })
    ).toEqual([
      { field: "dependencies", dependency: "zod" },
      { field: "peerDependencies", dependency: "ably" },
      { field: "optionalDependencies", dependency: "immer" },
    ])
  })
})
