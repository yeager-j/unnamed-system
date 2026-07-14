import { TerminalIcon } from "@phosphor-icons/react/dist/ssr"
import { headers } from "next/headers"

import { Button } from "@workspace/ui/components/button"

import { devSignInAction } from "@/lib/auth/actions"
import { isDevAuthAvailable } from "@/lib/auth/dev-auth"

/** Local-only browser entry point for the configured dev user's session. */
export async function DevSignInButton() {
  const requestHeaders = await headers()
  if (!isDevAuthAvailable(requestHeaders.get("host"))) return null

  return (
    <form action={devSignInAction}>
      <Button type="submit" variant="secondary" size="sm">
        <TerminalIcon weight="bold" />
        Dev sign in
      </Button>
    </form>
  )
}
