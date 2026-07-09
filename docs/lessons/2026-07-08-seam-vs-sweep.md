# 2026-07-08 — A locally-rational import rule priced at swap time

**Symptom:** a change that should have been one line (swap which package
supplies a function) turned into a week-long file-by-file sweep — and every
individual import that caused it had looked correct when written.

**Context:** the UNN-540 engine cutover. Files behind a seam
(`@/lib/game-engine`, `lib/*/view` builders) flipped for one line; ~200 files
importing `@workspace/game*` directly — under the "pure no-deps helpers are
imported straight from barrels" rule — each re-decided "which engine" and had
to be swept by hand. Even type-only imports pin a file to a package name.

**Principle:** a per-call-site convention whose cost is deferred and
aggregated is a decision multiplied, not decided (→ Code Style #9, Meyer's
Single Choice; Parnas 1972 — a module is the hiding place of one decision).
The rule wasn't wrong; it was missing a *who* clause: `lib/**` is the seam
layer, only it may name engine packages. Indirection that encodes a decision
point is load-bearing, not vestigial — the test is whether deleting it fans
a decision out across call sites.

**Action:** UNN-582 (ratcheting apps/web depcheck gate + the amendment
deciding the conventions inside the perimeter); UNN-583 remains the
shape-seam counterpart.
