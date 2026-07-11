# 2026-07-11 — The sort comparator was part of the equality contract

**Symptom:** a fold documented as "deterministic: entries are sorted" quietly
depended on *which* order the sort produced — and the comparator was
`localeCompare`, whose collation can return 0 for distinct strings, letting a
stable sort leak Map insertion order into a string two loads must compare
equal.

**Context:** UNN-602, `apps/web/domain/combat/snapshot-version.ts`. Writing
the injectivity law forced reading the fold adversarially and found this
second, unsuspected bug in the same line.

**Position:** `.sort(([a], [b]) => a.localeCompare(b))` feeding
`foldSnapshotVersion`'s compare-only string. Fix: code-unit comparator
(`a < b ? -1 : a > b ? 1 : 0`).

**Principle:** collation is for human eyeballs; when a sort feeds an equality
or encoding contract rather than a rendered list, the comparator must be a
total, environment-independent order — it is part of the contract, not a
presentation detail (→ Code Style #8's ladder: the determinism law now pins
it; kin to "canonicalize before you hash").

**Action:** fixed in UNN-602 (PR #322) with a quantified determinism law over
hostile ids. Remaining `localeCompare` uses audited: all display ordering,
correctly locale-aware.
