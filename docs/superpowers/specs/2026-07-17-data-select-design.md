# DataSelect — a data-driven Select wrapper

**Date:** 2026-07-17
**Status:** Design approved, spec under review

## Problem

`<Select>` (our Base UI wrapper in `packages/ui/src/components/select.tsx`) is a
*compositional* primitive: every call site assembles `SelectTrigger` /
`SelectValue` / `SelectContent` / `SelectItem` by hand. A survey of all 21
instances across 14 files found the same boilerplate repeated almost everywhere:

- The dominant case maps an array to `{value, label}` items and then hand-writes
  a `<SelectValue>` that does a `.find()` (or a lookup / ternary) to turn the
  selected value back into its label, with a placeholder fallback.
- **3** (the zone-by-page pickers, `prep.tsx` / `encounter-staging.tsx` /
  `add-to-delve-dialog.tsx`) additionally hand-roll grouping with
  `SelectGroup`/`SelectLabel`, computing "show group labels only when >1 group"
  inline — the same logic three times. `encounter-staging.tsx`'s local
  `ZoneSelect` is already a hand-rolled reusable wrapper: a prototype of this
  component.
- **2 carry a load-bearing custom trigger display** that must *not* collapse to a
  placeholder: `position-section.tsx` (an icon inside the trigger + rich item
  content) and `region-settings-form.tsx` (a stale/deleted table key rendered as
  a `text-destructive` "(missing from the set)" — a documented invariant: falling
  back to "None" would let the form submit the stale key with no UI path out).
  These two establish that a `renderValue` escape hatch is a real need, not a
  hypothetical one.

The trigger-label `.find()` is *derivable* for the common case — if a component
owns the options list, it can resolve the label itself.

## Key finding: the primitive already resolves labels

Base UI's `Select.Root` accepts a native `items` prop:

```ts
items?: Record<string, ReactNode>
      | ReadonlyArray<{ label: ReactNode; value: any }>
      | ReadonlyArray<{ items: ReadonlyArray<...> }>  // grouped
```

> "When specified, `<Select.Value>` renders the label of the selected item
> instead of the raw value."

`<Select.Value placeholder="…">` then renders the placeholder when nothing
matches. In other words, **the `.find()` boilerplate is already solvable
natively** — the call sites just never passed `items`. Grouping is likewise a
native concept in the `items` shape.

The primitive's residual drawback is **double-specification**: to get automatic
label resolution you must pass the list to `items` *and* separately render it as
`<SelectItem>` children. `DataSelect`'s job is to take the list **once** and wire
both.

## Design

A new component `DataSelect` in `packages/ui/src/components/data-select.tsx`,
built on the existing `select.tsx` primitives. It renders the Root → Trigger →
Value → Content → Item(s) subtree from a single `options` array, wiring that same
array into `Select.Root`'s `items` so the trigger label resolves for free.

It deliberately does **not** own the `<Label>` / `<Field>` wrapping — that varies
across call sites (`Field`+`FieldLabel`, `sr-only` `Label`+`htmlFor`, bare
`aria-label`) and owning it is the dishonesty that ruled out the name
"SelectField". The caller keeps the label and passes `id` / `aria-label` through.

### API

The prop surface is **derived from the primitive's types**, not hand-written, so
`className` / `id` / `aria-*` / `size` / `disabled` / `name` come along for free
and stay in sync with Base UI. We hand-declare only what we genuinely reshape
(`value` / `onValueChange`, to normalize `null → ""`) or add (`options`,
`placeholder`, `align`, `icon`, `renderValue`).

```tsx
import { Select as SelectPrimitive } from "@base-ui/react/select"
import { SelectContent, SelectTrigger } from "@workspace/ui/components/select"

type SelectOption = {
  value: string
  label: React.ReactNode
}

type SelectOptionGroup = {
  label?: React.ReactNode        // group heading
  options: SelectOption[]
}

type DataSelectProps =
  // Trigger-bound props: size, className, id, aria-*, and all button attrs.
  // (SelectTrigger's type is `SelectPrimitive.Trigger.Props & { size }`.)
  & Omit<
      React.ComponentProps<typeof SelectTrigger>,
      "children" | "value" | "disabled" | "onChange"
    >
  // Root-bound pass-throughs — routed to Select.Root untouched.
  & Pick<
      SelectPrimitive.Root.Props<string>,
      "disabled" | "name" | "defaultValue" | "required" | "readOnly"
    >
  & {
      options: SelectOption[] | SelectOptionGroup[]
      value: string                          // reshaped: always a string
      onValueChange: (value: string) => void // reshaped: coalesces null → ""
      placeholder?: React.ReactNode          // shown when nothing matches value
      align?: React.ComponentProps<typeof SelectContent>["align"]
      icon?: React.ReactNode                 // leading slot inside the trigger
      /**
       * Escape hatch: fully override the trigger's rendered value, e.g. to name
       * a stale/missing key distinctly from the placeholder. When set, the
       * automatic `items`-based label resolution is bypassed. Receives Base UI's
       * raw selected value (`string | null`).
       */
      renderValue?: (value: string | null) => React.ReactNode
    }
```

Deriving from `React.ComponentProps<typeof SelectTrigger>` (which is itself
`SelectPrimitive.Trigger.Props & { size }`) is what makes `className`/`disabled`/
`size`/`id`/`aria-*` free. `disabled` is `Omit`ted from the Trigger side and
`Pick`ed from the Root side so it routes to `Select.Root` (which disables the
whole control) rather than only the trigger button — matching the intent of the
sites that put `disabled` on either element.

Usage — the block from the original request collapses to:

```tsx
<DataSelect
  value={selectedMapShortId}
  onValueChange={setSelectedMapShortId}
  placeholder="Choose a map…"
  options={localMaps.map((m) => ({ value: m.shortId, label: m.name }))}
/>
```

Grouped usage:

```tsx
<DataSelect
  value={placements[character.id] ?? ""}
  onValueChange={(v) => setPlacements((c) => ({ ...c, [character.id]: v }))}
  placeholder="Not in this delve"
  size="sm"
  className="w-48"
  id={`zone-${character.id}`}
  options={pageGroups.map((g) => ({
    label: g.pageName,
    options: g.zones.map((z) => ({ value: z.id, label: z.name })),
  }))}
/>
```

### Behavior

- **Label resolution.** `options` is passed to `Select.Root`'s `items`
  (flattening groups to Base UI's `{ items }` shape). By default the trigger uses
  a plain `<SelectValue placeholder={placeholder} />` — no custom child, no
  `.find()`. For `value=""` or any value with no matching option, the placeholder
  shows. This subsumes the render-prop `SelectValue` cases (`encounter-staging`,
  `combat-console`). When
  `renderValue` is supplied, the trigger renders `<SelectValue>{renderValue}</SelectValue>`
  instead (bypassing `items` resolution) — for sites that must distinguish a
  stale/missing value from "empty".
- **Rendering.** The popup is rendered from the same `options`:
  - Flat → `SelectItem` per option.
  - Grouped → `SelectGroup` per group; its `SelectLabel` renders **iff the group
    has a `label` AND there is more than one group** (matches all 3 existing
    zone pickers; removes the inline `size > 1` guard).
- **Value normalization.** `onValueChange` wraps Base UI's
  `(value, details) => void`, coalescing `null → ""` and emitting `string`. This
  removes the `value ?? ""` scattered across call sites. Value-less "action"
  selects (`value=""`, pick fires a side effect — `add-to-delve-dialog`,
  `position-section`) keep working: nothing
  matches `""`, placeholder shows, each pick fires `onValueChange`.
- **Prop routing.** `value` / `onValueChange` / `disabled` / `name` /
  `defaultValue` / `required` / `readOnly` → Root; `size` / `className` / `icon` /
  `...rest` (incl. `id`, `aria-*`) → Trigger (so `id` lands on the trigger button,
  preserving `htmlFor` pairing); `align` → Content.
- **Custom trigger displays.** Two sites need one and now share the `renderValue`
  hatch: `position-section.tsx` (`icon` slot + rich item `label`) and
  `region-settings-form.tsx` (`renderValue` naming the missing key in
  `text-destructive`). Everywhere else the default `items` resolution suffices.

### Explicitly out of scope

- `disabled` per-option: the primitive supports it, but no call site uses it.
  Omitted to keep the type tight; trivial to add when a consumer appears.
- Multi-select: no call site uses it (`SelectPrimitive.Root.Props<string>` pins
  `Multiple = false`).
- Label / Field wrapping: stays with the caller. This is deliberate — owning it
  is the dishonesty that ruled out the name "SelectField"; wrapping also varies
  (`Field`+`FieldLabel`, `sr-only` `Label`+`htmlFor`, bare `aria-label`).

## Migration

Convert all 21 call sites (14 files) to `DataSelect` and delete the local
`ZoneSelect` prototype in `encounter-staging.tsx`. Notable per-site translations:

- **Sentinel-none** (`set-settings-form.tsx`, `template-form.tsx` portal,
  `region-settings-form.tsx` + `create-region-button.tsx` `NO_TABLE`): the
  sentinel becomes a normal leading option; the `undefined ↔ sentinel`
  translation stays in the call site's `onValueChange` / `value`. Where the
  stale-value fallback is *not* load-bearing (e.g. "Missing map"), it collapses
  into the placeholder — an acceptable behavior change for an edge state.
- **Grouped zone pickers** (`prep`/`encounter-staging`/`add-to-delve-dialog`):
  pass grouped `options`; drop the inline grouping + `size > 1` logic.
- **Custom trigger displays**: `position-section.tsx` →
  `icon={<ArrowsOutCardinalIcon aria-hidden />}` + rich option labels;
  `region-settings-form.tsx` → `renderValue` preserving the `text-destructive`
  "(missing from the set)" invariant (do **not** let this one collapse to the
  placeholder).
- **`String(turns)` interval pickers** (region settings/create): options are
  `WANDERING_INTERVAL_OPTIONS.map((o) => ({ value: String(o.turns), label: o.label }))`;
  the `Number(value)` cast stays in `onValueChange`.

## Verification

`packages/ui` has no component-test infra, and standing it up for one component
is disproportionate. The feedback loop is:

1. `npm run typecheck` — the 15 migrated call sites are the type-level contract
   test; every real value/option shape must compile against `DataSelectProps`.
2. `npm run lint`.
3. Visual check via the dev server on a couple of representative screens (a flat
   picker and a grouped zone picker) — confirm trigger label, placeholder,
   grouping labels, and `size`/width parity with the originals.

## Open risks

- **`align` / width parity.** Existing triggers carry assorted width classes
  (`w-48`, `w-44`, `flex-1`, `w-full max-w-sm`, …) via `className`; these pass
  through unchanged. Verify a couple visually.
- **`items` label rendering for rich labels.** For a *populated* select whose
  option `label` is rich, the trigger would render that rich label. Only
  `position-section` has rich labels and it is value-less, so no conflict today
  (and it uses `icon` + placeholder anyway); note it for future rich-label +
  populated cases.
