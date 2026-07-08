"use client"

import { PlusIcon } from "@phosphor-icons/react"
import { useState } from "react"

import { isStackable, type Item } from "@workspace/game-v2/items"
import { Button } from "@workspace/ui/components/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@workspace/ui/components/command"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@workspace/ui/components/dialog"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"

import { useEntityWrite } from "@/hooks/use-entity-write"
import { allItems } from "@/lib/game-engine-v2"
import { ITEM_GROUP_LABELS } from "@/lib/ui/labels"

/**
 * The owner's Add item dialog (S2c — UNN-559): the whole catalog grouped by
 * capability (the add-item picker `ITEM_GROUP_LABELS` was written for), a
 * quantity input for stackables, one `equipment.add` descriptor per confirm.
 * The dispatch mints the `idSeed` the Writer derives row ids from (CH18
 * determinism — the optimistic rows carry the ids the server will persist).
 */
export function AddItemDialog() {
  const { dispatch } = useEntityWrite()
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<Item | null>(null)
  const [quantityDraft, setQuantityDraft] = useState("1")

  const groups = itemsByGroup()
  // Number(...) over parseInt: "1.5"/"1e2" must fail the integer check as the
  // value they represent, not silently truncate to a passing prefix. An empty
  // draft is NaN, not Number("")'s 0.
  const quantity =
    selected && isStackable(selected)
      ? quantityDraft.trim() === ""
        ? Number.NaN
        : Number(quantityDraft)
      : 1
  const valid =
    selected !== null &&
    Number.isInteger(quantity) &&
    quantity >= 1 &&
    quantity <= 999

  const reset = () => {
    setSelected(null)
    setQuantityDraft("1")
  }

  const add = () => {
    if (!selected || !valid) return
    setOpen(false)
    dispatch(
      {
        component: "equipment",
        op: "add",
        catalogItemKey: selected.key,
        quantity,
        idSeed: crypto.randomUUID(),
      },
      { messages: { error: "Couldn't add the item. Try again." } }
    )
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) reset()
      }}
    >
      <DialogTrigger render={<Button size="sm" variant="outline" />}>
        <PlusIcon aria-hidden />
        Add item
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add item</DialogTitle>
          <DialogDescription>
            Pick a piece of gear from the catalog.
          </DialogDescription>
        </DialogHeader>
        <Command className="rounded-lg border">
          <CommandInput placeholder="Search items…" />
          <CommandList className="max-h-64">
            <CommandEmpty>No item found.</CommandEmpty>
            {groups.map(([group, items]) => (
              <CommandGroup key={group} heading={ITEM_GROUP_LABELS[group]}>
                {items.map((item) => (
                  <CommandItem
                    key={item.key}
                    onSelect={() => setSelected(item)}
                    data-selected-item={selected?.key === item.key || undefined}
                    className="data-selected-item:bg-accent data-selected-item:text-accent-foreground"
                  >
                    <div className="flex min-w-0 flex-col">
                      <span>{item.name}</span>
                      <span className="truncate text-xs text-muted-foreground">
                        {item.description}
                      </span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
        <DialogFooter className="items-end gap-3 sm:items-center">
          {selected && isStackable(selected) ? (
            <div className="flex items-center gap-2">
              <Label htmlFor="add-item-quantity">Quantity</Label>
              <Input
                id="add-item-quantity"
                type="number"
                min={1}
                max={999}
                value={quantityDraft}
                onChange={(event) => setQuantityDraft(event.target.value)}
                className="w-20"
              />
            </div>
          ) : null}
          <Button onClick={add} disabled={!valid}>
            {selected ? `Add ${selected.name}` : "Add"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function itemsByGroup(): Array<[keyof typeof ITEM_GROUP_LABELS, Item[]]> {
  const catalog = allItems()
  return (
    Object.keys(ITEM_GROUP_LABELS) as Array<keyof typeof ITEM_GROUP_LABELS>
  )
    .map((group): [keyof typeof ITEM_GROUP_LABELS, Item[]] => [
      group,
      catalog.filter((item) =>
        group === "consumable"
          ? item.equip === undefined
          : item.equip?.slot === group
      ),
    ])
    .filter(([, items]) => items.length > 0)
}
