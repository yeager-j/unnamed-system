# 2026-07-20 — The wrapper hid the failure identity

**Symptom:** a retry classifier handled PostgreSQL SQLSTATEs in direct error
objects, but a real serialization failure escaped because the ORM wrapped the
driver error and placed the SQLSTATE on `cause`.

**Context:** UNN-670's real-Postgres authority contract went red on server-raised
`40001`; the first implementation traversed only plain records, while both
wrappers in the causal chain were `Error` instances.

**Position:** `while (isPlainRecord(current)) current = current.cause` excluded
the standard object type most likely to carry a cause. The fix walks any
non-null object with cycle protection and reads `code` at every level.

**Principle:** classify failures at the boundary from the complete causal chain;
wrapping changes representation, not failure identity (parse-don't-validate).

**Action:** fixed `drizzle.ts` and retained the real SQLSTATE regression test.
