# 2026-07-18 — The deduplicated channel that was also the wake-up call

**Symptom:** a consumer parked itself waiting for evidence of recovery, and the
test hung — the evidence was supposed to arrive on a channel that deliberately
suppresses duplicates, so an *unchanged* world produced silence
indistinguishable from a dead connection. Every component was individually
correct: the gate rightly dropped the duplicate, the replica rightly waited.

**Context:** UNN-639 (PR #382). The replica self-disconnects on retry-budget
exhaustion and resumes on transport evidence; the alien polling adapter's
causal gate suppresses unchanged snapshots; the reconnect law timed out.
Caught only because the design demanded a second, unlike binding.

**Position:** the transition-guarded health report — fresh evidence folded
into an edge-triggered signal:

```ts
const reportConnected = () => {
  if (active && healthy !== true) {   // ← transition guard starves the parked replica
    healthy = true
    sink.setConnection("connected")
  }
}
```

Fix: report `connected` on **every** successful pull (level-triggered; the
replica treats repeats as no-ops), and let an arriving accepted snapshot count
as recovery evidence when the replica, not the transport, declared the outage.

**Principle:** liveness must ride a level-triggered signal; a channel that
deduplicates its payloads cannot double as a wake-up call, because
deduplication erases exactly the "still alive, nothing new" message a parked
consumer needs. (Lineage: level- vs edge-triggered semantics — hardware
interrupts, Kubernetes' level-based reconciliation; kin to
[[2026-07-09-emptiness-is-not-absence]] — "no change" and "no signal" are
different facts.)

**Action:** `createPollingTransport`/`createEntityReplicaTransport` report
connected unconditionally on pull success (documented inline); the replica's
`selfDisconnected` flag distinguishes replica-declared from transport-declared
outages; the reconnect law in `verifyReplicaContract` now pins the behavior.
