"use client"

import { PlusIcon, XIcon } from "@phosphor-icons/react/dist/ssr"
import Link from "next/link"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"
import { Checkbox } from "@workspace/ui/components/checkbox"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@workspace/ui/components/command"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"

import { ParticipantPill } from "@/components/shared/participant-pill"
import { ParticipantPreviewPill } from "@/components/shared/participant-preview"
import type { ParticipantRef } from "@/domain/planner/participant"
import type { LinkerOption } from "@/domain/planner/view/linker"
import type { RelationRowView } from "@/domain/planner/view/world-detail"
import {
  addRelationAction,
  removeRelationAction,
} from "@/lib/actions/campaign-world/relation"
import { campaignArticlePath, campaignNpcPath } from "@/lib/paths"
import { guardWriteTransition } from "@/lib/sync/guard-write-transition"

import { LinkerRowContent } from "./participant-linker"

/**
 * An entity page's **outgoing relations** (UNN-579, §3): directed edges with
 * a free-form label, displayed on the source page only (the
 * 50-NPCs-point-at-a-kingdom rule). "Add relation" picks a target from the
 * world web, takes a label, and can write the reverse edge in the same
 * transaction. NPC/Article targets link to their pages; character targets
 * render as plain pills (their URLs ride shortIds this surface doesn't
 * carry).
 */
export function RelationsSection({
  campaignId,
  campaignShortId,
  source,
  rows,
  linkerOptions,
}: {
  campaignId: string
  campaignShortId: string
  source: ParticipantRef
  rows: RelationRowView[]
  linkerOptions: LinkerOption[]
}) {
  const [, startTransition] = useTransition()

  const remove = (relationId: string) =>
    startTransition(() =>
      guardWriteTransition(
        async () => {
          const result = await removeRelationAction({ campaignId, relationId })
          if (!result.ok) toast.error("Couldn't remove the relation.")
        },
        () => toast.error("Couldn't remove the relation.")
      )
    )

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Relations</h2>
        <AddRelationPopover
          campaignId={campaignId}
          source={source}
          linkerOptions={linkerOptions}
        />
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No outgoing relations yet — wire this entry into the world web.
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {rows.map((row) => (
            <li
              key={row.id}
              className="group/relation flex items-center gap-2 text-sm"
            >
              {row.label !== null ? (
                <span className="text-muted-foreground">{row.label}</span>
              ) : (
                <span className="text-muted-foreground/60 italic">
                  related to
                </span>
              )}
              <RelationTarget
                campaignShortId={campaignShortId}
                target={row.target}
              />
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Remove relation"
                className="text-muted-foreground opacity-0 group-hover/relation:opacity-100"
                onClick={() => remove(row.id)}
              >
                <XIcon />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function RelationTarget({
  campaignShortId,
  target,
}: {
  campaignShortId: string
  target: RelationRowView["target"]
}) {
  const pill = (
    <ParticipantPreviewPill
      kind={target.ref.kind}
      id={target.ref.id}
      label={target.label}
      tombstoned={target.tombstoned}
    />
  )
  if (target.ref.kind === "character" || target.tombstoned || target.missing) {
    return pill
  }
  const href =
    target.ref.kind === "npc"
      ? campaignNpcPath(campaignShortId, target.ref.id)
      : campaignArticlePath(campaignShortId, target.ref.id)
  return <Link href={href}>{pill}</Link>
}

function AddRelationPopover({
  campaignId,
  source,
  linkerOptions,
}: {
  campaignId: string
  source: ParticipantRef
  linkerOptions: LinkerOption[]
}) {
  const [open, setOpen] = useState(false)
  const [target, setTarget] = useState<ParticipantRef | null>(null)
  const [label, setLabel] = useState("")
  const [alsoReverse, setAlsoReverse] = useState(false)
  const [, startTransition] = useTransition()

  const options = linkerOptions.filter(
    (option) =>
      !(option.ref.kind === source.kind && option.ref.id === source.id)
  )

  const reset = () => {
    setTarget(null)
    setLabel("")
    setAlsoReverse(false)
  }

  const submit = () => {
    if (target === null) return
    startTransition(() =>
      guardWriteTransition(
        async () => {
          const result = await addRelationAction({
            campaignId,
            source: { kind: source.kind, id: source.id },
            target: { kind: target.kind, id: target.id },
            label: label.trim() === "" ? null : label.trim(),
            alsoReverse,
          })
          if (!result.ok) {
            toast.error("Couldn't add the relation. Try again.")
            return
          }
          setOpen(false)
          reset()
        },
        () => toast.error("Couldn't add the relation. Try again.")
      )
    )
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) reset()
      }}
    >
      <PopoverTrigger
        render={
          <Button variant="outline" size="sm" aria-label="Add relation" />
        }
      >
        <PlusIcon />
        Add relation
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        {target === null ? (
          <Command>
            <CommandInput placeholder="Link to…" autoFocus />
            <CommandList>
              <CommandEmpty>Nothing in the world web matches.</CommandEmpty>
              <CommandGroup>
                {options.map((option) => (
                  <CommandItem
                    key={`${option.ref.kind}:${option.ref.id}`}
                    value={`${option.label} ${option.sublabel ?? ""}`}
                    onSelect={() => setTarget(option.ref)}
                  >
                    <LinkerRowContent option={option} />
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        ) : (
          <div className="flex flex-col gap-3 p-3">
            <div className="flex items-center gap-2 text-sm">
              <ParticipantPill kind={target.kind} label={target.label ?? ""} />
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto"
                onClick={() => setTarget(null)}
              >
                Change
              </Button>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="relation-label">Label</Label>
              <Input
                id="relation-label"
                value={label}
                placeholder="sworn to protect"
                maxLength={200}
                onChange={(event) => setLabel(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") submit()
                }}
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={alsoReverse}
                onCheckedChange={(checked) => setAlsoReverse(checked === true)}
              />
              Also add the reverse
            </label>
            <Button onClick={submit}>Add relation</Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
