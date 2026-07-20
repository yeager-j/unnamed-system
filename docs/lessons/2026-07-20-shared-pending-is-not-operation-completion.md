# 2026-07-20 — Shared pending state impersonated operation completion

**Symptom:** a dedicated `useTransition` stayed pending after its refresh request finished because another async optimistic Action was intentionally held open.

**Context:** UNN-666's Headcanon refresh coordinator needed to count completed refresh attempts while accepted predictions remained mounted; using the hook's pending-to-settled edge left the retry and stall states unreachable.

**Position:** `if (wasPending && !isPending) completeRefresh()` looked operation-local, but React 19 entangled the overlapping async Actions. The coordinator instead completes from the refresh adapter's own request lifetime.

**Principle:** aggregate framework status is not evidence that one operation completed. Home completion on the operation whose lifetime it describes (→ Code Style #10, Home state according to lifetime).

**Action:** kept a dedicated refresh transition for scheduling, used adapter completion for the two-attempt budget, and retained a predicted-root contract proving refresh can stall while its optimistic Action remains open.
