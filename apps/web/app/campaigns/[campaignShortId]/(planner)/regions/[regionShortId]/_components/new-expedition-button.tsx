"use client"

import { PlusIcon } from "@phosphor-icons/react/dist/ssr"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { Field, FieldLabel } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import { Spinner } from "@workspace/ui/components/spinner"

import { dungeonErrorMessage } from "@/lib/actions/dungeon/error-message"
import { createExpeditionAction } from "@/lib/actions/dungeon/expedition-create"
import { dungeonConsolePath } from "@/lib/paths"
import { guardWriteTransition } from "@/lib/sync/guard-write-transition"

/**
 * "New expedition" CTA on the Region detail page (UNN-589 D5/D8). Opens a dialog
 * for the run's name (pre-filled from the Region + today's date so back-to-back
 * expeditions don't collide), mints a `draft` expedition (`createExpeditionAction`),
 * and routes to the existing delve prep screen — the same action-then-redirect the
 * plain dungeon mint uses, landing on setup.
 *
 * An archived Region can't spawn new runs (archive hides it from discovery;
 * minting from a hidden Region would resurrect it — the action refuses too), so the
 * trigger is disabled with a hint rather than opening a dialog that would fail.
 */
export function NewExpeditionButton({
  campaignShortId,
  regionId,
  regionName,
  isArchived,
}: {
  campaignShortId: string
  regionId: string
  regionName: string
  isArchived: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [name, setName] = useState("")

  function onOpenChange(next: boolean) {
    if (next) {
      const today = new Date().toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      })
      setName(`${regionName} · ${today}`)
    }
    setOpen(next)
  }

  function onCreate() {
    const trimmed = name.trim()
    if (!trimmed) return

    startTransition(() =>
      guardWriteTransition(
        async () => {
          const result = await createExpeditionAction({
            regionId,
            name: trimmed,
          })
          if (!result.ok) {
            toast.error(
              result.error === "region-archived"
                ? "This region is archived — restore it before running new expeditions."
                : dungeonErrorMessage(result.error)
            )
            return
          }
          setOpen(false)
          router.push(dungeonConsolePath(campaignShortId, result.value.shortId))
        },
        () =>
          toast.error(
            "Couldn't start the expedition. Check the name and retry."
          )
      )
    )
  }

  if (isArchived) {
    return (
      <Button
        size="sm"
        variant="secondary"
        disabled
        title="Archived regions can't start new expeditions."
      >
        <PlusIcon weight="bold" />
        New expedition
      </Button>
    )
  }

  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => onOpenChange(true)}>
        <PlusIcon weight="bold" />
        New expedition
      </Button>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New expedition</DialogTitle>
            <DialogDescription>
              Reshuffles the region from its live seed map. You&apos;ll build
              the party and place tokens on the prep screen.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-4">
            <Field>
              <FieldLabel htmlFor="expedition-name">Name</FieldLabel>
              <Input
                id="expedition-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={100}
                autoFocus
              />
            </Field>
          </div>

          <DialogFooter>
            <Button
              type="button"
              onClick={onCreate}
              disabled={isPending || !name.trim()}
            >
              {isPending ? <Spinner /> : null}
              Start expedition
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
