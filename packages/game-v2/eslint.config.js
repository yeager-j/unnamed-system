import { config } from "@workspace/eslint-config/base"

/**
 * @type {import("eslint").Linter.Config}
 *
 * The **purity-gradient** dependency rules for `@workspace/game-v2` (UNN-499,
 * D33). These mirror v1's `engine`/`foundation` import bans, but note: the shared
 * base config runs `eslint-plugin-only-warn`, which downgrades every rule to a
 * *warning*. So these rules are **editor-time signal only** — the enforced gate
 * for the two load-bearing rules (no `@workspace/game`; logic never value-imports
 * `catalog/`) is the standalone `depcheck.mjs` script (`npm run depcheck`). The
 * finer schema-purity rule below has no script counterpart; it stays a warning.
 *
 * The gradient (D33): `logic → schema → vocab`, `logic → ports`, never concrete
 * `catalog/`. `kernel/` is the dependency sink — it owns `Entity`/`Has`/`guard`
 * that every domain depends on, so it must not import a domain folder. The two
 * grow-points (`component-registry.ts` adds a component key, `ports.ts` adds a
 * lookup) are the sanctioned exceptions: they type-import domain shapes to *name*
 * them, exactly as v1's `engine/ports.ts` type-imports foundation types.
 */
const DOMAIN_FOLDERS = [
  "vitals",
  "attributes",
  "affinities",
  "progression",
  "archetypes",
  "skills",
  "items",
  "mechanics",
  "combat",
  "encounter",
  "visibility",
]

export default [
  ...config,
  {
    // The root-level build scripts/config (`depcheck.mjs`, `*.conf.mjs`) run on
    // Node, so give them the Node globals the linter otherwise flags as undefined.
    files: ["*.mjs"],
    languageOptions: {
      globals: { URL: "readonly", console: "readonly", process: "readonly" },
    },
  },
  {
    // Independence (D32): nothing in v2 imports v1. Enforced by depcheck.mjs.
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@workspace/game", "@workspace/game/*"],
              message:
                "game-v2 is independent (D32) — it must not import v1 @workspace/game, even type-only. Re-declare the vocab/type in v2.",
            },
          ],
        },
      ],
    },
  },
  {
    // Logic must not value-import the concrete catalog — inject via kernel/ports.
    // Only the catalog implementation and the composition root may name it.
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/catalog/**", "src/composition.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@workspace/game", "@workspace/game/*"],
              message:
                "game-v2 is independent (D32) — it must not import v1 @workspace/game, even type-only.",
            },
            {
              group: [
                "@workspace/game-v2/catalog",
                "@workspace/game-v2/catalog/*",
              ],
              allowTypeImports: true,
              message:
                "logic must not value-import the catalog (D33) — inject the GameData port from kernel/ports at the composition boundary; type-only imports are allowed.",
            },
          ],
        },
      ],
    },
  },
  {
    // Schemas are pure shapes: `*.schema.ts` may import vocab + other schemas, but
    // not the ports or catalog (the `logic → schema → vocab` direction, D33).
    files: ["src/**/*.schema.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@workspace/game", "@workspace/game/*"],
              message: "game-v2 is independent (D32).",
            },
            {
              group: [
                "@workspace/game-v2/kernel/ports",
                "@workspace/game-v2/catalog",
                "@workspace/game-v2/catalog/*",
              ],
              message:
                "a *.schema.ts is a pure shape (D33) — it must not import ports or the catalog. Keep the dependency direction logic → schema → vocab.",
            },
          ],
        },
      ],
    },
  },
  {
    // kernel/ is the dependency sink: it must not import a domain folder. The
    // three grow-points name domain shapes to converge them — they are where
    // "knows every component" lives: component-registry (the authored type map),
    // ports (the catalog lookups), and load-seam (the total Zod schema map, F6).
    files: ["src/kernel/**/*.{ts,tsx}"],
    ignores: [
      "src/kernel/component-registry.ts",
      "src/kernel/ports.ts",
      "src/kernel/load-seam.ts",
      "src/kernel/**/*.test.ts",
      "src/kernel/**/__fixtures__/**",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@workspace/game", "@workspace/game/*"],
              message: "game-v2 is independent (D32).",
            },
            {
              group: DOMAIN_FOLDERS.flatMap((d) => [
                `@workspace/game-v2/${d}`,
                `@workspace/game-v2/${d}/*`,
              ]),
              message:
                "kernel is the dependency sink (D33) — it must not import a domain folder. Only component-registry.ts and ports.ts may type-import a domain shape to name it.",
            },
          ],
        },
      ],
    },
  },
]
