@AGENTS.md

## Engine import seam

- Only `lib/**` may import `@workspace/game*`; `components/**`, `hooks/**`, and route UI under `app/**` are hard-gated by `depcheck.mjs`.
- Co-located `app/**/*-access.ts` route loaders are the sole app-directory exemption because they are seam-layer code.
- Existing violations live in `depcheck-allowlist.mjs`. Remove an entry in the same change that removes its final engine import; the gate rejects stale entries and new violations.
