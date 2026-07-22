"use client"

import { PlusIcon } from "@phosphor-icons/react/dist/ssr"
import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"
import { Spinner } from "@workspace/ui/components/spinner"

import { FIRST_STEP_SLUG } from "@/domain/character/builder-steps"
import { startEntityDraftAction } from "@/lib/actions/entity/start-draft"
import { guardWriteTransition } from "@/lib/actions/guard-write-transition"
import { characterBuilderPath } from "@/lib/paths"

/**
 * The "Create new character" CTA. Each click spins up a brand-new draft
 * row (multiple drafts per user is intentional — a player exploring two
 * concepts shouldn't have to throw one away to try the other) and routes
 * to the first step of the wizard. While the action is in flight the
 * button disables and shows a spinner so the user gets feedback that
 * something is happening before the redirect lands.
 */
export function CreateCharacterButton({ className }: { className?: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function onClick() {
    startTransition(() =>
      guardWriteTransition(
        async () => {
          const result = await startEntityDraftAction()
          if (result.ok) {
            router.push(
              characterBuilderPath(result.value.shortId, FIRST_STEP_SLUG)
            )
          }
        },
        () => toast.error("Couldn't start a new character. Try again.")
      )
    )
  }

  return (
    <Button onClick={onClick} disabled={isPending} className={className}>
      {isPending ? <Spinner /> : <PlusIcon weight="bold" />}
      Create new character
    </Button>
  )
}
