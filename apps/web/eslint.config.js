import { nextJsConfig } from "@workspace/eslint-config/next-js"

/** @type {import("eslint").Linter.Config} */
export default [
  ...nextJsConfig,
  {
    // The router-only session-event constructors (`toSessionEvent` and
    // siblings) are deliberately omitted from the engine barrel; their last
    // sanctioned deep-path importer (the write-router's commit module,
    // UNN-520/CD19) retired with the storage-native encounter root (UNN-655),
    // so no app file may deep-import them now. Honest caveat: the shared
    // config's `only-warn` downgrades this to a warning — it is a tripwire,
    // not a wall; the real containment is the barrel omission + the generic
    // wire's schema exclusion + the contract tests.
    files: ["**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@workspace/game-v2/encounter/session-event",
              message:
                "Router-only constructors: import only inside lib/actions/combat/commit/ (UNN-520, CD19).",
            },
          ],
        },
      ],
    },
  },
]
