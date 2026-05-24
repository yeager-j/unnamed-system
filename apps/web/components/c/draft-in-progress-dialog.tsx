"use client"

import { useRouter } from "next/navigation"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@workspace/ui/components/alert-dialog"

/**
 * Non-dismissable interstitial shown when a non-owner visits a draft
 * character's public URL. AlertDialog already blocks escape/backdrop close
 * by default; omitting `AlertDialogCancel` and pinning `open` open removes
 * the only remaining "close" path. The single action sends the visitor back
 * to the home page so they can browse characters that actually exist.
 *
 * The owner never sees this — the page redirects them straight into the
 * builder. The dialog is for signed-out viewers and signed-in-but-other
 * viewers who landed on a shared URL before the owner finished building.
 */
export function DraftInProgressDialog() {
  const router = useRouter()

  return (
    <AlertDialog open>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Character not ready yet</AlertDialogTitle>
          <AlertDialogDescription>
            The owner is still building this character. Check back later — the
            link will start working as soon as they finish.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction onClick={() => router.push("/")}>
            Browse characters
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
