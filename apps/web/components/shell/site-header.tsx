import Link from "next/link"

import { Sparkle } from "@workspace/ui/components/celestial"

import { auth } from "@/lib/auth"

import { AccountMenu } from "./account-menu"
import { SignInButton } from "./sign-in-button"

/**
 * Persistent top-of-app chrome rendered above every route (including the
 * public character sheet at `/c/{shortId}`). Resolves the current session on
 * the server and renders either a Google sign-in CTA or the account menu.
 *
 * Stays slim and unintrusive so the sticky bar does not visually fight with
 * the per-page header on the character sheet.
 */
export async function SiteHeader() {
  const session = await auth()

  return (
    <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-border bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/75">
      <Link
        href="/"
        className="flex items-center gap-1 font-display text-lg font-semibold tracking-tight text-foreground italic hover:text-foreground/80"
      >
        <Sparkle className="size-4 text-gold" />
        Showtime!
      </Link>
      {session?.user ? <AccountMenu user={session.user} /> : <SignInButton />}
    </header>
  )
}
