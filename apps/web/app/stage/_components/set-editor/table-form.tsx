"use client"

import { PlusIcon, XIcon } from "@phosphor-icons/react/dist/ssr"
import { useMemo, useState } from "react"

import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@workspace/ui/components/combobox"
import {
  Field,
  FieldDescription,
  FieldLabel,
} from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { Separator } from "@workspace/ui/components/separator"

import {
  d100Ranges,
  type ContentTable,
  type ContentTableRow,
  type TableEntry,
  type TemplateSetContent,
} from "@/domain/template-set/authoring"
import {
  ENEMY_OPTIONS,
  ITEM_OPTIONS,
  type CatalogOption,
} from "@/domain/template-set/catalog-options"
import { removeTable, updateTable } from "@/domain/template-set/edit"

import type { SetEditorSelection } from "./selection"

/**
 * One content table's form — rows of weight × entries, with the **derived d100
 * band** beside each row (a live `d100Ranges` projection; weights stay the
 * authored truth, the bands are what the DM's real d100 lands in). Entries are
 * the four-kind union: enemy × count (catalog combobox), item (catalog
 * combobox), currency dice, free text.
 */
export function TableForm({
  table,
  content,
  onApplyContent,
  onSelect,
}: {
  table: ContentTable
  content: TemplateSetContent
  onApplyContent: (content: TemplateSetContent) => void
  onSelect: (selection: SetEditorSelection) => void
}) {
  const key = table.key
  const ranges = useMemo(() => d100Ranges(table), [table])

  /** Templates whose contentRolls reference this table (shown as context —
   *  removal is allowed regardless; dangling refs are lint's territory). */
  const referencedBy = useMemo(
    () =>
      content.templateOrder.filter((templateKey) =>
        content.templates[templateKey]?.contentRolls.some(
          (roll) => roll.tableKey === key
        )
      ),
    [content, key]
  )

  function patch(update: Partial<ContentTable>) {
    onApplyContent(updateTable(content, key, update))
  }

  function patchRow(index: number, update: Partial<ContentTableRow>) {
    patch({
      rows: table.rows.map((row, i) =>
        i === index ? { ...row, ...update } : row
      ),
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h2 className="font-display text-2xl font-semibold">
          {table.name.trim() || "Untitled table"}
        </h2>
        {referencedBy.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Rolled by{" "}
            {referencedBy
              .map(
                (templateKey) =>
                  content.templates[templateKey]?.name.trim() ||
                  "Untitled template"
              )
              .join(", ")}
          </p>
        )}
      </header>

      <Field>
        <FieldLabel htmlFor="table-name">Name</FieldLabel>
        <Input
          id="table-name"
          value={table.name}
          maxLength={100}
          autoFocus={table.name === "New table"}
          onChange={(event) => patch({ name: event.target.value })}
        />
        <FieldDescription>
          Set-level and referenced by name from templates&apos; content rolls
          and the Region&apos;s wandering designation.
        </FieldDescription>
      </Field>

      <Separator />

      <div className="flex flex-col gap-2">
        {ranges === null && (
          <p className="text-sm text-amber-600 dark:text-amber-500">
            Over 100 rows — d100 bands can&apos;t give every row a slot. Remove
            rows to restore the projection.
          </p>
        )}
        {table.rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No rows yet. A row is a weight plus what the draw stamps — enemies,
            items, currency, or narration.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {table.rows.map((row, index) => (
              <li
                key={index}
                className="flex flex-col gap-2 rounded-md border p-3"
              >
                <div className="flex items-center gap-3">
                  <Badge
                    variant="outline"
                    className="w-16 justify-center tabular-nums"
                  >
                    {ranges === null
                      ? "—"
                      : ranges[index]!.min === ranges[index]!.max
                        ? ranges[index]!.min
                        : `${ranges[index]!.min}–${ranges[index]!.max}`}
                  </Badge>
                  <label className="flex items-center gap-2 text-sm text-muted-foreground">
                    Weight
                    <Input
                      type="number"
                      min={0}
                      value={row.weight}
                      aria-label={`Row ${index + 1} weight`}
                      onChange={(event) => {
                        const weight = Number(event.target.value)
                        if (!Number.isNaN(weight))
                          patchRow(index, { weight: Math.max(0, weight) })
                      }}
                      className="w-24 tabular-nums"
                    />
                  </label>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="ml-auto"
                    aria-label={`Remove row ${index + 1}`}
                    onClick={() =>
                      patch({ rows: table.rows.filter((_, i) => i !== index) })
                    }
                  >
                    <XIcon />
                  </Button>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  {row.entries.map((entry, entryIndex) => (
                    <Badge
                      key={entryIndex}
                      variant="secondary"
                      className="gap-1 py-1 pr-1 pl-2"
                    >
                      {entryLabel(entry)}
                      <button
                        type="button"
                        aria-label={`Remove entry ${entryLabel(entry)}`}
                        className="rounded-sm p-0.5 hover:bg-foreground/10"
                        onClick={() =>
                          patchRow(index, {
                            entries: row.entries.filter(
                              (_, i) => i !== entryIndex
                            ),
                          })
                        }
                      >
                        <XIcon className="size-3" />
                      </button>
                    </Badge>
                  ))}
                  <AddEntryControl
                    onAdd={(entry) =>
                      patchRow(index, { entries: [...row.entries, entry] })
                    }
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
        <Button
          variant="outline"
          size="sm"
          className="self-start"
          onClick={() =>
            patch({ rows: [...table.rows, { weight: 1, entries: [] }] })
          }
        >
          <PlusIcon /> Add row
        </Button>
        <p className="text-xs text-muted-foreground">
          Bands derive from weights (largest remainder, no unhittable rows). The
          DM rolls a real d100 and clicks the row it landed in.
        </p>
      </div>

      <Separator />

      <Button
        variant="outline"
        size="sm"
        className="self-start text-destructive"
        onClick={() => {
          onApplyContent(removeTable(content, key))
          onSelect({ kind: "settings" })
        }}
      >
        Delete table
      </Button>
      {referencedBy.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Templates still roll on this table — deleting it leaves dangling rolls
          the lint will flag.
        </p>
      )}
    </div>
  )
}

function entryLabel(entry: TableEntry): string {
  switch (entry.kind) {
    case "enemy": {
      const label =
        ENEMY_OPTIONS.find((option) => option.key === entry.enemyKey)?.label ??
        entry.enemyKey
      return entry.count > 1 ? `${entry.count}× ${label}` : label
    }
    case "item":
      return (
        ITEM_OPTIONS.find((option) => option.key === entry.itemKey)?.label ??
        entry.itemKey
      )
    case "currency":
      return `${entry.dice} currency`
    case "text":
      return entry.text.length > 40 ? `${entry.text.slice(0, 40)}…` : entry.text
  }
}

type EntryKind = TableEntry["kind"]

const ENTRY_KIND_LABELS: Record<EntryKind, string> = {
  enemy: "Enemy",
  item: "Item",
  currency: "Currency",
  text: "Free text",
}

/**
 * The per-row "+ entry" control: pick a kind, fill its minimal fields in a
 * popover, add. Enemy/item use lightweight catalog comboboxes (a Select over
 * the sorted `{key, label}` rows — the full statblock browser is deliberately
 * not reused here; authoring many rows wants speed, not context).
 */
function AddEntryControl({ onAdd }: { onAdd: (entry: TableEntry) => void }) {
  const [open, setOpen] = useState(false)
  const [kind, setKind] = useState<EntryKind>("enemy")
  const [enemyKey, setEnemyKey] = useState<string | undefined>()
  const [count, setCount] = useState(1)
  const [itemKey, setItemKey] = useState<string | undefined>()
  const [dice, setDice] = useState("")
  const [text, setText] = useState("")

  function reset() {
    setEnemyKey(undefined)
    setItemKey(undefined)
    setCount(1)
    setDice("")
    setText("")
  }

  function commit() {
    const entry: TableEntry | null =
      kind === "enemy" && enemyKey
        ? { kind, enemyKey, count: Math.max(1, count) }
        : kind === "item" && itemKey
          ? { kind, itemKey }
          : kind === "currency" && dice.trim()
            ? { kind, dice: dice.trim() }
            : kind === "text" && text.trim()
              ? { kind, text: text.trim() }
              : null
    if (!entry) return
    onAdd(entry)
    reset()
    setOpen(false)
  }

  const commitDisabled =
    kind === "enemy"
      ? !enemyKey
      : kind === "item"
        ? !itemKey
        : kind === "currency"
          ? !dice.trim()
          : !text.trim()

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" />
        }
      >
        <PlusIcon className="size-3" /> Add entry
      </PopoverTrigger>
      <PopoverContent className="flex w-72 flex-col gap-3" align="start">
        <Select
          value={kind}
          onValueChange={(next) => setKind(next as EntryKind)}
        >
          <SelectTrigger className="w-full">
            <SelectValue>{ENTRY_KIND_LABELS[kind]}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="enemy">Enemy</SelectItem>
            <SelectItem value="item">Item</SelectItem>
            <SelectItem value="currency">Currency</SelectItem>
            <SelectItem value="text">Free text</SelectItem>
          </SelectContent>
        </Select>

        {kind === "enemy" && (
          <div className="flex items-center gap-2">
            <CatalogCombobox
              options={ENEMY_OPTIONS}
              value={enemyKey}
              placeholder="Search enemies…"
              onChange={setEnemyKey}
            />
            <Input
              type="number"
              min={1}
              value={count}
              aria-label="Count"
              onChange={(event) => {
                const next = Number(event.target.value)
                if (!Number.isNaN(next)) setCount(Math.max(1, Math.round(next)))
              }}
              className="w-16 tabular-nums"
            />
          </div>
        )}
        {kind === "item" && (
          <CatalogCombobox
            options={ITEM_OPTIONS}
            value={itemKey}
            placeholder="Search items…"
            onChange={setItemKey}
          />
        )}
        {kind === "currency" && (
          <Input
            value={dice}
            placeholder="2d10 × 10"
            aria-label="Currency dice"
            onChange={(event) => setDice(event.target.value)}
          />
        )}
        {kind === "text" && (
          <Input
            value={text}
            placeholder="A corpse clutching a locket"
            aria-label="Free text"
            onChange={(event) => setText(event.target.value)}
          />
        )}

        <Button size="sm" disabled={commitDisabled} onClick={commit}>
          Add
        </Button>
      </PopoverContent>
    </Popover>
  )
}

/** The lightweight searchable single-pick over sorted catalog rows — a
 *  typeahead Combobox storing the catalog `key`, searching by `label` (the
 *  decided entry-picker weight: fast for authoring many rows; the full
 *  statblock browser is deliberately not reused here). */
function CatalogCombobox({
  options,
  value,
  placeholder,
  onChange,
}: {
  options: readonly CatalogOption[]
  value: string | undefined
  placeholder: string
  onChange: (key: string) => void
}) {
  const labelByKey = useMemo(
    () => new Map(options.map((option) => [option.key, option.label])),
    [options]
  )
  const keys = useMemo(() => options.map((option) => option.key), [options])

  return (
    <Combobox<string, false>
      autoHighlight
      items={keys}
      value={value ?? null}
      onValueChange={(next) => {
        if (next) onChange(next as string)
      }}
      itemToStringLabel={(key) => labelByKey.get(key as string) ?? String(key)}
    >
      <ComboboxInput
        placeholder={placeholder}
        className="min-w-0 flex-1"
        showClear={false}
      />
      <ComboboxContent>
        <ComboboxEmpty>No matches.</ComboboxEmpty>
        <ComboboxList>
          {(key: string) => (
            <ComboboxItem key={key} value={key}>
              {labelByKey.get(key) ?? key}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}
