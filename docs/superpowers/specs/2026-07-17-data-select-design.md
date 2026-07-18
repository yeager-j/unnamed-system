# DataSelect — a data-driven Select wrapper

**Date:** 2026-07-17
**Status:** Design approved, spec under review

## Problem

`<Select>` (our Base UI wrapper in `packages/ui/src/components/select.tsx`) is a
*compositional* primitive: every call site assembles `SelectTrigger` /
`SelectValue` / `SelectContent` / `SelectItem` by hand. A survey of all 15
instances across 12 files found the same boilerplate repeated almost everywhere:

- **11 of 15** map an array to `{value, label}` items and then hand-write a
  `<SelectValue>` that does a `.find()` (or a lookup / ternary) to turn the
  selected value back into its label, with a placeholder fallback.
- **3** (the zone-by-page pickers, `prep.tsx` / `encounter-staging.tsx` /
  `add-to-delve-dialog.tsx`) additionally hand-roll grouping with
  `SelectGroup`/`SelectLabel`, computing "show group labels only when >1 group"
  inline — the same logic three times. `encounter-staging.tsx`'s local
  `ZoneSelect` is already a hand-rolled reusable wrapper: a prototype of this
  component.
- **1** (`position-section.tsx`) is a true outlier: an icon inside the trigger
  and rich item content (name + muted secondary text).

The trigger-label `.find()` is *derivable* — if a component owns the options
list, it can resolve the label itself.

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

```tsx
type SelectOption = {
  value: string
  label: React.ReactNode
}

type SelectOptionGroup = {
  label?: React.ReactNode        // group heading
  options: SelectOption[]
}

type DataSelectProps = {
  options: SelectOption[] | SelectOptionGroup[]
  value: string
  onValueChange: (value: string) => void
  placeholder?: React.ReactNode  // shown when nothing matches value
  disabled?: boolean
  size?: "sm" | "default"        // -> SelectTrigger
  align?: "start" | "center" | "end"  // -> SelectContent
  icon?: React.ReactNode         // leading slot inside the trigger (outlier #14)
  className?: string             // -> SelectTrigger
  // ...rest (id, aria-label, aria-*, data-*) spread onto SelectTrigger
}
```

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
  (flattening groups to Base UI's `{ items }` shape). The trigger uses a plain
  `<SelectValue placeholder={placeholder} />` — no custom child, no `.find()`.
  For `value=""` or any value with no matching option, the placeholder shows.
  This subsumes the render-prop `SelectValue` cases (#7, #11).
- **Rendering.** The popup is rendered from the same `options`:
  - Flat → `SelectItem` per option.
  - Grouped → `SelectGroup` per group; its `SelectLabel` renders **iff the group
    has a `label` AND there is more than one group** (matches all 3 existing
    zone pickers; removes the inline `size > 1` guard).
- **Value normalization.** `onValueChange` wraps Base UI's
  `(value, details) => void`, coalescing `null → ""` and emitting `string`. This
  removes the `value ?? ""` scattered across call sites. Value-less "action"
  selects (`value=""`, pick fires a side effect — #8, #14) keep working: nothing
  matches `""`, placeholder shows, each pick fires `onValueChange`.
- **Prop routing.** `value` / `onValueChange` / `disabled` → Root; `size` /
  `className` / `icon` / `...rest` → Trigger (so `id` lands on the trigger button,
  preserving `htmlFor` pairing); `align` → Content.
- **Outlier (#14).** Handled by `icon` (leading trigger slot) + a rich
  `label: ReactNode` on the options (name + muted secondary span). No dedicated
  `renderValue` escape hatch is added — no non-#14 case needs one, and #14 is
  value-less so its trigger shows the placeholder, not a resolved label. (One
  adapter is hypothetical; add `renderValue` only if a second case appears.)

### Explicitly out of scope

- `disabled` per-option: the primitive supports it, but no call site uses it.
  Omitted to keep the type tight; trivial to add when a consumer appears.
- Multi-select: no call site uses it.
- Label / Field wrapping: stays with the caller (see above).

## Migration

Convert all 15 call sites to `DataSelect` and delete the local `ZoneSelect`
prototype in `encounter-staging.tsx`. Notable per-site translations:

- **Sentinel-none** (`set-settings-form.tsx`, `template-form.tsx` portal): the
  `NO_CONNECTOR` / `NO_PORTAL` sentinel becomes a normal leading option; the
  `undefined ↔ sentinel` translation stays in the call site's `onValueChange` /
  `value`. Stale-value fallbacks ("Missing template" / "Missing map") become the
  placeholder — an acceptable behavior change for an edge state.
- **Grouped zone pickers** (#6/#7/#8): pass grouped `options`; drop the inline
  grouping + `size > 1` logic.
- **Icon outlier** (#14): `icon={<ArrowsOutCardinalIcon aria-hidden />}` + rich
  option labels.

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
  option `label` is rich, the trigger would render that rich label. Only #14 has
  rich labels and it is value-less, so no conflict today; note it for future
  rich-label + populated cases.
