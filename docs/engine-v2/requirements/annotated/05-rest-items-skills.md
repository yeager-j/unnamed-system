# 05 — Rest, Items/Skills — PRESERVE/SUPERSEDE/GAP annotation

Annotation of `requirements/05-rest-items-skills.md` against decision-log
D1–D23 + the O1 component catalog. Each requirement is tagged
**PRESERVE** (v2 must reproduce the rule exactly), **SUPERSEDE** (a decision
deliberately changes the behavior — cite the D-number), or **GAP** (design is
silent or can't express it).

Recurring theme: the **numeric/comparator/clamp rules are PRESERVE** (D15 says so
explicitly), but several rest-engine requirements are also **partial
SUPERSEDE on their write target** — D9 changes "write `currentHP`" to "write
`damage`". They are flagged PRESERVE (rule) + a SUPERSEDE note (storage shape).
The biggest finding is that the **mutation-engine homing** (where equip-swap /
stacking / cost-asymmetry operations live) is **never named** by any decision —
D10 establishes *that* operations own their clamps, but no D/component declares
*the operation set itself* as a v2 module. That is a structural GAP cluster, not
a per-rule one.

---

## A. Rest

| Req | Tag | D / component | Notes |
|---|---|---|---|
| **A1** Full Rest restores all pools to max | PRESERVE + SUPERSEDE | D9 (storage), D8 (max from resolve) | Rule preserved: full restore. SUPERSEDE: v1 writes `currentHP→maxHP`; v2 writes **`damage = 0`** and `spSpent = 0` (D9 — current is derived). "restore to max" = "set depletion to 0". maxHP/maxSP come from `resolve` (D8), not a `RestingCharacter` re-derive. Hit Dice / Skill Dice / prismaCharges have **no component home** — see GAP note below. |
| **A2** Full Rest −1 exhaustion, floor 0 | PRESERVE | — (no component) | `Math.max(0, exhaustion−1)` is a rule to keep verbatim. **GAP on home:** no component in O1 carries `exhaustion`. Not Vitals (that's `damage`), not StatProfile. Exhaustion is durable per-entity state surviving combat → needs an entity field or component v2 never names. |
| **A3** Partial Rest: HP→max, spend Skill Dice, clamped SP add | PRESERVE + SUPERSEDE | D9 (storage), D10 (clamp owner) | Rule preserved: `currentSP → min(maxSP, currentSP+spRecovered)`, Skill Dice decrement, Hit Dice + Exhaustion untouched. SUPERSEDE: HP-to-max = `damage=0`; the SP `min`-clamp is exactly D10's "operation owns its bound". **GAP:** Skill Dice pool has no component. |
| **A4** Partial Rest failure matrix (`spent<0 OR spent>remaining`, strict `>`) | PRESERVE | — (no component) | Strict-`>` over-spend boundary + zero-spend-when-zero success is a comparator rule to preserve exactly. No decision contradicts. **GAP on home:** Skill Dice remaining is unmodeled. |
| **A5** Respite: clamped HP add, spend Hit Dice | PRESERVE + SUPERSEDE | D9 (storage), D10 (clamp) | Rule preserved: `min(maxHP, currentHP+hpRecovered)` + Hit Dice decrement; SP + Exhaustion untouched. SUPERSEDE: writing HP becomes writing `damage` (D9) — `min(maxHP,...)` clamp = floor `damage` at 0 (D10). **GAP:** Hit Dice has no component. |
| **A6** Respite failure matrix (strict `>`) | PRESERVE | — | Same comparator shape as A4. Preserve. GAP on Hit Dice home. |
| **A7** Spent dice regained only at Full Rest | PRESERVE | — (no component) | Cross-function invariant to preserve. **GAP:** entire Hit Dice / Skill Dice pool model is absent from O1 — v2 cannot express this without a dice-pool component. |
| **A8** Rest input schemas: non-negative ints | PRESERVE | D2 (Zod-first carryover) | Zod-schema-first discipline is an explicit carry-over (D2). Preserve the `int().nonnegative()` constraints. |

---

## B. Exhaustion

| Req | Tag | D / component | Notes |
|---|---|---|---|
| **B1** `getExhaustionLevel` clamp+`trunc` before lookup | PRESERVE | — (data lookup) | `max(0, min(6, trunc(level)))` — `trunc` not floor — is a rule to keep verbatim. Pure catalog lookup; D2 carries over the data-catalog pattern. No decision touches it. |
| **B2** Table 0–6, every entry non-empty description | PRESERVE | D2 (data catalog) | Authored-truth catalog (D2 carry-over). Schema bounds preserved. |
| **B3** Levels 1–6 are placeholders (data TODO) | PRESERVE | D14 (named non-goal) | D14 explicitly lists "exhaustion levels 1–6 are placeholder text (rulebook table unshipped)" as an **inherited non-goal** — don't "fix" in v2. Preserve placeholders. |

---

## C. Item Equip / Unequip

| Req | Tag | D / component | Notes |
|---|---|---|---|
| **C1** `equipItem` single-slot swap (auto-unequip same slot) | PRESERVE (rule) — **GAP (home)** | Equipment component (O1) exists; **mutation behavior unhomed** | The one-equipped-per-slot swap is a rule to preserve. But O1's Equipment component is `{ slots/items }` *storage*; **no decision homes the equip-swap algorithm**. D10 ("operations own bounds") is about HP clamps, not item ops. The mutation engine (`items/utils.ts` equip/unequip/add/setQty/remove + `mutate.ts` router) has **no v2 module named anywhere**. Flagged GAP. |
| **C2** `equipItem` failure codes (`item-not-found`, `catalog-item-unknown`) | PRESERVE — **GAP (home)** | — | Error semantics to preserve (incl. non-equippable consumable → unknown). No decision addresses the item-error union or catalog-slot lookup (`getEquippableItem`). Same mutation-engine GAP. |
| **C3** `equipItem` ignores orphaned equipped rows (`undefined` slot ≠ targetSlot) | PRESERVE — **GAP (home)** | — | Subtle conflict-computation rule to preserve. Mutation-engine GAP. |
| **C4** `unequipItem` idempotent, `item-not-found` on miss | PRESERVE — **GAP (home)** | — | No-op-but-not-error rule to preserve. Mutation-engine GAP. |

---

## D. Item Stacking & Quantity

| Req | Tag | D / component | Notes |
|---|---|---|---|
| **D1** `addItem` top-up-then-overflow stacking | PRESERVE — **GAP (home)** | — | The whole point per the brief: `added = min(stackSize−quantity, remaining)` then overflow rows capped at `stackSize`, top-up loop only when `stackSize>1`. Rule to preserve exactly. No decision homes the stacking algorithm. GAP. |
| **D2** `addItem` new rows (`newId`, `equipped:false`, computed qty) | PRESERVE — **GAP (home)** | D2 (newId DI seam) | The `newId` injection seam echoes v1's DI pattern (D2 carry-over), but the row-minting behavior itself is unhomed. GAP. |
| **D3** `addItem` validation (`invalid-quantity`, catalog-check-first) | PRESERVE — **GAP (home)** | — | `!Number.isInteger \|\| <1`, catalog check before quantity check — order is load-bearing. Preserve. GAP on home. |
| **D4** `setItemQuantity` clamp `[0,stackSize]` floor, 0 drops row | PRESERVE — **GAP (home)** | D10 (clamp principle, *by analogy only*) | Named explicitly in the brief: `max(0, min(stackSize, floor(quantity)))`, clamped-0 removes row, `stackSize` defaults to 1 when key unshipped. D10's "operations own their clamps" is the *philosophy* but is written for HP `damage` only — it does **not** name item-quantity. Rule preserved; operation home is a GAP. |
| **D5** `removeItem` removes outright (even equipped) | PRESERVE — **GAP (home)** | — | Structural-unequip-on-remove rule to preserve. GAP on home. |

---

## E. Inventory Resolution (display shaping)

| Req | Tag | D / component | Notes |
|---|---|---|---|
| **E1** `resolveInventory` partition/group/sort by name | PRESERVE — **GAP (home)** | D8 (`resolve` is the fold) / D7 (display shaping) | Inventory resolution is the equipment branch of `resolve` (D8 layer 4 reads equipment), but D8 only describes equipment contributing *stat/skill transforms* — it never mentions producing the **display-shaped grouped/sorted inventory view** (per-slot groups + consumables, localeCompare). Resolution-for-display is unhomed. GAP. |
| **E2** `resolveInventory` resolves equipped item per slot | PRESERVE — **GAP (home)** | — | "first equipped in slot else null" rule to preserve. GAP on home (same as E1). |
| **E3** `resolveInventory` drops unrenderable rows | PRESERVE — **GAP (home)** | — | Drop unresolved-catalog rows + neither-equippable-nor-consumable rows. Preserve. GAP. |
| **E4** `getEquippedItem(inventory, slot)` pure filter | PRESERVE — **GAP (home)** | — | Pure post-resolution selector to preserve (first-match-wins on multi-equipped). GAP on home. |
| **E5** Capability traits classify catalog items | PRESERVE | D2 (foundation/items schema carryover) | `isEquippable`/`isStackable`/`isConsumable`/`isItemForSlot` are foundation-schema predicates; D2 carries over the foundation vocabulary + schema-first. Orthogonality preserved. (Note: the **item** capability-trait model here is independent of the **entity** component model D1/D16 — don't conflate.) |

---

## F. Inventory Reducer Slice

| Req | Tag | D / component | Notes |
|---|---|---|---|
| **F1** Currency edit delta-based + clamped `[0, MAX_CURRENCY]` | PRESERVE — **GAP (home)** | D6 (reducer style), D10 (clamp principle by analogy) | `clampCurrency(row.currency + delta)`, add-then-clamp order — rule to preserve. D6 keeps the exhaustive-switch reducer style, so the *reducer* has a home; but **`currency` has no component in O1** (not in Equipment, not StatProfile). The currency state itself is unhomed → GAP. |
| **F2** Inventory-mutation edit routes through item engine atomically | PRESERVE — **GAP (home)** | D6 (reducer), — (engine) | The reduce-style is D6; the item engine it calls (`applyInventoryMutation`) is the unhomed mutation engine (C/D GAP). |
| **F3** Rejected mutation is a no-op (`null`), atomic | PRESERVE — **GAP (home)** | D6 | Atomic all-or-nothing slice behavior to preserve. Depends on the unhomed engine's error surface. |
| **F4** `applyInventoryMutation` exhaustive router over closed union | PRESERVE — **GAP (home)** | D6 (exhaustive switch) | D6 ratifies exhaustive-switch reducers, which *fits* this router — but D6 is about the **character/encounter event reducers**, not the item-mutation router. The router (and its `EquipError\|AddError\|QuantityError` union) is the keystone of the unhomed mutation engine. GAP. |

---

## G. Skill Cost Resolution

| Req | Tag | D / component | Notes |
|---|---|---|---|
| **G1** SP cost passes through unchanged | PRESERVE | D8 (`resolve` produces ResolvedStatblock.skills) | Cost resolution belongs to skill hydration inside `resolve` (D8). No-scaling rule preserved. |
| **G2** HP-percent cost: `max(1, floor(maxHP*amt/100))` | PRESERVE | D8, D10/D14 (op bound) | The headline numeric rule. D14 explicitly calls out preserving `max(1, floor(maxHP*amt/100))`. Multiply-before-divide, round-down, floor-at-1. Resolves against **resolved** maxHP (D8). Preserve. |
| **G3** Passive skills have no cost (`null`) | PRESERVE | D19 (uses existing Skill `kind`) | D19 keeps the existing `active`/`passive` Skill kind and treats passives as costless — `null` distinct from zero. Preserve. |
| **G4** `resolveCost` takes a bare `maxHP`, not whole character | PRESERVE | D8 (provenance-neutral resolve) | Decoupling cost-resolution from character so an enemy statblock can resolve a cost is *exactly* the D8/D1 generalization (PC and enemy share the resolve path). Strongly aligned — preserve. |

---

## H. Skill Affordability & Cast

| Req | Tag | D / component | Notes |
|---|---|---|---|
| **H1** Affordability asymmetry — SP `>=`, HP strict `>` | PRESERVE | D14/D15 (named), D10 (op bound) | **The load-bearing comparator.** D14 explicitly: "skill HP affordability is strict `>` … SP is `>=` … must keep this asymmetry as an *operation* bound (per D10)." Preserve exactly; flipping HP to `>=` is a one-char rule break. |
| **H2** `applyResolvedCost` deducts matching pool or errs | PRESERVE + SUPERSEDE | D14/D10 (rule), D9 (storage shape) | Rule preserved: SP may hit exactly 0; HP-to-0 → `insufficient-hp` (strict). SUPERSEDE: v1 deducts from `currentSP`/`currentHP` literals; v2 operates on **depletion** (`damage`/`spSpent`) — "deduct from currentHP" becomes "increase `damage`", and the strict-`>` affordability gate is the operation bound that keeps `damage < maxHP` (never reaches fallen). The *comparator* is the bound D10 says operations own. |
| **H3** `canCast` — passives always castable | PRESERVE | D8 (resolve cost vs resolved maxHP), D19 | Resolve against resolved maxHP; passive → always true. Preserve. |
| **H4** `applyCast` — passive no-op success, else deduct; total | PRESERVE + SUPERSEDE | D19 (passive), D9 (storage), D6 (totality) | Rule preserved: engine stays total, passive = `ok(unchanged)`. SUPERSEDE: deduction writes depletion (D9) not pool literals. Preserve totality + passive-no-op. |

---

## I. Attack-Attribute & Formula Hydration (display)

| Req | Tag | D / component | Notes |
|---|---|---|---|
| **I1** `resolveAttackAttribute` symbol→score (`st-or-ma`→max) | PRESERVE | D8 (resolve produces attack roll), D2 | Maps onto `ResolvedStatblock.weaponAttackRoll`/skills derivation in `resolve` (D8). `st-or-ma` picks higher; `lu` resolvable. Preserve. |
| **I2** `hydrateFormula` longest-match-first substitution, Unicode minus | PRESERVE | D7 (display), D8 | Display-formatting rule (regex ordering `"St or Ma"` first, `\b`, Unicode `−`). A capability→widget/display concern (D7); the *formula text hydration* itself isn't named by any decision but is pure display shaping — preserve as-is. Minor home ambiguity (display vs engine), not a GAP. |
| **I3** `formatSignedBonus` (zero → `"+ 0"`, Unicode minus) | PRESERVE | D7 (display) | Pure display formatter; zero renders positive. Preserve. |

---

## Cross-cutting

| Req | Tag | D / component | Notes |
|---|---|---|---|
| **X1** No-input-mutation contract (all in-scope fns pure) | PRESERVE | D2 (pure DI carryover), D5/D8 (derive-then-reduce) | Purity is a core v1 win carried over (D2). The depletion + resolve model (D9/D8) is also pure-by-construction. Preserve for every v2 successor function. |
| **X2** Schema-vs-engine defense in depth (re-check `<0`) | PRESERVE | D2 | Engine callable without the schema → keep engine-level guards. Preserve. |

---

## Totals

- **PRESERVE (pure):** 19 — A8, B1, B2, B3, E5, G1, G2, G3, G4, H1, H3, I1, I2, I3, X1, X2 (16) … plus the rule half of every dual-tag below.
- **PRESERVE + SUPERSEDE (rule kept, storage/write-target changed by D9/D10):** 5 — A1, A3, A5, H2, H4.
- **PRESERVE-rule + GAP-home (mutation/state engine unhomed):** 16 — C1, C2, C3, C4, D1, D2, D3, D4, D5, E1, E2, E3, E4, F1, F2, F3, F4.
- **Pure GAP (no rule contradiction, but state has no component home):** the dice/exhaustion/currency pools surfaced via A2, A4, A6, A7, F1.

Counting by primary disposition of each of the 39 requirements:

- **PRESERVE (rule must be reproduced — includes the dual-tagged):** **39 / 39.** No requirement is a clean SUPERSEDE that drops a rule.
- **SUPERSEDE (storage/write-target deliberately changed, rule kept):** **5** (A1, A3, A5, H2, H4 — all via D9/D10).
- **GAP (design silent on where the behavior/state lives):** **see list below.**

---

## GAP list (explicit)

The GAPs are **not rule contradictions** — they are places the design is *silent
on a home*. Two distinct clusters:

### GAP-1 — The item-mutation engine is unhomed (C1–C4, D1–D5, F2, F4)
O1 lists an **Equipment** component (`{ slots / items }`) as *storage*, but **no
decision names a v2 module for the mutation operations** — equip single-slot
swap (C1), the failure/orphan rules (C2/C3), idempotent unequip (C4), the
top-up-then-overflow stacking algorithm (D1), `addItem` minting/validation
(D2/D3), `setItemQuantity` clamp+drop (D4), `removeItem` (D5), and the
`applyInventoryMutation` router + error union (F4). D10 establishes the
*principle* "operations own their clamps" but is written exclusively for HP
`damage`; it never extends to item quantity or equip conflict. **The Equipment
component homes the *data*, not the *behavior*.** v2 needs an explicit
item-mutation engine slice (the v1 `items/utils.ts` + `items/mutate.ts`
successor) — currently inexpressible from the decisions alone.

### GAP-2 — Inventory *display* resolution is unhomed (E1–E4)
D8's `resolve` fold reads Equipment for **stat/skill transforms** (layer 4) but
says nothing about producing the **display-shaped inventory view** (per-slot
weapon/armor/accessory grouping, consumables list, name `localeCompare` sort,
dropping unrenderable rows, equipped-per-slot selection). D7 covers
capability→widget rendering but not the data-shaping helper that precedes it.
`resolveInventory`/`getEquippedItem` have no successor home.

### GAP-3 — Hit Dice / Skill Dice pools have no component (A1, A3, A4, A5, A6, A7)
The rest engine spends and refills **Hit Dice** and **Skill Dice** remaining
pools. O1 has Vitals (`damage`) and SkillPool (`spSpent`) but **no dice-pool
component**. The full restore (A1), the spend-and-decrement transitions
(A3/A5), the strict-`>` over-spend failure matrices (A4/A6), and the
"regained only at Full Rest" invariant (A7) all read/write state v2 cannot
currently represent. (`prismaCharges` in A1 is likewise unhomed.)

### GAP-4 — Exhaustion has no component / entity field (A2, B-table consumers)
Full Rest's `−1 exhaustion` (A2) reads/writes durable per-entity exhaustion that
survives combat. Per the D13 boundary test it must survive a form swap → it
**cannot** live in StatProfile, and Vitals is `damage` only. No O1 component nor
entity column carries `exhaustion`. The exhaustion *table* (B1–B3) is fine (data
catalog, D2/D14); the **per-entity exhaustion level** is the GAP.

### GAP-5 — Currency has no component (F1)
`reduceInventoryEdit`'s currency branch (delta + `clampCurrency` to
`[0, MAX_CURRENCY]`) reads/writes a `currency` value with no home in O1
(Equipment is items, StatProfile is stats). The reducer *style* is homed (D6);
the *state* is not.

---

## Answers to the directed questions

**Does the depletion model (D9/D10) correctly express the rest engine?**
*Partially — the HP/SP arithmetic, yes; the dice/exhaustion state, no.*
- Partial Rest "HP→full" maps cleanly to **`damage = 0`** (D9); the SP `min`-clamp
  add is exactly a D10 operation-owned bound; Full Rest "all to max" = depletion
  zeroed; Respite's `min(maxHP,…)` = floor `damage` at 0. So the **HP/SP half of
  the rest matrix is fully expressed and is a clean SUPERSEDE** (write `damage`,
  not `currentHP`).
- **But the rest engine is more than HP/SP.** Hit Dice, Skill Dice, prismaCharges
  (GAP-3) and Exhaustion (GAP-4) are first-class rest state with no component
  home. D9/D10 are silent on them. So the depletion model **does not fully home
  the rest engine** — it homes the pool arithmetic and leaves the dice/exhaustion
  ledger unmodeled.

**Skill-cost comparators (strict-`>` HP / `>=` SP):**
*Fully accounted for.* D14 names the asymmetry explicitly and D10 designates it an
operation-owned bound; H1/H2 are PRESERVE with a clear home. Under depletion the
strict-`>` gate is precisely the operation bound that prevents `damage` from
reaching `maxHP` (self-Fall). No GAP. The `max(1, floor(maxHP*amt/100))`
HP-percent rule (G2) is likewise explicitly preserved (D14) and resolves against
**resolved** maxHP (D8) — a clean improvement, not a risk.

**Item-mutation rules + Equipment component:**
*Not fully homed — this is the headline GAP.* The Equipment component (O1) exists
as **storage only**. The mutation behavior — single-slot equip swap, stacking
top-up-then-overflow, `setItemQuantity` clamp/drop, the mutation router + error
union, and the display-resolution helpers — is **named by no decision**
(GAP-1, GAP-2). D10's "operations own their clamps" is the right *principle* but
is scoped to HP `damage` in the text; nothing carries it to inventory. v2 needs
an explicit item-mutation-engine + inventory-resolution slice. Until then the
component model homes the inventory *data* but not its *rules*.
