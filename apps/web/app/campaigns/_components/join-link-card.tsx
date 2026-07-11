"use client"

import {
  ArrowsClockwiseIcon,
  CheckIcon,
  CopyIcon,
} from "@phosphor-icons/react/dist/ssr"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@workspace/ui/components/alert-dialog"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Input } from "@workspace/ui/components/input"
import { Spinner } from "@workspace/ui/components/spinner"

import { rotateJoinTokenAction } from "@/lib/actions/rotate-join-token"

/**
 * The DM's shareable invite link on the campaign manage page (UNN-329): the
 * `/join/{joinToken}` URL with Copy and Regenerate controls. Copy writes the
 * absolute URL (origin resolved client-side) to the clipboard. Regenerate rotates
 * the token behind an `AlertDialog` confirm — the old link stops working
 * immediately — then revalidation re-renders this card with the new token.
 */
export function JoinLinkCard({
  campaignId,
  joinToken,
}: {
  campaignId: string
  joinToken: string
}) {
  const path = `/join/${joinToken}`
  const [copied, setCopied] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  async function onCopy() {
    try {
      const url =
        typeof window === "undefined"
          ? path
          : `${window.location.origin}${path}`
      await navigator.clipboard.writeText(url)
      setCopied(true)
      toast.success("Join link copied.")
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error("Couldn't copy the link.")
    }
  }

  function onRegenerate() {
    startTransition(async () => {
      const result = await rotateJoinTokenAction({ campaignId })
      setConfirmOpen(false)
      if (!result.ok) {
        toast.error("Couldn't regenerate the link. Try again.")
        return
      }
      toast.success("New join link generated. The old one no longer works.")
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Invite link</CardTitle>
        <CardDescription>
          Share this link so players can join. Regenerate it to revoke the old
          one.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-2">
        <Input readOnly value={path} className="flex-1 font-mono text-sm" />
        <Button variant="outline" onClick={onCopy}>
          {copied ? <CheckIcon weight="bold" /> : <CopyIcon weight="bold" />}
          Copy
        </Button>
        <Button
          variant="outline"
          onClick={() => setConfirmOpen(true)}
          disabled={isPending}
        >
          {isPending ? <Spinner /> : <ArrowsClockwiseIcon weight="bold" />}
          Regenerate
        </Button>
      </CardContent>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Regenerate the join link?</AlertDialogTitle>
            <AlertDialogDescription>
              The current link will stop working immediately. Anyone who already
              joined stays in the campaign.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={onRegenerate} disabled={isPending}>
              Regenerate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}
