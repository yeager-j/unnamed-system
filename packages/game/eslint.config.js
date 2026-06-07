import { config } from "@workspace/eslint-config/base"

/**
 * @type {import("eslint").Linter.Config}
 *
 * The engine layer must not **value-import** the data layer (UNN-354): catalog
 * access is injected as a lookup port (`engine/ports`) at the assembly boundary,
 * which `data/game-data` implements. Type-only imports across the boundary are
 * free (erased), so they stay allowed. Tests and `__fixtures__` legitimately
 * pull real catalog data, so they're exempt.
 *
 * The foundation layer is the dependency sink: it must not import the engine
 * layer at all — not even type-only (UNN-359). A type the engine computes but
 * that foundation needs (e.g. `HydratedCharacter`, `StatContext`, the resolved
 * value types) is defined in foundation and imported *down* by the engine.
 * (Foundation's residual type-only edges into `data` — `SkillKey`/`WeaponKey` —
 * are a separate follow-up and not guarded here yet.)
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
  {
    files: ["src/foundation/**/*.{ts,tsx}"],
    ignores: ["src/foundation/**/*.test.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@workspace/game/engine", "@workspace/game/engine/*"],
              message:
                "foundation is the dependency sink — it must not import the engine layer, even type-only (UNN-359). Define the type in foundation; engine imports it down.",
            },
          ],
        },
      ],
    },
  },
]
