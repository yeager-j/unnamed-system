"use client"

import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@workspace/ui/components/command"

/**
 * The searchable, page-grouped zone picker (UNN-586, D3) — "Connect to…" on a
 * zone's toolbar. Doubles as the drag-free same-page connector (an a11y win) and
 * is the *only* way to author a cross-page connection (drag-to-connect stays
 * same-page: two pages never share a React Flow plane). Presentational: groups
 * arrive shaped (`groupZonesByPage`), already excluding the source zone and its
 * existing partners; picking a zone hands the id back to the canvas, which
 * dispatches `addConnection` and reseeds.
 */
export interface ConnectPickerGroup {
  pageId: string
  pageName: string
  zones: Array<{ id: string; name: string }>
}

export function ZoneConnectCommand({
  open,
  sourceZoneName,
  groups,
  onSelect,
  onClose,
}: {
  open: boolean
  sourceZoneName: string
  groups: ConnectPickerGroup[]
  onSelect: (zoneId: string) => void
  onClose: () => void
}) {
  const showHeadings = groups.length > 1
  return (
    <CommandDialog
      open={open}
      onOpenChange={(next) => !next && onClose()}
      title={`Connect ${sourceZoneName} to…`}
      description="Search zones across every page"
    >
      <Command>
        <CommandInput placeholder={`Connect ${sourceZoneName} to…`} />
        <CommandList>
          <CommandEmpty>No connectable zones.</CommandEmpty>
          {groups
            .filter((group) => group.zones.length > 0)
            .map((group) => (
              <CommandGroup
                key={group.pageId}
                heading={showHeadings ? group.pageName : undefined}
              >
                {group.zones.map((zone) => (
                  <CommandItem
                    key={zone.id}
                    // Include the page name so typing a floor filters to it.
                    value={`${zone.name} ${group.pageName} ${zone.id}`}
                    onSelect={() => {
                      onSelect(zone.id)
                      onClose()
                    }}
                  >
                    {zone.name}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
        </CommandList>
      </Command>
    </CommandDialog>
  )
}
