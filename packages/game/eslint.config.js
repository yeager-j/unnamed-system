import { config } from "@workspace/eslint-config/base"

/**
 * @type {import("eslint").Linter.Config}
 *
 * The engine layer must not **value-import** the data layer (UNN-354): catalog
 * access is injected as a lookup port (`engine/ports`) at the assembly boundary,
 * which `data/game-data` implements. Type-only imports across the boundary are
 * free (erased), so they stay allowed. Tests and `__fixtures__` legitimately
 * pull real catalog data, so they're exempt.
 */
export default [
  ...config,
  {
    files: ["src/engine/**/*.{ts,tsx}"],
    ignores: ["src/engine/**/*.test.ts", "src/engine/**/__fixtures__/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@workspace/game/data", "@workspace/game/data/*"],
              allowTypeImports: true,
              message:
                "engine must not value-import the data layer (UNN-354) — inject a lookup port from engine/ports at the boundary; type-only imports are allowed.",
            },
          ],
        },
      ],
    },
  },
]
