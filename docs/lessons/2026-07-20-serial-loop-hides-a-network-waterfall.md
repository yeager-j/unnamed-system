# 2026-07-20 — A serial loop hides a network waterfall

**Symptom:** a loop looked locally linear and safe, but each iteration awaited an independent remote operation before the next one could start.

**Context:** UNN-671 could attach up to 128 newly authorized Ably axis channels serially, multiplying one attachment latency by the size of a combat view.

**Position:** `for (const channel of added) { await channel.subscribe(); await channel.attach() }` became `await Promise.allSettled(added.map(attachChannel))`, followed by one aggregate status decision.

**Principle:** use fork-join structured concurrency for independent remote work: start siblings together, join every outcome, then derive collective state once.

**Action:** the Ably adapter now attaches added channels concurrently, retains successful attachments for retry, and reports `active` only when the full authorized set is attached.
