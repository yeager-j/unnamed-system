"use client"

import { Fragment, useMemo, useState } from "react"

import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  ComboboxValue,
  useComboboxAnchor,
} from "@workspace/ui/components/combobox"

/**
 * The tags/accepts token editor — the canonical multi-select chips Combobox
 * (the Talents-picker pattern) over the set's existing adjacency vocabulary,
 * **plus create-from-query**: adjacency matching is string-equality, so a typo
 * in `accepts` silently makes a template unmintable. Suggesting the tokens
 * already used across the set turns that typo into a non-event, while typing a
 * genuinely new token offers it as an item (the query is appended to the
 * suggestion list). Lint still catches whatever slips through.
 */
export function TokenCombobox({
  id,
  value,
  suggestions,
  placeholder,
  onChange,
}: {
  id?: string
  value: string[]
  /** Tokens already used across the set (the suggestion vocabulary). */
  suggestions: string[]
  placeholder: string
  onChange: (next: string[]) => void
}) {
  const anchor = useComboboxAnchor()
  const [query, setQuery] = useState("")

  const items = useMemo(() => {
    const known = new Set(suggestions)
    const trimmed = query.trim()
    return trimmed && !known.has(trimmed)
      ? [...suggestions, trimmed]
      : suggestions
  }, [suggestions, query])

  return (
    <Combobox<string, true>
      multiple
      autoHighlight
      items={items}
      value={value}
      onInputValueChange={setQuery}
      onValueChange={(next) => onChange(next as string[])}
    >
      <ComboboxChips ref={anchor}>
        <ComboboxValue>
          {(values: string[]) => (
            <Fragment>
              {values.map((token) => (
                <ComboboxChip key={token}>{token}</ComboboxChip>
              ))}
              <ComboboxChipsInput
                id={id}
                placeholder={values.length === 0 ? placeholder : ""}
              />
            </Fragment>
          )}
        </ComboboxValue>
      </ComboboxChips>
      <ComboboxContent anchor={anchor}>
        <ComboboxEmpty>Type to add a new token.</ComboboxEmpty>
        <ComboboxList>
          {(token: string) => (
            <ComboboxItem key={token} value={token}>
              {token}
              {!suggestions.includes(token) && (
                <span className="ml-1 text-xs text-muted-foreground">
                  — add new
                </span>
              )}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}
