# 2026-07-15 — "It's type-only, it erases at build" used to justify a cross-tier import

**Symptom:** while homing a shared type or DTO, I picked the convenient tier and
justified it with "the import is type-only, so it creates no runtime coupling" —
without reading the gate that polices that boundary. It felt like a freebie;
it was a design decision smuggled past the architecture.

**Context:** the dungeon visual-overhaul technical design (Dungeons v2,
UNN-630..635). Two adversarial review rounds each caught one instance: first
`components/shared/canvas/footprints.ts` importing `type MapZoneSize` from the
engine ("kit-tier legal" — false: the engine gate's `IMPORT_PATTERNS` match all
imports; only the *domain-purity* scan exempts type-only), then the "fix" of
kit-owned DTO types consumed by domain builders (false again: `scanTierViolations`
has no type-only carve-out at all). Cost: two doc revisions + a ticket-update pass.

**Position:**

```ts
// components/shared/canvas/footprints.ts  (type-only engine import — kit-tier legal)  ← the smell is the justification in the comment
import type { MapZoneSize } from "@workspace/game-v2/spatial"
```

Fix shape: home the vocabulary where the gradient serves every consumer —
`domain/map/view/` aliases the engine enum (`export type ZoneSize = MapZoneSize`);
the kit imports downward, `lib` reaches it as a peer. The parallel-union +
correspondence-assertion machinery dissolved once the type lived in the right home.

**Principle:** type dependencies are coupling — a module's connections are the
assumptions it makes about others (Parnas 1971), and a type is an assumption
regardless of build-time erasure; this repo's gates deliberately encode that.
Corollary: before designing a seam around a gate, read the gate's scanner — the
enforcement defines legality, not your mental model of it. (→ Code Style #8's
world: the gate *is* the contract; #10's diagnostic fired too — the correspondence
assertions "feeling bad" flagged a wrong home, and the right home deleted them.)

**Action:** technical-design revised (§0, D2, D3, §4 drift-log #1); UNN-630/631/633
ACs now pin "no `domain → components` imports (the direction gate flags type-only
too)"; no new allowlist entries.
