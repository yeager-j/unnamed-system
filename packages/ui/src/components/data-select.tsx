"use client"

import { Select as SelectPrimitive } from "@base-ui/react/select"
import * as React from "react"

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"

/**
 * Base UI requires a non-empty string value for every selectable item, so the
 * `nullOption` ("nothing chosen") item needs a reserved stand-in the caller
 * never sees. `DataSelect` maps the caller's `""` ↔ `NULL_VALUE` at its
 * boundary; the null character can't collide with a real option key.
 */
const NULL_VALUE = "\u0000"

/**
 * A data-driven wrapper over the compositional `Select` primitive. You pass a
 * domain array plus accessor functions; `DataSelect` builds the trigger, the
 * popup, and the label resolution from them — the `.map()` / `.find()` /
 * grouping that every call site used to hand-write now live here, once.
 *
 * The trigger/root props are derived from the primitive's own types, so
 * `className` / `id` / `aria-*` / `size` / `disabled` / `name` come for free and
 * track Base UI. Only `value` / `onValueChange` (reshaped to plain strings) and
 * the accessors are declared by hand.
 *
 * It intentionally does not own the `<Label>` / `<Field>` wrapping — that varies
 * per call site; the caller keeps the label and passes `id` / `aria-label`
 * through.
 */
type DataSelectProps<T> = Omit<
  React.ComponentProps<typeof SelectTrigger>,
  "children" | "value" | "disabled" | "onChange"
> &
  Pick<
    SelectPrimitive.Root.Props<string>,
    "disabled" | "name" | "defaultValue" | "required" | "readOnly"
  > & {
    options: readonly T[]
    optionValue: (option: T) => string
    optionLabel: (option: T) => React.ReactNode
    /**
     * Group options under a heading. Return the same `key` for options in the
     * same group; the heading renders only when there is more than one group.
     */
    optionGroup?: (option: T) => { key: string; label?: React.ReactNode }
    value: string
    onValueChange: (value: string) => void
    placeholder?: React.ReactNode
    align?: React.ComponentProps<typeof SelectContent>["align"]
    /** Leading slot rendered inside the trigger, before the value. */
    icon?: React.ReactNode
    /**
     * A leading "nothing chosen" option, selected when `value` is `""`. Its
     * `label` shows in the trigger and popup — so callers stop hand-rolling a
     * sentinel key and its `?? SENTINEL` / `=== SENTINEL` translation, and just
     * bridge their domain's `undefined` with `?? ""` / `|| undefined`.
     */
    nullOption?: { label: React.ReactNode }
    /**
     * Override the trigger's rendered value. Receives the matched option (or
     * `undefined` when the null option / a stale-deleted key is selected) and
     * the selected value (`""` for the null option). When set, the automatic
     * label resolution is bypassed.
     */
    selectTriggerLabel?: (
      option: T | undefined,
      value: string
    ) => React.ReactNode
  }

function DataSelect<T>({
  options,
  optionValue,
  optionLabel,
  optionGroup,
  value,
  onValueChange,
  placeholder,
  align,
  icon,
  nullOption,
  selectTriggerLabel,
  disabled,
  name,
  defaultValue,
  required,
  readOnly,
  ...triggerProps
}: DataSelectProps<T>) {
  // Feeds Base UI's native label resolution for the default trigger.
  const items = [
    ...(nullOption ? [{ value: NULL_VALUE, label: nullOption.label }] : []),
    ...options.map((option) => ({
      value: optionValue(option),
      label: optionLabel(option),
    })),
  ]
  const byValue = new Map(
    options.map((option) => [optionValue(option), option])
  )

  return (
    <Select
      items={items}
      value={value === "" && nullOption ? NULL_VALUE : value}
      onValueChange={(next) => {
        const raw = next ?? ""
        onValueChange(raw === NULL_VALUE ? "" : raw)
      }}
      disabled={disabled}
      name={name}
      defaultValue={defaultValue}
      required={required}
      readOnly={readOnly}
    >
      <SelectTrigger {...triggerProps}>
        {icon}
        {selectTriggerLabel ? (
          <SelectValue placeholder={placeholder}>
            {(selected: string | null) => {
              const resolved =
                selected == null || selected === NULL_VALUE ? "" : selected
              return selectTriggerLabel(
                resolved === "" ? undefined : byValue.get(resolved),
                resolved
              )
            }}
          </SelectValue>
        ) : (
          <SelectValue placeholder={placeholder} />
        )}
      </SelectTrigger>
      <SelectContent align={align}>
        {nullOption && (
          <SelectItem value={NULL_VALUE}>{nullOption.label}</SelectItem>
        )}
        {optionGroup
          ? renderGroups(options, optionGroup, optionValue, optionLabel)
          : options.map((option) => {
              const optionKey = optionValue(option)
              return (
                <SelectItem key={optionKey} value={optionKey}>
                  {optionLabel(option)}
                </SelectItem>
              )
            })}
      </SelectContent>
    </Select>
  )
}

function renderGroups<T>(
  options: readonly T[],
  optionGroup: (option: T) => { key: string; label?: React.ReactNode },
  optionValue: (option: T) => string,
  optionLabel: (option: T) => React.ReactNode
) {
  const groups: { key: string; label?: React.ReactNode; options: T[] }[] = []
  const indexByKey = new Map<string, number>()
  for (const option of options) {
    const { key, label } = optionGroup(option)
    let index = indexByKey.get(key)
    if (index === undefined) {
      index = groups.length
      indexByKey.set(key, index)
      groups.push({ key, label, options: [] })
    }
    groups[index]!.options.push(option)
  }

  const showLabels = groups.length > 1
  return groups.map((group) => (
    <SelectGroup key={group.key}>
      {showLabels && group.label != null && (
        <SelectLabel>{group.label}</SelectLabel>
      )}
      {group.options.map((option) => {
        const optionKey = optionValue(option)
        return (
          <SelectItem key={optionKey} value={optionKey}>
            {optionLabel(option)}
          </SelectItem>
        )
      })}
    </SelectGroup>
  ))
}

export { DataSelect }
export type { DataSelectProps }
