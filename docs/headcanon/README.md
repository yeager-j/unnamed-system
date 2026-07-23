# Headcanon

**Status:** Implemented workspace migration; publication decision pending<br>
**Started:** 2026-07-20

> **headcanon — optimistic mutations for Next.js: believe your writes until
> canon says otherwise.**

## Purpose

Showtime already uses the central idea behind Zero: a serializable intent runs
through the same deterministic transition on an optimistic client frame and on
authoritative server state. The useful spike is therefore not “can Zero make a
write feel instant?” It already does. The useful question is:

> Which protocol and interface decisions did Zero make around that idea, why,
> and which of them should Showtime adopt without adopting Zero?

This folder contains the factual baselines, historical design record, independent
assessments, and rollout evidence:

1. [Zero's current interface and stealable decisions](./zero-interface.md) — a
   primary-source survey of Zero 1.x, including corrections to assumptions based
   on older Zero APIs.
2. [Showtime's pre-Headcanon entity read/write architecture](./current-architecture.md)
   — the historical implementation snapshot, its authorities, guarantees, and
   deliberate limitations before the migration.
3. [Headcanon: optimistic mutations for React and Next.js](./technical-design.md)
   — a technical design for a Zero-like mutation package built around
   server-authoritative rebase, global storage-owned revision axes, complete
   versioned canons, and invalidation-only realtime.
4. [Deep technical-design assessment](./deep-review-outcome.md) — the
   multi-agent stress test, contraction ledger, implementation risks, and
   amendments incorporated into revision 4.
5. [Deletion ledger](./deletion-ledger.md) — what each Showtime cutover
   _measurably_ removed from `apps/web`, phase by phase. The design's
   application contraction gate is decided here, against measurements rather
   than the estimates in (4).
6. [P2g mutation-seam investigation](./mutation-seam-investigation.md) — the
   Phase 2 marginal-integration evidence, three authority-registration options,
   implemented command-manifest prototype, falsification results, and `go`
   decision for Phase 3.

## Implemented outcome

The `@workspace/headcanon` package and its registered Showtime mutation commands
are implemented in the workspace. Headcanon owns mutation protocol, receipts,
contention retries, revision stamps, accepted-stamp finalization, and axis
invalidation. The application owns trusted actor and authorization checks,
domain operations, storage homes, projections, and lock order. The [deletion
ledger](./deletion-ledger.md) records the application coordination removed by the
cutover.

The documents below retain the research and design history that led to this
implementation. They are not current repository instructions; use the package,
application guidance, and this outcome summary for current behavior.

The [original framework-independent replica proposal](./OLD-replica-module-design.md)
is retained as historical input. The implemented package keeps its
mutation-protocol ideas but replaces its generic read transport and view-scoped
version model.

## Working thesis

Adopting Zero is currently a likely no-go, not a decided no-go.

The adoption case must overcome all of the following:

- Showtime already has instant, server-authoritative entity writes.
- Current Zero does **not** support offline writes after the connection becomes
  disconnected; it only queues during the initial/short-glitch `connecting`
  state.
- `zero-cache` is a stateful service with a SQLite replica, persistent metadata,
  and a logical-replication connection to Postgres.
- An active logical replication subscriber prevents a Neon compute from scaling
  to zero.
- Zero's React integration is client-first and SSR remains roadmap work, while
  Showtime's read authority is an RSC load-and-project path.
- Zero currently controls client visibility at table/row granularity and ZQL
  returns whole rows. Showtime's public dungeon view is a server-projected,
  field-redacted view of one `mapInstance.state` JSON row.
- The main incremental benefits—reactive fine-grained reads and shared client
  state across tabs—need to justify a second data plane and its operational
  constraints for this product.

None of those claims means there is nothing to learn. The opposite is the point
of the spike: Zero has productized mutation queuing, reconciliation, query
completeness, connection state, cross-tab client grouping, and operational
inspection. Those are decisions we can examine independently of its runtime.

## Guardrails

- Separate current documented facts from inference.
- Prefer current Zero and provider documentation over old blog posts or old API
  names.
- Treat Showtime's code and executable tests as the authority for its present
  architecture; older ADRs explain intent but can lag implementation.
- Do not add Zero or a client cache. Implement the proposed package only as an
  explicitly bounded, falsifiable spike.
- Do not flatten the comparison to feature parity. The important unit is a
  decision: authority, ordering, acknowledgement, reconciliation, permissions,
  or failure recovery.
