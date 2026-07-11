"use client"

import { MinusIcon, PlusIcon, XIcon } from "@phosphor-icons/react"
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnFiltersState,
} from "@tanstack/react-table"
import { useState } from "react"

import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { Toggle } from "@workspace/ui/components/toggle"
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@workspace/ui/components/toggle-group"

import { useViewerRole } from "@/components/shell/viewer-role"
import {
  rowMatchesGroups,
  rowMatchesQuery,
  type InventoryGroup,
  type InventoryRow,
} from "@/domain/character/view/inventory-table"
import { useEntityWrite } from "@/domain/entity/use-entity-write"
import { ITEM_CATEGORY_LABELS, ITEM_GROUP_LABELS } from "@/domain/labels"

/**
 * The inventory Data Table (UNN-163 folded into S2c): TanStack table over the
 * shared primitives — text search across name + description, group filter
 * chips, an Equipped-only toggle. The filter semantics live in the pure
 * `inventory-table` view helpers; the columns delegate to them. Owner rows
 * carry the write affordances (Equip/Unequip, qty stepper, Remove) — steppers
 * stay enabled while a write is pending (the S2a lesson) and bound only by
 * quantity limits.
 */
export function InventoryTable({ rows }: { rows: InventoryRow[] }) {
  const role = useViewerRole()
  const [globalFilter, setGlobalFilter] = useState("")
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])

  const table = useReactTable({
    data: rows,
    columns: role === "owner" ? OWNER_COLUMNS : VIEWER_COLUMNS,
    state: { globalFilter, columnFilters },
    onGlobalFilterChange: setGlobalFilter,
    onColumnFiltersChange: setColumnFilters,
    globalFilterFn: (row, _columnId, query: string) =>
      rowMatchesQuery(row.original, query),
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getRowId: (row) => row.id,
  })

  const groups =
    (table.getColumn("group")?.getFilterValue() as
      | InventoryGroup[]
      | undefined) ?? []
  const equippedOnly =
    (table.getColumn("equipped")?.getFilterValue() as boolean | undefined) ??
    false

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={globalFilter}
          onChange={(event) => setGlobalFilter(event.target.value)}
          placeholder="Search items…"
          aria-label="Search items"
          className="h-8 w-56"
        />
        <ToggleGroup
          multiple
          size="sm"
          variant="outline"
          value={groups}
          onValueChange={(next) =>
            table
              .getColumn("group")
              ?.setFilterValue(next.length > 0 ? next : undefined)
          }
          aria-label="Filter by category"
        >
          {GROUP_KEYS.map((group) => (
            <ToggleGroupItem key={group} value={group}>
              {ITEM_GROUP_LABELS[group]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <Toggle
          size="sm"
          variant="outline"
          pressed={equippedOnly}
          onPressedChange={(pressed) =>
            table.getColumn("equipped")?.setFilterValue(pressed || undefined)
          }
        >
          Equipped only
        </Toggle>
      </div>
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <TableHead key={header.id}>
                  {header.isPlaceholder
                    ? null
                    : flexRender(
                        header.column.columnDef.header,
                        header.getContext()
                      )}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.length > 0 ? (
            table.getRowModel().rows.map((row) => (
              <TableRow key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell
                colSpan={table.getAllColumns().length}
                className="h-16 text-center text-muted-foreground"
              >
                No items match.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  )
}

const GROUP_KEYS = Object.keys(ITEM_GROUP_LABELS) as InventoryGroup[]

const VIEWER_COLUMNS: ColumnDef<InventoryRow>[] = [
  {
    id: "item",
    header: "Item",
    accessorKey: "name",
    cell: ({ row }) => (
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="font-medium">{row.original.name}</span>
        <span className="text-xs text-muted-foreground">
          {row.original.description}
        </span>
      </div>
    ),
  },
  {
    id: "group",
    header: "Category",
    accessorKey: "group",
    filterFn: (row, _columnId, groups: InventoryGroup[]) =>
      rowMatchesGroups(row.original, groups),
    cell: ({ row }) => (
      <Badge variant="secondary" className="text-muted-foreground">
        {ITEM_CATEGORY_LABELS[row.original.group]}
      </Badge>
    ),
  },
  {
    id: "quantity",
    header: () => <span className="tabular-nums">Qty</span>,
    accessorKey: "quantity",
    cell: ({ row }) => <QuantityCell row={row.original} />,
  },
  {
    id: "equipped",
    header: "",
    accessorKey: "equipped",
    filterFn: (row) => row.original.equipped,
    cell: ({ row }) =>
      row.original.equipped ? (
        <Badge variant="secondary">Equipped</Badge>
      ) : null,
  },
]

const OWNER_COLUMNS: ColumnDef<InventoryRow>[] = [
  ...VIEWER_COLUMNS,
  {
    id: "actions",
    header: "",
    cell: ({ row }) => <RowActions row={row.original} />,
  },
]

/** Plain count for viewers and non-stackables; a bounds-limited stepper for
 *  the owner's stackables (never pending-disabled). */
function QuantityCell({ row }: { row: InventoryRow }) {
  const role = useViewerRole()
  const { dispatch } = useEntityWrite()

  if (role !== "owner" || !row.stackable) {
    return <span className="tabular-nums">{row.quantity}</span>
  }

  const step = (quantity: number) =>
    dispatch(
      { component: "equipment", op: "setQuantity", itemId: row.id, quantity },
      { messages: { error: "Couldn't update the quantity. Try again." } }
    )

  return (
    <div className="flex items-center gap-1">
      <Button
        size="icon-sm"
        variant="ghost"
        aria-label={`Decrease ${row.name} quantity`}
        disabled={row.quantity <= 1}
        onClick={() => step(row.quantity - 1)}
      >
        <MinusIcon aria-hidden />
      </Button>
      <span className="min-w-8 text-center tabular-nums">{row.quantity}</span>
      <Button
        size="icon-sm"
        variant="ghost"
        aria-label={`Increase ${row.name} quantity`}
        disabled={row.quantity >= row.stackSize}
        onClick={() => step(row.quantity + 1)}
      >
        <PlusIcon aria-hidden />
      </Button>
    </div>
  )
}

function RowActions({ row }: { row: InventoryRow }) {
  const { dispatch } = useEntityWrite()

  const toggleEquip = () =>
    dispatch(
      {
        component: "equipment",
        op: row.equipped ? "unequip" : "equip",
        itemId: row.id,
      },
      { messages: { error: "Couldn't update the equipment. Try again." } }
    )

  const remove = () =>
    dispatch(
      { component: "equipment", op: "remove", itemId: row.id },
      { messages: { error: "Couldn't remove the item. Try again." } }
    )

  return (
    <div className="flex items-center justify-end gap-1">
      {row.equippable ? (
        <Button size="sm" variant="outline" onClick={toggleEquip}>
          {row.equipped ? "Unequip" : "Equip"}
        </Button>
      ) : null}
      <Button
        size="icon-sm"
        variant="ghost"
        aria-label={`Remove ${row.name}`}
        onClick={remove}
      >
        <XIcon aria-hidden />
      </Button>
    </div>
  )
}
